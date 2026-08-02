import { createLogger } from "@repo/common";
import { createRedisClient } from "@repo/redis";

export const log = createLogger("api");
export const redis = createRedisClient("api", log);

const secret = process.env.JWT_SECRET;
if (!secret || secret.trim().length === 0) {
  log.error("JWT_SECRET is not set, refusing to start");
  process.exit(1);
}
if (secret.length < 32) {
  log.warn("JWT_SECRET is shorter than 32 characters; use a longer random secret");
}

export const JWT_SECRET: string = secret;
export const JWT_ALGORITHM = "HS256" as const;
export const JWT_EXPIRES_IN = "7d";
