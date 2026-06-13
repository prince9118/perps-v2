import { WebSocketServer } from "ws";
import {redis}from "@repo/redis";
const wss=new WebSocketServer({
    port:8080,
});

wss.on("connection",(socket)=>{
    console.log("client Connected");
    socket.send(JSON.stringify({
        type:"CONNECTED",
        message:"Websocket Connected",
    }));
    socket.on("message",(message)=>{
        console.log("Received:",message.toString());
    });
});
console.log("WebScoket server running on port 8080");