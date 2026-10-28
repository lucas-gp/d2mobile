# "Guild stash" service

Small dependency-free Node service: a shared trading stash between trusted friends (invitation code, deposit/withdrawal, log). No anti-cheat validation.

- Start: `GUILD_PORT=5320 GUILD_DATA=./.guild-data node server/guild/index.mjs` (Node ≥ 18)
- Listens on `127.0.0.1:${GUILD_PORT:-5320}` by default (`GUILD_HOST=0.0.0.0` to expose it); data in `${GUILD_DATA:-./.guild-data}/guilds.json` (atomic write).
- The client calls it at `/guild-api/...` (Vercel rewrite to `$GUILD_API_URL/:path*`, Vite proxy in dev).
- JSON API: `POST /create {name,nick}`, `POST /join {code,nick}`, `GET /state`, `POST /deposit {item,reqId,name?}`, `POST /withdraw {id,reqId}`, `POST /leave`; `Authorization: Bearer <token>`; `GET /health`.
- Ruleset: each stash belongs to a ruleset (`ruleset` from `POST /create`, `pd2` by default, returned by `/create`, `/join` and `GET /state`); `POST /join`, `/deposit` and `/withdraw` carry the client's ruleset and are rejected (`409 wrong_ruleset`) if it differs. Backward compatible: a stash stored without a ruleset (every stash from before) and a request without a ruleset (older clients) count as `pd2`; no data migration.
- Limits: 64 KB / request, 4 KB / item (bounded JSON: base = short identifier, depth 6, 400 values, 200-character strings, finite numbers, `__proto__`/`constructor` keys rejected), 300 items / stash, 8 members, 100 stashes (a stash inactive for 30 days is deleted), 20 creations per IP per day and at most 5 active stashes per IP, log of 200 entries, 60 req/min/IP (10 create+join/min).
- Client address: `X-Forwarded-For` is **never** read (forgeable). Behind a local Cloudflare tunnel, `GUILD_CLIENT_IP=cloudflare` reads `CF-Connecting-IP`, only if the connection comes from a trusted peer (`GUILD_TRUSTED_PEERS`, default `127.0.0.1,::1`). Typical chain (Vercel rewrite → tunnel) and settings: [docs/EXPLOITATION-IP.md](../../docs/EXPLOITATION-IP.md).
- No TLS and no CORS: the service is meant to sit behind a proxy or a same-origin rewrite.
- Test: `npx vitest run tests/unit/guild-server.test.ts`.
