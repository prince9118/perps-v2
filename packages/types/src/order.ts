import type {OrderStatus}  from "./market";
 export type OrderSide="buy" | "sell";
export type OrderType="limit"|"market";


export interface Order{
    id:string;
    userId:string;
    market:string;
    side:OrderSide;
    type:OrderType;
    status:OrderStatus;
    price?:number;
    quantity:number;
    originalQuantity:number;
    createdAt:number;
}