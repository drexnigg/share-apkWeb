import { Router, type IRouter } from "express";
import {
  clearSessionCookie,
  getUserFromRequest,
  setSessionCookie,
} from "../lib/auth";
import {
  changePassword,
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
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    },
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
  if (username.toLowerCase() === "admin") {
    res.status(400).json({ error: "Username 'admin' is reserved" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  try {
    const user = createUser(username, password, { role: "user", status: "pending" });
    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      },
      message:
        "Account created. An administrator must approve your account before you can sign in.",
    });
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
  if (user.status === "rejected") {
    res.status(403).json({ error: "Your account was rejected by an administrator." });
    return;
  }
  if (user.status !== "approved") {
    res.status(403).json({
      error:
        "Your account is awaiting admin approval. Please check back soon or contact the administrator.",
    });
    return;
  }
  setSessionCookie(res, user.id);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
    },
  });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post("/change-password", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!verifyPassword(current, user.passwordHash)) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  try {
    changePassword(user.id, next);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
