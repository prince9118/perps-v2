import { Prisma, prisma, withTransaction, isUniqueViolation } from "@repo/db";
import { closeRedis, createRedisClient, getIndexPrice } from "@repo/redis";
import {
  MARKET_IDS,
  createLogger,
  installLifecycle,
  isStopping,
  onShutdown,
  roundMoney,
  serializeError,
  sleep,
} from "@repo/common";

const log = createLogger("funding-service");
const shutdown = installLifecycle(log);
const redis = createRedisClient("funding-service", log);
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const INTERVAL_MS = Math.max(1_000, Number(process.env.FUNDING_INTERVAL_MS ?? 60 * 60 * 1000));
const RATE_8H = Number(process.env.FUNDING_RATE_8H ?? 0.0001);
const CHECK_EVERY_MS = Math.min(10_000, INTERVAL_MS);

class AlreadyApplied extends Error {}

const stalePriceWarned = new Set<string>();

interface RunSummary {
  market: string;
  period: string;
  rate: number;
  positions: number;
  collected: number;
  distributed: number;
  shortfall: number;
}

async function runMarket(market: string, period: Date, price: number): Promise<RunSummary> {
  const intervalRate = (RATE_8H * INTERVAL_MS) / EIGHT_HOURS_MS;
  return withTransaction(async (tx) => {
    try {
      await tx.fundingRate.create({ data: { market, rate: RATE_8H, period } });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AlreadyApplied();
      throw err;
    }

    const candidates = await tx.position.findMany({ where: { market, status: "open" }, select: { userId: true } });
    const userIds = [...new Set(candidates.map((p) => p.userId))].sort();
    const users = new Map<string, { balance: number; lockedBalance: number }>();
    if (userIds.length > 0) {
      const rows = await tx.$queryRaw<Array<{ id: string; balance: number; lockedBalance: number }>>`
        SELECT "id", "balance", "lockedBalance" FROM "User" WHERE "id" IN (${Prisma.join(userIds)}) ORDER BY "id" FOR UPDATE`;
      for (const row of rows) users.set(row.id, { balance: Number(row.balance), lockedBalance: Number(row.lockedBalance) });
    }
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Position" WHERE "market" = ${market} AND "status" = 'open' ORDER BY "id" FOR UPDATE`;
    const positions = (
      await tx.position.findMany({ where: { id: { in: locked.map((p) => p.id) } }, orderBy: { id: "asc" } })
    ).filter((p) => users.has(p.userId));

    const summary: RunSummary = {
      market,
      period: period.toISOString(),
      rate: RATE_8H,
      positions: positions.length,
      collected: 0,
      distributed: 0,
      shortfall: 0,
    };
    if (intervalRate === 0 || positions.length === 0) return summary;

    const payerSide = intervalRate > 0 ? "long" : "short";
    const payers = positions.filter((p) => p.side === payerSide);
    const receivers = positions.filter((p) => p.side !== payerSide);
    if (payers.length === 0 || receivers.length === 0) return summary;

    const absRate = Math.abs(intervalRate);
    let collectedMicros = 0;
    const payments: Array<{ userId: string; side: string; amount: number }> = [];

    for (const position of payers) {
      const user = users.get(position.userId)!;
      const due = roundMoney(position.quantity * price * absRate);
      if (due <= 0) continue;
      const fromBalance = Math.min(Math.max(user.balance, 0), due);
      user.balance = roundMoney(user.balance - fromBalance);
      const fromMargin = Math.min(position.margin, roundMoney(due - fromBalance));
      if (fromMargin > 0) {
        user.lockedBalance = roundMoney(user.lockedBalance - fromMargin);
        await tx.position.update({ where: { id: position.id }, data: { margin: roundMoney(position.margin - fromMargin) } });
      }
      const paid = roundMoney(fromBalance + fromMargin);
      summary.shortfall = roundMoney(summary.shortfall + (due - paid));
      collectedMicros += Math.round(paid * 1e6);
      payments.push({ userId: position.userId, side: position.side, amount: -paid });
    }

    const totalWeight = receivers.reduce((sum, p) => sum + p.quantity, 0);
    let remainingMicros = collectedMicros;
    receivers.forEach((position, index) => {
      const share =
        index === receivers.length - 1 ? remainingMicros : Math.floor((collectedMicros * position.quantity) / totalWeight);
      remainingMicros -= share;
      const amount = share / 1e6;
      const user = users.get(position.userId)!;
      user.balance = roundMoney(user.balance + amount);
      payments.push({ userId: position.userId, side: position.side, amount });
    });

    for (const [id, user] of users) {
      await tx.user.update({
        where: { id },
        data: { balance: Math.max(0, roundMoney(user.balance)), lockedBalance: Math.max(0, roundMoney(user.lockedBalance)) },
      });
    }
    const nonZero = payments.filter((p) => p.amount !== 0);
    if (nonZero.length > 0) {
      await tx.fundingPayment.createMany({
        data: nonZero.map((p) => ({ userId: p.userId, market, amount: roundMoney(p.amount), side: p.side })),
      });
    }
    summary.collected = collectedMicros / 1e6;
    summary.distributed = collectedMicros / 1e6;
    return summary;
  });
}

async function runDue() {
  const period = new Date(Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS);
  for (const market of MARKET_IDS) {
    const existing = await prisma.fundingRate.findUnique({ where: { market_period: { market, period } } });
    if (existing) continue;
    const index = await getIndexPrice(redis, market);
    if (!index.fresh || index.price === null) {
      const key = `${market}:${period.getTime()}`;
      if (!stalePriceWarned.has(key)) {
        stalePriceWarned.add(key);
        log.warn("funding deferred, index price unavailable", { market, period: period.toISOString() });
      }
      continue;
    }
    try {
      const summary = await runMarket(market, period, index.price);
      log.info("funding applied", summary as unknown as Record<string, unknown>);
    } catch (err) {
      if (err instanceof AlreadyApplied) continue;
      throw err;
    }
  }
}

async function main() {
  onShutdown(async () => {
    await closeRedis(redis);
    await prisma.$disconnect();
  });
  log.info("funding-service started", { intervalMs: INTERVAL_MS, rate8h: RATE_8H });
  while (!isStopping()) {
    try {
      await runDue();
    } catch (err) {
      log.error("funding run failed", { err: serializeError(err) });
    }
    await sleep(CHECK_EVERY_MS);
  }
}

main().catch(async (err) => {
  log.error("funding-service crashed", { err: serializeError(err) });
  await shutdown("fatal", 1);
});
