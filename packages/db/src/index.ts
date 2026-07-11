import "dotenv/config";
import { PrismaClient, Prisma } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export { Prisma };
export type { User, Order, Fill, Position, PositionHistory, FundingRate, FundingPayment, FeeAccount, InsuranceFund } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10) });

export const prisma = new PrismaClient({ adapter });

export type Tx = Prisma.TransactionClient;

function isRetryable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  if (code === "P2034" || code === "40001" || code === "40P01") return true;
  const message = String((err as Error)?.message ?? "");
  return message.includes("deadlock detected") || message.includes("could not serialize") || message.includes("write conflict");
}

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 10_000, timeout: 30_000 });
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt + Math.random() * 50));
    }
  }
  throw lastError;
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "P2002";
}
