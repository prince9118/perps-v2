import { WebSocketServer } from "ws";
import { redis } from "@repo/redis";

const wss = new WebSocketServer({ port: 8080 });
wss.on("connection", (socket) => {
  console.log("Client connected");
  socket.send(
    JSON.stringify({
      type: "CONNECTED",
      message: "WebSocket connected",
    })
  );

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

listenTradeEvents();

console.log("WebSocket server running on port 8080");