import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_ALGORITHM, JWT_SECRET } from "../lib/context";
import type { AuthedRequest } from "../lib/http";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    res.status(401).json({ success: false, message: "Authorization header missing" });
    return;
  }
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") {
    res.status(401).json({ success: false, message: "Token missing" });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (typeof decoded !== "object" || decoded === null || typeof decoded.userId !== "string") {
      throw new Error("invalid payload");
    }
    (req as AuthedRequest).user = { userId: decoded.userId, email: String(decoded.email ?? "") };
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
}
