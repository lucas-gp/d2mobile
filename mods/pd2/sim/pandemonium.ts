// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Taux du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Butin PD2 hors des cartes, branché sur les règles du jeu (lot M6d ; code autrefois dans src/sim/runs.ts et src/sim/loot/drops.ts, appelé
 * aux mêmes endroits, dans le même ordre) : éclats de Pierre-Monde des zones corrompues, objets du Pandémonium (clés d'uber, essences,
 * organes, Torche, Annihilus et exclusivités, accès d'ultimes et leurs ingrédients : règle `runs.extraDrops`), tables « junk » et « misc »
 * de PD2 (`loot.ref`), NoDrop de PD2 (`loot.noDropPlayers`), pièce d'énigme de Larzuk (`loot.monsterDrops`). Dans la base (Diablo II), clés,
 * essences et organes viennent des TC des boss (src/data/treasure.ts).
 */
import type { ModApi } from '../../../src/mods/api';
import { generateItem, makeStack, MAP_DENSITY_DROP_DIV, RATES, Rng, UNIQUE_BY_ID, type Item, type Monster, type World } from '../../../src/mods/sdk';
import { DCLONE_EXCLUSIVES, RATHMA_EXCLUSIVES } from '../data/items/uniques';
import { JUNK_TC, MISC_TC, NODROP_PLAYERS } from '../data/treasure';

/** Taux PD2 (page Recipes : Portals, Essences, Uber Access) */
export const PANDEMONIUM_RATES = {
  /** Clés d'uber, en Enfer : Comtesse 1:14, Blood Raven 1:9, Invocateur 1:8, Bloodwitch 1:9, Nihlathak 1:8, Izual 1:9 */
  keys: { countess: 1 / 14, bloodraven: 1 / 9, summoner: 1 / 8, bloodwitch: 1 / 9, nihlathak: 1 / 8, izual: 1 / 9 },
  /** Essences, en Cauchemar et en Enfer : Andariel ~16,1 %, Duriel ~21,3 %, Méphisto / Diablo / Baal ~8,3 % */
  /** Âme du Mal primordial, en Enfer : Diablo 1:21, Baal 1:13, Méphisto ~1:15 (inconnu sur le wiki) */
  souls: { diablo: 1 / 21, baal: 1 / 13, mephisto: 1 / 15 },
  /** Mâchoire de Trang-Oul : morts-vivants d'Enfer 1:22 500 ; Essence démoniaque pure : boss de carte ~2 % */
  jawbone: 1 / 22500,
  pureEssence: 0.02,
  /** Sceaux des Anciens : monstres de carte, 1:6400 (palier 1 : Madawc, 2 : Talic, 3 : Korlic) */
  sigil: 1 / 6400,
  /** Ingrédients de l'Ombre de la haine (taux inconnus sur le wiki : estimations) */
  insignia: 1 / 400,
  transgression: 1 / 600,
  malic: 1 / 1500,
  essences: { andariel: 0.161, duriel: 0.213, mephisto: 0.083, diablo: 0.083, baal: 0.083 },
} as const;

const KEY_OF: Record<keyof typeof PANDEMONIUM_RATES.keys, string> = {
  countess: 'key_terror',
  bloodraven: 'key_terror',
  summoner: 'key_hate',
  bloodwitch: 'key_hate',
  nihlathak: 'key_destruction',
  izual: 'key_destruction',
};
const ESSENCE_OF: Record<keyof typeof PANDEMONIUM_RATES.essences, string> = {
  andariel: 'essence_twisted',
  duriel: 'essence_twisted',
  mephisto: 'essence_charged',
  diablo: 'essence_burning',
  baal: 'essence_festering',
};

/** Détenteur de clé : boss par identifiant, super-uniques (modèles génériques) par nom */
function keyHolder(m: Monster): keyof typeof PANDEMONIUM_RATES.keys | null {
  if (m.rank !== 'boss' && m.rank !== 'unique') return null;
  const id = m.def.id;
  if (id === 'countess' || id === 'summoner' || id === 'nihlathak' || id === 'izual') return id;
  const name = m.name ?? '';
  if (name === 'Blood Raven') return 'bloodraven';
  if (name.startsWith('Bloodwitch')) return 'bloodwitch';
  return null;
}

/** Niveau de difficulté (0-2) de l'objet d'accès d'un ultime, fixé au Cube */
function uberLevel(w: World, item: string): number {
  return w.character.progression.milestones[`uberdiff:${item}`] ?? 0;
}

const RED_ZONES = new Set(['a5_abaddon', 'a5_acheron', 'a5_infernal']);

/** Ingrédients des accès d'ultimes qui tombent dans le monde : Âme, Mâchoire, Essence pure, Sceaux, Insigne, Talisman, Chair */
function endgameIngredients(w: World, m: Monster, difficulty: number): Item[] {
  const rng = w.rng.loot;
  const stack = (id: string, p: number): Item[] => (rng.chance(p) ? [makeStack(rng, id, 1)] : []);
  const R = PANDEMONIUM_RATES;
  const out: Item[] = [];
  if (m.rank === 'boss' && difficulty === 2 && Object.prototype.hasOwnProperty.call(R.souls, m.def.id)) out.push(...stack('prime_evil_soul', R.souls[m.def.id as keyof typeof R.souls]));
  if (difficulty === 2 && m.def.family === 'undead') out.push(...stack('jawbone_trang', R.jawbone));
  if (difficulty === 2 && m.def.family.startsWith('demon') && m.rank !== 'boss') out.push(...stack('flesh_malic', R.malic));
  if (difficulty === 2 && RED_ZONES.has(w.zone.id)) out.push(...stack('demonic_insignia', R.insignia));
  if (w.mapMods.some((x) => x.id === 'corrupted')) out.push(...stack('talisman_transgression', R.transgression));
  return out;
}

/**
 * Objets du Pandémonium (PD2) : clés d'uber sur six boss d'Enfer, essences sur les boss d'acte dès
 * Cauchemar, organes sur les trois mini-ubers (Lilith : corne, Duriel ultime : œil, Izual ultime :
 * cervelle), Torche du feu de l'enfer sur le dernier mal primordial de Tristram, Annihilus sur le
 * Clone de Diablo seulement.
 */
function pandemoniumCore(w: World, m: Monster, difficulty: number): Item[] {
  const rng = w.rng.loot;
  const stack = (id: string, p: number): Item[] => (rng.chance(p) ? [makeStack(rng, id, 1)] : []);
  const holder = keyHolder(m);
  if (holder) return difficulty === 2 ? stack(KEY_OF[holder], PANDEMONIUM_RATES.keys[holder]) : [];
  if (m.rank !== 'boss') return [];
  const id = m.def.id;
  if (Object.prototype.hasOwnProperty.call(ESSENCE_OF, id)) {
    const k = id as keyof typeof ESSENCE_OF;
    return difficulty >= 1 ? stack(ESSENCE_OF[k], PANDEMONIUM_RATES.essences[k]) : [];
  }
  switch (id) {
    case 'lilith':
      return stack('organ_horn', 1);
    case 'uber_duriel':
      return stack('organ_eye', 1);
    case 'uber_izual':
      return stack('organ_brain', 1);
    case 'uber_mephisto':
    case 'uber_diablo':
    case 'uber_baal': {
      // le dernier des trois à tomber lâche la Torche (PD2 : avec la Pierre d'âme noire, absente ici)
      const others = w.monsters.some((o) => o !== m && !o.dead && (o.def.id === 'uber_mephisto' || o.def.id === 'uber_diablo' || o.def.id === 'uber_baal'));
      const pending = w.pendingSpawns.some((p) => ['uber_mephisto', 'uber_diablo', 'uber_baal'].includes(w.zone.spawns[p.idx]?.monster ?? ''));
      if (others || pending) return [];
      // PD2 : la Pierre d'âme noire tombe avec la Torche ; les Cendres (version empilable de la Torche) ici une fois sur deux
      return [generateItem(rng, 'large_charm', 99, { forceUniqueId: 'u_hellfire_torch' }), makeStack(rng, 'black_soulstone', 1), ...stack('hellfire_ashes', 0.5)];
    }
    case 'dclone': {
      const out = [generateItem(rng, 'small_charm', 90, { forceUniqueId: 'u_annihilus' })];
      // PD2 : Vision de la terreur renforcée (niveau 1 ou 2) → 1/200 d'une exclusivité (1/120 au niveau 2)
      const lvl = uberLevel(w, 'vision_terror');
      if (lvl >= 1 && rng.chance(lvl >= 2 ? 1 / 120 : 1 / 200)) {
        const u = UNIQUE_BY_ID[rng.pick(DCLONE_EXCLUSIVES)];
        out.push(generateItem(rng, u.base, 90, { forceUniqueId: u.id }));
      }
      return out;
    }
    case 'uber_talic':
    case 'uber_madawc':
    case 'uber_korlic': {
      // Étendard des Héros : 1 sur le premier Ancien tombé, puis 1 chance de plus par Ancien abattu (PD2)
      const dead = ['uber_talic', 'uber_madawc', 'uber_korlic'].filter((a) => !w.monsters.some((o) => o !== m && !o.dead && o.def.id === a)).length;
      return stack('standard_heroes', dead >= 3 ? 1 : dead === 2 ? 0.5 : 0.34);
    }
    case 'rathma':
    case 'mendeln': {
      const other = w.monsters.some((o) => o !== m && !o.dead && (o.def.id === 'rathma' || o.def.id === 'mendeln'));
      if (other) return [];
      const lvl = uberLevel(w, 'voidstone');
      const out = [makeStack(rng, 'tainted_shard', 1)];
      if (lvl >= 1 && rng.chance(lvl >= 2 ? 1 / 120 : 1 / 200)) {
        const u = UNIQUE_BY_ID[rng.pick(RATHMA_EXCLUSIVES)];
        out.push(generateItem(rng, u.base, 90, { forceUniqueId: u.id }));
      }
      return out;
    }
    case 'lucion':
      return [makeStack(rng, 'desecration_token', 1)];
    default:
      return [];
  }
}

/** Objets du Pandémonium : clés, essences, organes, accès d'ultimes et ingrédients */
function pandemoniumDrops(w: World, m: Monster, difficulty: number): Item[] {
  return [...pandemoniumCore(w, m, difficulty), ...endgameIngredients(w, m, difficulty)];
}

/** Butin en plus hors des cartes : éclats des zones corrompues, puis objets du Pandémonium (une clé n'empêche pas une carte) */
function extraDrops(w: World, m: Monster, difficulty: number): Item[] {
  const out: Item[] = [];
  // zone corrompue : éclats de Pierre-Monde (utilisés pour corrompre les objets au Cube)
  if (w.mapMods.some((x) => x.id === 'corrupted')) {
    const p = m.runBoss ? 0.7 : m.rank === 'boss' ? 0.4 : m.rank === 'unique' ? 0.06 : m.rank === 'champion' ? 0.02 : 0.0015;
    if (w.rng.loot.chance(p)) out.push(makeStack(w.rng.loot, 'worldstone_shard', 1));
  }
  out.push(...pandemoniumDrops(w, m, difficulty));
  return out;
}

/** Branche le butin PD2 hors des cartes sur les règles du jeu */
export function registerLoot(api: ModApi): void {
  const r = api.rules;
  r.set('runs.extraDrops', () => extraDrops);
  r.set('loot.noDropPlayers', () => () => NODROP_PLAYERS);
  // « junk » : potions et objets divers PD2 ; « misc » : clé, éclats de Pierre-Monde (Enfer et cartes seulement), pièces d'énigme
  r.set('loot.ref', () => (ctx, ref, out, bonus, depth, resolve) => {
    const rng = ctx.rng;
    if (ref === 'junk') {
      const e = rng.weighted(JUNK_TC, (x) => x.weight);
      if (e) resolve(ctx, e.ref, out, bonus, depth + 1);
      return true;
    }
    if (ref !== 'misc') return false;
    const e = rng.weighted(MISC_TC, (x) => x.weight);
    if (!e) return true;
    if (e.ref === 'worldstone_shard' && ctx.difficulty < 2 && ctx.mapTier === 0) return true; // Enfer et maps seulement
    // cartes denses : autant d'éclats par carte qu'avant (constants.ts, MAP_DENSITY_DROP_DIV)
    if (e.ref === 'worldstone_shard' && ctx.mapTier > 0 && !rng.chance(1 / MAP_DENSITY_DROP_DIV)) return true;
    out.push(makeStack(rng, e.ref, 1));
    return true;
  });
  // pièce d'énigme de Larzuk : boss de carte, ou boss de la campagne en Enfer (moitié moins) ; tirage à part (le flux de butin principal n'est pas modifié)
  r.set('loot.monsterDrops', () => (w, m, items) => {
    const campaignBoss = !m.mapBoss && m.rank === 'boss' && w.difficulty === 2 && !w.run?.mapTier;
    const pr = new Rng(`puzzle:${w.seed}:${m.id}`);
    if (m.mapBoss || campaignBoss) {
      if (pr.chance(RATES.puzzle * (m.mapBoss ? 1 : 0.5))) items.push(makeStack(pr, 'puzzlepiece', 1));
    } else if (m.rank !== 'boss' && !m.isSummon && pr.chance(RATES.puzzleMob)) {
      // monstre ordinaire : ajout au butin habituel (la table « divers » en lâche déjà ~0,17 %)
      items.push(makeStack(pr, 'puzzlepiece', 1));
    }
  });
}
