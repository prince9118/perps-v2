import "dotenv/config";
import {prisma} from "@repo/db";

const FUNDING_RATE=0.0001;
async function runFunding(){
    console.log("Running funding ...");
    const positions =await prisma.position.findMany({
        where:{
            status:"open",
        },

    });
    for(const position of positions){
        const amount =position.margin*FUNDING_RATE;
        if(position.side==="long"){
            await prisma.user.update({
                where:{id:position.userId},
                data:{
                    balance:{
                        decrement:amount,
                    },
                },
            });
            await prisma.fundingPayment.create({
                data:{
                    userId:position.userId,
                    market:position.market,
                    amount: -amount,
                    side:"long"
                },
            });
        }
        if(position.side==="sort"){
            await prisma.user.update({
                where:{id:position.userId},
                data:{
                    balance:{
                        increment:amount,
                    },
                },
            });
            await prisma.fundingPayment.create({
                data:{
                    userId:position.userId,
                    market:position.market,
                    amount,
                    side:"short"
                },
            });
        }
    }
    await prisma.fundingRate.create({
        data:{
            market:"ALL",
            rate:FUNDING_RATE,
        },
    });
    console.log("Funding completed")
}

async function main(){
    console.log("Funding Service Started");
    while(true){
        await runFunding();
        await new Promise((resolve)=>setTimeout(resolve,60_000));
    }
}
main();
