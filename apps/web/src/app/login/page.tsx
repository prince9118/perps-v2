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
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md animate-fade-in">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-[0_0_24px_rgba(92,115,242,0.45)]">
            <span className="text-white text-base font-black">P</span>
          </div>
          <span className="text-white font-bold text-2xl tracking-widest">Perps</span>
        </div>

        <div className="bg-card border border-line rounded-2xl p-10">

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Sign In</h1>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-dim">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-panel border border-line rounded-xl px-4 py-3.5 text-base text-[#e2e5f5] placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="email@gmail.com"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-dim">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-panel border border-line rounded-xl px-4 py-3.5 text-base text-[#e2e5f5] placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-sell bg-sell-dim border border-sell/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-accent hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl text-base transition-all mt-1 shadow-[0_4px_20px_rgba(92,115,242,0.3)] hover:shadow-[0_6px_28px_rgba(92,115,242,0.45)]"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

          </form>
        </div>

        <p className="text-center text-sm text-muted mt-6">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-accent hover:brightness-125 font-semibold transition-all"
          >
            Create one free
          </Link>
        </p>

      </div>
    </div>
  );
}
