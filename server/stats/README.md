# "Anonymous statistics" service

Small Node service with no npm dependency (`node:sqlite`, **Node ≥ 22.13**) that counts distinct players without knowing anything about them. What is collected, why and for how long: [PRIVACY.md](../../PRIVACY.md).

## What is stored (and what is not)

A random identifier (UUID drawn by the client), the time of the ping, `playing` (in game / menu), the version and the site (`public` / `owner`: the public build or the full build). **Never** an IP address, User-Agent, language, cookie or free text (unknown fields are rejected). The client address is used only for rate limiting, in memory (no persistence, no log).

Tables (`${STATS_DATA}/stats.sqlite`): `players` (id, first day: used to tell "new" from "returning" players, kept), `pings` (raw, **purged after 48 h**), `daily` (one row per id and per UTC day: first and last ping, pings, sessions, seconds, version, site; kept 400 days), `peaks` (peak concurrent players per day).

## Starting

```bash
STATS_ADMIN_TOKEN="$(openssl rand -hex 24)" STATS_PORT=5330 STATS_DATA=./.stats-data node server/stats/index.mjs
```

| Variable | Default | Purpose |
|---|---|---|
| `STATS_PORT` | `5330` | listening port |
| `STATS_HOST` | `127.0.0.1` | listening address (do not expose it: put it behind the rewrite / the tunnel) |
| `STATS_DATA` | `./.stats-data` | directory of the `stats.sqlite` database |
| `STATS_ADMIN_TOKEN` | (none) | token for `/stats` and `/stats.html`, **≥ 16 characters**; without it (or if too short), these endpoints answer 503: never open. Kept outside the repository. |
| `STATS_CLIENT_IP` | `socket` | `socket` (connection address) or `cloudflare` (`CF-Connecting-IP`, read only from a trusted peer); `X-Forwarded-For` is never read |
| `STATS_TRUSTED_PEERS` | `127.0.0.1,::1` | trusted peers for `cloudflare` mode (local cloudflared) |

Without `STATS_CLIENT_IP=cloudflare`, the address seen behind the tunnel is cloudflared's: all players then share the limit (60 requests / min, 50 new identifiers / day per address). With the Vercel rewrite, `CF-Connecting-IP` is the Vercel egress address: details, actual chain and production configuration in [docs/EXPLOITATION-IP.md](../../docs/EXPLOITATION-IP.md). A global cap (1200 pings / min) protects the database in any case.

## Endpoints

- `POST /ping`: JSON body `{id, playing, ver, site}` (≤ 1 KB, UUID format, `ver` = `[\w.-]{1,16}`, `site` = `public|owner`) → `204`. A ping less than 20 s after the previous one from the same id is ignored. `400` invalid, `413` too large, `429` limit.
- `GET /stats`: statistics as JSON, header `Authorization: Bearer <token>` (never in the URL; 10 wrong tokens / min / address, then `429`).
- `GET /stats.html` (+ `stats.js`): page readable on mobile. It contains **no data**; it asks for the token in a form, keeps it in the tab's memory and refreshes every 30 s.
- `GET /health`: `{ok:true}`.
- No CORS (no `Access-Control-*`), no TLS: the service is meant to sit behind a same-origin rewrite or a tunnel.

`/stats` metrics: unique players since the beginning, active / new / returning per day (30 days), concurrent players right now (ping < 2 min) including those in game, peak per day and all-time record, breakdown by site and by version (players active over 30 days), approximate average session length (gaps between pings ≤ 2 min 30 + 1 min for the last one).

## Hooking up the service

1. Copy the repository to the machine, choose a data directory outside the repository (e.g. `/var/lib/d2m-stats`) and a token (`openssl rand -hex 24`).
2. Adapt and install the example systemd unit [`d2m-stats.service.example`](d2m-stats.service.example) (dedicated user, token in a `0600` environment file outside the repository), then `systemctl enable --now`.
3. Make the service reachable over HTTPS from Vercel: a new Cloudflare tunnel host (or reverse proxy) pointing to `http://127.0.0.1:5330`. This host is the `STATS_API_URL` origin (kept outside the repository).
4. Deploy with `STATS_API_URL=https://<host> npm run deploy -- --code` (full build, optional encrypted loader) and/or `… -- --public` (public build): `tools/deploy.mjs` rewrites `/stats-api/*` to the service in the generated `vercel.json`. Without the variable, no ping gets through (404) and the build mentions no server.
5. Read the figures: `https://<site>/stats-api/stats.html` (token requested) or `curl -H "Authorization: Bearer $TOKEN" https://<site>/stats-api/stats`.

## Operations

- **Backup**: the file is an SQLite database in WAL mode. Consistent hot copy: `STATS_DATA=/var/lib/d2m-stats node server/stats/index.mjs --backup /path/backup.sqlite` (`VACUUM INTO`). Do not copy `stats.sqlite` alone while the service is running, without its `-wal` / `-shm` files.
- **Purge**: automatic (at startup, then at most once an hour during a ping); raw pings > 48 h, aggregated rows > 400 days.
- **Reset**: stop the service and delete `stats.sqlite*`.
- **Logs**: the service writes no request and no address; only internal errors (without request details) go to standard error.
- Test: `npx vitest run tests/unit/stats-server.test.ts`.
