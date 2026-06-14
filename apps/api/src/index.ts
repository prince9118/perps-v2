import {prisma} from "@repo/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { success } from "zod";
import {authMiddleware} from "./middleware/auth";
import {redis} from "@repo/redis";
const app=express();

app.use(cors());
app.use(express.json());
const port =process.env.PORT;

app.get("/users",async(require,res)=>{
    const users=await prisma.user.findMany();
    res.json({
        users,
    });
});
// fucntion to return pnl
function calculatePnl(position: any, currentPrice: number) {
  if (position.side === "long") {
    return (currentPrice - position.entryPrice) * position.quantity;
  }

  return (position.entryPrice - currentPrice) * position.quantity;
}
//helper function for the realized pnl
function calculateRealizedPnl(position:any,exitPrice:number){
    if(position.side==="long"){
        return (exitPrice-position.entryPrice)*position.quantity;
    }

    return (position.entryPrice-exitPrice)*position.quantity;

}
// helper function to retuen liquidation 
function calculateLiquidationPrice(position:any){
    if(position.side==="long"){
        return position.entryPrice*(1-1/position.leverage);
    }
    return position.entryPrice*(1+1/position.leverage);
}
//healper function for calculate risk score
function calculateRiskScore(position: any, markPrice: number) {
  const pnl = calculatePnl(position, markPrice);

  return Math.abs(pnl) / position.margin;
}

// signup api
app.post("/auth/signup",async(req,res)=>{
    const {email,password}=req.body;
    if(!email ||!password){
        return res.status(400).json({
            message:"Email and password required !"
        });
    }
    const existingUser= await prisma.user.findUnique({
        where: {email},
    });
    if(existingUser){
        return res.status(400).json({
            message:"user already exist"
        });
    }
    const passwordHash= await bcrypt.hash(password,10);
    const user=await prisma.user.create({
        data:{
            email,
            passwordHash,
            balance:10000,
            lockedBalance:0,
        },
        select:{
            id:true,
            email:true,
            balance:true,
            lockedBalance:true,
            createdAt:true,
        },
    });
    res.json({
        success:true,
        user,
    });
});

// login api

app.get("/auth/login",async(req,res)=>{
    const {email,password}=req.body;
    const user=await prisma.user.findUnique({
        where:{email},
    });
    if(!user){
        return res.status(400).json({
            message:"Invalid credentials",
        });
    }
    const isPasswordValid=await bcrypt.compare(
        password,
        user.passwordHash
    );
    if(!isPasswordValid){
        return res.status(400).json({
            message:"Invalid Credentials",
        });
    }
    //token
    const token = jwt.sign(
        {userId:user.id,email:user.email},
        process.env.JWT_SECRET!,
        {expiresIn:"7d"}
    );
    res.json({
        success:true,
        token,
        user:{
            id:user.id,
            email:user.email,
            balance:user.balance,
            lockedBalance:user.lockedBalance,
        },
    });
});


// authentication me 
app.get("/auth/me",authMiddleware,async(req:any,res)=>{
    const user= await prisma.user.findUnique({
        where:{
            id:req.user.userId,
        },
         select:{
            id:true,
            email:true,
            balance:true,
            lockedBalance:true,
            createdAt:true,
        },
    });
    res.json({
        user,
    });
    
});


// redis test order 

app.post("/test-order",async(req,res)=>{
    const {market,side,quantity}=req.body; 
    const event ={
        market, 
        side,
        quantity,
        timestamp:Date.now(),
    };
    const messageId= await redis.xadd(
        "order_events",
        "*",
        "type",
        "ORDER_CREATE",
        "data",
        JSON.stringify(event),
        
    );
    res.json({
        success:true,
        messageId,
    });
});

 

app.post("/orders",authMiddleware,async(req:any,res)=>{
    const {market,side,type,price,quantity,leverage}=req.body;
    if(!market || !side || !type || !quantity || !leverage){
        return res.status(400).json({
            message:"market ,side ,type ,quantity,and leverage are required",
        });
    }
    if(type === "limit" &&  !price){
        return res.status(400).json({
            message:"Price is required fot limit Order",
        });
    }

    const dbOrder=await prisma.order.create({
        data:{
            userId:req.user.userId,
            market,
            side,
            type,
            status:"open",
            price:type==="limit"?price:null,
            quantity,
            leverage,
            originalQuantity:quantity
        },
    });

    const event={
        orderId:dbOrder.id,
        userId:req.user.userId,
        market,
        side,
        type,
        price,
        quantity,
        leverage,
        timestamp:Date.now(),
    };
   
    const messageId= await redis.xadd(
        "order_events",// stream name
        "*",// message Id
        "type",// event
        "ORDER_CREATE",
        "data",
        JSON.stringify(event)
    );
    res.json({
        success:true,
        message:"Order Submitted",
        order:dbOrder,
        messageId
    })

})

// get the users order

app.get("/orders",authMiddleware,async(req:any,res)=>{
    const orders=await prisma.order.findMany({
        where:{
            userId:req.user.userId,
        },
        orderBy:{
            createdAt:"desc",
        },
    });
    res.json({
        success:true,
        orders,
    });
});

// get user fills

app.get("/fills",authMiddleware,async(req:any,res)=>{
     console.log("req.user in fills:", req.user);
    const fills=await prisma.fill.findMany({
        where:{
            OR:[
                {buyerId: req.user.userId},
                {sellerId: req.user.userId},

            ],
        },
         orderBy:{
            createdAt:"desc",
        },

    });
    res.json({
        success:true,
        fills,
    });

});


//positions
app.get("/positions",authMiddleware,async(req:any,res)=>{
    // const currentPrice=Number(req.query.price);
    // const currentPrice=Number(
    //     await redis.get(`index_price:${positions.market}`)
    // )

    const positions=await prisma.position.findMany({
        where:{
            userId:req.user.userId,
            status:"open",
        },
        orderBy:{
            createdAt:"desc",
        },
    });

    // const positionWithPnl=positions.map(async(position)=>{
    //     const currentPrice=Number(
    //         await redis.get(`index_price:${position.market}`)
    //     );
    //     // const pnl=currentPrice?calculatePnl(position,currentPrice):position.pnl;
    //     const pnl=calculatePnl(position,currentPrice);
    //     return{
    //         ...position,
    //         marketPrice:currentPrice,
    //         unrealizedPnl:pnl,
    //         liquidationPrice:calculateLiquidationPrice(position),
    //     };
    // });
    const positionWithPnl=await Promise.all(
        positions.map(async(position)=>{
            const markPrice=Number(
                await redis.get(`index_prie:${position.market}`)
            );
            const pnl=calculatePnl(position,markPrice);
            return {
                ...position,
                markPrice,
                unrealizedPnl:pnl,
                liquidationPrice:calculateLiquidationPrice(position),
            };
        })
    );
    res.json({
        success:true,
        positions:positionWithPnl,
    });
});

app.post("/position/close",authMiddleware,async(req:any,res)=>{
    const {positionId}=req.body;
    const exitPrice=Number(req.query.price);
    if(!positionId || !exitPrice){
        return res.status(400).json({
            message:"PositionId and price required",
        });
    }
    const position=await prisma.position.findFirst({
        where:{
            id:positionId,
            userId:req.user.userId,
            status:"open",
        },
    });
    if(!position){
        return res.status(404).json({
            message:"Position not found"
        })
    }
    const realizedPnl=calculateRealizedPnl(position,exitPrice);
    const relesedMargin=position.margin;
    await prisma.position.update({
        where:{
            id:position.id,
        },
        data:{
            status:"closed",
            pnl:realizedPnl,
        },
    });
    await prisma.user.update({
        where:{
            id:req.user.userId,
        },
        data:{
            balance:{
                increment:relesedMargin+realizedPnl,

            },
            lockedBalance:{
                decrement:relesedMargin,
            },
        },
    });
    res.json({
        success:true,
        message:"position closed",
        realizedPnl,
        relesedMargin,
    });
});


//ADL(auto )
app.get("/adl/ranking",authMiddleware,async (_req,res)=>{
    const positions=await prisma.position.findMany({
        where:{
            status:"open",
        },
    });
    const ranked=await Promise.all(
        positions.map(async(position)=>{
            const markPrice=Number(
                await redis.get(`index_price:${position.market}`)
            );
            return{
                positionId:position.id,
                userid:position.userId,
                market:position.market,
                side:position.side,
                margin:position.margin,
                markPrice,
                riskScore:calculateRiskScore(position,markPrice),
            };
        })
    );
    ranked.sort((a,b)=>b.riskScore-a.riskScore);
    res.json({
        success:true,
        ranked,
    });
});


//cancel order

app.delete("/orders/:id",authMiddleware,async(req:any,res)=>{
    const orderId=req.params.id;
    const order=await prisma.order.findFirst({
        where:{
            id:orderId,
            userId:req.user.userId,
        },
    });
    if(!order){
        return res.status(404).json({
            message:"Order not found",
        });
    }
    if(
        order.status==="filled" || order.status==="cancelled"
    ){
        return res.status(400).json({
            message:"order can not cancell"
        });
    }
    await prisma.order.update({
        where:{
            id:order.id,
        },
        data:{
            status:"cancelled",

        },
    });
    await redis.xadd(
        "order_cancel_events",
        "*",
        "type",
        "ORDER_CANCELLED",
        "data",
        JSON.stringify({
            orderId:order.id,
            market:order.market,
            timestamp:Date.now(),
        })
    );
    res.json({
        success:true,
        message:"Order Cancelled",
    });


});

app.listen(port,()=>{
    console.log(`Backend is Working on Port ${port}`);
})