export interface EngineOrder{
    id:string;
    userId:string;
    market:string;
    side:"buy"| "sell";
    type:"limit"|"market";
    price?:number;
    quantity:number;
    leverage:number;
    status:"open"|"filled"|"cancelled";
    createdAt:number;
}
export interface EngineFill{
    buyOrderId:string;
    sellOrderId:string;

    buyerId:string;
    sellerId:string;
    market:string;
    price?:number;
    quantity:number;
    timestamp:number;
}

export class OrderBook{
    buyOrders:EngineOrder[]=[];
    sellorders:EngineOrder[]=[];
    
    addOrder(order:EngineOrder){
        if(order.side==="buy"){
            this.buyOrders.push(order);
        }else{
            this.sellorders.push(order);
        }
    }
    getOrderBook(){
        return{
            buyOrders:this.buyOrders,
            sellOrders:this.sellorders,
        };
    }
    getBestBid(){
        return this.buyOrders.sort(
            (a,b)=>(b.price ??0)-(a.price??0)
        )[0];
    }
    getBestAsk(){
        return this.sellorders.sort(
               (a,b)=>(a.price ??0) -(b.price??0)
        )[0];
    }
    canMatch(){
        const bestBid=this.getBestBid();
        const bestAsk=this.getBestAsk();
        if(!bestBid||!bestAsk){
            return false;
        }
        return (bestBid.price??0)>=(bestAsk.price??0);
    }

    matchOrders():EngineFill[]{
        const fills:EngineFill[]=[];
        while(this.canMatch()){
            const bestBid=this.getBestBid()!;
            const bestAsk=this.getBestAsk()!;
            if(bestBid.userId===bestAsk.userId){
                console.log("Self Trade prevented");
                break;
            }
            const tradeQty=Math.min(
                bestBid.quantity,bestAsk.quantity
            );
            bestBid.quantity-=tradeQty;
            bestAsk.quantity-=tradeQty;
            const fill:EngineFill={
                buyOrderId:bestBid.id,
                sellOrderId:bestAsk.id,
                buyerId:bestBid.userId,
                sellerId:bestAsk.userId,
                market:bestBid.market,
                price:bestAsk.price,
                quantity:tradeQty,
                timestamp:Date.now(),
            };
            fills.push(fill);
            this.buyOrders= this.buyOrders.filter(o=>o.quantity>0);
            this.sellorders=this.sellorders.filter(o=>o.quantity>0);

        }
        return fills;
    }
}
