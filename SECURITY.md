# Security policy

## Reporting a vulnerability

Please report security problems **privately**: open a private vulnerability report on GitHub
(the repository's _Security_ tab, "Report a vulnerability"). If that is not available, open an issue that says only
that you have a security report, without technical details, and a private channel will be arranged.

Please do not publish details before a fix is available. This is a hobby project: expect a first answer within about a week.

## Scope and design notes

- The game runs entirely on your device. Saves are stored in the browser (`localStorage`); nothing is sent unless you use the optional services below.
- **Save synchronization** (`api/`, optional): saves are encrypted on the device with AES-256-GCM before upload; the key comes from your password via
  PBKDF2-SHA256 (600 000 iterations minimum, enforced by the server and checked by the client, which refuses weaker parameters). The server never sees the
  password or the key. **There is no password recovery.** Known limits:
  - The authentication hash and the encryption key are two halves of one 512-bit PBKDF2 output (no HKDF split). An attacker who only holds the encrypted
    blobs pays about half the cost of the legitimate user. Separating the keys would need a derivation version stored with each account (existing accounts
    could not log in otherwise); it is planned, not done.
  - Rate limiting is kept in memory per server instance. The lockout after 5 failed logins is stored in the account; a device that already logged in sends a
    random device token and is not affected by it (so someone who knows the account name cannot lock the player out of their devices), but a new device is.
  - Storage is capped: 16 MB of saves per account and 200 accounts per store by default (`SYNC_MAX_ACCOUNT_BYTES`, `SYNC_MAX_ACCOUNTS`; a best-effort
    counter in the store), so the worst case is about 3.2 GB plus one staged copy per save during a password change. There is no expiry of unused
    accounts: a deployment should still add storage alerts and, if needed, firewall rules on `/api/sync`.
  - `register` reveals whether an account name exists.
- **Guild vault** (`server/guild`, optional): a small service for friends who trust each other (shared code). It listens on `127.0.0.1` by default and never reads
  `X-Forwarded-For` (forgeable); behind Cloudflare set `GUILD_CLIENT_IP=cloudflare` to read `CF-Connecting-IP` from the local tunnel only (`docs/EXPLOITATION-IP.md`). It has no TLS and no accounts; put it behind a reverse proxy. Items are validated structurally
  (bounded JSON), not against the game rules, and the client rejects implausible items.
- **Anonymous player counter** (`server/stats`, optional; see [PRIVACY.md](PRIVACY.md)): the client sends a random id, "in game / in menu", the game version and the site, once per minute while the tab is visible; it is off with the player's setting or "Do Not Track" / Global Privacy Control. The service stores no IP address and no User-Agent (the address is used in memory only, for rate limiting), purges raw pings after 48 hours, closes CORS and protects `/stats` and `/stats.html` with a token read from `STATS_ADMIN_TOKEN` (constant-time comparison, `Authorization: Bearer` only, never in the URL; failed attempts are rate-limited). Known limits: anyone can send fake pings and inflate the counts (rate limits only slow this down: 60 requests per minute and 50 new ids per day per address, as seen by the service; `X-Forwarded-For` is never read; behind Cloudflare set `STATS_CLIENT_IP=cloudflare`, otherwise every visitor shares the tunnel's address, see `docs/EXPLOITATION-IP.md`); the figures are indicative, not a proof of identity or unique people.
- **Local servers**: `npm run dev` and `npm run preview` listen on `127.0.0.1` (`npm run dev:lan` or `VITE_HOST=0.0.0.0` exposes them on purpose); sprites generated from your own game files under `/d2/` are only served to loopback clients.
- **Imported saves** are validated (size, structure, known items) before they become a character.
- The deployed site sends a Content-Security-Policy and other hardening headers (`vercel.json`).

## Supported versions

Only the latest `main` is supported.
