import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { addSubscriber } from "../lib/events";

const router: IRouter = Router();

router.get("/events", requireAuth, (req, res) => {
  const r = req as AuthedRequest;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`: connected\n\n`);

  const remove = addSubscriber(r.user.id, res);
  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      // ignore
    }
  }, 15000);

  req.on("close", () => {
    clearInterval(ping);
    remove();
    res.end();
  });
});

export default router;
