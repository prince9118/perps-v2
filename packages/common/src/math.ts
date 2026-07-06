import { MAINTENANCE_MARGIN_RATE } from "./markets";

function roundTo(value: number, factor: number): number {
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

export function roundMoney(value: number): number {
  return roundTo(value, 1e6);
}

export function roundQty(value: number): number {
  return roundTo(value, 1e8);
}

export function roundPrice(value: number): number {
  return roundTo(value, 1e2);
}

export function isMultipleOf(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

export type PositionSide = "long" | "short";

export interface PositionLike {
  side: string;
  quantity: number;
  entryPrice: number;
  margin: number;
}

export function unrealizedPnl(position: PositionLike, markPrice: number): number {
  const diff = position.side === "long" ? markPrice - position.entryPrice : position.entryPrice - markPrice;
  return roundMoney(diff * position.quantity);
}

export function liquidationPrice(position: PositionLike, mmr = MAINTENANCE_MARGIN_RATE): number {
  const { quantity, entryPrice, margin } = position;
  if (quantity <= 0) return 0;
  const price =
    position.side === "long"
      ? (entryPrice * quantity - margin) / (quantity * (1 - mmr))
      : (entryPrice * quantity + margin) / (quantity * (1 + mmr));
  return Math.max(0, roundPrice(price));
}

export function isLiquidatable(position: PositionLike, markPrice: number, mmr = MAINTENANCE_MARGIN_RATE): boolean {
  const equity = position.margin + unrealizedPnl(position, markPrice);
  return equity <= markPrice * position.quantity * mmr;
}

export function marginRatio(position: PositionLike, markPrice: number): number {
  const equity = position.margin + unrealizedPnl(position, markPrice);
  const notional = markPrice * position.quantity;
  return notional > 0 ? equity / notional : 0;
}
