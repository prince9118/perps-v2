import { redis } from "@repo/redis";
import {OrderBook,type EngineOrder} from "./OrderBook";
// helper function to resd the redis


const orderBooks=new Map<string,OrderBook>();

function getOrderBook(market:string){
  if(!orderBooks.has(market)){
    orderBooks.set(market,new OrderBook());
  }
  return orderBooks.get(market)!;
}
function parseRedisFields(fields: string[]) {
  const obj: Record<string, string> = {};

  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const value = fields[i + 1];

    obj[key] = value;
  }

  return obj;
}

async function main() {
  console.log("Engine Started");

  let lastId = "$";

  while (true) {
    console.log("waiting for the message...");

    const result = await redis.xread(
      "BLOCK",
      0,
      "STREAMS",
      "order_events",
      lastId
    );

    if (!result) continue;

    const [streamName, messages] = result[0];

    for (const [messageId, fields] of messages) {
      const parsedFields = parseRedisFields(fields);

      const event = {
          type: parsedFields.type,
          data: JSON.parse(parsedFields.data),
      };

      console.log("Message ID:", messageId);
      console.log("Event:", event);

      lastId = messageId;
      if(event.type==="ORDER_CREATE"){
        const order:EngineOrder={
          id:event.data.orderId,
          userId:event.data.userId,
          market:event.data.market,
          side:event.data.side,
          type:event.data.type,
          price:event.data.price,
          quantity:event.data.quantity,
          leverage:event.data.leverage,
          status:"open",
          createdAt:event.data.timestamp,
        };
        const book=getOrderBook(order.market);
        if(order.type==="limit"){
          book.addOrder(order);
          const fills=book.matchOrders();
          // console.log("fills:",fills);
          for(const fill of fills){
            await redis.xadd(
              "trade_events",
              "*",
              "type",
              "TRADE_CREATED",
              "data",
              JSON.stringify(fill)
            );
            console.log("Trade Published",messageId,);
          }
        }
        // console.log("current OrderBook", orderBoook.getOrderBook());
      }
    }
  }
}

main();