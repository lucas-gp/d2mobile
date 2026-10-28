# Writing a mod for D2 Mobile

A mod is a `mods/<id>/` folder: a manifest (`manifest.ts`, loaded at startup) and content (`index.ts`, a separate chunk loaded when
the ruleset is activated). From the game it imports only `src/mods/api` (types, manifest) and the `src/mods/sdk` engine (its code); nothing in the
game imports a mod (ESLint rule `d2m/mod-boundary`). Internals (registries, named rules, activation, derived
tables): `src/mods/README.md`. Complete example: `mods/pd2/` (Project Diablo 2).

## Three kinds of mod

| `kind`     | Role                                                                                                                     | Ruleset                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `overhaul` | content overhaul (items, skills, rules): a full ruleset in its own right; at most one per ruleset                        | `<id>` (e.g. `pd2`); the base game alone is `d2` |
| `gamemode` | game mode stackable on a content ruleset (`d2` or an overhaul): it adds a screen, a rule, a way to play (e.g. Survivals) | `<contenu>+<mode>` (e.g. `d2+survivals`)         |
| `addon`    | content addition (reserved: not yet offered at character creation)                                                       | —                                                |

A character's ruleset is fixed at creation and never changes (no conversion): items store only
identifiers and rolls, which only make sense under the rules that produced them. Full identifier: the content, then the sorted game
modes, separated by `+` (`rulesetId`, `parseRuleset`, `contentRuleset` in `src/mods/activate.ts`). A game mode **shares the guild of its
content ruleset** but, since lot 299, has **its own shared stash** (`d2m.shared.<content>+<mode>`, first a copy of its content's stash,
then apart: `pd2+survivals` and `pd2` keep different stashes, as their characters are listed apart).

One ruleset per page session: creating or playing a character from another ruleset reloads the page (creation is
resumed after the reload: `pendingCreate`, `src/platform/platform.ts`).

## Manifest

```ts
import { defineManifest } from '../../src/mods/api';

export default defineManifest({
  id: 'survivals', // [a-z0-9-], nom du dossier, espace de noms des entrées ajoutées (« survivals:… »)
  name: 'Survivals',
  version: '1.0.0',
  kind: 'gamemode',
  rulesets: ['d2', 'pd2'], // jeux de règles de contenu acceptés ; absent : tous
  description: 'Vagues sans fin : un choix de compétence à chaque niveau.', // écran de création (texte source en français)
  i18n: { 'Vagues sans fin : un choix de compétence à chaque niveau.': 'Endless waves: a skill choice at every level.' },
  load: () => import('./index'),
});
```

`name` and `description` are displayed at creation before the content is loaded: their English translations go in the manifest's
`i18n` (the mod's other texts: `mods/<id>/i18n/en.json`, added by `api.i18n.add`).

## Character creation and greyed-out characters

- **Mode at launch.** When there is a choice (more than one playable content ruleset, `playableRulesets()`, or at least one game mode),
  the start screen asks for the mode first: one entry per content ruleset ("Diablo II (original)", "Project Diablo 2", the default overhaul
  first), then one per game mode on each content it accepts (`gameModesFor(contenu)`, e.g. "Project Diablo 2 — Survivals"). The pick is
  remembered (`d2m.mode`) and activated at boot; picking another mode reloads the page (one ruleset per page session) and opens its
  character list. The character list shows only the characters of that mode, and a new character is created in it (no ruleset choice on
  the creation screen any more). Exit (Diablo II screens) or "Change mode" (screen without the Diablo II art) goes back to the choice.
  Without a choice, nothing changes: one list with every character. Logic: `launchModes`, `charsForMode` (`src/ui/charselect-core.ts`).
- A character whose mod is missing (overhaul or game mode absent from this version, mode placed on content it does not accept) is
  **greyed out** in the list with the cause (`rulesetProblem`): it cannot be launched, and is never rewritten, migrated or deleted; the
  sync carries it as is. It becomes playable again when the mod comes back. With a choice of modes it is listed in the mode of its content
  ruleset (`pd2+survivals` without Survivals: in Project Diablo 2), or in the first mode when its content is missing too, so it is never hidden.

## UI slots

A slot is a named place in the base game's UI where a mod **adds** something; several mods can contribute
to the same slot (in order: overhaul, then game modes). Without a mod, every slot is empty. Declaration, at registration:

```ts
register(api) {
  api.ui.add('levelUp', ({ game, level, screen }) => { … });
}
```

The contexts provide only the game session, the UI feedback hooks (`host`: HUD message, haptic feedback, item sound) and, depending on the
slot, a full screen (`screen.open(noeud)`: the game is paused until `close()`) or a way to redraw the panels. A contribution
that throws an error is logged (error log) and ignored: the base game's screen remains. Types: `UiSlots` in `src/mods/ui.ts`
(exported by `src/mods/api`). Displayed texts are written in French and translated by the DOM i18n layer (the mod's dictionary).

| Slot                 | Where                                                                                 | Contribution                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `menu.buttons`       | main menu (Diablo II screen); base screen: choice of mode, or the list without choice | `{ label, run({ root, refresh }) }` (before the game session)                                                                                |
| `create.character`   | new character of the session's ruleset, just before its first save                    | `({ game, variant? }) => void`: starting state, variant picked                                                                               |
| `character.sheet`    | character sheet, below the stats                                                      | `({ game, host }) => HTMLElement \| null`                                                                                                    |
| `levelUp`            | each level gained, after the "Level N!" banner                                        | `({ game, host, level, screen }) => void`                                                                                                    |
| `hud`                | HUD, placed when the game session starts                                              | `({ game, host, screen }) => { el, update?(game) } \| null`                                                                                  |
| `town.waypoint`      | waypoint, first (both views: Rush and Campaign)                                       | `({ game, host, screen, render, close }) => HTMLElement \| null`                                                                             |
| `item.socketActions` | "Crafting" menu of an item without sockets, after "Socket (Larzuk)"                   | `({ game, host, item, ref, town, render, closeMenu }) => ActEntry[]`                                                                         |
| `run.complete`       | end of a run (boss killed, portal open)                                               | `({ game, host, screen, summary }) => void`: end-of-run screen                                                                               |
| `charselect.card`    | a character's card on the selection screen (the session's mode)                       | `({ ruleset, classId, className, level, difficulty, milestones }) => string[] \| null`: lines in place of the level and difficulty (lot 299) |

Level-up screens come one at a time: when several levels are gained in one step (a boss, a quest), or while a mod screen is open, the
`levelUp` contributions of the next level run only once every mod screen is closed (`LevelUpGate`, `src/mods/ui.ts`).

Example (pd2 mod): crafting Larzuk's puzzle box is an `item.socketActions` line in the mod (`mods/pd2/ui/puzzle.ts`).

### A "Survivals" mode (as an example)

- `kind: 'gamemode'`, `rulesets: ['d2', 'pd2']`: the player picks it at creation, on either content;
- `create.character`: starting state (level, equipment, starting skill);
- `town.waypoint`: a "Survival" button that launches the mode's run (run added to the `runs` registry, zone built with the SDK's `ZoneBuilder`);
- `levelUp`: `screen.open(…)` shows a choice of three skills, with the game paused; the choice calls into the game, then `close()`;
- `hud`: wave counter (`update` on every frame, keep it lightweight);
- mode rules (waves, loot): named rules (`api.rules.set`) and registries, as for an overhaul;
- guild: the content's; stash: the mode's own (see above).

## Game-mode hooks

A game mode changes how the game plays without touching the content rules an overhaul owns (`loot.rates`, `xp.levelFactor`,
`world.tick` for pd2). Every hook below is inert in the base, so `d2` and `pd2` play exactly as before (fingerprints, lot 273).

| Hook                             | Kind            | Base                                           | Use                                                                                                         |
| -------------------------------- | --------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `RunDef.director(w, run)`        | field of a run  | absent                                         | per-run object, created at the run's first step: `tick(w)` every step, `onKill(w, m)` on each kill          |
| `RunDef.abandonOnDeath`          | field of a run  | absent                                         | a death abandons the run: no portal back to it, no body waiting in it                                       |
| `RunDef.resumeOnLoad`            | field of a run  | absent                                         | the run in progress (or left behind a portal) is resumed when the character is loaded again                 |
| `RunDef.abandonOnLeave(c)`       | field of a run  | absent                                         | leaving the run for the town abandons it for this character (a roguelite run ends; lot 289)                 |
| `char.itemActive(c, item)`       | rule            | `true`                                         | a worn item (equipment, charm) counted: false wears it asleep, its properties not counted (lot 289)         |
| `char.equipNeedsReqs(c)`         | rule            | `true`                                         | level, strength and dexterity requirements block wearing (`canWear`, the mercenary's too; class, slot stay) |
| `merc.hireLevel(c)`              | rule            | `c.level`                                      | level that opens and prices the hirelings (`Game.mercOffers`; a mode's hero at level 1 between runs)        |
| `ModManifest.variants`           | manifest        | absent                                         | variants offered on the creation screens (first = default), the one picked given to `create.character`      |
| `RunDirector.snapshot / restore` | director        | absent                                         | director state kept in the save (`SaveData.run.modState`, plain JSON), given back to a resumed run          |
| `game.autopilot(g)`              | rule            | nothing                                        | before each step, after the controls: automatic attack, buffs, movement                                     |
| `game.nextZone(g)`               | rule            | null                                           | the zone a mode plays next without a town (lot 300): the app prepares its graphics during the current one   |
| `render.zoneHidden(g)`           | rule            | false                                          | the zone is covered whole by a mode's screen (lot 305): no D2 map loaded for it                             |
| `render.eliteMarks(w)`           | rule            | false                                          | the champions, uniques and bosses marked (lot 305): a ring, a larger body, the name over the head           |
| `maps.wanted(g, id)`             | rule            | true                                           | the D2 maps the character plays (lot 305): the start and an act's loading read only those                    |
| `skills.offer(g, level, reroll)` | rule            | `null` (free allocation)                       | skills offered for a level's point: `Game.offers`, `takeOffer(id \| null)`, `rerollOffer()`; bots answer    |
| `skills.manualLearn(g)`          | rule            | `null`                                         | reason why the skill tree is read-only now (`Game.canLearnManually`)                                        |
| `death.xpPenalty(c, diff)`       | rule            | D2 (0 / 5 / 10 % of level)                     | experience lost on death                                                                                    |
| `ui.orientation(g)`              | rule            | `'landscape'`                                  | `'any'`: playable in portrait (no "rotate your device" prompt, screen unlocked; lot 287)                    |
| `render.zoom(g, base, view)`     | rule            | `base`                                         | camera zoom by window size (portrait, folded foldable)                                                      |
| `render.limits(g)`               | rule            | `BASE_RENDER_LIMITS`                           | drawing caps: corpses, projectiles, damage numbers drawn at most, share of particles (never the sim)        |
| `ui.hudHidden(g)`                | rule            | none                                           | controls of the HUD hidden (`HUD_PARTS`, src/ui/hud-parts.ts: panel buttons, potions, empty slots…)         |
| `shop.consumable(g, baseId)`     | rule            | `true`                                         | a potion, key, tome or throwing potion sold by the vendors (`Game.buyConsumable`, vendor panel)             |
| `shop.sellPrice(g, item, price)` | rule            | `price`                                        | what a vendor pays for an item (`Game.sellPrice`: sale, buy-back, bulk sale; a mode's economy, lot 292)     |
| `shop.vendorStock(g, stock)`     | rule            | `stock`                                        | the stall just rolled; the array returned is `Game.vendor` (a mode keeps its own between refreshes)         |
| `shop.gambleStock(g, stock)`     | rule            | `stock`                                        | the gamble stall just rolled; the array returned is `Game.gambleStock`                                      |
| `shop.gambleRoll(g, rng)`        | rule            | 70/24/3/3 %, level −5..+4                      | quality and item level of a gambled item, drawn before the item (`Game.gamble`)                             |
| `ui.compareRows(a, b, rows)`     | rule            | `rows`                                         | rows of an item's comparison with the worn one (`diffDerived`): a mode adds damage, damage reduction…       |
| `ui.holdToAct(g)`                | rule            | `false`                                        | a long press on an item's cell runs its main action (equip, buy, sell), as the double tap does              |
| `skills.manaCost(w, id, cost)`   | rule            | `cost`                                         | mana a skill costs (`skillManaCost`): a mode's near-free skills (lot 292b)                                  |
| `ai.directChase(w, m)`           | rule            | `false`                                        | a hostile monster runs straight at the player at any distance when the way is clear (open arenas)           |
| `ai.targetLock(w, m)`            | rule            | `{ hold: 0, margin: 0.5, petRange: Infinity }` | how a monster keeps its target between the hero and his creatures (lot 301: no back and forth)              |
| `ai.allyDeathFlee(w, m)`         | rule            | `true`                                         | the Fallen near a Fallen killed panic a moment (Diablo II)                                                  |
| `ai.chaseSpeed(w, m, d)`         | rule            | `1`                                            | a factor on a chasing monster's walk (lot 301: brought beyond the screen, quicker while off it)             |
| `ZoneDef.d2Map.view`             | zone            | absent (the whole map)                         | the part of a D2 map that can be seen: only it (and a screen around) is loaded and drawn (lot 301)          |
| `skills.castFrames(w, id, n)`    | rule            | `n`                                            | frames of a strike or cast the hero starts (`World.startCast`): a mode's quicker cadence (lot 292c)         |
| `ui.settings(g)`                 | rule            | `null`                                         | settings page of a mode: base options kept (`keep`, catalogue ids) and its own rows, one flat page          |
| `ui.joystick(g, view)`           | rule            | `null`                                         | floating joystick: `center` (lower two thirds, skills in a column in portrait), `left`, `right` (lot 287)   |
| `ZoneDef.d2Map.hidden`           | field of a zone | absent                                         | structures of a D2 map left undrawn (indices of its `places`: the trees thinned out of an arena; lot 287)   |
| `ZoneDef.monsterPool`            | field of a zone | absent                                         | monsters a mode brings without spawn entries: their sprite sheets loaded with the zone's (and live ones)    |
| `UiHost.openPanel(name)`         | UI context      | (always there in game)                         | a base panel over the game from a mode's screen: character, bag, skills, stash, vendor, settings, waypoint  |
| `run.complete`                   | UI slot         | empty                                          | end-of-run screen                                                                                           |
| `charselect.card`                | UI slot         | empty                                          | the card shows "Level N Class" and the difficulty                                                           |

A mode's per-character progress lives in `progression.milestones` (numbers, keys `<mode>:…`). A run in progress is saved as every run is
(`SaveData.run`: the world's snapshot); a mode's director adds its own state in the optional field `run.modState` (lot 279), written only
when the director has a `snapshot`: the saves of the base keep exactly their shape, the version stays 7 and a client without the field
ignores it (docs/STORAGE.md, "Save format"). The base never resumes a run on load (as Diablo II, a reconnection starts in town); a run
with `resumeOnLoad` is resumed, its director made at once and given its state back by `restore`.

Difficulties are the base's (lot 282, Survivals): `Game.startRun(id, difficulty)` plays a mode's run at Normal, Nightmare or Hell with that
difficulty's monster levels (`RunDef.zoneLevel`), resistances, ranks, experience, loot and death penalty, and a run with `rewardAs: 'baal'`
opens the next difficulty (`progression.highestDifficulty`) as Baal does; a mode keys its progress by difficulty in its milestones
(`survivals:cp:<difficulty>:<round>`), and first-clear rewards are given once per difficulty (`reward:<run>:<difficulty>`).

Adding a slot: an entry in `UiSlots` and `UI_SLOT_NAMES` (`src/mods/ui.ts`), the call in the base game's UI
(`contributions(nom)`, guarded by `safely` / `modParts`), a row in this table and a test (`tests/unit/mods-ui.test.ts`).

## Testing a mod

`mods/<id>/tests/unit` and `mods/<id>/tests/bots` are added to the `unit` and `bots` suites when the mod is included (`MODS`). The
removal test (`npm run mods:suppression`) checks that the game builds, passes its tests and plays without `mods/`.
