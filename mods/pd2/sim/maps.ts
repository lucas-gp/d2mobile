// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Cartes d'endgame (PD2, mods/pd2/docs/ETUDE-PD2.md §6) : génération d'une carte (zone du palier, rareté,
 * affixes à plages par palier), conversion en modificateurs de monde et options de zone,
 * butin propre aux cartes (cartes, orbes), recettes d'orbes et de combinaison du Cube.
 */
import type { MapAffixDef } from '../../../src/mods/api';
import {
  AFFIXES,
  BASE_BY_ID,
  BASES,
  corruptItem,
  generateItem,
  isSkillerAffix,
  lootBaseAllowed,
  makeUid,
  MAP_AFFIXES,
  MAP_AFFIX_BY_ID,
  MAP_DENSITY_DROP_DIV,
  MAP_RANDOM_ZONES,
  MAP_TIER_LEVEL,
  MAP_UNIQUE_ZONES,
  MAP_ZONE_BY_ID,
  mapName,
  otherClassAffix,
  RATES,
  rollValues,
  RUNES,
  UNIQUES,
  type CubeEffect,
  type Item,
  type MapInfo,
  type MapZoneOptions,
  type Quality,
  type Rng,
} from '../../../src/mods/sdk';
import { MAP_IMMUNE_PCT } from '../data/maps';

export { MAP_IMMUNE_PCT, mapName, type MapInfo };

/** Plage de valeurs d'un affixe selon le palier : T1 plage 1, T2 plages 1-2, T3 plages 2-3, donjon plage 3 */
function affixValue(rng: Rng, a: MapAffixDef, tier: number): number {
  const band = tier === 1 ? 0 : tier === 2 ? rng.int(2) : tier === 3 ? 1 + rng.int(2) : 2;
  const [lo, hi] = a.ranges[band];
  return rng.range(lo, hi);
}

function rollAffixes(rng: Rng, tier: number, quality: Quality): { id: string; value: number }[] {
  const out: { id: string; value: number }[] = [];
  if (quality === 'normal') return out;
  let pre = 0;
  let suf = 0;
  const [maxP, maxS, n] = quality === 'magic' ? [1, 1, rng.range(1, 2)] : [3, 3, rng.range(4, 6)];
  const used = new Set<string>();
  for (let k = 0; k < n; k++) {
    const pool = MAP_AFFIXES.filter((a) => !used.has(a.id) && (a.kind === 'prefix' ? pre < maxP : suf < maxS));
    const a = rng.weighted(pool, (x) => x.freq ?? 1);
    if (!a) break;
    used.add(a.id);
    if (a.kind === 'prefix') pre++;
    else suf++;
    out.push({ id: a.id, value: affixValue(rng, a, tier) });
  }
  return out;
}

/**
 * Crée une carte : palier, rareté (sinon tirée : 60 % normale, 30 % magique, 10 % rare), zone
 * aléatoire du palier. Une carte unique prend une zone unique du palier et ses affixes fixes.
 */
export function makeMap(rng: Rng, tier: number, quality?: Quality, zone?: string): Item {
  const q: Quality = quality ?? (rng.chance(0.1) ? 'rare' : rng.chance(0.33) ? 'magic' : 'normal');
  const pool = q === 'unique' ? MAP_UNIQUE_ZONES : MAP_RANDOM_ZONES;
  const zones = pool.filter((z) => z.tier === tier);
  const z = zone ?? rng.pick(zones.length ? zones : pool.filter((x) => x.tier <= 3)).id;
  const def = MAP_ZONE_BY_ID[z];
  const t = q === 'unique' ? def.tier : tier;
  const base = t >= 4 ? 'map_t4' : `map_t${t}`;
  const info: MapInfo = { tier: t, zone: z, mods: q === 'unique' ? (def.unique?.mods ?? []).map((m) => ({ ...m })) : rollAffixes(rng, t, q) };
  if (q === 'unique') return { uid: makeUid(rng.nextU32()), base, quality: q, ilvl: MAP_TIER_LEVEL[t], sockets: 0, socketed: [], map: info };
  return { uid: makeUid(rng.nextU32()), base, quality: q, ilvl: MAP_TIER_LEVEL[tier], sockets: 0, socketed: [], map: info };
}

/** Bonus de l'Étendard des Héros (PD2) */
const HEROIC_BONUS = { xp: 10, density: 20, mf: 20 };

/** Bonus cumulés des affixes : XP, densité, MF/GF (valeur moyenne de la plage du bonus) */
export function mapBonuses(it: Item): { xp: number; density: number; mf: number; rarity: number } {
  const m = it.map as MapInfo;
  let xp = 0;
  let density = 0;
  let mf = 0;
  let rarity = 0;
  for (const mod of m.mods) {
    const a = MAP_AFFIX_BY_ID[mod.id];
    if (!a) continue;
    const mid = (r?: [number, number]) => (r ? Math.round((r[0] + r[1]) / 2) : 0);
    xp += mid(a.xp);
    density += mid(a.density);
    mf += mid(a.mf);
    if (a.mod === 'monsterRarity') rarity += mod.value;
  }
  if (m.fortified) {
    xp += 100;
    mf += 100;
  }
  if (m.heroic) {
    xp += HEROIC_BONUS.xp;
    density += HEROIC_BONUS.density;
    mf += HEROIC_BONUS.mf;
  }
  return { xp, density, mf, rarity };
}

/** Modificateurs de monde et options de zone pour ouvrir la carte */
export function mapWorldSetup(it: Item): { zoneLevel: number; mods: { id: string; value: number }[]; zoneOpts: MapZoneOptions } {
  const m = it.map as MapInfo;
  const bonus = mapBonuses(it);
  const mods: { id: string; value: number }[] = [];
  let zoneLevel = MAP_TIER_LEVEL[m.tier];
  const families: string[] = [];
  let extraBoss = false;
  for (const mod of [...m.mods, ...(m.corruptMod ? [m.corruptMod] : [])]) {
    const a = MAP_AFFIX_BY_ID[mod.id];
    const id = a?.mod ?? mod.id;
    if (id === 'zoneLevel') zoneLevel += mod.value;
    else if (id === 'extraFamily') families.push(['hell_bovine', 'zombie', 'fallen', 'skeleton', 'mummy'][mod.value % 5]);
    else if (id.startsWith('family:')) families.push(id.slice(7));
    else if (id === 'extraBoss') extraBoss = true;
    else mods.push({ id, value: mod.value });
  }
  if (bonus.xp) mods.push({ id: 'xpBonus', value: bonus.xp });
  if (bonus.mf) mods.push({ id: 'mfBonus', value: bonus.mf });
  if (m.fortified) {
    mods.push({ id: 'monsterLife', value: 100 }, { id: 'monsterDamage', value: 20 }, { id: 'playerFrw', value: 30 }, { id: 'itemQuantity', value: 100 });
  }
  // immunités de la zone (105-120 %) sur 30 % des monstres (uniques de carte : aucune) ; les
  // immunités propres aux monstres de l'Enfer s'y ajoutent
  const z = MAP_ZONE_BY_ID[m.zone];
  for (const e of z?.immune ?? []) mods.push({ id: `${e}Immune`, value: MAP_IMMUNE_PCT });
  return { zoneLevel, mods, zoneOpts: { density: bonus.density, rarity: bonus.rarity, extraFamily: families.length ? families.join(',') : undefined, extraBoss, fortified: m.fortified } };
}

/**
 * Butin propre aux cartes : cartes (même palier, +1 plus rarement, −1 parfois) et orbes.
 * Par monstre tué, selon le rang. Réglé par RATES.maps et RATES.orbs ; hors boss, divisé par MAP_DENSITY_DROP_DIV (constants.ts).
 */
export function mapExtraDrops(rng: Rng, tier: number, rank: string): Item[] {
  const out: Item[] = [];
  const div = rank === 'boss' ? 1 : MAP_DENSITY_DROP_DIV;
  const pMap = ((rank === 'boss' ? 1.2 : rank === 'unique' ? 0.12 : rank === 'champion' ? 0.05 : 0.004) * RATES.maps) / div;
  const nMaps = Math.floor(pMap) + (rng.chance(pMap - Math.floor(pMap)) ? 1 : 0);
  for (let i = 0; i < nMaps; i++) {
    const x = rng.next();
    const t = x < 0.2 && tier < 3 ? tier + 1 : x < 0.3 && tier > 1 ? tier - 1 : tier;
    // PD2 : 1 % des cartes lâchées sont des cartes uniques
    out.push(rng.chance(UNIQUE_MAP_CHANCE) ? makeMap(rng, Math.min(3, t), 'unique') : makeMap(rng, Math.min(3, t)));
  }
  // charme de brisure : boss de carte, élément au hasard (RATES.sunder)
  if (rank === 'boss' && rng.chance(RATES.sunder[Math.min(4, tier)] ?? 0)) {
    const id = rng.pick(['u_sunder_cold', 'u_sunder_fire', 'u_sunder_light', 'u_sunder_phys']);
    out.push(generateItem(rng, 'grand_charm', MAP_TIER_LEVEL[Math.min(4, tier)], { forceUniqueId: id }));
  }
  // scarabée horadrique : boss de palier 3 (1/20)
  if (rank === 'boss' && tier === 3 && rng.chance(0.05)) out.push(stack(rng, 'horadrim_scarab'));
  const pOrb = ((rank === 'boss' ? 0.8 : rank === 'unique' ? 0.1 : rank === 'champion' ? 0.04 : 0.003) * RATES.orbs) / div;
  if (rng.chance(Math.min(1, pOrb))) {
    const orb = rng.weighted(
      [
        ['orb_arcane', 30],
        ['orb_zakarum', 14],
        ['orb_angelic', 14],
        ['orb_horadrim', 12],
        ['orb_destruction', 10],
        ['orb_cartographer', 12],
        ['orb_fortification', 4],
        ['worldstone_shard', 10],
      ] as [string, number][],
      (e) => e[1],
    )![0];
    out.push(stack(rng, orb));
  }
  return out;
}

/** Part des cartes lâchées qui sont uniques (PD2 : 1 %) */
const UNIQUE_MAP_CHANCE = 0.01;

/** Unique au hasard (hors objets réservés), sur sa base */
function randomUnique(rng: Rng, ilvl: number, filter: (baseType: string) => boolean = () => true): Item {
  const pool = UNIQUES.filter((u) => !u.noRandomDrop && u.lvl <= ilvl && filter(BASE_BY_ID[u.base]?.type ?? '') && lootBaseAllowed(BASE_BY_ID[u.base]));
  const u = rng.weighted(pool, (x) => x.rarity)!;
  return generateItem(rng, u.base, ilvl, { forceUniqueId: u.id });
}

const HAS_DEFENSE_OR_DMG = (t: string) => ['helm', 'pelt', 'circlet', 'armor', 'shield', 'gloves', 'boots', 'belt', 'staff', 'wand', 'orb', 'sword', 'axe', 'mace', 'dagger'].includes(t);

/**
 * Butin spécial du boss d'une carte unique (PD2 §6.6) : uniques à châsses, éthérés ou corrompus,
 * joyaux rares, boîte à énigme, charmes de compétence, rune haute ou explosion de trésor.
 */
export function uniqueMapRewards(rng: Rng, zoneId: string, ilvl: number): Item[] {
  const def = MAP_ZONE_BY_ID[zoneId]?.unique;
  if (!def) return [];
  const out: Item[] = [];
  switch (def.reward) {
    case 'socketedUniques':
      for (let i = 0; i < 3; i++) {
        const it = randomUnique(rng, ilvl, (t) => HAS_DEFENSE_OR_DMG(t));
        const b = BASE_BY_ID[it.base];
        it.sockets = Math.max(1, Math.min(b.maxSockets, 1 + rng.int(3)));
        if (b.maxSockets <= 0) it.sockets = 0;
        out.push(it);
      }
      break;
    case 'etherealUniques':
      for (let i = 0; i < 3; i++)
        out.push(
          Object.assign(
            randomUnique(rng, ilvl, (t) => HAS_DEFENSE_OR_DMG(t)),
            { ethereal: true },
          ),
        );
      break;
    case 'corruptedUniques': {
      const n = 1 + rng.int(3);
      for (let i = 0; i < n; i++) {
        const it = randomUnique(rng, ilvl);
        corruptItem(rng, it);
        out.push(it);
      }
      break;
    }
    case 'jewels':
      for (let i = 0; i < 3; i++) out.push(generateItem(rng, 'jewel', ilvl, { forceQuality: 'rare' }));
      break;
    case 'puzzle':
      out.push(stack(rng, 'puzzlebox'), stack(rng, 'puzzlepiece'), stack(rng, 'puzzlepiece'), stack(rng, 'puzzlepiece'));
      break;
    case 'skillCharms':
      for (let i = 0; i < 2; i++) out.push(skillCharm(rng, ilvl));
      break;
    case 'highRune': {
      // Hel (15) à Ist (24), les plus basses plus probables
      const pool = RUNES.filter((r) => r.rank >= 15 && r.rank <= 24);
      out.push(stack(rng, rng.weighted(pool, (r) => 25 - r.rank)!.id));
      break;
    }
    case 'treasure':
      for (let i = 0; i < 4; i++) out.push(randomUnique(rng, ilvl));
      for (let i = 0; i < 3; i++) out.push(makeMap(rng, Math.min(3, MAP_ZONE_BY_ID[zoneId].tier)));
      out.push(stack(rng, 'orb_fortification'), stack(rng, 'worldstone_shard'));
      break;
  }
  return out;
}

/** Grand charme magique à +1 aux compétences d'un arbre de la classe en jeu (charme de compétence) */
function skillCharm(rng: Rng, ilvl: number): Item {
  const it = generateItem(rng, 'grand_charm', ilvl, { forceQuality: 'magic' });
  const tree = rng.pick(AFFIXES.filter((a) => isSkillerAffix(a) && !otherClassAffix(a)));
  it.affixes = [...(it.affixes ?? []).filter((a) => AFFIXES.find((x) => x.id === a.id)?.kind !== 'prefix'), { id: tree.id, values: rollValues(rng, tree.mods) }];
  return it;
}

/** Événement « Déchu au trésor » : runes (jusqu'à Zod, très rarement), cartes, orbes */
export function treasureFallenDrops(rng: Rng, tier: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < 3; i++) {
    // rang de rune : exponentielle décroissante (moyenne ~ Nef/Eth), queue jusqu'à Zod
    let rank = 1;
    while (rank < 33 && rng.chance(0.72)) rank++;
    out.push(stack(rng, RUNES[rank - 1].id));
  }
  for (let i = 0; i < 2; i++) out.push(makeMap(rng, Math.min(3, tier)));
  out.push(stack(rng, rng.pick(['orb_arcane', 'orb_angelic', 'orb_zakarum', 'orb_cartographer', 'orb_horadrim'])));
  return out;
}

/** Événement « Coffre d'Horazon » : 6 cartes du même palier ou du suivant, 10 % uniques */
export function horazonMaps(rng: Rng, tier: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < 6; i++) {
    const t = Math.min(3, tier + (rng.chance(0.35) ? 1 : 0));
    out.push(rng.chance(0.1) ? makeMap(rng, t, 'unique') : makeMap(rng, t));
  }
  return out;
}

function stack(rng: Rng, base: string): Item {
  return { uid: makeUid(rng.nextU32()), base, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 1 };
}

/** Recettes du Cube sur les cartes (orbes, combinaisons, scarabée) */
export function applyMapRecipe(rng: Rng, e: CubeEffect, items: Item[], _clvl: number): { ok: boolean; reason?: string; item?: Item; note?: string } {
  const m0 = items[0]?.map as MapInfo | undefined;
  if (!m0) return { ok: false, reason: 'Une carte est nécessaire' };
  if (e.kind === 'mapOrb') {
    const it = items[0];
    const set = (q: Quality) => {
      it.quality = q;
      m0.mods = rollAffixes(rng, m0.tier, q);
    };
    switch (e.orb) {
      case 'arcane':
        if (it.quality !== 'normal' && it.quality !== 'magic') return { ok: false, reason: 'Carte normale ou magique' };
        set('magic');
        break;
      case 'zakarum':
        if (it.quality !== 'normal') return { ok: false, reason: 'Carte normale' };
        set('rare');
        break;
      case 'angelic':
        if (it.quality !== 'magic') return { ok: false, reason: 'Carte magique' };
        set('rare');
        break;
      case 'horadrim':
        if (it.quality !== 'rare') return { ok: false, reason: 'Carte rare' };
        set('rare');
        break;
      case 'destruction':
        if (it.quality !== 'magic' && it.quality !== 'rare') return { ok: false, reason: 'Carte magique ou rare' };
        set('normal');
        break;
      case 'catalyst':
        if (it.quality !== 'magic' && it.quality !== 'rare') return { ok: false, reason: 'Carte magique ou rare' };
        if (m0.catalyst) return { ok: false, reason: 'Carte déjà infusée' };
        m0.catalyst = true;
        break;
      case 'heroes':
        if (it.quality === 'normal' && !MAP_ZONE_BY_ID[m0.zone]?.unique) return { ok: false, reason: 'Carte magique, rare ou unique' };
        if (m0.heroic) return { ok: false, reason: 'Carte déjà héroïque' };
        m0.heroic = true;
        break;
      case 'fortification':
        if (it.quality === 'normal' || m0.fortified) return { ok: false, reason: 'Carte magique ou rare non fortifiée' };
        m0.fortified = true;
        break;
    }
    return { ok: true, item: it };
  }
  if (e.kind === 'mapCombine') {
    if (items.length !== 3 || !items.every((x) => (x.map as MapInfo)?.tier === m0.tier)) return { ok: false, reason: 'Trois cartes du même palier' };
    if (e.upgrade && m0.tier >= 3) return { ok: false, reason: 'Paliers 1 et 2 seulement' };
    const tier = e.upgrade ? m0.tier + 1 : m0.tier;
    return { ok: true, item: makeMap(rng, tier, 'normal'), note: e.upgrade ? `palier ${tier}` : undefined };
  }
  if (e.kind === 'mapScarab') {
    if (m0.tier !== 3) return { ok: false, reason: 'Carte de palier 3' };
    return { ok: true, item: makeMap(rng, 4, 'rare'), note: 'donjon' };
  }
  return { ok: false, reason: 'Recette inconnue' };
}

/** Modificateurs possibles de la corruption d'une carte : id, valeur par palier, texte */
const CORRUPT_MAP_OPTS: [string, [number, number, number], string][] = [
  ['monsterLife', [10, 20, 30], 'monstres +{v} % de vie'],
  ['playerResAll', [3, 4, 5], 'joueur −{v} % de résistance maximale'],
  ['mfBonus', [50, 75, 100], '+{v} % MF et or'],
  ['itemQuantity', [30, 40, 50], '+{v} % d’objets'],
  ['zoneLevel', [1, 1, 1], '+1 niveau de zone'],
  ['xpBonus', [8, 10, 12], '+{v} % d’expérience'],
];

/** Texte lisible du modificateur de corruption d'une carte */
export function corruptModText(c: { id: string; value: number }): string {
  const o = CORRUPT_MAP_OPTS.find((x) => x[0] === c.id);
  return o ? o[2].replace('{v}', String(c.value)) : `${c.id} ${c.value}`;
}

/** Corruption d'une carte (§5.4) : toujours un modificateur */
export function corruptMap(rng: Rng, it: Item): string {
  const m = it.map as MapInfo;
  const opts = CORRUPT_MAP_OPTS;
  const [id, vals, text] = rng.pick(opts);
  const v = vals[Math.min(2, m.tier - 1)];
  m.corruptMod = { id, value: v };
  it.corrupted = { outcome: 'mod', mods: [] };
  return text.replace('{v}', String(v));
}

const WEAPON_TYPES = ['sword', 'axe', 'mace', 'dagger', 'staff', 'wand', 'spear', 'polearm', 'bow'];
const ARMOR_TYPES = ['armor', 'helm', 'shield', 'gloves', 'boots', 'belt', 'pelt', 'circlet'];

/** Affixes « du Forgeron » / « de l'Armurier » : chance par monstre d'une arme / armure magique de plus (bases exceptionnelles ou élites) */
export function mapExtraGearDrops(rng: Rng, mods: { id: string; value: number }[], ilvl: number): Item[] {
  const out: Item[] = [];
  for (const [mod, types] of [
    ['extraWeapon', WEAPON_TYPES],
    ['extraArmor', ARMOR_TYPES],
  ] as const) {
    const chance = mods.filter((m) => m.id === mod).reduce((a, m) => a + m.value, 0);
    if (chance <= 0 || !rng.chance(chance / 100)) continue;
    const pool = BASES.filter((b) => types.includes(b.type) && b.tier >= 1 && b.reqLvl <= ilvl && lootBaseAllowed(b));
    if (pool.length) out.push(generateItem(rng, rng.pick(pool).id, ilvl, { forceQuality: 'magic' }));
  }
  return out;
}

/** Invasion de héros corrompus : deux objets rares (arme ou pièce d'armure, bases exceptionnelles ou élites) par envahisseur */
export function heroInvaderDrops(rng: Rng, ilvl: number): Item[] {
  const out: Item[] = [];
  const pool = BASES.filter((b) => [...WEAPON_TYPES, ...ARMOR_TYPES].includes(b.type) && b.tier >= 1 && b.reqLvl <= ilvl && lootBaseAllowed(b));
  for (let i = 0; i < 2 && pool.length; i++) out.push(generateItem(rng, rng.pick(pool).id, ilvl, { forceQuality: 'rare' }));
  return out;
}
