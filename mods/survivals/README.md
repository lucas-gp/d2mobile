# Survivals (game mode)

A game mode for Diablo II in the manner of the "survivors" games (Vampire Survivors, Dragon Ball Survivors), on the content rulesets
`d2` (`d2+survivals`) and, from lot 284, `pd2` (`pd2+survivals`: PD2's rules, skills, monsters, zone levels and loot, its stash and
guild; the mode's drops wrap PD2's, a treasure class PD2 lacks is never rolled, sunder charms count against immunities). Design study: lot 273's design document (owner's decisions in `docs/JOURNAL.md`, lots
273 and following).

- **Two ways to play** (lot 289, owner's decision). At creation the mode offers **Run** (the default) and **Campaign** (manifest's
  `variants`, the base's creation screens; the choice is kept in the character's milestones, `survivals:mode` = 1 Run, 2 Campaign;
  characters made before lot 289 have no mark and play the Campaign as before). Everything below describes the Campaign unless said;
  the Run is described in "Run mode".
- **Rounds.** Each round is a run `survivals:<round>`: a closed arena of about 64 × 64 units cut from the real map of an act's zone
  (synthetic arena with the zone's look when the player's map is absent), the zone's monsters (Levels.txt, by difficulty; Act IV and the
  lairs from the base's level plans), a director that keeps a target number of live monsters (12 to 80, capped by the "density" setting,
  90 by default; monsters born of others beyond the target + 10 are not kept), timed champions, an encirclement, a unique (or the zone's
  midway super-unique(s), one every 45 s), and the zone's super-unique(s) or boss monster (Radament, the Summoner, Izual, Hephasto, Shenk,
  Nihlathak) as the checkpoint at about 8 minutes.
- **Open arenas** (lot 287, owner's test: "too many trees"). In an arena cut from the map, the map's trees (structures of orientation 14)
  are left undrawn inside the arena but about one in three in a 5-unit ring along its border (`thinTrees`, `sim/arena.ts`; the same ones
  each play of the round), and the trunk of a case that only held trees is freed (at most 8 blocked sub-tiles; never a case with a wall,
  a fence or a cliff, never water); the trees beyond the arena's invisible walls stay. Blood Moor: 242 of its 277 trees left undrawn,
  open ground 97.0 → 98.0 %; Cold Plains 282 / 304, Dark Wood 242 / 265, Tamoe 252 / 263; the few palms and trees of Acts II, III and V
  too (the jungle's foliage, the caves' and Hell's walls are the zones' own walls, kept). The base draws every structure
  (`ZoneDef.d2Map.hidden` absent).
- **Acts.** 29 rounds: Act I (7, Andariel), Act II (7: Radament, Bloodwitch, Coldworm, Fangskin, the Summoner, Ancient Kaa, Duriel
  alone in his chamber), Act III (5: Web Mage, Endugu, Sarina, the three Council members of Travincal, Mephisto after the other three),
  Act IV (3: Izual, Hephasto, the three seal guardians then Diablo), Act V (7: Shenk, Eldritch, Frozenstein, Nihlathak, the three
  Ancients together, the Worldstone Keep, the five waves of the Throne then Baal). An act opens when the previous act's boss dies; rounds
  return to the act's town; the D2 quest rewards come at the first clear (Den of Evil, Radament, Izual, Lam Esen, Anya; the bosses' own
  through `rewardAs`).
- **Difficulties** (lot 282). Baal in Normal opens Nightmare, Baal in Nightmare opens Hell (the base's `rewardAs: 'baal'`); the 29 rounds
  are played again in each one with its monster levels (Levels.txt), resistances and immunities, ranks (a unique has one more random
  modifier a difficulty), experience, loot and death penalty (0 / 5 / 10 %), all from the base's tables; checkpoints, deaths and quest
  rewards are kept by difficulty (`survivals:cp:<difficulty>:<round>`, `reward:<run>:<difficulty>`), the character's level and gear go
  on. The waypoint lists the difficulties, the highest first and unfolded, each with its rounds cleared (`n / 29`); the HUD names
  Nightmare and Hell.
- **Bosses and super-uniques** (lot 283). Every super-unique of the base's table (SuperUniques.txt) is met: as a round's checkpoint, an
  elite met halfway (Coldcrow and Bonebreak in the Cold Plains, Griswold and the Cow King in the Stony Field, Flamespike, Fire Eye,
  Leatherarm, Act IV's Taintbreeder, Tormentor, Winged Death and Riftwraith, Act V's Eyeback, Snapchip, Bonesaw, Axe Dweller and the
  four of the Worldstone Keep), a leader of an elite wave, or under its boss species' name (Shenk, Nihlathak, Hephasto, the Summoner, the
  Ancients). The HUD's next-event chip names the coming elite and pulses in its last 10 s; a bar (name, life) under the HUD for each named
  elite and boss alive, the round's bosses first. Act IV's zones are in the `levels` registry while the mode is active (`survivals:<zone>`,
  Levels.txt's levels: `data/act4.ts`); the base's registry stays without them.
- **Loot** (lot 283; lot 285: "few loot, never an inventory to sort"), Diablo II's tables and no multiplier (`sim/loot.ts`,
  `data/loot.ts`): the first kill of an act boss in a difficulty drops its quest treasure class (`Andarielq` … `Baalq`,
  TreasureClassEx.txt) in place of its own, a super-unique its own (`Act n Super x`, `Council`, the Countess', Griswold's, the Cow King's)
  instead of a unique's. A round's drops lose the potions, throwing potions, keys, the portal tome and the plain (white, grey) equipment,
  about 9 drops in 10, and its gold piles two thirds (measured with `tools/loot.ts`, 5 min of the Stony Field at level 12: 57 items and
  1,068 gold in Diablo II's drops, 3 items and 277 gold in the mode's; the vendor's stall costs 92 to 680 gold). The loot is picked up by
  walking over it (1.5 units), the gold anywhere in the arena after a second: an item that fits an empty slot is worn at once (lot 290:
  or in place of a clearly worse one, see "Gear without requirements"), runes, gems, charms, jewels, rares and better go to the bag, the rest (magic items) is
  turned into gold at the vendor's price; what is left on the ground at the end of a round is taken the same way. A boss's or a named
  elite's loot is told at its death.
- **No potion** (lot 285): none dropped, sold (rule `shop.consumable`) nor in the belt (emptied, the keys and the tome of a new character
  taken out); every kill gives back 1 % of the character's life and mana.
- **No impossible round for a single-element build** (`sim/immunity.ts`). The elements of the character's attacks are those of its
  damaging skills (a quarter of its best one's points at least; physical for weapon attacks and summons): live monsters immune to all of
  them stay under 15 % of the target (species drawn again, as for the archers and casters), and the round's named elites and bosses
  (mini-bosses, midway super-unique, leaders of the elite waves, the act's boss) lose such an immunity (90 %, the cap the base gives the
  seal guardians). In Hell's Cold Plains, a cold build meets about 12 cold immunes at once instead of 55.
- **Resume.** A round in progress is kept in the save (the world, and the director's state in `run.modState`): closing the app and
  opening it again puts the character back in the same round at the same second.
- **A round lost again and again gets easier** (the first try is Diablo II's), for each death already suffered in it: fewer monsters
  (`pressureOf`, ×0.8, 10 % of the table at least), less damage from every monster (×0.92, 5 % at least), less life for its bosses
  (×0.85, 3 % at least) and for the members of its elite packs (escorts of the mini-bosses and waves, champions, minions; lot 283), 3
  resistance points less a death for them (never below 0), packs and escorts scaled with the population, fewer monsters born of others
  (`bornSlackOf`), a quicker timeline (`paceOf`: ×1/0.96, the mini-boss at 3:12 at the quickest), no late champion packs nor second
  midway elites after 6 deaths, and no champion pack nor unique after 15 deaths; an elite wave not killed in 3 minutes withdraws and the
  guards leave when the act's boss comes (lot 283). A round left after 5 minutes without dying nor clearing it (back to town, the app
  closed and the round started again) counts as lost at its next start (`survivals:open:<difficulty>:<round>`). At most 30 % of the
  target are archers or casters.
- **Diablo II progression kept.** Levels, experience (D2's level gap), loot (treasure classes), quests' first-clear rewards, the death
  penalty of D2 (0 / 5 / 10 % of the level); no rate multiplier.
- **Level-up** (lot 288: each card also tells the skills it strengthens, synergies, and those it opens with their level; the buttons
  count: "Reroll · 1 free" then its price, "Banish · 2": a card banished leaves the draws for the rest of the round, kept with the round's
  save; key B). The level's skill point is spent on one of three cards (the skill's icon, name, level and text, and since lot 287 its
  first two figures of the skill tree, current → next, and its number: keys 1 to 3, R rerolls, Esc keeps the point; locked 0.5 s) drawn among the skills the character can learn (prerequisites,
  required level), or kept; one free reroll per round, then gold. The skill tree is read-only during a round. "Automatic choice" follows
  the class's build plan (the bots' plans): its next skill when offered, else the free reroll, else the point kept and spent on the plan
  in town.
- **Death.** The round is lost (no portal back to the horde), never the level, gear or checkpoints; "Resume" starts the first round not
  yet cleared. Since lot 288 the round lost names its killer and the hit (monster, damage, element, blow or spell: `sim/lost.ts`) in place
  of the base's notice, then on the hub with the time it lasted, the level and the monsters killed, until the next round.
- **Between rounds** (lot 285). A new character starts its first round at once; in town a hub covers the town (no walking): the next
  round in one tap ("Play"), the rounds' list (the waypoint), the character, the bag, the skills, the stash, the equipment vendor (buy and
  sell) and the settings, each opened over it (`UiHost.openPanel`); the end-of-round screen offers the next round at once.
- **A clean screen** (lot 285, owner's test on his Galaxy Z Fold: "too many buttons"). In a round the base's panel buttons, potions,
  skill page, empty skill slots, context button and tips are hidden (rule `ui.hudHidden`); the joystick, the attack, the skills bound,
  the gauges and the mode's row (time, monsters, next event, bars) stay, with one pause button (automatic attack, the settings, leave the
  round). Fewer corpses (12), damage numbers (10) and particles (60 %) drawn, and arenas never darker than half the light
  (`MIN_AMBIENT`). Lot 288: the round's banner at its start (act and zone), the immunities of the named elites under their bar. Level-up cards are larger, with the skill's icon, and read the tap from the pointer itself.
- **Few settings** (lot 286, owner's screenshot of the settings panel: "far fewer settings"). The base's settings panel shows one flat
  page (rule `ui.settings`, `ui/menu.ts`): the mode's rows first (control, joystick, skill cards, stat points, live monsters at most,
  adaptive density), then only the language, sound and music, controls (touch or mouse, left-handed, vibrations), graphics quality, damage numbers,
  screen shake, change character, install and update; no folded category, no search box. Hidden: the loot rate, filter and automatic
  pickup (the loot is walked over), durability, respec, potions, zoom, lighting, image filters, diagnostics, extra buttons, PD2's
  confirmations, account, saves, packs, news and credits (the main menu and the character list keep what is needed). The hub and the
  pause open this panel; the mode has no settings screen of its own any more. The panel's tabs stay (bag, character, skills, settings:
  the hub opens them, none is redundant).
- **Controls** (lot 290, owner: "no skill button any more, everything is automatic"). Semi-automatic (default: the joystick moves;
  standing still the character keeps its buffs, auras and summons up and casts on its own the skill the bot's brain finds the most
  profitable against the monsters around, `BotBrain.attackChoice`, at a target in reach, else swings its weapon; walking, it still
  strikes a target in reach every 0.8 s, `WALK_ATTACK`), automatic (the bot's brain with a survival movement; a melee character strikes
  with the skill it has put the most points in). No manual control any more (a saved one plays the semi-automatic), no automatic-attack
  switch in the pause: in every control the attack and skill buttons are hidden (rule `ui.hudHidden`), the joystick, the gauges and the
  pause stay. **Skills preview** (`ui/skillstrip.ts`): a row of icons at the bottom of the round's screen, never a touch target
  (`pointer-events: none`, `aria-hidden`): the active skills taken (the highest first, all of them since lot 305); after each automatic cast an icon
  darkens and fills back clockwise over the skill's cooldown or 0.6 s, dimmed when the mana cannot pay for it. Stat points by profile
  (balanced, vitality, manual).
- **Gear without requirements** (lot 290, owner's order; Run and Campaign, `d2+survivals` and `pd2+survivals`): any item of a slot is
  worn whatever its level, strength, dexterity or class requirement (rules `char.equipNeedsReqs`, `char.equipNeedsClass` set to false;
  a mercenary's own item stays his), and counts at once (the base's `char.itemActive`). The tooltip shows the requirements, never in red,
  and tells "No requirement in this mode: active as soon as it is worn"; the bag's cells are no longer greyed, the "Equip" action is
  open; a respec takes nothing off. The loot walked over goes on by itself in an empty slot, or in place of the worn item when clearly
  better (`autoSlotFor`: `gearScore` of the hero's derived stats, +5 % and 8 points at least; the hero's class's items only, never another
  kind of weapon nor a two-handed one for a one-handed one: the build's skills need theirs); the worn one goes to the bag. The vendor's
  stall and the loot were never filtered by requirements (the vendor stocks the best level reached, lot 289). The base's bot brain heeds
  the rules too (`botCanWear`, `reqsBlock`: no strength nor dexterity points spent for gear in the mode, its class's items only).
- **Floating joystick** (lot 287, owner's test in portrait: "the movement control at the centre of the screen"; rule `ui.joystick`,
  `ui/controls.ts`). The joystick appears where the thumb lands: held upright, anywhere in the lower two thirds of the screen, the centre
  included, the attack and the skills bound in a column at the right edge (the left one for a left-handed player); in landscape, the
  thumb's half of the lower two thirds (the left, the right for a left-handed player), the buttons' arc as in the base. The setting
  "Joystick" (auto, left, centre, right) forces a place; the buttons go to the other side.
- **Portrait and landscape.** The mode lifts the "rotate your device" prompt (rule `ui.orientation`; the screen is unlocked, never
  `lock('any')`, and the menus never lock it: lot 287) and widens the camera (rule `render.zoom`: at least 16 units across the shorter
  side since lot 287, 12 before, not below a zoom of 0.5: 0.54 on a phone, 0.5 on a folded Fold). In landscape, the HUD's row goes under the base's title (level and zone) when they would meet (a phone; lot 283).

| Folder   | Content                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------- |
| `data/`  | rounds of each act (`chapters.ts`), D2 treasure classes (`loot.ts`), Act IV levels (`act4.ts`) |
| `sim/`   | arena, zones, director, loot, economy and shop, skill offer, checkpoints, controls, settings   |
| `ui/`    | screens (cards, end of round, waypoint, HUD and pause, hubs, shop, sheet, settings)            |
| `tests/` | unit tests (`unit/`), bot tests of the mode (`bots/`)                                          |

The mod imports only `src/mods/api` and `src/mods/sdk`; nothing in the game imports it (removal test: `npm run mods:suppression`).
Displayed texts are French source text translated by `i18n/en.json`, like the base.

## Run mode (lot 289)

A roguelite run (`sim/runmode.ts`, `ui/runhub.ts`), the default of a new character:

- **One run = one act** in one difficulty, among those open (Act I in Normal first; an act opens when the previous act's boss is beaten
  in that difficulty, the next difficulty when Baal is). The hero starts at the act's **entry level** (1 for Act I in Normal; a later act
  or difficulty `recLevel` of its first zone − 2, the points above level 1 spent by the stat profile and the class's plan, D2's level
  gap leaving a level-1 hero almost no experience from Nightmare's monsters) with **no skill**: a first card at once, then a card each
  level, as in the Campaign (rerolls and banishes by zone). The act's zones are **chained**: 4 s after a zone's mini-boss the loot left
  is taken and the next zone starts, no town in between; the act's boss ends the run (**victory**), as the hero's death does. A zone
  left from the pause abandons the run (`RunDef.abandonOnLeave`); a zone already cleared and left through its portal (the automatic
  control walks into it) goes on to the next zone.
- **Act I's timed flow** (lot 291; since lot 292c twelve minutes and five zones, a mini-boss every three: see "Act I as a gear
  roguelite"; owner: closer to the other survivors game observed a second time (local, unversioned
  notes); Act I in Normal only, `FLOW`, `actFlow`, `inFlow` in `sim/runmode.ts`, the director's `ActFlow`): about **6 minutes**
  for the act. Each zone lasts **60 s** at most (its mini-boss killed earlier ends it sooner; the elites still alive stay behind), the
  next one 4 s later; the population follows the act's clock (`FLOW.density`: 5 at the start, 10 at 0:30, 15 at 1:00, 40 at 2:00, 45
  at 6:00, the mode's cap above; 25 at most in Andariel's lair), melee fodder only in the first 30 s, the monsters' life ×0.7 in the
  first minute; an elite every 20 to 30 s, announced by name 2.5 s ahead ("Corpsefire approche…"): the zone's unique at 0:25,
  champions at 0:12 from the second zone, an encirclement at 0:35 from the third, the mini-boss at 0:45, Andariel 15 s into her lair.
  An elite's chest: a unique killed gives a level at once, a zone's mini-boss two (`FLOW.chest`, "Coffre d’élite : +2 niveaux"). The
  hero runs at about **4 units a second** (×0.77, rule `player.speed`) and **walks while he casts** (rule `player.castWhileMoving`);
  the semi-automatic control fires as soon as it can while walking, at the **nearest monster in any direction**. The loot is taken by
  walking over it (1.7 units), gold too (no vacuum), and the whole arena's loot comes to the hero at Andariel's fall. Experience ×8 a
  kill (`FLOW.xp`), the monsters' easing `RUN.mercyAct1` (damage ×0.11, bosses' and packs' life ×0.3, elites' damage ×0.3). The death
  screen and the round's death notice tell the damage taken in the last 3 s ("312 dégâts reçus en 3 s"); a new character of the mode
  has no damage numbers nor screen shake (the settings change them). Not done from the study: potions (the owner removed them),
  Telekinesis' wider pickup, the shopkeeper by the act's portal.
- **Kept between runs**: the gear worn, the bag and the stash (every item picked up is kept, **on death too**: every run counts; what
  is still on the ground at a death is lost), the gold, the acts and difficulties opened, the records (by act and difficulty: runs,
  victories, best time, farthest zone, most kills; the best level reached). **Not kept**: levels, experience, skills, stat points,
  quest rewards (they come again with their zones in each run: `reward:*` forgotten at each start). No permanent stat, no paid rank: the
  meta-progression is the gear and the unlocks (lot 308, owner's request: the training's small paid ranks besides, see "Training").
- **Gear**: lot 289 put the gear above the hero's level to sleep until its requirements were met; lot 290 (owner's order) removed it:
  the hero, level 1 between runs, wears any item and it counts at once (see "Gear without requirements"). The farm of the late acts and
  difficulties is what makes the early acts quicker.
- **Loot**: the mode's (Diablo II's treasure classes per difficulty and act, no multiplier, no consumable, no plain item), with less gold
  in a run: piles at half the Campaign's (`RUN.gold`: a sixth of Diablo II's) and items turned into gold at 35 % of the vendor's price
  (lot 292: of the shop's sale price, the kills' gold of a zone capped; see "Economy, shop and endgame")
  (`RUN.sell`). Measured (lot 289, bots, Act I in Normal): 4,200 gold a run (median) before this cut, 1,780 after (2,190 a victory),
  14 items kept; the vendor's stall at level 18 costs 124 to 1,665 gold (median 370), at level 10 70 to 1,085 (median 225). The hub's vendor stocks items of the **best level reached** in a run (the hero is level
  1 between runs).
- **Experience and difficulty of a run** (`RUN`, tuned with the bots, Act I in Normal): the zones' timeline at half its length (the
  mini-boss at 4:00, `pace` 0.5; about 27 minutes to Andariel), the population at 20 % of the table at the zone's recommended level
  (+2 points a level above it), no late champion pack nor second elite halfway, archers and casters at most 15 % of the population,
  every monster's damage ×0.25, the bosses' and elite packs' life ×0.3 and their damage ×0.45 more (packs and escorts scaled with the
  population, the guards leave when the act's boss comes), 2 % of life and mana a kill and 2.5 % a second, and **experience ×3**
  (the run's level is never kept: the shared stash and the content rulesets see no difference). No experience is lost on death in a run
  (rule `death.xpPenalty`; the Campaign keeps Diablo II's).
- **Hub between runs** (in town, over it; since lot 295 in six tabs and three panels, see "The hub in six tabs"): the act and difficulty
  to run (those open), "Start the run", the records of that act, the gear, the shop and the settings. **Run-end screen**: the outcome
  (the killer and the hit, or the act beaten and what it opened), the zone reached, the time, the level, the kills, the gold earned, the
  items kept, the records beaten, "Play again" and "Hub". In a run the HUD names the zone (`Zone n / 7`); the pause's "Abandon the run".
- **Save**: version 7 unchanged (lot 299: each mode its own shared stash, see below); the run in progress is the zone's run (`run.modState`) plus milestones `survivals:run:*` (act,
  difficulty, zone, start, kills, gold, items, cleared, dead, won), records `survivals:rec:*`; a client without the mod keeps the
  character greyed and untouched. `d2+survivals` and `pd2+survivals` both play it.
- **Bots** (`tools/campaign.ts --run <class> [name] [runs] [act] [difficulty]`, nightly `tests/bots/run.test.ts`): a new character runs
  Act I in Normal from level 1 again and again with the gear it keeps (automatic control, cards by the class's plan; the Amazon's plan
  is the bow one, her starting weapon; no shopping by default: `SV_SHOP=1` buys the vendor's best weapon of the kind worn).

Measured (lot 289, `tools/campaign.ts --run`, 2 names × 6 runs a class, Act I in Normal from level 1, the gear kept from run to run,
84 runs): **71 victories (85 %)**, every class winning runs.

| Class (plan)          | Victories | Level at Andariel | Deaths (zone, killer)                               |
| --------------------- | --------- | ----------------- | --------------------------------------------------- |
| Sorceress (fire)      | 12 / 12   | 16 to 18          | —                                                   |
| Druid (fissure)       | 12 / 12   | 19                | —                                                   |
| Assassin (traps)      | 12 / 12   | 18 to 19          | —                                                   |
| Amazon (bow)          | 12 / 12   | 15 to 16          | —                                                   |
| Necromancer (bone)    | 11 / 12   | 18 to 19          | one first run stuck at level 1 in the Blood Moor    |
| Barbarian (whirlwind) | 8 / 12    | 17 to 20          | zones 5 and 6 (goatmen, Pitspawn Fouldog's pack)    |
| Paladin (zealot)      | 4 / 12    | 17 to 19          | zones 5 and 6 (goatmen, skeleton archers and mages) |

A won run lasts about 27 minutes (26 to 96: the slowest melee bots at Andariel), 14 items kept (median), 2,190 gold (median of the
victories, 1,400 to 2,900; the vendor's stall at level 18: 124 to 1,665 gold, median 370). The melee bots are the base's (they chase
archers and casters and keep few buffs up): a human player is to be measured. Before the tuning (Campaign's director in a run: the
pressure by level, no mercy, D2's experience) no class won a run (0 / 56: deaths in the Blood Moor and the Cold Plains at level 3 to 7,
the Druid killed by the Cow King at level 10).

Lot 290 (gear without requirements, owner's order; Act I in Normal only, the other acts untouched): the gear kept from run to run now
counts from level 1, so each character's later runs got easier: with lot 289's tuning the bots won **81 / 84 runs (96 %)** (Paladin
10 / 12, Barbarian and Sorceress 12 / 12, Necromancer 11 / 12). Act I in Normal got its own easing (`RUN.mercyAct1`, `runMercy`:
monsters' damage ×0.4 instead of ×0.25, bosses' and elite packs' life ×0.45 instead of ×0.3, elites' damage ×0.6 instead of ×0.45);
measured on two pairs of names (2 × 6 runs a class each, 84 runs): **73 / 84 (87 %)** and **76 / 84 (90 %)**, every class winning
runs (Sorceress, Druid, Assassin, Amazon, Necromancer 11 to 12 / 12; Barbarian 7 to 9 / 12; Paladin 6 to 8 / 12, deaths in zones 5 and
6: goatmen, skeleton archers and mages), about 27 minutes a won run, level 16 to 20 at Andariel; a first run (no gear yet) is as hard
as before, the gear found is what makes the next ones easier. Measures: `tools/campaign.ts --run` (tuning: `SV_RUN='{"mercyAct1":…}'`).

Lot 291 (Act I's timed flow): before tuning (lot 290's easing, experience ×3, the density up to 80) the bots won 26 / 84 runs
(31 %: deaths in the jail and the cathedral, zone 6, at level 10 to 16); after (`FLOW`, `RUN.mercyAct1` above, experience ×8, 45
monsters at most, 25 in the lair) **72 / 84 (86 %)** and **74 / 84 (88 %)** on two pairs of names: Assassin, Druid, Necromancer 12 /
12, Sorceress 11 to 12, Amazon 9 to 11, Paladin 9 to 11, Barbarian 5 to 6 / 12 (zone 6 and Andariel); a won run lasts about 6.5
minutes (the other game: Andariel at 5:50), the hero at level 16 to 25 at its end (theirs: 13; our bots hold no potion). Melee is
the weakest: the Barbarian's bot whirls into the packs.

## Economy, shop and endgame (lot 292)

A third study of another survivors game (observed for reference only, nothing copied) found their gear loop the goal of a run, their
gold uneven (ranged classes about 22 gold a run, melee 100 to 123), a melee hero starting without a weapon, and no stat sheet nor item
comparison. Our rules: Diablo II's items, treasure classes and gamble odds, no paid stat, no potion, gear without requirements, the level
reset at each run, the gear, bag, stash and gold kept by the character.

- **Gold of a run** (`sim/economy.ts`, `ECON`): the piles (Diablo II's treasure classes, `RUN.gold`, no multiplier) and the magic items
  turned into gold (the shop's sale price × `RUN.sell`) count fully up to `ECON.zoneCap` = 7 gold a zone (lot 296: 40), then 3 % of the rest (the
  share kept in fractions: a pile under it disappears), and every elite's chest of Act I's flow pays (`ECON.chest`: a unique 2, a zone's
  mini-boss 5, Andariel 15; ×1.6 in Nightmare, ×2.4 in Hell). Measured (`tools/campaign.ts --run`, 7 classes × 2 names × 6 runs, Act I in
  Normal): **median 103.5 gold a run**, Amazon 99.5, Assassin 111, Barbarian 91, Druid 122.5, Necromancer 120.5, Paladin 75.5 (deaths;
  92.5 a victory), Sorceress 99 (before: 266 to 989 by class, `tools/gold.ts` splits the sources). Nightmare's Act I about 180 to 200 a
  victory, Hell's 200 to 275.
- **Prices** (rule `shop.sellPrice` in Run mode, the shop's own stall): an item's quality price (magic 140, rare 300, set 450, unique 650)
  × `0.85 + ilvl / 100` (×1 at item level 15): **magic 140 (1.4 runs), rare 300 (3 runs)** at Act I's end, 167 and 357 at Nightmare's entry
  level; a **sale a fifth** (magic 28); runes, gems, charms a quarter of the base's sale price; a **gamble 566 to 668** at level 15 (6 to
  7 runs; `560 + 6 × the base's level`, same level factor). The Campaign keeps the base's prices.
- **The hub's shop** (`sim/shop.ts`, `ui/shop.ts`; rules `shop.vendorStock`, `shop.gambleStock`, `shop.gambleRoll`): one screen over the
  hub ("Boutique", no walking; the base's vendor button left the hub), four tabs: **Buy** (6 items of the class, 8 once Nightmare's Act I
  is open, two weapons of the kind and handedness worn, the rest armour, jewels and a shield or the class's off-hand; magic, 25 % rare, +10
  points a difficulty beaten; item level = the last run's level, once the endgame is open at least 85 % of the best level and the entry
  level of the highest Act I open), rolled **at each run's end**, the same stall between two runs and after a reload (what was bought is
  kept in the milestones `survivals:shop:*`); the **best buy** (largest `gearScore` gain the purse pays) marked; **Bag** (wear in the best
  slot, sell); **Buy back** (the base's, the session's sales at their price); **Gamble** (6 bases of the class at the stall's level,
  Diablo II's odds: unique 1 / 2,000, set 1 / 1,000, rare 1 / 10, item level −5 to +4; a base gambled is replaced). Each row: the
  quality's colour, the price, the comparison with the worn item (green better, red worse); a tap shows the tooltip, a long press buys or
  wears (an item bought or gambled that gains is worn at once).
- **Comparison and sheet** (`ui/sheet.ts`): rule `ui.compareRows` adds the weapon's damage and attack speed first, the damage reduction
  (% and flat) and the block last to the base's rows (tooltips, bag, shop); the character sheet's section (slot `character.sheet`): life,
  resistances, damage reduction, defense and block, weapon damage, attack and cast speed, run speed, and in Run mode the **tier**
  (Normal, Cauchemar, Enfer, Enfer vaincu: Act I's difficulties beaten) and the **gear's power** (`gearScore` above the naked hero). Rule
  `ui.holdToAct`: a long press on a cell of the base's panels runs its main action (wear, buy, sell), as the double tap.
- **Starter kit** (`STARTER_KIT`, `ensureStarterKit`): every run starts with a weapon: the base's starting weapon put back in an empty hand
  (sold, or never had), and Diablo II's buckler beside a one-handed melee weapon (Barbarian, Paladin, Assassin).
- **Run-end screen**: the run's gold flowing into the purse ("+N → purse", about a second, still without animations), "New best time!"
  at every fastest victory (the first included), the records, the best buy of the new stock, **"Visit the shop"**, "Play again", "Hub";
  the damage of the last 3 s on a death (lot 291). The hub tells the tier and the gear's power.
- **Endgame farm (Act I focus)**: Andariel beaten in Normal opens **Act I in Nightmare**, in Nightmare Act I in Hell (`actUnlocked`,
  `actBeaten`; Baal still opens the next difficulty's other acts), told once on the run-end screen. Act I's 6-minute flow is played in
  every difficulty (`flowActive`), the hero entering at the act's entry level (34, 65), its monsters dropping their difficulty's treasure
  classes (Diablo II's tables, no multiplier), the easing `RUN.mercyAct1Endgame` (monsters' damage ×0.06). Measured (`SV_SHOP=1
SV_LADDER=1`, one name a class, 12 runs, each in the highest Act I open): Sorceress, Druid and Assassin win Normal then Nightmare at
  once and **10 / 10 Hell runs** (level 79 to 82), Necromancer 7 / 10 in Hell, Paladin 1 / 2 Nightmare then 0 / 9 Hell (zone 6), the
  Barbarian (0 / 11) and the Amazon (0 / 9) stay in Nightmare (Andariel's lair at level 38 to 41: weapon builds with Normal's weapons; the
  shop's Nightmare weapons cost 167 to 357 gold, two to four Nightmare runs).
- **Act I in Normal** (7 classes × 2 names × 6 runs, 84 runs, the bots without shopping): **74 / 84 (88 %)**: Sorceress, Druid,
  Necromancer, Assassin 12 / 12, Amazon 11, Barbarian 9, Paladin 6 (its variance: 4 more names 19 / 24, the code before the lot 7 / 12 on
  the same names); buying the best buy between runs (`SV_SHOP=1`): **76 / 84 (90 %)**, Paladin 8 / 12. A won run lasts 6 to 8.7 minutes
  (median by class), the hero at level 17 to 25 at its end.
- Not done: a save export of the mode's data (P2 of the study; the base's saves are unchanged, version 7).

## Act I as a gear roguelite (lots 292b-292c)

The owner's tests of lots 289-291 and his notes after the other game (observation only):

- **Free movement** (lot 292b): in every round of the mode the hero walks while he strikes or casts (rule `player.castWhileMoving`, the
  walk drawn facing the way he goes: the renderer draws it whenever that rule is on and the hero moves), a hit never roots him (rule
  `combat.playerHitRecovery`: no hit recovery), monsters run straight at him across the open arenas (rule `ai.directChase`, the flow
  field only around walls), skills cost 15 % of their mana in a round (rule `skills.manaCost`, `MANA.share`; lot 294: nothing in Act I's flow), the pause opens the bag
  (gear changed, the game paused under the panel) and the skill tree (read only).
- **Monsters**: in Act I's flow at most a fifth of the field are archers and casters, 3 at least once the melee start is over
  (`FLOW_RANGED`); a body a live monster can raise (the Fallen Shamans) stays its 10 s (the others go after 3 s); the encirclement is a
  whole ring of at least 28 monsters 9 units away, evenly spread, a point in a wall pulled in along its ray (`ENCIRCLE`).
- **Twelve minutes, a mini-boss every three** (lot 292c, the owner's note; `FLOW.zones`, `runZones`): the Blood Moor (1:30), the Cold
  Plains to Blood Raven (3:00), the Stony Field to Rakanishu (6:00), the Dark Wood to the Countess (9:00), Andariel's lair (three minutes
  of field, Andariel at about 12:00); the Tamoe Highland and the Jail are not played in the flow. Each zone's events spread over its
  length (champions at a fifth, its unique at two fifths, an encirclement at three fifths, its mini-boss 15 s before its end); a zone fills
  up over its first seconds (`FLOW.entry`: 8 + 4 a second).
- **Density and cadence** (the owner: the other game's hero "attacks very fast and never stops"): up to 90 live monsters (`FLOW.density`:
  8 at the start, 35 at 1:00, 55 at 2:00, 75 at 4:00, 90 at 12:00; 45 in the lair), a refill of 16 a second, the ring 11 units away, the
  fodder at 35 % of its life, strikes and casts at 55 % of Diablo II's frames (rule `skills.castFrames`), melee blows splashing around
  their target (rule `combat.weaponSplash`). Measured: a Barbarian kills 7 to 10 monsters a second in the thick of it, a Sorceress 2 to
  3; the simulation steps in 0.41 ms on average (p95 0.74 ms) with 74 monsters alive.
- **The gear carries the hero, not the level**: experience ×2 a kill, the chests give no level (a unique) or one (a mini-boss), a kill
  gives back 0.4 % of life and mana and 1 % a second, the monsters' damage ×0.2 and the elites' and bosses' life ×0.65 of Diablo II's,
  then **stronger with the act's clock** from 1:00 (`FLOW.ramp`: damage +30 % and life +15 % a minute, ×2.6 at most).
- **Curves** (`tools/tiers.ts`, a new hero a run, Act I in Normal, 4 runs a class and tier: median seconds survived, victories; tier 0
  the starter kit, 1 three magic pieces of item level 8, 2 every slot magic of 14, 3 every slot rare of 20, 4 the best of four rares a
  slot of 28):

  | Class       | Tier 0     | Tier 1     | Tier 2     | Tier 3     | Tier 4     |
  | ----------- | ---------- | ---------- | ---------- | ---------- | ---------- |
  | Amazon      | 157 s, 0/4 | 156 s, 0/4 | 228 s, 0/4 | 547 s, 0/4 | 578 s, 1/4 |
  | Sorceress   | 149 s, 0/4 | 469 s, 0/4 | 297 s, 0/4 | 653 s, 0/4 | 663 s, 0/4 |
  | Paladin     | 410 s, 0/4 | 429 s, 0/4 | 567 s, 0/4 | 562 s, 0/4 | 730 s, 4/4 |
  | Barbarian   | 441 s, 0/4 | 468 s, 0/4 | 554 s, 0/4 | 568 s, 1/4 | 734 s, 3/4 |
  | Assassin    | 576 s, 0/4 | 572 s, 0/4 | 626 s, 0/4 | 789 s, 3/4 | 783 s, 3/4 |
  | Necromancer | 565 s, 0/4 | 559 s, 0/4 | 561 s, 1/4 | 711 s, 2/4 | 624 s, 1/4 |
  | Druid       | 634 s, 1/4 | 566 s, 0/4 | 577 s, 0/4 | 725 s, 2/4 | 733 s, 3/4 |

  With the starter kit a run is almost never won (1 / 28), the best gear wins about one in two (15 / 28). The bots' melee survives
  longer than the target's 2:30-3:30 with the starter kit (7 to 10 minutes: they die in the Dark Wood or the lair), the archers and the
  Sorceress about 2:30.

- **Run after run** (`tools/campaign.ts --run <class> Prog 25`, `SV_SHOP=1`: the gear kept, the shop's best buy between runs): the first
  victory at run 3 (Druid), 6 (Necromancer), 7 (Assassin), 9 (Paladin); the Barbarian goes from 7:00 to 10:00 in 25 runs without a
  victory, the Amazon and the Sorceress from 2:20 to 9:00 on good runs (irregular: a good drop, a jump). Gold a run (median): 21 to 24
  for the archers and the Sorceress (early deaths), 120 to 217 for the others.

## A run's loot (lot 293)

The owner's note: during a run of the Run mode the items walked over that are not worn at once (`autoSlotFor`) are kept apart with no
limit (`sim/runloot.ts`: `svLoot` on the character, saved with it, a resumed run keeps it); the class's magic equipment is kept too (no
longer turned into gold), with the rares and better, the charms and the jewels; runes and gems go to their tabs as before. At the run's
end (a death too) the loot goes to the bag, the surplus to the **temporary pages** (`svPages`), told on the run-end screen; the hub holds
the next run while they keep more than `RUN_LOOT.pagesMax` (10) items, and the shop's Bag tab shows them (to the bag, or sold at the
shop's price: no merchant needed). The bots sort the loot between runs as a player would (`sortLoot`: what gains is worn, the weapon of
the kind worn only, the rest sold).

Measured (`tools/campaign.ts --run <class> Prog 25`, `SV_SHOP=1`, the gear kept): first victory at run 2 (Druid), 3 (Necromancer), 6
(Assassin), 8 (Paladin, then 18 victories in 25 runs, its survival 6:53 → 12:00); the Barbarian 9:12 → 10:00-12:00 without a victory, the
Sorceress 2:13 → 10:00 on good runs, the Amazon held at about 2:30 (her bow bot dies in the Cold Plains). Gold a run (median): 18 to 32 for
the Amazon and the Sorceress, 144 to 277 for the others (the loot sold); 6 to 143 items kept a run.

## Act I without mana, cadence and the recalibration (lot 294)

The owner's requests (Act I's flow of the Run only; the Campaign and the other acts keep lot 293's rules):

- **No mana** (as the other survivors game): in Act I's flow a skill costs nothing (rule `skills.manaCost` × `MANA.flow` = 0), the hero's
  mana is kept full every step (a monster's mana burn, Energy Shield's absorption never leave it short: Energy Shield absorbs its share of
  every hit), and the HUD hides the mana bar and globe (base HUD part `mana`; the bars follow the life globe alone) and the mouse bar
  (`pcbar`). The bots never starve. The Campaign's rounds keep 15 % of the cost (`MANA.share`).
- **Cadence** (owner: "Charged Bolt is spammed"): every skill has a floor between two casts (`FLOW.minCast`, seconds; the other game's
  orders: bolts 0.3 to 0.6 s, Teeth 1.2 s): a skill cast is cooled down until then (`holdCast`, `p.cooldowns`: the skills preview fills
  over it), a weapon strike lasts that long at least (`flowFrames`). Measured with `tools/cadence.ts` (level 15, 8 points, a sandbag;
  seconds between two casts, the damage a second on one target, Static Field a share of its life):

  | Skill (class)             | Diablo II | Before (lot 293) | Now       | Missiles a cast | Damage / s |
  | ------------------------- | --------- | ---------------- | --------- | --------------- | ---------- |
  | Charged Bolt (Sorceress)  | 0.52      | 0.32             | 0.60      | 10              | 238        |
  | Fire Bolt, Ice Bolt       | 0.52      | 0.32             | 0.40      | 1               | 33-45      |
  | Fire Ball                 | 0.52      | 0.32             | 0.72      | 1               | 76         |
  | Nova, Frost Nova, Static  | 0.52      | 0.32             | 1.20      | —               | 17-57      |
  | Lightning                 | 0.76      | 0.43             | 0.60      | —               | 79         |
  | Teeth (Necromancer)       | 0.60      | 0.36             | 1.20      | 9               | 24         |
  | Corpse Explosion          | 0.60      | 0.36             | 1.00      | —               | —          |
  | Magic Arrow (Amazon)      | 0.56      | 0.36             | 0.44      | 1               | 25         |
  | Multiple Shot             | 0.56      | 0.37             | 1.04      | 8               | 18         |
  | Exploding Arrow           | 0.56      | 0.36             | 0.76      | 1               | 50         |
  | Holy Bolt (Paladin)       | 0.60      | 0.36             | 0.52      | 1               | 129        |
  | Zeal                      | 0.32      | 0.20             | 0.44      | —               | 78         |
  | Charge, Leap              | 0.52-0.56 | 0.32-0.36        | 2.50      | —               | —          |
  | Psychic Hammer (Assassin) | 0.60      | 0.36             | 0.52      | 1               | 19         |
  | Firestorm, Arctic Blast   | 0.72      | 0.43-0.77        | 0.52-0.80 | —               | 36-45      |
  | Weapon attack, strikes    | 0.48-0.72 | 0.28-0.43        | 0.36-0.44 | —               | 9-53       |

  Unit test `tests/unit/lot294.test.ts`: no attack nor skill of the seven classes (51 measured) is cast quicker than its floor.

- **Every learned skill in turn** (owner: Leap learned, never cast; `rotation`, `sim/autopilot.ts`): in Act I's flow, in every control, a
  learned active skill not cast for `ROTATE_EVERY` (4 s, or its floor) is cast when it has a use: a buff not active (one armour of a tree
  at a time), a shout or a nova with a monster within 4 units, a corpse skill near a corpse, Leap, Charge or Whirlwind at a group of 3
  monsters, the others at the densest group in reach; the auras and summons stay the brain's, which now keeps them up while the hero
  walks. The brain's best skill fills the rest. Measured: a Barbarian with Leap and Howl leaps 13 to 29 times and howls 19 to 29 times in
  2 to 5 minutes; a Sorceress who learned all her skills casts 26 different ones in 30 s (e2e L4). The skills preview shows the skills
  learned (the cooldowns' fill), and the base's mouse bar is hidden.
- **Levels** (owner's comparison: level 2 at 0:13-0:30, 3 at 0:33-0:49, 4 at 0:48-1:00, 5 at 1:12-2:10, then one every 30-60 s;
  champion and unique chests 1 to 3 levels): a floor by the act's clock (`FLOW.levels`: 2 at 0:20, 3 at 0:40, 4 at 0:55, 5 at 1:40, 18
  at 12:00, about one every 48 s; a hero under it is given the experience, checked every second), the kills' extra experience off two
  levels above it (`FLOW.levelAhead`: the fast killers no longer run away, the Necromancer was level 12 at 3:00), the chests a unique 1
  level, a mini-boss 2. Measured (god mode): level 2 at 0:10-0:20, 3 at 0:20-0:30, 5 at 1:20, 10 to 11 at 5:00.
- **Each run starts again at level 1 with no skill**: the Run's rule (a roguelite), not a bug (the skills learned and the stat points are
  reset by `resetHero`, the gear stays); the hub ("Chaque run repart du niveau 1, sans compétence") and the run-end screen now tell what a
  run keeps (gear, gold, stash) and what it does not (levels, skills).
- **The monsters' missiles** (owner: "the ranged monsters still never attack at range"): they did shoot, but at the place the hero stood
  when their attack began, and missed a walking hero 98 % of the time (9 hits in 460 shots: a Barbarian walking a curve for 200 s); base
  hook `ai.missileLead` (0: the base's aim; k: aimed ahead by k × the target's motion until the intercept), the mode's 1 in the flow (a
  hero walking a curve is hit by 241 shots in 297, a turn still dodges; the automatic control 199 in 253), their damage ×0.55
  (`FLOW.missileDmg`), at most a tenth of the field (`FLOW_RANGED.share` 0.2 → 0.1). The renderer now preloads the effects of a mode's
  species (`monsterPool`: their missiles were a small glow until a sheet loaded by chance).
- **The attack drawn while walking** (owner: "the attack is replaced by the walk at once"): the renderer draws the strike or the cast for
  its whole length, facing its target, while the hero moves (lot 292b drew the walk).
- **The hero's missiles pass through the fodder** (base hook `combat.missilePierce`, 0 in the base): 2 monsters more, 4 for the arrows.
  The automatic control shoots while it gets away from a crowd (`survivalMove`'s `shoot`: it used to drop its cast and only flee).
- **Loot** (owner: "too much loot"; the other game drops 2 to 5 items a minute in Act I): in the flow a normal monster's or a minion's
  items are kept one in three (gems and runes one in four), the elites' all, and a magic item kept is rare 35 % of the time
  (`FLOW_LOOT`, `flowDrops`). Measured (god mode, a whole act): 5.2 to 9.1 items a minute before (Barbarian 79 items, 45 magic, 1
  rare; Necromancer 111, 63 magic, 6 rares), 2.5 to 5.3 now (Barbarian 37, 19 magic, 8 rares; Necromancer 60, 23 magic, 23 rares, 3
  sets). Gold a run (`tools/gold.ts`, a new hero with the starter kit, 3 runs a class): median 76, 19 (the Amazon, dead at 2:00) to 140 (lot 292: 75.5 to 122.5, median 103.5, the heroes living longer); with the gear kept over 25 runs (`--run`, the loot sold between runs) 36 to 370, median 265.
- **Builds**: the Run's Sorceress plays the lightning plan (Charged Bolt; the fire plan's single bolt killed 2.5 monsters a second).

**The recalibration** (owner's target: no gear, death around 2:30-3:30 for every class, melee included; each gear tier about +30-35 %
of survival; Act I beaten after 8 to 20 runs; the loot as the engine; 4-5+ kills a second): `RUN.mercyAct1` 0.7 / 0.65 / 0.2
(monsters' damage ×0.7 of Diablo II's, bosses' and packs' life ×0.65, elites' damage ×0.2), the act clock's ramp from 0:00 (`FLOW.ramp`:
+40 % damage and +25 % life a minute, ×2.6 at most, reached at 4:00), Andariel's lair's monsters ×0.4 of the damage (`FLOW.zoneDmg`: six
levels above the Dark Wood's, a wall every hero met at 9:16), and a class factor on the hits taken (`FLOW.classTaken`: Amazon 0.65,
Paladin 0.75, Necromancer 0.8, Barbarian 1.1, Assassin and Druid 1.15, Sorceress 1.3: the base's bots clear the field very unevenly).

Curves (`tools/tiers.ts`, a new hero a run, Act I in Normal, 6 runs a class and tier: median seconds survived, victories, and with the
starter kit the kills a second; tier 0 the starter kit, 1 three magic pieces of item level 8, 2 every slot magic of 14, 3 every slot rare
of 20, 4 the best of four rares a slot of 28; the gear's power `gearPower` 4-47, 28-122, 60-128, 188-310, 389-539):

| Class       | Tier 0 before | Tier 0 now       | Tier 1 before / now | Tier 2 before / now | Tier 3 before / now | Tier 4 before / now |
| ----------- | ------------- | ---------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| Amazon      | 151 s, 0/6    | 124 s, 0/6, 4.6  | 156 / 203 s         | 157 / 205 s         | 559 / 275 s         | 602, 1/6 / 718, 5/6 |
| Assassin    | 572 s, 0/6    | 165 s, 1/6, 8.1  | 575 / 225           | 627 / 583, 1/6      | 776, 4/6 / 730, 4/6 | 750, 5/6 / 727, 6/6 |
| Barbarian   | 438 s, 0/6    | 400 s, 0/6, 7.3  | 433 / 405           | 433 / 405           | 558 / 485           | 729, 4/6 / 735, 3/6 |
| Druid       | 573 s, 2/6    | 211 s, 1/6, 9.8  | 575 / 243           | 570 / 710, 3/6      | 578 / 714, 3/6      | 721, 4/6 / 726, 4/6 |
| Necromancer | 544 s, 0/6    | 237 s, 0/6, 8.1  | 540 / 296           | 532 / 233           | 692, 3/6 / 627, 2/6 | 581, 1/6 / 608, 2/6 |
| Paladin     | 413 s, 0/6    | 260 s, 0/6, 7.4  | 400 / 388           | 432 / 387, 1/6      | 593 / 581, 2/6      | 726, 6/6 / 716, 5/6 |
| Sorceress   | 149 s, 0/6    | 426 s, 0/6, 10.3 | 329 / 396           | 297 / 536           | 666 / 555, 1/6      | 663, 2/6 / 572, 0/6 |

Median of the classes, tiers 0 to 4: now 237, 296, 405, 581, 718 s (+25 %, +37 %, +43 %, +24 %: about a third a tier, in steps, the
mini-bosses at 3:00, 6:00 and 9:00 being walls); before 438, 433, 433, 593, 721 s (the melee and the summoners held 7 to 10 minutes with
the starter kit, the archers and the Sorceress 2:30). With the starter kit 2 runs in 42 are won (lucky ones), with tier 4 25 in 42.
Kills a second 4.6 to 11 with every tier (before 1.4 to 1.9 for the Amazon and the Sorceress). The Barbarian and the Sorceress hold
longest with the starter kit (6:40, 7:06: the Dark Wood's entry and the Countess are their walls) and the Sorceress meets Andariel's lair
as a wall with the tiers' gear (her runs with her own loot win).

Run after run (`tools/campaign.ts --run <class> Prog|Bis 25`, `SV_SHOP=1`, the gear kept, the loot sorted, two names a class): first
victory at run

| Class       | Before (lot 293, one name) | Now: Prog | Now: Bis | Victories in 25 (Prog, Bis) |
| ----------- | -------------------------- | --------- | -------- | --------------------------- |
| Amazon      | none (held at 2:30)        | none      | 11       | 0, 15                       |
| Assassin    | 6                          | 6         | 4        | 20, 18                      |
| Barbarian   | none                       | 12        | 4        | 14, 22                      |
| Druid       | 2                          | 5         | 7        | 20, 19                      |
| Necromancer | 3                          | 9         | 22       | 17, 3                       |
| Paladin     | 8                          | 7         | 8        | 19, 18                      |
| Sorceress   | none                       | 8         | 18       | 13, 5                       |

13 of the 14 heroes beat Andariel in 25 runs (one Amazon held in the Cold Plains, her bow plan offered no Multiple Shot: little loot),
the median first victory at run 8 (4 to 22). Not done: a human's pace (the bots' plans
and cards decide much: a bow Amazon offered no Multiple Shot stays weak), the walls of the mini-bosses (survival grows by steps).

## The hub in six tabs (lot 295)

The owner's note (a picture of a Diablo-like main menu "in this style" and a table of six tabs in three panels) is the Run's hub between
runs (`ui/hub6.ts`, over the town, opaque; the Campaign keeps lot 285's hub). Every panel is a system the game already has:

| Tab        | Left                               | Centre                                    | Right                                         |
| ---------- | ---------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Personnage | equipment (10 slots) + charms grid | bag (+ the run's temporary pages)         | the runs: acts and difficulties open, records |
| Coffre     | equipment                          | bag                                       | shared stash (one page at a time, ‹ n / N ›)  |
| Skills     | equipment                          | attributes and stats (`computeDerived`)   | the class's three trees, read only            |
| Craft      | bag                                | the Cube's one-item recipes               | shared stash                                  |
| Cube       | bag                                | the Horadric Cube (3 × 4) and its matches | shared stash                                  |
| Merco      | the hireling's gear, or hiring     | bag                                       | shared stash                                  |

- **One thumb**: a tap on an item selects it and opens its sheet (the base's tooltip, the tab's actions), a long press runs the first
  action; the tabs (with an icon each) and the bar (shop, "Start the run", settings) under the thumb on a phone held upright, the three
  panels stacked in one scrolling column; on a wide screen (landscape, the unfolded Fold) the tabs on top and the three panels side by
  side, each scrolling on its own. Touch targets ≥ 44 px.
- **Diablo II's art** (the interface art generated on the device from the owner's MPQ files, lot 292): the stone panel (`--u-panel-blank`)
  under the panels, the tabs and the bar, the carved stone buttons (`--u-btn-*`), gold frames, the selected tab lit red as in the
  owner's picture, and the items' inventory images (`item:*`, the SDK's `itemIconOf`) on grids of Diablo II's pitch, each item by its
  size, tinted by quality. Without the art: the same layout in plain dark panels.
- **Actions** (the base's `Game` methods, nothing new): wear (`equipFromBag`, no requirement), take off, activate a charm (`stowCharm`) or
  take it back, **sell from the bag without a merchant** (`Game.sell`, the mode's price; the run's temporary pages too, lot 293), to the
  stash's page and back (`stash`, `unstash`), to the Cube and back (`cubeAdd`, `cubeRemove`, a rune or gem of the stash's tab by a tap:
  `cubeFromTab`), transmute (`cubeMatches`, `transmuteGrid`), craft (`cubeCheck`, `transmute`), give to the hireling and take back
  (`mercEquip`, `mercUnequip`), hire and resurrect (`mercOffers`, `hireMerc`, `resurrectMerc`). The shop (lot 292: buy, buy back, gamble)
  stays one screen over the hub from the bar; its Bag tab is still there.
- **Craft**: Diablo II's Cube recipes that work on one item of the bag (`CubeRecipe.items`): crafting (Blood, Caster, Hit Power, Safety:
  a magic item, a jewel, the slot's rune, the family's perfect gem; `cube.craft`), base upgrades, sockets and rerolls; a recipe picked
  lights the bag's items it takes (`cubeCheck`), its ingredients counted from the stash's tabs. **Cube**: the base's Cube grid and its
  transmutes (runes, gems, every recipe the content matches). Corruption and the endgame maps are not offered (the owner's endgame is
  for later).
- **Merco**: Diablo II's hirelings (Kashya's Rogues, Greiz's guards, Asheara's Iron Wolves, Qual-Kehk's Barbarians, by the ruleset's
  model). The hero is level 1 between runs: they open and are priced by the **best level reached in a run** (rule `merc.hireLevel`,
  `survivals:rec:level`: the Rogue at 5, 506 gold at level 18); the hireling's level is the hero's (1 between runs, rising with him in a
  run), he wears any item of his slots (no requirement: rule `char.equipNeedsReqs` now covers the hireling too) and comes into every
  zone of a run (the base's `spawnMerc`), dies and is resurrected for gold as in the base. **Not measured**: the bots of the balance
  (`tools/tiers.ts`, `--run`) hire none; a hireling makes the runs easier than lot 294's measures.
- **Skills**: the trees are read only between runs (the Run resets the skills at each run, lot 294); a tap shows a skill's level required,
  prerequisites and text.

Controls: unit `tests/unit/hub6.test.ts` (the six tabs' panels, the bag's sizes, equip, sell, charms, the stash, the temporary pages, a
Blood amulet crafted, a rune transmuted, a Rogue hired and given a Great Helm at level 1, with the hero in the next run, the trees read
only) and the base's `tests/unit/mods-gamemode-hub.test.ts` (the hooks inert in the base); e2e `tools/e2e/survivals.mjs` R4, H1-H6 (each
tab by a real tap in the six sizes, the sheet, the stash, the Cube, the craft, the hireling).

## The other game measured again (lot 296)

The owner's request: bring the Run's Act I closer to the other survivors game (observed for reference only: nothing copied, no asset,
text nor code; five of its runs looked at on a phone screen, 412×915 in portrait, one in landscape). Ours was measured with a bot (the dev
build, Chromium headless, the floating joystick moved through real touches on a turning circle, getting away 1.5 s from a hit, walking to
the gems, the first card always), sampled every 10 s of the act's clock; screenshots kept in local, unversioned notes
(`survivals/shots/296`).

| Measure (no gear, the same bot) | The other game                                                                   | Ours before (lot 295)                                                  | Ours now                                                     |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Monsters on screen              | ~5 at 0:10, 6-8 at 0:30-1:00, ~20 at 1:25, 30-40 at 1:55-2:20                    | 11 at 0:10, 21 at 0:30, 15 at 1:00, 48 at 1:50                         | 5 at 0:10, 9 at 0:30, 12 at 1:00, 31-34 at 1:50-2:00         |
| Kills                           | 34 at 0:43, 99 at 1:27, 216 at 2:10; 268-320 a run (~2 a second)                 | Barbarian 28 at 0:50, 73 a run (0.6 a second)                          | Barbarian 55 at 0:50, 140 at 1:34, 187 a run (1.6 a second)  |
| Levels                          | 5 at 1:00-1:18, 8 at 1:30-2:08, 9-11 at the death (2:05-2:32)                    | floor 5 at 1:40; the bot 6 at 1:54                                     | floor 5 at 1:00, 8 at 2:20; the bot 7 at 1:34                |
| Gold of a run                   | 1 to 194, about 107 (50 a minute)                                                | 25 (1:54); `tools/gold.ts` 34-284 by class, 10 a minute in a short run | 91 (1:56); `tools/gold.ts` 67-369, 60-115 a run of 2:30-3:30 |
| Items, cadence, speed, framing  | 2-5 items a minute; Teeth 1.2 s; 4 units a second; ~26 px a unit                 | the same (lots 291-294)                                                | unchanged                                                    |
| Death screen                    | killer and hit, damage of the last 2 s, act, time, level, kills, gold, best time | killer's words glued ("Slain byBrute3physical"), no record of survival | spaced; the longest run ("Longest run", "New longest run!")  |
| HUD                             | gold, zone, act, kills at the top                                                | zone, time, live / wanted, next elite, pause                           | the run's kills and gold added                               |
| Between runs                    | Play again, the shop (permanent ranks 100-250 gold), menu                        | Visit the shop, Play again, Hub (gear only)                            | unchanged (no paid rank: the owner's rule)                   |
| A run without gear              | 2:05-2:32 (the bot); Act I ~5:50 to Andariel                                     | the bot 1:54; Act I 12:00 (the owner's)                                | the bot 1:56-2:00; 12:00 kept                                |

Ranked gaps and what was done (the others kept, see "Not done"):

1. **Balance** (the owner's targets: no gear, death at 2:30-3:30; +30-35 % a tier; Andariel after 8 to 20 runs): the monsters' hits at
   Diablo II's own (`RUN.mercyAct1.dmg` 0.7 → 1), the class factor lightened to six classes around 1 (`FLOW.classTaken`: Amazon 0.4,
   Assassin 0.95, Barbarian 1.2, Necromancer 0.9, Paladin 0.85, Sorceress 1.5; the Druid none), the Dark Wood's monsters ×0.8 of their
   damage and Andariel's lair's ×0.35 (`FLOW.zoneDmg`: the walls at 6:30 and 9:16), the archers' shots ×0.45 (`FLOW.missileDmg`; the
   Barbarian's killers in the Dark Wood were skeleton archers 15 times in 20).
2. **A gentle first minute** (`FLOW.density`: 5 at 0:00, 10 at 0:30, 16 at 1:00, 40 at 2:00, 60 at 3:00, then as before).
3. **Quicker levels** (`FLOW.levels`: 2 at 0:12, 3 at 0:24, 4 at 0:40, 5 at 1:00, 6 at 1:30, 8 at 2:20, 11 at 4:00, 14 at 7:00, 18 at
   12:00).
4. **Gold**: `ECON.zoneCap` 7 → 40 gold a zone counted fully (a run without gear about 100 gold, a magic item about a run and a half).
5. **HUD and run-end screen**: the run's kills and gold in the HUD (`kills`, `gold` chips), the HUD's row hidden under the death notice,
   the killer's line spaced on the run-end screen, the longest run kept by act and difficulty (`survivals:rec:<d>:<act>:surv`, a death
   included), told on the run-end screen and listed with the records.
6. **The bots' cards**: in a run, the plan's skill not offered, a card off the plan is banished for the zone (`autoAnswer`; the bow
   Amazon of lot 294 never met Multiple Shot).

Curves (`tools/tiers.ts`, 8 runs a class and tier, median seconds, victories; "before" the same tool on lot 295's code, 6 runs):

| Class       | Tier 0 before / now | Tier 1    | Tier 2    | Tier 3              | Tier 4              |
| ----------- | ------------------- | --------- | --------- | ------------------- | ------------------- |
| Amazon      | 124 / 186           | 202 / 208 | 205 / 215 | 718, 4/6 / 709, 4/8 | 717, 3/6 / 713, 5/8 |
| Assassin    | 132 / 558 (2/8)     | 218 / 593 | 239 / 718 | 720 / 730, 7/8      | 731 / 728, 8/8      |
| Barbarian   | 337 / 218           | 283 / 222 | 466 / 253 | 581 / 558           | 730, 6/6 / 720, 8/8 |
| Druid       | 151 / 206           | 243 / 219 | 295 / 340 | 714 / 717, 6/8      | 730 / 721, 7/8      |
| Necromancer | 538 / 177           | 302 / 203 | 544 / 256 | 571 / 280           | 721, 3/6 / 602, 2/8 |
| Paladin     | 267 / 215           | 220 / 221 | 401 / 378 | 709 / 709, 5/8      | 709 / 583, 3/8      |
| Sorceress   | 402 / 170           | 401 / 241 | 537 / 264 | 550 / 541           | 578 / 581, 2/8      |

Median of the classes, tiers 0 to 4: before 267, 243, 401, 709, 721 s (the tier 0 from 124 to 538 s by class); now 206, 221, 264, 709,
713 s (the tier 0 from 170 to 218 s but the Assassin's, two runs in eight won; about +36 % a tier on average, in steps: the tier 3 is the
first that reaches the lair), victories with the tier 4 35 / 56 (before 28 / 42).

Run after run (`tools/campaign.ts --run <class> Prog|Bis 25`, `SV_SHOP=1`, the gear kept): every one of the 14 heroes beats Andariel
within 25 runs (lot 294: 13 of 14), the first victory at run 14 / 19 (Amazon), 4 / 1 (Assassin), 10 / 6 (Barbarian), 1 / 1 (Druid),
13 / 13 (Necromancer), 10 / 13 (Paladin), 18 / 14 (Sorceress), median 11.5 (lot 294: 8). Gold a run (`tools/gold.ts`, the starter kit, 4
runs a class): 60 to 115 a run that ends at 2:30-3:30, 280 to 460 a won one (before: 21 to 40 for a short run).

Not done (measured, kept for later): the Druid and the Assassin still win from their first runs (one name each at run 1: the class factor
alone cannot hold a build that passes the champions of the Cold Plains, the Assassin's tier 0 is bimodal); the field is about a fifth
darker than the other game's (the base's lighting setting, hidden in the mode); the elites' affixes are not written under their bar; the
other game's act lasts about 6 minutes (ours 12, the owner's choice); its permanent paid ranks (the owner's rule: none).

## Every skill on its own cooldown, a readable cadence, a run never resumed (lot 298)

The owner's tests of the Run (Act I):

- **Not every skill was cast** ("when a skill is cast, another one cannot be"): the base cast one skill at a time (`World.startCast`: the
  hero's cast or strike holds the next request until it ends) and lot 294's rotation (`rotation`, sim/autopilot.ts) only fired while the
  hero was free. Base hook `player.parallelCast` (inert without the mode): a skill asked while another cast or strike goes on is cast at
  once beside it (`World.sideCast`: its cost, its effect, its cast event; the running animation goes on; the weapon's attack, a melee
  strike and the same skill wait for the hero), and `skills.onCast` (called at every cast, main or beside). In Act I's flow
  (`FLOW.parallel`) the rotation fires beside a running cast every damaging skill learned on its own floor (`minCastOf`), the buffs and the
  other skills every `ROTATE_EVERY` (4 s), the brain's choice keeping the main cast; each skill's floor is set at its cast
  (`floorCast`, rule `skills.onCast`; lot 294's `holdCast` set it for the running cast only).
- **The skills still went off very fast**: a spell's floor never under `FLOW.spellMin` (0.8 s; Fire Bolt, Ice Bolt, Magic Arrow 0.4 →
  0.8, Charged Bolt, Lightning 0.6 → 0.8), and every other spell learned held `FLOW.castGap` (0.5 s) after a spell: at most two spells a
  second whatever the build (the weapon's strikes keep their rhythm). Measured with `tools/rate.ts` (a hero with every skill of his trees
  open at the level, 3 or 4 points each, 60 s of the act in god mode; casts a second, all skills; the most cast skill; missiles a second;
  "beside": casts beside a running one; "2+": share of the seconds where two skills or more went off):

  | Hero, control                 | Before: casts/s, top skill, missiles/s | Now: casts/s, top skill, missiles/s | Beside | 2+ skills (before / now) |
  | ----------------------------- | -------------------------------------- | ----------------------------------- | ------ | ------------------------ |
  | Sorceress level 3, standing   | 3.02, Fire Bolt 1.37, 9.8              | 1.98, Fire Bolt 0.8, 5.7            | 0.23   | — / 77 %                 |
  | Amazon level 3, standing      | 2.03, Fire Arrow 1.6 (8 in a row)      | 2.2, the bow's shot, Fire Arrow 1.0 | 0.17   | — / 35 %                 |
  | Necromancer level 3, standing | 1.2, Teeth 0.75, 3.8                   | 1.18, Teeth 0.73, 3.7               | 0.08   | — / 27 %                 |
  | Sorceress level 12, walking   | 2.97, 13 of 14 skills, 2.6             | 2.17, 14 of 14 skills, 1.6          | 0.35   | — / 88 %                 |
  | Assassin level 12, walking    | 2.52, 9 of 13 skills                   | 1.95, 12 of 13 skills               | 0.23   | — / 77 %                 |
  | Necromancer level 12, walking | 2.37, 3.7 missiles                     | 2.15, 0.9 missiles                  | 0.4    | — / 78 %                 |

  Never one spell again and again: no spell cast twice within its floor, no two spells within 0.5 s (unit `lot298.test.ts`, e2e C2).

- **The balance** (`tools/tiers.ts`, 8 runs a class and tier, median seconds, victories): the casters measured again and their factor on
  the hits taken (`FLOW.classTaken`) set back near their curves: Assassin 0.95 → 0.8, Druid 0.9, Necromancer 0.9 → 1.05, Sorceress 1.5 →
  1.1. Median of the classes, tiers 0 to 4: before 203, 227, 264, 566, 722 s, victories 3, 3, 5, 19, 39 / 56; now 204, 227, 344, 565,
  722 s, victories 0, 0, 3, 19, 39 / 56 (the Paladin's and the Barbarian's melee unchanged; the Necromancer holds longer with tiers 1-2,
  the Sorceress kills fewer monsters a second, 5.4 against 8.4, and lives as long).
- **A run never resumed** (owner: "launching a character goes on where I stopped"): a Run's zones are no longer resumed when the app is
  opened again (`RunDef.resumeOnLoad` may now be a function of the character: `!isRunMode`), the Campaign's rounds still are. A run left
  open in the save (closed in the middle, or saved by an older version with its `run` state) is ended at the character's first step in
  town as left (`abandonInterrupted`: its loot settled to the bag and the pages, its records kept, the hero at level 1, no run-end
  screen) and a new run of the same act starts at once from its first zone at 0:00 (the hub's `autoStart`). The checkpoints are the acts
  opened. Save version 7 unchanged (milestones only).
- **Back to the character list and the home screen** (owner: "I cannot find how"): the pause and the hub's bottom bar have "Choix du
  personnage" (the mode's character list opens directly after the save) and "Écran d'accueil" (the home screen and its modes), confirmed
  in the pause with what happens to the round ("the run in progress will be abandoned…", or the Campaign's round saved); base host
  `UiHost.characterList`, `UiHost.homeScreen` (the base's "Changer de personnage" opens the list directly too).

## The run-end screen, the modes apart and the character card (lot 299)

The owner's returns (screenshots of the "Run over" screen and of the list "Diablo II (original) — Survivals"):

- **Run-end screen** ("I have to scroll to reach the buttons"): the title on top, the actions ("Visit the shop", "Play again", "Hub") in a
  bar always at the panel's foot (`.sv-end-acts`, one row, ≥ 44 px), the rest between them (`.sv-end-body`: the figures two or three a row
  when the width allows, the notes smaller, tighter on a screen under 520 px high) scrolling on its own if it still overflows; the panel
  itself never scrolls. Checked in the e2e's six sizes and a phone in landscape of 800 × 360 (`tools/e2e/survivals-299.mjs` E1-E2,
  `survivals.mjs` X1).
- **The modes apart**: the base lists, creates and saves a character under its full ruleset (`d2+survivals`, `pd2+survivals`; lot 271's
  `charsForMode`, exact id): measured in a browser, each list holds only its own (M1). What the two modes still shared with their content
  was the **shared stash** (`d2+survivals` used `d2`'s, `pd2+survivals` `pd2`'s); each mode now has its own (`d2m.shared.<content>+<mode>`,
  `sharedKeyOf`), first filled with a copy of its content's stash when it does not exist yet (`SaveStore.seedModeStash`: what a Survivals
  character had put there is still there; the content's stash is left as it was), then apart (the guild stays the content's). A save of
  a ruleset this version cannot read but whose modes it knows is read under its canonical id (`repairRuleset`: `survivals+pd2` →
  `pd2+survivals`; `survivals` alone, its content unknown → `d2+survivals`, "Diablo II (original) — Survivals"), saved so at the next
  save; a mod absent from this version stays greyed and untouched. Save version 7 unchanged. The owner's own list could not be
  reproduced: if a character still shows in the wrong list, its save's `ruleset` is what to look at.
- **The character card** (base slot `charselect.card`, `ui/charcard.ts`): a Run character's card tells its progress instead of
  "Level N Class" (the level goes back to 1 at each run): "Sorcière · Run", the farthest act and zone reached ("Acte I — Cauchemar · zone
  2 / 5": the highest difficulty, then act, with a run), the runs and victories of every act, and the best time (a victory) or the longest
  run of that act ("Runs 10 · victoires 2 · survie 2:10"); "Aucune run pour l’instant" before the first. The Campaign's characters (and
  those made before lot 289) keep the level and the difficulty. English through `i18n/en.json`.
- **The hub, smaller and without scrollbars** (the owner's screenshots in landscape: "zoom out a little, smaller buttons, no
  scrollbars"): smaller type and buttons (tabs 34 px high in a low landscape, 46 elsewhere; the bar's buttons 34 px, its two ways back on
  the bar's row, on a row of their own on a phone held upright), their touch area kept at 44 px by a transparent `::before`; the grids'
  cells sized to the panel's height as well as its width (container queries, `--rest` / `--fit` by panel: the bag whole with its gold, the
  equipment and the charms, the stash's page); the stats on two columns and the attributes on two rows in a low landscape; the Craft tab
  one category at a time (a row of four), its recipes in a compact grid, the recipe picked detailed under it; thin scrollbars (4 px)
  where a long panel still scrolls (a recipe's detail, the hireling). Measured by `tools/e2e/hub6-fit.mjs` in the six sizes, 800 × 360
  and a PC (before: the equipment 152-192 px over its panel, the stats 225-271, the recipes 1,128-1,382, the bar's ways back 25 px high;
  after: every tab's panels whole but the hireling's in a low landscape, every target ≥ 44 px); screenshots before / after in local,
  unversioned notes (`survivals/shots/299/hub`).

## Loot from the bosses, a countdown, stronger bosses, quicker levels (lot 300)

The owner's returns on the Run (Act I):

- **Loot from the bosses** ("far too many items on the ground; a few here and there on the ordinary monsters, the loot guaranteed on the
  bosses, as a survival game where the loot falls from the bosses"; the same for the runes: "many El and Eld runes on the ground").
  `FLOW_LOOT`, `flowDrops` (sim/loot.ts): the fodder (normal monsters, minions) keeps its items within a budget of the act's time
  (`fodderRate` 0.9 a minute, at most 2 waiting, half of one at a zone's start), its runes and gems within their own (0.12 a minute); a
  champion or a unique one item at most, half of the time; a zone's mini-boss at least 2 items and Andariel 4, the first rare or better
  (a set or a unique 10 / 25 % of the time), and a rune half of the time (El to Ith) and always for Andariel (Tir to Tal). Whatever the
  content's tables: pd2's fodder dropped 14 to 21 items a minute. Measured with `tools/drops.ts` (a new hero of each class, god mode, the
  whole act; median of the classes):

  | Ruleset | Items a minute (fodder / elites) before → now | Fodder runes an act | Boss items an act (rare+)  | Gold piles an act (gold each), most at once |
  | ------- | --------------------------------------------- | ------------------- | -------------------------- | ------------------------------------------- |
  | d2      | 3.71 (2.06 / 0.59) → 2.07 (0.80 / 0.39)       | 1 → 0               | 9 (3) → 12 (7), every boss | 160 (1.7) → 25 (10.5), 12 → 3               |
  | pd2     | 17.4 (15.1 / 0.80) → 2.79 (0.85 / 0.39)       | 47 → 0              | 17 (10) → 16 (9)           | 593 (1.2) → 54 (10.5), 86 → 5               |

- **The gold** ("it fills the screen"): the fodder's gold is pooled (`FLOW_LOOT.goldPile`, 10: a pile once that much has gathered; an
  elite or a boss drops the pool with its own), and the piles lying within 2.5 units merge (`mergeGold`). The same gold a run:
  `tools/gold.ts` (the starter kit, 4 runs a class) median 117 → 94 gold a run of about 3:40 (69 to 361 by class).
- **"My fire spell is no longer cast when I have 3 spells"**: the rotation's log of the casts (`castLog`, sim/autopilot.ts) was kept by
  character with the world's ticks; a zone is a new world whose tick starts again at 0, so a skill cast late in a zone looked cast in the
  future in the next one and the rotation left it out for the whole zone (90 to 180 s) while the brain's choice took the casts (with one
  or two spells the brain's choice covers them; with three or more the third was the rotation's). Measured with a Sorceress of random
  cards, 5 min god mode: the longest gap of a learned damaging skill with monsters around 95 to 190 s → 2 to 5 s. The log is now the
  world's. Unit test `lot300.test.ts`: with 1, 2, 3, 4 and 5 skills, each cast in the first zone and in the next one (it fails at 3 with
  the log by character).
- **The run's items in the inventory** ("the items picked up do not show in the inventory during the run"): lot 293 kept all of a run's
  items apart until its end; an item kept goes to the bag at once while it has room (`keepInRun`), apart beyond (to the bag or the
  temporary pages at the run's end, as before); the pause tells the run's loot ("Butin de la run : N objet(s) ramassé(s)…", those waiting
  when the bag is full).
- **A countdown after a zone's mini-boss** (`RUN.bossWait`, 10 s; `zoneWaitLeft`, `skipZoneWait`): a banner "Zone terminée : ramassez
  le butin", its figure and "Zone suivante — touchez pour y aller" (a button ≥ 44 px: a tap goes on at once); a zone ended on its time
  keeps 4 s (`RUN.nextAfter`), Andariel's fall 4 s.
- **"I did not have the next zone's assets, I got an error"**: three causes found. (1) Base, local mode: a map being generated in the
  background (the pregeneration of Act I's zones, whose maps the arenas are cut from) was joined by the zone's urgent request, then
  stopped for the urgent sheets (`yieldBackgroundMap`): the joined promise ended false without a failure, and the preparation listed the
  map missing (`prepFailure`). `D2LocalGen.joinMap`: a request more urgent than the background asks again at its own priority (once).
  (2) The named elites (Blood Raven, Rakanishu's Fallen, Griswold, the Smith) were never in a zone's species (`roundSpecies`): drawn
  before their sheets; now with their escorts and the boss's companions, and known when the zone is built (`build`, not the director's
  first step). (3) The next zone was never prepared (the app prefetched the town): base rule `game.nextZone` (null without a mode), the
  app prefetching its map, monsters and effects during the current zone (local mode, `planZoneAssets`); the mode names the run's next
  zone (`nextRunZone`). In an encrypted pack (`D2_REMOTE`) a zone's species load with its start (`sheetsFor` core reads `monsterPool`).
- **Bosses as walls** (`FLOW.boss`, the director's `empower` and `bossPowers`): a zone's mini-boss ×3 life and ×3 damage, Andariel ×2
  and ×2 (over the run's easing: `bossLife` 0.65, `eliteDmg` 0.2), the mini-boss's whole escort, a call of 3 of its escort every 12 s
  ("X appelle des renforts !"), a fury under 40 % of its life (damage ×1.3, speed ×1.2, "X entre en furie !").
- **Quicker levels, fewer ranks** (the other game: 6 + 6 slots, a card about every 15 s at first, evolutions capped). `FLOW.levels`:
  2 at 0:10, 5 at 0:45, 6 at 1:00, 8 at 1:40, 10 at 2:30, 12 at 3:30, 15 at 5:00, 18 at 6:30, 24 at 9:00, **30 at 11:30** (before: 5 at
  1:00, 11 at 4:00, 18 at 12:00): the last skills of the trees (level 30) before Andariel. A skill takes **5 points at most** in a run
  (`FLOW.skillRank`; Diablo II's 20 before): about 30 points spread over six skills or more. No cap on the number of skills (the trees'
  prerequisites take points of their own). The monsters grow stronger faster to hold the targets (`FLOW.ramp` 0.4 / 0.25 a minute, ×2.6
  at most → 0.5 / 0.4, ×4), and the class factors were measured again (`FLOW.classTaken`: Amazon 0.25, Assassin 1.35, Barbarian 1.2,
  Druid 1.15, Necromancer 0.9, Paladin 0.75, Sorceress 0.75).

Curves (`tools/tiers.ts`, median seconds survived, victories, the highest level reached; before: lot 299's code, 8 runs a class and
tier; now 6):

| Tier | Before: seconds, victories, level | Now              |
| ---- | --------------------------------- | ---------------- |
| 0    | 203, 1 / 56, 12                   | 189, 0 / 42, 12  |
| 1    | 234, 1 / 56, 18                   | 215, 1 / 42, 16  |
| 2    | 238, 0 / 56, 16                   | 362, 3 / 42, 25  |
| 3    | 581, 26 / 56, 19                  | 744, 20 / 42, 30 |
| 4    | 708, 32 / 56, 20                  | 753, 40 / 42, 30 |

No gear: 2:46 to 3:35 by class (before 2:31 to 3:58); about +40 % a tier on average (before +36 %), in steps (the mini-bosses at 3:00,
6:00, 9:00 are walls). Run after run (`tools/campaign.ts --run <class> Prog 25`, `SV_SHOP=1`): first victory at run 17 (Amazon; before
20), 4 (Assassin; 16), 6 (Barbarian; 5), 5 (Druid; 8), 8 (Necromancer; 11), 14 (Paladin; 13), 18 (Sorceress; none), median 8; the
Druid and the Assassin still too early (as lot 296). Kills of a run of about 3:40 (`tools/gold.ts`): 1,470 → 1,093.

Controls: unit `tests/unit/lot300.test.ts` (11), `lot294.test.ts`, `runloot.test.ts`, `runmode.test.ts`, `flow.test.ts` updated; e2e
`tools/e2e/survivals-300.mjs` (the boss's loot and the countdown, a tap to the next zone, its species, the next zone named, the run's
item in the bag and the pause); screenshots in local, unversioned notes (`survivals/shots/300`).

## Every spell independent, the monsters from beyond the screen, a run's HUD in the corners, quick zone changes (lot 301)

The owner's returns on the Run (Act I), a screen recording and screenshots:

- **"A cast seems to push the others' cooldown back: they are never cast together"** (the recording: an Assassin's five skills, four
  of them ready at once, a gold frame each, going off one after the other, the preview's sweeps jumping back). Couplings found and
  removed: (1) lot 298's `FLOW.castGap`: every other spell learned held 0.5 s after a spell, written into their cooldowns (the preview's
  refresh `until − castAt` grew: the sweep moved back); (2) the rotation asked one skill a tick (`w.input.cast`, the one cast the
  longest ago first) and the base took one request a tick; (3) a skill of use only when the hero was free waited `ROTATE_EVERY` (4 s);
  (4) a bow's or a throw's skill (flagged melee for its weapon) could never go beside another (`World.sideCast` answered `wait`); (5)
  the Assassin's charge-ups (kind `charge`) waited for a pack of three as a leap. Now (`castReady`, sim/autopilot.ts, in Act I's flow):
  every spell learned (the rotation's skills that do not need the hero's body: not the weapon's attack, a melee strike, a leap, a
  charge) whose OWN cooldown is over and that has a use (`rotationTarget`) goes off the very tick, beside the others (`World.sideCast`:
  its effect at once, several in one tick). A cast sets only its own cooldown (`floorCast`; a buff, a curse, a shout `ROTATE_EVERY` at
  least as its own cooldown, so the preview tells it), no global cap, no turn, no priority. The hero free, a short cast animation plays
  for the eye (no effect; a strike asked lifts it at once, `liftCosmetic`). The melee strikes keep one swing at a time (the hero's
  body), each on its floor. Base: `World.sideCast` lets a ranged skill of the weapon go beside (inert without `player.parallelCast`).
- **The cadence**: each spell on its own floor, the floors (lot 294's `minCast`, lot 298's `spellMin`) × `FLOW.spellScale` 2.5 and a
  class's factor `FLOW.classSpell` (Amazon 1.8, Assassin 1.25, Druid 1.15), so that a build's spells together keep about lot 300's damage
  a second. Measured with `tools/rate.ts` (level 12, every skill of the trees at 3 points, 60 s walking, god mode):

  | Hero        | Lot 300: casts/s, the most cast, 2+ skills a second | Now: casts/s, the most cast, 2+ skills a second, beside |
  | ----------- | --------------------------------------------------- | ------------------------------------------------------- |
  | Sorceress   | 2.17, the weapon 0.38 (spells 0.1-0.18 each), 82 %  | 4.9, every bolt 0.5 (its 2 s), 80 %, 2.47/s beside      |
  | Assassin    | 1.95, Charged Bolt Sentry 0.47, 77 %                | 2.82, each trap 0.38, 62 %, 0.73/s                      |
  | Necromancer | 2.1, the weapon 0.38, 78 %                          | 2.95, Bone Wall 0.48, 68 %, 0.68/s                      |

  Unit `lot301.test.ts`: six spells ready go off in the same tick, each on its own floor from it; a cast (main, beside, the rule) never
  moves another skill's cooldown; the preview's share of each skill only grows between two of its own casts; over 60 s a Sorceress (6
  spells), an Assassin (5) and a Necromancer (3): every gap ≥ the skill's own floor, the median within 2 ticks of it.

- **"The monsters pop too close to the hero"**: the director brought them on a ring of 11 to 14 units (on the screen: a phone held in
  landscape shows about 18 units across its half-width, 35 up and down in portrait). The app tells the mode its window and zoom (rule
  `render.zoom`, `setView`, sim/view.ts; the tools keep a Fold in landscape, 960 × 412); in Act I's flow every monster brought (the
  field, the packs and their escort, the encirclement, a boss's reinforcements, those brought back ahead, `recycle`) comes just beyond the
  screen's edge along its angle (`edgeAt`: the isometric projection, a sprite's head above its feet; `VIEW_MARGIN` 1 unit, 1.5 deeper at
  most), 60 % ahead of a moving hero, never on the screen (a point the arena's border pulls back into view is drawn again). To keep the
  pressure: a monster off the screen walks in 3 times quicker (base rule `ai.chaseSpeed`, 1 without a mode), the field 14 more alive
  (`offscreenExtra`, those on their way), and one left behind is brought back ahead 5 units beyond the edge. Kills in the first 30 s (a hero
  walking a circle, god mode, level 12; lot 300's ring → beyond the screen): Sorceress 75 → 93, Barbarian 13 → 36, Necromancer 43 → 67. Unit: in portrait and landscape, ≤ 2 % of
  the monsters brought appear on the screen (the arena's walls), e2e S1 the same as the renderer draws them.
- **"The monsters come at the hero then turn back"**: measured (`tools/turns.ts`, sim/turns.ts: a U-turn is a monster walking towards
  its target that walks away from it within a second; 60 s, the hero walking): most were the Fallen panicking at a Fallen's death (D2's
  rule; a hundred dying a minute: 5 to 41 U-turns a minute by class), then the monsters going back and forth between the hero and his
  creatures (the Necromancer's skeletons, the Druid's wolves and ravens, re-placed near him). Base rules (inert without a mode):
  `ai.allyDeathFlee` (no panic in the flow) and `ai.targetLock` (the flow: a target held 1 s, another taken 2 units nearer, never a
  creature of the hero: they still block the way). U-turns without reason a monster a minute, before → now: Druid 0.014 → 0.012,
  Necromancer 0.094 → 0.026, Paladin 0.051 → 0.016, the others 0 to 0.05 → 0 to 0.02; the fears cast (Howl, Terror) and the shooters
  keeping their distance stay. Stuck in a crowd: 0.1 to 4.5 % of the walking time → 0 to 0.3 %.
- **The run's HUD** ("useful but a long list in the middle of the screen"): the zone's name top right above the minimap (moved under it)
  with "Acte I Zone n / N" and the difficulty, the pause beside it; the clock and the next event on one small line at the top's centre
  (under the gauge's and the minimap's band on a screen held upright), the named monsters' bars under it; the level, the kills, the gold
  and the live monsters small under the life gauge (beside it in landscape); no boxes, smaller type, nothing on the field. The base's
  level line hidden in a round (HUD part `level`). Screenshots before / after in the six sizes, e2e `survivals-301.mjs` H1.
- **Zone changes**: measured on the production build, a phone emulated, CPU × 4 (e2e T1, from the tap on the countdown to the next zone
  played): 2.5 to 3.0 s, of which 1.7 to 2.0 s decoding the whole D2 map (270 ground chunks of the Blood Moor) for a 64-unit arena. Now
  only the arena and a screen around it are loaded (base `d2Map.view`, `mapFiles`: 40 to 60 chunks), the next zone's part decoded during
  the current one (`prefetchMap`, rule `game.nextZone`, whatever the graphics' source; its sheets too), the last image kept on the screen
  under 400 ms (no loading screen): 0.54 to 0.89 s.

Balance (`tools/tiers.ts`, the reduced protocol: 5 runs a class, tiers 0 and 2, median seconds; before: lot 300's code):

| Class       | Tier 0 before → now (wins) | Tier 2 before → now (wins) |
| ----------- | -------------------------- | -------------------------- |
| Amazon      | 209 → 260                  | 306 → 771 (5 / 5)          |
| Assassin    | 193 → 128 (1 / 5)          | 366 → 753 (4 / 5)          |
| Barbarian   | 213 → 241                  | 774 (2 / 3) → 420          |
| Druid       | 183 → 240 (2 / 5)          | 743 (2 / 3) → 738 (4 / 5)  |
| Necromancer | 213 → 211                  | 234 → 211                  |
| Paladin     | 223 → 237                  | 194 → 249                  |
| Sorceress   | 194 → 211                  | 231 → 236 (2 / 5)          |
| Median      | 209, 0 / 21 → 237, 3 / 35  | 306, 4 / 21 → 420, 15 / 35 |

Before: 3 runs a class (lot 300's code, the same protocol). The spells all at once on their own floors more than doubled the casters'
damage (floors × 1 : every caster won 13 to 15 runs of 21 at tier 0, the median 752 s), the field brought beyond the screen gave every
class 20 to 50 s more (the first hits later): hence `spellScale` 2.5, the classes' factors and the monsters' damage ramp a little steeper
(`FLOW.ramp.dmg` 0.5 → 0.6 a minute). No gear: 3:31 to 4:20 by class (lot 300: 2:46 to 3:35), the Assassin and the Druid bimodal as
before (a run that passes the first mini-boss at 3:00 goes on to win); tier 2 easier (its median 5:06 → 7:00).

Save version 7 unchanged.

## Act I tightened: the threat carried by the clock to the end (lot 302)

The owner's targets after lot 301 (every spell independent: the casters too strong, the act a little too easy): no gear, death between
2:30 and 3:30 for every class (a melee hero no longer than about 3:30); each gear tier about +30-35 % of survival, as a slope rather than
steps (the mini-bosses kept as peaks); the act finished after about 8 to 20 runs (median 12) with the loot found; the Assassin and the
Druid no longer winning at run 4-5, nor bimodal; tier 2 about 5:00 (lot 301: 7:00); every class able to win.

What the bots showed (`tools/tiers.ts`, a trace by 30 s of a run: the hero's life, the monsters near, their life, the damage dealt and
taken): (1) the threat stopped growing at 5:00 (`ramp` capped ×4) while the hero kept growing to level 30 (his damage about twentyfold
from level 12, his life fivefold): a hero past the 3:00-4:00 crowd won, whatever the gear, hence the bimodal classes; (2) raising the
monsters' life or damage alone changed nothing late (×10 life, ×9 damage: the same victories), the casters keeping their distance at
10 units with a few monsters near and healing 3 % of their life a second from their kills; (3) Diablo II's zone steps were the walls
(the Stony Field +40 % damage, the lair's fodder four times the Dark Wood's life: deaths gathered at 3:50, 6:10 and 9:40); (4) the
Assassin's traps (wakes, sentries) and the Druid's lasting fires (Fissure 44-48 % of his damage, Molten Boulder 28 %) on short floors;
(5) the bot Paladin raised Sacrifice to 5 before Zeal: in the flow's quick cadence its cost (a share of the damage dealt) was his killer
(Sacrifice's cost removed for the measure: no gear 151 → 232 s, tier 4 232 → 743 s).

Levers (structural first, sim/runmode.ts `FLOW`, sim/director.ts):

- **The clock carries the threat to the end**: `ramp` steeper at first (damage 0.6 → 1 a minute, ×6 at most), then late curves over it
  (`ramp.lifeAt`, `dmgAt`, `speedAt`; act second → factor, linear between the points, director `lerpAt`): life ×2.5 at 6:00, ×7 at 8:00,
  ×18 at 10:00, ×45 by Andariel; damage ×1.6 at 10:00, ×2.6 by Andariel; the monsters brought ×1.4 quicker at 7:30, ×1.85 at the end (a
  hero keeping his distance is caught up with). The act's boss keeps her own life (not ramped).
- **The steps smoothed** (`zoneDmg` a1r2 0.85, a1r3 0.75, a1r4 0.65, a1r7 0.2; new `zoneLife`, the elites' and fodder's life of a zone:
  a1r3 0.8, a1r7 0.17), the mini-bosses and Andariel unchanged (the peaks).
- **The heal of a kill** 0.004 → 0.003 of the life; the field a little denser from 2:00 (`density` 42 at 2:00, 66 at 3:00, 80 at 4:00).
- **Lasting skills on floors of their own** (`minCast`): Shock Web 1.6, Charged Bolt and Lightning Sentries 2.0, Death Sentry 2.0, Wake
  of Fire 2.4, Wake of Inferno 2.6, Molten Boulder 3.0, Fissure (eruption) 4.5, Volcano 2.6 (× `spellScale` 2.5); the classes' factors
  on their spells measured again (`classSpell`: Assassin 1.25 → 1.3, Druid 1.15 → 1.7, Amazon 1.8 → 2, Sorceress 1 → 0.85).
- **The Paladin's Run plan** (sim/autopilot.ts `RUN_PLAN`, `planOf`, `RUN_AVOID`): one point of Sacrifice (Zeal's prerequisite) then Zeal;
  the cards take Sacrifice beyond its point only when nothing else can be learned; Sacrifice's swing 1.2 s (`minCast.sacrifice`).
- **Then the classes' factors** (`classTaken`, no gear brought to 2:30-3:35): Amazon 0.25 → 0.4, Assassin 1.35 → 1.1, Barbarian 1.2 →
  0.9, Druid 1.15 → 0.6, Necromancer 0.9 → 0.5, Paladin 0.75 → 0.45, Sorceress 0.75 → 0.7.

Measured with `tools/tiers.ts` (10 runs a class and tier, median seconds as the tool gives it, victories), before (lot 301's code) → now:

| Class       | Tier 0                            | Tier 1             | Tier 2             | Tier 3                 | Tier 4                  |
| ----------- | --------------------------------- | ------------------ | ------------------ | ---------------------- | ----------------------- |
| Amazon      | 4:34 → 2:32                       | 12:44 (6) → 4:59   | 12:53 (10) → 6:15  | 12:43 (10) → 11:52 (3) | 12:39 (10) → 12:37 (10) |
| Assassin    | 2:56 (3) → 2:30                   | 12:32 (9) → 6:11   | 12:29 (8) → 4:27   | 12:38 (10) → 9:58 (2)  | 12:35 (10) → 12:29 (5)  |
| Barbarian   | 3:52 (1) → 3:11                   | 4:24 → 4:59        | 4:25 → 5:03        | 9:54 (1) → 8:43        | 12:35 (10) → 12:05 (2)  |
| Druid       | 12:19 (7) → 3:33                  | 12:24 (10) → 4:53  | 12:25 (10) → 5:01  | 12:22 (10) → 12:36 (8) | 12:23 (10) → 12:42 (10) |
| Necromancer | 2:08 → 3:04 (1)                   | 3:39 → 4:13        | 3:45 → 4:18        | 13:08 (8) → 12:36 (8)  | 13:09 (9) → 12:39 (10)  |
| Paladin     | 3:51 → 3:34                       | 3:42 → 3:50        | 4:07 (1) → 3:54    | 12:14 (4) → 10:57 (1)  | 3:54 (3) → 12:31 (6)    |
| Sorceress   | 3:57 (3) → 3:34                   | 4:05 (2) → 4:01    | 12:52 (5) → 4:24   | 12:46 (7) → 5:03       | 12:45 (10) → 12:44 (5)  |
| Mean        | 4:48, 14 / 70 wins → 3:08, 1 / 70 | 7:39, 27 → 4:44, 0 | 8:59, 34 → 4:46, 0 | 12:15, 50 → 10:15, 22  | 11:26, 62 → 12:32, 48   |

(Lot 301's README measured 5 runs a class with another name for the seeds: 3:31-4:20 with no gear; with 10 runs the bimodal classes
show it: the Druid won 7 runs of 10 with the starter kit.)

Run after run (`SV_SHOP=1 tools/campaign.ts --run <class> <seed> 25 1 0 d2 1`, five seeds a class: the first victory in 25 runs):

| Class       | Before (lot 301)         | Now                       |
| ----------- | ------------------------ | ------------------------- |
| Amazon      | 2, 3, 3, 3, 4 (median 3) | 7, 7, 9, 9, 11 (9)        |
| Assassin    | 3, 3, 3, 4, 6 (3)        | 6, 7, 10, 13, 23 (10)     |
| Barbarian   | 6, 7, 9, 12, 15 (9)      | 3, 10, 11, 16, 21 (11)    |
| Druid       | 1, 1, 2, 2, 4 (2)        | 6, 10, 10, 12, 14 (10)    |
| Necromancer | 3, 7, 9, 11, 12 (9)      | 6, 7, 10, 12, 16 (10)     |
| Paladin     | 24, none × 4             | 11, 13, 23, 23, none (23) |
| Sorceress   | 3, 3, 3, 4, 4 (3)        | 12, 13, 14, 16, 18 (14)   |
| All         | median 4                 | median 11                 |

Kills a second (tier 0, averaged over the whole run with its gentle first minute): 3.2 to 8.0 → 3.3 to 4.9 by class (the quickest
killers lower: the Druid 8.0 → 4.3, the Assassin 6.9 → 3.3; the field itself denser). Limits: the gear tiers of the tool are not a slope yet (tiers 1 and 2 about the same, +50 % over no gear; tier 3 more than
twice: the 3:00-4:00 crowd is passed with rares); the Paladin stays the slowest (Zeal at level 12 comes by the cards: one seed of five
without a victory in 40 runs); a Barbarian seed won at run 3. Unit `tests/unit/lot302.test.ts` (the late curves, a monster brought late
×1.5 quicker and ×10 tougher, the lasting skills' floors, the Paladin's plan); `flow.test.ts` (density) and `lot301.test.ts` (a trap's
casts in 60 s) updated. Save version 7 unchanged.

## Act I as a slope of gear tiers, the Paladin's Zeal (lot 303)

The owner's targets after lot 302 (no gear 3:08 on average, tiers 1 and 2 alike at about 4:45, tier 3 more than twice that, 10:15, tier
4 12:32): about +30-35 % of survival a gear tier, as a slope (for example 3:10 → 4:15 → 5:35 → 7:30 → 10:00, a victory likely at tiers
4-5), the mini-bosses kept as peaks; no gear 2:30-3:30 for every class; the Paladin, the slowest to win (a seed of five without a victory
in 40 runs), winning about as the others (a first victory between runs 8 and 16); 4 kills a second at least for the Assassin and the
Barbarian past the first minute; the first victory's median about 12 in 25 runs.

What made the steps (`tools/tiers.ts` with every run's seconds; a trace by 5 s of a run: the hero's life, the monsters near, their mean
damage and life, the damage taken by rank and species, the hero's time walking and striking; `tools/campaign.ts --run` with the gear's
power, `gearPower`, run after run):

- **The tool's own tiers**: tier 1 (three magic pieces) and tier 2 (every slot magic) were worth about the same (median power 58 and 83),
  tier 3 (every slot rare of level 20, 236) three times tier 2. The campaign's real progress is about linear, power 12 at run 1, 65 at
  run 3, 155 at run 5, 236 at run 8, 310 at run 10, 400 at run 15: the tiers now follow it, a sixth one added (0 the starter kit, 1 every
  slot magic of level 6, 2 magic of level 12, 3 rare of level 14, 4 rare of level 21 the better of two, 5 rare of level 26 the best of
  three; median power 12, 66, 71, 179, 315, 419; `gearPower` counts life and resistances as much as the weapon and tells tiers 1 and 2
  apart badly: their survival does). With these tiers lot 302's code already gave 3:33, 4:29, 5:39, 8:48, 10:16, 11:17.
- **Each zone's entry**: the deaths gathered 20 to 40 s into each zone, whatever the gear (lot 302's code: 82 deaths of 420 between 3:30
  and 4:00, 30 between 9:30 and 10:00): the field filled up from 8 monsters to 90 in 20 s, a whole fresh field at once.
- **The Dark Wood was the act's easy stretch** (its monsters' damage 30 % under the Stony Field's end, few deaths from 6:30 to 9:00) and
  **the lair a wall** (its monsters' life ×45 by Andariel outgrew every hero's damage: tiers 3, 4 and 5 died there alike at 9:40-10:30).
- **The Paladin**: (1) Zeal (level 12) came by the cards' draw alone: at level 12 to 15, a second point late, or never (a run of tier 0
  died at 3:47 with Holy Bolt and no Zeal); (2) the rotation swung Sacrifice on its floor whatever his life: geared (a weapon of 30), its
  cost (8 % of the damage dealt a swing) bled him to 1 life point; a Paladin of tier 4 died at 2:09 and 2:29 with 5 to 8 damage taken from
  the monsters in 5 s. With both fixed, Zeal's two to five blows a swing came at 3:30 as a leap (no gear 3:55 → 9:45).
- **The Barbarian**: the Campaign's plan (two swords, Sword Mastery to 20, Whirlwind at level 30) in a Run with the starter's hand axe:
  Sword Mastery for nothing, and the cards' rest on Howl, Leap and Taunt; Howl (a fear) and Leap (a knockback) sent the field away and he
  walked after it 55 % of his time (30 to 45 damage a second at level 15, 3.4 to 4.4 kills a second); in the Dark Wood the archers and
  spearwomen held him at 7:00-7:50 whatever his gear.

Changes (sim/runmode.ts `FLOW`, sim/autopilot.ts, sim/offer.ts, index.ts):

- **A zone fills up slowly** (`entry` [8, 4] → [12, 1.5]: the field full after about 50 s).
- **The curves**: the Dark Wood's damage 0.65 → 0.9 and its life 0.6 (`zoneDmg`, `zoneLife`: its fodder had 60 % more life than the
  Stony Field's end), the lair's life 0.17 → 0.21; `ramp.lifeAt` gentler late (×2.5, 7, 18, 45 at 6:00, 8:00, 10:00, Andariel → ×2, 4, 8, 16) and `ramp.dmgAt` climbing all through the Dark Wood and the lair (×1, 1.6, 2.6 at 6:00, 10:00, Andariel → ×1, 1.3, 1.6, 1.9, 2.3 at
  6:00, 7:30, 9:00, 10:40, Andariel). The mini-bosses and Andariel unchanged.
- **The Paladin**: Zeal always among the cards while it can take a point (`FLOW.signature`, a Run only); Sacrifice swung by the rotation
  only above 70 % of his life (`SELF_HARM_ABOVE`, as the base's bots; the brain's choice 60 → 70 %); Zeal's floor 0.4 → 0.6 s.
- **The Barbarian's Run plan** (`RUN_PLAN.barbarian`): Double Swing and Axe Mastery to 5, Stun, Concentrate, Iron Skin, Stamina and Speed,
  Berserk, Natural Resistance, Whirlwind; Howl and Leap avoided by the cards (`RUN_AVOID`).
- **The melee classes' factors**: `classMissile` (new, over `missileDmg`: Barbarian and Paladin 0.4) and `classTakenLate` (new: the
  class's factor on the hits moves from `classTaken` at 0:00 to it at 12:00, `classTakenAt`): the factor a starter kit's death at 2:30-3:30
  asks for was too high late, the survival flat from tier 2 to tier 5. `classTaken` measured again: Barbarian 0.9 → 1.9 (late 0.4), Druid
  0.6 → 0.7, Necromancer 0.5 → 1.0 (late 0.35), Paladin 0.45 → 1.2 (late 0.7), Sorceress 0.7 → 0.85 (late 0.5).
- `tools/tiers.ts`: the six tiers, `SV_TIERS` to override them for a measure, `killsPerSec60` (the kills a second past the first minute;
  the harness's `kills60`).

Measured (`tools/tiers.ts`, 10 runs a class and tier, median seconds and victories; before: lot 302's code with the same tiers):

| Class       | Tier 0      | Tier 1      | Tier 2              | Tier 3                | Tier 4                  | Tier 5                  |
| ----------- | ----------- | ----------- | ------------------- | --------------------- | ----------------------- | ----------------------- |
| Amazon      | 3:02 → 3:08 | 4:55 → 4:45 | 6:12 → 6:15         | 10:13 (2) → 9:26 (2)  | 12:39 (8) → 12:36 (7)   | 12:41 (9) → 12:40 (9)   |
| Assassin    | 2:45 → 3:00 | 4:07 → 4:18 | 6:07 → 6:04         | 9:50 (2) → 12:12 (4)  | 10:18 (4) → 10:19 (4)   | 12:36 (6) → 12:33 (6)   |
| Barbarian   | 4:55 → 3:14 | 4:58 → 4:05 | 4:26 → 4:03         | 9:10 (1) → 4:33 (2)   | 9:54 → 12:30 (7)        | 11:52 (1) → 12:28 (9)   |
| Druid       | 2:26 → 2:29 | 3:56 → 4:52 | 6:49 (2) → 4:31     | 12:34 (6) → 8:10 (2)  | 12:35 (8) → 8:14 (4)    | 12:40 (10) → 12:36 (8)  |
| Necromancer | 3:51 → 3:34 | 3:57 → 3:01 | 4:03 → 3:56         | 12:30 (5) → 6:14 (3)  | 12:34 (8) → 12:39 (6)   | 12:38 (10) → 12:47 (8)  |
| Paladin     | 3:55 → 3:10 | 3:47 → 7:01 | 3:55 → 7:19 (1)     | 5:00 → 8:04           | 4:30 (1) → 12:10 (2)    | 12:00 (1) → 12:15 (4)   |
| Sorceress   | 3:02 → 3:02 | 3:48 → 3:55 | 4:01 → 4:26         | 6:13 → 6:13 (1)       | 10:11 → 12:45 (5)       | 12:22 (3) → 12:40 (6)   |
| All 70 runs | 3:33 → 3:15 | 4:29 → 4:25 | 5:39 (2) → 5:32 (1) | 8:48 (16) → 8:26 (14) | 10:16 (29) → 10:28 (35) | 11:17 (40) → 11:31 (50) |

("All": the mean of the 70 runs, a victory counted at its time.) Lot 302's own tiers gave 3:08, 4:44, 4:46, 10:15, 12:32 (its README).
Now about +36 %, +25 %, +52 %, +24 % a tier, then 71 % of victories at tier 5 (half at tier 4). A class's median of 10 runs still
jumps where its runs split in two (the Barbarian's tier 3: 4:33 with two victories; the Paladin's tier 1: before Zeal or past it); the
deaths' spread (30 s bins of the 420 runs): 3:30-4:00 82 → 25 (4:00-4:30 33 → 47), 9:30-10:00 30 → 13, 6:30-8:30 less empty (20 →
54). Kills a second past the first minute: 4.2 to 5.6 with no gear by class (Assassin 4.15 → 4.68, Barbarian 3.76 → 4.99; tier 1 4.44 →
5.21), 4.2 at least for every class and tier.

Run after run (`SV_SHOP=1 tools/campaign.ts --run <class> <seed> 25 1 0 d2 1`, the seeds Prog, Run, Seed, Hero, Bot: the first victory in
25 runs; before: lot 302's code):

| Class       | Before                           | Now                    |
| ----------- | -------------------------------- | ---------------------- |
| Amazon      | 7, 7, 8, 11, 9 (median 8)        | 7, 10, 8, 9, 11 (9)    |
| Assassin    | 6, 9, 10, 11, 10 (10)            | 8, 8, 13, 16, 16 (13)  |
| Barbarian   | 12, 16, 19, 15, 24 (16)          | 8, 13, 11, 16, 16 (13) |
| Druid       | 6, 9, 7, 7, 9 (7)                | 13, 14, 9, 17, 13 (13) |
| Necromancer | 4, 10, 5, 11, 16 (10)            | 10, 11, 8, 11, 17 (11) |
| Paladin     | none, 15, 23, none, none (none)  | 7, 13, 13, 12, 13 (13) |
| Sorceress   | 12, 16, none, none, none (none)  | 9, 14, 21, 17, 19 (17) |
| All         | median 11, 6 seeds of 35 without | median 13, every seed  |

Limits: the classes' curves are not all slopes yet (the Paladin's Zeal at level 12, the Barbarian's Stony Field at 4:00: a run either
dies there or goes on); the Druid's no-gear median at 2:29, the Necromancer's at 3:34; the Sorceress the slowest now (17). Unit
`tests/unit/lot303.test.ts` (Zeal among every level's cards from 12 to its last rank, in a Run only; Sacrifice never swung under 70 %;
the Barbarian's plan; a zone's slow fill, the damage climbing through the Dark Wood and the lair); `lot302.test.ts` (Sacrifice's floor
compared with the attack's). Save version 7 unchanged.

## The owner's returns of lot 305: loading, portrait, countdown, elites, victory, acts

1. **A run's start** (owner: "the progress bar sticks at the end and lasts long, it looks like a bug"). Measured (Chromium headless,
   412 × 915, the production build with the D2 graphics, `tools/e2e/survivals-305.mjs` and a throwaway timer): the zone's bar weighed the
   sheets only (0.5 MB, 95 % of the bar) while the D2 map's files (17 MB for the Blood Moor) came outside it, and the start's bar stood at
   95 % through Act I's 35 maps (10 MB of JSON), the town's map (9 MB, hidden under the Run's hub) and the first zone. Now
   (`GameRenderer.setZone`, `D2MapView.build`'s `onFile`, `App.syncZone`'s range, `BOOT_BAR`) the sheets and the map's files on one bar
   by their texture bytes, each step named under it (towns' maps, the act's maps, the zone: characters/monsters/effects, its map, setting
   up). Cut: a Run character reads only its rounds' maps (rule `maps.wanted`: 7 of Act I's 35, the base's Harrogath standing for the
   hidden town), the town under the hub loads no D2 map (rule `render.zoneHidden`), and the hub names the act's first zone
   (`nextRunZone`) so that its sheets and map are prepared while the player is in the hub. Before → after (40 Mbit/s, CPU × 4): a new
   character's tap to the first zone playable 12.8 → 10.0 s (D2 bytes 45 → 27 MB); the hub's "Start the run" 2.7 s with a loading screen
   → 0.5 s without one; the bar never still at 95 % or more (before: 0.5-1.4 s still on a fast machine, the whole map's download on a
   phone).
2. **Portrait.** The level-up cards compact (`dom.ts`: the tag in the card's corner, two lines of description, two figures, a link a line,
   the three buttons on one row): no scroll down to about 412 × 700. The base's panels in a game mode held upright (`portraitStack`,
   `html.any-orientation`, style.css): the D2 panel at the top as wide as the screen, the actions in rows of four under it, the text
   below, the tabs whole, the panel opaque; the mode's screens' backdrop darker.
3. **10 s between every two zones** (`RUN.nextAfter` 4 → 10, as `bossWait`): the "5 s after Blood Raven" was the automatic control
   walking into the zone's town portal (the brain's last goal); a cleared zone of a run keeps no portal. The act's clock keeps 4 s a
   passage (`FLOW.clockGap`): the ramps' measured times unchanged.
4. **Every learned active skill in the preview** (`STRIP_MAX` 6 → 24, rows of 8 growing upwards).
5. **Elites marked** (rule `render.eliteMarks`, base renderer): a ring in the rank's colour under the champions (blue), uniques (gold),
   bosses (red), the champions and uniques ×1.15, the name over a unique's or boss's head; one sprite and at most one text an elite.
6. **The act boss's victory over its zone**: `runStep` ends the run without the town (`SurvivalsState.endHere`), the HUD opens the end
   screen over the lair, the game paused (again after the shop); "Hub" goes to town then.
7. **Acts and difficulties as in Diablo II**: `actUnlocked` Act I of a difficulty by Baal beaten in the one before (lot 292's Andariel
   shortcut removed), `lockReason`. Nothing written: a save opened through the shortcut keeps its records (Nightmare back with Baal).
8. **The end screen's buttons**: "Next: Act II" (the Campaign's rounds, told as not tuned for the Run; the act's maps loaded first,
   `UiHost.loadActMaps`), "Replay Act I", "Shop", "Hub"; the hub's acts list shows every act of Normal, the closed ones greyed with their
   condition (held upright: "Choose the act" in the bar). The killer's line ("slain by") was already on the death screen (lot 288).

Unit `tests/unit/lot305.test.ts`; `runmode`, `lot299` updated; e2e `tools/e2e/survivals-305.mjs`. Balance: the bots' tools not run again
(the act's clock unchanged; the wait between zones is longer). Save version 7 unchanged.

## The act screen and a thinner field (lot 306)

1. **The act screen** (owner: "I like the menu and the zones' presentation" of another survivors game; adapted in Diablo II's look, its
   flaw avoided: no 6-7 px text). "Choose the act" (the hub's bar held upright, the Character tab's Runs panel: "The acts' zones and
   bosses") opens a waypoint of the acts (`ui/acts.ts`): one row an act and difficulty (Normal's five acts, Nightmare's and Hell's Act I
   until their Act I opens), open (✓ and the best time, the longest survival, or "not played yet") or closed (greyed, what opens it:
   "Defeat Andariel (Normal)"). The act looked at is unfolded under a gold frame, tinted by its act: its name (Cinzel), its event in red,
   two lines of what it holds, its zones (✓ once their checkpoint is taken), the timed bosses on the act's clock as chips (the act's
   boss outlined in gold), its monsters in small grey text, what was done and what it drops ("Bosses slain n / N", the act boss's quest
   treasure at the first victory, the mini-bosses' chests), the records. Everything is read from the mode's data (`sim/actinfo.ts`): the
   zones of `runZones`, the monsters of their pools (Levels.txt, `zonePool`), the times of `actFlow` (each zone's mini-boss
   `minibossBefore` s before its end, Andariel `bossAt` into the lair, `clockGap` s a passage): 1:15 Corpsefire, 2:49 Blood Raven, 5:53
   Rakanishu, 8:57 the Countess, 12:16 Andariel (the act's clock; the 10 s waits between zones are not counted, as on the HUD). Act II
   and beyond: their zones' bosses in order, untimed, and "The Campaign's zones, not yet tuned for the Run". A tap on a closed act shows
   it all the same (its bosses, its loot), the button then disabled. The button at the foot, always in sight: "Enter Act I — Andariel
   awaits at 12:16" (`launchRun`). Held upright one column, the act looked at unfolded in its place (412 × 915: no horizontal scroll, the
   list scrolls 3 px); wide (915 × 412, a desktop) the acts on the left, the act on the right; text 11 px at least. e2e
   `tools/e2e/survivals-306.mjs` (portrait, landscape, desktop: 23 checks).
2. **A thinner field** (owner: "the monsters' density too high, compare with the other game"). Measured (the bots' runs, auto control,
   3 runs a class with no gear, 2 a class at tier 4; monsters alive, on a landscape phone's screen, run kills; a throwaway trace over
   `tests/bots/harness.ts`' loop), against the other game's, observed for reference (on screen about 5 at 0:10, 10 at 0:30, 15 at 1:00, 30 to 100 from 2:00-3:00;
   kills 54-68 at 1:00, 152-162 at 2:00, 186 at 3:00):

   | Run time          | 0:10 | 0:30 | 1:00 | 2:00 | 3:00 | 6:00 (tier 4) |
   | ----------------- | ---- | ---- | ---- | ---- | ---- | ------------- |
   | Alive, before     | 21   | 23   | 29   | 42   | 73   | 87            |
   | Alive, now        | 6    | 9    | 15   | 39   | 56   | 84            |
   | On screen, now    | 5    | 8    | 14   | 38   | 55   | 81            |
   | Run kills, before | 11   | 54   | 132  | 309  | 676  | 2,257         |
   | Run kills, now    | 5    | 23   | 61   | 181  | 503  | 1,918         |

   The 14 monsters "on their way" from beyond the screen (lot 301's `offscreenExtra`) were most of the first minute's field: now a
   share of the curve (`FLOW.offscreenShare` 0.15), and the curve `FLOW.density` thinner to 4:00 (5 → 4 at 0:00, 10 → 8 at 0:30, 16 → 13
   at 1:00, 42 → 37 at 2:00, 66 → 52 at 3:00, 80 → 66 at 4:00, 78 at 6:00, 90 at 12:00: the density setting's 90 by 6:00 as before). The
   normal monsters' life (`FLOW.normalLife`) 0.35 → 0.55 so that the gear tiers keep their survival (0.45 with a curve of 34 at 2:00 and 50 at
   3:00: no gear 3:47 on average, tier 1 4:06; 0.45 with this curve: 3:33, 4:20). Kills a second at tier 4 from 3:00 to 6:00 7.9 (8.5 before),
   6:00 to 9:00 10.4 (10.3).

   Measured (`tools/tiers.ts`, 10 runs a class and tier, median seconds and victories; before: HEAD's code with the harness's fix, lot
   305's 10 s between zones counted; "All": the mean of the 70 runs):

   | Class       | Tier 0      | Tier 1      | Tier 2          | Tier 3                | Tier 4                  | Tier 5                  |
   | ----------- | ----------- | ----------- | --------------- | --------------------- | ----------------------- | ----------------------- |
   | Amazon      | 3:20 → 3:19 | 5:12 → 6:13 | 6:24 → 6:23     | 9:32 (1) → 9:31       | 12:48 (6) → 12:48 (5)   | 12:52 (8) → 12:50 (8)   |
   | Assassin    | 3:06 → 3:18 | 3:20 → 3:18 | 4:14 → 4:02     | 10:15 (1) → 9:24 (1)  | 10:29 (4) → 11:46 (4)   | 12:51 (8) → 10:12 (3)   |
   | Barbarian   | 3:17 → 3:18 | 3:18 → 3:19 | 3:20 → 4:02     | 4:42 (2) → 4:58 (2)   | 12:42 (7) → 12:40 (7)   | 12:40 (9) → 12:38 (8)   |
   | Druid       | 3:19 → 3:20 | 4:01 → 4:05 | 7:17 → 7:17     | 8:16 (2) → 10:34 (3)  | 8:14 (3) → 12:55 (6)    | 12:45 (6) → 12:51 (7)   |
   | Necromancer | 2:32 → 3:19 | 3:11 → 3:14 | 4:10 (1) → 3:21 | 6:25 (2) → 6:28 (4)   | 13:00 (6) → 12:59 (7)   | 13:03 (8) → 13:03 (9)   |
   | Paladin     | 3:17 → 3:21 | 3:19 → 3:22 | 4:09 (1) → 7:17 | 8:13 → 8:12           | 12:22 (2) → 10:05 (2)   | 12:33 (4) → 10:03 (3)   |
   | Sorceress   | 3:10 → 3:20 | 3:20 → 3:21 | 4:13 → 4:57     | 10:37 (1) → 10:10 (1) | 13:09 (5) → 11:49 (3)   | 13:03 (6) → 13:02 (6)   |
   | All 70 runs | 3:12 → 3:23 | 3:43 → 3:50 | 5:19 (2) → 5:11 | 8:27 (9) → 8:41 (11)  | 10:25 (33) → 10:31 (34) | 11:37 (49) → 11:31 (44) |

   About +13 %, +35 %, +68 %, +21 %, +10 % a tier (before +16 %, +43 %, +59 %, +23 %, +12 %; lot 303's README: 3:15, 4:25, 5:32, 8:26,
   10:28, 11:31). Kills a second past the first minute: no gear 3.1 to 4.1 by class (4.0 to 5.1 before: fewer monsters to kill, the
   owner's wish), tiers 3 to 5 6.2 to 8.2 (6.3 to 8.6).

Unit `tests/unit/lot306.test.ts` (the timeline from the director's flow, Act I unfolded, a closed act previewed and not playable, the
records and cleared zones, the button starting the run, the field's first three minutes); `flow.test.ts`, `lot303.test.ts` updated.
`tests/bots/harness.ts`: a won run's end read from `endHere` too (since lot 305 `tools/tiers.ts` stopped at its first victory). Save
version 7 unchanged.

## The Run's maps: larger, explored, with places to go (lot 307)

The owner's returns on the Run's maps: "points of interest are missing to make me want to move (chests, shrines, events…)", "the maps
too small: twice as big and not revealed by default, discovered by moving", "the map at the top right is not great (maybe just the
outline), the same at the centre: take Diablo II's", "the map's limits are invisible: put suitable assets".

1. **Arenas about twice the area** (`sim/arena.ts`): `ARENA` 64 → 90 units a side, `BOSS_ARENA` 40 → 56 (×1.4 a side, ×1.98 the area);
   a map whose 90-unit window is too closed (a narrow dungeon) keeps lot 306's size (`SMALL`) before the synthetic arena. Act I's five
   zones all cut at the new size (Blood Moor, Cold Plains, Stony Field, Dark Wood 90; Andariel's lair 56, nearly her whole map). The
   synthetic arena keeps its obstacles a unit of area (12 to 20). The director's spawns beyond the screen, the recycling and the
   shortest-path chase are unchanged (the flow field reaches 35 units, the spawns stay just beyond the screen's edge). The part of the map
   loaded (`d2Map.view`) is set `VIEW_INSET` = 8 units inside the arena (the base loads a 1,200 px margin around it; beyond the edge the
   ground is darkened now). Files of the zone's map (full resolution / low): Blood Moor 17.4 → 25.8 MB / 7.0 → 10.5 MB, Cold Plains 21.3
   → 22.2 / 8.1 → 8.2, Stony Field 21.5 → 22.4 / 8.2 → 8.4, Dark Wood 21.4 → 23.3 / 9.0 → 9.4, the lair 1.9 → 1.9 / 0.7 MB (29.7 MB for the
   Blood Moor without the inset) (`mapFiles`; their decoded size, Blood Moor 123 →
   165 MB, may send a device to the half-resolution tier sooner). A new character's tap to the first zone playable (dev server, 40 Mbit/s, CPU
   ×4, `survivals-307.mjs --throttle=40`, two runs each): 7.9 → 7.7 s (headless Chromium may take the low tier: not a phone's measure).
   Monsters per area: the same on the screen (bots, automatic control, 21 runs, starter kit, god mode; alive / on a landscape phone's
   screen / run kills, before → now): 0:10 6.0 / 5.3 / 5 → 6.6 / 5.9 / 6; 0:30 8.7 / 8.4 / 23 → 8.7 / 8.4 / 23; 1:00 14.6 / 14.0 / 62 →
   14.8 / 14.3 / 60; 2:00 38.9 / 36.9 / 188 → 39.2 / 36.9 / 183; 3:00 56.3 / 55.0 / 470 → 56.0 / 55.3 / 463. The bosses of the larger lair (`BOSS_FAR`): Andariel came beyond the base's
   45-unit leash of a hero holding a corner of the 56-unit lair and stood idle (tools/tiers.ts's runs of up to 2 h 45): she now comes 30
   units from him at most, a boss brought back and a monster recycled hunt again (`aggro`).
   Measured (`tools/tiers.ts`, 10 runs a class and tier, the mean of the 70 runs, victories; before: lot 306's README):

   | Gear tier          | 0           | 1           | 2           | 3                    | 4                      | 5                       |
   | ------------------ | ----------- | ----------- | ----------- | -------------------- | ---------------------- | ----------------------- |
   | All 70 runs        | 3:23 → 3:18 | 3:50 → 3:33 | 5:11 → 4:43 | 8:41 (11) → 7:34 (7) | 10:31 (34) → 9:15 (21) | 11:31 (44) → 10:46 (41) |
   | Without the points | —           | 3:38        | 4:38        | 7:29 (5)             | 9:43 (25)              | —                       |

   A drift: about 5 to 13 % shorter at tiers 1 to 4, the deaths a zone earlier (the Stony Field and the Dark Wood: Dark Spearwomen,
   goatmen; tier 4's levels 25.4 → 22.9 on average), the larger arena's own (the points of interest taken out give about the same); the
   field on the screen and the kills a second (tier 4: 5.9 to 8.1 past the first minute, 6.2 to 8.2 before) unchanged. Left as measured
   for the owner's test of the larger maps (a tuning lot if he finds the act harder); the bots never go for a point of interest, they
   meet one on their way (a lair woken, a cursed chest opened, a shrine taken).

2. **Fog of war** (`sim/fog.ts`): the arena in cells of 2 units, explored within 14 units of the hero (five times a second, by the
   director), kept for the zone's whole life; the automap draws only the explored cells.
3. **The automap** (`ui/automap.ts`, in place of the base's minimap during a round, hidden by `html[data-sv-runhud]`): top right under
   the zone's name, Diablo II's small map: the walls' outlines only (each side of a blocked cell facing open ground, the arena's edge in
   gold), thin, half transparent, no panel nor backdrop, centred on the hero's cross; a tap (or the Tab key) opens the centred map:
   Diablo II's Tab map over the field, no panel, taking no touch (the field is still played), the whole arena when it fits at 3.4 px a
   unit at least (landscape), else centred on the hero (portrait). The monsters and items seen as dots, the points of interest once found
   (a shrine a blue diamond, a chest a gold square, a cursed chest violet, a lair a red disc; an arrow on the corner map's edge to the
   nearest one beyond it), the zone's mini-boss or boss always (a red ring: the zone ends on it and it walks to the hero anyway, so
   knowing where it is spoils nothing and tells where not to linger). The outlines are drawn once into a layer as cells get explored;
   a refresh (every 100 ms) copies it and draws the dots: cheap with 100 monsters.
4. **Points of interest** (`sim/poi.ts`, the Run's rounds only: the Campaign's director takes them out), placed with the arena 24 units
   from the start at least, 16 from each other and 5 from the edge, on open ground reachable from the start; found within 14 units (no
   spoiler), used by walking over them (1.8 units: the base's tap at 1.6 never comes first):
   - **shrines**, Diablo II's objects and effects (shrines.txt), 2 a zone (1 in the lair), never twice the same: Fire (code 19: a nova,
     the ordinary monsters within 10 units burn to death, the elites lose 35 % of their life, the hero is spared), Experience (+50 %),
     Skill (+2), Armor (+100 % defence), Combat (+200 % attack rating and damage), Resist Fire, Cold, Lightning or Poison (+75 %): the
     base's shrine stats for 40 s (Diablo II's 96 s shortened for zones of 90 to 180 s), the name told in the middle;
   - a **chest** (a modest source: the mode's loot is rare): an item half of the time (magic, rare 35 % of the time; `chestItem`, the
     zone's level), its gold in the flow (`chestGold`, a unique's);
   - a **cursed chest**: opened, 3 to 4 champions rise around it ("Coffre maudit : des champions surgissent !"); their deaths drop the
     chest's rare item and gold;
   - a **champion lair** (five Diablo II bones and skulls on the ground): the hero within 11 units wakes its 3 to 4 champions, told by a
     banner ("Champion approche…"); killed, they leave an elite chest;
   - an **elite chest** after a champion pack of the director's timeline killed, 75 % of the time, where its last member fell (an item
     60 % of the time).
5. **The arena's limits** (`sim/arena.ts` `edgeProps`, `ui/bounds.ts`): Diablo II décor of the zone's look set along the outside of an
   arena cut from a map every 2.6 units, 0.6 to 1.8 units beyond its walls (`ArenaLook.edge`: Act I's rocks of Objects.dt1 and dead
   trees of treegroups.dt1 in the moors, more trees in the Dark Wood, candles, skulls and bones in the crypts; the base draws on a D2 map
   only the décor imported from the player's files); beyond the edge the field darkens (0.3 at 1 unit, 0.68 at 2.5, 0.9 at 5), four
   planes laid on the screen with the base renderer's projection and camera, only their `transform` changed each frame (the e2e checks
   the darkness starts on the renderer's own projection of the edge: 0 px off). Not done: a hint when pushing against the edge (the
   darkness and the décor tell it).

Unit `tests/unit/lot307.test.ts` (sizes and the former size's fallback, the edge's décor, the view loaded; the fog's reveal and its
persistence in a round; the points' placement, the Campaign without them, shrines' buffs and the Fire shrine, the cursed chest and the
lair, the champions' chest; the darkness's planes on the projection; the automap's outlines by fog cell); `director`, `lot294` (the
Barbarian walking in circles: Bash used, no longer more than Leap in 40 s) and `lot298` (overlap 0.4 → 0.35) updated: in the 90-unit
arena the monsters come from truly beyond the screen where the 64-unit one pulled them in along its border. e2e
`tools/e2e/survivals-307.mjs` (Blood Moor, Dark Wood, the lair; portrait and landscape: the field, the edge, the corner and the centred
maps, a shrine used; `--throttle`: the first zone's load). Save version 7 unchanged (the fog and the points live with the zone's world: a
Run is never resumed; a Campaign round resumed has its fog again from nothing).

## Training: permanent ranks, and the larger maps' difficulty brought back (lot 308)

1. **The larger arenas' drift** (lot 307: tiers 1 to 5 lived 5 to 13 % shorter). Measured (bots, tier 2, 4 classes × 6 runs, the 64-unit
   arena against the 90-unit one, the points of interest in both): the hero was within 18 units of the border 54 % of his time in the
   64-unit arena (22 % now), so the director's spawns beyond the screen came from fewer sides: monsters within 6 units about the same (8.7
   / 8.8) but on 3.5 of 8 sides around him against 3.9 now, and 6 to 40 % more kills a second for the same gear (fewer levels now). The
   arena put back to 64 restored lot 306's row (3:20, 4:01, 5:30, 8:07, 10:25, 11:15); fewer spawns ahead (`FLOW_AHEAD` 0.3, 0.75,
   0.85), the stragglers recycled sooner (`RECYCLE_OFF` 1), no hunt for the recycled, the fodder's life 0.48-0.5 did not. Kept: the open
   map (the owner's), and one parameter, the Act I monsters' damage `RUN.mercyAct1.dmg` 1 → 0.9 (`FLOW.ramp.dmg` 0.85 with a lower cap
   lifted the no-gear runs too much, 3:41). `tools/tiers.ts` (10 runs a class and tier, the mean of the 70, victories):

   | Gear tier         | 0    | 1    | 2        | 3         | 4          | 5          |
   | ----------------- | ---- | ---- | -------- | --------- | ---------- | ---------- |
   | Lot 306           | 3:23 | 3:50 | 5:11     | 8:41 (11) | 10:31 (34) | 11:31 (44) |
   | Lot 307           | 3:18 | 3:33 | 4:43     | 7:34 (7)  | 9:15 (21)  | 10:46 (41) |
   | Lot 308           | 3:33 | 4:03 | 5:18     | 8:28 (10) | 10:03 (24) | 11:26 (46) |
   | Lot 308, training | 4:24 | 4:37 | 5:19 (1) | 9:49 (15) | 11:43 (44) | 12:05 (56) |

   ("Training": every rank bought, `SV_FORGE=max`; tier 2 on 40 runs.) Every rank together is worth about half a gear tier early
   (+24 %, +14 % at tiers 0-1), +16-17 % at tiers 3-4, little at 2 and 5; bought over the runs, not at the first one.

   Class medians with no gear 3:10 to 3:58 (the Amazon 3:58, the Necromancer 3:56). Run after run (`SV_SHOP=1 tools/campaign.ts --run
<class> <seed> 25 1 0 d2 1`, seeds Prog, Run, Seed, Hero, Bot; 31 of the 35 measured): the first victory's median at run 12 (Amazon 9,
   7, 6, 13, 3; Assassin 15, 16, 10, 13; Barbarian 9, 10, 16, 14, 22; Druid 24, 20 and two without in 25; Necromancer 11, 12, 7 and two
   without; Paladin 9, 4, 8, 3, 6; Sorceress 18, 12, 9, 12, 23). The unit tests loosened by lot 307 (`lot294` Bash over Leap walking in
   circles, `lot298` overlap 0.35) stay so: they measure the arena's geometry (monsters in reach in 40 s), not the damage.

2. **Training** (owner: "the gold for permanent upgrades: more skill rerolls, better experience for rerolls…"; two other survivors
   games' paid ranks and smith's shop looked at, adapted, nothing copied). The hub's Skills tab shows it in place of the equipment (the
   Character and Stash tabs keep it): a row an upgrade (an item's inventory picture, its name and ranks as Diablo II diamonds, the effect
   now → next, the next rank's price; greyed, disabled, when the purse cannot pay), the purse, "Reset · +N gold" (every rank back to 0,
   all its gold given back: free, simple). `sim/forge.ts`:

   | Upgrade      | Ranks | Effect a rank                                                       | Prices                     |
   | ------------ | ----- | ------------------------------------------------------------------- | -------------------------- |
   | Rerolls      | 3     | +1 free reroll a run (after the zone's own)                         | 80, 680, 1,530             |
   | Banishes     | 3     | +1 banish a run (after the zone's two)                              | 60, 510, 1,190             |
   | Opening hand | 1     | 4 cards at the run's first choice (and its rerolls)                 | 900                        |
   | Lore         | 5     | +3 % experience of a kill (lot 308: +5 %, lot 313)                  | 50, 260, 510, 850, 1,280   |
   | Pickup       | 3     | +20 % pickup reach (1.7 units)                                      | 50, 340, 760               |
   | Boss fortune | 3     | +4 % chance of a set or unique in a mini-boss's or Andariel's chest | 150, 850, 1,700            |
   | Greed        | 5     | +5 % of a run's gold (piles, items sold, chests)                    | 40, 200, 420, 710, 1,100   |
   | Vigour       | 5     | +1 % life (`lifePct`, set at each run's start; lot 308: +4 %, 313)  | 60, 340, 680, 1,100, 1,620 |

   18,020 gold in all. Kept in the character's milestones (`survivals:forge:<id>`, the gold being the character's; absent = 0, odd values
   clamped; save version 7 unchanged), the run's extra rerolls and banishes used in `survivals:run:forge:*` (cleared with the run); the
   Campaign ignores them. The level-up screen counts them ("Reroll · 3 free", "Banish · 5") and tells the opening hand (four cards, a row of
   four in landscape). Calibration (`SV_SHOP=1 SV_FORGE=1 tools/campaign.ts --run <class> Prog 40`: the bot buys the cheapest rank with
   half its purse, then the shop's best buy): the first rank at run 2-3, 5 ranks by run 3-4, 10 by run 6-13, 20 by run 15-26, all 28 by run 24-36 (median 27; Amazon 26,
   Assassin 30, Barbarian 27, Druid 35, Necromancer 36, Paladin 24, Sorceress 25), 10,500 to 17,300 gold in 40 runs. Prices ×1.7 lower
   (every rank but the first) had them all by run 18-24. The first victory with the training bought this way: run 15 (median of the 7;
   8 to 33), the gold shared with the shop delaying the gear.

Unit `tests/unit/lot308.test.ts` (prices, buy, greyed, max, reset; the save and odd values, the Campaign; life, experience, the fourth
card, reach, gold, luck in a run; the run's rerolls and banishes across zones and runs; the level-up screen; the hub's panel), `hub6`
updated. e2e `tools/e2e/survivals-308.mjs` (portrait and landscape: the panel, ≥ 44 px, greyed, buy, reset; a run's four cards and
counters; 19 checks). Tools: `tools/tiers.ts` `SV_FORGE=max`, `tools/campaign.ts` `SV_FORGE=1` (harness `forgeRun`).

## Every spell's cadence checked, the field in packs (lot 309)

The owner's returns: "Charged Bolt seems to spam its spells too fast, check every spell" and "I feel we cut the monsters too much, check
against the other game; it seems to bring them in small packs rather than at random a little everywhere".

1. **The cadence of every skill a Run offers** (`tools/castaudit.ts`, `sim/cadence.ts` `castPack`: each damaging skill of the seven
   classes alone in a fresh run, cast again as soon as the mode allows at a pack of five sandbags; level 15 with 5 points, the Run's rank
   cap; also 1 point at its own level, and 20 % FCR: the same intervals, the spells' cooldowns dwarf the gesture). Every spell already
   held 2 to 19 s between two casts (Diablo II's gesture 0.52 to 0.76 s), the strikes their swing (0.36 s, Diablo II's frames × 0.55):
   none cast quicker than its animation. The outliers were the missiles a cast:

   | Skill (class)                    | Diablo II  | Interval before → now | Missiles a cast | Missiles a second | Damage a second (5 sandbags) |
   | -------------------------------- | ---------- | --------------------- | --------------- | ----------------- | ---------------------------- |
   | Charged Bolt (Sorceress)         | 0.52 s, 7  | 2.0 s                 | 7 → 4           | 3.5 → 2.0         | 21 → 22                      |
   | Shock Wave (Druid, a stomp)      | 0.52 s     | 0.36 → 1.24 s         | 8               | 22 → 6.2          | 1,453 → 423                  |
   | Teeth (Necromancer)              | 0.60 s, 6  | 3.0 s                 | 6 (capped at 6) | 2.0               | 28                           |
   | Fire Bolt, Ice Bolt, Bone Spear  | 0.52-0.6 s | 2.0 s                 | 1               | 0.5               | 14-78                        |
   | Multiple Shot, Strafe (Amazon)   | 0.56 s     | 5.0 s                 | 6, 8            | 1.2, 1.6          | 5-8                          |
   | Frozen Orb, Hydra, Blade Fury    | 0.52-0.6 s | 3.0, 2.0, 2.6 s       | 36, 9.5, 11.5   | 12, 4.7, 4.4      | 448, 584, 78                 |
   | Strikes (Bash, Zeal, Whirlwind…) | 0.32-0.6 s | 0.36-0.64 s           | —               | —                 | 15-621                       |

   The other game (lot 309's observation): Fire Bolt level 1 every 1.3 to 1.8 s, one bolt; Teeth level 1 every 1.22 s (lot 296). Changes,
   by principle (`sim/runmode.ts`):
   - `FLOW.animK` 2: a spell's cooldown never under twice its own cast animation at the hero's cast rate (`floorCast`'s `anim`, rule
     `skills.onCast`): a guard (no spell was under it), the strikes keep their swing as their rhythm;
   - `FLOW.boltRate` 2: a several-missile skill fires 2 missiles a second at most over its cooldown (`flowMissiles`, base rule
     `skills.missileCount`, inert in the base: Charged Bolt and Teeth), the bolts beyond it folded into the others' damage (a cast's damage
     kept: Charged Bolt 4 bolts ×1.75 at 5 points, still 4 with +skills); fewer, heavier bolts. The orbs, hydras and Blade Fury's splits
     are one missile a cast that spawns its own (Diablo II's mechanics): kept;
   - the Werebear's Shock Wave (a ring of eight waves flagged a strike, swung every 0.36 s: three to six times the next skill's damage on
     a pack) on a floor of 1.2 s (`minCast.shock_wave`).

   Screenshots (`survivals/shots/309`, `cb-portrait-*`): 7 sparks every 2 s before, 4 now; the gesture is drawn (the hero's cast frame
   between the walks). Not changed (flagged): the late skills' damage a second (Blizzard, Wake of Inferno, Fire Wall 720-960 on five
   sandbags: their own floors and level 18-30), the Amazon's arrows (2-37: the bow's attack carries her); Static Field's figure is a share
   of the sandbags' life.

2. **The field in packs** (sim/director.ts `fill`, `drawPackSize`, `packPoints`; `FLOW.packs`). The other game observed again for reference
   (portrait 412 × 915, 3 minutes of a Sorceress run; nothing copied): packs of
   3-4 in the first minute (23 packs, 65 monsters), then a third single monsters and the rest 3 to 10 (a champion pack up to 19), 23 then
   50 packs a minute, 32 of 51 groups one species, appearing on a ring just beyond the view's corners (0.96 of its half-diagonal) from all
   sides, a new pack about 54 px across, the packs merging into a trailing horde by 1:40-3:00. Ours brought one monster at a time anywhere
   along the screen's edge. Now the field comes in packs: a size drawn from `sizes` (1: 4, 2: 1, 3: 3, 4: 3, 5: 1, 6: 1, 8: 1 by weight),
   one species (a pack in three led by another species of the zone, `lead`), around one point beyond the screen's edge (`spread` 1.5
   units, further out along the hero's ray), a pack waiting for a gap of half its size (`wait` 1.5 s at most), never more than half the field wanted; the archers' share, the
   immunes' cap and the melee-only first 30 s as before. `null`: lot 308's trickle.

   In the window (`tools/field.ts`: 21 runs, no gear, god mode, the automatic control; the window and zoom the app gives; theirs
   counted on screen, ±10 %):

   | Act time                     | 0:15      | 0:30      | 1:00        | 2:00        | 3:00        | 5:00        |
   | ---------------------------- | --------- | --------- | ----------- | ----------- | ----------- | ----------- |
   | The other game, portrait     | 4         | 4         | 8           | 50          | 67          | —           |
   | Ours before, portrait        | 6.1       | 8.1       | 13.7        | 40.6        | 56.4        | 77.3        |
   | Ours now, portrait           | 6.5       | 7.4       | 13.7        | 44.9        | 65.4        | 73.6        |
   | Ours before / now, landscape | 6.6 / 7.2 | 8.2 / 8.6 | 14.1 / 15.1 | 39.9 / 46.6 | 57.3 / 67.2 | 78.9 / 78.5 |

   (`FLOW.density` 2:00 37 → 45, 3:00 52 → 63; the first minute kept: ours already shows more than theirs.) Spawns in groups of 2 or more:
   8-10 % → 57 % of the groups (mean 3.9). Framing: theirs shows 600 of their world units across the short side in every orientation (the
   hero 9.2 % of it), ours 16 units (the hero about 10 %): about the same; ours within 150 px of the hero 2-36 against their 0-8 (their
   bot kept away).

Measured (`tools/tiers.ts`, 10 runs a class and tier, the mean of the 70, victories):

| Gear tier | 0    | 1    | 2    | 3         | 4          | 5          |
| --------- | ---- | ---- | ---- | --------- | ---------- | ---------- |
| Lot 308   | 3:33 | 4:03 | 5:18 | 8:28 (10) | 10:03 (24) | 11:26 (46) |
| Lot 309   | 3:15 | 4:10 | 5:22 | 9:20 (17) | 10:43 (35) | 11:35 (44) |

No gear: the mean back in the owner's window (3:33 → 3:15), class medians 2:40 (Assassin) to 3:21 (lot 308: 3:10 to 3:58); tiers 3-4 a little easier (+10 %, +7 %, more victories), tiers 1, 2, 5 about the same. The packs alone (before the density's raise and the pack's cap at half the field) made the act easier (4:01, 4:36, 5:52 at tiers 0-2: a pack gathered is cleared by one area); the raised field at 2:00-3:00 brought it back. The thin first 30 s now come in two or three packs: a god-mode caster walking circles has seconds with nothing in reach (`lot298`'s overlap 0.35 → 0.25). Unit `tests/unit/lot309.test.ts` (Charged Bolt's bolts and damage, the base's count; no skill of the seven
classes under its gesture or floor; a cast's cooldown and gesture; the packs' draw and points; a zone's field in packs of one species
beyond the screen, the trickle without them); `flow`, `lot306` updated. e2e `tools/e2e/survivals-309.mjs` (Charged Bolt's frames and
casts; the field at 1:00 and 3:00 held upright and wide). Save version 7 unchanged.

## Act I balanced again: Blood Raven, the Dark Wood, a smaller training (lot 313)

The owner's points: the training "a little too strong", the Paladin's and the Barbarian's curves in two humps, the Sorceress the slowest,
the no-gear window (a death at about 2:30-3:30); wanted +30-35 % of survival a gear tier and a first victory of Act I after about 8 to 20
runs (median about 12).

1. **The humps' cause** (bots, `tools/tiers.ts`, the run's log read second by second): many runs of tiers 0 to 2 died at 3:07-3:20, the
   Cold Plains' end, whatever their gear (Barbarian 17 of 30, Paladin 11 of 20, the Assassin's and the Sorceress's tiers 1-2 too), the
   others going on to the Dark Wood. Blood Raven comes at 2:49 with her escort, her calls every 12 s and the field at its 3:00 density;
   the automatic aim strikes the nearest monster, her escort stands between, so she is never hit (her life 324 of 324 for 20 s; her
   life ×0.4 changed nothing) and her arrows, ×3 as a mini-boss, finish the hero. New `FLOW.bossZone` (a zone's own factors on its
   mini-boss, `zoneBossPowers`): the Cold Plains' mini-boss's damage ×0.6.
2. **Tier 3's leap** (+74 % over tier 2, then +15 % and +8 %): the Dark Wood's monsters `zoneDmg` 0.9 → 1 (1.1 and 1.2 measured: tiers
   4-5 lost as much as tier 3). The tiers' own steps stay uneven (`gearPower` 71 at tier 2, 179 at tier 3): the leap is partly the ruler's.
3. **Classes** (`classTaken` at the act's start, `classTakenLate` at 12:00): the Sorceress 0.85 → 0.75 and 0.5 → 0.45, the Necromancer
   1 → 0.85 and 0.35 → 0.3 (his tiers 0-2 alike, 4 seeds of 5 without a victory in 25 runs once the Dark Wood was harder), the Druid
   0.5 late (flat from tier 3 to 5), the Paladin 0.7 → 0.85 late (a first victory at runs 3 to 8). A Barbarian at 2.1 instead of 1.9
   was back in the window with no gear but his tiers 1-2 died at 3:20 again (medians 3:22, 3:20): kept at 1.9.
4. **Training** (`sim/forge.ts`): measured upgrade by upgrade (`SV_FORGE=<id>,…`, new), the life was most of it (+10 % of life alone:
   +15 % of survival with no gear, a few hit points carrying the hero past the Cold Plains' end); rerolls, banishes and the opening hand
   +3 %, experience +1 %. Vigour +4 → +1 % a rank, Lore +5 → +3 %; prices unchanged.

`tools/tiers.ts` (10 runs a class and tier, the mean of the 70, victories; "training": every rank, `SV_FORGE=max`):

| Gear tier         | 0    | 1    | 2        | 3         | 4          | 5          |
| ----------------- | ---- | ---- | -------- | --------- | ---------- | ---------- |
| Lot 309           | 3:14 | 4:09 | 5:21     | 9:19 (17) | 10:43 (35) | 11:35 (44) |
| Lot 313           | 3:32 | 4:27 | 6:04 (3) | 9:24 (17) | 10:39 (34) | 11:21 (44) |
| Lot 313, training | 3:47 | 4:52 | 6:11 (2) | 9:47 (19) | 11:03 (40) | 12:06 (54) |

A tier: +28, +29, +74, +15, +8 % → +26, +36, +55, +13, +7 %. Tiers 4-5 stay close: their runs end with the act (12:40-13:00, most of
tier 5's are victories). The training now +7, +9, +2, +4, +4, +7 % (lot 308: +24, +14, little, +16-17 at tiers 3-4): about a quarter of a
tier. No gear, the class medians: Assassin 2:40, Druid 2:48, Amazon 3:07, Sorceress 3:16, Paladin 3:23, Necromancer 4:05, Barbarian 4:12
(the last two above the window, the price of the Cold Plains' wall gone).

Run after run (`SV_SHOP=1 SV_FORGE=1 tools/campaign.ts --run <class> <seed> 25 1 0 d2 1`, seeds Prog, Run, Seed, Hero, Bot), the first
victory: median run 11, 28 of 35 within runs 8 to 20, one without in 25 (before, with the training bought the same way: 15, 7 without):
Amazon 9, 11, 12, 9 and one without; Assassin 24, 19, 6, 11, 18; Barbarian 7, 14, 11, 8, 7; Druid 14, 10, 11, 17, 8; Necromancer 15,
10, 13, 9, 11; Paladin 7, 3, 8, 14, 12; Sorceress 8, 12, 10, 13, 10 (before 8, 8, 13, 16 and one without).

Unit `tests/unit/lot313.test.ts` (the Cold Plains' mini-boss, the training's figures, the cards' column), `lot308` updated. Save version 7
unchanged.

## Balance (lot 283)

Measured with the base's bots (`tools/campaign.ts`: a class through the three difficulties; nightly: `tests/bots/campaign.test.ts`,
`tests/bots/difficulties.test.ts`), automatic control from level 1, cards by the class's plan, on 21 characters (3 names × the 7 classes:
Sorceress fire, Paladin zealot, Barbarian whirlwind, Amazon javelin, Necromancer bone, Druid fissure, Assassin traps), 40 / 60 / 100 h
allowed:

| Difficulty | Cleared | Hours of play (to Baal)                                                                                                                           |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal     | 21 / 21 | 4.8 to 17.4 (Druid 4.8 to 5.3; Amazon 10.6 to 17.4)                                                                                               |
| Nightmare  | 21 / 21 | 5.0 to 30.3 (Druid, Paladin 5 to 6; Amazon 7.4 to 30.3)                                                                                           |
| Hell       | 21 / 21 | 4.6 to 55.3 (Druid, Paladin 5.4 to 9.9; Assassin 7.2 to 19.3; Barbarian 4.6 to 28; Necromancer 14.4 to 49; Sorceress 16 to 19; Amazon 18 to 55.3) |

Lot 282 (before the assists of lot 283): Hell 18 / 21, two Amazons stuck in Act III and a Barbarian at Baal after 60 h.

## Known limits (lot 283)

- **The base's bots are the only players measured**: their gear choices are the base's (a Barbarian may wield a wand or a throwing axe,
  a Sword Mastery build an axe), and the weakest ones open Hell at level 52 to 64 and gain no level there (10 % of a level lost a
  death). A human player's pace is to be measured. The bot harness farms a lower cleared round (in a lower difficulty if needed) after 6
  deaths in a row, or 2 when 5 levels under the round's recommended level, and gives a round up after 25 min.
- `pd2+survivals` (lot 284): 14 bots (2 × the 7 classes) cleared Normal, Nightmare and Hell (Hell in 3.3 to 10.6 h of play, level 90
  to 94), no director change needed.
- Drawing (lot 284, `sim/adaptive.ts`): during a round, corpses, projectiles and damage numbers drawn are capped (rule `render.limits`),
  the base renderer pools monster, projectile and damage-number display objects and hides actors off screen; "Adaptive density" lowers
  the live cap (×0.85 / 0.7 / 0.55, 40 at least) while frames stay slow (75th percentile ≥ 28 ms). Not measured on a real phone yet.
- The base's bots run out of mana (a Bone Necromancer of level 37 to 65 deals almost nothing after the first minute of a round) and take
  hundreds of deaths in Hell's first tries; the bosses of the rounds are not placed as in Diablo II's maps (the arena is cut from the
  zone, the elite comes on the ring), and the super-uniques of Act IV and of the Worldstone Keep, unused or in other places in Diablo
  II, are met in the rounds nearest to them.
- **Rendering cost on a phone not measured**: the simulation of 90 live monsters costs 0.2 to 0.3 ms a step on a 16-core machine in every act and
  difficulty (`tools/bench.ts <round> 90 60 manual <difficulty>`); the frame rate on the owner's Galaxy Z Fold is the next measure.
- The base's panels (character, bag, stash, vendor) are laid out for landscape: in portrait on a phone the vendor's stall is cramped (the
  Run's hub has its own panels since lot 295; the Campaign's hub and the pause still open the base's).
- Without potions, the balance measured with the bots (lots 282-284) is to be measured again (the kill's 1 % of life and mana replaces
  them; the Act I bot test passes).
