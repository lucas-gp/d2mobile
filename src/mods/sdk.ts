/**
 * Moteur exposé au code d'un mod : les fonctions et tables du jeu qu'un système de mod (cartes d'endgame du mod pd2…) utilise pour générer
 * des objets, construire des zones, faire apparaître des projectiles ou lire les registres. Avec `src/mods/api` (types, manifest), c'est le
 * seul module du jeu que le code d'un mod importe (règle ESLint de frontière, eslint.config.js) ; le manifest, chargé au démarrage,
 * n'importe que l'API (ce module tire la simulation : il n'entre dans le bundle qu'avec le contenu d'un mod, chunk chargé à l'activation).
 * Une fonction n'y entre que lorsqu'un mod en a besoin ; la liste est la surface du moteur dont un mod dépend.
 */

/* Noyau */
export { Rng } from '../core/rng';
export { clamp, dist, TAU } from '../core/math';

/* Données (registres et constantes) */
export { MAP_AFFIXES, MAP_AFFIX_BY_ID, MAP_RANDOM_ZONES, MAP_TIER_LEVEL, MAP_UNIQUE_ZONES, MAP_ZONE_BY_ID } from '../data/maps';
export { AFFIXES, RUNES, UNIQUES } from '../data/items/index';
export { UNIQUE_BY_ID } from '../data/items/uniques';
export { BASE_BY_ID, BASES } from '../data/items/bases';
export { MONSTER_BY_ID } from '../data/monsters';
export { DIFF_MULT, monsterDmg } from '../data/curves';
export { RATES } from '../data/rates';
export { PROP_BY_ID } from '../data/props';
export { CUBE_BY_ID } from '../data/cube';
export { ZoneBuilder } from '../data/zones/builder';
export { SKILL_BY_ID, lin, synergyPct } from '../data/skills';

/* Simulation */
export { DT, MAP_DENSITY_DROP_DIV, TICK_HZ } from '../sim/constants';
export { makeUid } from '../sim/item';
export { emptyPacket } from '../sim/actors';
export { corruptItem } from '../sim/corruption';
export { generateItem, isSkillerAffix, lootBaseAllowed, makeStack, otherClassAffix, rollValues } from '../sim/loot/itemgen';
export { hurtPet } from '../sim/druid';
export { addBleed } from '../sim/melee';
export { cursePlayer, hexElemRes, hexPhysRes } from '../sim/monster-auras';
export { spawnArea, spawnMissile } from '../sim/missiles';
export { simHooks } from '../sim/hooks';
export { Fog } from '../sim/fog';
export { mapName, type MapInfo } from '../sim/mapinfo';
export { addMapToStash } from '../sim/mapstash-core';
export { addToCharacter } from '../sim/inventory';
export { computeDerived } from '../sim/character';
export { matCount } from '../sim/materials';
export { addSocketsRecipesFor, canPay, itemAccepted, pay } from '../sim/cube';

/* Game modes (lot 273, S0): bots, automatic aim, super-uniques, zone levels */
export { BotBrain, botRules, buildPlan, BUILD_CLASS } from '../sim/bot/brain';
export { autoAim } from '../sim/targeting';
export { SUPER_UNIQUE_DEFS } from '../data/monsters-fidelity';
export { REGISTRIES } from './registries';
/* Game modes (lot 280, S6): population plans of the zones outside the `levels` registry (Act IV, the lairs of the act bosses) */
export { LEVEL_PLANS } from '../data/levels';
export { d2Map } from '../data/d2map';
export { canCast, castFrames, hasBuff, skillManaCost } from '../sim/skills';
export { scalePacket } from '../sim/missiles';
export { itemName } from '../sim/itemstats';
/* Game modes (lot 283, S8): a treasure class rolled by a mode (quest drops of the act bosses, super-uniques' own classes) */
export { rollTc } from '../sim/loot/drops';
export { NO_BONUS } from '../sim/loot/itemgen';
/* Game modes (lot 284, S9): a monster's resistance as the content ruleset counts it (pd2: a sunder charm breaks an immunity) */
export { effectiveMonsterRes } from '../sim/combat';

/* Types du moteur */
export type { BotOptions, BuildId } from '../sim/bot/brain';
export type { Game } from '../sim/game';
export type { RunState } from '../sim/runs';
export type { RunDef, RunDirector } from '../data/runs';
export type { SimEvent } from '../sim/events';
export type { CubeEffect } from '../data/cube';
export type { Element } from '../data/stats';
export type { MonsterDef } from '../data/types';
export type { GroundKind, MapEvent, MapZoneOptions, SpawnDef, ZoneDef } from '../data/zone-types';
export type { DamagePacket, Monster, Player } from '../sim/actors';
export type { Item, Quality } from '../sim/item';
export type { World } from '../sim/world';
export type { DerivedStats } from '../sim/derived';
export type { CharacterState } from '../sim/character-state';
export type { CubeResult, MapOp, MapOpCheck, MapRef, MergeOpts, MergePreview, MergeResult } from '../sim/cube';
export type { MapBossAction, MapBossArchetype, MapBossAuraFx, MapBossState } from '../sim/map-boss-state';
export type { DropContext } from '../sim/loot/drops';
export type { TreasureClass } from '../data/treasure';

/* Game modes (lot 285): auto-equipment of the loot walked over (an empty slot only), skill icons of the level-up cards */
export { targetSlot } from '../sim/inventory';
export { canEquip, canWear } from '../sim/character';
export { icon as skillIcon } from '../ui/icon';
export { skillLines, type SkillLine } from '../ui/skilltext';
/* Game modes (lot 289): a roguelite run starts the hero again at a level (classes' starting attributes, experience table) */
export { CLASSES } from '../data/classes';
export { XP_TABLE } from '../data/xp';
export { gainXp, xpForKill } from '../sim/progression';
/* Game modes (lot 290): gear worn without requirements, the loot walked over put on when clearly better (the hero's class's items) */
export { classCanUse } from '../data/classes';
/* Game modes (lot 292): the hub's shop shows an item's tooltip and its comparison with the worn one */
export { compareDeltas, itemTooltip } from '../ui/itemtext';
/*
 * Game modes (lot 295): a mode's hub of panels (equipment, bag, charms, shared stash, Horadric Cube, crafting, skill trees, hireling)
 * drawn by the mode with the game's own data: the items' inventory images, the grids' sizes, the Cube's checks, the hireling's slots
 */
export { itemIconOf } from '../ui/itemicon';
export { itemSize, INV_COLS, INV_ROWS, STASH_COLS, STASH_ROWS } from '../sim/inventory';
export { CHARM_COLS, CHARM_ROWS, STASH_TABS } from '../sim/character';
export { CUBE_COLS, CUBE_ROWS } from '../sim/materials';
export { cubeCheck } from '../sim/cube';
export { mercSlots } from '../data/mercs';
export { mercType } from '../sim/merc-core';
export { TREES } from '../data/classes';
