import { PositionStatus } from "./market";
export type PositionSide="long"|"short";

export interface Position{
    id:string;
    userId:string;
    market : string;
    side:PositionSide;
    status:PositionStatus;
    quantity:number;
    entryPrice:number;
    leverage:number;
    margin:number;
    pnl:number;
}