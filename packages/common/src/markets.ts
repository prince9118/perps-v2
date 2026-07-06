export const MARKET_IDS = ["BTC-PERP", "ETH-PERP", "SOL-PERP"] as const;

export type MarketId = (typeof MARKET_IDS)[number];

export interface MarketConfig {
  market: MarketId;
  symbol: string;
  baseAsset: string;
  qtyStep: number;
  priceTick: number;
  maxQuantity: number;
}

export const MARKETS: readonly MarketConfig[] = [
  { market: "BTC-PERP", symbol: "BTCUSDT", baseAsset: "BTC", qtyStep: 0.0001, priceTick: 0.01, maxQuantity: 1_000 },
  { market: "ETH-PERP", symbol: "ETHUSDT", baseAsset: "ETH", qtyStep: 0.0001, priceTick: 0.01, maxQuantity: 10_000 },
  { market: "SOL-PERP", symbol: "SOLUSDT", baseAsset: "SOL", qtyStep: 0.0001, priceTick: 0.01, maxQuantity: 1_000_000 },
];

export function isMarketId(value: unknown): value is MarketId {
  return typeof value === "string" && (MARKET_IDS as readonly string[]).includes(value);
}

export function getMarket(market: string): MarketConfig | undefined {
  return MARKETS.find((m) => m.market === market);
}

export const MAX_PRICE = 10_000_000;
export const MAX_LEVERAGE = 50;
export const FEE_RATE = 0.0005;
export const MAINTENANCE_MARGIN_RATE = 0.005;
export const MARKET_ORDER_SLIPPAGE = 0.05;
export const LIQUIDATION_SLIPPAGE = 0.1;
export const MAX_OPEN_ORDERS_PER_USER = 200;
export const PRICE_MAX_AGE_MS = Number(process.env.PRICE_MAX_AGE_MS ?? 30_000);
