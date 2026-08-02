import type { NextFunction, Request, Response } from "express";
import { log } from "../lib/context";

export function requestLog(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number((process.hrtime.bigint() - started) / 1000n) / 1000;
    const path = (req.originalUrl || req.url).split("?")[0];
    const fields = { method: req.method, path, status: res.statusCode, ms };
    if (path === "/health") log.debug("request", fields);
    else if (res.statusCode === 500) log.error("request", fields);
    else if (res.statusCode > 500) log.warn("request", fields);
    else log.info("request", fields);
  });
  next();
}
