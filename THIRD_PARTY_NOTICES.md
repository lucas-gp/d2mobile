# Third-party notices

D2 Mobile's own source code is MIT-licensed (see `LICENSE`): that license covers only the code written by the
repository's contributors. Third-party assets and data keep their own licenses, listed here; game names, trademarks and
game data belonging to others are not licensed by it (see `DISCLAIMER.md`). This file lists the third-party software,
assets and data the repository uses or derives from, with their licenses. Per-pack license files are kept
next to the sources in `assets-src/**` (`LICENSE.txt`, `License.txt`, `OFL.txt`). Details per pack
(source URL, commit, files kept, transformations): `ASSETS.md`.

**No binary asset (image, sprite, sound, map, archive) from Diablo II, Project Diablo 2 or any other commercial game is included.** Some gameplay data tables are derived from the games' data tables and from community wikis, see section 3, `docs/DERIVED-DATA.md` and `DISCLAIMER.md`.

## 1. npm dependencies

| Package         | Version | License    | Use                                                               |
| --------------- | ------- | ---------- | ----------------------------------------------------------------- |
| pixi.js         | 8.21.0  | MIT        | 2D WebGL renderer (runtime)                                       |
| @vercel/blob    | 2.8.2   | Apache-2.0 | storage for the optional sync API (`api/`, server side)           |
| three           | 0.186.1 | MIT        | sprite pre-rendering pipeline (dev)                               |
| upng-js         | 2.1.0   | MIT        | PNG encoding (dev tooling); depends on pako 1.0.11 (MIT AND Zlib) |
| playwright-core | 1.56.1  | Apache-2.0 | headless Chromium for pre-rendering and e2e tests (dev)           |
| vite            | 8.3.5   | MIT        | bundler / dev server (dev)                                        |
| vitest          | 5.0.5   | MIT        | unit tests (dev)                                                  |
| happy-dom       | 21.0.4  | MIT        | DOM for the interface unit tests (dev)                            |
| typescript      | 5.9.3   | Apache-2.0 | type checking (dev)                                               |
| tsx             | 4.23.15 | MIT        | TypeScript script runner (dev)                                    |
| @types/node     | 22.20.4 | MIT        | typings (dev)                                                     |

Transitive dependencies (about 90 packages: MIT, Apache-2.0, ISC, BSD-3-Clause, MPL-2.0 for the build-only
`lightningcss`) keep their own licenses; see `package-lock.json` and `node_modules/*/LICENSE`.
Every build writes `THIRD_PARTY_LICENSES.txt` at the root of the output (`tools/build/licenses-plugin.ts`): name, version, license and license
text of each npm package actually bundled (pixi.js and its runtime dependencies), so that the copyright notices travel with the distributed game.
Additional dev-only ESLint/Prettier packages are listed in `package.json` (MIT / Apache-2.0).

## 2. Assets (`assets-src/`, `public/`)

| Content                                                                                                                                                                   | Author                                                                                   | License                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KayKit: Adventurers, Skeletons, Dungeon Remastered, Halloween Bits, Medieval Hexagon (3D models)                                                                          | Kay Lousberg (kaylousberg.com)                                                           | CC0 1.0                                                                                                                                                          |
| Quaternius: Ultimate Animated Character, Ultimate Monsters, Ultimate Animated Animals, Easy Enemy, Animated Monster, Medieval Village, Survival, Ultimate RPG (3D models) | Quaternius (quaternius.com)                                                              | CC0 1.0                                                                                                                                                          |
| Poly Haven textures (1K diffuse)                                                                                                                                          | Rob Tuytel, Amal Kumar, and Poly Haven contributors (polyhaven.com)                      | CC0 1.0                                                                                                                                                          |
| Kenney: RPG Audio, Impact Sounds, Interface Sounds, Sci-Fi Sounds (`public/audio`, 45 MP3 encoded from these)                                                             | Kenney Vleugels (kenney.nl)                                                              | CC0 1.0                                                                                                                                                          |
| Kenney: UI Pack RPG Expansion, Fantasy UI Borders                                                                                                                         | Kenney Vleugels (kenney.nl)                                                              | CC0 1.0                                                                                                                                                          |
| game-icons.net icons (`assets-src/ui/game-icons`, `public/icons`; 267 icons)                                                                                              | Lorc (242), Delapouite (22), sbed, Felbrigg, Carl Olsen, and game-icons.net contributors | **CC BY 3.0** (https://creativecommons.org/licenses/by/3.0/): attribution required; shown in the in-game credits screen. Icons are recolored to white SVG masks. 24 more files in `public/icons` reuse one of these shapes under another skill name; 3 (`bow`, `polearm`, `type_quiver`) are in-house vector drawings (see `assets-src/ui/game-icons/icons-extra.txt` and `ASSETS.md`). |
| Cinzel, Cinzel Decorative                                                                                                                                                 | Natanael Gama / The Cinzel Project Authors                                               | SIL OFL 1.1                                                                                                                                                      |
| Alegreya SC                                                                                                                                                               | Juan Pablo del Peral / Huerta Tipografica                                                | SIL OFL 1.1                                                                                                                                                      |
| IM FELL English                                                                                                                                                           | Igino Marini                                                                             | SIL OFL 1.1                                                                                                                                                      |
| Sprite sheets (`public/sprites/hi`, `public/sprites/lo`) | Generated by `tools/prerender` from the CC0 models above | derived works of CC0 material (CC0-compatible) |
| Application icon (`assets-src/app-icon`, `public/icon-*.png`)                                                                                                             | Original work by the D2 Mobile contributors                                              | MIT, like the code                                                                                                                                               |

Cinzel Decorative and IM FELL English are kept in `assets-src/fonts` only: no code uses them and they are not in `public/` nor in the build.
The OFL fonts are redistributed unmodified in `public/fonts`; their license texts are in `assets-src/fonts/*/OFL.txt`
(Reserved Font Names are respected: the fonts are not renamed or modified).

## 3. Reference code and data (facts only)

### Riiablo (Apache-2.0)

`docs-data/riiablo-ui-layout.json` and `docs/internal/RIIABLO-NOTES.md` record interface layout facts (positions and sizes of
panels, buttons and slots, in original pixels) read from the open-source **Riiablo** project
(https://github.com/collinsmith/riiablo, Copyright collinsmith and contributors). Its license, verified on
the repository's LICENSE file (GitHub license API: `Apache-2.0`), is the **Apache License 2.0**
(https://www.apache.org/licenses/LICENSE-2.0). Only numeric values are reused: no Riiablo source code or assets are copied into this
repository. This notice satisfies the attribution requirement.

One input of a generator comes from Riiablo's repository but is **not** Riiablo's work: `obj.txt` (act and DS1 object id → row of
`objects.txt`) is a Diablo II data table that Riiablo redistributes; it is **not** covered by Riiablo's Apache-2.0 license. It is read from the
player's private folder (`<input>/obj.txt`, never in the repository) by `tools/audit/gen-world-objects.ts`, and only the object kind of each row is
kept in `src/data/worldobjects.ts`, which is a Diablo II derived table (`LicenseRef-D2-Derived-Data`, see `LICENSE-DATA.md`).

### Third-party copies of the game tables

Besides the player's own archives, some values were taken from, or cross-checked against, third-party copies of game data tables:

- **Project Diablo 2 season-13 tables** (`Skills.txt`, `SkillDesc.txt`, `MonStats.txt`) as published in https://github.com/coleestrin/pd2-tools
  (`api/src/game-data/pd2/season-13/`), and its `web/public/items.json` (a dump of the PD2 wiki): the source of the PD2 skill numbers and
  synergies (`mods/pd2/tools/skilldata/`), of some PD2 monster values and of the PD2 runewords (`mods/pd2/docs/ETUDE-PD2.md`).
- **Diablo II 1.13 tables** as published in https://github.com/fabd/diablo2 (`code/d2_113_data/`): used for the early study of the rules and
  for cross-checks; the base game's tables in `src/data` are regenerated from the player's own archives (`npm run vanilla`).
- **Arreat Summit** (Blizzard's former official strategy site) and community sites (classic.battle.net, purediablo): consulted as references.

These tables are game data of Blizzard Entertainment, Inc. and of the Project Diablo 2 team: the licences of those repositories' code do not
cover them, and this repository does not license them either. Values derived from them are listed in `docs/DERIVED-DATA.md` and
`LICENSE-DATA.md` and are not under MIT.

### D2MOO (MIT) - reference consulted, facts only

Many comments cite function and file names of **D2MOO** (https://github.com/ThePhrozenKeep/D2MOO, "The Phrozen Keep community", MIT license),
a reimplementation of the Diablo II game code, as the source of a formula or a rule (for example `SUNITDMG_ComputeExperienceGain` in
`SUnitDmg.cpp`). It was read as a reference only: formulas are rewritten in this project's own code and structures, and **no D2MOO source code is
copied** into this repository (checked: no D2MOO identifiers or C/C++ code outside comments). No notice is legally required; this line keeps
the citations traceable.

### Project Diablo 2 wiki (CC BY-SA)

Several data files record gameplay facts documented on the **Project Diablo 2 wiki**
(https://wiki.projectdiablo2.com). The wiki states that its content is available under
**Creative Commons Attribution-ShareAlike 4.0 International** (https://creativecommons.org/licenses/by-sa/4.0/),
and the Diablo wiki on Fandom (https://diablo.fandom.com) under CC BY-SA 3.0 (Fandom's default license for wiki text,
https://creativecommons.org/licenses/by-sa/3.0/; the text only, not images or other media). Both licenses were re-checked on 2026-10-16
(the PD2 wiki footer reads "Content is available under Creative Commons Attribution-ShareAlike 4.0 International unless otherwise noted").
Data derived from them is, in the repository:

- the generated TypeScript tables built from the PD2 wiki: `mods/pd2/data/items/uniques.ts`,
  `mods/pd2/data/skills.ts`, `mods/pd2/data/mercs.gen.ts`, `mods/pd2/data/mercs.patch.ts`, `mods/pd2/data/cube.ts`, `mods/pd2/data/items/quivers.ts`, `mods/pd2/data/maps.ts`, `mods/pd2/data/classes.patch.ts`, the PD2 patches of the vanilla tables `mods/pd2/data/items/{bases,runes,uniques,sets,affixes,runewords}.patch.ts`, `mods/pd2/data/cube.patch.ts`, `mods/pd2/data/levels.patch.ts` and `mods/pd2/data/skills.patch.ts` (season 13 skill trees) (PD2 values
  generated by diff against the base's Diablo II tables, which are regenerated from the player's own game files and contain no wiki data), and the raw
  extract `mods/pd2/tools/skilldata/pd2-wiki.json` (kept for the test that checks the skill tables).
  These are **CC BY-SA 4.0** (the PD2 wiki license). Each file carries an `SPDX-License-Identifier` header (the JSON files `mods/pd2/tools/skilldata/pd2-wiki.json` and
  `mods/pd2/tools/audit/pd2-zones.json`, which cannot, are listed in `LICENSE-DATA.md`).
- Other tables mix facts from the games' data files and wiki figures (see `docs/DERIVED-DATA.md` for the exact list and status).

The larger raw wiki dumps used to generate them (`pd2-*.json` under `tools/itemdata` and `tools/skilldata`) are **not** in the repository
(git-ignored); they can be regenerated from the wiki with the scripts in `tools/`.

License versions: the PD2 wiki is **CC BY-SA 4.0**; the Diablo wiki on Fandom is **CC BY-SA 3.0**. CC BY-SA 3.0 material cannot simply be relicensed as 4.0,
so the two are kept apart: no data file in the repository is identified as taken from the Fandom wiki; should one be, it keeps CC BY-SA 3.0 and is
marked as such in `LICENSE-DATA.md`. Per-file licenses: `LICENSE-DATA.md`.

Attribution: "Project Diablo 2 Wiki contributors, https://wiki.projectdiablo2.com, CC BY-SA 4.0" and "Diablo Wiki contributors (Fandom), https://diablo.fandom.com, CC BY-SA 3.0". Changes were made
(extraction, restructuring into code tables, translation). The ShareAlike condition applies to these
data files and their adaptations: they stay under CC BY-SA and are **not** relicensed under MIT. (Owner decision of
2026-10-16: these data are kept, with full attribution, and no replacement is planned for now; see `docs/DERIVED-DATA.md`.)

### Diablo II and Project Diablo 2 game rules

Numeric game rules (damage, resistances, drop structures, recipes...) are gameplay facts recoded in this project's
own structures. They are not licensed by this repository: the underlying game and its names remain the property of
Blizzard Entertainment, Inc. and of the Project Diablo 2 authors (see `DISCLAIMER.md`).

## 4. Third-party code and constants (`tools/d2import`)

These notices must be kept with copies of the corresponding code. The importer of the player's own files (`tools/d2import`) also runs in the
browser, so this code is part of the game's bundle: every build copies the notices of the files it bundles into `THIRD_PARTY_LICENSES.txt`
(`tools/build/licenses-plugin.ts`, which reads this section).

### blast.c (zlib license) - `tools/d2import/blast.ts`

Port to TypeScript of `blast.c` from zlib's `contrib/` (PKWARE DCL "implode" decompression), Copyright (C) 2003, 2012, 2013 Mark Adler.

This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any damages arising from the use of this software.

Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and redistribute it freely, subject to the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.
2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.
3. This notice may not be removed or altered from any source distribution.

### tiny-inflate (MIT) - `tools/d2import/inflate.ts`

Synchronous zlib inflate following the algorithm of **tiny-inflate** (https://github.com/foliojs/tiny-inflate), Copyright (c) 2015-present Devon Govett.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### StormLib (MIT) - `tools/d2import/huffman-tables.ts`, `tools/d2import/mpq-audio.ts`

The initial weights of the adaptive Huffman trees of the MPQ format are constants taken from **StormLib**, and the adaptive Huffman and
ADPCM decoders follow the algorithms it documents (https://github.com/ladislav-zezula/StormLib), Copyright (c) Ladislav Zezula.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
