import { redis } from "@repo/redis";
import { prisma } from "@repo/db";
import "dotenv/config";
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
  console.log("DB Worker Started");
  let lastId = "$";
  while (true) {
    console.log("Waiting for trade...");
    const result = await redis.xread(
      "BLOCK",
      0,
      "STREAMS",
      "trade_events",
      lastId
    );

    if (!result) continue;
    const [streamName, messages] = result[0];
    for(const [messageId,fields] of messages){
        const parsedFields=parseRedisFields(fields);
        const event = {
            type: parsedFields.type,
            data: JSON.parse(parsedFields.data),
        };
        if(event.type==="TRADE_CREATED"){
            const fill=event.data;
            await prisma.fill.create({
                data:{
                    buyOrderId:fill.buyOrderId,
                    sellOrderId:fill.sellOrderId,
                    buyerId:fill.buyerId,
                    sellerId:fill.sellerId,
                    market:fill.market,
                    price:fill.price,
                    quantity:fill.quantity,
                },
            });
            console.log("Fill saved to DB",fill);
        }
        lastId=messageId;
    }
  }
}

main();