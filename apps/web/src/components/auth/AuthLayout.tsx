"use client";

import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { Activity, Gauge, ShieldCheck } from "lucide-react";
import { marketApi } from "@/lib/api";
import { Logo } from "@/components/brand/Logo";

const MARKETS = [
  { market: "BTC-PERP", base: "BTC" },
  { market: "ETH-PERP", base: "ETH" },
  { market: "SOL-PERP", base: "SOL" },
];

const FEATURES = [
  { icon: Gauge, title: "Up to 50× Leverage", body: "Go long or short on BTC, ETH, and SOL." },
  { icon: Activity, title: "Live Order Book", body: "Every order and trade streams in real time." },
  { icon: ShieldCheck, title: "Built-In Risk Engine", body: "Margin, funding, and liquidations run automatically." },
];

function LivePrices() {
  const results = useQueries({
    queries: MARKETS.map(({ market }) => ({
      queryKey: ["price", market],
      queryFn: () => marketApi.getPrice(market),
      refetchInterval: 3000,
      retry: false,
    })),
  });

  return (
    <ul className="grid grid-cols-3 border-y border-line" aria-label="Live index prices">
      {MARKETS.map(({ market, base }, i) => {
        const query = results[i]!;
        const price: number | undefined = query.data?.data?.price || undefined;
        return (
          <li key={market} className={`flex flex-col gap-2 py-5 ${i > 0 ? "border-l border-line pl-5" : ""}`}>
            <span className="flex items-center gap-2 font-mono text-xs font-light text-dim">
              {base}-PERP
              {price && <span aria-hidden className="size-1.5 rounded-full bg-buy animate-pulse-dot" />}
            </span>
            <span className="h-6 font-mono text-base font-medium tabular-nums text-fg">
              {query.isLoading ? (
                <span className="block h-5 w-20 animate-pulse rounded bg-raise" aria-label="Loading price" />
              ) : price ? (
                `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              ) : (
                <span className="text-dim">—</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 overflow-y-auto">
      <main className="flex min-w-0 flex-1 basis-0 flex-col px-5 py-8 sm:px-12 sm:py-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px] animate-slide-up">{children}</div>
        </div>
      </main>

      <aside className="hidden min-w-0 flex-1 basis-0 flex-col justify-between border-l border-line bg-card px-12 py-10 lg:flex">
        <span aria-hidden />

        <div className="flex w-full max-w-[560px] flex-col gap-12">
          <div className="flex flex-col gap-5">
            <p className="font-mono text-xs font-light text-link">Perpetual Futures</p>
            <h2 className="text-[44px] font-medium leading-none tracking-[-0.03em] text-fg text-balance">
              Trade Perpetuals on a Real Matching Engine
            </h2>
            <p className="max-w-md text-base leading-[1.4] text-dim">
              Every account starts with $10,000 in test funds. No wallet, no deposit.
            </p>
          </div>

          <ul className="flex flex-col gap-6">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-raise text-fg">
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[15px] font-medium text-fg">{title}</p>
                  <p className="text-sm leading-[1.4] text-dim">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <LivePrices />
        </div>

        <p className="font-mono text-xs font-light text-subtle">Index prices from Binance, refreshed every 3s.</p>
      </aside>
    </div>
  );
}
