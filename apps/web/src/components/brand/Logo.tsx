import Link from "next/link";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <rect width="28" height="28" rx="6" fill="var(--color-gray-0)" />
      <rect x="7" y="6" width="5" height="16" rx="1.5" fill="var(--color-base-blue)" />
      <rect x="16" y="10" width="5" height="12" rx="1.5" fill="var(--color-gray-100)" />
    </svg>
  );
}

export function Logo({ size = "md", className = "" }: { size?: "sm" | "md"; className?: string }) {
  const small = size === "sm";
  return (
    <Link
      href="/"
      aria-label="Perps home"
      className={`inline-flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link ${className}`}
    >
      <LogoMark size={small ? 22 : 30} />
      <span className={`font-display font-semibold leading-none tracking-[-0.03em] text-fg ${small ? "text-lg" : "text-[22px]"}`}>
        Perps
      </span>
    </Link>
  );
}
