"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import {
  EMAIL_MAX,
  PASSWORD_MAX,
  normalizeEmail,
  validateEmail,
  validateNewPassword,
} from "@/lib/validation";
import { useAuthStore } from "@/store/auth";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { GuestLogin } from "@/components/auth/GuestLogin";
import { Field, PasswordField } from "@/components/ui/Field";

const DEFAULT_REDIRECT = "/trade/BTC-PERP";

function safeRedirect(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : DEFAULT_REDIRECT;
}

type FieldName = "email" | "password";

function SignupForm() {
  const router = useRouter();
  const redirectTo = safeRedirect(useSearchParams().get("next"));
  const setUser = useAuthStore((s) => s.setUser);
  const isLoggedIn = useAuthStore((s) => !!s.user);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({ email: false, password: false });
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLoggedIn) router.replace(redirectTo);
  }, [isLoggedIn, redirectTo, router]);

  const errors: Record<FieldName, string | null> = {
    email: validateEmail(email),
    password: validateNewPassword(password),
  };
  const emailError = serverErrors.email ?? (touched.email ? errors.email : null);
  const passwordError = serverErrors.password ?? (touched.password ? errors.password : null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setTouched({ email: true, password: true });
    setFormError(null);
    setServerErrors({});
    if (errors.email) return emailRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();

    setSubmitting(true);
    try {
      const res = await authApi.signup(normalizeEmail(email), password);
      setUser(res.data.user, res.data.token);
      router.replace(redirectTo);
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const fieldErrors = isAxiosError(err)
        ? (err.response?.data as { errors?: { path?: string; message?: string }[] } | undefined)?.errors
        : undefined;

      if (status === 409) {
        setServerErrors({ email: "An account with this email already exists." });
        emailRef.current?.focus();
      } else if (status === 400 && fieldErrors?.length) {
        const next: Partial<Record<FieldName, string>> = {};
        for (const { path, message } of fieldErrors) {
          if ((path === "email" || path === "password") && message && !next[path]) next[path] = message;
        }
        if (Object.keys(next).length) {
          setServerErrors(next);
          (next.email ? emailRef : passwordRef).current?.focus();
        } else {
          setFormError(apiErrorMessage(err, "We couldn't create your account. Try again."));
        }
      } else {
        setFormError(apiErrorMessage(err, "We couldn't create your account. Try again."));
      }
      setSubmitting(false);
    }
  }

  const signInHref = redirectTo === DEFAULT_REDIRECT ? "/login" : `/login?next=${encodeURIComponent(redirectTo)}`;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[32px] font-medium leading-none tracking-[-0.03em] text-fg">Create Your Account</h1>
        <p className="mt-3 text-[15px] leading-[1.4] text-dim">Start trading with $10,000 in test funds.</p>
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
          onChange={(e) => {
            setEmail(e.target.value);
            setFormError(null);
            setServerErrors((s) => ({ ...s, email: undefined }));
          }}
          onBlur={() => email && setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
          disabled={submitting}
        />
        {serverErrors.email && (
          <p className="-mt-3 text-[13px] leading-5 text-dim">
            <Link
              href={signInHref}
              className="rounded font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
            >
              Sign in instead
            </Link>
          </p>
        )}

        <PasswordField
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          placeholder="Create a password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFormError(null);
            setServerErrors((s) => ({ ...s, password: undefined }));
          }}
          onBlur={() => password && setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
          hint="At least 8 characters, with upper and lowercase letters, a number, and a symbol."
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
              Creating account…
            </>
          ) : (
            <>
              Create Account
              <ArrowRight aria-hidden className="size-4 transition-transform duration-100 group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6">
        <GuestLogin redirectTo={redirectTo} disabled={submitting} />
      </div>

      <p className="mt-8 text-center text-sm text-dim">
        Already have an account?{" "}
        <Link
          href={signInHref}
          className="rounded font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function SignupPage() {
  return (
    <AuthLayout>
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  );
}
