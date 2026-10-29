# D2 Mobile (D2M)

A mobile-first, offline-capable **action RPG** (PWA) in the spirit of classic isometric ARPGs
such as Diablo II / Project Diablo 2. Seven classes, a deterministic 25 Hz simulation, loot with runes,
runewords, a Horadric-style cube, mercenaries, and automated "bot" players used as a balance benchmark. Rules can be
extended by mods (`mods/<id>/`, see [docs/MODS.md](docs/MODS.md)); corrupted zones and endgame maps belong to a Project Diablo 2
mod that ships with the repository and can be removed (see [docs/MODS.md](docs/MODS.md)). Written in TypeScript, rendered with Pixi.js.

**Play:** [d2mobile.vercel.app](https://d2mobile.vercel.app/) (in a mobile or desktop browser; you need your own Diablo II: Lord of Destruction files, imported locally).

**Community:** join the game's [Discord server](https://discord.gg/j6w8YVauR) for questions, feedback and bug reports.

> **Fan project, not affiliated with or endorsed by Blizzard Entertainment or Project Diablo 2.**
> No Blizzard binary asset (image, sprite, sound, map, archive) is included in this repository. See [DISCLAIMER.md](DISCLAIMER.md).
> The gameplay data (item, skill and monster tables, names) is re-created, in the project's own structures, from the games' data tables
> and community wikis (Project Diablo 2 wiki, CC BY-SA 4.0), with attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
> and [LICENSE-DATA.md](LICENSE-DATA.md); see [docs/DERIVED-DATA.md](docs/DERIVED-DATA.md). It is withdrawn on request of a rights holder.

## What is in the game

- **Two game modes**, each on two rulesets: **Diablo II (original)**, unmodified, or **Project Diablo 2** (season 13: endgame,
  corruption, reworked items).
  - **Normal**: the Campaign, Acts I to V on Diablo II's own maps (waypoints, quests, vendors, gambling, mercenaries, automap), and the
    endgame. Played in landscape.
  - **Survivals**: one-act runs, wave after wave, with a skill card to pick at every level; gear, gold and the acts opened stay from one
    run to the next. Portrait or landscape.
- **Seven classes**: Amazon, Assassin, Barbarian, Druid, Necromancer, Paladin and Sorceress.
- Made for touch screens (virtual stick, auto-aim, loot filter, auto-pickup), and playable with a mouse and keyboard too.
- Works offline and installs as an app (PWA). Saves stay on the device and can be exported and imported. English and French.

## How it started, and why it is open source

The game started with **no assets at all**: simple shapes, the rules and the simulation first. Free assets came next
(CC0 3D models pre-rendered to sprites), then the option to use your own Diablo II files, and then the **Project Diablo 2** mod.

I also added a **Survivals** mode (`mods/survivals/`). I know a very good survivors-like for Diablo II already exists, but I
wanted to try my own: it is a style of game I love, and before Diablo I first made survivors-like games on other themes.
Being open source, this one can be taken further by anyone who wants to.

**Adding a mod is easy.** The project is built so that mods can be plugged in and out. A mod is a single
`mods/<id>/` folder (a manifest and its content) that talks to the game only through a small API (`src/mods/api`, `src/mods/sdk`);
the game itself never imports a mod. Drop the folder in to plug a mod in; remove it, or leave it out of the build with
`MODS=pd2,survivals` (`MODS=` for none), to unplug it. Characters made with a missing mod are only greyed out until it comes back.
Write your own mod from scratch, or start from an existing one: `mods/pd2/` (a full content overhaul) and `mods/survivals/`
(a game mode) are complete examples. Guide: [docs/MODS.md](docs/MODS.md).

That is the point of publishing the code: I hope others will carry it on and make **more mods on mobile**.

## Screenshots

None are shipped on purpose: this repository contains no image taken from a commercial game, and screenshots
of the free-asset mode would be easy to add by contributors (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Quick start (development)

Requirements: Node.js 22 or newer.

```bash
npm ci
npm run dev          # dev server on 127.0.0.1 (npm run dev:lan: reachable from your phone on the local network)
npm test             # unit tests (vitest, project "unit")
npm run check        # type check + unit tests
npm run lint         # ESLint
npm run build        # type check + production build into dist/
```

The game is played only with your own Diablo II files (next section): the public build asks for them on first launch and
cannot be played without them. The repository ships no Blizzard asset; its own graphics (pre-rendered from free CC0 3D models, free
icons and original UI) only stand in for what has no Diablo II equivalent.

## Your own Diablo II files (required)

To play, you must **own Diablo II: Lord of Destruction** (valid license / CD key). The game uses your own copy for
graphics, sounds and maps, **for personal use only**:

- On first launch the game asks how to get the graphics (later: Settings > Advanced / Help > "Local graphics"). Pick your own
  `.mpq` archives (`d2data.mpq`, `d2char.mpq`, `d2exp.mpq`; sounds and music optional). The browser generates the
  sprites, sounds and maps **locally** in its own storage. **Nothing is uploaded to any server and nothing is
  committed to or redistributed with this repository.**
- Advanced: the same conversion is available as a command-line tool, `npm run d2 -- <command>`
  ([tools/d2import/README.md](tools/d2import/README.md)), which writes to a folder outside the repository
  (`D2_PRIVATE_DIR`, see [.env.example](.env.example)). Generated files are git-ignored. Do not share them.

Without these files the game does not start; only development builds (and `D2_ALLOW_SKIP=1` test builds) can fall back to the
bundled free assets.
This repository does not tell you where to obtain game files: use your own legitimate copy.

## Privacy

The game runs on your device. The only thing it sends by default is an **anonymous player counter**: a random id made on your device, "in game / in menu", the game version and the build (public, or the full build with the optional services, see [ARCHITECTURE](docs/ARCHITECTURE.md)), once at launch and every minute while the tab is visible. No name, no save, no IP address, no cookie, no fingerprinting. Turn it off in Settings → Advanced → "Anonymous usage statistics" (it is also off with "Do Not Track" / Global Privacy Control). Details: [PRIVACY.md](PRIVACY.md) (English and French). The counter does nothing unless its optional service ([server/stats](server/stats/README.md)) is wired in at deploy time; this repository contains no server address.

## Architecture

Strictly layered: `src/data` (content) -> `src/sim` (deterministic rules, no DOM) -> `src/render` (Pixi) and
`src/ui` (DOM). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (overview, frame loop, saves, builds, service worker) and the README
of each main folder (`src/sim`, `src/data`, `src/render`, `src/ui`, `src/platform`, `api`). Adding content (skill, item, zone, class, translated
string): [docs/GUIDE-CONTENU.md](docs/GUIDE-CONTENU.md); vocabulary: [docs/GLOSSAIRE.md](docs/GLOSSAIRE.md). Other useful documents: [ASSETS.md](ASSETS.md) (asset origin and
licenses), [docs/DERIVED-DATA.md](docs/DERIVED-DATA.md) (game-data tables and their origin),
[docs/JOURNAL.md](docs/JOURNAL.md) (project history), [docs/internal/BACKLOG.md](docs/internal/BACKLOG.md).
Deliberate departures from Diablo II kept for play on a phone (virtual stick, auto-aim, gold picked up automatically, items dropped
identified, potions in percent, loot filter…): "Décisions volontaires" in [docs/internal/AUDIT-COMPLET.md](docs/internal/AUDIT-COMPLET.md).
Most internal documents are written in French.

## npm scripts

| Script                                              | What it does                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev` / `preview`                                   | Vite dev server / preview of the production build                                                                                                                         |
| `build`                                             | `tsc --noEmit` then `vite build`                                                                                                                                          |
| `typecheck`, `lint`, `test`, `check`                | type check, ESLint, unit tests, type check + unit tests                                                                                                                   |
| `check:fast`, `check:full`                          | checks of the files changed since `HEAD` (type check, ESLint, Prettier, related tests) / everything the CI runs (about 4 min), see [CONTRIBUTING.md](CONTRIBUTING.md)     |
| `format`, `format:check`, `coverage`                | Prettier (write / check), unit tests with coverage                                                                                                                        |
| `fingerprint`                                       | behaviour fingerprints, to compare the game before and after a change                                                                                                     |
| `vanilla`, `mods:residual`, `mods:suppression`      | base game tables checked against your own Diablo II files; the base's remaining dependencies on the Project Diablo 2 mod; the repository built and tested without `mods/` |
| `metrics`                                           | code metrics: functions over 100/200 lines, files over 700 lines, import cycles                                                                                           |
| `bots`, `bot:loot`, `bot:combat`, `bot:progression` | long simulation tests with automated players (not run in CI)                                                                                                              |
| `sprites`                                           | re-render sprite sheets from the 3D sources in `assets-src/` (needs Chromium via Playwright)                                                                              |
| `d2`                                                | command-line importer for your own Diablo II archives                                                                                                                     |
| `e2e`, `e2e:survivals`, `validate`                  | Playwright end-to-end checks, see [tools/e2e/README.md](tools/e2e/README.md)                                                                                              |
| `deploy`                                            | optional Vercel deployment script, configured only by environment variables ([.env.example](.env.example), options documented at the top of `tools/deploy.mjs`)           |

A public build without any imported sprites: `D2_SPRITES=0 D2_PUBLIC=1 npx vite build`. It asks for the player's Diablo II files
on first launch and cannot be played without them. For end-to-end tests only, `D2_ALLOW_SKIP=1` adds a link to play with the
replacement graphics; never use it for a deployed build.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Never add game files
or assets you do not have the right to redistribute.

## Contact, takedown requests

This is a non-commercial fan project. For questions, bug reports, or if you are a rights holder and want something removed or
credited differently (DMCA or similar), please open a GitHub issue on this repository; requests are handled promptly. Security reports: see [SECURITY.md](SECURITY.md).

## Security

See [SECURITY.md](SECURITY.md) to report a vulnerability privately and for the known limits of the optional sync and guild services.

## License

Code: [MIT](LICENSE). Data derived from the games and the Project Diablo 2 wiki is not under MIT: [LICENSE-DATA.md](LICENSE-DATA.md).
Third-party assets and data keep their own licenses:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Trademarks: [DISCLAIMER.md](DISCLAIMER.md).
