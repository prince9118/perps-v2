"use client";

import { useEffect, useRef } from "react";

const SYMBOL_MAP: Record<string, string> = {
  "BTC-PERP": "BINANCE:BTCUSDT",
  "ETH-PERP": "BINANCE:ETHUSDT",
  "SOL-PERP": "BINANCE:SOLUSDT",
};

export default function Chart({ market }: { market: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: SYMBOL_MAP[market] ?? "BINANCE:BTCUSDT",
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
    });

    containerRef.current.appendChild(script);
  }, [market]);

  return (
    <div className="tradingview-widget-container w-full h-full">
      <div ref={containerRef} className="tradingview-widget-container__widget w-full h-full" />
    </div>
  );
}
