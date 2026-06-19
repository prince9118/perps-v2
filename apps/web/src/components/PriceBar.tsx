"use client";

import { useQuery } from "@tanstack/react-query";
import { marketApi } from "@/lib/api";


function Stat({
  label,
  value,
  valueClass = "text-[#e2e5f5]",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col justify-center">
      <span className="text-[10px] text-muted font-medium uppercase tracking-widest leading-none mb-1">
        {label}
      </span>
      <span className={`text-xs font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

export default function PriceBar({ market }: { market: string }) {
  const { data: priceData } = useQuery({
    queryKey: ["price", market],
    queryFn: () => marketApi.getPrice(market),
    refetchInterval: 3000,
    retry: false,
  });

  const { data: fundingData } = useQuery({
    queryKey: ["funding"],
    queryFn: () => marketApi.getFundingRate(),
    refetchInterval: 30000,
    retry: false,
  });

  const { data: insuranceData } = useQuery({
    queryKey: ["insurance-fund"],
    queryFn: () => marketApi.getInsuranceFund(),
    refetchInterval: 60000,
    retry: false,
  });

  const price: number | null = priceData?.data?.price ?? null;
  const funding: number | null = fundingData?.data?.rates?.[0]?.rate ?? null;
  const insuranceFund: number | null = insuranceData?.data?.funds?.[0]?.balance ?? null;

  return (
    <div className="h-11 border-b border-line flex items-center px-5 gap-6 shrink-0 bg-card">
      <div className="flex items-baseline gap-3 shrink-0">
        <span className="text-[10px] font-medium text-muted tracking-widest uppercase">{market}</span>
        <span className="text-base font-bold text-[#e2e5f5] tabular-nums">
          {price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
        </span>
      </div>

      <div className="w-px h-5 bg-line" />

      <Stat label="Mark Price" value={price ? `$${price.toLocaleString()}` : "—"} />
      <Stat label="Index Price" value={price ? `$${price.toLocaleString()}` : "—"} />
      <Stat
        label="Funding / 8h"
        value={funding != null ? `${(funding * 100).toFixed(4)}%` : "0.0100%"}
        valueClass={funding != null && funding < 0 ? "text-sell" : "text-buy"}
      />
      <Stat label="Open Interest" value="—" />
      <Stat label="24h Volume" value="—" />
      <Stat
        label="Insurance Fund"
        value={insuranceFund != null ? `$${insuranceFund.toLocaleString()}` : "—"}
      />
    </div>
  );
}
