import { Router } from "express";
import { prisma } from "@repo/db";
import { getIndexPrice } from "@repo/redis";
import { isMarketId, liquidationPrice, marginRatio, roundMoney, roundQty, unrealizedPnl } from "@repo/common";
import { redis } from "../lib/context";
import { HttpError, parseOrThrow, userIdOf } from "../lib/http";
import { closePositionSchema } from "../lib/schemas";
import { isTerminal, placeOrder, rejectionMessage, waitForOrder } from "../lib/orders";
import { authMiddleware } from "../middleware/auth";

export const positionsRouter = Router();

positionsRouter.get("/positions", authMiddleware, async (req, res) => {
  const positions = await prisma.position.findMany({
    where: { userId: userIdOf(req), status: "open" },
    orderBy: { createdAt: "desc" },
  });
  const markets = [...new Set(positions.map((p) => p.market))];
  const prices = new Map(await Promise.all(markets.map(async (m) => [m, await getIndexPrice(redis, m)] as const)));
  const result = positions.map((position) => {
    const index = prices.get(position.market);
    const priceAvailable = Boolean(index?.fresh && index.price);
    const markPrice = priceAvailable ? index!.price! : position.entryPrice;
    return {
      ...position,
      markPrice,
      priceAvailable,
      unrealizedPnl: priceAvailable ? unrealizedPnl(position, markPrice) : 0,
      liquidationPrice: liquidationPrice(position),
      marginRatio: priceAvailable ? roundMoney(marginRatio(position, markPrice)) : null,
    };
  });
  res.json({ success: true, positions: result });
});

positionsRouter.post("/positions/close", authMiddleware, async (req, res) => {
  const { positionId } = parseOrThrow(closePositionSchema, req.body);
  const userId = userIdOf(req);
  const position = await prisma.position.findFirst({ where: { id: positionId, userId, status: "open" } });
  if (!position) throw new HttpError(404, "Position not found");
  if (!isMarketId(position.market)) throw new HttpError(400, "Unsupported market");

  const placed = await placeOrder({
    userId,
    market: position.market,
    side: position.side === "long" ? "sell" : "buy",
    type: "market",
    quantity: position.quantity,
    leverage: Math.max(1, Math.round(position.leverage)),
    reduceOnly: true,
    source: "close",
  });
  const order = await waitForOrder(placed.id, (o) => isTerminal(o.status), 5_000);
  if (!order || !isTerminal(order.status)) {
    res.status(202).json({ success: true, message: "Close order submitted", orderId: placed.id });
    return;
  }
  if (order.status === "rejected") {
    throw new HttpError(409, order.reason === "no_liquidity" ? "No liquidity available to close this position." : rejectionMessage(order.reason));
  }
  const history = await prisma.positionHistory.findMany({
    where: { userId, market: position.market, createdAt: { gte: placed.createdAt } },
  });
  const realizedPnl = roundMoney(history.reduce((sum, h) => sum + h.pnl, 0));
  const releasedMargin = roundMoney(history.reduce((sum, h) => sum + h.margin, 0));
  const closedQuantity = roundQty(order.originalQuantity - order.quantity);
  res.json({
    success: true,
    message: order.status === "filled" ? "position closed" : "position partially closed",
    orderId: order.id,
    closedQuantity,
    realizedPnl,
    releasedMargin,
    relesedMargin: releasedMargin,
  });
});

positionsRouter.get("/position-history", authMiddleware, async (req, res) => {
  const history = await prisma.positionHistory.findMany({
    where: { userId: userIdOf(req) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ success: true, history });
});

positionsRouter.get("/fills", authMiddleware, async (req, res) => {
  const userId = userIdOf(req);
  const fills = await prisma.fill.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({
    success: true,
    fills: fills.map((fill) => {
      const isBuyer = fill.buyerId === userId;
      return {
        id: fill.id,
        tradeId: fill.tradeId,
        market: fill.market,
        price: fill.price,
        quantity: fill.quantity,
        side: isBuyer ? "buy" : "sell",
        fee: isBuyer ? fill.buyerFee : fill.sellerFee,
        liquidity: fill.takerSide ? ((fill.takerSide === "buy") === isBuyer ? "taker" : "maker") : null,
        orderId: isBuyer ? fill.buyOrderId : fill.sellOrderId,
        buyerId: isBuyer ? userId : null,
        sellerId: isBuyer ? null : userId,
        createdAt: fill.createdAt,
      };
    }),
  });
});
