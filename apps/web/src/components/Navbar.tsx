"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
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
    <nav className="h-12 border-b border-line flex items-center px-5 gap-6 shrink-0 sticky top-0 z-50 bg-bg">
      <Logo size="sm" />

      <div className="w-px h-5 bg-line" />

      <div
        className="flex items-center gap-1.5 cursor-default"
        title={isOnline ? "All systems operational" : "Checking backend..."}
      >
      </div>

      <div className="w-px h-5 bg-line" />

      <div className="flex gap-0.5">
        {markets.map((m) => (
          <Link
            key={m.market}
            href={`/trade/${m.market}`}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
              activeMarket === m.market
                ? "bg-accent-dim text-white border border-link "
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
            <div className="flex items-center gap-3 bg-panel/60 px-3 py-1.5 rounded-lg border border-line/60 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white">Available</span>
                <span className="text-xs text-white font-semibold tabular-nums">
                  ${user.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {user.lockedBalance > 0 && (
                <>
                  <div className="w-px h-3.5 bg-line" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    <span className="text-xs text-muted">Locked</span>
                    <span className="text-xs text-yellow-400 font-semibold tabular-nums">
                      ${user.lockedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-muted hover:text-sell transition-colors duration-150 px-3 py-1.5 rounded-md border border-line hover:border-sell/30"
            >
              Logout
            </button>
          </>
        ) : (
          <Link
            href="/login"
            className="text-xs text-link hover:text-white transition-all duration-150 bg-accent-dim hover:bg-accent/20 px-3 py-1.5 rounded-md border border-link hover:border-link"
          >
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
