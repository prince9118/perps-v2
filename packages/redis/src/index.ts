import Redis from "ioredis";
import { createLogger, isStopping, serializeError, sleep, PRICE_MAX_AGE_MS, type Logger } from "@repo/common";

export type { Redis };

const internalLog = createLogger("redis");

export function createRedisClient(name = "default", log: Logger = internalLog): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    connectionName: name,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });
  let lastErrorAt = 0;
  let degraded = false;
  client.on("error", (err) => {
    const now = Date.now();
    if (now - lastErrorAt > 30_000) {
      lastErrorAt = now;
      log.error("redis connection error", { connection: name, err: serializeError(err) });
    }
    degraded = true;
  });
  client.on("ready", () => {
    if (degraded) {
      degraded = false;
      log.info("redis connection recovered", { connection: name });
    }
  });
  return client;
}

export async function closeRedis(client: Redis): Promise<void> {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

export function fieldsToObject(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    obj[fields[i]!] = fields[i + 1]!;
  }
  return obj;
}

export interface StreamEvent<T = unknown> {
  type: string;
  data: T;
}

export function parseStreamEvent<T = unknown>(fields: string[] | null | undefined): StreamEvent<T> | null {
  if (!fields) return null;
  const obj = fieldsToObject(fields);
  if (typeof obj.type !== "string" || typeof obj.data !== "string") return null;
  try {
    const data = JSON.parse(obj.data) as T;
    if (data === null || typeof data !== "object") return null;
    return { type: obj.type, data };
  } catch {
    return null;
  }
}

export async function ensureGroup(client: Redis, stream: string, group: string, startId = "$"): Promise<void> {
  try {
    await client.xgroup("CREATE", stream, group, startId, "MKSTREAM");
  } catch (err) {
    if (!String((err as Error).message).includes("BUSYGROUP")) throw err;
  }
}

export interface GroupLag {
  exists: boolean;
  lag: number | null;
  pending: number;
}

export async function getGroupLag(client: Redis, stream: string, group: string): Promise<GroupLag> {
  let groups: unknown[];
  try {
    groups = (await client.xinfo("GROUPS", stream)) as unknown[];
  } catch {
    return { exists: false, lag: null, pending: 0 };
  }
  for (const raw of groups) {
    const info = fieldsToObject((raw as unknown[]).map((v) => (v === null ? "" : String(v))));
    if (info.name === group) {
      let lag = info.lag === "" || info.lag === undefined ? null : Number(info.lag);
      if (lag === null) {
        const streamInfo = fieldsToObject(((await client.xinfo("STREAM", stream)) as unknown[]).map((v) => (v === null ? "" : String(v))));
        lag = streamInfo["last-generated-id"] === info["last-delivered-id"] ? 0 : null;
      }
      return { exists: true, lag, pending: Number(info.pending ?? 0) };
    }
  }
  return { exists: false, lag: null, pending: 0 };
}

export interface ConsumeOptions {
  client: Redis;
  stream: string;
  group: string;
  consumer: string;
  log: Logger;
  autoAck?: boolean;
  blockMs?: number;
  count?: number;
  handle: (id: string, event: StreamEvent | null) => Promise<void>;
}

export async function consumeGroup(options: ConsumeOptions): Promise<void> {
  const { client, stream, group, consumer, log, handle } = options;
  const autoAck = options.autoAck ?? true;
  const blockMs = options.blockMs ?? 2_000;
  const count = options.count ?? 50;
  let readPending = true;

  while (!isStopping()) {
    let entries: Array<[string, string[] | null]> = [];
    try {
      const result = (await client.xreadgroup(
        "GROUP",
        group,
        consumer,
        "COUNT",
        count,
        "BLOCK",
        blockMs,
        "STREAMS",
        stream,
        readPending ? "0" : ">",
      )) as Array<[string, Array<[string, string[] | null]>]> | null;
      entries = result?.[0]?.[1] ?? [];
    } catch (err) {
      if (isStopping()) break;
      if (String((err as Error).message).includes("NOGROUP")) {
        await ensureGroup(client, stream, group).catch(() => undefined);
      } else {
        log.error("stream read failed", { stream, group, err: serializeError(err) });
      }
      await sleep(1_000);
      continue;
    }

    if (readPending && entries.length === 0) {
      readPending = false;
      continue;
    }

    for (const [id, fields] of entries) {
      if (isStopping()) return;
      let attempt = 0;
      while (true) {
        try {
          await handle(id, parseStreamEvent(fields));
          if (autoAck) await client.xack(stream, group, id);
          break;
        } catch (err) {
          attempt += 1;
          log.error("stream event handling failed", { stream, group, id, attempt, err: serializeError(err) });
          if (isStopping()) return;
          await sleep(Math.min(500 * 2 ** attempt, 30_000));
          if (isStopping()) return;
        }
      }
    }
  }
}

export function compareStreamIds(a: string, b: string): number {
  const [aMs = "0", aSeq = "0"] = a.split("-");
  const [bMs = "0", bSeq = "0"] = b.split("-");
  const msDiff = BigInt(aMs) - BigInt(bMs);
  if (msDiff !== 0n) return msDiff < 0n ? -1 : 1;
  const seqDiff = BigInt(aSeq) - BigInt(bSeq);
  return seqDiff === 0n ? 0 : seqDiff < 0n ? -1 : 1;
}

export async function trimConsumedEntries(client: Redis, stream: string, group: string, retainMs: number): Promise<void> {
  const groups = (await client.xinfo("GROUPS", stream).catch(() => [])) as unknown[];
  let lastDelivered: string | null = null;
  for (const raw of groups) {
    const info = fieldsToObject((raw as unknown[]).map((v) => (v === null ? "" : String(v))));
    if (info.name === group) lastDelivered = info["last-delivered-id"] ?? null;
  }
  if (!lastDelivered) return;
  const pending = (await client.xpending(stream, group)) as [number, string | null, string | null, unknown];
  let boundary = pending[0] > 0 && pending[1] ? pending[1] : lastDelivered;
  const retainBoundary = `${Date.now() - retainMs}-0`;
  if (compareStreamIds(retainBoundary, boundary) < 0) boundary = retainBoundary;
  await client.xtrim(stream, "MINID", "~", boundary);
}

export function indexPriceKey(market: string): string {
  return `index_price:${market}`;
}

export function indexPriceTsKey(market: string): string {
  return `index_price_ts:${market}`;
}

export interface IndexPrice {
  price: number | null;
  ts: number | null;
  fresh: boolean;
}

export async function getIndexPrice(client: Redis, market: string, maxAgeMs = PRICE_MAX_AGE_MS): Promise<IndexPrice> {
  const [rawPrice, rawTs] = await client.mget(indexPriceKey(market), indexPriceTsKey(market));
  const price = rawPrice === null ? NaN : Number(rawPrice);
  const ts = rawTs === null ? NaN : Number(rawTs);
  const validPrice = Number.isFinite(price) && price > 0 ? price : null;
  const validTs = Number.isFinite(ts) && ts > 0 ? ts : null;
  const fresh = validPrice !== null && validTs !== null && Date.now() - validTs <= maxAgeMs;
  return { price: validPrice, ts: validTs, fresh };
}
