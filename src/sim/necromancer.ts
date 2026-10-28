/**
 * Nécromancien : invocations (squelettes, golems, résurrection → minions.ts), sorts d'os et de
 * poison (Dents, Armure d'os, Explosion de cadavre, Lance et Esprit d'os, Nova de poison…) et
 * malédictions (une seule à la fois sur un monstre, comme D2). Chiffres D2 dans
 * data/skills-necromancer.ts.
 */
import type { Player } from './actors';
import type { SorcSkill } from '../data/skills';
import { SKILL_BY_ID, lin, skillHard, ramp, synergyPct } from '../data/skills';
import type { Element } from '../data/stats';
import { dist } from '../core/math';
import { emptyPacket, type DamagePacket, type Monster } from './actors';
import { TICK_HZ } from './constants';
import { addBuff } from './skills';
import { attackReach, dashTo, meleeTarget, rollHit, strikePacket, weaponKind, weaponMastery } from './melee';
import { corpseNear, reduceRes } from './barbarian';
import { scalePacket, spawnMissile } from './missiles';
import { summonMinion } from './minions';
import { spawnMonster } from './spawn';
import type { World } from './world';
import { RULES } from '../mods/rules';

const buf: Monster[] = [];
/** Comportements du jeu de règles (règle skills.necromancer : D2, src/mods/d2/skills.ts ; un mod peut les remplacer) */
const nec = (): ReturnType<(typeof RULES)['skills.necromancer']> => RULES['skills.necromancer']();
const t25 = (s: number): number => Math.round(s * TICK_HZ);

const CURSES = ['amplify_damage', 'dim_vision', 'weaken', 'iron_maiden', 'terror', 'confuse', 'life_tap', 'attract', 'decrepify', 'lower_resist'];

const nv = (id: string, key: 'min' | 'max', L: number): number => {
  const r = SKILL_BY_ID[id].n[key];
  return r ? ramp(r, L) : 0;
};
const roll = (w: World, id: string, L: number): number => {
  const lo = nv(id, 'min', L);
  return w.rng.combat.float(lo, Math.max(lo, nv(id, 'max', L)));
};
const syn = (w: World, id: string): number => 1 + synergyPct(SKILL_BY_ID[id], w.player.d.hardPoints) / 100;
const elemBonus = (w: World, e: Element): number => 1 + (w.player.d.elemDmgPct[e] ?? 0) / 100;

/** Nombre de malédictions qu'un monstre peut porter : 1, puis 2 et 3 aux points 10 et 20 de Maîtrise des malédictions */
export function maxCurses(w: World): number {
  return Math.max(1, skillHard('curse_mastery', 'Maximum Curses', w.player.d.hardPoints.curse_mastery ?? 0)) + Math.min(1, w.player.d.all.get('extraCurse') ?? 0);
}

function clearCurse(m: Monster): void {
  m.dmgMul = m.arMul = m.defMul = m.slowMul = m.missileMul = undefined;
  m.curseMove = m.curseAtk = undefined;
  m.debuffUntil = undefined;
  m.red = {};
  m.fleeUntil = undefined;
  m.confusedUntil = undefined;
  m.blindUntil = undefined;
  m.attractUntil = undefined;
  m.curse = undefined;
}

/** Niveau de Maîtrise des malédictions (points d'objets compris) */
const cmLevel = (w: World): number => w.player.d.skillLevels.curse_mastery ?? 0;

/** Bonus de Maîtrise des malédictions (PD2) : +1 % par deux niveaux sur les réductions des malédictions */
function cmBonus(w: World): number {
  return Math.floor(cmLevel(w) / 2);
}

type CurseEntry = NonNullable<Monster['curses']>[number];

/** Remplace les malédictions d'un monstre et recalcule leurs effets à partir de la liste */
function setCurses(w: World, m: Monster, list: CurseEntry[]): void {
  clearCurse(m);
  m.curses = list;
  for (const c of list) curseEffect(w, m, c.id, c.level, c.until);
  m.curse = list[list.length - 1];
}

/** Retire les malédictions échues (chacune a sa propre durée) et recalcule les effets des autres */
export function expireCurses(w: World, m: Monster): void {
  const list = m.curses;
  if (!list || !list.length) return;
  const live = list.filter((c) => c.until > w.tick);
  if (live.length === list.length) return;
  setCurses(w, m, live);
}

/** Multiplicateur de durée d'une malédiction selon la difficulté (règle skills.necromancer ; D2 : aucun) */
const curseDurMul = (w: World, id: string): number => nec().curseDurationMul(id, w.difficulty);

/**
 * Applique une malédiction à un monstre. PD2 : plusieurs malédictions cumulables (Maîtrise des
 * malédictions) ; la plus ancienne cède sa place quand le monstre en porte déjà le maximum, sauf
 * Attraction qu'aucune autre malédiction ne peut remplacer. Les effets sont recalculés à partir de la liste.
 */
function applyCurse(w: World, m: Monster, id: string, L: number): void {
  // champions possédés (D2) : insensibles aux malédictions
  if (m.mods.includes('possessed')) return;
  const s = SKILL_BY_ID[id];
  const ticks = Math.max(1, Math.round(t25(lin(s.n.duration, L)) * curseDurMul(w, id)));
  const until = w.tick + ticks;
  const list = (m.curses ?? (m.curse ? [m.curse] : [])).filter((c) => c.until > w.tick && c.id !== id);
  while (list.length >= maxCurses(w)) {
    const i = list.findIndex((c) => c.id !== 'attract');
    if (i < 0) return; // Attraction ne peut pas être remplacée par une autre malédiction
    list.splice(i, 1);
  }
  list.push({ id, until, level: L, src: w.player.id, v: id === 'life_tap' ? nec().lifeTapPct(s.n.value, L, w.player.d.hardPoints.life_tap ?? 0) + cmBonus(w) : undefined });
  setCurses(w, m, list);
  w.events.push({ t: 'impact', kind: 'curse', x: m.x, y: m.y, radius: 0.8, elem: 'magic' });
}

/** Effet d'une malédiction (valeurs PD2 S13) */
function curseEffect(w: World, m: Monster, id: string, L: number, until: number): void {
  const s = SKILL_BY_ID[id];
  const boss = m.rank === 'boss';
  const cm = cmBonus(w);
  const cml = cmLevel(w);
  const keep = (e: Element, v: number): void => {
    if (!m.red[e] || m.red[e]!.v < v) m.red[e] = { v, until };
  };
  switch (id) {
    case 'amplify_damage':
      // PD2 : −11 % de résistance physique au niveau 1, −1 % par niveau (peut briser une immunité, à moitié)
      keep('phys', lin(s.n.value, L) + cm);
      break;
    case 'weaken':
      // PD2 : dégâts −10 % −1 %/niveau (+1 % par deux niveaux de Maîtrise) et défense −10 % −2 %/niveau
      m.dmgMul = Math.min(m.dmgMul ?? 1, 1 - (lin(s.n.value, L) + cm) / 100);
      if (s.n.value2) m.defMul = Math.min(m.defMul ?? 1, Math.max(0.05, 1 - lin(s.n.value2, L) / 100));
      break;
    case 'decrepify': {
      // PD2 : résistance physique, vitesse de déplacement et cadence d'attaque et de sort réduites (plafond −60 % ; −1 %/niveau de Maîtrise)
      keep('phys', lin(s.n.value, L));
      m.curseMove = Math.min(m.curseMove ?? 1, 1 - lin(s.n.value2, L) / 100 / (boss ? 2 : 1));
      const atk = Math.min(60, lin(s.n.v3, L) + cml) / (boss ? 2 : 1);
      m.curseAtk = Math.min(m.curseAtk ?? 1, 1 - atk / 100);
      break;
    }
    case 'lower_resist': {
      const v = lin(s.n.value, L) + cm;
      for (const e of ['fire', 'cold', 'light', 'poison'] as Element[]) keep(e, v);
      break;
    }
    case 'dim_vision':
      // PD2 : aveugle et réduit le score d'attaque (valeur fixe, −10 par niveau de Maîtrise)
      m.blindUntil = until;
      m.arMul = Math.min(m.arMul ?? 1, Math.max(0.1, 1 - (lin(s.n.value, L) + 10 * cml) / Math.max(1, m.ar)));
      break;
    case 'attract':
      // PD2 : défense réduite (valeur fixe, −5 par niveau de Maîtrise)
      m.defMul = Math.min(m.defMul ?? 1, Math.max(0.1, 1 - (lin(s.n.value, L) + 5 * cml) / Math.max(1, m.defense)));
      break;
    case 'terror': {
      // PD2 : fuite 3 s et vitesse de déplacement −15 % (−2 %/point, −1 % par niveau de Maîtrise)
      if (!boss && m.rank !== 'unique') m.fleeUntil = until;
      const slow = -skillHard('terror', 'Enemy Movement Speed %', w.player.d.hardPoints.terror ?? 0) + cml;
      m.curseMove = Math.min(m.curseMove ?? 1, 1 - slow / 100 / (boss ? 2 : 1));
      break;
    }
    case 'confuse':
      // PD2 : cible au hasard et cadence d'attaque accrue (+50 % +10 %/niveau, +5 %/niveau de Maîtrise)
      if (!boss) m.confusedUntil = until;
      m.curseAtk = Math.max(m.curseAtk ?? 1, 1 + (lin(s.n.value, L) + 5 * cml) / 100);
      break;
    default:
      break;
  }
}

/** Rayon d'une malédiction en unités (règle skills.necromancer : D2, aurarangecalc ; mod : table selon les points durs et la Maîtrise) */
export function curseRadius(w: World, id: string): number {
  return nec().curseRadius(id, SKILL_BY_ID[id].n.radius, w.player.d.skillLevels[id] ?? 0, w.player.d.hardPoints[id] ?? 0, cmLevel(w));
}

/** Lance une malédiction : tous les monstres du rayon autour du point visé */
function castCurse(w: World, id: string, L: number, tx: number, ty: number, targetId: number): void {
  const s = SKILL_BY_ID[id];
  const c = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon);
  const x = c ? c.x : tx;
  const y = c ? c.y : ty;
  const r = Math.max(1.2, curseRadius(w, id));
  const hit: Monster[] = [];
  for (const m of w.monstersNear(x, y, r + 0.4, buf)) if (!m.dead && !m.isSummon && (m.convertedUntil ?? 0) <= w.tick) hit.push(m);
  for (const m of hit) applyCurse(w, m, id, L);
  if (id === 'attract') {
    // les autres monstres alentour se jettent sur le premier maudit
    const lure = hit[0];
    if (lure) {
      const until = w.tick + Math.round(t25(lin(s.n.duration, L)) * curseDurMul(w, id));
      for (const o of w.monstersNear(lure.x, lure.y, 7, buf)) {
        if (o === lure || o.dead || o.isSummon || o.rank === 'boss' || hit.includes(o)) continue;
        o.attractTarget = lure.id;
        o.attractUntil = until;
        o.confusedUntil = until;
      }
    }
  }
  w.events.push({ t: 'nova', kind: `curse_${id}`, x, y, radius: Math.min(r, 6), elem: 'magic' });
}

function missilePacket(w: World, id: string, L: number, e: Element): DamagePacket {
  const pk = emptyPacket(true);
  pk[e] = roll(w, id, L) * syn(w, id) * elemBonus(w, e);
  pk.skill = id;
  return pk;
}

/** Paramètres d'un lancement de compétence du Nécromancien (arguments de `castNecromancer` et valeurs communes calculées une fois) */
interface NecroCast {
  w: World;
  id: string;
  tx: number;
  ty: number;
  targetId: number;
  L: number;
  s: SorcSkill;
  p: Player;
  n: SorcSkill['n'];
  ang: number;
}

/** Exécute une compétence du Nécromancien. Renvoie false si l'identifiant n'en est pas une. */
export function castNecromancer(w: World, id: string, tx: number, ty: number, targetId: number, L: number): boolean {
  const s = SKILL_BY_ID[id];
  const p = w.player;
  const n = s.n;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  if (CURSES.includes(id)) {
    castCurse(w, id, L, tx, ty, targetId);
    return true;
  }
  const cast = Object.prototype.hasOwnProperty.call(NECROMANCER_CASTS, id) ? NECROMANCER_CASTS[id] : undefined;
  if (cast) {
    cast({ w, id, tx, ty, targetId, L, s, p, n, ang });
    return true;
  }
  void dist;
  return false;
}

function castRaiseSkeleton(ctx: NecroCast): void {
  const { w, id, tx, ty, L } = ctx;
  summonMinion(w, id, L, tx, ty);
}

function castTeeth(ctx: NecroCast): void {
  const { w, id, L, s, p, n, ang } = ctx;
  const cnt0 = Math.floor(lin(n.count, L));
  // a game mode's count (rule `skills.missileCount`, lot 309): fewer teeth, each heavier by as much; base: Diablo II's
  const cnt = cnt0 > 0 ? Math.max(1, Math.min(cnt0, Math.round(RULES['skills.missileCount'](w, id, cnt0)))) : cnt0;
  for (let i = 0; i < cnt; i++) {
    const a = ang + (cnt > 1 ? (i / (cnt - 1) - 0.5) * Math.min(1.4, 0.13 * cnt) : 0);
    spawnMissile(w, {
      kind: 'teeth',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: a,
      speed: n.speed ?? 12,
      radius: 0.3,
      range: s.range + 2,
      dmg: cnt === cnt0 ? missilePacket(w, id, L, 'magic') : scalePacket(missilePacket(w, id, L, 'magic'), cnt0 / cnt),
      elem: 'magic',
      level: L,
    });
  }
}

function castBoneArmor(ctx: NecroCast): void {
  const { w, id, L, s, p, n } = ctx;
  // absorption de la table + synergies de Mur et de Prison d'os ; par point d'énergie et durée : règle skills.necromancer
  const r = nec();
  p.boneAbsorb = lin(n.value, L) + r.boneArmorPerEnergy * p.d.ene + synergyPct(s, p.d.hardPoints, 'other');
  addBuff(w, id, L, r.boneArmorSeconds(n.duration, L));
}

function castPoisonDagger(ctx: NecroCast): void {
  const { w, id, targetId, L, s, p, n } = ctx;
  const t = meleeTarget(w, targetId, Math.max(s.range, attackReach(w)));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  const pk = strikePacket(w, { skill: id });
  const secs = lin(n.duration, L);
  // PD2 : perce la résistance au poison de la cible
  if (n.value) reduceRes(w, t, 'poison', lin(n.value, L), 1);
  // le poison de l'équipement s'ajoute à celui de la compétence
  const dps = (roll(w, id, L) * syn(w, id) * elemBonus(w, 'poison') + (p.d.all.get('poisonDmg') ?? 0)) / secs;
  pk.poisonDot = { dps, ticks: t25(secs) };
  void weaponKind;
  if (!rollHit(w, t, ramp(n.ar!, L) + weaponMastery(w).ar)) return;
  w.hurtMonster(t, pk);
  // nuage de poison (2,66 yards) au coup et à la mort de la victime : règle skills.necromancer (D2 : aucun)
  if (!nec().poisonDaggerClouds) return;
  t.psCloud = { dps, ticks: t25(secs) };
  psCloud(w, t, t.psCloud);
}

function castCorpseExplosion(ctx: NecroCast): void {
  const { w, id, tx, ty, L, s, p, n } = ctx;
  const c = corpseNear(w, tx, ty, 6) ?? corpseNear(w, p.x, p.y, 9);
  if (!c) {
    w.events.push({ t: 'message', text: 'Aucun cadavre à faire exploser', color: '#9aa' });
    return;
  }
  c.eaten = true;
  c.deathTick = Math.min(c.deathTick, w.tick - TICK_HZ * 11);
  const r = lin(n.radius, L);
  // règle skills.necromancer : D2, `value` à `value2` % de la vie maximale du cadavre, moitié physique, moitié feu
  if (nec().corpseExplosionPct) {
    const dmg = c.hpMax * (w.rng.combat.float(lin(n.value, L), lin(n.value2, L)) / 100);
    w.events.push({ t: 'impact', kind: 'corpse_explosion', x: c.x, y: c.y, radius: r, elem: 'fire' });
    for (const m of w.monstersNear(c.x, c.y, r, buf)) {
      if (m.dead || m.isSummon) continue;
      const pk = emptyPacket(true);
      pk.phys = dmg / 2;
      pk.fire = (dmg / 2) * elemBonus(w, 'fire');
      pk.skill = id;
      w.hurtMonster(m, pk);
    }
    return;
  }
  // dégâts physiques et de feu de la table + 5 à 10 % de la vie maximale du cadavre (moitié physique, moitié feu) ; synergies Amplification, Profanation, Résurrection
  const corpse = c.hpMax * w.rng.combat.float(0.05, 0.1);
  const mul = 1 + synergyPct(s, p.d.hardPoints) / 100;
  const lo = nv(id, 'min', L);
  const lo2 = n.min2 ? ramp(n.min2, L) : 0;
  const phys = (w.rng.combat.float(lo, Math.max(lo, nv(id, 'max', L))) + corpse * 0.5) * mul;
  const fire = (w.rng.combat.float(lo2, Math.max(lo2, n.max2 ? ramp(n.max2, L) : 0)) * elemBonus(w, 'fire') + corpse * 0.5) * mul;
  w.events.push({ t: 'impact', kind: 'corpse_explosion', x: c.x, y: c.y, radius: r, elem: 'fire' });
  for (const m of w.monstersNear(c.x, c.y, r, buf)) {
    if (m.dead || m.isSummon) continue;
    const pk = emptyPacket(true);
    pk.phys = phys;
    pk.fire = fire;
    pk.skill = id;
    w.hurtMonster(m, pk);
  }
}

/** Explosion de poison (D2) : sur un cadavre, un nuage de gaz empoisonne les monstres alentour */
function castPoisonExplosion(ctx: NecroCast): void {
  const { w, id, tx, ty, L, p, n } = ctx;
  const c = corpseNear(w, tx, ty, 6) ?? corpseNear(w, p.x, p.y, 9);
  if (!c) {
    w.events.push({ t: 'message', text: 'Aucun cadavre à faire exploser', color: '#9aa' });
    return;
  }
  c.eaten = true;
  c.deathTick = Math.min(c.deathTick, w.tick - TICK_HZ * 11);
  poisonCloud(w, id, L, c.x, c.y, lin(n.radius, L));
}

function castDesecrate(ctx: NecroCast): void {
  const { w, id, tx, ty, targetId, L } = ctx;
  // PD2 : cinq cadavres (dix au plus) surgissent autour de la cible, chacun libère un nuage de poison de 4 yards pendant 3 s
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon);
  const cx = t ? t.x : tx;
  const cy = t ? t.y : ty;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + w.rng.combat.float(0, 1);
    const rr = i === 0 ? 0 : w.rng.combat.float(0.8, 1.6);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    const corpse = desecrateCorpse(w, x, y);
    poisonCloud(w, id, L, corpse ? corpse.x : x, corpse ? corpse.y : y, 2);
  }
}

function castDarkPact(ctx: NecroCast): void {
  const { w, id, tx, ty, targetId, L, p } = ctx;
  // PD2 : dévore une malédiction (jamais la dernière) de chaque monstre maudit autour du point visé ; l'ennemi explose
  // (rayon 2 yards +0,66 par malédiction supplémentaire, +10 % de dégâts par malédiction supplémentaire)
  const c = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon);
  const cx = c ? c.x : tx;
  const cy = c ? c.y : ty;
  const castR = (4 + 0.66 * Math.floor((p.d.skillLevels.curse_mastery ?? 0) / 3)) / 2;
  w.events.push({ t: 'nova', kind: 'dark_pact', x: cx, y: cy, radius: castR, elem: 'magic' });
  const victims = w.monstersNear(cx, cy, castR + 0.4, []).filter((m) => !m.dead && !m.isSummon && (m.curses ?? []).some((q) => q.until > w.tick));
  if (victims.length === 0) w.events.push({ t: 'message', text: 'Aucune malédiction à dévorer', color: '#9aa' });
  for (const v of victims) {
    const live = (v.curses ?? []).filter((q) => q.until > w.tick);
    const extra = live.length - 1;
    if (live.length >= 2) setCurses(w, v, live.slice(1));
    const r = (2 + 0.66 * extra) / 2;
    const dmg = roll(w, id, L) * syn(w, id) * elemBonus(w, 'magic') * (1 + 0.1 * extra);
    w.events.push({ t: 'nova', kind: 'dark_pact', x: v.x, y: v.y, radius: r, elem: 'magic' });
    for (const o of w.monstersNear(v.x, v.y, r + 0.3, [])) {
      if (o.dead || o.isSummon) continue;
      const pk = emptyPacket(true);
      pk.magic = dmg;
      pk.skill = id;
      w.hurtMonster(o, pk);
    }
  }
}

function castBloodWarp(ctx: NecroCast): void {
  const { w, tx, ty, L, s, p, n } = ctx;
  // PD2 : 12 % de la vie actuelle (avec un minimum), la vie perdue revient en 5 s ; recharge selon le niveau
  const cost = Math.min(p.hp - 1, Math.max(bloodWarpMinCost(w, L), p.hp * (lin(n.value, L) / 100)));
  if (!dashTo(w, tx, ty, s.range)) return;
  p.hp -= Math.max(0, cost);
  p.warpRegen = { left: Math.max(0, cost), perTick: Math.max(0, cost) / (5 * TICK_HZ) };
  p.cooldowns.blood_warp = Math.max(p.cooldowns.blood_warp ?? 0, w.tick + Math.round(bloodWarpCooldown(L) * TICK_HZ));
}

function castPoisonNova(ctx: NecroCast): void {
  const { w, id, L, p, n } = ctx;
  poisonCloud(w, id, L, p.x, p.y, lin(n.radius, L));
  w.events.push({ t: 'nova', kind: 'poison_nova', x: p.x, y: p.y, radius: lin(n.radius, L), elem: 'poison' });
}

function castBoneSpear(ctx: NecroCast): void {
  const { w, id, L, s, p, n, ang } = ctx;
  // PD2 : 1 lance, 2 au niveau 15, 3 au niveau 25 (en éventail serré, chacune avec ses dégâts complets)
  const cnt = Math.max(1, Math.floor(n.count ? lin(n.count, L) : 1));
  for (let i = 0; i < cnt; i++) {
    const a = ang + (cnt > 1 ? (i - (cnt - 1) / 2) * 0.16 : 0);
    spawnMissile(w, {
      kind: 'bone_spear',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: a,
      speed: n.speed ?? 14,
      radius: 0.45,
      range: s.range + 3,
      dmg: missilePacket(w, id, L, 'magic'),
      elem: 'magic',
      pierce: true,
      level: L,
    });
  }
}

function castBoneSpirit(ctx: NecroCast): void {
  const { w, id, L, p, n, ang } = ctx;
  spawnMissile(w, {
    kind: 'bone_spirit',
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    speed: n.speed ?? 9,
    radius: 0.5,
    range: 22,
    dmg: missilePacket(w, id, L, 'magic'),
    elem: 'magic',
    level: L,
  });
}

/** Compétences du Nécromancien : identifiant → effet */
const NECROMANCER_CASTS: Record<string, (c: NecroCast) => void> = {
  raise_skeleton: castRaiseSkeleton,
  skeletal_mage: castRaiseSkeleton,
  raise_skeleton_archer: castRaiseSkeleton,
  clay_golem: castRaiseSkeleton,
  blood_golem: castRaiseSkeleton,
  iron_golem: castRaiseSkeleton,
  fire_golem: castRaiseSkeleton,
  revive: castRaiseSkeleton,
  bone_wall: castRaiseSkeleton,
  bone_prison: castRaiseSkeleton,
  teeth: castTeeth,
  bone_armor: castBoneArmor,
  poison_dagger: castPoisonDagger,
  corpse_explosion: castCorpseExplosion,
  poison_explosion: castPoisonExplosion,
  desecrate: castDesecrate,
  dark_pact: castDarkPact,
  blood_warp: castBloodWarp,
  poison_nova: castPoisonNova,
  bone_spear: castBoneSpear,
  bone_spirit: castBoneSpirit,
};

/** Nuage de poison : dégâts sur la durée pour tous les monstres du rayon */
function poisonCloud(w: World, id: string, L: number, x: number, y: number, r: number, mul = 1): void {
  const s = SKILL_BY_ID[id];
  const secs = lin(s.n.duration, L);
  w.events.push({ t: 'impact', kind: 'poison_cloud', x, y, radius: r, elem: 'poison' });
  for (const m of w.monstersNear(x, y, r, buf)) {
    if (m.dead || m.isSummon) continue;
    const total = roll(w, id, L) * syn(w, id) * elemBonus(w, 'poison') * mul;
    const pk = emptyPacket(true);
    pk.poisonDot = { dps: total / secs, ticks: t25(secs) };
    pk.skill = id;
    w.hurtMonster(m, pk);
  }
}

/** Recharge de Distorsion de sang selon le niveau (PD2 : 5,8 s au niveau 1, −0,2 s par niveau, aucune dès le niveau 30) */
export function bloodWarpCooldown(L: number): number {
  return Math.max(0, 6 - 0.2 * L);
}

/** Coût minimal de vie de Distorsion de sang (PD2 : 2 au niveau 1, +2 par niveau, plafond 60) */
export function bloodWarpMinCost(w: World, L: number): number {
  void w;
  return Math.min(60, 2 * L);
}

/** Régénération de la vie cédée à Distorsion de sang (à appeler à chaque tick du joueur) */
export function tickWarpRegen(w: World): void {
  const p = w.player;
  const r = p.warpRegen;
  if (!r) return;
  const g = Math.min(r.left, r.perTick);
  p.hp = Math.min(p.hpMax, p.hp + g);
  r.left -= g;
  if (r.left <= 0.001) p.warpRegen = undefined;
}

/** Nuage de Frappe empoisonnée (2,66 yards) : empoisonne les voisins de la cible avec le même poison */
function psCloud(w: World, src: Monster, c: { dps: number; ticks: number }): void {
  w.events.push({ t: 'impact', kind: 'poison_cloud', x: src.x, y: src.y, radius: 1.33, elem: 'poison' });
  for (const o of w.monstersNear(src.x, src.y, 1.33, [])) {
    if (o === src || o.dead || o.isSummon) continue;
    const pk = emptyPacket(true);
    pk.poisonDot = { dps: c.dps, ticks: c.ticks };
    pk.skill = 'poison_dagger';
    w.hurtMonster(o, pk);
    if ((o.poisonT ?? 0) > 0) o.psCloud = c;
  }
}

let releaseDepth = 0;
/** Un monstre qui meurt empoisonné par la Dague empoisonnée libère un nuage, quel que soit le tueur (PD2 saison 9 : `psCloud` n'est posé que si la règle le veut) */
export function releasePsCloud(w: World, m: Monster): void {
  const c = m.psCloud;
  if (!c || (m.poisonT ?? 0) <= 0 || releaseDepth > 12) return;
  m.psCloud = undefined;
  releaseDepth++;
  try {
    psCloud(w, m, c);
  } finally {
    releaseDepth--;
  }
}

/** Cadavre créé par Profanation, du type des monstres de la zone ; dix au plus à la fois, ils s'effacent après 16 s */
function desecrateCorpse(w: World, x: number, y: number): Monster | null {
  const mine = w.monsters.filter((m) => m.desecrated && m.dead && !m.eaten);
  while (mine.length >= 10) {
    const old = mine.shift()!;
    old.eaten = true;
    old.deathTick = Math.min(old.deathTick, w.tick - TICK_HZ * 12);
  }
  const pool = w.monsters.filter((m) => !m.isSummon && !m.pet && m.rank !== 'boss' && m.def.family !== 'pet');
  const def = pool.length ? pool[w.rng.combat.int(pool.length)].def.id : 'zombie';
  const m = spawnMonster(w, def, x, y, { rank: 'normal', noLoot: true }, `desecrate:${w.tick}`);
  if (!m) return null;
  m.hp = 0;
  m.dead = true;
  m.mode = 'death';
  m.modeLen = 20;
  m.modeT = 20;
  m.desecrated = true;
  m.deathTick = w.tick + TICK_HZ * 4;
  return m;
}
