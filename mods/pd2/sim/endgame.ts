/**
 * Cartes d'endgame PD2 branchées sur les règles nommées du jeu (src/mods/rules.ts, règles `maps.*`, `world.*`, `combat.*`, `ai.mapBoss`,
 * `runs.mapBossDeath`) : la base n'a aucune carte, ce mod en fournit la génération, l'ouverture, le butin, les recettes, les modificateurs
 * de monde et les boss de carte (lot M5b ; code autrefois dans src/sim/maps.ts, mapmods.ts, map-boss.ts et src/data/zones/map*.ts, appelé
 * aux mêmes endroits, dans le même ordre).
 */
import type { MapLaunch, ModApi } from '../../../src/mods/api';
import { addToCharacter, makeStack, MAP_ZONE_BY_ID, MAP_DENSITY_DROP_DIV, RATES, Rng, type CharacterState, type Item, type Monster, type World } from '../../../src/mods/sdk';
import { MAP_BOSS_SHIELD_TAKEN } from '../data/map-boss-kits';
import { PANDEMONIUM_RATES } from './pandemonium';
import { MAP_EVENT_CHANCE, MAP_IMMUNE_PCT } from '../data/maps';
import { buildMapZone, MAP_EVENTS, MAP_EVENT_NAMES } from '../data/zones/mapzone';
import { mapBossDmgMul, mapBossHpMul, initMapBoss, onMapBossDeath, updateMapBoss } from './map-boss';
import { applyMapModsToMonster, mapAfterHit, mapFx, mapHitPacket, mapTick } from './mapmods';
import { MAP_OPS, mapOpCheck, mergeMapsFromStash, mergeMapsPreview, upgradeMapWith, type MapOpId } from './mapops';
import {
  applyMapRecipe,
  corruptMap,
  corruptModText,
  heroInvaderDrops,
  horazonMaps,
  makeMap,
  mapBonuses,
  mapExtraDrops,
  mapExtraGearDrops,
  mapWorldSetup,
  treasureFallenDrops,
  uniqueMapRewards,
} from './maps';

/** Ouverture d'une carte : modificateurs, événement (11 / 22 / 33 % selon la rareté, jamais sur une carte unique), zone construite */
export function launchMap(it: Item, seed: number): MapLaunch {
  const setup = mapWorldSetup(it);
  const zdef = MAP_ZONE_BY_ID[it.map!.zone];
  // événement de carte (PD2 §6.5)
  const evRng = new Rng(`mapevent:${seed}`);
  const event = it.map!.catalyst || evRng.chance(MAP_EVENT_CHANCE[it.quality] ?? 0) ? evRng.pick(MAP_EVENTS) : undefined;
  performance.mark('map:zone0');
  const zone = buildMapZone(zdef, seed, { ...setup.zoneOpts, event });
  performance.mark('map:zone1');
  const message = event ? MAP_EVENT_NAMES[event] : zdef.unique ? `Carte unique : ${zdef.unique.text}` : undefined;
  return { zone, zoneLevel: setup.zoneLevel, mods: setup.mods, message };
}

/** Butin en plus d'un monstre tué dans une carte : le boss d'une carte (rang unique entouré de ses sbires) lâche comme un boss */
export function mapRunDrops(w: World, m: Monster, tier: number, zone: string): Item[] {
  const out = mapExtraDrops(w.rng.loot, tier, m.runBoss ? 'boss' : m.rank);
  if (m.runBoss) out.push(...uniqueMapRewards(w.rng.loot, zone, w.zoneLevel));
  if (m.def.id === 'treasure_fallen') out.push(...treasureFallenDrops(w.rng.loot, tier));
  // événements : Rôdeur des ténèbres (éclats de Pierre-Monde), Ombre de Mendeln (Éclat du Vide, 40 %)
  if (m.name === 'Rôdeur des ténèbres') out.push(makeStack(w.rng.loot, 'worldstone_shard', 2 + w.rng.loot.int(3)));
  if (m.name === 'Ombre de Mendeln') out.push(...(w.rng.loot.chance(0.4) ? [makeStack(w.rng.loot, 'splinter_void', 1)] : []));
  // Autel du Catalyseur : 1 à 3 Éclats ; Invasion de héros corrompus : deux objets rares par envahisseur
  if (m.name === 'Gardien du Catalyseur') out.push(makeStack(w.rng.loot, 'catalyst_shard', 1 + w.rng.loot.int(3)));
  if (m.name === 'Héros corrompu') out.push(...heroInvaderDrops(w.rng.loot, w.zoneLevel));
  // PD2 : Sceaux des Anciens sur les monstres de carte (1:6400 ; Madawc / Talic / Korlic selon le palier), Essence démoniaque pure sur les boss de carte
  const sigil = ['', 'sigil_madawc', 'sigil_talic', 'sigil_korlic'][tier];
  if (sigil && w.rng.loot.chance(PANDEMONIUM_RATES.sigil / MAP_DENSITY_DROP_DIV)) out.push(makeStack(w.rng.loot, sigil, 1));
  if (m.runBoss && w.rng.loot.chance(PANDEMONIUM_RATES.pureEssence)) out.push(makeStack(w.rng.loot, 'pure_essence', 1));
  return out;
}

/** Hors des cartes, en Enfer : cartes de palier 1 (rares hors boss), sauf si le monstre a déjà lâché un éclat de Pierre-Monde */
export function campaignMapDrops(w: World, m: Monster, difficulty: number, out: Item[]): void {
  if (difficulty === 2 && !out.some((x) => x.base === 'worldstone_shard')) {
    const p = (m.rank === 'boss' ? 0.35 : m.rank === 'unique' ? 0.04 : m.rank === 'champion' ? 0.015 : 0.0008) * RATES.maps;
    if (w.rng.loot.chance(Math.min(1, p))) out.push(makeMap(w.rng.loot, 1));
  }
}

/** Monstre créé : modificateurs de la carte, pas d'immunité non annoncée, état de boss de carte */
export function onMonsterSpawned(w: World, m: Monster, mapBoss: boolean): void {
  applyMapModsToMonster(w, m);
  if (w.run?.runId === 'map') {
    // les affixes « +x % de résistance des monstres » ne créent pas d'immunité non annoncée : sous 100 % hors éléments annoncés
    const announced = new Set(w.mapMods.map((x) => x.id));
    const key = { phys: 'physImmune', fire: 'fireImmune', cold: 'coldImmune', light: 'lightImmune', poison: 'poisonImmune' } as const;
    for (const k of Object.keys(key) as (keyof typeof key)[]) if (!announced.has(key[k]) && m.res[k] >= 100) m.res[k] = 99;
  }
  if (mapBoss) initMapBoss(w, m);
}

/** Matériaux d'essai du mod pour le personnage d'essai (?testchar=1) */
const TEST_MATERIALS: Record<string, number> = {
  worldstone_shard: 30,
  puzzlepiece: 6,
  puzzlebox: 2,
  orb_arcane: 6,
  orb_angelic: 6,
  orb_zakarum: 6,
  orb_horadrim: 6,
  orb_destruction: 6,
  orb_cartographer: 6,
  orb_fortification: 6,
  horadrim_scarab: 4,
};

/** Personnage d'essai : matériaux du mod, puis trois cartes rares (paliers 1 à 3, même flux d'aléa qu'avant) */
export function testCharacter(c: CharacterState, rng: Rng): void {
  for (const [id, n] of Object.entries(TEST_MATERIALS)) c.materials[id] = n;
  for (const tier of [1, 2, 3]) addToCharacter(c, makeMap(rng, tier, 'rare'));
}

/** Icônes des monnaies du mod (planche d'icônes du jeu) */
const CURRENCY_ICONS: Record<string, string> = { worldstone_shard: 'shard', horadrim_scarab: 'scarab' };

/** Branche les cartes sur les règles du jeu */
export function registerEndgame(api: ModApi): void {
  const r = api.rules;
  r.set('maps.make', () => makeMap);
  r.set('maps.immunePct', () => () => MAP_IMMUNE_PCT);
  r.set('maps.bonuses', () => mapBonuses);
  r.set('maps.corruptModText', () => corruptModText);
  r.set('maps.launch', () => launchMap);
  r.set('maps.buildZone', () => buildMapZone);
  r.set('maps.applyRecipe', () => applyMapRecipe);
  r.set('maps.corrupt', () => corruptMap);
  r.set('maps.runDrops', () => mapRunDrops);
  r.set('maps.campaignDrops', () => campaignMapDrops);
  r.set('maps.chestDrops', () => (w, tier) => horazonMaps(w.rng.loot, tier));
  r.set('maps.worldModDrops', () => mapExtraGearDrops);
  r.set('maps.ops', () => () => MAP_OPS);
  r.set('maps.opCheck', () => (c, it, opId) => mapOpCheck(c, it, opId as MapOpId));
  r.set('maps.upgrade', () => (c, ref, opId, rng) => upgradeMapWith(c, ref, opId as MapOpId, rng));
  r.set('maps.mergePreview', () => mergeMapsPreview);
  r.set('maps.merge', () => mergeMapsFromStash);
  r.set('maps.upgradeCurrency', () => () => 'orb_cartographer');
  r.set('debug.testCharacter', () => testCharacter);
  r.set('ui.currencyIcon', () => (id) => CURRENCY_ICONS[id] ?? (id.startsWith('puzzle') ? id : undefined));
  r.set('maps.bossStatMul', () => (def, tier) => ({ hp: mapBossHpMul(def, tier), dmg: mapBossDmgMul(def, tier) }));
  r.set('world.monsterSpawned', () => onMonsterSpawned);
  r.set('world.tick', () => mapTick);
  r.set('combat.monsterHitPacket', () => mapHitPacket);
  r.set('combat.afterMonsterHit', () => mapAfterHit);
  r.set('combat.monsterFhrPct', () => (w) => mapFx(w).fhr);
  r.set('combat.mapBossTaken', () => (w, m) => (m.mapBoss!.shieldUntil > w.tick ? MAP_BOSS_SHIELD_TAKEN : 1));
  r.set('ai.mapBoss', () => updateMapBoss);
  r.set('runs.mapBossDeath', () => onMapBossDeath);
}
