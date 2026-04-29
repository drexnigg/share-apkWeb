import { Router, type IRouter } from "express";
import {
  clearSessionCookie,
  getUserFromRequest,
  setSessionCookie,
} from "../lib/auth";
import {
  createUser,
  findUserByUsername,
  verifyPassword,
} from "../lib/storage";

const router: IRouter = Router();

router.get("/me", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    res.json({ user: null });
    return;
  }
  res.json({
    user: { id: user.id, username: user.username },
  });
});

router.post("/register", (req, res) => {
  const body = req.body as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (username.length < 3 || username.length > 32) {
    res.status(400).json({ error: "Username must be 3-32 characters" });
    return;
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    res.status(400).json({ error: "Username may contain letters, numbers, _ . -" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  try {
    const user = createUser(username, password);
    setSessionCookie(res, user.id);
    res.json({ user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

router.post("/login", (req, res) => {
  const body = req.body as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  setSessionCookie(res, user.id);
  res.json({ user: { id: user.id, username: user.username } });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
