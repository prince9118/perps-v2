"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { orderApi, authApi, marketApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export default function OrderForm({ market }: { market: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState("10");
  const [validationError, setValidationError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const { data: priceData } = useQuery({
    queryKey: ["price", market],
    queryFn: () => marketApi.getPrice(market),
    refetchInterval: 3000,
    retry: false,
  });
  const markPrice: number | null = priceData?.data?.price ?? null;

  const numPrice = Number(price) || 0;
  const numQty = Number(quantity) || 0;
  const numLev = Number(leverage) || 10;
  const balance = user?.balance ?? 0;

  const requiredMargin =
    orderType === "limit" && numPrice && numQty
      ? (numPrice * numQty) / numLev
      : null;

  const estLiqPrice =
    orderType === "limit" && numPrice && numLev
      ? side === "buy"
        ? numPrice * (1 - 0.9 / numLev)
        : numPrice * (1 + 0.9 / numLev)
      : null;

  function fillPercent(pct: number) {
    if (!numPrice || !numLev) return;
    const margin = balance * pct;
    const size = (margin * numLev) / numPrice;
    setQuantity(size.toFixed(4));
  }

  const { 
    mutate, isPending, isError, isSuccess } = useMutation({
    mutationFn: () =>
      orderApi.createOrder({
        market,
        side,
        type: orderType,
        price: numPrice,
        quantity: numQty,
        leverage: numLev,
      }),
    onSuccess: async () => {
      setPrice("");
      setQuantity("");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      const token = localStorage.getItem("token");
      if (token) {
        const res = await authApi.me();
        if (res.data.user) setUser(res.data.user, token);
      }
    },
  });
  const sendToAPI = () => {
    if (!user) { setValidationError("Please log in to place an order."); return; }
    if (numQty <= 0) { setValidationError("Size must be greater than 0."); return; }
    if (orderType === "limit" && numPrice <= 0) { setValidationError("Price must be greater than 0."); return; }
    if (requiredMargin !== null && requiredMargin > balance) {
      setValidationError(`Insufficient balance — need $${requiredMargin.toFixed(2)} margin.`);
      return;
    }
    setValidationError(null);
    mutate();
  };

  const isBuy = side === "buy";
  const baseAsset = market.split("-")[0];

  return (
    <div className="flex flex-col gap-0 bg-card h-full border-l border-line">
      {/* Side toggle */}
      <div className="flex border-b border-line">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 py-3 text-xs font-bold transition-all duration-150 border-b-2 active:scale-[0.98] ${
            isBuy
              ? "border-buy text-buy bg-buy-dim shadow-[inset_0_-2px_12px_rgba(16,185,129,0.08)]"
              : "border-transparent text-muted hover:text-dim hover:bg-panel/40"
          }`}
        >
          Long / Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 py-3 text-xs font-bold transition-all duration-150 border-b-2 active:scale-[0.98] ${
            !isBuy
              ? "border-sell text-sell bg-sell-dim shadow-[inset_0_-2px_12px_rgba(244,63,94,0.08)]"
              : "border-transparent text-muted hover:text-dim hover:bg-panel/40"
          }`}
        >
          Short / Sell
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1">
        {/* Available balance */}
        {user && (
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted uppercase tracking-widest">Available</span>
            <span className="text-[11px] text-[#e2e5f5] font-semibold tabular-nums">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
            </span>
          </div>
        )}

        {/* Order type */}
        <div className="flex rounded-md overflow-hidden border border-line bg-panel">
          {(["limit", "market"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`flex-1 py-1.5 text-[11px] font-semibold capitalize transition-all ${
                orderType === t ? "bg-raise text-[#e2e5f5]" : "text-muted hover:text-dim"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Leverage */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-muted uppercase tracking-widest font-medium">
              Leverage
            </label>
            <span className={`text-xs font-bold tabular-nums ${isBuy ? "text-buy" : "text-sell"}`}>
              {leverage}×
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            className="w-full h-1 rounded-full appearance-none bg-line cursor-pointer accent-accent"
          />
          <div className="flex justify-between">
            {["1×", "10×", "25×", "50×"].map((v) => (
              <button
                key={v}
                onClick={() => setLeverage(v.replace("×", ""))}
                className="text-[9px] text-muted hover:text-dim transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Price */}
        {orderType === "limit" ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-muted uppercase tracking-widest font-medium">
              Price <span className="normal-case">USDT</span>
            </label>
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => {
                const v = e.target.value;
                setPrice(v);
              }}
              className="bg-panel border border-line rounded-lg px-3 py-2 text-xs text-[#e2e5f5] placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors tabular-nums"
              placeholder="0.00"
            />
          </div>
        ) : (
          <div className="flex justify-between items-center bg-panel border border-line rounded-lg px-3 py-2">
            <span className="text-[10px] text-muted uppercase tracking-widest">Est. Fill Price</span>
            <span className="text-xs font-semibold text-[#e2e5f5] tabular-nums">
              {markPrice ? `$${markPrice.toLocaleString()}` : "—"}
            </span>
          </div>
        )}

        {/* Size */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-muted uppercase tracking-widest font-medium">
            Size <span className="normal-case">{baseAsset}</span>
          </label>
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => {
              const v = e.target.value;
              setQuantity(v);
            }}
            className="bg-panel border border-line rounded-lg px-3 py-2 text-xs text-[#e2e5f5] placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors tabular-nums"
            placeholder="0.0000"
          />
          {/* % quick-fill (only when price is set) */}
          {orderType === "limit" && numPrice > 0 && (
            <div className="flex gap-1 mt-0.5">
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <button
                  key={pct}
                  onClick={() => fillPercent(pct)}
                  className="flex-1 py-1 text-[9px] font-semibold text-muted hover:text-dim bg-panel hover:bg-raise border border-line rounded transition-all"
                >
                  {pct * 100}%
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Order details */}
        {(requiredMargin !== null || estLiqPrice !== null) && (
          <div className="rounded-lg border border-line bg-panel p-3 flex flex-col gap-1.5">
            {requiredMargin !== null && (
              <div className="flex justify-between">
                <span className="text-[10px] text-muted">Req. Margin</span>
                <span className="text-[10px] text-[#e2e5f5] tabular-nums font-medium">
                  ${requiredMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {estLiqPrice !== null && (
              <div className="flex justify-between">
                <span className="text-[10px] text-muted">Est. Liq. Price</span>
                <span className="text-[10px] text-yellow-400 tabular-nums font-medium">
                  ${estLiqPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
              </div>
            )}
            {requiredMargin !== null && balance > 0 && (
              <div className="flex justify-between">
                <span className="text-[10px] text-muted">% of Balance</span>
                <span className="text-[10px] text-dim tabular-nums font-medium">
                  {Math.min((requiredMargin / balance) * 100, 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Feedback */}
        {isSuccess && (
          <p className="text-[11px] text-buy bg-buy-dim border border-buy/20 rounded-md px-3 py-1.5">
            Order placed successfully
          </p>
        )}
        {(isError || validationError) && (
          <p className="text-[11px] text-sell bg-sell-dim border border-sell/20 rounded-md px-3 py-1.5">
            {validationError ?? "Failed — check backend connection"}
          </p>
        )}

        {/* Submit */}
        <button
          onClick={() => sendToAPI()}
          disabled={isPending || !quantity}
          className={`py-3 rounded-lg font-bold text-xs text-white transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed mt-auto ${
            isBuy
              ? "bg-buy hover:brightness-110 shadow-[0_4px_24px_rgba(16,185,129,0.3)] hover:shadow-[0_4px_32px_rgba(16,185,129,0.45)]"
              : "bg-sell hover:brightness-110 shadow-[0_4px_24px_rgba(244,63,94,0.3)] hover:shadow-[0_4px_32px_rgba(244,63,94,0.45)]"
          }`}
        >
          {isPending
            ? "Placing..."
            : `${isBuy ? "Long" : "Short"} ${baseAsset}`}
        </button>
      </div>
    </div>
  );
}
