import Redis from "ioredis";
export * from "./events";

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const redis = new Redis(REDIS_CONFIG);

export function createRedisClient() {
  return new Redis(REDIS_CONFIG);
}

// await redis.set("test","hello");
// const value=await redis .get("test");
// // console.log(value);

// process.exit(0);

