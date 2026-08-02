import type { Request } from "express";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface AuthedRequest extends Request {
  user: { userId: string; email: string };
}

export function userIdOf(req: Request): string {
  return (req as AuthedRequest).user.userId;
}

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  throw new HttpError(400, issues[0]?.message ?? "Invalid request", { errors: issues });
}

