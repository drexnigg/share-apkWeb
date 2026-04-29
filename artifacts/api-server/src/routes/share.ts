import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  clearAccounts,
  getSession,
  loadAccountFromCookie,
  requestStop,
  runShareJob,
} from "../lib/shareEngine";

const router: IRouter = Router();

router.get("/state", requireAuth, (req, res) => {
  const r = req as AuthedRequest;
  const s = getSession(r.user.id);
  res.json({
    running: s.running,
    accounts: s.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      shares: a.shares,
      status: a.status,
    })),
    success: s.totalSuccess,
    failed: s.totalFailed,
    currentLink: s.currentLink,
    currentTarget: s.currentTarget,
  });
});

router.post("/accounts", requireAuth, async (req, res) => {
  const r = req as AuthedRequest;
  const body = req.body as { cookies?: unknown };
  const list = Array.isArray(body.cookies)
    ? (body.cookies as unknown[]).filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  if (list.length === 0) {
    res.status(400).json({ error: "Provide at least one cookie string" });
    return;
  }
  const s = getSession(r.user.id);
  const results: Array<{ ok: boolean; name?: string; error?: string }> = [];
  for (const raw of list) {
    try {
      const account = await loadAccountFromCookie(raw);
      const existingIdx = s.accounts.findIndex((a) => a.id === account.id);
      if (existingIdx >= 0) {
        s.accounts[existingIdx] = account;
      } else {
        s.accounts.push(account);
      }
      results.push({ ok: true, name: account.name });
    } catch (err) {
      results.push({ ok: false, error: (err as Error).message });
    }
  }
  res.json({
    results,
    accounts: s.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      shares: a.shares,
      status: a.status,
    })),
  });
});

router.delete("/accounts", requireAuth, (req, res) => {
  const r = req as AuthedRequest;
  clearAccounts(r.user.id);
  res.json({ ok: true });
});

router.delete("/accounts/:id", requireAuth, (req, res) => {
  const r = req as AuthedRequest;
  const s = getSession(r.user.id);
  s.accounts = s.accounts.filter((a) => a.id !== req.params.id);
  res.json({ ok: true });
});

router.post("/start", requireAuth, (req, res) => {
  const r = req as AuthedRequest;
  const body = req.body as { link?: unknown; total?: unknown };
  const link = typeof body.link === "string" ? body.link.trim() : "";
  const total = Math.min(
    Math.max(1, Math.floor(Number(body.total) || 0)),
    5000,
  );
  if (!/^https?:\/\//i.test(link)) {
    res.status(400).json({ error: "Provide a valid http(s) link" });
    return;
  }
  const s = getSession(r.user.id);
  if (s.running) {
    res.status(409).json({ error: "A share job is already running" });
    return;
  }
  if (s.accounts.length === 0) {
    res.status(400).json({ error: "Add at least one Facebook cookie first" });
    return;
  }
  void runShareJob(r.user.id, link, total).catch((err) => {
    s.running = false;
    s.abortRequested = false;
    req.log?.error({ err }, "Share job failed");
  });
  res.json({ ok: true, started: true, total });
});

router.post("/stop", requireAuth, (req, res) => {
  const r = req as AuthedRequest;
  requestStop(r.user.id);
  res.json({ ok: true });
});

export default router;
