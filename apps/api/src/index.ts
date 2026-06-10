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
// orderbook for testing purpose


app.listen(port,()=>{
    console.log(`Backend is Working on Port ${port}`);
})