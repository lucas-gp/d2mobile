/**
 * Amazone : flèches (Flèche magique, de feu, de froid, explosive, de glace, guidée, immolatrice,
 * de gel, Tir multiple, Mitraille), javelots lancés (poison, foudre, peste, furie) et attaques de
 * lance au corps à corps (Estoc, Frappe puissante, Empaler, Parade, Frappe chargée, foudroyante),
 * curses de l'arbre Passifs et magie (Vue intérieure, Projectiles ralentis), Leurre et Valkyrie.
 * Les passifs (Coup critique, Pénétration, Perforation, Esquive…) agissent dans melee.ts,
 * character.ts et combat.ts. Chiffres D2 dans data/skills-amazon.ts.
 */
import type { Player } from './actors';
import type { SorcSkill } from '../data/skills';
import { playsStrike } from './rhythm';
import { SKILL_BY_ID, lin, skillHard, ramp, skillWdmg, synergyPct } from '../data/skills';
import type { Element } from '../data/stats';
import { dist } from '../core/math';
import { emptyPacket, type DamagePacket, type Monster } from './actors';
import { damageMonster } from './combat';
import { TICK_HZ } from './constants';
import { addBuff } from './skills';
import { attackReach, fireWeapon, meleeSplashR, meleeTarget, rollHit, strike, strikePacket, weaponKind, weaponMastery, weaponRoll } from './melee';
import { scalePacket, spawnArea } from './missiles';
import { debuff } from './barbarian';
import { summonMinion } from './minions';
import type { World } from './world';
import { RULES } from '../mods/rules';
import { wear, announceBroken } from './durability';

const buf: Monster[] = [];
/** Comportements du jeu de règles (règle skills.amazon : D2, src/mods/d2/skills.ts ; un mod peut les remplacer) */
const ama = (): ReturnType<(typeof RULES)['skills.amazon']> => RULES['skills.amazon']();
const t25 = (s: number): number => Math.round(s * TICK_HZ);

const rn = (id: string, key: 'min' | 'max' | 'min2' | 'max2' | 'flat' | 'ar' | 'wdmg', L: number): number => {
  const r = SKILL_BY_ID[id].n[key];
  return r ? ramp(r, L) : 0;
};
const range = (w: World, id: string, L: number, a: 'min' | 'min2' = 'min', b: 'max' | 'max2' = 'max'): number => {
  const lo = rn(id, a, L);
  return w.rng.combat.float(lo, Math.max(lo, rn(id, b, L)));
};
const synMul = (w: World, id: string): number => 1 + synergyPct(SKILL_BY_ID[id], w.player.d.hardPoints) / 100;
/** % de dégâts d'arme de la compétence, synergies PD2 additives comprises */
const wdmgOf = (w: World, id: string, L: number): number => skillWdmg(SKILL_BY_ID[id], L, w.player.d.hardPoints);

/** Salve PD2 (Flèches magique, de feu, de froid) : n flèches en éventail serré ; `aux` est copié dans chaque projectile (sol brûlant…) */
function volley(w: World, tx: number, ty: number, n: number, make: () => Parameters<typeof fireWeapon>[3], aux = 0): void {
  for (let i = 0; i < n; i++) {
    fireWeapon(w, tx, ty, { ...make(), spread: n > 1 ? (i - (n - 1) / 2) * 0.09 : 0 });
    if (aux) w.missiles[w.missiles.length - 1].aux = aux;
  }
}

/**
 * Paquet d'une flèche élémentaire : part de l'arme (règle skills.amazon : D2, toute l'arme), dont la part `value` % est convertie en
 * l'élément, plus les dégâts physiques fixes (`flat` : Flèche magique de D2) et élémentaires ajoutés de la table (synergies comprises)
 */
function elemArrow(w: World, id: string, L: number, elem: Element): DamagePacket {
  const s = SKILL_BY_ID[id];
  const conv = s.n.value ? lin(s.n.value, L) / 100 : 0;
  const wmul = ama().arrowWeaponPct[id] ?? 1;
  const pk = strikePacket(w, { skill: id, mult: wmul, convert: conv > 0 ? elem : undefined, convertPct: conv, flat: s.n.flat ? ramp(s.n.flat, L) : undefined });
  pk[elem] += range(w, id, L) * synMul(w, id) * (1 + (w.player.d.elemDmgPct[elem] ?? 0) / 100);
  pk.crush = 0;
  return pk;
}

function nearestMonsters(w: World, x: number, y: number, r: number, n: number, los = true): Monster[] {
  const list = [...w.monstersNear(x, y, r, buf)].filter((m) => !m.dead && (!los || w.grid.lineOfSight(w.player.x, w.player.y, m.x, m.y)));
  list.sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y));
  return list.slice(0, n);
}

/** Paramètres d'un lancement de compétence de l’Amazone (arguments de `castAmazon` et valeurs communes calculées une fois) */
interface AmazonCast {
  w: World;
  id: string;
  tx: number;
  ty: number;
  targetId: number;
  L: number;
  s: SorcSkill;
  p: Player;
  n: SorcSkill['n'];
  ar: number;
  ang: number;
  wd: number;
}

/** Exécute une compétence de l'Amazone. Renvoie false si l'identifiant n'en est pas une. */
export function castAmazon(w: World, id: string, tx: number, ty: number, targetId: number, L: number): boolean {
  const s = SKILL_BY_ID[id];
  const p = w.player;
  const n = s.n;
  const ar = n.ar ? ramp(n.ar, L) : 0;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const wd = n.wdmg ? ramp(n.wdmg, L) : 0;
  const cast = Object.prototype.hasOwnProperty.call(AMAZON_CASTS, id) ? AMAZON_CASTS[id] : undefined;
  if (cast) {
    cast({ w, id, tx, ty, targetId, L, s, p, n, ar, ang, wd });
    return true;
  }
  void weaponKind;
  void weaponMastery;
  void weaponRoll;
  void rollHit;
  void spawnArea;
  void addBuff;
  void ang;
  return false;
}

/* ------------------------------ Arc ------------------------------ */
function castMagicArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, p, ar } = ctx;
  // nombre de flèches : table par points durs d'un mod (une seule dans D2) ; part de l'arme et perforation : règle skills.amazon
  const cnt = Math.max(1, skillHard(id, 'Number of Arrows', p.d.hardPoints[id] ?? 0));
  volley(w, tx, ty, cnt, () => ({ packet: elemArrow(w, id, L, 'magic'), ar, kind: 'magic_arrow', elem: 'magic', speed: 17, pierce: ama().magicArrowPierce }));
}

function castFireArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, s, p, n, ar } = ctx;
  // PD2 S13 : plusieurs flèches (2 au niveau 1), 50 % de l'arme (dont 50 % convertis en feu) ; chaque flèche laisse à son point d'arrêt
  // un sol en feu (rayon 1,33 yard, 1,48 s) dont les dégâts par seconde (table « Burning Damage ») ne profitent que de la synergie de la Flèche magique (18 %)
  const burn = ((rn(id, 'min2', L) + rn(id, 'max2', L)) / 2) * (1 + (18 * (p.d.hardPoints.magic_arrow ?? 0)) / 100) * (1 + (p.d.elemDmgPct.fire ?? 0) / 100);
  volley(w, tx, ty, Math.max(1, Math.floor(lin(n.count, L))), () => ({ packet: elemArrow(w, id, L, 'fire'), ar, kind: 'fire_arrow', elem: 'fire', range: s.range + 0.5, level: L }), burn);
}

function castColdArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, s, n, ar } = ctx;
  volley(w, tx, ty, Math.max(1, Math.floor(lin(n.count, L)) + (w.player.d.all.get('coldArrowExtra') ?? 0)), () => {
    const pk = elemArrow(w, id, L, 'cold');
    pk.chill = t25(lin(n.chill, L) || 4); // durée du froid de la compétence, sinon 4 s
    pk.chillPct = 0.5;
    return { packet: pk, ar, kind: 'cold_arrow', elem: 'cold', range: s.range + 0.5 };
  });
}

function castMultipleShot(ctx: AmazonCast): void {
  const { w, tx, ty, L, s, n, ar, wd } = ctx;
  const cnt = Math.floor(lin(n.count, L));
  // part de l'arme et perte des dégâts par ennemi traversé : règle skills.amazon (D2 : trois quarts de l'arme, aucune perte)
  const r = ama();
  const mult = r.multiShotPct !== 1 ? { mult: r.multiShotPct } : {};
  const decay = r.multiShotPierceDecay > 0 ? { pierceDecay: r.multiShotPierceDecay } : {};
  for (let i = 0; i < cnt; i++)
    fireWeapon(w, tx, ty, { ar, wdmg: wd, spread: cnt > 1 ? (i / (cnt - 1) - 0.5) * Math.min(1.9, 0.16 * cnt) : 0, kind: undefined, ...decay, range: s.range + 0.5, ...mult });
}

function castExplodingArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, p, ar } = ctx;
  const pk = elemArrow(w, id, L, 'fire');
  fireWeapon(w, tx, ty, { packet: pk, ar, kind: 'exploding_arrow', elem: 'fire', radius: 0.4, level: L });
  // rayon de l'explosion principale : règle skills.amazon
  w.missiles[w.missiles.length - 1].aux = ama().explodingRadius(SKILL_BY_ID[id].n.radius, L, p.d.hardPoints[id] ?? 0);
}

function castIceArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, s, p, n, ar } = ctx;
  const pk = elemArrow(w, id, L, 'cold');
  // gel : règle skills.amazon (D2 : ELen et synergie de durée de la Flèche de gel)
  const hp = p.d.hardPoints;
  pk.freeze = ama().iceArrowFreeze(n.chill, L, hp.cold_arrow ?? 0, hp.freezing_arrow ?? 0, synergyPct(s, hp, 'duration'));
  pk.chill = pk.freeze * 2;
  pk.chillPct = 0.5;
  fireWeapon(w, tx, ty, { packet: pk, ar, kind: 'ice_arrow', elem: 'cold', range: s.range + 0.5 });
}

function castGuidedArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, s, p } = ctx;
  // part de l'arme, conversion en magie, perforation : règle skills.amazon (D2 : toute l'arme, ni conversion ni perforation) ; touche toujours
  const r = ama();
  const conv = r.guidedArrowConvert ? Math.floor((p.d.hardPoints.magic_arrow ?? 0) / 2) / 100 : 0;
  const pk = strikePacket(w, { wdmg: wdmgOf(w, id, L), mult: r.guidedArrowPct, skill: id, convert: conv > 0 ? 'magic' : undefined, convertPct: conv });
  const pierce = r.guidedArrowPierce > 0 ? { pierce: true, pierceMax: r.guidedArrowPierce } : {};
  fireWeapon(w, tx, ty, { packet: pk, kind: 'guided_arrow', speed: 14, range: s.range + 0.5, ...pierce, sure: true });
}

function castImmolationArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, p, ar } = ctx;
  const pk = elemArrow(w, id, L, 'fire');
  const groundDps = ((rn(id, 'min2', L) + rn(id, 'max2', L)) / 2) * synMul(w, id) * (1 + (p.d.elemDmgPct.fire ?? 0) / 100);
  const m = { ...pk };
  fireWeapon(w, tx, ty, { packet: m, ar, kind: 'immolation_arrow', elem: 'fire', radius: 0.4 });
  const last = w.missiles[w.missiles.length - 1];
  if (last) last.aux = groundDps;
}

/** Part de l'arme d'une flèche de la Mitraille (règle skills.amazon ; D2 : trois quarts) */
const strafeMult = (): { mult?: number } => (ama().strafePct !== 1 ? { mult: ama().strafePct } : {});

function castStrafe(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, s, p, n, ar } = ctx;
  const cnt = Math.floor(lin(n.count, L));
  const targets = nearestMonsters(w, p.x, p.y, s.range, cnt);
  if (!targets.length) {
    // sans cible : une seule flèche vers le curseur, à la première frappe de la séquence
    if (playsStrike(0)) fireWeapon(w, tx, ty, { ar, wdmg: wdmgOf(w, id, L), range: s.range + 0.5, ...strafeMult() });
    return;
  }
  for (let i = 0; i < cnt; i++) {
    if (!playsStrike(i)) continue; // rythme (rhythm.ts) : une flèche par instant de la séquence
    const t = targets[i % targets.length];
    fireWeapon(w, t.x, t.y, { ar, wdmg: wdmgOf(w, id, L), skill: id, range: s.range + 0.5, ...strafeMult() });
  }
}

function castFreezingArrow(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, p, n, ar } = ctx;
  const pk = elemArrow(w, id, L, 'cold');
  // gel et rayon : règle skills.amazon (D2 : ELen et synergie de durée de la Flèche de glace ; calc1)
  pk.freeze = ama().freezingArrowFreeze(n.chill, L, synergyPct(SKILL_BY_ID[id], p.d.hardPoints, 'duration'));
  pk.chill = pk.freeze * 2;
  pk.chillPct = 0.6;
  fireWeapon(w, tx, ty, { packet: pk, ar, kind: 'freezing_arrow', elem: 'cold', radius: 0.45 });
  const last = w.missiles[w.missiles.length - 1];
  if (last) last.aux = ama().freezingRadius(n.radius, L, p.d.hardPoints[id] ?? 0);
}

/* ------------------------ Passifs et magie ------------------------ */
function castInnerSight(ctx: AmazonCast): void {
  const { w, id, L, p, n } = ctx;
  // PD2 : rayon de la table (Vue intérieure 3,33 à 10 u, Ralentissement 6 à 8 u)
  const r = lin(n.radius, L);
  const ticks = t25(lin(n.duration, L));
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    // Vue intérieure : défense et score d'attaque de l'ennemi réduits ; Ralentissement : marche et projectiles ennemis ralentis
    if (id === 'inner_sight') debuff(w, m, { def: Math.max(0.05, 1 - lin(n.value, L) / Math.max(1, m.defense)), ar: Math.max(0.05, 1 - lin(n.value2, L) / 100) }, ticks);
    else debuff(w, m, { slow: 1 - lin(n.value, L) / 100, missile: Math.max(0.05, 1 - lin(n.value2, L) / 100) }, ticks);
  }
  w.events.push({ t: 'nova', kind: id, x: p.x, y: p.y, radius: Math.min(r, 8), elem: 'magic' });
}

function castDecoy(ctx: AmazonCast): void {
  const { w, id, tx, ty, L } = ctx;
  summonMinion(w, id, L, tx, ty);
}

/* ------------------------ Javelot et lance ------------------------ */
function castJab(ctx: AmazonCast): void {
  const { w, id, targetId, L, s, p, ar } = ctx;
  const t = meleeTarget(w, targetId, Math.max(s.range, attackReach(w)));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // PD2 : trois coups sur la même cible, chacun aux dégâts complets de la table
  for (let i = 0; i < 3 && !t.dead; i++) strike(w, t, { wdmg: wdmgOf(w, id, L), ar, skill: id });
}

/** Empaler (D2) : coup de lance aux dégâts très accrus ; chance (calc2) que l'arme perde un point de durabilité */
function castImpale(ctx: AmazonCast): void {
  const { w, id, targetId, L, s, p, ar } = ctx;
  const t = meleeTarget(w, targetId, Math.max(s.range, attackReach(w)));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  strike(w, t, { wdmg: wdmgOf(w, id, L), ar, skill: id });
  const it = w.character.equipment.mainhand;
  if (it && w.rng.combat.chance(lin(s.n.value, L) / 100) && wear(it)) announceBroken(w, it);
}

function castFend(ctx: AmazonCast): void {
  const { w, id, targetId, L, s, p, ar } = ctx;
  const t = meleeTarget(w, targetId, Math.max(s.range, attackReach(w)));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // règle skills.amazon : PD2, trois attaques à zone croissante ; D2, un coup sur chaque cible adjacente (`count` au plus)
  if (!ama().fendSweep) {
    const cap = Math.max(1, Math.floor(lin(SKILL_BY_ID[id].n.count, L)) || 12);
    const near = [...w.monstersNear(p.x, p.y, attackReach(w) + 1.1, buf)].filter((m) => !m.dead && !m.isSummon);
    near.sort((a, b) => (a === t ? -1 : b === t ? 1 : 0));
    for (const m of near.slice(0, cap)) strike(w, m, { wdmg: wdmgOf(w, id, L), ar, skill: id });
    return;
  }
  // trois attaques sur toutes les cibles adjacentes ; la zone de dégâts de mêlée grandit de 20 / 40 / 60 % à la 1re / 2e / 3e attaque
  for (let i = 0; i < 3; i++) {
    if (t.dead) break;
    const before = [...w.monstersNear(p.x, p.y, attackReach(w) + 1.1, buf)].filter((m) => m !== t && !m.dead);
    strike(w, t, { wdmg: wdmgOf(w, id, L), ar, skill: id, splash: 20 * (i + 1) });
    // cibles au contact de l'Amazone mais hors de la zone de la cible : frappées à part, sans zone
    const sr = meleeSplashR(w, 20 * (i + 1));
    for (const m of before) if (!m.dead && dist(t.x, t.y, m.x, m.y) > sr) strike(w, m, { wdmg: wdmgOf(w, id, L), ar, skill: id, noSplash: true });
  }
}

function castPowerStrike(ctx: AmazonCast): void {
  const { w, id, targetId, L, s, p, n, ar } = ctx;
  const t = meleeTarget(w, targetId, Math.max(s.range, attackReach(w)));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  const syn = synMul(w, id);
  const lightning = (): number => range(w, id, L) * syn * (1 + (p.d.elemDmgPct.light ?? 0) / 100);
  if (id === 'power_strike') {
    const add = lightning();
    strike(w, t, { ar, add: { light: [add, add] }, skill: id });
    // nova de foudre (4,3 yards) sur les ennemis voisins : seulement avec ses dégâts dans la table (`min2`, `max2` d'un mod)
    if (!n.min2) return;
    const nova = (): number => range(w, id, L, 'min2', 'max2') * syn * (1 + (p.d.elemDmgPct.light ?? 0) / 100);
    for (const m of w.monstersNear(t.x, t.y, 2.15, buf)) if (m !== t && !m.dead) w.hurtMonster(m, lightPacket(nova(), id));
    w.events.push({ t: 'impact', kind: 'power_strike', x: t.x, y: t.y, radius: 2.15, elem: 'light' });
    return;
  }
  if (id === 'charged_strike') {
    strike(w, t, { ar, skill: id });
    const bolts = Math.floor(lin(n.count, L));
    const near = nearestMonsters(w, t.x, t.y, 6, bolts, false);
    for (let i = 0; i < bolts; i++) {
      const m = near[i % Math.max(1, near.length)];
      if (!m || m.dead) continue;
      w.events.push({ t: 'beam', kind: 'thunder', points: [t.x, t.y, m.x, m.y], elem: 'light' });
      w.hurtMonster(m, lightPacket(lightning(), id));
    }
    return;
  }
  // Frappe foudroyante : éclair en chaîne
  strike(w, t, { ar, skill: id });
  // portée d'un rebond : règle skills.amazon (D2 : aurarangecalc)
  chain(w, t, Math.floor(lin(n.count, L)), () => lightning(), id, ama().lightningStrikeReach(n.radius, L));
}

function castPoisonJavelin(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, p, n, ar } = ctx;
  const pk = strikePacket(w, { thrown: true, skill: id });
  const secs = lin(n.duration, L);
  const total = range(w, id, L) * synMul(w, id) * (1 + (p.d.elemDmgPct.poison ?? 0) / 100);
  pk.poisonDot = { dps: total / secs, ticks: t25(secs) };
  // le Javelot de peste libère un nuage à l'impact (comportement « plague_javelin » ; rayon : règle skills.amazon)
  fireWeapon(w, tx, ty, { packet: pk, ar, kind: id, elem: 'poison', speed: 13 });
  const last = w.missiles[w.missiles.length - 1];
  if (last && id === 'plague_javelin') last.aux = ama().plagueCloudRadius;
}

function castLightningBolt(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, p, ar } = ctx;
  const pk = strikePacket(w, { thrown: true, convert: 'light', skill: id });
  pk.light += range(w, id, L) * synMul(w, id) * (1 + (p.d.elemDmgPct.light ?? 0) / 100);
  fireWeapon(w, tx, ty, { packet: pk, ar, kind: 'lightning_bolt', elem: 'light', speed: 15 });
}

function castLightningFury(ctx: AmazonCast): void {
  const { w, id, tx, ty, L, n, ar } = ctx;
  const pk = strikePacket(w, { thrown: true, convert: 'light', skill: id });
  // ennemis traversés : règle skills.amazon (D2 : aucun) ; éclairs libérés à chaque impact
  const pierce = ama().lightningFuryPierce;
  fireWeapon(w, tx, ty, { packet: pk, ar, kind: 'lightning_fury', elem: 'light', speed: 15, ...(pierce > 0 ? { pierceMax: pierce } : {}) });
  const last = w.missiles[w.missiles.length - 1];
  if (last) last.aux = Math.floor(lin(n.count, L)) + L * 1000;
}

/** Compétences de l’Amazone : identifiant → effet */
const AMAZON_CASTS: Record<string, (c: AmazonCast) => void> = {
  magic_arrow: castMagicArrow,
  fire_arrow: castFireArrow,
  cold_arrow: castColdArrow,
  multiple_shot: castMultipleShot,
  exploding_arrow: castExplodingArrow,
  ice_arrow: castIceArrow,
  guided_arrow: castGuidedArrow,
  immolation_arrow: castImmolationArrow,
  strafe: castStrafe,
  freezing_arrow: castFreezingArrow,
  inner_sight: castInnerSight,
  slow_movement: castInnerSight,
  decoy: castDecoy,
  valkyrie: castDecoy,
  jab: castJab,
  impale: castImpale,
  fend: castFend,
  power_strike: castPowerStrike,
  charged_strike: castPowerStrike,
  lightning_strike: castPowerStrike,
  poison_javelin: castPoisonJavelin,
  plague_javelin: castPoisonJavelin,
  lightning_bolt: castLightningBolt,
  lightning_fury: castLightningFury,
};

function lightPacket(v: number, skill: string): DamagePacket {
  const pk = emptyPacket(true);
  pk.light = v;
  pk.skill = skill;
  return pk;
}

/** Éclair en chaîne à partir d'une cible (n rebonds, chaque monstre une fois) */
export function chain(w: World, from: Monster, hops: number, dmg: () => number, skill: string, reach = 6): void {
  const hit = new Set<number>([from.id]);
  let cur = from;
  for (let i = 0; i < hops; i++) {
    let next: Monster | null = null;
    let bd = reach;
    for (const m of w.monstersNear(cur.x, cur.y, reach, buf)) {
      if (m.dead || hit.has(m.id)) continue;
      const d = dist(cur.x, cur.y, m.x, m.y);
      if (d < bd) {
        bd = d;
        next = m;
      }
    }
    if (!next) break;
    hit.add(next.id);
    w.events.push({ t: 'beam', kind: 'chain', points: [cur.x, cur.y, next.x, next.y], elem: 'light' });
    w.hurtMonster(next, lightPacket(dmg(), skill));
    cur = next;
  }
}

/** Fin de vol des projectiles spéciaux de l'Amazone : furie de la foudre, explosions, nappes */
export function amazonImpact(w: World, kind: string, x: number, y: number, aux: number, dmg: DamagePacket): void {
  if (kind === 'lightning_fury') {
    const bolts = aux % 1000;
    const L = Math.floor(aux / 1000);
    const s = SKILL_BY_ID.lightning_fury;
    let n = 0;
    // l'ennemi touché d'abord, puis un éclair par autre ennemi à moins de 10 yards (5 u), jusqu'au maximum de la table
    const list = [...w.monstersNear(x, y, 5, buf)].filter((m) => !m.dead).sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y));
    for (const m of list) {
      if (m.dead || n >= bolts) continue;
      const v = w.rng.combat.float(ramp(s.n.min!, L), ramp(s.n.max!, L)) * (1 + synergyPct(s, w.player.d.hardPoints) / 100);
      w.events.push({ t: 'beam', kind: 'thunder', points: [x, y, m.x, m.y], elem: 'light' });
      w.hurtMonster(m, lightPacket(v, 'lightning_fury'));
      n++;
    }
  }
  if (kind === 'immolation_arrow' && aux > 0) {
    // sol brûlant (dégâts par seconde de la table) ; rayon et durée : règle skills.amazon (D2 : calc1, SHitCalc1 du missile)
    const pk = emptyPacket(true);
    pk.fire = aux;
    const im = SKILL_BY_ID.immolation_arrow.n;
    const g = ama().immolationGround(im.radius, im.duration, 1);
    spawnArea(w, { kind: 'fire_ground', team: 0, owner: w.player.id, x, y, radius: g.radius, ticks: Math.round(g.seconds * TICK_HZ), every: 5, dmg: pk, elem: 'fire' });
  }
  if (kind === 'fire_arrow' && aux > 0) {
    // PD2 S13 : sol en feu de 1,33 yard de rayon pendant 1,48 s
    const pk = emptyPacket(true);
    pk.fire = aux;
    spawnArea(w, { kind: 'fire_ground', team: 0, owner: w.player.id, x, y, radius: 0.67, ticks: t25(1.48), every: 5, dmg: pk, elem: 'fire' });
  }
  if (kind === 'exploding_arrow') {
    // PD2 : explosions secondaires de 2 yards (25 % des dégâts, supposé), une toutes les 2 images, jusqu'à 6,66 yards de l'impact
    const L = aux;
    const count = Math.floor(lin(SKILL_BY_ID.exploding_arrow.n.count, L));
    if (count > 0) spawnArea(w, { kind: 'exploding_sec', team: 0, owner: w.player.id, x, y, radius: 3.33, ticks: count * 2 + 2, every: 2, dmg: scalePacket(dmg, 0.25), elem: 'fire', aux: count });
  }
  void dmg;
}

/**
 * Frappe puissante de la Valkyrie (PD2) : à chaque coup au contact, éclair du niveau « Valk Power Strike Level » de la table
 * (niveau de l'invocation) sur la cible, plus une nova de 4,3 yards ; Frappe puissante donne +20 % à la nova par point,
 * Perforation −2 % de résistance à la foudre ennemie par point.
 */
export function valkyriePowerStrike(w: World, v: Monster, t: Monster): void {
  const hp = w.player.d.hardPoints;
  const psL = Math.max(1, Math.round(lin(SKILL_BY_ID.valkyrie.n.v3!, v.summonLevel ?? 1)));
  const ps = SKILL_BY_ID.power_strike;
  const lightMul = (m: Monster): number => {
    const r = m.res.light ?? 0;
    return r >= 100 ? 1 : (100 - (r - 2 * (hp.pierce ?? 0))) / (100 - r);
  };
  const direct = w.rng.combat.float(ramp(ps.n.min!, psL), Math.max(ramp(ps.n.min!, psL), ramp(ps.n.max!, psL)));
  damageMonster(w, t, lightPacket(direct * lightMul(t), 'valkyrie'), v);
  const nova = w.rng.combat.float(ramp(ps.n.min2!, psL), Math.max(ramp(ps.n.min2!, psL), ramp(ps.n.max2!, psL))) * (1 + (20 * (hp.power_strike ?? 0)) / 100);
  for (const m of w.monstersNear(t.x, t.y, 2.15, buf)) if (m !== t && !m.dead && !m.isSummon && m.team !== 0) damageMonster(w, m, lightPacket(nova * lightMul(m), 'valkyrie'), v);
  w.events.push({ t: 'impact', kind: 'power_strike', x: t.x, y: t.y, radius: 2.15, elem: 'light' });
}
