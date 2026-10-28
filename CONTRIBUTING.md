# Contributing

Thanks for your interest! D2 Mobile is a non-commercial fan project (see [DISCLAIMER.md](DISCLAIMER.md)). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
npm ci
npm run dev        # dev server
npm run check      # tsc --noEmit + unit tests
npm run typecheck  # tsc for src, api, tests, mods, then tools/ and server/ (tsconfig.tools.json)
npm run lint       # ESLint (src, api, server, tests, tools)
npm run coverage   # unit tests with coverage thresholds (CI job; ~10 min)
npm run metrics    # long functions, files over 700 lines, import cycles (add -- --list for details)
```

Node.js 22+ (`.nvmrc`). No game files are needed. Before opening a pull request: `npm run typecheck` (the app, then `tools/` and `server/`
through `tsconfig.tools.json`; `tsx` runs the tools without type checking, so this is their only check), `npm run lint` and
`npm test` must pass (CI runs the same, plus a separate `npm audit --omit=dev` job, a gitleaks scan — never commit secrets — and, nightly, a vanilla bot smoke run and the mobile Playwright check). The long `bots` suite and the Playwright scripts in `tools/e2e`
([README](tools/e2e/README.md)) are run by hand when you touch balance or UI.

### Development with your own Diablo II files (optional)

Set `D2_PRIVATE_DIR` (default `~/d2-private`) to a local folder holding your archives in `in/` and patches in
`patch/`; generated output goes to `out/` (never committed). Typical loop:

```bash
export D2_PRIVATE_DIR=$HOME/d2-private PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/pw
D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5233 --strictPort &   # dev server
E2E_URL=http://127.0.0.1:5233/ node tools/e2e/map-confirm.mjs          # one end-to-end script
```

Tests that read local archives skip themselves when the files are missing. Deployment is optional; its options are
documented at the top of `tools/deploy.mjs`.

## Repository layout

| Folder | Contents | README |
|---|---|---|
| `src/sim` | deterministic game rules (25 Hz, no DOM), bots, loot, `.d2s` import | [src/sim](src/sim/README.md) |
| `src/data` | content tables (classes, skills, items, monsters, zones, runs) | [src/data](src/data/README.md) |
| `src/render` | Pixi.js renderer (reads the world, never writes it) | [src/render](src/render/README.md) |
| `src/ui` | DOM layer: HUD, panels, menus | [src/ui](src/ui/README.md) |
| `src/platform` | storage, service worker, audio, sync, guild, local Diablo II graphics | [src/platform](src/platform/README.md) |
| `src/input`, `src/core`, `src/i18n`, `src/debug` | controls, RNG/math, translation, `window.__arpg` debug hook | — |
| `api/`, `server/guild` | optional sync function (Vercel) and guild stash service | [api](api/README.md), [server/guild](server/guild/README.md) |
| `tests/unit`, `tests/bots` | vitest suites (CI runs `unit`) | — |
| `tools/` | sprite pre-rendering, importers, bots, e2e scripts, i18n extraction | [tools/e2e](tools/e2e/README.md), [tools/d2import](tools/d2import/README.md) |

Architecture overview (layers, frame, saves, builds, service worker): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Adding a skill, item, zone, class or translated string: [docs/GUIDE-CONTENU.md](docs/GUIDE-CONTENU.md) (French). Domain vocabulary
FR/EN: [docs/GLOSSAIRE.md](docs/GLOSSAIRE.md).

## Testing

**Two levels (lot 299).** While the game is being built, check what a change touches; the full set is kept for CI and before a deploy.

| Command | What | Time on a 16-core machine |
| --- | --- | --- |
| `npm run check:fast` | typecheck, ESLint and Prettier on the files changed since `HEAD` (`-- --base <ref>`), the unit tests importing them (`vitest related`) | 35-95 s (95 s when the base's core files change) |
| `npm run check:full` | typecheck, ESLint, Prettier, the whole unit suite, `npm run vanilla`, `npm run mods:suppression` | about 4 min |
| `npm run e2e:survivals:quick` | `tools/e2e/survivals.mjs --quick=1`: every scenario, 2 sizes instead of 6, one later act and one difficulty, no screenshot nor perf | about 4 min (full: about 11-12 min) |
| `npm run fingerprint -- --jobs 4 …` | the behaviour fingerprints, four sections at once | pd2 about 3.5 min (sequential: 10 min), d2 about 3 min (7 min) |

Each e2e line ends with the seconds since the previous one (`[+12.3 s]`) and the run with its total: where the time goes.

- `npm test` — unit tests (about a minute). Run a single file with `npx vitest run tests/unit/<name>.test.ts`.
- Interface tests run in a simulated DOM: start the file with `// @vitest-environment happy-dom` (see `tests/unit/ui-panels.test.ts`);
  test behaviour (what the player sees and does), not DOM snapshots.
- `npm run coverage` — same with coverage and the CI thresholds of `vitest.config.ts` (thresholds are only raised to a measured value).
- `npm run bots` — long balance simulations; `tools/bots/*.ts` for matrices and reports.
- `npm run test:build` — full public `vite build` checks (`tests/build`, vitest project `build`; CI job `suppression`).
- `npm run test:private` — end-of-batch check on a machine with your Diablo II files: fails if `D2_PRIVATE_DIR` lacks the archives or the
  exported maps (those tests skip themselves in CI), then runs the unit suite twice, with the `pd2` mod (`MODS=pd2`) and without mods (`MODS=`).
- Timing budgets of the few performance tests are multiplied by `PERF_SLACK` (`tests/perf.ts`; 1 locally, 4 in CI).
- `tools/e2e/*.mjs` — Playwright scripts against a running dev server (`E2E_URL`), for layout and UI flows.
- Refactoring without behaviour change: compare fingerprints before/after on deterministic inputs (seeded bot runs, built zones,
  panel DOM after seeded interactions), as recorded in [docs/JOURNAL.md](docs/JOURNAL.md) for lots 176 and 180-184.

## Rules

- **Never add assets or data you do not have the right to redistribute.** In particular no file extracted from
  Diablo II, Project Diablo 2 or any other commercial game (images, sounds, music, fonts, maps, archives). Gameplay data tables
  derived from the games and wikis are limited to those listed in [docs/DERIVED-DATA.md](docs/DERIVED-DATA.md) and are credited in `THIRD_PARTY_NOTICES.md`;
  data taken from a wiki keeps its license (`LICENSE-DATA.md`).
  The importer in `tools/d2import` must only ever read files the user owns, and its outputs stay out of git.
- New third-party assets need a compatible license (CC0, CC BY, OFL, MIT...) and an entry in
  `THIRD_PARTY_NOTICES.md` and `ASSETS.md`.
- Architecture: `src/data` -> `src/sim` (no DOM, deterministic) -> `src/render` / `src/ui`
  ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). The simulation must stay deterministic (seeded RNG, fixed 25 Hz step).
- Visible changes are added to the in-game changelog (`src/ui/changelog.ts`, FR + EN). New French texts need an English entry in `src/i18n/en.json` (`tests/unit/i18n-coverage.test.ts` fails when untranslated strings increase).
- Code style: Prettier config in `.prettierrc` (200 columns, single quotes). The code tree is formatted; `npm run format:check` is part of CI
  and `npm run format` fixes it (generated `*.gen.ts`, `public/` and `en.json` are ignored via `.prettierignore`).
- Security problems: do not open a public issue with details, see [SECURITY.md](SECURITY.md).
- Do not hard-code hosts, paths or credentials: use environment variables (see `.env.example`).
- Source comments and internal docs are mostly in French; English is welcome in new code and docs. `docs/internal/` holds French working notes (design, audits, studies), possibly outdated: see its [README](docs/internal/README.md).

## Commits and pull requests

Small, focused commits with a clear message. Describe what changed and how you tested it.
