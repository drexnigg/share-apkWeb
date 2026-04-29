# Share Booster

A real-time Facebook post boost dashboard with username/password accounts and live activity logs that show the actual Facebook account name (not just a number) used for each share.

## Features

- Username + password registration and login (no email, no third party).
- Add one or many Facebook cookies; the server extracts the access token and shows the real account name.
- Concurrent sharing with rotating user agents, per-account share caps, automatic cooldowns, and immediate switching off any account that gets blocked or rate-limited.
- Live event stream over Server-Sent Events: every share success/failure appears instantly, tagged with the account name and target UID.
- Single Node.js process serves the API and the static UI — no external services, no environment variables required.

## Deploy

The same code deploys to **Render**, **Railway** and **Vercel** with no env vars.

- **Render** — uses `render.yaml` (auto-detected). Build: `pnpm install && pnpm --filter @workspace/api-server run build`. Start: `node artifacts/api-server/dist/index.mjs`. Health check: `/api/healthz`.
- **Railway** — uses `railway.json` and `nixpacks.toml`. Same build/start commands.
- **Vercel** — uses `vercel.json` to bundle the Node server.
- **Docker / any host** — `docker build -t share-booster . && docker run -p 8080:8080 share-booster`.

`PORT` is the only setting any of them require, and every platform listed sets it automatically. A session secret and user database are auto-created on first start in `./data/`.

## Local

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
```

Then open the printed URL.
