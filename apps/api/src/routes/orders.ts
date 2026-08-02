import { Router } from "express";
import { prisma } from "@repo/db";
import { EVENT_TYPES, STREAMS, type OrderCancelEvent } from "@repo/common";
import { redis } from "../lib/context";
import { HttpError, parseOrThrow, userIdOf } from "../lib/http";
import { createOrderSchema, uuidSchema } from "../lib/schemas";
import { isTerminal, placeOrder, rejectionMessage, validateOrderNumbers, waitForOrder } from "../lib/orders";
import { authMiddleware } from "../middleware/auth";

export const ordersRouter = Router();
ordersRouter.use(authMiddleware);

ordersRouter.post("/", async (req, res) => {
  const body = parseOrThrow(createOrderSchema, req.body);
  validateOrderNumbers(body);
  const placed = await placeOrder({ ...body, userId: userIdOf(req), source: "user" });
  const order =
    (await waitForOrder(placed.id, (o) => o.acceptedAt !== null || isTerminal(o.status), 3_000)) ?? placed;
  if (order.status === "rejected") {
    res.status(409).json({ success: false, message: rejectionMessage(order.reason), order });
    return;
  }
  res.json({ success: true, message: "Order Submitted", order });
});

ordersRouter.get("/", async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: userIdOf(req) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ success: true, orders });
});

ordersRouter.delete("/:id", async (req, res) => {
  const orderId = parseOrThrow(uuidSchema, req.params.id);
  const userId = userIdOf(req);
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new HttpError(404, "Order not found");
  if (isTerminal(order.status)) throw new HttpError(400, `Order can not be cancelled (status: ${order.status}).`);

  const event: OrderCancelEvent = { orderId, userId, market: order.market, timestamp: Date.now() };
  await redis.xadd(STREAMS.ORDER_EVENTS, "*", "type", EVENT_TYPES.ORDER_CANCEL, "data", JSON.stringify(event));

  const updated = await waitForOrder(orderId, (o) => isTerminal(o.status), 3_000);
  if (updated?.status === "cancelled") {
    res.json({ success: true, message: "Order Cancelled", order: updated });
    return;
  }
  if (updated?.status === "filled") throw new HttpError(409, "Order was already filled.");
  if (updated?.status === "rejected") throw new HttpError(409, "Order was rejected.");
  res.status(202).json({ success: true, message: "Cancel requested", order: updated });
});
