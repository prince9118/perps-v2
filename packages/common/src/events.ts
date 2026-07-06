export const STREAMS = {
  ORDER_EVENTS: "order_events",
  ENGINE_EVENTS: "engine_events",
  TRADE_EVENTS: "trade_events",
  ORDERBOOK_EVENTS: "orderbook_events",
  LIQUIDATION_EVENTS: "liquidation_events",
} as const;

export const GROUPS = {
  ENGINE: "engine",
  DB_WORKER: "db-worker",
} as const;

export const EVENT_TYPES = {
  ORDER_CREATE: "ORDER_CREATE",
  ORDER_CANCEL: "ORDER_CANCEL",
  ORDER_RESULT: "ORDER_RESULT",
  TRADE_CREATED: "TRADE_CREATED",
  ORDERBOOK_UPDATE: "ORDERBOOK_UPDATE",
  POSITION_LIQUIDATED: "POSITION_LIQUIDATED",
} as const;

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus = "open" | "partial" | "filled" | "cancelled" | "rejected";

export interface OrderCreateEvent {
  orderId: string;
  userId: string;
  market: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  quantity: number;
  timestamp: number;
}

export interface OrderCancelEvent {
  orderId: string;
  userId: string;
  market: string;
  timestamp: number;
}

export interface EngineTrade {
  tradeId: string;
  market: string;
  price: number;
  quantity: number;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  takerSide: OrderSide;
  timestamp: number;
}

export interface EngineOrderState {
  orderId: string;
  status: OrderStatus;
  remaining: number;
  reason?: string;
}

export interface EngineResult {
  eventId: string;
  engineSeq: string;
  action: "create" | "cancel";
  market: string;
  orderId: string;
  accepted: boolean;
  reason?: string;
  trades: EngineTrade[];
  orders: EngineOrderState[];
  timestamp: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
}

export interface OrderbookSnapshot {
  market: string;
  bids: BookLevel[];
  asks: BookLevel[];
  timestamp: number;
}

export function engineSeqFromStreamId(id: string): string {
  const [ms = "0", seq = "0"] = id.split("-");
  return `${ms.padStart(15, "0")}-${seq.padStart(8, "0")}`;
}
