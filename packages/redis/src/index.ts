import Redis from "ioredis";
export * from "./events";

const REDIS_CONFIG = { host: "localhost", port: 6379 as const };

export const redis = new Redis(REDIS_CONFIG);

export function createRedisClient() {
  return new Redis(REDIS_CONFIG);
}

// await redis.set("test","hello");
// const value=await redis .get("test");
// // console.log(value);

// process.exit(0);

