"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      setUser(res.data.user, res.data.token);
      router.push("/trade/BTC-PERP");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-[0_0_20px_rgba(92,115,242,0.5)]">
            <span className="text-white text-sm font-black">P</span>
          </div>
          <span className="text-white font-bold text-lg tracking-widest">PERPS</span>
        </div>

        <div className="bg-card border border-line rounded-xl p-8">
          <h1 className="text-base font-bold text-[#e2e5f5] mb-1">Welcome back</h1>
          <p className="text-[11px] text-muted mb-6">Sign in to your trading account</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-panel border border-line rounded-lg px-3 py-2.5 text-sm text-[#e2e5f5] placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-panel border border-line rounded-lg px-3 py-2.5 text-sm text-[#e2e5f5] placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="text-[11px] text-sell bg-sell-dim border border-sell/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-accent hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-sm transition-all mt-2 shadow-[0_2px_20px_rgba(92,115,242,0.25)]"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-muted mt-5">
          No account?{" "}
          <Link href="/signup" className="text-accent hover:text-[#e2e5f5] transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
