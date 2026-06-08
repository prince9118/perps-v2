import Redis from "ioredis";
export * from "./events";


export const redis=new Redis({
    host:"localhost",
    port:6379,
});

// await redis.set("test","hello");
// const value=await redis .get("test");
// console.log(value);

// process.exit(0);

