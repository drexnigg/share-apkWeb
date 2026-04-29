import { Router, type IRouter } from "express";
import { requireAdmin, type AuthedRequest } from "../lib/auth";
import {
  deleteUser,
  listAllUsers,
  updateUser,
} from "../lib/storage";

const router: IRouter = Router();

router.get("/users", requireAdmin, (_req, res) => {
  const users = listAllUsers().map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    approvedAt: u.approvedAt ?? null,
  }));
  res.json({ users });
});

function paramId(req: { params: Record<string, string | string[] | undefined> }): string {
  const v = req.params["id"];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

router.post("/users/:id/approve", requireAdmin, (req, res) => {
  const r = req as AuthedRequest;
  const updated = updateUser(paramId(req), {
    status: "approved",
    approvedAt: Date.now(),
    approvedBy: r.user.username,
  });
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ok: true });
});

router.post("/users/:id/reject", requireAdmin, (req, res) => {
  const r = req as AuthedRequest;
  const updated = updateUser(paramId(req), {
    status: "rejected",
    approvedAt: Date.now(),
    approvedBy: r.user.username,
  });
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ok: true });
});

router.delete("/users/:id", requireAdmin, (req, res) => {
  const ok = deleteUser(paramId(req));
  if (!ok) {
    res.status(400).json({ error: "Cannot delete this user" });
    return;
  }
  res.json({ ok: true });
});

export default router;
