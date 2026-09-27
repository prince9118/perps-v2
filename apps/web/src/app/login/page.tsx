"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { EMAIL_MAX, PASSWORD_MAX, normalizeEmail, validateEmail, validateLoginPassword } from "@/lib/validation";
import { useAuthStore } from "@/store/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GuestLogin } from "@/components/auth/GuestLogin";
import { Field, PasswordField } from "@/components/ui/Field";

const DEFAULT_REDIRECT = "/trade/BTC-PERP";

function safeRedirect(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : DEFAULT_REDIRECT;
}

type FieldName = "email" | "password";

function LoginForm() {
  const router = useRouter();
  const redirectTo = safeRedirect(useSearchParams().get("next"));
  const setUser = useAuthStore((s) => s.setUser);
  const isLoggedIn = useAuthStore((s) => !!s.user);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({ email: false, password: false });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoggedIn) router.replace(redirectTo);
  }, [isLoggedIn, redirectTo, router]);

  const errors: Record<FieldName, string | null> = {
    email: validateEmail(email),
    password: validateLoginPassword(password),
  };
  const shown = (field: FieldName) => (touched[field] ? errors[field] : null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setTouched({ email: true, password: true });
    setFormError(null);
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();

    setSubmitting(true);
    try {
      const res = await authApi.login(normalizeEmail(email), password);
      setUser(res.data.user, res.data.token);
      router.replace(redirectTo);
    } catch (err) {
      const message = apiErrorMessage(err, "Incorrect email or password.");
      setFormError(/invalid credentials/i.test(message) ? "Incorrect email or password." : message);
      passwordRef.current?.select();
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[32px] font-medium leading-none tracking-[-0.03em] text-fg">Welcome Back</h1>
        <p className="mt-3 text-[15px] leading-[1.4] text-dim">Sign in to continue trading.</p>
      </header>

      <form noValidate onSubmit={handleSubmit} aria-busy={submitting} className="flex flex-col gap-5">
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-sell/25 bg-sell-dim px-4 py-3 text-sm text-fg"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-sell" />
            {formError}
          </div>
        )}

        <Field
          ref={emailRef}
          label="Email"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          maxLength={EMAIL_MAX}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
          onBlur={() => email && setTouched((t) => ({ ...t, email: true }))}
          error={shown("email")}
          disabled={submitting}
        />

        <PasswordField
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX}
          placeholder="Your password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
          onBlur={() => password && setTouched((t) => ({ ...t, password: true }))}
          error={shown("password")}
          disabled={submitting}
        />

        <button
          type="submit"
          disabled={submitting}
          className="group mt-2 flex h-12 items-center justify-center gap-2 rounded-lg bg-accent text-[15px] font-semibold text-white
             transition-[background-color,transform] duration-150
            hover:bg-accent-hover active:scale-[0.99]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-2 focus-visible:ring-offset-bg
            disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Sign In
              <ArrowRight aria-hidden className="size-4 transition-transform duration-100 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6">
        <GuestLogin redirectTo={redirectTo} disabled={submitting} />
      </div>

      <p className="mt-8 text-center text-sm text-dim">
        New to Perps?{" "}
        <Link
          href={redirectTo === DEFAULT_REDIRECT ? "/signup" : `/signup?next=${encodeURIComponent(redirectTo)}`}
          className="rounded font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
