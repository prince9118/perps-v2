"use client";

import { useQuery } from "@tanstack/react-query";
import { marketApi } from "@/lib/api";

export default function PriceBar({ market }: { market: string }) {
  const { data } = useQuery({
    queryKey: ["price", market],
    queryFn: () => marketApi.getPrice(market),
    refetchInterval: 3000,
    retry: false,
  });

  const price: number | null = data?.data?.price ?? null;

  return (
    <div className="h-10 border-b border-gray-800 flex items-center px-4 gap-8 shrink-0 bg-gray-950">
      <span className="text-sm font-semibold text-white">{market}</span>

      <div className="flex flex-col">
        <span className="text-xs text-gray-500 leading-none">Mark Price</span>
        <span className="text-sm font-bold text-white">
          {price ? `$${price.toLocaleString()}` : "—"}
        </span>
      </div>
    </div>
  );
}
