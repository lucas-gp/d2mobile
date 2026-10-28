/**
 * Résolution des classes de trésor à la mort d'un monstre (D2 1.13, data/treasure.ts) :
 * picks, NoDrop recalculé pour le nombre de joueurs du jeu de règles (règle `loot.noDropPlayers`), récursion, bonus de qualité hérités
 * (max rencontré), promotion de TC par niveau de monstre, maximum 6 objets par événement. Un mod ajoute ses références (`loot.ref`) et
 * son butin en plus (`loot.monsterDrops`).
 */
import { RULES } from '../../mods/rules';
import { Rng as RngClass, type Rng } from '../../core/rng';
import { BASES, BASE_BY_ID } from '../../data/items/bases';
import { lootBaseAllowed } from './itemgen';
import '../../data/items/index';
import { RUNES } from '../../data/items/runes';
import { GOOD_GEMS, GOOD_TC, JEWELRY_TC, MAX_DROPS_PER_EVENT, MONSTER_TC, RUNE_TC_RECURSION, RUNES17_RECURSION, RUNES17_ZOD, ZONE_RUNE_TC, noDropFor, type TcEntry } from '../../data/treasure';
import { RATES } from '../../data/rates';
import type { Difficulty, ItemBase } from '../../data/types';
import { TYPE_GROUPS } from '../../data/types';
import type { Monster } from '../actors';
import type { World } from '../world';
import { generateItem, makeStack, NO_BONUS, rollQuality, type QualityBonus } from './itemgen';
import { SET_ITEMS } from '../../data/items/sets';
import { UNIQUES, UNIQUE_BY_ID } from '../../data/items/uniques';
import type { Item } from '../item';
import { mercFindBonus } from '../merc-core';

export interface DropContext {
  rng: Rng;
  /** Niveau d'objet (= mlvl) */
  ilvl: number;
  mf: number;
  difficulty: Difficulty;
  /** Clé de zone pour le TC de runes */
  zoneKey: string;
  /** Palier de map (0 hors map) */
  mapTier: number;
  /** Bonus de qualité hérités */
  bonus: QualityBonus;
  /** Or trouvé bonus (%) */
  gf: number;
  /** Multiplicateur de quantité de butin (maps) */
  quantity: number;
}

/* ------------------------------------------------------------------ */
/* Équipement : weapN / armoN                                           */
/* ------------------------------------------------------------------ */

const WEAPON_TYPES = new Set(TYPE_GROUPS.weapon);
const JEWELRY_OR_CHARM = new Set(['amulet', 'ring', 'smallcharm', 'largecharm', 'grandcharm', 'jewel']);

function equipPool(): { weapons: ItemBase[]; armors: ItemBase[] } {
  const weapons: ItemBase[] = [];
  const armors: ItemBase[] = [];
  for (const b of BASES) {
    if (b.noRandomDrop || !b.slot) continue;
    if (JEWELRY_OR_CHARM.has(b.type)) continue;
    if (WEAPON_TYPES.has(b.type)) weapons.push(b);
    else armors.push(b);
  }
  return { weapons, armors };
}

let POOL: { weapons: ItemBase[]; armors: ItemBase[] } | null = null;

/**
 * Tirage d'une base d'équipement dans la chaîne « Equip » : l'enchaînement weapN/armoN →
 * Equip(N−3) de D2 donne une distribution quasi uniforme sur les bases de qlvl ≤ niveau,
 * légèrement favorable aux bases du dernier palier. Armes : armures = 2 : 1.
 */
export function pickEquipBase(rng: Rng, level: number, kind?: 'weapon' | 'armor'): ItemBase | null {
  POOL ??= equipPool();
  const top = Math.floor(level / 3) * 3;
  // lot 321: `kind` a weapon or an armour only (Diablo II's weapon rack and armour stand), without the draw between them
  const useWeapon = kind ? kind === 'weapon' : rng.chance(2 / 3);
  // objets d'une autre classe exclus (orbes pour le Druide, peaux pour la Sorcière)
  const list = (useWeapon ? POOL.weapons : POOL.armors).filter((b) => b.qlvl <= Math.max(3, top) && lootBaseAllowed(b));
  if (list.length === 0) return null;
  return rng.weighted(list, (b) => b.rarity * (b.qlvl > top - 3 ? 1.6 : 1)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Runes                                                                */
/* ------------------------------------------------------------------ */

/** Tire une rune dans le TC « Runes N » (récursion 1.13), avec les réglages de rates.ts. */
export function pickRune(rng: Rng, n: number): string {
  let level = Math.max(1, Math.min(17, n));
  for (;;) {
    if (level === 17) {
      // Zod : 1 contre 5170 vers Runes 16 ; le biais « rune haute » divise la récursion
      const rec = RUNES17_RECURSION / RATES.highRuneBias;
      if (rng.next() * (RUNES17_ZOD + rec) < RUNES17_ZOD) return RUNES[32].id;
      level = 16;
      continue;
    }
    const a = RUNES[2 * level - 2];
    const b = RUNES[2 * level - 1];
    const rec = (RUNE_TC_RECURSION[level - 1] ?? 0) / (level >= 13 ? RATES.highRuneBias : 1);
    const total = 3 + 2 + rec;
    const r = rng.next() * total;
    if (r < 3) return a.id;
    if (r < 5) return b.id;
    level--;
    if (level < 1) return RUNES[0].id;
  }
}

/* ------------------------------------------------------------------ */
/* Résolution                                                           */
/* ------------------------------------------------------------------ */

function maxBonus(a: QualityBonus, b?: QualityBonus): QualityBonus {
  if (!b) return a;
  return { unique: Math.max(a.unique, b.unique), set: Math.max(a.set, b.set), rare: Math.max(a.rare, b.rare), magic: Math.max(a.magic, b.magic) };
}

/** Résout une référence de TC ; pousse les objets obtenus dans `out`. */
function resolve(ctx: DropContext, ref: string, out: Item[], bonus: QualityBonus, depth = 0): void {
  if (depth > 20 || out.length >= MAX_DROPS_PER_EVENT) return;
  const rng = ctx.rng;
  const tc = MONSTER_TC[ref];
  if (tc) {
    const b = maxBonus(bonus, tc.mods);
    if (tc.picks < 0) {
      for (const e of tc.entries) for (let i = 0; i < e.weight; i++) resolve(ctx, e.ref, out, b, depth + 1);
      return;
    }
    const sum = tc.entries.reduce((s, e) => s + weightOf(e), 0);
    const nd = Math.floor(noDropFor(tc.noDrop, sum, RULES['loot.noDropPlayers']()) * RATES.noDrop);
    for (let i = 0; i < tc.picks; i++) {
      const r = rng.next() * (sum + nd);
      if (r < nd) continue;
      let acc = nd;
      for (const e of tc.entries) {
        acc += weightOf(e);
        if (r < acc) {
          resolve(ctx, e.ref, out, b, depth + 1);
          break;
        }
      }
    }
    return;
  }
  if (ref.startsWith('runes:')) {
    out.push(makeStack(rng, pickRune(rng, Number(ref.slice(6))), 1));
    return;
  }
  // unique nommé d'une TC (D2 : Annihilus du Clone de Diablo, TC « ROP ») ; inconnu du jeu de règles : rien
  if (ref.startsWith('unique:')) {
    const u = UNIQUE_BY_ID[ref.slice(7)];
    if (u) out.push(generateItem(rng, u.base, ctx.ilvl, { mf: ctx.mf, bonus, forceUniqueId: u.id }));
    return;
  }
  // références propres au jeu de règles (mod pd2 : « junk » et « misc » de PD2)
  if (RULES['loot.ref'](ctx, ref, out, bonus, depth, resolve)) return;
  switch (ref) {
    case 'gold':
    case 'gold125':
    case 'gold150':
    case 'gold200': {
      const mul = ref === 'gold125' ? 1.25 : ref === 'gold150' ? 1.5 : ref === 'gold200' ? 2 : 1;
      // début de partie plus généreux (D2 : les premiers niveaux rapportent de quoi s'équiper et recruter dès l'acte I)
      const early = 1 + Math.max(0, 25 - ctx.ilvl) / 25;
      const qty = Math.max(1, Math.floor(ctx.ilvl * rng.float(1, 4) * mul * RATES.gold * early * (1 + ctx.gf / 100)));
      out.push(makeStack(rng, 'gold', qty));
      return;
    }
    case 'equip':
    case 'equip_magic': {
      const base = pickEquipBase(rng, ctx.ilvl);
      if (!base) return;
      const bb = ref === 'equip_magic' ? maxBonus(bonus, { unique: 0, set: 0, rare: 0, magic: 1024 }) : bonus;
      out.push(generateItem(rng, base.id, ctx.ilvl, { mf: ctx.mf, bonus: bb, rollEthereal: true }));
      return;
    }
    case 'potion': {
      const roll = rng.next();
      const kind = roll < 0.05 ? 'rejuv_potion' : roll < 0.55 ? 'hp_potion' : 'mp_potion';
      const it = makeStack(rng, kind, 1);
      // lot 316: its item level kept (the tier is read from it, src/sim/potion-tier.ts)
      it.ilvl = Math.max(1, ctx.ilvl);
      // potions de jet : 3 % des potions tombées, base choisie selon le niveau (qlvl). Tirage sur une graine dérivée du jet,
      // pour ne pas décaler le flux aléatoire du butin (les bots y sont sensibles).
      if (roll >= 0.97) {
        const side = new RngClass(Math.floor(roll * 1e9));
        const pool = BASES.filter((b) => b.type === 'tpot' && !b.noRandomDrop && b.qlvl <= ctx.ilvl);
        const tb = pool.length ? side.weighted(pool, (x) => 1 + x.qlvl / 8) : BASE_BY_ID.fulminating_potion;
        if (tb) {
          it.base = tb.id;
          it.ilvl = 1;
          it.qty = side.range(1, 3);
        }
      }
      out.push(it);
      return;
    }
    case 'good': {
      const runeW = GOOD_TC.runes * RATES.runes;
      const gemW = GOOD_TC.gems * RATES.gems;
      const jewW = GOOD_TC.jewelry * RATES.charms;
      const r = rng.next() * (runeW + gemW + jewW);
      if (r < runeW) {
        const tcN = (ZONE_RUNE_TC[ctx.zoneKey] ?? ZONE_RUNE_TC.tristram)[ctx.difficulty];
        out.push(makeStack(rng, pickRune(rng, tcN + (ctx.mapTier > 0 ? 0 : 0)), 1));
      } else if (r < runeW + gemW) {
        const grade = rng.weightedIndex(GOOD_GEMS[ctx.difficulty]);
        const kinds = ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull'];
        out.push(makeStack(rng, `gem_${rng.pick(kinds)}_${Math.max(0, grade)}`, 1));
      } else {
        const e = rng.weighted(JEWELRY_TC, (x) => x.weight);
        if (e) out.push(generateItem(rng, e.ref, ctx.ilvl, { mf: ctx.mf, bonus }));
      }
      return;
    }
    default: {
      // objet précis : empilable (clé, essence, potion de jet) ou équipement ; `d2:…` (objet D2 absent du jeu) : rien
      const b = BASE_BY_ID[ref];
      if (!b) return;
      if (b.type === 'currency' || b.type === 'tpot') out.push(makeStack(rng, ref, 1));
      else out.push(generateItem(rng, ref, ctx.ilvl, { mf: ctx.mf, bonus, rollEthereal: true }));
    }
  }
}

function weightOf(e: TcEntry): number {
  return e.ref === 'good' ? e.weight * RATES.good : e.weight;
}

/** Résout un TC de rang et renvoie la liste des objets (hors potions inutiles gérées par le filtre). */
export function rollTc(ctx: DropContext, tcId: string): Item[] {
  const out: Item[] = [];
  const rolls = Math.max(1, Math.round(ctx.quantity));
  for (let i = 0; i < rolls; i++) resolve(ctx, tcId, out, ctx.bonus);
  // quantité fractionnaire (maps) : tirage supplémentaire probabiliste
  const frac = ctx.quantity - Math.floor(ctx.quantity);
  if (frac > 0 && ctx.rng.chance(frac)) resolve(ctx, tcId, out, ctx.bonus);
  return out;
}

/**
 * TC d'un monstre tué : boss : sa TC propre (clé `<identifiant><difficulté>` : D2, MonStats), sinon celle de son champ `tc`, sinon la TC
 * générique des boss ; les autres : TC de leur rang.
 */
function monsterTcId(m: Monster, difficulty: Difficulty = 2): string {
  if (m.rank === 'boss') {
    const own = `${m.def.id}${difficulty}`;
    if (Object.hasOwn(MONSTER_TC, own)) return own;
    return m.def.tc ? `${m.def.tc}${difficulty}` : 'boss';
  }
  if (m.rank === 'unique') return 'unique';
  if (m.rank === 'champion') return 'champion';
  return m.def.ai === 'caster' ? 'caster' : 'normal';
}

/**
 * Butin d'un boss de carte (mods/pd2/sim/map-boss.ts), à la place du TC d'unique : par palier (1-3 ; 4 : donjon), `items` pièces
 * d'équipement garanties, au moins magiques, la première au moins rare (qualité tirée comme un monstre ordinaire avec la
 * découverte d'objets du joueur : un unique ou un ensemble y reste possible), `uniqueSet` chance d'un unique ou d'un objet
 * d'ensemble de plus sur une base au hasard (élites comprises), `rune` chance d'une rune du TC des cartes (« Runes 17 »,
 * biais `highRuneBias`), une gemme taillée ou parfaite, deux tas d'or, deux potions. Les cartes, orbes, éclats, charme de
 * brisure et récompenses des cartes uniques viennent en plus (RunState.extraDrops, inchangés).
 * Réglage : le butin des boss par heure retrouve le niveau d'avant le doublement des cartes (2,6 fois moins de boss par heure)
 * sans peser sur le total par heure (docs/internal/audit/map-boss-kits.md).
 */
export const MAP_BOSS_LOOT = {
  items: { 1: 3, 2: 3, 3: 4, 4: 5 } as Record<number, number>,
  uniqueSet: { 1: 0.3, 2: 0.35, 3: 0.45, 4: 1 } as Record<number, number>,
  rune: { 1: 0.6, 2: 0.7, 3: 0.85, 4: 1 } as Record<number, number>,
};

function mapBossDrops(ctx: DropContext, tier: number): Item[] {
  const rng = ctx.rng;
  const t = Math.max(1, Math.min(4, tier));
  const out: Item[] = [];
  const n = Math.max(1, Math.round(MAP_BOSS_LOOT.items[t] * ctx.quantity));
  for (let i = 0; i < n; i++) {
    const base = pickEquipBase(rng, ctx.ilvl);
    if (!base) continue;
    let q = rollQuality(rng, base, ctx.ilvl, ctx.mf, NO_BONUS);
    if (q === 'normal' || q === 'superior') q = 'magic';
    // la première pièce au moins rare (un ensemble impossible sur cette base redevient magique : on retire en rare)
    if (i === 0 && q === 'magic') q = 'rare';
    let it = generateItem(rng, base.id, ctx.ilvl, { forceQuality: q, rollEthereal: true });
    if (i === 0 && it.quality === 'magic') it = generateItem(rng, base.id, ctx.ilvl, { forceQuality: 'rare', rollEthereal: true });
    out.push(it);
  }
  if (rng.chance(MAP_BOSS_LOOT.uniqueSet[t])) {
    const set = rng.chance(0.4);
    const pool = set
      ? SET_ITEMS.filter((x) => x.lvl <= ctx.ilvl && BASE_BY_ID[x.base] && lootBaseAllowed(BASE_BY_ID[x.base]))
      : UNIQUES.filter((x) => !x.noRandomDrop && x.lvl <= ctx.ilvl && BASE_BY_ID[x.base] && lootBaseAllowed(BASE_BY_ID[x.base]));
    const u = rng.weighted(pool, (x) => x.rarity);
    if (u) out.push(generateItem(rng, u.base, ctx.ilvl, set ? { forceSetId: u.id } : { forceUniqueId: u.id }));
  }
  if (rng.chance(MAP_BOSS_LOOT.rune[t])) out.push(makeStack(rng, pickRune(rng, (ZONE_RUNE_TC.map ?? ZONE_RUNE_TC.tristram)[ctx.difficulty]), 1));
  const kinds = ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst', 'skull'];
  out.push(makeStack(rng, `gem_${rng.pick(kinds)}_${rng.chance(0.3) ? 4 : 3}`, 1));
  // or et potions tirés à part (resolve s'arrête à MAX_DROPS_PER_EVENT objets)
  for (const ref of ['gold200', 'gold200', 'potion', 'potion']) {
    const one: Item[] = [];
    resolve(ctx, ref, one, NO_BONUS, 0);
    out.push(...one);
  }
  return out;
}

/** Butin d'un monstre tué dans le monde courant */
export function rollMonsterDrops(w: World, m: Monster): Item[] {
  let quantity = 1;
  let mfBonus = 0;
  for (const mod of w.mapMods) {
    if (mod.id === 'itemQuantity') quantity += mod.value / 100;
    if (mod.id === 'mfBonus') mfBonus += mod.value;
  }
  // victime du mercenaire : sa découverte d'objets et d'or s'ajoute à celle du joueur (D2 : celle du sbire et de son propriétaire, D2MOO ITEMS)
  const merc = mercFindBonus(w, m);
  const ctx: DropContext = {
    rng: w.rng.loot,
    ilvl: m.mlvl,
    mf: w.player.d.mf + mfBonus + merc.mf,
    difficulty: w.difficulty,
    zoneKey: w.run?.zoneKey ?? 'tristram',
    mapTier: w.run?.mapTier ?? 0,
    bonus: NO_BONUS,
    gf: w.player.d.gf + merc.gf,
    quantity: m.rank === 'boss' ? quantity * (w.run?.bossLootMul ?? 1) : quantity,
  };
  // boss de carte : butin de boss (tout tombe, sans plafond d'objets par événement)
  const items = m.mapBoss ? mapBossDrops(ctx, m.mapBoss.tier) : rollTc(ctx, monsterTcId(m, w.difficulty));
  if (w.run) items.push(...w.run.extraDrops(w, m));
  // butin propre au jeu de règles (mod pd2 : pièce d'énigme de Larzuk)
  RULES['loot.monsterDrops'](w, m, items);
  if (w.mapMods.length) items.push(...RULES['maps.worldModDrops'](w.rng.loot, w.mapMods, m.mlvl));
  return m.mapBoss ? items : items.slice(0, MAX_DROPS_PER_EVENT + 4);
}
