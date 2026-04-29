# Share Booster

## Overview

Share Booster is a real-time Facebook post boost dashboard. Users register/login with username + password (no email, no third party), paste one or more Facebook cookies, and start a share job. The UI shows the actual Facebook account NAME for every share (not just a number) and streams every result live.

## Stack

- **Backend**: Node 20 + Express 5 (single bundled `dist/index.mjs`) — serves both the JSON API at `/api/*` and the static frontend.
- **Frontend**: Vanilla HTML/CSS/JS in `artifacts/api-server/public/`. No build step needed for the UI itself; it is copied into `dist/public/` by `build.mjs`.
- **Auth**: Username + scrypt-hashed password stored in `./data/users.json`. Sessions are HMAC-signed HTTP-only cookies. The session secret is auto-generated into `./data/.secret` on first run if `SESSION_SECRET` is not set, so no env vars are required to deploy.
- **Live activity**: Server-Sent Events at `GET /api/events` (per-user channel) push share logs and stats to the browser as they happen.
- **Share engine** (`src/lib/shareEngine.ts`): Ports the original Python tool to Node's native `fetch` — pulls the EAAG token from `business.facebook.com`, fetches the real account name from `graph.facebook.com/v18.0/me`, then concurrently posts to `/me/feed` with rotating user agents, per-account caps, cooldowns, and automatic switch-off for blocked/rate-limited accounts.

## Files of note

- `artifacts/api-server/src/app.ts` — Express setup, mounts `/api`, serves `public/` for everything else (SPA fallback to `index.html`).
- `artifacts/api-server/src/routes/{auth,share,events,health}.ts` — REST endpoints.
- `artifacts/api-server/src/lib/{auth,storage,shareEngine,events,ua}.ts` — auth, JSON file storage, share engine, SSE pub/sub, UA rotation.
- `artifacts/api-server/public/{index.html,styles.css,app.js}` — UI.
- `artifacts/api-server/build.mjs` — esbuild bundle + copies `public/` into `dist/public/`.

## Deployment

The same code deploys to Render, Railway, Vercel and any Docker host without env vars (each platform supplies `PORT` automatically):

- `render.yaml` — Render blueprint
- `railway.json` + `nixpacks.toml` — Railway
- `vercel.json` — Vercel
- `Dockerfile` — generic container

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — build + run (used by the Replit workflow)
- `pnpm --filter @workspace/api-server run build` — esbuild bundle into `dist/`
- `pnpm --filter @workspace/api-server run start` — run the bundle
- `pnpm --filter @workspace/api-server run typecheck` — type-check only
