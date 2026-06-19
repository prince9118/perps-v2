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

  const markets: Market[] = data?.data?.markets ?? FALLBACK_MARKETS;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <nav className="h-12 border-b border-line flex items-center px-5 gap-6 shrink-0 bg-card">
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center shadow-[0_0_12px_rgba(92,115,242,0.5)]">
          <span className="text-white text-[10px] font-black tracking-tight">P</span>
        </div>
        <span className="text-white font-bold text-sm tracking-widest">PERPS</span>
      </Link>

      <div className="w-px h-5 bg-line" />

      <div className="flex gap-0.5">
        {markets.map((m) => (
          <Link
            key={m.market}
            href={`/trade/${m.market}`}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeMarket === m.market
                ? "bg-panel text-white shadow-inner"
                : "text-dim hover:text-white hover:bg-panel/60"
            }`}
          >
            {m.baseAsset}
            <span className="text-muted font-normal ml-0.5">PERP</span>
          </Link>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {user ? (
          <>
            <div className="flex items-center gap-3 bg-panel px-3 py-1.5 rounded-lg border border-line">
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
              className="text-[11px] text-muted hover:text-white transition-colors px-3 py-1.5 rounded-md border border-line hover:border-line/80"
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="text-[11px] text-accent hover:text-white transition-colors bg-accent-dim px-3 py-1.5 rounded-md border border-accent/20"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
