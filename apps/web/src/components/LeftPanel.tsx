"use client";

import { useEffect, useState } from "react";

interface Level { price: number; quantity: number; }
interface Trade { price: number; quantity: number; side: string; market: string; }
interface OrderbookData { bids: Level[]; asks: Level[]; }

export default function LeftPanel({ market }: { market: string }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  const [orderbook, setOrderbook] = useState<OrderbookData>({ bids: [], asks: [] });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080");

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "ORDERBOOK_UPDATE" && msg.data?.market === market) {
        setOrderbook({
          bids: [...msg.data.bids].sort((a: Level, b: Level) => b.price - a.price).slice(0, 14),
          asks: [...msg.data.asks].sort((a: Level, b: Level) => a.price - b.price).slice(0, 14),
        });
      }

      if (msg.type === "TRADE_CREATED" && msg.data?.market === market) {
        setTrades((prev) => [msg.data, ...prev].slice(0, 60));
      }
    };

    return () => ws.close();
  }, [market]);

  const maxQty = Math.max(
    ...orderbook.bids.map((b) => b.quantity),
    ...orderbook.asks.map((a) => a.quantity),
    1
  );

  const spread =
    orderbook.asks[0] && orderbook.bids[0]
      ? orderbook.asks[0].price - orderbook.bids[0].price
      : null;

  const spreadPct =
    spread && orderbook.bids[0]
      ? ((spread / orderbook.bids[0].price) * 100).toFixed(3)
      : null;

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center border-b border-line px-2 shrink-0">
        {(["book", "trades"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-xs font-semibold capitalize transition-all border-b-2 -mb-px ${
              tab === t
                ? "border-link text-fg"
                : "border-transparent text-muted hover:text-dim"
            }`}
          >
            {t === "book" ? "Order Book" : "Trades"}
          </button>
        ))}
      </div>

      {tab === "book" ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex justify-between px-3 py-1.5 border-b border-line/40 shrink-0">
            <span className="text-xs text-dim">Price</span>
            <span className="text-xs text-dim">Size</span>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col justify-end overflow-hidden">
              {orderbook.asks.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">No asks</p>
              ) : (
                [...orderbook.asks].reverse().map((ask, i) => (
                  <div key={i} className="relative flex justify-between items-center px-3 py-[3px] hover:bg-sell-dim/20 transition-colors duration-100">
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-sell-dim depth-bar"
                      style={{ width: `${(ask.quantity / maxQty) * 85}%` }}
                    />
                    <span className="relative text-xs text-sell font-medium tabular-nums">
                      {ask.price.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                    </span>
                    <span className="relative text-xs text-dim tabular-nums">
                      {ask.quantity.toFixed(4)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="px-3 py-1.5 border-y border-line bg-panel/80 flex items-center justify-between shrink-0 backdrop-blur-sm">
              <span className="text-xs font-bold text-buy tabular-nums ">
                {orderbook.bids[0]
                  ? `$${orderbook.bids[0].price.toLocaleString(undefined, { minimumFractionDigits: 1 })}`
                  : "—"}
              </span>
              {spreadPct && (
                <span className="text-xs text-muted tabular-nums">
                  Spread {spreadPct}%
                </span>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {orderbook.bids.length === 0 ? (
                <p className="text-xs text-muted text-center py-4">No bids</p>
              ) : (
                orderbook.bids.map((bid, i) => (
                  <div key={i} className="relative flex justify-between items-center px-3 py-[3px] hover:bg-buy-dim/20 transition-colors duration-100">
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-buy-dim depth-bar"
                      style={{ width: `${(bid.quantity / maxQty) * 85}%` }}
                    />
                    <span className="relative text-xs text-buy font-medium tabular-nums">
                      {bid.price.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                    </span>
                    <span className="relative text-xs text-dim tabular-nums">
                      {bid.quantity.toFixed(4)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex justify-between px-3 py-1.5 border-b border-line/40 shrink-0">
            <span className="text-xs text-dim">Price</span>
            <span className="text-xs text-dim">Size</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {trades.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">
                Waiting for trades...
              </p>
            ) : (
              trades.map((t, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center px-3 py-[3px] hover:bg-panel/40"
                >
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      t.side === "buy" ? "text-buy" : "text-sell"
                    }`}
                  >
                    {Number(t.price).toLocaleString(undefined, { minimumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs text-dim tabular-nums">
                    {Number(t.quantity).toFixed(4)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
