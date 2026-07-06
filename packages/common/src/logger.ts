export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

function resolveThreshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").trim().toLowerCase();
  return LEVEL_ORDER[raw as LogLevel] ?? LEVEL_ORDER.info;
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = { name: err.name, message: err.message, stack: err.stack };
    const code = (err as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    return out;
  }
  return { message: String(err) };
}

const RESERVED = new Set(["ts", "level", "service", "msg"]);

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const key = RESERVED.has(rawKey) ? `field_${rawKey}` : rawKey;
    out[key] = value instanceof Error ? serializeError(value) : value;
  }
  return out;
}

export function createLogger(service: string, base: Record<string, unknown> = {}): Logger {
  const threshold = resolveThreshold();

  function write(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      service,
      msg,
      ...normalizeFields(base),
      ...(fields ? normalizeFields(fields) : {}),
    };
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({ ts: entry.ts, level, service, msg });
    }
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(line + "\n");
  }

  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    child: (fields) => createLogger(service, { ...base, ...fields }),
  };
}
