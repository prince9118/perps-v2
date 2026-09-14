export const EMAIL_MAX = 254;
export const PASSWORD_MAX = 72;
export const PASSWORD_MIN = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(raw: string): string | null {
  const email = raw.trim();
  if (!email) return "Enter your email address.";
  if (email.length > EMAIL_MAX) return "Email is too long.";
  if (!email.includes("@")) return "Email must include an @.";
  if (!EMAIL_RE.test(email)) return "Enter a valid email, like you@example.com.";
  return null;
}

export function validateLoginPassword(password: string): string | null {
  if (!password) return "Enter your password.";
  if (password.length > PASSWORD_MAX) return `Password can't be longer than ${PASSWORD_MAX} characters.`;
  return null;
}

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${PASSWORD_MIN} characters`, test: (p) => p.length >= PASSWORD_MIN },
  { id: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "One number", test: (p) => /\d/.test(p) },
  { id: "symbol", label: "One symbol (!@#$…)", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function validateNewPassword(password: string): string | null {
  if (!password) return "Create a password.";
  if (password.length > PASSWORD_MAX) return `Password can't be longer than ${PASSWORD_MAX} characters.`;
  if (/\s/.test(password)) return "Password can't contain spaces.";
  const missing = PASSWORD_RULES.find((rule) => !rule.test(password));
  return missing ? `Password needs ${missing.label.toLowerCase()}.` : null;
}
