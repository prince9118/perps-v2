import { closeRedis, createRedisClient, indexPriceKey, indexPriceTsKey } from "@repo/redis";
import { MARKETS, createLogger, installLifecycle, isStopping, onShutdown, serializeError, sleep } from "@repo/common";

const log = createLogger("price-service");
const shutdown = installLifecycle(log);
const redis = createRedisClient("price-service", log);
const INTERVAL_MS = Number(process.env.PRICE_POLL_INTERVAL_MS ?? 3_000);
const REQUEST_TIMEOUT_MS = 5_000;
const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];

let failing = false;
let consecutiveFailures = 0;

async function fetchFromHost(host: string): Promise<Map<string, number>> {
  const symbols = encodeURIComponent(JSON.stringify(MARKETS.map((m) => m.symbol)));
  const res = await fetch(`${host}/api/v3/ticker/price?symbols=${symbols}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) throw new Error(`unexpected response shape from ${host}`);
  const prices = new Map<string, number>();
  for (const item of body as Array<{ symbol?: unknown; price?: unknown }>) {
    const price = Number(item?.price);
    if (typeof item?.symbol === "string" && Number.isFinite(price) && price > 0) prices.set(item.symbol, price);
  }
  return prices;
}

async function fetchPrices(): Promise<Map<string, number>> {
  let lastError: unknown;
  for (const host of HOSTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetchFromHost(host);
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw lastError;
}

async function tick() {
  const prices = await fetchPrices();
  const now = Date.now();
  const args: string[] = [];
  const missing: string[] = [];
  for (const market of MARKETS) {
    const price = prices.get(market.symbol);
    if (price === undefined) {
      missing.push(market.market);
      continue;
    }
    args.push(indexPriceKey(market.market), String(price), indexPriceTsKey(market.market), String(now));
  }
  if (args.length > 0) await redis.mset(...args);
  if (missing.length > 0) throw new Error(`missing prices for ${missing.join(", ")}`);
}

async function main() {
  onShutdown(async () => {
    await closeRedis(redis);
  });
  log.info("price-service started", { intervalMs: INTERVAL_MS, markets: MARKETS.map((m) => m.market) });
  while (!isStopping()) {
    const started = Date.now();
    try {
      await tick();
      if (failing) {
        log.info("price feed recovered", { failures: consecutiveFailures });
        failing = false;
      }
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      if (!failing || consecutiveFailures % 20 === 0) {
        log.warn("price feed update failed, keeping last good prices", {
          failures: consecutiveFailures,
          err: serializeError(err),
        });
      }
      failing = true;
    }
    await sleep(Math.max(0, INTERVAL_MS - (Date.now() - started)));
  }
}

main().catch(async (err) => {
  log.error("price-service crashed", { err: serializeError(err) });
  await shutdown("fatal", 1);
});
