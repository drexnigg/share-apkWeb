import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { findUserById, getOrCreateSessionSecret, type StoredUser } from "./storage";

const COOKIE_NAME = "sb_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionCookie(userId: string): string {
  const secret = getOrCreateSessionSecret();
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function parseSessionCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresStr, sig] = parts;
  if (!userId || !expiresStr || !sig) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  const secret = getOrCreateSessionSecret();
  const expected = sign(`${userId}.${expiresStr}`, secret);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return userId;
}

export function setSessionCookie(res: Response, userId: string): void {
  const value = createSessionCookie(userId);
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function getUserFromRequest(req: Request): StoredUser | null {
  const cookieValue = req.cookies?.[COOKIE_NAME] as string | undefined;
  const userId = parseSessionCookie(cookieValue);
  if (!userId) return null;
  return findUserById(userId);
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  (req as Request & { user: StoredUser }).user = user;
  next();
}

export type AuthedRequest = Request & { user: StoredUser };
