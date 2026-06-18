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

export default function Navbar({ activeMarket }: { activeMarket?: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const FALLBACK_MARKETS: Market[] = [
    { market: "BTC-PERP", symbol: "BTCUSDT", baseAsset: "BTC" },
    { market: "ETH-PERP", symbol: "ETHUSDT", baseAsset: "ETH" },
    { market: "SOL-PERP", symbol: "SOLUSDT", baseAsset: "SOL" },
  ];

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
    <nav className="h-12 border-b border-gray-800 flex items-center px-4 gap-6 shrink-0">
      <span className="text-blue-400 font-bold text-sm tracking-wider">
        EXCHANGE
      </span>

      <div className="flex gap-1">
        {markets.map((m) => (
          <Link
            key={m.market}
            href={`/trade/${m.market}`}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              activeMarket === m.market
                ? "bg-gray-800 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {m.market}
          </Link>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm text-gray-400">
              Balance:{" "}
              <span className="text-white font-medium">
                ${user.balance.toLocaleString()}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <Link href="/login" className="text-sm text-blue-400 hover:text-blue-300">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
