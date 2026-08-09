import { prisma } from "@repo/db";
import { closeRedis, createRedisClient, getIndexPrice, type IndexPrice } from "@repo/redis";
import {
  EVENT_TYPES,
  LIQUIDATION_SLIPPAGE,
  MARKET_IDS,
  STREAMS,
  createLogger,
  installLifecycle,
  isLiquidatable,
  isStopping,
  liquidationPrice,
  onShutdown,
  roundPrice,
  serializeError,
  sleep,
  type OrderCreateEvent,
} from "@repo/common";

const log = createLogger("liquidator");
const shutdown = installLifecycle(log);
const redis = createRedisClient("liquidator", log);
const INTERVAL_MS = Number(process.env.LIQUIDATOR_INTERVAL_MS ?? 1_000);
const RETRY_BASE_MS = 10_000;
const RETRY_MAX_MS = 300_000;

const nextAttempt = new Map<string, { at: number; attempts: number }>();
const staleWarned = new Set<string>();

async function triggerLiquidation(
  attempt: number,
  position: { id: string; userId: string; market: string; side: string; quantity: number; entryPrice: number; margin: number; leverage: number },
  markPrice: number,
) {
  const inflight = await prisma.order.findFirst({
    where: { userId: position.userId, market: position.market, source: "liquidation", status: { in: ["open", "partial"] } },
    select: { id: true },
  });
  if (inflight) return;

  const resting = await prisma.order.findMany({
    where: { userId: position.userId, market: position.market, status: { in: ["open", "partial"] }, acceptedAt: { not: null } },
    select: { id: true },
  });
  for (const order of resting) {
    await redis.xadd(
      STREAMS.ORDER_EVENTS,
      "*",
      "type",
      EVENT_TYPES.ORDER_CANCEL,
      "data",
      JSON.stringify({ orderId: order.id, userId: position.userId, market: position.market, timestamp: Date.now() }),
    );
  }

  const side = position.side === "long" ? "sell" : "buy";
  const order = await prisma.order.create({
    data: {
      userId: position.userId,
      market: position.market,
      side,
      type: "market",
      status: "open",
      price: null,
      quantity: position.quantity,
      originalQuantity: position.quantity,
      leverage: position.leverage > 0 ? position.leverage : 1,
      lockedMargin: 0,
      reduceOnly: true,
      source: "liquidation",
    },
  });
  const event: OrderCreateEvent = {
    orderId: order.id,
    userId: position.userId,
    market: position.market,
    side,
    type: "market",
    price: roundPrice(side === "sell" ? markPrice * (1 - LIQUIDATION_SLIPPAGE) : markPrice * (1 + LIQUIDATION_SLIPPAGE)),
    quantity: position.quantity,
    timestamp: Date.now(),
  };
  try {
    await redis.xadd(STREAMS.ORDER_EVENTS, "*", "type", EVENT_TYPES.ORDER_CREATE, "data", JSON.stringify(event));
  } catch (err) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "rejected", reason: "queue_unavailable" } });
    throw err;
  }
  log[attempt === 1 ? "info" : "debug"]("liquidation triggered", {
    attempt,
    positionId: position.id,
    userId: position.userId,
    market: position.market,
    side: position.side,
    quantity: position.quantity,
    markPrice,
    liquidationPrice: liquidationPrice(position),
    orderId: order.id,
  });
}

async function scan() {
  const prices = new Map<string, IndexPrice>();
  for (const market of MARKET_IDS) {
    const index = await getIndexPrice(redis, market);
    prices.set(market, index);
    if (!index.fresh) {
      if (!staleWarned.has(market)) {
        staleWarned.add(market);
        log.warn("index price stale, liquidations paused for market", { market, priceTs: index.ts });
      }
    } else if (staleWarned.delete(market)) {
      log.info("index price fresh again, liquidations resumed", { market });
    }
  }

  const positions = await prisma.position.findMany({ where: { status: "open" } });
  const now = Date.now();
  for (const position of positions) {
    if (isStopping()) return;
    const index = prices.get(position.market);
    if (!index?.fresh || index.price === null) continue;
    if (!isLiquidatable(position, index.price)) {
      nextAttempt.delete(position.id);
      continue;
    }
    const previous = nextAttempt.get(position.id);
    if (previous && previous.at > now) continue;
    const attempts = (previous?.attempts ?? 0) + 1;
    nextAttempt.set(position.id, { at: now + Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS), attempts });
    try {
      await triggerLiquidation(attempts, position, index.price);
    } catch (err) {
      log.error("liquidation trigger failed", { positionId: position.id, err: serializeError(err) });
    }
  }
  const openIds = new Set(positions.map((p) => p.id));
  for (const id of nextAttempt.keys()) if (!openIds.has(id)) nextAttempt.delete(id);
}

async function main() {
  onShutdown(async () => {
    await closeRedis(redis);
    await prisma.$disconnect();
  });
  log.info("liquidator started", { intervalMs: INTERVAL_MS });
  while (!isStopping()) {
    try {
      await scan();
    } catch (err) {
      log.error("liquidation scan failed", { err: serializeError(err) });
    }
    await sleep(INTERVAL_MS);
  }
}

main().catch(async (err) => {
  log.error("liquidator crashed", { err: serializeError(err) });
  await shutdown("fatal", 1);
});
