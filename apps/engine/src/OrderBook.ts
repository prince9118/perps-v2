import { roundQty, type BookLevel, type EngineOrderState, type EngineTrade, type OrderSide, type OrderType } from "@repo/common";

export interface EngineOrder {
  id: string;
  userId: string;
  market: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  quantity: number;
  originalQuantity: number;
  filledQuantity: number;
}

interface PriceLevel {
  price: number;
  orders: EngineOrder[];
  head: number;
  total: number;
}

class BookSide {
  private readonly levels = new Map<number, PriceLevel>();
  private readonly prices: number[] = [];

  constructor(private readonly descending: boolean) {}

  private better(a: number, b: number): boolean {
    return this.descending ? a > b : a < b;
  }

  private insertPrice(price: number) {
    let lo = 0;
    let hi = this.prices.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.better(this.prices[mid]!, price)) lo = mid + 1;
      else hi = mid;
    }
    this.prices.splice(lo, 0, price);
  }

  private removePrice(price: number) {
    const idx = this.prices.indexOf(price);
    if (idx >= 0) this.prices.splice(idx, 1);
  }

  add(order: EngineOrder) {
    let level = this.levels.get(order.price);
    if (!level) {
      level = { price: order.price, orders: [], head: 0, total: 0 };
      this.levels.set(order.price, level);
      this.insertPrice(order.price);
    }
    level.orders.push(order);
    level.total = roundQty(level.total + order.quantity);
  }

  bestLevel(): PriceLevel | undefined {
    const price = this.prices[0];
    return price === undefined ? undefined : this.levels.get(price);
  }

  reduce(level: PriceLevel, qty: number) {
    level.total = roundQty(level.total - qty);
  }

  compact(level: PriceLevel) {
    while (level.head < level.orders.length && level.orders[level.head]!.quantity <= 0) {
      level.head += 1;
    }
    if (level.head > 64 && level.head * 2 > level.orders.length) {
      level.orders = level.orders.slice(level.head);
      level.head = 0;
    }
    if (level.head >= level.orders.length) {
      this.levels.delete(level.price);
      this.removePrice(level.price);
    }
  }

  remove(order: EngineOrder): boolean {
    const level = this.levels.get(order.price);
    if (!level) return false;
    const idx = level.orders.indexOf(order, level.head);
    if (idx < 0) return false;
    level.orders.splice(idx, 1);
    level.total = roundQty(level.total - order.quantity);
    if (level.head >= level.orders.length) {
      this.levels.delete(level.price);
      this.removePrice(level.price);
    }
    return true;
  }

  snapshot(depth: number): BookLevel[] {
    const out: BookLevel[] = [];
    for (const price of this.prices) {
      if (out.length >= depth) break;
      const level = this.levels.get(price)!;
      if (level.total > 0) out.push({ price, quantity: level.total });
    }
    return out;
  }
}

export interface MatchResult {
  trades: EngineTrade[];
  orders: EngineOrderState[];
  rested: boolean;
}

export class OrderBook {
  private readonly bids = new BookSide(true);
  private readonly asks = new BookSide(false);
  private readonly byId = new Map<string, EngineOrder>();

  constructor(readonly market: string, private readonly newTradeId: () => string) {}

  has(orderId: string): boolean {
    return this.byId.has(orderId);
  }

  get size(): number {
    return this.byId.size;
  }

  restore(order: EngineOrder) {
    if (this.byId.has(order.id) || order.quantity <= 0) return;
    this.byId.set(order.id, order);
    (order.side === "buy" ? this.bids : this.asks).add(order);
  }

  cancel(orderId: string): EngineOrderState | null {
    const order = this.byId.get(orderId);
    if (!order) return null;
    (order.side === "buy" ? this.bids : this.asks).remove(order);
    this.byId.delete(orderId);
    return { orderId, status: "cancelled", remaining: order.quantity };
  }

  submit(taker: EngineOrder, timestamp: number): MatchResult {
    const trades: EngineTrade[] = [];
    const makerStates = new Map<string, EngineOrderState>();
    const opposite = taker.side === "buy" ? this.asks : this.bids;
    let selfTrade = false;

    while (taker.quantity > 0 && !selfTrade) {
      const level = opposite.bestLevel();
      if (!level) break;
      const crosses = taker.side === "buy" ? level.price <= taker.price : level.price >= taker.price;
      if (!crosses) break;

      for (let i = level.head; i < level.orders.length && taker.quantity > 0; i++) {
        const maker = level.orders[i]!;
        if (maker.quantity <= 0) continue;
        if (maker.userId === taker.userId) {
          selfTrade = true;
          break;
        }
        const qty = roundQty(Math.min(maker.quantity, taker.quantity));
        maker.quantity = roundQty(maker.quantity - qty);
        maker.filledQuantity = roundQty(maker.filledQuantity + qty);
        taker.quantity = roundQty(taker.quantity - qty);
        taker.filledQuantity = roundQty(taker.filledQuantity + qty);
        opposite.reduce(level, qty);

        const buy = taker.side === "buy" ? taker : maker;
        const sell = taker.side === "buy" ? maker : taker;
        trades.push({
          tradeId: this.newTradeId(),
          market: this.market,
          price: level.price,
          quantity: qty,
          buyOrderId: buy.id,
          sellOrderId: sell.id,
          buyerId: buy.userId,
          sellerId: sell.userId,
          takerSide: taker.side,
          timestamp,
        });

        if (maker.quantity <= 0) {
          this.byId.delete(maker.id);
          makerStates.set(maker.id, { orderId: maker.id, status: "filled", remaining: 0 });
        } else {
          makerStates.set(maker.id, { orderId: maker.id, status: "partial", remaining: maker.quantity });
        }
      }
      opposite.compact(level);
    }

    let takerState: EngineOrderState;
    let rested = false;
    if (taker.quantity <= 0) {
      takerState = { orderId: taker.id, status: "filled", remaining: 0 };
    } else if (selfTrade) {
      takerState = {
        orderId: taker.id,
        status: taker.filledQuantity > 0 ? "cancelled" : "rejected",
        remaining: taker.quantity,
        reason: "self_trade_prevented",
      };
    } else if (taker.type === "market") {
      takerState = {
        orderId: taker.id,
        status: taker.filledQuantity > 0 ? "cancelled" : "rejected",
        remaining: taker.quantity,
        reason: taker.filledQuantity > 0 ? "insufficient_liquidity_remainder_cancelled" : "no_liquidity",
      };
    } else {
      this.restore(taker);
      rested = true;
      takerState = {
        orderId: taker.id,
        status: taker.filledQuantity > 0 ? "partial" : "open",
        remaining: taker.quantity,
      };
    }

    return { trades, orders: [takerState, ...makerStates.values()], rested };
  }

  snapshot(depth = 50): { bids: BookLevel[]; asks: BookLevel[] } {
    return { bids: this.bids.snapshot(depth), asks: this.asks.snapshot(depth) };
  }
}
