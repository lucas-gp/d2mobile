# api — save synchronization (Vercel function)

Server for the **zero-knowledge** synchronization: it only receives saves encrypted by the client
(`src/platform/sync*.ts`) and an `authHash` derived from the password, never the password or the key. Protocol, cryptography, merging
and limits: [docs/ARCHITECTURE.md § Synchronization](../docs/ARCHITECTURE.md#synchronization-account-encrypted-saves).

| File                 | Purpose                                                                                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync.ts`            | `POST /api/sync` entry point (Vercel Node function): body size (`MAX_BODY`), allowed origin (`originAllowed`: same host, `SYNC_ALLOWED_ORIGINS`, localhost outside production), headers (`no-store`), delegation to `handle`.                                                                                    |
| `_lib/core.ts`       | Storage-independent logic: actions `params`, `register`, `login`, `list`, `get`, `put`, `delete`, `stage`, `changePassword`; accounts stored under an HMAC of the name (`SYNC_PEPPER`), progressive lockout after failures, in-memory per-IP rate limiting, version check (409 `conflict`).                     |
| `_lib/blob-store.ts` | Vercel Blob storage (private store), conditional write (`ifMatch`).                                                                                                                                                                                                                                            |

- **Variables**: `BLOB_READ_WRITE_TOKEN`, `SYNC_PEPPER` (≥ 32 characters, never change it: it is what finds the accounts),
  `SYNC_ALLOWED_ORIGINS` (optional), `SYNC_MAX_ACCOUNTS` (default 200) and `SYNC_MAX_ACCOUNT_BYTES` (default 16 MB) (optional). None of them is in the repository.
- **Tests**: `tests/unit/sync-api.test.ts` (API on a fake storage), `sync-quota.test.ts`, `sync-engine.test.ts` (two devices). The public online version (`deploy --public`) does not ship this function.
- **Pitfalls**: limit the size before parsing the JSON; any new account field must stay compatible with existing accounts
  (no server-side migration).
