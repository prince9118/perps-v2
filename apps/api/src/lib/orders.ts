import { prisma, withTransaction, type Order } from "@repo/db";
import { getIndexPrice } from "@repo/redis";
import {
  EVENT_TYPES,
  FEE_RATE,
  MARKET_ORDER_SLIPPAGE,
  MAX_OPEN_ORDERS_PER_USER,
  MAX_PRICE,
  STREAMS,
  getMarket,
  isMultipleOf,
  roundMoney,
  roundPrice,
  roundQty,
  serializeError,
  type MarketId,
  type OrderCreateEvent,
  type OrderSide,
  type OrderType,
} from "@repo/common";
import { log, redis } from "./context";
import { HttpError } from "./http";

const TERMINAL = new Set(["filled", "cancelled", "rejected"]);

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status);
}

export interface PlaceOrderInput {
  userId: string;
  market: MarketId;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  leverage: number;
  price?: number | null;
  reduceOnly?: boolean;
  source?: "user" | "close";
}

export function validateOrderNumbers(input: { market: MarketId; type: OrderType; quantity: number; price?: number | null }) {
  const market = getMarket(input.market)!;
  if (!isMultipleOf(input.quantity, market.qtyStep)) {
    throw new HttpError(400, `Quantity must be a multiple of ${market.qtyStep}.`);
  }
  if (input.quantity > market.maxQuantity) {
    throw new HttpError(400, `Quantity can't exceed ${market.maxQuantity} ${market.baseAsset}.`);
  }
  if (input.type === "limit") {
    const price = input.price;
    if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) {
      throw new HttpError(400, "Price must be greater than 0 for limit orders.");
    }
    if (price > MAX_PRICE) throw new HttpError(400, `Price can't exceed ${MAX_PRICE}.`);
    if (!isMultipleOf(price, market.priceTick)) {
      throw new HttpError(400, `Price must be a multiple of ${market.priceTick}.`);
    }
  }
}

async function enginePrices(input: PlaceOrderInput): Promise<{ enginePrice: number; reservePrice: number }> {
  if (input.type === "limit") {
    const price = roundPrice(input.price!);
    return { enginePrice: price, reservePrice: price };
  }
  const index = await getIndexPrice(redis, input.market);
  if (!index.fresh || index.price === null) {
    throw new HttpError(503, "Market price unavailable. Try again shortly.");
  }
  const upper = roundPrice(index.price * (1 + MARKET_ORDER_SLIPPAGE));
  const lower = roundPrice(index.price * (1 - MARKET_ORDER_SLIPPAGE));
  return { enginePrice: input.side === "buy" ? upper : lower, reservePrice: upper };
}

export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const quantity = roundQty(input.quantity);
  const reduceOnly = input.reduceOnly ?? false;
  const { enginePrice, reservePrice } = await enginePrices(input);
  const direction = input.side === "buy" ? "long" : "short";

  const order = await withTransaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{ id: string; balance: number; lockedBalance: number }>>`
      SELECT "id", "balance", "lockedBalance" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const user = users[0];
    if (!user) throw new HttpError(401, "Invalid token");

    const openOrders = await tx.order.count({ where: { userId: input.userId, status: { in: ["open", "partial"] } } });
    if (openOrders >= MAX_OPEN_ORDERS_PER_USER) {
      throw new HttpError(400, `You can have at most ${MAX_OPEN_ORDERS_PER_USER} open orders.`);
    }

    const position = await tx.position.findFirst({
      where: { userId: input.userId, market: input.market, status: "open" },
    });
    const opposing = position && position.side !== direction ? position : null;

    let openingQty = quantity;
    if (reduceOnly) {
      if (!opposing) throw new HttpError(400, "No open position to reduce.");
      const pending = await tx.order.aggregate({
        _sum: { quantity: true },
        where: {
          userId: input.userId,
          market: input.market,
          side: input.side,
          reduceOnly: true,
          status: { in: ["open", "partial"] },
        },
      });
      const available = roundQty(opposing.quantity - (pending._sum.quantity ?? 0));
      if (available <= 0) throw new HttpError(409, "Position is already being closed.");
      if (quantity > available + 1e-9) throw new HttpError(400, "Reduce-only quantity exceeds open position size.");
      openingQty = 0;
    } else if (opposing) {
      const pending = await tx.order.aggregate({
        _sum: { quantity: true },
        where: { userId: input.userId, market: input.market, side: input.side, status: { in: ["open", "partial"] } },
      });
      const reducible = Math.max(0, roundQty(opposing.quantity - (pending._sum.quantity ?? 0)));
      openingQty = Math.max(0, roundQty(quantity - reducible));
    }

    const balance = Number(user.balance);
    const margin = roundMoney((reservePrice * openingQty) / input.leverage);
    const fee = reduceOnly ? 0 : roundMoney(reservePrice * quantity * FEE_RATE);
    if (margin > balance + 1e-9) {
      throw new HttpError(400, `Insufficient balance: requires ${margin.toFixed(2)} margin, available ${balance.toFixed(2)}.`, {
        requiredMargin: margin,
        available: balance,
      });
    }
    const reserve = roundMoney(Math.min(balance, margin + fee));

    if (reserve > 0) {
      await tx.user.update({
        where: { id: input.userId },
        data: {
          balance: roundMoney(balance - reserve),
          lockedBalance: roundMoney(Number(user.lockedBalance) + reserve),
        },
      });
    }

    return tx.order.create({
      data: {
        userId: input.userId,
        market: input.market,
        side: input.side,
        type: input.type,
        status: "open",
        price: input.type === "limit" ? roundPrice(input.price!) : null,
        quantity,
        originalQuantity: quantity,
        leverage: input.leverage,
        lockedMargin: reserve,
        reduceOnly,
        source: input.source ?? "user",
      },
    });
  });

  const event: OrderCreateEvent = {
    orderId: order.id,
    userId: order.userId,
    market: order.market,
    side: input.side,
    type: input.type,
    price: enginePrice,
    quantity,
    timestamp: Date.now(),
  };

  try {
    await redis.xadd(STREAMS.ORDER_EVENTS, "*", "type", EVENT_TYPES.ORDER_CREATE, "data", JSON.stringify(event));
  } catch (err) {
    log.error("failed to enqueue order, rolling back reservation", { orderId: order.id, err: serializeError(err) });
    await withTransaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${order.userId} FOR UPDATE`;
      const current = await tx.order.findUnique({ where: { id: order.id } });
      if (!current || current.status !== "open" || current.acceptedAt !== null) return;
      const user = await tx.user.findUnique({ where: { id: order.userId } });
      if (user && current.lockedMargin > 0) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            balance: roundMoney(user.balance + current.lockedMargin),
            lockedBalance: Math.max(0, roundMoney(user.lockedBalance - current.lockedMargin)),
          },
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: "rejected", reason: "queue_unavailable", lockedMargin: 0 },
      });
    });
    throw new HttpError(503, "Order service temporarily unavailable. Try again shortly.");
  }

  return order;
}

export async function waitForOrder(orderId: string, done: (order: Order) => boolean, timeoutMs: number): Promise<Order | null> {
  const deadline = Date.now() + timeoutMs;
  let order: Order | null = null;
  while (true) {
    order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || done(order) || Date.now() >= deadline) return order;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function rejectionMessage(reason: string | null | undefined): string {
  switch (reason) {
    case "no_liquidity":
      return "No liquidity available for this market order.";
    case "self_trade_prevented":
      return "Order would trade against your own resting order.";
    case "queue_unavailable":
      return "Order service temporarily unavailable. Try again shortly.";
    default:
      return "Order was rejected.";
  }
}
