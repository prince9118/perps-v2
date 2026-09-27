"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserRound } from "lucide-react";
import { authApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/store/auth";

export function GuestLogin({ redirectTo, disabled = false }: { redirectTo: string; disabled?: boolean }) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueAsGuest() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.guest();
      setUser(res.data.user, res.data.token);
      router.replace(redirectTo);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't start a guest session. Try again."));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm text-dim" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={continueAsGuest}
        disabled={disabled || loading}
        aria-busy={loading}
        className="flex h-12 items-center justify-center gap-2 rounded-lg border border-line-strong bg-panel text-[15px] font-medium text-fg
          transition-[background-color,border-color,transform] duration-150
          hover:border-gray-50 hover:bg-raise active:scale-[0.99]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-2 focus-visible:ring-offset-bg
          disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <UserRound aria-hidden className="size-4" />
        )}
        {loading ? "Starting guest session…" : "Continue as Guest"}
      </button>

      {error ? (
        <p role="alert" className="text-center text-[13px] leading-5 text-sell">
          {error}
        </p>
      ) : (
        <p className="text-center text-[13px] leading-5 text-dim">No sign-up needed. You get $10,000 in test funds.</p>
      )}
    </div>
  );
}
