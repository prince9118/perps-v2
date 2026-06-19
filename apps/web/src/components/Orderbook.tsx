"use client";

import { useEffect, useRef, useState } from "react";

interface Level {
  price: number;
  quantity: number;
}

interface OrderbookData {
  bids: Level[];
  asks: Level[];
}

export default function Orderbook({ market }: { market: string }) {
  const [orderbook, setOrderbook] = useState<OrderbookData>({ bids: [], asks: [] });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ORDERBOOK_UPDATE" && msg.data.market === market) {
        const bids = [...msg.data.bids].sort((a, b) => b.price - a.price).slice(0, 14);
        const asks = [...msg.data.asks].sort((a, b) => a.price - b.price).slice(0, 14);
        setOrderbook({ bids, asks });
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
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-line">
        <span className="text-[11px] font-semibold text-dim uppercase tracking-widest">
          Order Book
        </span>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-buy shadow-[0_0_6px_rgba(16,185,129,0.7)]" : "bg-muted"}`} />
          <span className={`text-[10px] font-medium ${connected ? "text-buy" : "text-muted"}`}>
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      <div className="flex justify-between px-3 py-1.5 border-b border-line/50">
        <span className="text-[10px] text-muted uppercase tracking-widest">Price</span>
        <span className="text-[10px] text-muted uppercase tracking-widest">Size</span>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col justify-end overflow-hidden">
          {orderbook.asks.length === 0 ? (
            <p className="text-[10px] text-muted text-center py-4">No asks</p>
          ) : (
            [...orderbook.asks].reverse().map((ask, i) => (
              <div key={i} className="relative flex justify-between items-center px-3 py-[3px]">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-sell-dim"
                  style={{ width: `${(ask.quantity / maxQty) * 85}%` }}
                />
                <span className="relative text-[11px] text-sell font-medium tabular-nums">
                  {ask.price.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                </span>
                <span className="relative text-[11px] text-dim tabular-nums">
                  {ask.quantity.toFixed(4)}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="px-3 py-1.5 border-y border-line bg-panel flex items-center justify-between">
          <span className="text-xs font-bold text-[#e2e5f5] tabular-nums">
            {orderbook.bids[0]
              ? `$${orderbook.bids[0].price.toLocaleString(undefined, { minimumFractionDigits: 1 })}`
              : "—"}
          </span>
          {spread !== null && (
            <span className="text-[10px] text-muted tabular-nums">
              {spreadPct}%
            </span>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          {orderbook.bids.length === 0 ? (
            <p className="text-[10px] text-muted text-center py-4">No bids</p>
          ) : (
            orderbook.bids.map((bid, i) => (
              <div key={i} className="relative flex justify-between items-center px-3 py-[3px]">
                <div
                  className="absolute right-0 top-0 bottom-0 bg-buy-dim"
                  style={{ width: `${(bid.quantity / maxQty) * 85}%` }}
                />
                <span className="relative text-[11px] text-buy font-medium tabular-nums">
                  {bid.price.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                </span>
                <span className="relative text-[11px] text-dim tabular-nums">
                  {bid.quantity.toFixed(4)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
