import { WebSocketServer, WebSocket } from "ws";
import { closeRedis, createRedisClient, parseStreamEvent } from "@repo/redis";
import {
  EVENT_TYPES,
  STREAMS,
  createLogger,
  installLifecycle,
  isMarketId,
  isStopping,
  onShutdown,
  serializeError,
  sleep,
} from "@repo/common";

const log = createLogger("ws");
const shutdown = installLifecycle(log);
const port = Number(process.env.PORT ?? 8080);
const HEARTBEAT_MS = 30_000;
const MAX_BUFFERED_BYTES = 1_000_000;
const RESUME_WINDOW_MS = 60_000;
const CURSOR_KEY = "ws:cursor";

const reader = createRedisClient("ws-reader", log);
const commands = createRedisClient("ws-commands", log);
const latestBooks = new Map<string, string>();
const alive = new WeakSet<WebSocket>();

const wss = new WebSocketServer({ port, maxPayload: 4 * 1024 });

wss.on("listening", () => log.info("ws started", { port }));
wss.on("error", (err) => {
  log.error("ws server error", { err: serializeError(err) });
  void shutdown("server_error", 1);
});

function send(socket: WebSocket, payload: string) {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    socket.terminate();
    return;
  }
  socket.send(payload);
}

function broadcast(payload: string) {
  for (const client of wss.clients) send(client, payload);
}

wss.on("connection", (socket) => {
  alive.add(socket);
  socket.on("pong", () => alive.add(socket));
  socket.on("error", (err) => log.debug("client socket error", { err: serializeError(err) }));
  socket.on("message", (raw) => {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if ((message as { type?: string })?.type === "PING") {
      send(socket, JSON.stringify({ type: "PONG", timestamp: Date.now() }));
    }
  });
  send(socket, JSON.stringify({ type: "CONNECTED", message: "WebSocket connected" }));
  for (const payload of latestBooks.values()) send(socket, payload);
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!alive.has(socket)) {
      socket.terminate();
      continue;
    }
    alive.delete(socket);
    try {
      socket.ping();
    } catch {
      socket.terminate();
    }
  }
}, HEARTBEAT_MS);

async function primeLatestBooks() {
  try {
    const recent = await commands.xrevrange(STREAMS.ORDERBOOK_EVENTS, "+", "-", "COUNT", 200);
    for (const [, fields] of recent) {
      const event = parseStreamEvent<{ market?: string }>(fields);
      const market = event?.data.market;
      if (!event || event.type !== EVENT_TYPES.ORDERBOOK_UPDATE || !isMarketId(market) || latestBooks.has(market)) continue;
      latestBooks.set(market, JSON.stringify({ type: EVENT_TYPES.ORDERBOOK_UPDATE, data: event.data }));
    }
  } catch (err) {
    log.warn("failed to load latest order books", { err: serializeError(err) });
  }
}

async function initialCursor(stream: string): Promise<string> {
  const saved = await commands.hget(CURSOR_KEY, stream).catch(() => null);
  if (saved) {
    const ms = Number(saved.split("-")[0]);
    if (Number.isFinite(ms) && Date.now() - ms <= RESUME_WINDOW_MS) return saved;
  }
  const last = await commands.xrevrange(stream, "+", "-", "COUNT", 1).catch(() => []);
  return last[0]?.[0] ?? "0-0";
}

function handleEntry(stream: string, fields: string[]) {
  const event = parseStreamEvent<{ market?: unknown }>(fields);
  if (!event || !isMarketId(event.data.market)) return;
  if (stream === STREAMS.ORDERBOOK_EVENTS && event.type === EVENT_TYPES.ORDERBOOK_UPDATE) {
    const payload = JSON.stringify({ type: EVENT_TYPES.ORDERBOOK_UPDATE, data: event.data });
    latestBooks.set(event.data.market, payload);
    broadcast(payload);
  } else if (stream === STREAMS.TRADE_EVENTS && event.type === EVENT_TYPES.TRADE_CREATED) {
    broadcast(JSON.stringify({ type: EVENT_TYPES.TRADE_CREATED, data: event.data }));
  }
}

async function listen() {
  const streams = [STREAMS.ORDERBOOK_EVENTS, STREAMS.TRADE_EVENTS];
  const cursors = new Map<string, string>();
  for (const stream of streams) cursors.set(stream, await initialCursor(stream));
  let lastPersist = 0;

  while (!isStopping()) {
    let result: Array<[string, Array<[string, string[]]>]> | null;
    try {
      result = (await reader.xread(
        "COUNT",
        500,
        "BLOCK",
        2_000,
        "STREAMS",
        ...streams,
        ...streams.map((s) => cursors.get(s)!),
      )) as Array<[string, Array<[string, string[]]>]> | null;
    } catch (err) {
      if (isStopping()) break;
      log.error("stream read failed", { err: serializeError(err) });
      await sleep(1_000);
      continue;
    }
    for (const [stream, entries] of result ?? []) {
      for (const [id, fields] of entries) {
        cursors.set(stream, id);
        try {
          handleEntry(stream, fields);
        } catch (err) {
          log.warn("failed to broadcast event", { stream, id, err: serializeError(err) });
        }
      }
    }
    if (result && Date.now() - lastPersist > 1_000) {
      lastPersist = Date.now();
      await commands.hset(CURSOR_KEY, Object.fromEntries(cursors)).catch(() => undefined);
    }
  }
  await commands.hset(CURSOR_KEY, Object.fromEntries(cursors)).catch(() => undefined);
}

async function main() {
  onShutdown(async () => {
    await closeRedis(commands);
  });
  await primeLatestBooks();
  const loop = listen();
  onShutdown(async () => {
    clearInterval(heartbeat);
    await loop;
    reader.disconnect();
    for (const socket of wss.clients) socket.close(1001, "server shutting down");
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
  await loop;
}

main().catch(async (err) => {
  log.error("ws crashed", { err: serializeError(err) });
  await shutdown("fatal", 1);
});
