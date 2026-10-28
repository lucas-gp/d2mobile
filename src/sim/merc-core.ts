/**
 * Mercenaire : statistiques dérivées (type, équipement, auras, niveaux de compétence), requêtes de
 * position et d'auras utilisées par le combat, le butin et les compétences. Partie sans dépendance
 * à l'IA du mercenaire (merc.ts) pour éviter les cycles d'imports.
 */
import { quiverFits } from '../data/items/quivers';
import { MERC_BY_ID, mercBaseStats, mercSkillLevel, mercSlotFor, mercSlots, mercVariant, type MercId, type MercSkillId, type MercSlot, type MercType, type MercVariant } from '../data/mercs';
import { RULES } from '../mods/rules';
import { RES_PENALTY } from '../data/curves';
import { SKILL_BY_ID, lin, type Lin } from '../data/skills';
import type { Element } from '../data/stats';
import type { Item } from './item';
import { baseOf, itemFinal, setBonuses } from './itemstats';
import type { CharacterState } from './character-state';
import type { Difficulty } from '../data/types';
import { type Monster } from './actors';
import type { World } from './world';
import { isBroken } from './durability';
import { TERRAIN_RADIUS } from './constants';
import { dist } from '../core/math';

export interface MercDerived {
  lvl: number;
  str: number;
  dex: number;
  lifeMax: number;
  defense: number;
  res: Record<Element, number>;
  /** Dégâts physiques bruts de l'arme (arme ×2 à une main pour Désert/Barbare, + dégâts de base PD2) */
  raw: [number, number];
  /** Bonus de dégâts % (force ou dextérité, Puissance, Concentration) */
  dmgPct: number;
  /** Dégâts physiques par coup (attaque de base) */
  dmg: [number, number];
  /** Dégâts élémentaires ajoutés (objets) */
  added: Partial<Record<'fire' | 'cold' | 'light' | 'magic' | 'poison', [number, number]>>;
  /** Sort principal des lanceurs de sorts (estimation affichée, IA du bot) */
  spell: [number, number];
  ar: number;
  atkTicks: number;
  lifeLeech: number;
  crush: number;
  deadly: number;
  /** +compétences des objets (niveaux « mous ») */
  allSkills: number;
  /** Niveau de la compétence principale (affichage) */
  skillLvl: number;
  /** Auras actives (sous-type + objets portés) */
  auras: { id: string; level: number }[];
  /** Maîtrise (Loup de fer, Ascendant) : vie regagnée à chaque monstre tué */
  lifePerKill: number;
  /** Maîtrise élémentaire (% de dégâts des sorts de l'élément) */
  mastery: number;
  /** Régénération (Ascendant : Replenish Life de la maîtrise), PV par seconde */
  regen: number;
  /** Chance de perforation des flèches (Éclaireuse : 66 % innés) */
  pierce: number;
  /** Pénétration des résistances ennemies (carquois : résistance physique des flèches/carreaux) */
  pierceRes: Partial<Record<Element, number>>;
  mf: number;
  gf: number;
}

export function mercType(c: CharacterState): MercType | null {
  if (!c.merc) return null;
  const t = MERC_BY_ID[c.merc.type];
  if (t) return t;
  // type d'une ancienne sauvegarde absent du jeu de règles : remplacé une fois pour toutes (modèle : Ascendant → Loup de fer en D2)
  const alias = RULES['merc.model']().typeAlias(c.merc.type);
  if (!alias || !MERC_BY_ID[alias]) return null;
  c.merc.type = alias as MercId;
  c.merc.variant = mercVariant(MERC_BY_ID[alias], c.merc.variant).id;
  return MERC_BY_ID[alias];
}

function mercItems(c: CharacterState): Item[] {
  const eq = c.merc?.equipment ?? {};
  // un carquois ne sert qu'avec l'arc ou l'arbalète qui lui correspond (comme pour le joueur)
  return Object.entries(eq)
    .filter(([s, x]) => !!x && !(s === 'offhand' && baseOf(x as Item).type === 'quiver' && !quiverFits(baseOf(x as Item), eq.mainhand ? baseOf(eq.mainhand) : null)))
    .map(([, x]) => x as Item);
}

/** Niveau « dur » d'une compétence pour le mercenaire de ce personnage (modèle du jeu de règles : type, sous-type, difficulté d'embauche) */
export function mercHardLvl(skill: string, mlvl: number, c?: CharacterState): number {
  const st = c?.merc;
  return mercSkillLevel(skill, mlvl, st ? (MERC_BY_ID[st.type] ?? null) : null, st?.variant ?? '', st?.hire ?? 0);
}

/** Niveau effectif d'une compétence : niveau « dur » du mercenaire + compétences des objets (si apprise) */
export function mercSkillLvl(skill: string, mlvl: number, allSkills = 0, c?: CharacterState): number {
  const l = mercHardLvl(skill, mlvl, c);
  return l > 0 ? l + allSkills : 0;
}

/** Le modèle du jeu de règles a-t-il des tables propres aux compétences de mercenaire (PD2) ? Sinon : chiffres des compétences de classe */
export function mercTables(): boolean {
  return RULES['merc.model']().skillTable('', '', 0) !== undefined;
}

/**
 * Valeur d'une table de compétence propre aux mercenaires au niveau donné (modèle du jeu de règles : wiki PD2) ; sans table, le chiffre
 * `key` de la compétence de classe (D2)
 */
export function mtab(skill: string, row: string, lvl: number, key?: string): number {
  const v = RULES['merc.model']().skillTable(skill, row, lvl);
  return v ?? (key ? nv(skill, key, lvl) : 0);
}

/** Valeur d'une compétence de classe (tables du joueur) au niveau donné */
export const nv = (id: string, key: string, L: number): number => {
  const v = (SKILL_BY_ID[id]?.n as unknown as Record<string, unknown> | undefined)?.[key];
  if (v === undefined) return 0;
  return typeof v === 'number' ? v : lin(v as Lin, L);
};

/** Caractéristiques du mercenaire (niveau = niveau du personnage) */
export function mercDerived(c: CharacterState, difficulty: Difficulty = 0): MercDerived | null {
  const st = c.merc;
  const t = mercType(c);
  if (!st || !t) return null;
  const lvl = c.level;
  const B = mercBaseStats(t, lvl, st.variant, st.hire ?? 0);
  const stats = new Map<string, number>();
  let itemDef = 0;
  let weapon: [number, number] | null = null;
  let oneHand = false;
  const items = mercItems(c).filter((it) => !isBroken(it)); // un objet brisé n'a plus aucun effet
  for (const it of items) {
    const f = itemFinal(it, lvl);
    for (const [k, v] of f.stats) stats.set(k, (stats.get(k) ?? 0) + v);
    if (f.defense) itemDef += f.defense;
    if (st.equipment.mainhand === it && f.dmg) {
      weapon = [f.dmg[0], f.dmg[1]];
      oneHand = !baseOf(it).twoHanded;
    }
  }
  // PD2 : les mercenaires profitent aussi des bonus de set
  const sb = setBonuses(items, lvl);
  for (const [k, v] of sb.stats) stats.set(k, (stats.get(k) ?? 0) + v);
  const sl = sb.local;
  // dégâts améliorés / min / max portés hors de l'arme (carquois, bijoux d'armure) : s'ajoutent à l'arme en main
  sl.edPct += stats.get('edPct') ?? 0;
  sl.minDmg += stats.get('minDmg') ?? 0;
  sl.maxDmg += stats.get('maxDmg') ?? 0;
  if (weapon && (sl.edPct || sl.minDmg || sl.maxDmg)) weapon = [Math.floor(weapon[0] * (1 + sl.edPct / 100) + sl.minDmg), Math.floor(weapon[1] * (1 + sl.edPct / 100) + sl.maxDmg)];
  if (sl.defPct || sl.defFlat) itemDef = Math.floor(itemDef * (1 + sl.defPct / 100) + sl.defFlat);
  const g = (k: string) => stats.get(k) ?? 0;
  const allAttr = g('allAttr');
  // PD2 : le mercenaire n'a que force et dextérité (vitalité et énergie des objets sans effet)
  const str = Math.floor(B.str + g('str') + allAttr);
  const dex = Math.floor(B.dex + g('dex') + allAttr);
  const allSkills = g('allSkills');
  const variant = mercVariant(t, st.variant);
  const auras: MercDerived['auras'] = [];
  const addAura = (id: string, level: number) => {
    if (level <= 0) return;
    // une aura d'objet ne se cumule pas avec la même aura native : la plus forte l'emporte
    const ex = auras.find((a) => a.id === id);
    if (ex) ex.level = Math.max(ex.level, level);
    else auras.push({ id, level });
  };
  // les auras d'objets (Infini…) passent avant l'aura native : la première est l'aura « principale » (affichage)
  for (const [k, v] of stats) if (k.startsWith('itemAura:')) addAura(k.slice(9), v);
  addAura('conviction', g('auraConviction'));
  addAura('meditation', g('auraMeditation'));
  addAura('concentration', g('auraConcentration'));
  if (variant.aura) addAura(variant.aura, mercSkillLvl(variant.aura, lvl, allSkills, c));
  if (variant.skills.some((s) => s.id === 'battle_orders')) addAura('battle_orders', mercSkillLvl('battle_orders', lvl, allSkills, c));
  const aura = (id: string) => auras.find((a) => a.id === id)?.level ?? 0;

  let lifeMax = (B.hp + g('life')) * (1 + g('lifePct') / 100);
  if (aura('battle_orders')) lifeMax *= 1 + nv('battle_orders', 'value', aura('battle_orders')) / 100;
  let defPct = g('defPct');
  if (aura('defiance')) defPct += nv('defiance', 'value', aura('defiance'));
  // Armure gelée (Loup de fer de froid, D2) : entretenue en permanence, défense de la compétence
  const fa = mercSkillLvl('frozen_armor', lvl, allSkills, c);
  if (fa > 0) defPct += nv('frozen_armor', 'value', fa);
  const defense = Math.floor((B.def + itemDef + g('defense') + g('defFlat')) * (1 + defPct / 100));
  const penalty = RES_PENALTY[difficulty];
  const r = (k: string, maxK: string) => Math.min(75 + g(maxK) + g('maxResAll'), Math.floor(B.res + g(k) + g('resAll') + penalty));
  const resA = (id: string): number => (aura(id) ? nv(id, 'value', aura(id)) : 0);
  const res: Record<Element, number> = {
    phys: Math.min(50, g('dr')),
    fire: r('resFire', 'maxResFire') + resA('resist_fire'),
    cold: r('resCold', 'maxResCold') + resA('resist_cold'),
    light: r('resLight', 'maxResLight') + resA('resist_lightning'),
    poison: r('resPoison', 'maxResPoison'),
    magic: 0,
  };

  // dégâts : arme (×2 à une main pour le Garde du désert et le Barbare) + dégâts de base PD2 du niveau
  const wMul = weapon && oneHand && t.oneHandDouble ? 2 : 1;
  const raw: [number, number] = weapon ? [weapon[0] * wMul + B.dmin, Math.max(weapon[0], weapon[1]) * wMul + B.dmax] : [B.dmin, Math.max(B.dmin, B.dmax)];
  let dmgPct = t.style === 'bow' ? dex : str;
  if (aura('might')) dmgPct += nv('might', 'value', aura('might'));
  if (aura('concentration')) dmgPct += nv('concentration', 'value', aura('concentration'));
  if (aura('fanaticism')) dmgPct += nv('fanaticism', 'value', aura('fanaticism'));
  const dmg: [number, number] = [raw[0] * (1 + dmgPct / 100), raw[1] * (1 + dmgPct / 100)];
  const added: MercDerived['added'] = {};
  for (const [e, k] of [
    ['fire', 'Fire'],
    ['cold', 'Cold'],
    ['light', 'Light'],
    ['magic', 'Magic'],
    ['poison', 'Poison'],
  ] as const) {
    const mx = g(`add${k}Max`);
    if (mx > 0) added[e] = [g(`add${k}Min`), mx];
  }
  let arPct = g('arPct');
  if (aura('blessed_aim')) arPct += nv('blessed_aim', 'value', aura('blessed_aim'));
  if (aura('fanaticism')) arPct += nv('fanaticism', 'v3', aura('fanaticism'));
  const ar = (B.ar + dex * 5 + g('attackRating')) * (1 + arPct / 100);
  // maîtrises : vie par victime et bonus élémentaire (Loup de fer), régénération (Ascendant)
  const mL = variant.mastery ? mercSkillLvl(variant.mastery, lvl, allSkills, c) : 0;
  const mastery = variant.mastery ? mtab(variant.mastery, variant.mastery === 'fire_mastery' ? 'fire_damage' : variant.mastery === 'cold_mastery' ? 'cold_damage' : 'lightning_damage', mL) : 0;
  const main = variant.skills.find((s) => s.id !== 'attack')?.id ?? 'attack';
  // vitesse d'attaque : rendements décroissants (D2)
  const ias = g('ias');
  const eias = (120 * ias) / (120 + ias);
  const iasTot = eias + (aura('fanaticism') ? nv('fanaticism', 'v4', aura('fanaticism')) : 0);
  const atkTicks = Math.max(8, Math.round((t.atkTicks * 100) / (100 + iasTot)));
  const md: MercDerived = {
    lvl,
    str,
    dex,
    lifeMax: Math.round(lifeMax),
    defense,
    res,
    raw,
    dmgPct,
    dmg,
    added,
    spell: [0, 0],
    ar: Math.floor(ar),
    atkTicks,
    lifeLeech: g('lifeLeech'),
    lifePerKill: mtab(variant.mastery ?? '', 'life_after_each_kill', mL) + g('lifePerKill'),
    mastery,
    regen: variant.mastery === 'mastery' ? (mtab('mastery', 'replenish_life', mL) * 25) / 256 : 0,
    pierce: (t.style === 'bow' ? 66 : 0) + g('pierce') + g('pierceChance'),
    pierceRes: {
      phys: g('piercePhys'),
      fire: g('pierceFire') + g('pierceAll'),
      cold: g('pierceCold') + g('pierceAll'),
      light: g('pierceLight') + g('pierceAll'),
      poison: g('piercePoison') + g('pierceAll'),
    },
    crush: g('crushingBlow'),
    deadly: g('deadlyStrike'),
    allSkills,
    skillLvl: mercSkillLvl(main, lvl, allSkills, c),
    auras,
    mf: g('mf'),
    gf: g('gf'),
  };
  if (t.style === 'caster') md.spell = spellRange(md, variant, main as MercSkillId, c);
  return md;
}

/** Dégâts d'un sort de mercenaire (sans les synergies propres au tir) */
function spellRange(md: MercDerived, v: MercVariant, id: MercSkillId, c: CharacterState): [number, number] {
  const L = mercSkillLvl(id, md.lvl, md.allSkills, c);
  const m = 1 + md.mastery / 100;
  switch (id) {
    case 'fire_ball':
      return [mtab(id, 'fire_damage_min', L, 'min') * m, mtab(id, 'fire_damage_max', L, 'max') * m];
    case 'ice_blast':
      return [mtab(id, 'cold_damage_min', L, 'min') * m, mtab(id, 'cold_damage_max', L, 'max') * m];
    case 'lightning':
      return [mtab(id, 'lightning_damage_min', L, 'min') * m, mtab(id, 'lightning_damage_max', L, 'max') * m];
    default: {
      // sorts empruntés aux classes (Dents, Éclair sacré…) : tables des compétences du joueur
      const lo = nv(id, 'min', L);
      return [lo, Math.max(lo, nv(id, 'max', L))];
    }
  }
  void v;
}

/** Le mercenaire peut-il porter cet objet (type, emplacement, prérequis) ? */
export function canMercEquip(c: CharacterState, it: Item, slot?: MercSlot): { ok: boolean; slot?: MercSlot; reason?: string } {
  const t = mercType(c);
  if (!t || !c.merc) return { ok: false, reason: 'Aucun mercenaire' };
  const b = baseOf(it);
  const s = mercSlotFor(t, b);
  if (!s || !mercSlots(t).includes(s)) return { ok: false, reason: `${t.name} ne peut pas porter cet objet` };
  if (slot && slot !== s) return { ok: false, reason: 'Mauvais emplacement' };
  if (b.type === 'quiver') {
    const mh = c.merc.equipment.mainhand;
    if (!quiverFits(b, mh ? baseOf(mh) : null)) return { ok: false, reason: b.id.endsWith('_bolts') ? 'Les carreaux demandent une arbalète en main' : 'Les flèches demandent un arc en main' };
  }
  // a game mode that lifts the requirements (rule `char.equipNeedsReqs`, lot 295) lifts them for the mercenary too
  if (!RULES['char.equipNeedsReqs'](c)) return { ok: true, slot: s };
  const md = mercDerived(c)!;
  const f = itemFinal(it, c.level);
  if (f.reqLvl > md.lvl) return { ok: false, reason: `Niveau ${f.reqLvl} requis` };
  if (f.reqStr > md.str) return { ok: false, reason: `Force ${f.reqStr} requise (mercenaire : ${md.str})` };
  if (f.reqDex > md.dex) return { ok: false, reason: `Dextérité ${f.reqDex} requise (mercenaire : ${md.dex})` };
  return { ok: true, slot: s };
}

export function mercOf(w: World): Monster | undefined {
  return w.monsters.find((m) => m.pet === 'merc' && !m.dead);
}

/** Portée des auras du mercenaire (tuiles) : alliés et ennemis au-delà n'en subissent plus l'effet (comme les auras de monstres) */
export const MERC_AURA_RADIUS = 7;
export const auraCache = new WeakMap<Monster, MercDerived['auras']>();

/** Auras actives du mercenaire vivant (principale en premier), en cache : sans calcul ni allocation par image */
export function mercAuras(w: World): MercDerived['auras'] {
  const m = mercOf(w);
  if (!m || w.character.merc?.dead) return [];
  let list = auraCache.get(m);
  if (!list) {
    list = mercDerived(w.character, w.difficulty)?.auras ?? [];
    auraCache.set(m, list);
  }
  return list;
}

/** Niveau d'une aura du mercenaire vivant qui atteint la position (x, y) (0 : absente ou hors de portée) */
export function mercAuraAt(w: World, id: string, x: number, y: number): number {
  const m = mercOf(w);
  if (!m) return 0;
  const a = mercAuras(w).find((q) => q.id === id);
  return a && dist(m.x, m.y, x, y) <= MERC_AURA_RADIUS ? a.level : 0;
}

/** Réduction de défense (%) des monstres en (x, y) : la plus forte entre l'aura du joueur et celle de son mercenaire */
export function convDefAt(w: World, x: number, y: number): number {
  // PD2 : l'aura du joueur n'affecte que les monstres dans son rayon
  const own = dist(w.player.x, w.player.y, x, y) <= w.player.d.convictionRadius ? w.player.d.convictionDef : 0;
  return Math.max(own, convictionDefPct(mercAuraAt(w, 'conviction', x, y)));
}

/** Réduction de résistance (%) de la Conviction de niveau L (même formule que l'aura du joueur) */
export const convictionRes = (L: number): number => (L > 0 ? Math.min(150, lin(SKILL_BY_ID.conviction.n.value2, L)) : 0);
/** Réduction de défense (%) de la Conviction de niveau L */
export const convictionDefPct = (L: number): number => (L > 0 ? lin(SKILL_BY_ID.conviction.n.value, L) : 0);

/** Le mercenaire a-t-il porté le coup fatal à ce monstre ? */
export function mercKiller(w: World, victim: Monster): Monster | undefined {
  return victim.mercHit ? w.monsters.find((x) => x.id === victim.mercHit && x.pet === 'merc' && !x.dead) : undefined;
}

/** Sur les victimes du mercenaire, sa découverte d'objets et d'or s'ajoute à celle du joueur (D2 comme PD2 : celle du sbire et de son propriétaire) */
export function mercFindBonus(w: World, victim: Monster): { mf: number; gf: number } {
  const md = mercKiller(w, victim) ? mercDerived(w.character, w.difficulty) : null;
  return md ? { mf: md.mf, gf: md.gf } : { mf: 0, gf: 0 };
}

/** Le joueur vient de se téléporter : le mercenaire le suit aussitôt, à côté de lui */
export function teleportMerc(w: World, p: { x: number; y: number }): void {
  const m = mercOf(w);
  if (!m) return;
  for (const [ox, oy] of [
    [1.2, 0],
    [-1.2, 0],
    [0, 1.2],
    [0, -1.2],
    [0.8, 0.8],
    [-0.8, -0.8],
  ]) {
    const x = p.x + ox;
    const y = p.y + oy;
    if (w.grid.circleBlocked(x, y, TERRAIN_RADIUS) || !w.grid.connected(p.x, p.y, x, y)) continue;
    w.events.push({ t: 'teleport', id: m.id, fx: m.x, fy: m.y, tx: x, ty: y });
    m.x = m.px = x;
    m.y = m.py = y;
    m.tgt = 0;
    m.mode = 'idle';
    return;
  }
}

/** Changement de zone : la vie du mercenaire suit (soigné en ville) */
export function carryMerc(from: World, to: World): void {
  const a = mercOf(from);
  const b = mercOf(to);
  if (!a || !b || to.zone.town) return;
  b.hp = Math.max(1, Math.min(b.hpMax, Math.round((a.hp / a.hpMax) * b.hpMax)));
}
