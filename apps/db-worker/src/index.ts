import { prisma, withTransaction } from "@repo/db";
import { closeRedis, consumeGroup, createRedisClient, ensureGroup, type StreamEvent } from "@repo/redis";
import {
  EVENT_TYPES,
  GROUPS,
  STREAMS,
  createLogger,
  installLifecycle,
  onShutdown,
  serializeError,
  type EngineResult,
} from "@repo/common";
import { applyEngineResult } from "./settlement";

const log = createLogger("db-worker");
const shutdown = installLifecycle(log);
const reader = createRedisClient("db-worker-reader", log);
const commands = createRedisClient("db-worker-commands", log);
const PROCESSED_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function isEngineResult(data: unknown): data is EngineResult {
  const r = data as Partial<EngineResult>;
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r.eventId === "string" &&
    typeof r.orderId === "string" &&
    typeof r.market === "string" &&
    (r.action === "create" || r.action === "cancel") &&
    Array.isArray(r.trades) &&
    Array.isArray(r.orders)
  );
}

async function handle(id: string, event: StreamEvent | null) {
  if (!event || event.type !== EVENT_TYPES.ORDER_RESULT || !isEngineResult(event.data)) {
    log.warn("unrecognized engine event skipped", { id, type: event?.type });
    return;
  }
  const result = event.data;
  const outcome = await withTransaction((tx) => applyEngineResult(tx, result, log));
  if (!outcome.applied) {
    log.debug("engine event already applied", { id, eventId: result.eventId });
    return;
  }
  if (outcome.trades > 0) {
    log.info("trades settled", { orderId: result.orderId, market: result.market, trades: outcome.trades });
  }
  for (const liquidation of outcome.liquidations) {
    log.info("position liquidated", liquidation as unknown as Record<string, unknown>);
    await commands
      .xadd(
        STREAMS.LIQUIDATION_EVENTS,
        "MAXLEN",
        "~",
        10_000,
        "*",
        "type",
        EVENT_TYPES.POSITION_LIQUIDATED,
        "data",
        JSON.stringify({ ...liquidation, timestamp: Date.now() }),
      )
      .catch((err) => log.warn("failed to publish liquidation event", { err: serializeError(err) }));
  }
}

async function main() {
  onShutdown(async () => {
    await closeRedis(commands);
    await prisma.$disconnect();
  });
  await prisma.$queryRaw`SELECT 1`;
  await ensureGroup(commands, STREAMS.ENGINE_EVENTS, GROUPS.DB_WORKER, "$");
  const cleanup = setInterval(async () => {
    try {
      const removed = await prisma.processedEvent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - PROCESSED_EVENT_RETENTION_MS) } },
      });
      if (removed.count > 0) log.info("pruned processed event markers", { removed: removed.count });
    } catch (err) {
      log.warn("processed event cleanup failed", { err: serializeError(err) });
    }
  }, 60 * 60 * 1000);
  onShutdown(() => clearInterval(cleanup));
  log.info("db-worker started");
  const loop = consumeGroup({
    client: reader,
    stream: STREAMS.ENGINE_EVENTS,
    group: GROUPS.DB_WORKER,
    consumer: "db-worker",
    log,
    handle,
  });
  onShutdown(async () => {
    await loop;
    reader.disconnect();
  });
  await loop;
}

main().catch(async (err) => {
  log.error("db-worker crashed", { err: serializeError(err) });
  await shutdown("fatal", 1);
});
