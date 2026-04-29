import { cookieHeader, parseCookieString, pickUserAgent } from "./ua";
import { publish, type ShareEvent } from "./events";
import { logger } from "./logger";

export type FbAccount = {
  id: string;
  name: string;
  token: string;
  cookieJar: Record<string, string>;
  shares: number;
  status: "ready" | "rate_limited" | "blocked" | "failed";
};

export type SessionState = {
  userId: string;
  accounts: FbAccount[];
  running: boolean;
  abortRequested: boolean;
  totalSuccess: number;
  totalFailed: number;
  startedAt: number;
  currentLink: string | null;
  currentTarget: number;
};

const sessions = new Map<string, SessionState>();

export function getSession(userId: string): SessionState {
  let s = sessions.get(userId);
  if (!s) {
    s = {
      userId,
      accounts: [],
      running: false,
      abortRequested: false,
      totalSuccess: 0,
      totalFailed: 0,
      startedAt: 0,
      currentLink: null,
      currentTarget: 0,
    };
    sessions.set(userId, s);
  }
  return s;
}

export function clearAccounts(userId: string): void {
  const s = getSession(userId);
  s.accounts = [];
  s.totalSuccess = 0;
  s.totalFailed = 0;
}

function send(userId: string, event: ShareEvent): void {
  publish(userId, event);
}

function snapshotStats(s: SessionState): void {
  send(s.userId, {
    type: "stats",
    success: s.totalSuccess,
    failed: s.totalFailed,
    total: s.totalSuccess + s.totalFailed,
    elapsedMs: s.startedAt > 0 ? Date.now() - s.startedAt : 0,
    perAccount: s.accounts.map((a) => ({
      name: a.name,
      shares: a.shares,
      status: a.status,
    })),
  });
}

async function fetchWithUa(
  url: string,
  init: RequestInit & { cookieJar?: Record<string, string> },
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("user-agent")) headers.set("user-agent", pickUserAgent());
  if (init.cookieJar)
    headers.set("cookie", cookieHeader(init.cookieJar));
  return fetch(url, { ...init, headers });
}

export async function loadAccountFromCookie(
  rawCookie: string,
): Promise<FbAccount> {
  const jar = parseCookieString(rawCookie);
  if (Object.keys(jar).length === 0) {
    throw new Error("Empty or malformed cookie");
  }
  const businessRes = await fetchWithUa(
    "https://business.facebook.com/business_locations",
    {
      method: "GET",
      cookieJar: jar,
      headers: {
        referer: "https://www.facebook.com/",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "upgrade-insecure-requests": "1",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  const text = await businessRes.text();
  const match = text.match(/(EAAG\w+)/);
  if (!match) {
    throw new Error("Token not found — cookie may be expired or invalid");
  }
  const token = match[1] as string;

  let name = "Unknown";
  let id = jar["c_user"] ?? "";
  try {
    const meRes = await fetchWithUa(
      `https://graph.facebook.com/v18.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
      { method: "GET", signal: AbortSignal.timeout(15000) },
    );
    const meJson = (await meRes.json()) as { id?: string; name?: string };
    if (meJson.id) id = meJson.id;
    if (meJson.name) name = meJson.name;
  } catch (err) {
    logger.warn({ err }, "Failed to load FB profile name");
  }

  return {
    id: id || token.slice(0, 12),
    name,
    token,
    cookieJar: jar,
    shares: 0,
    status: "ready",
  };
}

function isBlockedError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return [
    "rate limit",
    "suspended",
    "blocked",
    "checkpoint",
    "temporarily",
    "account disabled",
    "login required",
    "session has expired",
    "permissions",
  ].some((k) => lower.includes(k));
}

async function shareOnce(
  account: FbAccount,
  link: string,
): Promise<{ ok: boolean; targetUid?: string; error?: string; blocked?: boolean }> {
  try {
    const url = `https://graph.facebook.com/v18.0/me/feed?link=${encodeURIComponent(link)}&published=0&access_token=${encodeURIComponent(account.token)}`;
    const res = await fetchWithUa(url, {
      method: "POST",
      cookieJar: account.cookieJar,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      signal: AbortSignal.timeout(25000),
    });
    const json = (await res.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (json.id) {
      const targetUid = json.id.includes("_") ? json.id.split("_")[0] : json.id;
      return { ok: true, targetUid };
    }
    if (json.error) {
      const msg = json.error.message ?? "Unknown error";
      const blocked = isBlockedError(msg);
      return { ok: false, error: msg, blocked };
    }
    return { ok: false, error: "Unexpected response" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function runShareJob(
  userId: string,
  link: string,
  total: number,
): Promise<void> {
  const s = getSession(userId);
  if (s.running) throw new Error("A share job is already running");
  if (s.accounts.length === 0) throw new Error("No accounts loaded");

  s.running = true;
  s.abortRequested = false;
  s.totalSuccess = 0;
  s.totalFailed = 0;
  s.startedAt = Date.now();
  s.currentLink = link;
  s.currentTarget = total;
  for (const a of s.accounts) {
    a.shares = 0;
    if (a.status === "rate_limited") a.status = "ready";
  }

  send(userId, {
    type: "log",
    level: "info",
    message: `Starting share job: ${total} shares for ${link}`,
    ts: Date.now(),
  });
  snapshotStats(s);

  const PER_ACCOUNT_LIMIT = 60;
  const COOLDOWN_AFTER = 60;
  const COOLDOWN_MS = 10000;
  const DELAY_MS = 100;
  const CONCURRENCY = 3;

  let n = 0;
  let active = 0;
  const queue: Array<() => Promise<void>> = [];

  const pickAccount = (): FbAccount | null => {
    const available = s.accounts.filter(
      (a) => a.status === "ready" && a.shares < PER_ACCOUNT_LIMIT,
    );
    if (available.length === 0) return null;
    available.sort((a, b) => a.shares - b.shares);
    return available[0] ?? null;
  };

  const runOne = async (account: FbAccount, n: number): Promise<void> => {
    const result = await shareOnce(account, link);
    if (result.ok) {
      account.shares += 1;
      s.totalSuccess += 1;
      send(userId, {
        type: "log",
        level: "success",
        message: `Share #${n} successful → target uid ${result.targetUid ?? ""}`,
        account: account.name,
        targetUid: result.targetUid,
        ts: Date.now(),
      });
    } else {
      s.totalFailed += 1;
      if (result.blocked) {
        account.status = "blocked";
        send(userId, {
          type: "log",
          level: "warn",
          message: `Account blocked/limited — switching off: ${result.error}`,
          account: account.name,
          ts: Date.now(),
        });
      } else {
        send(userId, {
          type: "log",
          level: "error",
          message: `Share #${n} failed: ${result.error}`,
          account: account.name,
          ts: Date.now(),
        });
      }
    }
    snapshotStats(s);
  };

  const drain = (): Promise<void> =>
    new Promise<void>((resolve) => {
      const tick = (): void => {
        if (s.abortRequested) {
          if (active === 0) resolve();
          return;
        }
        while (active < CONCURRENCY && queue.length > 0) {
          const job = queue.shift();
          if (!job) break;
          active += 1;
          void job().finally(() => {
            active -= 1;
            tick();
          });
        }
        if (queue.length === 0 && active === 0) resolve();
        else setTimeout(tick, 50);
      };
      tick();
    });

  while (n < total) {
    if (s.abortRequested) {
      send(userId, {
        type: "log",
        level: "warn",
        message: "Stop requested — finishing in-flight requests…",
        ts: Date.now(),
      });
      break;
    }
    const account = pickAccount();
    if (!account) {
      const anyReady = s.accounts.some((a) => a.status === "ready");
      if (!anyReady) {
        send(userId, {
          type: "log",
          level: "error",
          message: "All accounts blocked or failed — stopping job.",
          ts: Date.now(),
        });
        break;
      }
      send(userId, {
        type: "log",
        level: "warn",
        message: "All ready accounts hit per-account limit — cooling down 10s and resetting counters…",
        ts: Date.now(),
      });
      await new Promise((r) => setTimeout(r, COOLDOWN_MS));
      for (const a of s.accounts) {
        if (a.status === "ready") a.shares = 0;
      }
      continue;
    }
    n += 1;
    const seq = n;
    queue.push(() => runOne(account, seq));
    await new Promise((r) => setTimeout(r, DELAY_MS));
    if (n % COOLDOWN_AFTER === 0) {
      send(userId, {
        type: "log",
        level: "info",
        message: `Cooldown after ${n} queued — pausing 10s…`,
        ts: Date.now(),
      });
      await new Promise((r) => setTimeout(r, COOLDOWN_MS));
    }
  }

  await drain();

  send(userId, {
    type: "done",
    success: s.totalSuccess,
    failed: s.totalFailed,
    elapsedMs: Date.now() - s.startedAt,
  });
  send(userId, {
    type: "log",
    level: "success",
    message: `Job complete — ${s.totalSuccess} success, ${s.totalFailed} failed.`,
    ts: Date.now(),
  });

  s.running = false;
  s.abortRequested = false;
}

export function requestStop(userId: string): void {
  const s = getSession(userId);
  s.abortRequested = true;
}
