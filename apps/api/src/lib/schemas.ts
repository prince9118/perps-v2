import { z } from "zod";
import { MARKET_IDS, MAX_LEVERAGE } from "@repo/common";

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PASSWORD_RULES: Array<{ label: string; test: (p: string) => boolean }> = [
  { label: `At least ${PASSWORD_MIN} characters`, test: (p) => p.length >= PASSWORD_MIN },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /\d/.test(p) },
  { label: "One symbol (!@#$…)", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function newPasswordError(password: string): string | null {
  if (!password) return "Create a password.";
  if (password.length > PASSWORD_MAX) return `Password can't be longer than ${PASSWORD_MAX} characters.`;
  if (/\s/.test(password)) return "Password can't contain spaces.";
  const missing = PASSWORD_RULES.find((rule) => !rule.test(password));
  return missing ? `Password needs ${missing.label.toLowerCase()}.` : null;
}

const signupEmail = z
  .string({ message: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(EMAIL_MAX, "Email is too long.")
  .refine((v) => v.includes("@"), "Email must include an @.")
  .refine((v) => EMAIL_RE.test(v), "Enter a valid email, like you@example.com.");

export const signupSchema = z.object({
  email: signupEmail,
  password: z.string({ message: "Create a password." }).superRefine((value, ctx) => {
    const error = newPasswordError(value);
    if (error) ctx.addIssue({ code: "custom", message: error });
  }),
});

export const loginSchema = z.object({
  email: z
    .string({ message: "Enter your email address." })
    .trim()
    .toLowerCase()
    .min(1, "Enter your email address.")
    .max(EMAIL_MAX, "Email is too long."),
  password: z
    .string({ message: "Enter your password." })
    .min(1, "Enter your password.")
    .max(PASSWORD_MAX, `Password can't be longer than ${PASSWORD_MAX} characters.`),
});

export const marketSchema = z.enum(MARKET_IDS, { message: "Unsupported market. Use BTC-PERP, ETH-PERP or SOL-PERP." });

export const createOrderSchema = z.object({
  market: marketSchema,
  side: z.enum(["buy", "sell"], { message: "Side must be buy or sell." }),
  type: z.enum(["limit", "market"], { message: "Type must be limit or market." }),
  quantity: z
    .number({ message: "Quantity must be a number." })
    .refine((v) => Number.isFinite(v) && v > 0, "Quantity must be greater than 0."),
  price: z.number({ message: "Price must be a number." }).nullish(),
  leverage: z
    .number({ message: "Leverage must be a number." })
    .int("Leverage must be a whole number.")
    .min(1, "Leverage must be at least 1x.")
    .max(MAX_LEVERAGE, `Leverage can't exceed ${MAX_LEVERAGE}x.`),
});

export const uuidSchema = z.string().uuid("Invalid id.");

export const closePositionSchema = z.object({
  positionId: z.string({ message: "PositionId is required" }).uuid("Invalid position id."),
});

export const fundingQuerySchema = z.object({
  market: marketSchema.optional(),
});
