import { isAxiosError } from "axios";

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback;
  if (!error.response) return "Can't reach the server. Check your connection and try again.";

  const { status, data } = error.response;
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status >= 500) return "Something went wrong on our side. Try again in a moment.";

  const message = (data as { message?: unknown } | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}
