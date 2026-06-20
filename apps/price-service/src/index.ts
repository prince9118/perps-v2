import {redis} from "@repo/redis";
import { resolve } from "bun";
const MARKET=[
    {market:"BTC-PERP",symbol:"BTCUSDT"},
    {market:"ETH-PERP",symbol:"ETHUSDT"},
    {market:"SOL-PERP",symbol:"SOLUSDT"}
];
async function fetchPrice(symbol:string){
    const res=await fetch(
         `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    );
    const data:any=await res.json();
    return Number(data.price);
    
}
async function main() {
    // console.log("Price Service Started");
    while(true){
        for(const item of MARKET){
            const price=await fetchPrice(item.symbol);
            await redis.set(`index_price:${item.market}`,price);
            // console.log(item.market,price);
        }
        await new Promise((resolve)=>setTimeout(resolve,3000));
    }
}
main();