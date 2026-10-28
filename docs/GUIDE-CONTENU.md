# Adding content

Step-by-step guides verified by actually following them on a copy of the repository (skill, unique item, run, translated string; for a class,
the list of files comes from the compiler). After each addition: `npx tsc --noEmit`, `npm run lint`, then the tests listed;
`npm test` before the merge request. Vocabulary: [GLOSSAIRE.md](GLOSSAIRE.md). Content derived from a game or a wiki: read
[DERIVED-DATA.md](DERIVED-DATA.md) and [LICENSE-DATA.md](../src/data/LICENSE-DATA.md) before adding anything.

## A translated string

The source text is in French; English is displayed by default, through automatic translation of the DOM (`src/i18n/index.ts`).

1. Write the French text in the code (`el('div', { textContent: 'Coffre plein.' })`). For text that does not go through the DOM
   (canvas, `document.title`), wrap it in `tr(…)`.
2. Add the entry to `src/i18n/en.json`: `"Coffre plein.": "Stash full."`. A variable part is written `{0}`, `{1}`… in both
   languages (`"Objets importés : {0}": "Items imported: {0}"`): only the positions matter. The order of keys in the file is free.
3. `npx vitest run tests/unit/i18n-coverage.test.ts`: the test fails, listing every French text without an entry (threshold 0). Observed:
   a constant `'Texte d’essai à traduire, avec accents'` added to `src/ui/tips.ts` makes the test fail until its
   entry is in `en.json`.
4. A node that is already in the right language (the changelog) is marked `data-notr`.

Visible to the player? Also add a FR + EN line to `src/ui/changelog.ts`.

## A skill

Worked example: a Barbarian strike `test_slam`.

1. **Data** — in `src/data/skills-<classe>.ts` (`skills.ts` for the Sorceress), an `S({ … })` entry:
   `id` (stable: it is written into saves), `name` and `desc` (French), `tree` (one of the class's trees, `TREES` in
   `classes.ts`), `row` (1-6) and `col` (0-2) **free in that tree**, `reqLvl`, `prereqs`, `element`, `target`, `range` (units),
   `kind` (archetype: `strike`, `spell`, `aura`, `buff`…), `melee` if it is a weapon attack, `synergies`, and the numbers `n`
   (`mana`, `min`/`max`, `wdmg`, `ar`, `radius`, `duration`…, per-level tables built with `P([...])` from `data/ramp.ts`).
   The PD2 mod can replace these numbers by identifier (`mods/pd2/data/skills.ts`, `mods/pd2/data/skills.patch.ts`).
2. **Effect** — in `src/sim/<classe>.ts`, a `castTestSlam(ctx)` function and its entry in the class table
   (`BARBARIAN_CASTS`, `DRUID_CASTS`, `PALADIN_CASTS`, `AMAZON_CASTS`, `NECROMANCER_CASTS`, `ASSASSIN_CASTS`; the Sorceress:
   `skill-cast-sorc.ts`). The context provides `w`, `id`, `tx`, `ty`, `targetId`, `L` (effective level), `s`, `p`, `n`, `ang`… Use only
   the world's random streams (`w.rng.combat`, `w.rng.loot`…). Auras, curses and traps go through their lists
   (`AURAS`, `CURSES`, `TRAPS`) before the table.
3. **Icon** — `public/icons/<id>.svg` (or an `icon` field pointing to an existing icon), with its provenance in
   `assets-src/ui/game-icons/icons.txt` (game-icons.net) or `icons-extra.txt`.
4. **Translations** — `name` and `desc` in `src/i18n/en.json`.
5. **Numeric text** (optional) — skill-specific lines in `SPECIFIC_LINES` of `src/ui/skilltext.ts` (the common lines —
   damage, mana, radius, duration, weapon, synergies — are automatic).
6. **Tests** — `tests/unit/skills.test.ts` and `tests/unit/integrity.test.ts` count the skills: update the class's `SKILL_COUNT`
   and the total (`SKILLS.length`). `skills.test.ts` automatically creates an "observable effect" test for the new skill
   (cast in an arena: it must hit, summon or change a stat). Run
   `npx vitest run tests/unit/skills.test.ts tests/unit/integrity.test.ts tests/unit/i18n-coverage.test.ts mods/pd2/tests/unit/skills-pd2-<classe>.test.ts`.

## A unique item (or a base)

1. **Unique** — a `UniqueDef` entry in `PD2_UNIQUES` (`src/data/items/uniques.ts`):
   `{ id: 'u_test_ring', name: 'Anneau d’essai', base: 'ring', lvl, reqLvl, rarity, mods: [r('life', 10, 20), r('resAll', 5, 10)] }`;
   `base` is the identifier of an existing base, each `stat` a known stat (`src/data/stats.ts`, checked by
   `integrity.test.ts`). `noRandomDrop: true` restricts it to scripted drops. The `uniques-d2.ts`, `sets-d2.ts`,
   `affixes-d2.ts`, `runewords-d2.ts` tables are derived data: modify them only in compliance with `docs/DERIVED-DATA.md`. `uniques-d2.ts`,
   `sets-d2.ts`, `affixes-d2.ts`, `runewords-d2.ts`, `bases-classes.ts`, the rune and gem rows of `runes.ts` and the D2 values of the bases are Diablo II LoD 1.13c,
   regenerated from the MPQs (`npm run vanilla`, batches M6 and M10): do not edit them by hand; their Project Diablo 2 values are in the
   mod's patch (`mods/pd2/data/items/*.patch.ts`, see the header of those files).
2. **New base** — `mk({ … })` in `src/data/items/bases.ts` (or the class list in `bases-classes.ts`): type, tier, item
   level, requirements, damage or defense, sockets, slot; `registerBases` rejects duplicates. An item base used by a single unique
   only goes in `EXTRA_BASES` (`uniques.ts`). Inventory size: `sizes.ts`; icon: `src/ui/itemicon.ts`.
3. **Translation** of the name in `en.json`.
4. **Tests** — `npx vitest run tests/unit/integrity.test.ts tests/unit/items.test.ts mods/pd2/tests/unit/pd2-items.test.ts tests/unit/i18n-coverage.test.ts`.

## A zone and its run

Worked example: `test_crypt`.

1. **Zone** — `src/data/zones/<nom>.ts` exports `build<Nom>(seed, difficulty): ZoneDef`, built with `ZoneBuilder`
   (`zones/builder.ts`): `start(x, y)`, `block(x0, y0, x1, y1)` (solid walls), `rect` / `circle` / `path` (floor), `prop(id, x, y)`
   (known prop from `data/props.ts`), `spawn({ monster, x, y, count, r, rank, trigger, runBoss })`, `object({ kind, x, y })`, `light(…)`.
   All randomness comes from an `Rng` created with the seed (`new Rng(\`<id>:${seed}\`)`). A zone that has a Diablo II map ends with
   `withD2Farm(b.build(), seed, difficulty)` (the map is used if it is loaded).
2. **Run** — a `RunDef` entry in `RUNS` (`src/data/runs.ts`): `id`, `name`, `zoneKey` (rune table and ambience of an existing
   zone), `desc`, `zoneLevel` and `recLevel` per difficulty, `focus`, `boss` (the monster whose death ends the run, with
   `runBoss: true` in the zone), `build`, `firstClear`. The run appears on its own in the waypoint (`Game.runOptions`, except `hidden` and `campaign`). `campaign`, `waypoint`,
   `hidden`, `botSkip`: see the comments on `RunDef`.
3. **Population based on Levels.txt** (optional) — a plan in `LEVEL_PLANS` (`levels.ts`, `levels-a*.ts`).
4. **Translations** — zone name, run name and run description in `en.json`.
5. **Tests** — `tests/unit/zones.test.ts` (everything is reachable from the start, for every non-campaign run),
   `integrity.test.ts` (building each run in all three difficulties: valid props, monsters and start), `runs.test.ts`,
   `i18n-coverage.test.ts`.

## A class

The compiler itself lists the tables to fill in: add the identifier to `ClassId` (`src/data/classes.ts`) then run
`npx tsc --noEmit`. Result observed when adding `'monk'`:

- `src/data/classes.ts`: `CLASSES` (`ClassDef`: attributes, life / mana, FCR/FHR/FBR breakpoints, `trees`, `classStat`, `sprite`,
  `startSkill`, `defaultTree`, `desc`) and `ClassOnly` (`data/types.ts`, class-restricted items);
- `src/data/attack-anim.ts` (`ANIM_A`, attack frames by weapon category);
- `src/sim/game.ts` (`START`, starting equipment);
- `src/ui/charselect.ts` (`PORTRAIT`), `src/ui/d2charselect.ts` (`CREATE_ORIGIN`, `ANCHOR_TO_FEET`), `src/ui/npcdialog.ts` (`CLASS_EN`).

Then, outside the compiler's reach: `CLASS_IDS` (same file), the three trees in `TREES` and the `SkillTree` type (`data/types.ts`), a
`skills-<classe>.ts` file merged into `skills.ts`, a `src/sim/<classe>.ts` file called by `castSkillImpl` (`skill-cast.ts`), the
sprites (`tools/prerender`, `render/roster.ts`, `render/weapon-look.ts`), the class-restricted bases (`bases-classes.ts`), the bot
(`BUILD_CLASS` in `sim/bot/brain.ts`, kits in `bot/arena.ts`) and the tests that count classes, trees and skills
(`classes-data.test.ts`, `skills.test.ts`, `save-check.test.ts`). This is a project in its own right: plan the sprites before the code.
