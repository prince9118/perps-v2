import { Router } from "express";
import { prisma } from "@repo/db";
import { getIndexPrice } from "@repo/redis";
import { MARKETS } from "@repo/common";
import { redis } from "../lib/context";
import { HttpError, parseOrThrow } from "../lib/http";
import { fundingQuerySchema, marketSchema } from "../lib/schemas";

export const marketRouter = Router();

marketRouter.get("/markets", (_req, res) => {
  res.json({ success: true, markets: MARKETS });
});

marketRouter.get("/price/:market", async (req, res) => {
  const parsed = marketSchema.safeParse(req.params.market);
  if (!parsed.success) throw new HttpError(404, "Unknown market");
  const index = await getIndexPrice(redis, parsed.data);
  res.json({
    success: true,
    market: parsed.data,
    price: index.price,
    timestamp: index.ts,
    stale: !index.fresh,
  });
});

marketRouter.get("/funding-rate", async (req, res) => {
  const { market } = parseOrThrow(fundingQuerySchema, req.query);
  const rates = await prisma.fundingRate.findMany({
    where: market ? { market } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ success: true, rates });
});

marketRouter.get("/insurance-fund", async (_req, res) => {
  const funds = await prisma.insuranceFund.findMany({ orderBy: { market: "asc" } });
  res.json({ success: true, funds });
});
