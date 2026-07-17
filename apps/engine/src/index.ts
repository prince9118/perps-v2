import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { prisma } from "@repo/db";
import {
  closeRedis,
  consumeGroup,
  createRedisClient,
  ensureGroup,
  getGroupLag,
  trimConsumedEntries,
  type StreamEvent,
} from "@repo/redis";
import {
  EVENT_TYPES,
  GROUPS,
  MARKET_IDS,
  STREAMS,
  createLogger,
  engineSeqFromStreamId,
  installLifecycle,
  isMarketId,
  isStopping,
  onShutdown,
  roundQty,
  serializeError,
  sleep,
  type EngineResult,
  type OrderCancelEvent,
  type OrderCreateEvent,
} from "@repo/common";
import { OrderBook } from "./OrderBook";

const log = createLogger("engine");
const shutdown = installLifecycle(log);
const commands = createRedisClient("engine-commands", log);
const reader = createRedisClient("engine-reader", log);
const instanceId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const LOCK_KEY = "engine:lock";
const LOCK_TTL_MS = 15_000;
const STREAM_RETAIN_MS = 24 * 60 * 60 * 1000;

const books = new Map<string, OrderBook>();
for (const market of MARKET_IDS) {
  books.set(market, new OrderBook(market, () => randomUUID()));
}

async function acquireLock(): Promise<boolean> {
  let lastLog = 0;
  while (!isStopping()) {
    const ok = await commands.set(LOCK_KEY, instanceId, "PX", LOCK_TTL_MS, "NX");
    if (ok === "OK") return true;
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now();
      log.warn("another engine instance holds the lock, waiting");
    }
    await sleep(1_000);
  }
  return false;
}

const RENEW_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

function startLockRenewal() {
  const timer = setInterval(async () => {
    try {
      const renewed = await commands.eval(RENEW_SCRIPT, 1, LOCK_KEY, instanceId, String(LOCK_TTL_MS));
      if (Number(renewed) !== 1) {
        log.error("engine lock lost, exiting");
        await shutdown("lock_lost", 1);
      }
    } catch (err) {
      log.error("engine lock renewal failed", { err: serializeError(err) });
    }
  }, LOCK_TTL_MS / 3);
  onShutdown(async () => {
    clearInterval(timer);
    await commands.eval(RELEASE_SCRIPT, 1, LOCK_KEY, instanceId).catch(() => undefined);
  });
}

async function waitForDbWorker(): Promise<boolean> {
  let lastLog = 0;
  while (!isStopping()) {
    const lag = await getGroupLag(commands, STREAMS.ENGINE_EVENTS, GROUPS.DB_WORKER);
    if (lag.exists && lag.lag === 0 && lag.pending === 0) return true;
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now();
      log.warn("waiting for db-worker to catch up before rebuilding order books", { lag: lag.lag, pending: lag.pending });
    }
    await sleep(500);
  }
  return false;
}

async function rebuildBooks() {
  const rows = await prisma.order.findMany({
    where: { status: { in: ["open", "partial"] }, type: "limit", acceptedAt: { not: null } },
    orderBy: [{ engineSeq: "asc" }, { createdAt: "asc" }],
  });
  let restored = 0;
  for (const row of rows) {
    const book = books.get(row.market);
    if (!book || row.price === null || row.quantity <= 0) continue;
    book.restore({
      id: row.id,
      userId: row.userId,
      market: row.market,
      side: row.side === "sell" ? "sell" : "buy",
      type: "limit",
      price: row.price,
      quantity: row.quantity,
      originalQuantity: row.originalQuantity,
      filledQuantity: roundQty(row.originalQuantity - row.quantity),
    });
    restored += 1;
  }
  const multi = commands.multi();
  for (const book of books.values()) {
    multi.xadd(STREAMS.ORDERBOOK_EVENTS, "MAXLEN", "~", 1000, "*", "type", EVENT_TYPES.ORDERBOOK_UPDATE, "data", JSON.stringify(snapshotOf(book)));
  }
  await multi.exec();
  log.info("order books rebuilt", { restoredOrders: restored });
}

function snapshotOf(book: OrderBook) {
  return { market: book.market, ...book.snapshot(), timestamp: Date.now() };
}

function isValidCreate(data: Partial<OrderCreateEvent>): data is OrderCreateEvent {
  return (
    typeof data.orderId === "string" &&
    typeof data.userId === "string" &&
    isMarketId(data.market) &&
    (data.side === "buy" || data.side === "sell") &&
    (data.type === "limit" || data.type === "market") &&
    typeof data.price === "number" &&
    Number.isFinite(data.price) &&
    data.price > 0 &&
    typeof data.quantity === "number" &&
    Number.isFinite(data.quantity) &&
    data.quantity > 0
  );
}

interface Processed {
  result: EngineResult | null;
  book: OrderBook | null;
  bookChanged: boolean;
}

function processCreate(id: string, data: Partial<OrderCreateEvent>, now: number): Processed {
  if (!isValidCreate(data)) {
    log.warn("order rejected", { orderId: data.orderId, reason: "invalid_order" });
    if (typeof data.orderId !== "string") return { result: null, book: null, bookChanged: false };
    return {
      result: {
        eventId: id,
        engineSeq: engineSeqFromStreamId(id),
        action: "create",
        market: String(data.market ?? ""),
        orderId: data.orderId,
        accepted: false,
        reason: "invalid_order",
        trades: [],
        orders: [{ orderId: data.orderId, status: "rejected", remaining: Number(data.quantity) || 0, reason: "invalid_order" }],
        timestamp: now,
      },
      book: null,
      bookChanged: false,
    };
  }
  const book = books.get(data.market)!;
  if (book.has(data.orderId)) {
    log.warn("duplicate order event ignored", { orderId: data.orderId });
    return { result: null, book: null, bookChanged: false };
  }
  const quantity = roundQty(data.quantity);
  const match = book.submit(
    {
      id: data.orderId,
      userId: data.userId,
      market: data.market,
      side: data.side,
      type: data.type,
      price: data.price,
      quantity,
      originalQuantity: quantity,
      filledQuantity: 0,
    },
    now,
  );
  const takerState = match.orders[0]!;
  const accepted = takerState.status !== "rejected";
  const fields = {
    orderId: data.orderId,
    market: data.market,
    side: data.side,
    type: data.type,
    status: takerState.status,
    trades: match.trades.length,
    reason: takerState.reason,
  };
  if (accepted) log.info("order accepted", fields);
  else log.info("order rejected", fields);
  for (const trade of match.trades) {
    log.info("trade", {
      tradeId: trade.tradeId,
      market: trade.market,
      price: trade.price,
      quantity: trade.quantity,
      takerSide: trade.takerSide,
    });
  }
  return {
    result: {
      eventId: id,
      engineSeq: engineSeqFromStreamId(id),
      action: "create",
      market: data.market,
      orderId: data.orderId,
      accepted,
      reason: takerState.reason,
      trades: match.trades,
      orders: match.orders,
      timestamp: now,
    },
    book,
    bookChanged: match.rested || match.trades.length > 0,
  };
}

function processCancel(id: string, data: Partial<OrderCancelEvent>, now: number): Processed {
  if (typeof data.orderId !== "string" || !isMarketId(data.market)) {
    log.warn("malformed cancel event ignored", { eventId: id });
    return { result: null, book: null, bookChanged: false };
  }
  const book = books.get(data.market)!;
  const state = book.has(data.orderId) ? book.cancel(data.orderId) : null;
  if (state) log.info("order cancelled", { orderId: data.orderId, market: data.market, remaining: state.remaining });
  return {
    result: {
      eventId: id,
      engineSeq: engineSeqFromStreamId(id),
      action: "cancel",
      market: data.market,
      orderId: data.orderId,
      accepted: state !== null,
      reason: state ? undefined : "not_open",
      trades: [],
      orders: state ? [state] : [],
      timestamp: now,
    },
    book,
    bookChanged: state !== null,
  };
}

async function handleEvent(id: string, event: StreamEvent | null) {
  const now = Date.now();
  let processed: Processed = { result: null, book: null, bookChanged: false };
  if (!event) {
    log.warn("malformed order event skipped", { eventId: id });
  } else if (event.type === EVENT_TYPES.ORDER_CREATE) {
    processed = processCreate(id, event.data as Partial<OrderCreateEvent>, now);
  } else if (event.type === EVENT_TYPES.ORDER_CANCEL) {
    processed = processCancel(id, event.data as Partial<OrderCancelEvent>, now);
  } else {
    log.warn("unknown order event type skipped", { eventId: id, type: event.type });
  }

  const multi = commands.multi();
  if (processed.result) {
    multi.xadd(STREAMS.ENGINE_EVENTS, "*", "type", EVENT_TYPES.ORDER_RESULT, "data", JSON.stringify(processed.result));
    for (const trade of processed.result.trades) {
      multi.xadd(
        STREAMS.TRADE_EVENTS,
        "MAXLEN",
        "~",
        10_000,
        "*",
        "type",
        EVENT_TYPES.TRADE_CREATED,
        "data",
        JSON.stringify({
          tradeId: trade.tradeId,
          market: trade.market,
          price: trade.price,
          quantity: trade.quantity,
          side: trade.takerSide,
          timestamp: trade.timestamp,
        }),
      );
    }
  }
  if (processed.book && processed.bookChanged) {
    multi.xadd(STREAMS.ORDERBOOK_EVENTS, "MAXLEN", "~", 1000, "*", "type", EVENT_TYPES.ORDERBOOK_UPDATE, "data", JSON.stringify(snapshotOf(processed.book)));
  }
  multi.xack(STREAMS.ORDER_EVENTS, GROUPS.ENGINE, id);

  try {
    const results = await multi.exec();
    const failed = results?.find(([err]) => err);
    if (!results || failed) throw failed?.[0] ?? new Error("redis transaction aborted");
  } catch (err) {
    log.error("failed to publish engine output, restarting to rebuild state", { eventId: id, err: serializeError(err) });
    void shutdown("publish_failed", 1);
    throw err;
  }
}

function startStreamTrimming() {
  const timer = setInterval(async () => {
    try {
      await trimConsumedEntries(commands, STREAMS.ORDER_EVENTS, GROUPS.ENGINE, STREAM_RETAIN_MS);
      await trimConsumedEntries(commands, STREAMS.ENGINE_EVENTS, GROUPS.DB_WORKER, STREAM_RETAIN_MS);
    } catch (err) {
      log.warn("stream trim failed", { err: serializeError(err) });
    }
  }, 60_000);
  onShutdown(() => clearInterval(timer));
}

async function main() {
  onShutdown(async () => {
    await closeRedis(commands);
    await prisma.$disconnect();
  });
  if (!(await acquireLock())) return;
  startLockRenewal();
  await ensureGroup(commands, STREAMS.ORDER_EVENTS, GROUPS.ENGINE, "$");
  await ensureGroup(commands, STREAMS.ENGINE_EVENTS, GROUPS.DB_WORKER, "$");
  if (!(await waitForDbWorker())) return;
  await rebuildBooks();
  startStreamTrimming();
  log.info("engine started", { markets: MARKET_IDS });

  const loop = consumeGroup({
    client: reader,
    stream: STREAMS.ORDER_EVENTS,
    group: GROUPS.ENGINE,
    consumer: "engine",
    log,
    autoAck: false,
    count: 100,
    handle: handleEvent,
  });
  onShutdown(async () => {
    await loop;
    reader.disconnect();
  });
  await loop;
}

main().catch(async (err) => {
  log.error("engine crashed", { err: serializeError(err) });
  await shutdown("fatal", 1);
});
