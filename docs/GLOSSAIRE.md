# Glossary (French terms used in the code)

Domain terms as they appear in the game (French, the source language), in English (the displayed translation) and in the code.

| French | English | Code |
|---|---|---|
| Run (farm or boss zone launched from the waypoint) | Run | `RunDef`, `RUNS`, `Game.startRun`, `SaveData.run`, `runComplete` event |
| Ville | Town | `Game.mode === 'town'`, `enterTown`, `SaveData.town` |
| Campagne, acte | Campaign, act | `CAMPAIGNS`, `RunDef.campaign` |
| Point de passage | Waypoint | `WAYPOINT_ZONES`, `waypoint` panel |
| Difficulté : Normal, Cauchemar, Enfer | Normal, Nightmare, Hell | `Difficulty` = 0, 1, 2; `DIFF_NAMES` |
| Zone corrompue | Corrupted zone | `CORRUPT_LEVEL`, `corruptRun` |
| Carte (endgame) | Map | `Item.map` (`tier`, `zone`, `mods`), `MAP_ZONES`, `CharacterState.mapStash` |
| Palier de carte | Map tier | `map.tier` |
| Palier de butin | Loot tier | `loot/tiers.ts`, `tierOverride` |
| Butin, filtre de butin | Loot, loot filter | `loot/`, `LootFilterSettings`, `FILTER_PRESETS` (`sim/lootfilter.ts`) |
| Surbrillance | Highlight | `filter.highlight`, `loot/highlight.ts` |
| Taux de butin | Loot rate | `Settings.lootRate`, `LOOT_PRESETS` (`data/rates.ts`) |
| Coffre (single, shared between characters) | Stash (shared) | `CharacterState.stash`, `SharedStash`, `Game.attachShared` |
| Onglet des runes, matériaux | Rune tab, materials | `CharacterState.materials`, `STASH_VIEW` (UI) |
| Coffre de guilde | Guild stash | `platform/guild.ts`, `server/guild` |
| Sac, grand inventaire | Inventory, big inventory | `CharacterState.inventory`, `INV_COLS` × `INV_ROWS`, `Settings.bigInventory` |
| Inventaire des charmes | Charm inventory | `CharacterState.charmInv`, `CHARM_COLS` × `CHARM_ROWS` |
| Base (d'objet) | Item base | `ItemBase`, `BASES`, `BASE_BY_ID` |
| Qualité : normal, magique, rare, set (panoplie), unique, artisanal, mot runique | Quality: normal, magic, rare, set, unique, crafted, runeword | `Quality`, `Item.quality` |
| Éthéré | Ethereal | `Item.ethereal` |
| Châsse, sertir | Socket, to socket | `Item.sockets`, `Item.socketed`, `sim/socket.ts` |
| Mot runique | Runeword | `Item.runeword`, `RUNEWORDS`, `RUNEWORD_BY_ID` |
| Cube (horadrique), recette | (Horadric) Cube, recipe | `CharacterState.cube`, `sim/cube.ts`, `data/cube.ts` |
| Corrompre (un objet) | Corrupt (an item) | `Item.corrupted`, `sim/corruption.ts` |
| Imprégnation | Imbue | `imbue` panel, Charsi's quest |
| Mercenaire | Mercenary, hireling | `CharacterState.merc`, `sim/merc.ts`, `data/mercs.ts` |
| Compétence, arbre, prérequis | Skill, tree, prerequisite | `SkillDef`, `SkillTree`, `TREES`, `prereqs` |
| Points durs (invested points, excluding +skills bonuses) | Hard points | `hardPoints`, `pd2Hard` |
| Synergie | Synergy | `SkillDef.synergies`, `synergyPct`, `PD2_SYNERGIES` |
| Aura, malédiction, cri | Aura, curse, shout | `SkillKind`: `aura`, `curse`, `shout` |
| Invocation, créature | Summon, minion | `Monster.isSummon`, `Monster.pet`, `sim/minions.ts` |
| Rang : normal, champion, unique, sbire, boss | Rank: normal, champion, unique, minion, boss | `MonsterRank` |
| Super-unique | Super unique | `data/superuniques.ts` |
| Autel | Shrine | `data/shrines.ts` |
| Caractéristiques (force, dextérité, vitalité, énergie) | Attributes (strength, dexterity, vitality, energy) | `CharacterState.base` (`str`, `dex`, `vit`, `ene`) |
| Statistiques dérivées | Derived stats | `computeDerived` → `DerivedStats` |
| Paliers de vitesse (FCR, FHR…) | Breakpoints (FCR, FHR…) | `sim/breakpoints.ts` |
| Tick (1/25 s) | Tick | `TICK_HZ`, `DT`, `world.tick` |
| Événement de simulation | Simulation event | `SimEvent` (`sim/events.ts`) |
| Bot (automated player), cerveau, arène | Bot, brain, arena | `sim/bot/brain.ts`, `runner.ts`, `arena.ts`, `BuildId` |
| Planche (de sprites), palier `hi` / `lo` | Sprite sheet, `hi` / `lo` tier | `SpriteBank`, `public/sprites/manifest.json` |
| Graphismes locaux (generated on the device) | Local graphics | `d2Local`, `d2Info.local` |
| Version publique | Public build | `PUBLIC_BUILD` (`D2_PUBLIC=1`) |
| Synchronisation, emplacement | Sync, slot | `platform/sync.ts`, `SaveStore`, `d2m.save.<uuid>` |
| Réglages | Settings | `Settings` (`sim/save.ts`), `settings-catalog.ts` |
| PD2 | Project Diablo 2 | `*-pd2.ts` values (PD2 wiki, CC BY-SA 4.0) |
