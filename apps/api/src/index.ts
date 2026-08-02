import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "@repo/db";
import { closeRedis } from "@repo/redis";
import { installLifecycle, onShutdown, serializeError } from "@repo/common";
import { log, redis } from "./lib/context";
import { HttpError } from "./lib/http";
import { requestLog } from "./middleware/requestLog";
import { authRouter } from "./routes/auth";
import { ordersRouter } from "./routes/orders";
import { positionsRouter } from "./routes/positions";
import { marketRouter } from "./routes/market";

const shutdown = installLifecycle(log);
const port = Number(process.env.PORT ?? 3001);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.use(requestLog);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(cors());
app.use(express.json({ limit: "16kb" }));

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function dependencyStatus() {
  const [postgres, redisOk] = await Promise.all([
    withTimeout(prisma.$queryRaw`SELECT 1`, 2_000).then(() => true, () => false),
    withTimeout(redis.ping(), 2_000).then(() => true, () => false),
  ]);
  return { postgres, redis: redisOk };
}

let cachedStatus: { at: number; value: Awaited<ReturnType<typeof dependencyStatus>> } | null = null;

async function cachedDependencyStatus() {
  if (!cachedStatus || Date.now() - cachedStatus.at > 5_000) {
    cachedStatus = { at: Date.now(), value: await dependencyStatus() };
  }
  return cachedStatus.value;
}

app.get("/health", async (_req, res) => {
  const status = await dependencyStatus();
  const ok = status.postgres && status.redis;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    postgres: status.postgres ? "ok" : "down",
    redis: status.redis ? "ok" : "down",
  });
});

app.get("/backend-status", async (_req, res) => {
  const status = await cachedDependencyStatus();
  res.json({
    success: true,
    services: {
      api: "running",
      postgres: status.postgres ? "connected" : "disconnected",
      redis: status.redis ? "connected" : "disconnected",
    },
  });
});

app.use("/auth", authRouter);
app.use("/orders", ordersRouter);
app.use(marketRouter);
app.use(positionsRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message, ...err.extra });
    return;
  }
  const type = (err as { type?: string }).type;
  if (type === "entity.parse.failed") {
    res.status(400).json({ success: false, message: "Malformed JSON body" });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ success: false, message: "Request body too large" });
    return;
  }
  const status = Number((err as { status?: number }).status);
  if (status >= 400 && status < 500) {
    res.status(status).json({ success: false, message: "Bad request" });
    return;
  }
  log.error("unhandled request error", { err: serializeError(err) });
  res.status(500).json({ success: false, message: "Internal server error" });
});

const server = app.listen(port, () => {
  log.info("api started", { port });
});
server.on("error", (err) => {
  log.error("http server error", { err: serializeError(err) });
  void shutdown("server_error", 1);
});

onShutdown(async () => {
  await closeRedis(redis);
  await prisma.$disconnect();
});
onShutdown(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    }),
);
