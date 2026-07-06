import { serializeError, type Logger } from "./logger";

type ShutdownHandler = () => Promise<void> | void;

const handlers: ShutdownHandler[] = [];
const sleepers = new Set<() => void>();
let stopping = false;
let installed = false;

export function isStopping(): boolean {
  return stopping;
}

export function onShutdown(handler: ShutdownHandler): void {
  handlers.push(handler);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (stopping) {
      resolve();
      return;
    }
    const wake = () => {
      clearTimeout(timer);
      sleepers.delete(wake);
      resolve();
    };
    const timer = setTimeout(wake, ms);
    sleepers.add(wake);
  });
}

export function installLifecycle(log: Logger, options: { timeoutMs?: number } = {}): (reason: string, code?: number) => Promise<void> {
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function shutdown(reason: string, code = 0) {
    if (stopping) return;
    stopping = true;
    log.info("shutting down", { reason });
    for (const wake of [...sleepers]) wake();
    const timer = setTimeout(() => {
      log.error("shutdown timed out, forcing exit", { timeoutMs });
      process.exit(1);
    }, timeoutMs);
    for (const handler of [...handlers].reverse()) {
      try {
        await handler();
      } catch (err) {
        log.error("shutdown handler failed", { err: serializeError(err) });
      }
    }
    clearTimeout(timer);
    log.info("stopped");
    process.exit(code);
  }

  if (!installed) {
    installed = true;
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("unhandledRejection", (err) => {
      log.error("unhandled rejection", { err: serializeError(err) });
    });
    process.on("uncaughtException", (err) => {
      log.error("uncaught exception", { err: serializeError(err) });
      void shutdown("uncaughtException", 1);
    });
  }

  return shutdown;
}
