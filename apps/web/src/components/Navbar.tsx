"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { marketApi } from "@/lib/api";

interface Market {
  market: string;
  symbol: string;
  baseAsset: string;
}

const FALLBACK_MARKETS: Market[] = [
  { market: "BTC-PERP", symbol: "BTCUSDT", baseAsset: "BTC" },
  { market: "ETH-PERP", symbol: "ETHUSDT", baseAsset: "ETH" },
  { market: "SOL-PERP", symbol: "SOLUSDT", baseAsset: "SOL" },
];

export default function Navbar({ activeMarket }: { activeMarket?: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { data } = useQuery({
    queryKey: ["markets"],
    queryFn: () => marketApi.getMarkets(),
    retry: false,
  });

  const { data: statusData } = useQuery({
    queryKey: ["backend-status"],
    queryFn: () => marketApi.getBackendStatus(),
    refetchInterval: 30000,
    retry: false,
  });

  const markets: Market[] = data?.data?.markets ?? FALLBACK_MARKETS;
  const isOnline = statusData?.data?.services?.api === "running";

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <nav className="h-12 border-b border-line flex items-center px-5 gap-6 shrink-0 sticky top-0 z-50 glass">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 shrink-0 group">
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center shadow-[0_0_16px_rgba(92,115,242,0.6)] group-hover:shadow-[0_0_22px_rgba(92,115,242,0.8)] transition-shadow">
          <span className="text-white text-[10px] font-black tracking-tight">P</span>
        </div>
        <span className="gradient-text font-bold text-sm tracking-widest">PERPS</span>
      </Link>

      <div className="w-px h-5 bg-line" />

      {/* Backend status */}
      <div
        className="flex items-center gap-1.5 cursor-default"
        title={isOnline ? "All systems operational" : "Checking backend..."}
      >
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            isOnline ? "bg-buy animate-pulse-dot" : "bg-muted"
          }`}
        />
        <span className={`text-[10px] font-medium ${isOnline ? "text-buy" : "text-muted"}`}>
          {isOnline ? "Live" : "—"}
        </span>
      </div>

      <div className="w-px h-5 bg-line" />

      {/* Market links */}
      <div className="flex gap-0.5">
        {markets.map((m) => (
          <Link
            key={m.market}
            href={`/trade/${m.market}`}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
              activeMarket === m.market
                ? "bg-accent-dim text-white border border-accent/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                : "text-dim hover:text-white hover:bg-panel/60"
            }`}
          >
            {m.baseAsset}
            <span className="text-muted font-normal ml-0.5">PERP</span>
          </Link>
        ))}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        {user ? (
          <>
            <div className="flex items-center gap-3 bg-panel/60 px-3 py-1.5 rounded-lg border border-line/60 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-buy shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                <span className="text-[10px] text-muted">Available</span>
                <span className="text-[11px] text-white font-semibold tabular-nums">
                  ${user.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {user.lockedBalance > 0 && (
                <>
                  <div className="w-px h-3.5 bg-line" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span className="text-[10px] text-muted">Locked</span>
                    <span className="text-[11px] text-yellow-400 font-semibold tabular-nums">
                      ${user.lockedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="text-[11px] text-muted hover:text-sell transition-colors duration-150 px-3 py-1.5 rounded-md border border-line hover:border-sell/30"
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="text-[11px] text-accent hover:text-white transition-all duration-150 bg-accent-dim hover:bg-accent/20 px-3 py-1.5 rounded-md border border-accent/20 hover:border-accent/40"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
