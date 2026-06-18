"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { orderApi } from "@/lib/api";

export default function OrderForm({ market }: { market: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState("10");

  const { mutate, isPending, isError, isSuccess } = useMutation({
    mutationFn: () =>
      orderApi.createOrder({
        market,
        side,
        orderType,
        price: Number(price),
        quantity: Number(quantity),
        leverage: Number(leverage),
      }),
    onSuccess: () => {
      setPrice("");
      setQuantity("");
    },
  });

  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
        Place Order
      </p>

      <div className="flex rounded overflow-hidden border border-gray-800">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 py-1.5 text-sm font-semibold transition-colors ${
            side === "buy" ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 py-1.5 text-sm font-semibold transition-colors ${
            side === "sell" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Short
        </button>
      </div>

      <div className="flex rounded overflow-hidden border border-gray-800">
        {(["limit", "market"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`flex-1 py-1 text-xs font-medium capitalize transition-colors ${
              orderType === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Leverage</label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="1"
            max="50"
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            className="flex-1 accent-blue-500"
          />
          <span className="text-xs text-white w-8 text-right">{leverage}x</span>
        </div>
      </div>

      {orderType === "limit" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Price (USDT)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
            placeholder="0.00"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Quantity</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
          placeholder="0.00"
        />
      </div>

      {isSuccess && (
        <p className="text-green-400 text-xs">Order placed!</p>
      )}
      {isError && (
        <p className="text-red-400 text-xs">Failed — check backend connection</p>
      )}

      <button
        onClick={() => mutate()}
        disabled={isPending || !quantity}
        className={`py-2 rounded font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          side === "buy"
            ? "bg-green-600 hover:bg-green-700 text-white"
            : "bg-red-600 hover:bg-red-700 text-white"
        }`}
      >
        {isPending ? "Placing..." : side === "buy" ? "Long" : "Short"} {market}
      </button>
    </div>
  );
}
