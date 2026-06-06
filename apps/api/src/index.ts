import {prisma} from "@repo/db";
import "dotenv/config";
import express from "express";
import cors from "cors";
const app=express();

app.use(cors());
app.use(express.json());
const port =process.env.PORT;
console.log(port);

app.get("/users",async(require,res)=>{
    const users=await prisma.user.findMany();
    res.json({
        users,
    });
});

app.listen(3000,()=>{
    console.log(`Backend is Working on Port ${port}`);
})