"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  trailing?: ReactNode;
  labelAction?: ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, trailing, labelAction, className = "", ...input },
  ref
) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {labelAction}
      </div>

      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`peer h-12 w-full rounded-lg border bg-panel px-4 text-[15px] text-fg placeholder:text-subtle
            transition-[border-color,box-shadow] duration-100 ease-out
            focus:outline-none focus-visible:ring-4
            disabled:cursor-not-allowed disabled:opacity-60
            ${trailing ? "pr-12" : ""}
            ${error
              ? "border-sell/70 focus-visible:border-sell focus-visible:ring-sell/15"
              : "border-line hover:border-line-strong focus-visible:border-link focus-visible:ring-link/20"}
            ${className}`}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-[13px] leading-5 text-sell">
          <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <div id={hintId} className="text-[13px] leading-5 text-dim">
          {hint}
        </div>
      ) : null}
    </div>
  );
});

interface PasswordFieldProps extends Omit<FieldProps, "type" | "trailing"> {
  showCapsLockWarning?: boolean;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { showCapsLockWarning = true, hint, onKeyUp, onKeyDown, onBlur, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  function trackCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState("CapsLock"));
  }

  return (
    <Field
      ref={ref}
      type={visible ? "text" : "password"}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      onKeyDown={(e) => { trackCapsLock(e); onKeyDown?.(e); }}
      onKeyUp={(e) => { trackCapsLock(e); onKeyUp?.(e); }}
      onBlur={(e) => { setCapsLock(false); onBlur?.(e); }}
      hint={
        showCapsLockWarning && capsLock ? (
          <span className="text-warn">Caps Lock is on.</span>
        ) : (
          hint
        )
      }
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="flex size-10 items-center justify-center rounded-lg text-dim transition-colors duration-100
            hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
        >
          {visible ? <EyeOff aria-hidden className="size-[18px]" /> : <Eye aria-hidden className="size-[18px]" />}
        </button>
      }
      {...props}
    />
  );
});
