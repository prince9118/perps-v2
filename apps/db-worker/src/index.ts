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
async function processTradeEvents(){
  let lastTradeId="$";
  while (true) {
    console.log("Waiting for trade...");
    const result = await redis.xread(
      "BLOCK",
      0,
      "STREAMS",
      "trade_events",
      lastTradeId
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
        lastTradeId=messageId;
    }
  }
}
async function processOrderUpdate(){
  let lastOrderUpdateId="$";
  while(true){
    const result=await redis.xread(
      "BLOCK",
      "0",
      "STREAMS",
      "order_update_events",
      lastOrderUpdateId
    );
    if(!result)continue;
    const[streamName,messages]=result[0];
    for (const [messageId,fields]of messages){
      const parsedFields=parseRedisFields(fields);
      const event={
        type:parsedFields.type,
        data:JSON.parse(parsedFields.data)
      };
      if(event.type==="ORDER_UPDATED"){
        await prisma.order.update({
          where:{
            id:event.data.orderId
          },
          data:{
            status:event.data.status,
            quantity:event.data.quantity
          }
        });
        console.log("Order Updated",event.data);
      }
      lastOrderUpdateId=messageId;
    }
  }
}

async function updatePosition(params:{
  userId:string;
  market:string;
  side:"long"|"short";
  price:number;
  quantity:number;
  leverage:number;
}){
  const existingPosition=await prisma.position.findFirst({
    where:{
      userId:params.userId,
      market:params.market,
      side:params.side,
      status:"open",
    },
  });
  const margin=(params.price*params.quantity)/params.leverage;
  if(!existingPosition){
    await prisma.position.create({
      data:{
        userId:params.userId,
        market:params.market,
        side:params.side,
        status:"open",
        quantity:params.quantity,
        entryPrice:params.price,
        leverage:params.leverage,
        margin,
        pnl:0,
      },
    });
    return;
  }
  const oldNotional=existingPosition.quantity*params.quantity;
  const newNotional=params.price*params.quantity;
  const newQuantity=existingPosition.quantity+params.quantity;
  const newEntryPrice=(oldNotional+newNotional)/newQuantity;
  await prisma.position.update({
    where:{
      id:existingPosition.id,
    },
    data:{
      quantity:newQuantity,
      entryPrice:newEntryPrice,
      margin:existingPosition.margin+margin,
    },
  });

}


async function main(){
  console.log("DB Worker Started");
  await Promise.all([
    processTradeEvents(),
    processOrderUpdate()
  ]);
}

main();