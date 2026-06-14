import {prisma} from "@repo/db";
import { redis } from "@repo/redis";

import "dotenv/config";

function calculateLiquidationPrice(position:any){
    if(position.side==="long"){
        return position.entryPrice*(1-1/position.leverage);
    }
    return position.entryPrice*(1+1/position.leverage);
}


async function main(){
    
    console.log("Liquidator Started");

    while(true){
        const positions=await prisma.position.findMany({
            where:{
                status:"open",
            },
        });
        for(const position of positions){
            const markPrice=Number(
                await redis.get(`index_price:${position.market}`)
            );
            if(!markPrice) continue;
            const liquidationPrice=calculateLiquidationPrice(position);
            const shouldLiquidate= position.side==="long"? markPrice<=liquidationPrice:markPrice>=liquidationPrice;
            if(!shouldLiquidate)  continue;
            //insurence fund insert 
            await prisma.insuranceFund.upsert({
                where: {
                    market: position.market,
                },
                update: {
                    balance: {
                    increment: position.margin,
                    },
                },
                create: {
                    market: position.market,
                    balance: position.margin,
                },
             });
            await prisma.position.update({
                where:{
                    id:position.id,
                },
                data:{
                    status:"closed",
                    pnl: -position.margin,
                },
            });
            await prisma.user.update({
                where:{
                    id:position.userId,
                },
                data:{
                    lockedBalance:{
                        decrement:position.margin,
                    },
                },
            });
            await prisma.positionHistory.create({
                data: {
                    userId: position.userId,
                    market: position.market,
                    side: position.side,
                    quantity: position.quantity,
                    entryPrice: position.entryPrice,
                    exitPrice: markPrice,
                    leverage: position.leverage,
                    margin: position.margin,
                    pnl: -position.margin,
                    reason: "liquidated",
                },
            });


            await redis.xadd(
                "liquidation_events",
                "*",
                "type",
                "POSITION_LIQUIDATED",
                "data",
                JSON.stringify({
                    positionId:position.id,
                    userId:position.userId,
                    market:position.market,
                    side:position.side,
                    markPrice,
                    liquidationPrice,
                    marginLost:position.margin,
                    timestamp:Date.now(),
                })
            );
            
            console.log("position liquidated:",position.id);
        }
        await new Promise((resolve)=>setTimeout(resolve,1000));
    }

}
main();
