import type { Response } from "express";

export type ShareLogEvent = {
  type: "log";
  level: "info" | "success" | "warn" | "error";
  message: string;
  account?: string;
  targetUid?: string;
  ts: number;
};

export type ShareStatsEvent = {
  type: "stats";
  success: number;
  failed: number;
  total: number;
  elapsedMs: number;
  perAccount: Array<{ name: string; shares: number; status: string }>;
};

export type ShareDoneEvent = {
  type: "done";
  success: number;
  failed: number;
  elapsedMs: number;
};

export type ShareEvent = ShareLogEvent | ShareStatsEvent | ShareDoneEvent;

type Subscriber = {
  res: Response;
  userId: string;
};

const subscribers = new Map<string, Set<Subscriber>>();

export function addSubscriber(userId: string, res: Response): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  const sub: Subscriber = { res, userId };
  set.add(sub);
  return () => {
    const s = subscribers.get(userId);
    if (!s) return;
    s.delete(sub);
    if (s.size === 0) subscribers.delete(userId);
  };
}

export function publish(userId: string, event: ShareEvent): void {
  const set = subscribers.get(userId);
  if (!set) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const sub of set) {
    try {
      sub.res.write(data);
    } catch {
      // ignore broken connections
    }
  }
}
