"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { positionApi, orderApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useState } from "react";

interface Position {
  id: string;
  market: string;
  side: string;
  quantity: number;
  entryPrice: number;
  leverage: number;
  margin: number;
  markPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number;
}

interface Order {
  id: string;
  market: string;
  side: string;
  type: string;
  price: number | null;
  quantity: number;
  leverage: number;
  status: string;
  createdAt?: string;
}

interface PositionHistory {
  id: string;
  market: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  leverage: number;
  margin: number;
  pnl: number;
  reason: string;
  createdAt: string;
}

type Tab = "positions" | "orders" | "history";

export default function Positions({ market }: { market: string }) {
  const [tab, setTab] = useState<Tab>("positions");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const { data: posData } = useQuery({
    queryKey: ["positions"],
    queryFn: () => positionApi.getPositions(),
    refetchInterval: 5000,
    retry: false,
    enabled: !!user,
  });

  const { data: orderData } = useQuery({
    queryKey: ["orders"],
    queryFn: () => orderApi.getOrders(),
    refetchInterval: 3000,
    retry: false,
    enabled: !!user && tab === "orders",
  });

  const { data: historyData } = useQuery({
    queryKey: ["position-history"],
    queryFn: () => positionApi.getHistory(),
    retry: false,
    enabled: !!user && tab === "history",
  });

  const { mutate: closePosition } = useMutation({
    mutationFn: (id: string) => positionApi.closePosition(id),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      const token = localStorage.getItem("token");
      if (token) {
        const res = await authApi.me();
        if (res.data.user) setUser(res.data.user, token);
      }
    },
  });

  const { mutate: cancelOrder } = useMutation({
    mutationFn: (id: string) => orderApi.cancelOrder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });

  const positions: Position[] = posData?.data?.positions ?? [];
  const allOrders: Order[] = orderData?.data?.orders ?? [];
  const openOrders = allOrders.filter((o) => o.status === "open" || o.status === "partial");
  const positionHistory: PositionHistory[] = historyData?.data?.history ?? [];

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "positions", label: "Positions", count: positions.length },
    { key: "orders", label: "Open Orders", count: openOrders.length },
    { key: "history", label: "Trade History" },
  ];

  return (
    <div className="h-full flex flex-col bg-card border-t border-line">
      <div className="flex items-center gap-0 px-2 border-b border-line shrink-0">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2.5 text-[11px] font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
              tab === key
                ? "border-accent text-[#e2e5f5]"
                : "border-transparent text-muted hover:text-dim"
            }`}
          >
            {label}
            {count !== undefined && (
              <span className={`ml-1.5 text-[10px] ${tab === key ? "text-dim" : "text-muted"}`}>
                ({count})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Positions tab */}
        {tab === "positions" && (
          positions.length === 0 ? (
            <Empty text="No open positions" />
          ) : (
            <table className="w-full text-[11px]">
              <Thead cols={["Market", "Side", "Size", "Entry", "Mark", "Liq.", "Lev.", "Margin", "PnL", ""]} />
              <tbody>
                {positions.map((p) => {
                  const pnlPos = p.unrealizedPnl >= 0;
                  return (
                    <tr key={p.id} className="border-b border-line/40 hover:bg-panel/30 transition-colors">
                      <td className="px-4 py-2.5 text-[#e2e5f5] font-semibold">{p.market}</td>
                      <td className={`px-4 py-2.5 font-bold ${p.side === "long" ? "text-buy" : "text-sell"}`}>
                        {p.side.toUpperCase()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">{p.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">${p.entryPrice.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-[#e2e5f5] tabular-nums">${p.markPrice.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-yellow-400 tabular-nums">${p.liquidationPrice.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">{p.leverage}×</td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">${p.margin.toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${pnlPos ? "text-buy" : "text-sell"}`}>
                        {pnlPos ? "+" : ""}${p.unrealizedPnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => closePosition(p.id)}
                          className="text-[10px] font-semibold text-muted hover:text-sell border border-line hover:border-sell/40 px-2 py-0.5 rounded transition-all"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {/* Open Orders tab */}
        {tab === "orders" && (
          openOrders.length === 0 ? (
            <Empty text="No open orders" />
          ) : (
            <table className="w-full text-[11px]">
              <Thead cols={["Market", "Side", "Type", "Price", "Size", "Lev.", "Status", ""]} />
              <tbody>
                {openOrders.map((o) => (
                  <tr key={o.id} className="border-b border-line/40 hover:bg-panel/30 transition-colors">
                    <td className="px-4 py-2.5 text-[#e2e5f5] font-semibold">{o.market}</td>
                    <td className={`px-4 py-2.5 font-bold ${o.side === "buy" ? "text-buy" : "text-sell"}`}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="px-4 py-2.5 text-dim capitalize">{o.type}</td>
                    <td className="px-4 py-2.5 text-right text-[#e2e5f5] tabular-nums">
                      {o.price ? `$${o.price.toLocaleString()}` : "Market"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-dim tabular-nums">{o.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-dim tabular-nums">{o.leverage}×</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-[10px] font-semibold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded capitalize">
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => cancelOrder(o.id)}
                        className="text-[10px] font-semibold text-muted hover:text-sell border border-line hover:border-sell/40 px-2 py-0.5 rounded transition-all"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* Trade History tab */}
        {tab === "history" && (
          positionHistory.length === 0 ? (
            <Empty text="No closed positions yet" />
          ) : (
            <table className="w-full text-[11px]">
              <Thead cols={["Market", "Side", "Size", "Entry", "Exit", "Lev.", "Margin", "Realized PnL", "Reason"]} />
              <tbody>
                {positionHistory.map((h) => {
                  const pnlPos = h.pnl >= 0;
                  return (
                    <tr key={h.id} className="border-b border-line/40 hover:bg-panel/30 transition-colors">
                      <td className="px-4 py-2.5 text-[#e2e5f5] font-semibold">{h.market}</td>
                      <td className={`px-4 py-2.5 font-bold ${h.side === "long" ? "text-buy" : "text-sell"}`}>
                        {h.side.toUpperCase()}
                      </td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">{h.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">${h.entryPrice.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-[#e2e5f5] tabular-nums">${h.exitPrice.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">{h.leverage}×</td>
                      <td className="px-4 py-2.5 text-right text-dim tabular-nums">${h.margin.toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${pnlPos ? "text-buy" : "text-sell"}`}>
                        {pnlPos ? "+" : ""}${h.pnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-[10px] text-muted capitalize">{h.reason}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

function Thead({ cols }: { cols: string[] }) {
  return (
    <thead className="sticky top-0 bg-card z-10">
      <tr className="border-b border-line">
        {cols.map((h, i) => (
          <th
            key={i}
            className={`px-4 py-2 font-medium text-[10px] text-muted uppercase tracking-widest ${
              i > 1 ? "text-right" : "text-left"
            }`}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-[11px] text-muted">{text}</span>
    </div>
  );
}
