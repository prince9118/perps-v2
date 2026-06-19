import { WebSocketServer } from "ws";
import { redis, createRedisClient } from "@repo/redis";

const wss = new WebSocketServer({ port: 8080 });
const redisSnapshot = createRedisClient(); // dedicated client — not blocked by any XREAD BLOCK 0

wss.on("connection", async (socket) => {
  socket.send(JSON.stringify({ type: "CONNECTED", message: "WebSocket connected" }));

  // Send the latest orderbook snapshot for each market so the client
  // doesn't have to wait for the next engine event after a page refresh.
  try {
    const recent = await redisSnapshot.xrevrange("orderbook_events", "+", "-", "COUNT", 30);
    const sent = new Set<string>();
    for (const [, fields] of recent) {
      const dataIndex = fields.indexOf("data");
      if (dataIndex === -1) continue;
      const orderbook = JSON.parse(fields[dataIndex + 1]!);
      if (orderbook?.market && !sent.has(orderbook.market)) {
        sent.add(orderbook.market);
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "ORDERBOOK_UPDATE", data: orderbook }));
        }
      }
    }
  } catch {
    // Stream may be empty on cold start — client will get updates as orders flow in
  }

  socket.on("message", (message) => {
    console.log("Received:", message.toString());
  });
});

async function listenTradeEvents() {
  let lastId = "$";

  while (true) {
    const result = await redis.xread(
      "BLOCK",
      0,
      "STREAMS",
      "trade_events",
      lastId
    );

    if (!result) continue;

    const [streamName, messages] = result[0]!;

    for (const [messageId, fields] of messages) {
      const dataIndex = fields.indexOf("data");

      if (dataIndex === -1) continue;

      const trade = JSON.parse(fields[dataIndex + 1]!);

      for (const client of wss.clients) {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "TRADE_CREATED",
              data: trade,
            })
          );
        }
      }

      console.log("Broadcasted trade:", trade);

      lastId = messageId;
    }
  }
}
async function listenOrderbookEvents() {
  const redisOrderbook = createRedisClient();
  let lastId = "$";

  while (true) {
    const result = await redisOrderbook.xread(
      "BLOCK",
      0,
      "STREAMS",
      "orderbook_events",
      lastId
    );

    if (!result) continue;

    const [streamName, messages] = result[0]!;

    for (const [messageId, fields] of messages) {
      const dataIndex = fields.indexOf("data");

      if (dataIndex === -1) continue;

      const orderbook = JSON.parse(fields[dataIndex + 1]!);

      for (const client of wss.clients) {
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              type: "ORDERBOOK_UPDATE",
              data: orderbook,
            })
          );
        }
      }

      console.log("Broadcasted trade:", orderbook);

      lastId = messageId;
    }
  }
}

listenTradeEvents();
listenOrderbookEvents();

console.log("WebSocket server running on port 8080");