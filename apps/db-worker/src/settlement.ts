import { Prisma, type Order, type Position, type Tx } from "@repo/db";
import {
  FEE_RATE,
  roundMoney,
  roundQty,
  type EngineResult,
  type EngineTrade,
  type Logger,
} from "@repo/common";

interface UserState {
  id: string;
  balance: number;
  lockedBalance: number;
  dirty: boolean;
}

interface OrderState extends Order {
  dirty: boolean;
}

export interface LiquidationNotice {
  positionId: string;
  userId: string;
  market: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number;
  insuranceDelta: number;
}

export interface SettlementOutcome {
  applied: boolean;
  trades: number;
  liquidations: LiquidationNotice[];
}

const TERMINAL = new Set(["filled", "cancelled", "rejected"]);

export async function adjustSystemAccount(tx: Tx, table: "FeeAccount" | "InsuranceFund", market: string, delta: number) {
  if (delta === 0) return;
  await tx.$executeRawUnsafe(
    `INSERT INTO "${table}" ("id", "market", "balance", "createdAt", "updatedAt") VALUES (gen_random_uuid()::text, $1, 0, NOW(), NOW()) ON CONFLICT ("market") DO NOTHING`,
    market,
  );
  await tx.$executeRawUnsafe(
    `UPDATE "${table}" SET "balance" = ROUND(("balance" + $2)::numeric, 6)::double precision, "updatedAt" = NOW() WHERE "market" = $1`,
    market,
    delta,
  );
}

export async function lockUsers(tx: Tx, userIds: string[]): Promise<Map<string, UserState>> {
  const ids = [...new Set(userIds)].sort();
  const users = new Map<string, UserState>();
  if (ids.length === 0) return users;
  const rows = await tx.$queryRaw<Array<{ id: string; balance: number; lockedBalance: number }>>`
    SELECT "id", "balance", "lockedBalance" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  for (const row of rows) {
    users.set(row.id, { id: row.id, balance: Number(row.balance), lockedBalance: Number(row.lockedBalance), dirty: false });
  }
  return users;
}

export async function persistUsers(tx: Tx, users: Map<string, UserState>, log: Logger) {
  for (const user of users.values()) {
    if (!user.dirty) continue;
    let balance = roundMoney(user.balance);
    let locked = roundMoney(user.lockedBalance);
    if (balance < 0 || locked < 0) {
      if (balance < -0.00001 || locked < -0.00001) {
        log.error("negative user balance clamped", { userId: user.id, balance, lockedBalance: locked });
      }
      balance = Math.max(0, balance);
      locked = Math.max(0, locked);
    }
    await tx.user.update({ where: { id: user.id }, data: { balance, lockedBalance: locked } });
  }
}

export async function lockOpenPosition(tx: Tx, userId: string, market: string): Promise<Position | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Position" WHERE "userId" = ${userId} AND "market" = ${market} AND "status" = 'open' FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.position.findUnique({ where: { id: rows[0]!.id } });
}

class Settlement {
  private readonly positions = new Map<string, Position | null>();
  private readonly insuranceDeltas = new Map<string, number>();
  private readonly feeDeltas = new Map<string, number>();
  readonly liquidations: LiquidationNotice[] = [];

  constructor(
    private readonly tx: Tx,
    private readonly users: Map<string, UserState>,
    private readonly orders: Map<string, OrderState>,
    private readonly log: Logger,
  ) {}

  private async position(userId: string, market: string): Promise<Position | null> {
    const key = `${userId}:${market}`;
    if (!this.positions.has(key)) {
      this.positions.set(key, await lockOpenPosition(this.tx, userId, market));
    }
    return this.positions.get(key) ?? null;
  }

  private setPosition(userId: string, market: string, position: Position | null) {
    this.positions.set(`${userId}:${market}`, position);
  }

  private addDelta(map: Map<string, number>, market: string, delta: number) {
    map.set(market, roundMoney((map.get(market) ?? 0) + delta));
  }

  private async settleSide(trade: EngineTrade, order: OrderState, direction: 1 | -1): Promise<number> {
    const user = this.users.get(order.userId);
    if (!user) throw new Error(`user ${order.userId} missing for order ${order.id}`);
    user.dirty = true;
    order.dirty = true;
    const { market, price, quantity } = trade;
    const isLiquidation = order.source === "liquidation";
    let position = await this.position(user.id, market);
    let reduceQty = 0;

    if (position && (position.side === "long" ? 1 : -1) !== direction) {
      reduceQty = roundQty(Math.min(position.quantity, quantity));
      const fullyClosed = reduceQty >= position.quantity;
      const released = fullyClosed ? position.margin : roundMoney((position.margin * reduceQty) / position.quantity);
      const realized = roundMoney(
        (position.side === "long" ? price - position.entryPrice : position.entryPrice - price) * reduceQty,
      );
      user.lockedBalance = roundMoney(user.lockedBalance - released);
      const credit = roundMoney(released + realized);
      let insuranceDelta = 0;
      if (isLiquidation) {
        insuranceDelta = credit;
      } else {
        user.balance = roundMoney(user.balance + credit);
        if (user.balance < 0) {
          insuranceDelta = user.balance;
          user.balance = 0;
        }
      }
      if (insuranceDelta !== 0) this.addDelta(this.insuranceDeltas, market, insuranceDelta);

      const remainingQty = fullyClosed ? 0 : roundQty(position.quantity - reduceQty);
      const remainingMargin = fullyClosed ? 0 : roundMoney(position.margin - released);
      const totalPnl = roundMoney(position.pnl + realized);
      const reason = isLiquidation ? "liquidated" : fullyClosed ? "closed" : "reduced";

      await this.tx.positionHistory.create({
        data: {
          userId: user.id,
          market,
          side: position.side,
          quantity: reduceQty,
          entryPrice: position.entryPrice,
          exitPrice: price,
          leverage: position.leverage,
          margin: released,
          pnl: realized,
          reason,
        },
      });

      if (fullyClosed) {
        await this.tx.position.update({
          where: { id: position.id },
          data: { status: "closed", quantity: 0, margin: 0, pnl: totalPnl },
        });
        if (isLiquidation) {
          this.liquidations.push({
            positionId: position.id,
            userId: user.id,
            market,
            side: position.side,
            quantity: reduceQty,
            price,
            pnl: realized,
            insuranceDelta,
          });
        }
        position = null;
      } else {
        position = await this.tx.position.update({
          where: { id: position.id },
          data: { quantity: remainingQty, margin: remainingMargin, pnl: totalPnl },
        });
      }
      this.setPosition(user.id, market, position);
    }

    let pool = order.lockedMargin;
    const feeDue = isLiquidation ? 0 : roundMoney(price * quantity * FEE_RATE);
    const feeFromPool = Math.min(pool, feeDue);
    pool = roundMoney(pool - feeFromPool);
    user.lockedBalance = roundMoney(user.lockedBalance - feeFromPool);
    const feeFromBalance = Math.min(Math.max(user.balance, 0), roundMoney(feeDue - feeFromPool));
    user.balance = roundMoney(user.balance - feeFromBalance);
    const feeCharged = roundMoney(feeFromPool + feeFromBalance);
    if (feeCharged < feeDue) {
      this.log.warn("fee partially waived due to insufficient funds", { orderId: order.id, feeDue, feeCharged });
    }

    const openQty = roundQty(quantity - reduceQty);
    if (openQty > 0) {
      const leverage = order.leverage > 0 ? order.leverage : 1;
      const required = roundMoney((price * openQty) / leverage);
      const marginFromPool = Math.min(pool, required);
      pool = roundMoney(pool - marginFromPool);
      const marginFromBalance = Math.min(Math.max(user.balance, 0), roundMoney(required - marginFromPool));
      user.balance = roundMoney(user.balance - marginFromBalance);
      user.lockedBalance = roundMoney(user.lockedBalance + marginFromBalance);
      const margin = roundMoney(marginFromPool + marginFromBalance);
      if (margin < required) {
        this.log.warn("position opened with less than initial margin", { orderId: order.id, required, margin });
      }

      if (position) {
        const newQty = roundQty(position.quantity + openQty);
        const entryPrice = (position.entryPrice * position.quantity + price * openQty) / newQty;
        position = await this.tx.position.update({
          where: { id: position.id },
          data: { quantity: newQty, entryPrice, margin: roundMoney(position.margin + margin) },
        });
      } else {
        position = await this.tx.position.create({
          data: {
            userId: user.id,
            market,
            side: direction === 1 ? "long" : "short",
            status: "open",
            quantity: openQty,
            entryPrice: price,
            leverage,
            margin,
            pnl: 0,
          },
        });
      }
      this.setPosition(user.id, market, position);
    }

    order.lockedMargin = pool;
    this.addDelta(this.feeDeltas, market, feeCharged);
    return feeCharged;
  }

  async applyTrade(trade: EngineTrade) {
    const buyOrder = this.orders.get(trade.buyOrderId);
    const sellOrder = this.orders.get(trade.sellOrderId);
    if (!buyOrder || !sellOrder) {
      this.log.error("trade references unknown order, skipped", {
        tradeId: trade.tradeId,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
      });
      return false;
    }
    const buyerFee = await this.settleSide(trade, buyOrder, 1);
    const sellerFee = await this.settleSide(trade, sellOrder, -1);
    await this.tx.fill.create({
      data: {
        tradeId: trade.tradeId,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
        buyerId: buyOrder.userId,
        sellerId: sellOrder.userId,
        market: trade.market,
        price: trade.price,
        quantity: trade.quantity,
        buyerFee,
        sellerFee,
        takerSide: trade.takerSide,
        createdAt: new Date(trade.timestamp),
      },
    });
    return true;
  }

  applyOrderState(orderId: string, status: string, remaining: number, reason: string | undefined) {
    const order = this.orders.get(orderId);
    if (!order) return;
    order.dirty = true;
    if (TERMINAL.has(order.status) && order.status !== status) {
      this.log.warn("order already terminal, update ignored", { orderId, current: order.status, incoming: status });
      return;
    }
    order.status = status;
    order.quantity = roundQty(Math.max(0, remaining));
    if (reason) order.reason = reason;
    if (TERMINAL.has(status) && order.lockedMargin > 0) {
      const user = this.users.get(order.userId);
      if (user) {
        user.dirty = true;
        user.lockedBalance = roundMoney(user.lockedBalance - order.lockedMargin);
        user.balance = roundMoney(user.balance + order.lockedMargin);
      }
      order.lockedMargin = 0;
    }
  }

  async flush() {
    for (const [market, delta] of this.feeDeltas) await adjustSystemAccount(this.tx, "FeeAccount", market, delta);
    for (const [market, delta] of this.insuranceDeltas) await adjustSystemAccount(this.tx, "InsuranceFund", market, delta);
    for (const order of this.orders.values()) {
      if (!order.dirty) continue;
      await this.tx.order.update({
        where: { id: order.id },
        data: {
          status: order.status,
          quantity: order.quantity,
          lockedMargin: roundMoney(order.lockedMargin),
          reason: order.reason,
          acceptedAt: order.acceptedAt,
          engineSeq: order.engineSeq,
        },
      });
    }
    await persistUsers(this.tx, this.users, this.log);
  }
}

export async function applyEngineResult(tx: Tx, result: EngineResult, log: Logger): Promise<SettlementOutcome> {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "ProcessedEvent" ("id", "createdAt") VALUES (${result.eventId}, NOW()) ON CONFLICT ("id") DO NOTHING RETURNING "id"`;
  if (inserted.length === 0) return { applied: false, trades: 0, liquidations: [] };

  const orderIds = new Set<string>([result.orderId]);
  for (const trade of result.trades) {
    orderIds.add(trade.buyOrderId);
    orderIds.add(trade.sellOrderId);
  }
  for (const state of result.orders) orderIds.add(state.orderId);

  const ids = [...orderIds].filter((id) => typeof id === "string" && id.length > 0).sort();
  if (ids.length > 0) {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  }
  const orderRows = ids.length > 0 ? await tx.order.findMany({ where: { id: { in: ids } } }) : [];
  const orders = new Map<string, OrderState>(orderRows.map((row) => [row.id, { ...row, dirty: false }]));
  const users = await lockUsers(tx, orderRows.map((row) => row.userId));

  const settlement = new Settlement(tx, users, orders, log);

  if (result.action === "create") {
    const taker = orders.get(result.orderId);
    if (taker && taker.acceptedAt === null) {
      taker.acceptedAt = new Date(result.timestamp);
      taker.engineSeq = result.engineSeq;
      taker.dirty = true;
    }
  }

  let trades = 0;
  for (const trade of result.trades) {
    if (await settlement.applyTrade(trade)) trades += 1;
  }
  for (const state of result.orders) {
    settlement.applyOrderState(state.orderId, state.status, state.remaining, state.reason);
  }
  await settlement.flush();
  return { applied: true, trades, liquidations: settlement.liquidations };
}
