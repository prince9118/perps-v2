import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma, isUniqueViolation } from "@repo/db";
import { JWT_ALGORITHM, JWT_EXPIRES_IN, JWT_SECRET } from "../lib/context";
import { HttpError, parseOrThrow, userIdOf } from "../lib/http";
import { loginSchema, signupSchema } from "../lib/schemas";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

const BCRYPT_ROUNDS = 10;
const STARTING_BALANCE = 10_000;
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_ROUNDS);
const userSelect = { id: true, email: true, balance: true, lockedBalance: true, createdAt: true } as const;

function signToken(user: { id: string; email: string }) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
  });
}

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 20),
  keyPrefix: "auth",
});

authRouter.post("/signup", authLimiter, async (req, res) => {
  const { email, password } = parseOrThrow(signupSchema, req.body);
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, "An account with this email already exists.");
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  let user;
  try {
    user = await prisma.user.create({
      data: { email, passwordHash, balance: STARTING_BALANCE, lockedBalance: 0 },
      select: userSelect,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "An account with this email already exists.");
    throw err;
  }
  res.status(201).json({ success: true, token: signToken(user), user });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password } = parseOrThrow(loginSchema, req.body);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  }
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw new HttpError(400, "Invalid credentials");
  res.json({
    success: true,
    token: signToken(user),
    user: { id: user.id, email: user.email, balance: user.balance, lockedBalance: user.lockedBalance, createdAt: user.createdAt },
  });
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: userIdOf(req) }, select: userSelect });
  if (!user) throw new HttpError(401, "Invalid token");
  res.json({ success: true, user });
});
