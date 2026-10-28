/**
 * Barbare PD2 S13 : attaques de Combat (Coup violent, Double coup, Étourdissement de zone, Attaque
 * concentrée à conversion magique, Frénésie à cinq charges, Berserk physique, Double lancer à
 * rebonds…), armes de jet et Cris de guerre (durées de 300 s, Ordres de bataille à vie et mana
 * fixes, Cri de bataille sur la résistance physique, Provocation de zone, Fétiche sinistre en aura
 * alliée, Commandement de bataille). Chiffres PD2 dans mods/pd2/data/skills.ts (wiki, tables à 60
 * niveaux) ; les maîtrises agissent dans melee.ts et character.ts.
 */
import type { Player } from './actors';
import type { SorcSkill } from '../data/skills';
import { playsStrike, seqState, strikeIndex } from './rhythm';
import { SKILL_BY_ID, lin, skillHard, ramp, skillWdmg, synergyPct } from '../data/skills';
import { dist } from '../core/math';
import { emptyPacket, type Monster } from './actors';
import { TERRAIN_RADIUS, TICK_HZ } from './constants';
import { generateItem } from './loot/itemgen';
import { rollMonsterDrops } from './loot/drops';
import { addBuff, addStack } from './skills';
import { attackReach, dashTo, fireWeapon, isThrownKind, meleeTarget, offhandWeapon, rollHit, strike, strikePacket, weaponKind } from './melee';
import type { World } from './world';
import { RULES } from '../mods/rules';

const buf: Monster[] = [];
/** Comportements du jeu de règles (règle skills.barbarian : D2, src/mods/d2/skills.ts ; un mod peut les remplacer) */
const bar = (): ReturnType<(typeof RULES)['skills.barbarian']> => RULES['skills.barbarian']();

const t25 = (sec: number): number => Math.round(sec * TICK_HZ);
/** Yards → unités du monde (1 unité = 2 yards) */
const yd = (y: number): number => y / 2;

/** Monstre immunisé à la peur (Hurlement, PD2) : champions, uniques et boss */
function resistsFear(m: Monster): boolean {
  return m.rank === 'boss' || m.rank === 'unique' || m.rank === 'champion';
}

export function debuff(w: World, m: Monster, o: { dmg?: number; ar?: number; def?: number; slow?: number; missile?: number }, ticks: number): void {
  if (o.missile !== undefined) m.missileMul = o.missile;
  if (o.dmg !== undefined) m.dmgMul = o.dmg;
  if (o.ar !== undefined) m.arMul = o.ar;
  if (o.def !== undefined) m.defMul = o.def;
  if (o.slow !== undefined) m.slowMul = o.slow;
  m.debuffUntil = Math.max(m.debuffUntil ?? 0, w.tick + ticks);
}

/** Réduction de résistance d'un monstre (la plus forte l'emporte tant qu'elle dure) */
export function reduceRes(w: World, m: Monster, e: 'phys' | 'fire' | 'cold' | 'light' | 'poison' | 'magic', v: number, ticks: number, soft = false): void {
  const cur = m.red[e];
  // une réduction douce (Berserk) ne remplace jamais une réduction durable déjà en place (Cri de bataille)
  if (soft && cur && cur.until > w.tick && !cur.soft) return;
  if (!cur || cur.until <= w.tick || cur.v <= v) m.red[e] = { v, until: w.tick + ticks, ...(soft ? { soft: true } : {}) };
}

/** Cadavre le plus proche du point visé (sans aucun effet déjà appliqué) */
export function corpseNear(w: World, x: number, y: number, r: number): Monster | null {
  let best: Monster | null = null;
  let bd = r;
  for (const m of w.monsters) {
    if (!m.dead || m.isSummon || m.eaten) continue;
    const d = dist(x, y, m.x, m.y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function reachOf(w: World, id: string): number {
  return Math.max(SKILL_BY_ID[id].range, attackReach(w));
}

/** Coup d'arme des attaques du Barbare : bonus de la compétence (dégâts + synergies additives, précision, dégâts fixes) */
function hit(w: World, t: Monster, id: string, L: number, extra: Parameters<typeof strike>[2] = {}): number {
  const s = SKILL_BY_ID[id];
  const n = s.n;
  return strike(w, t, {
    wdmg: skillWdmg(s, L, w.player.d.hardPoints),
    ar: n.ar ? ramp(n.ar, L) : 0,
    flat: n.flat ? ramp(n.flat, L) : 0,
    skill: id,
    ...extra,
  });
}

/** Paramètres d'un lancement de compétence du Barbare (arguments de `castBarbarian` et valeurs communes calculées une fois) */
interface BarbCast {
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
  hard: Player['d']['hardPoints'];
}

/** Exécute une compétence du Barbare. Renvoie false si l'identifiant n'en est pas une. */
export function castBarbarian(w: World, id: string, tx: number, ty: number, targetId: number, L: number): boolean {
  const s = SKILL_BY_ID[id];
  const p = w.player;
  const n = s.n;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const hard = p.d.hardPoints;
  const cast = Object.prototype.hasOwnProperty.call(BARBARIAN_CASTS, id) ? BARBARIAN_CASTS[id] : undefined;
  if (cast) {
    cast({ w, id, tx, ty, targetId, L, s, p, n, ang, hard });
    return true;
  }
  return false;
}

/* ----------------------------- Combat ----------------------------- */
function castBash(ctx: BarbCast): void {
  const { w, id, targetId, L, p } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // chance de repousser la cible : règle skills.barbarian (D2 : toujours)
  const kb = bar().bashKnockChance;
  hit(w, t, id, L, kb >= 1 || w.rng.combat.chance(kb) ? { knockback: 1.2 } : {});
}

function castStun(ctx: BarbCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // règle skills.barbarian : D2, l'arme (synergie du Coup violent) étourdit la cible seule
  if (!bar().stunArea) {
    if (hit(w, t, id, L) > 0 && !t.dead && t.rank !== 'boss') t.stunT = Math.max(t.stunT, t25(lin(n.stun, L)));
    return;
  }
  // dégâts physiques propres + 25 % des dégâts de l'arme, étourdit tout autour de la cible (3,33 yards)
  const lo = ramp(n.min!, L);
  const add = { phys: [lo, Math.max(lo, ramp(n.max!, L))] as [number, number] };
  const stun = t25(lin(n.stun, L));
  if (hit(w, t, id, L, { wdmg: 0, mult: 0.25, add }) > 0) {
    for (const m of w.monstersNear(t.x, t.y, yd(3.33), buf)) if (!m.dead && m.rank !== 'boss') m.stunT = Math.max(m.stunT, stun);
    w.events.push({ t: 'impact', kind: 'stun', x: t.x, y: t.y, radius: yd(3.33), elem: 'phys' });
  }
}

function castConcentrate(ctx: BarbCast): void {
  const { w, id, targetId, L, p, hard } = ctx;
  // ininterrompable, défense accrue ; part des dégâts physiques convertie en magique (table par points durs d'un mod), zone +20 %
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  const conv = skillHard('concentrate', 'Physical Damage Converted to Magic %', hard[id] ?? 0) / 100;
  hit(w, t, id, L, { convert: 'magic', convertPct: conv, splash: 20 });
  addBuff(w, 'concentrate', L, 4);
}

function castBerserk(ctx: BarbCast): void {
  const { w, id, targetId, L, s, p, n, hard } = ctx;
  // règle skills.barbarian : D2, dégâts convertis en magiques, défense à 0 pendant l'effet ; sinon dégâts PHYSIQUES qui percent la
  // résistance physique de la cible, défense et réduction des dégâts réduites, zone +20 %
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  if (bar().berserkMagic) {
    hit(w, t, id, L, { convert: 'magic', convertPct: 1 });
    addBuff(w, 'berserk', L, lin(n.duration, L));
    return;
  }
  reduceRes(w, t, 'phys', lin(n.value, L), 1, true);
  strike(w, t, { wdmg: lin(n.v3, L) + synergyPct(s, hard), ar: ramp(n.ar!, L), splash: 20, skill: id });
  addBuff(w, 'berserk', L, lin(n.duration, L));
}

function castDoubleSwing(ctx: BarbCast): void {
  const { w, id, targetId, L, p } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // PD2 : avec deux armes, la seconde frappe une AUTRE cible à portée si possible, sinon la même cible deux fois
  const dual = !!offhandWeapon(w);
  hit(w, t, id, L);
  let t2: Monster | null = t.dead ? null : t;
  if (dual) {
    const reach = reachOf(w, id) + 0.6;
    let bd = Infinity;
    for (const m of w.monstersNear(p.x, p.y, reach, buf)) {
      if (m === t || m.dead || m.isSummon) continue;
      const d = dist(p.x, p.y, m.x, m.y);
      if (d < bd) {
        bd = d;
        t2 = m;
      }
    }
  }
  if (t2) hit(w, t2, id, L, { off: dual });
}

function castFrenzy(ctx: BarbCast): void {
  const { w, id, targetId, L, p, n, hard } = ctx;
  // charges au plus et durée : règle skills.barbarian (D2 : une seule, par7 images) ; la zone de mêlée s'agrandit avec la Frénésie (mod)
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  const stacks = p.buffs.find((b) => b.id === 'frenzy')?.stacks ?? 0;
  const fr = bar();
  const splash = (lin(n.v5, L) * stacks) / 5;
  // Rythme (rhythm.ts) : arme principale à la libération, seconde arme à mi-cycle ; une seule charge par séquence
  let ok = false;
  if (playsStrike(0)) ok = hit(w, t, id, L, { splash }) > 0;
  if (offhandWeapon(w) && playsStrike(1) && !t.dead) ok = hit(w, t, id, L, { off: true, splash }) > 0 || ok;
  if (ok && !seqState.hit) addStack(w, 'frenzy', L, fr.frenzyMaxStacks, fr.frenzyDuration(n.duration, L, hard[id] ?? 0));
  if (ok && strikeIndex() !== undefined) seqState.hit = true;
}

function castLeap(ctx: BarbCast): void {
  const { w, id, tx, ty, L, p, n, hard } = ctx;
  const r = lin(n.radius, L);
  if (!dashTo(w, tx, ty, r)) return;
  // les monstres à l'arrivée sont repoussés (rayon PD2 selon les points investis)
  const kr = yd(skillHard('leap', 'Knockback Radius (yards)', hard[id] ?? 0)) || 1.6;
  const pk = emptyPacket(false);
  pk.knockback = 1.6;
  pk.srcX = p.x;
  pk.srcY = p.y;
  for (const m of w.monstersNear(p.x, p.y, kr, buf)) if (m.rank !== 'boss') w.hurtMonster(m, { ...pk });
  w.events.push({ t: 'impact', kind: 'leap', x: p.x, y: p.y, radius: kr, elem: 'phys' });
}

function castLeapAttack(ctx: BarbCast): void {
  const { w, id, targetId, L, s, p } = ctx;
  // bondit sur la cible ; rayon de la frappe : règle skills.barbarian (D2 : la cible seule)
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? meleeTarget(w, 0, s.range);
  if (!t) return;
  if (dist(p.x, p.y, t.x, t.y) > 1.6) dashTo(w, t.x, t.y, 8, 1.1);
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  const r = bar().leapAttackRadius;
  if (r <= 0) {
    hit(w, t, id, L, { knockback: 1 });
    w.events.push({ t: 'impact', kind: 'leap', x: p.x, y: p.y, radius: 1, elem: 'phys' });
    return;
  }
  for (const m of [...w.monstersNear(p.x, p.y, r, buf)]) if (!m.dead && !m.isSummon) hit(w, m, id, L, { knockback: 1, noSplash: true });
  w.events.push({ t: 'impact', kind: 'leap', x: p.x, y: p.y, radius: r, elem: 'phys' });
}

function castWhirlwind(ctx: BarbCast): void {
  const { w, id, tx, ty, L, p, n, ang } = ctx;
  // le Barbare tournoie en avançant : chaque monstre croisé est frappé une fois par arme
  // PD2 : un coup toutes les 5 images (deux toutes les 6 à deux armes), soit deux passages par balayage de 10 images
  const done = new Map<number, { n: number; at: number }>();
  const steps = 10;
  // vitesse du Tourbillon (« Whirlwind Velocity », table PD2 par niveau) : le balayage couvre d'autant plus de terrain
  const len = 5 * (1 + (n.v3 ? lin(n.v3, L) : 0) / 100);
  const a = tx === p.x && ty === p.y ? p.facing : ang;
  for (let i = 0; i < steps; i++) {
    const nx = p.x + Math.cos(a) * (len / steps);
    const ny = p.y + Math.sin(a) * (len / steps);
    if (!w.grid.circleBlocked(nx, ny, TERRAIN_RADIUS)) {
      p.x = nx;
      p.y = ny;
      p.px = nx;
      p.py = ny;
    }
    for (const m of w.monstersNear(p.x, p.y, 1.9 + attackReach(w) * 0.3, buf)) {
      const d0 = done.get(m.id);
      if (m.dead || (d0 && (d0.n >= 2 || i - d0.at < 5))) continue;
      done.set(m.id, { n: (d0?.n ?? 0) + 1, at: i });
      hit(w, m, id, L);
      if (offhandWeapon(w) && !m.dead) hit(w, m, id, L, { off: true });
    }
  }
  w.events.push({ t: 'impact', kind: 'whirlwind', x: p.x, y: p.y, radius: 2.2, elem: 'phys' });
}

function castDoubleThrow(ctx: BarbCast): void {
  const { w, id, tx, ty, targetId, L, s, n, hard } = ctx;
  // deux armes de jet ; PD2 : chacune rebondit sur d'autres ennemis (3 à 8 rebonds, portée 10 yards)
  const k = weaponKind(w);
  if (!isThrownKind(k)) return;
  const a0 = ramp(n.ar!, L);
  const wd = skillWdmg(s, L, hard);
  const bounces = Math.floor(lin(n.count, L));
  for (const off of [-0.07, 0.07]) fireWeapon(w, tx, ty, { ar: a0, wdmg: wd, spread: off, speed: 14, range: 10, kind: k === 'javelin' ? 'javelin' : 'throw_axe' });
  const first = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? meleeTarget(w, 0, 9);
  if (first) bounceThrow(w, first, bounces, a0, wd, id);
}

function castSplitThrow(ctx: BarbCast): void {
  const { w, id, tx, ty, L, s, n, hard } = ctx;
  // PD2 : l'arme de jet se divise en plusieurs projectiles en éventail (dégâts d'arme + bonus %) ; à bout de portée
  // chaque projectile revient vers le Barbare (30 % des dégâts, perforant) ; à l'aller, aucune cible touchée deux fois
  const k = weaponKind(w);
  if (!isThrownKind(k)) return;
  const cnt = Math.max(2, Math.round(lin(n.count, L)));
  const wd = skillWdmg(s, L, hard);
  const a0 = ramp(n.ar!, L);
  const shared: number[] = [];
  for (let i = 0; i < cnt; i++) {
    const off = (i - (cnt - 1) / 2) * 0.12;
    // liste de cibles touchées partagée : à l'aller, une cible ne reçoit qu'un projectile (pas de « fusil à pompe »)
    fireWeapon(w, tx, ty, { ar: a0, wdmg: wd, spread: off, speed: 14, range: 10, kind: k === 'javelin' ? 'javelin' : 'throw_axe', thrown: true, pierce: true, returns: true, skill: id }).hits = shared;
  }
}

/* ----------------------------- Cris de guerre ----------------------------- */
function castHowl(ctx: BarbCast): void {
  const { w, L, p, n } = ctx;
  const r = lin(n.radius, L);
  const ticks = t25(lin(n.duration, L));
  for (const m of w.monstersNear(p.x, p.y, r, buf)) if (!m.dead && !resistsFear(m)) m.fleeUntil = w.tick + ticks;
  w.events.push({ t: 'nova', kind: 'howl', x: p.x, y: p.y, radius: Math.min(r, 8), elem: 'phys' });
}

function castTaunt(ctx: BarbCast): void {
  const { w, id, L, p, n, hard, targetId, tx, ty } = ctx;
  // rayon : règle skills.barbarian (D2 : le monstre visé seul) ; les monstres perdent dégâts et précision, et les non-boss foncent sur le Barbare
  const r = bar().tauntRadius;
  const ticks = t25(skillHard('taunt', 'Duration (seconds)', hard[id] ?? 0) || 2);
  // une table peut dépasser 100 % aux niveaux élevés : plancher à 0 (le monstre n'inflige plus rien, mais ne guérit pas le joueur)
  const dmg = Math.min(1, lin(n.value, L) / 100);
  const ar = Math.min(1, lin(n.value2, L) / 100);
  const one = r > 0 ? null : (w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? meleeTarget(w, 0, 6) ?? null);
  const targets = r > 0 ? w.monstersNear(p.x, p.y, r, buf) : one ? [one] : [];
  void tx;
  void ty;
  for (const m of targets) {
    if (m.dead || m.isSummon) continue;
    debuff(w, m, { dmg: 1 - dmg, ar: 1 - ar }, ticks);
    if (m.rank === 'boss') continue;
    m.aggro = true;
    m.fleeUntil = undefined;
    const a = Math.atan2(p.y - m.y, p.x - m.x);
    w.moveActor(m, Math.cos(a) * 1.5, Math.sin(a) * 1.5, false);
  }
  w.events.push({ t: 'nova', kind: 'taunt', x: p.x, y: p.y, radius: Math.min(r || 1, 8), elem: 'phys' });
}

function castBattleCry(ctx: BarbCast): void {
  const { w, L, p, n } = ctx;
  // défense réduite ; D2 : dégâts réduits (`v3`) ; mod : résistance physique réduite (`value2`, peut briser une immunité physique) ; 8,5 yards
  const r = yd(8.5);
  const ticks = t25(lin(n.duration, L));
  const def = lin(n.value, L) / 100;
  const pr = lin(n.value2, L);
  const dm = n.v3 ? lin(n.v3, L) / 100 : 0;
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    if (m.dead || m.isSummon) continue;
    debuff(w, m, dm > 0 ? { def: 1 - def, dmg: 1 - dm } : { def: 1 - def }, ticks);
    if (pr > 0 || n.value2) reduceRes(w, m, 'phys', pr, ticks);
  }
  w.events.push({ t: 'nova', kind: 'battle_cry', x: p.x, y: p.y, radius: Math.min(r, 8), elem: 'phys' });
}

function castWarCry(ctx: BarbCast): void {
  const { w, L, s, p, n, hard } = ctx;
  // PD2 : dégâts physiques de zone (rayon croissant), étourdissement bref ; synergies des autres cris
  const r = lin(n.radius, L);
  const syn = 1 + synergyPct(s, hard) / 100;
  const stun = t25(lin(n.stun, L));
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    const pk = emptyPacket(false);
    pk.phys = w.rng.combat.float(ramp(n.min!, L), ramp(n.max!, L)) * syn;
    pk.stun = stun;
    w.hurtMonster(m, pk);
  }
  w.events.push({ t: 'nova', kind: 'war_cry', x: p.x, y: p.y, radius: Math.min(r, 8), elem: 'phys' });
}

function castShout(ctx: BarbCast): void {
  const { w, id, L, p, n } = ctx;
  // durée de la compétence (les synergies de durée des cris de D2 ne sont pas reprises)
  addBuff(w, id, L, lin(n.duration, L));
  w.events.push({ t: 'impact', kind: 'shout', x: p.x, y: p.y, radius: 1.5, elem: 'magic' });
}

function castFindPotion(ctx: BarbCast): void {
  const { w, id, tx, ty, L, n } = ctx;
  const c = corpseNear(w, tx, ty, 3.5);
  if (!c) return;
  c.eaten = true;
  w.events.push({ t: 'impact', kind: 'find', x: c.x, y: c.y, radius: 0.9, elem: 'magic' });
  if (!w.rng.combat.chance(lin(n.value, L) / 100)) return;
  if (id === 'find_potion') {
    // D2 : soin 60 %, mana 30 %, rajeunissement 10 %
    const roll = w.rng.loot.next();
    const base = roll < 0.6 ? 'hp_potion' : roll < 0.9 ? 'mp_potion' : 'rejuv_potion';
    w.dropItem(generateItem(w.rng.loot, base, w.zoneLevel), c.x, c.y, 0.8);
  } else if (!c.noLoot) {
    for (const it of rollMonsterDrops(w, c)) w.dropItem(it, c.x, c.y);
  }
}

function castGrimWard(ctx: BarbCast): void {
  const { w, tx, ty, L, p, n } = ctx;
  // le fétiche : aura alliée (dégâts améliorés et score d'attaque) ou terreur des monstres proches (D2) selon la règle skills.barbarian
  const c = corpseNear(w, tx, ty, 6);
  if (!c) return;
  c.eaten = true;
  for (const a of w.areas) if (a.kind === 'grim_ward' && a.team === 0) a.dead = true;
  const pk = emptyPacket(true);
  w.events.push({ t: 'impact', kind: 'grim_ward', x: c.x, y: c.y, radius: 1, elem: 'magic' });
  const life = t25(lin(n.duration, L));
  w.areas.push({
    id: w.newId(),
    kind: 'grim_ward',
    team: 0,
    owner: p.id,
    x: c.x,
    y: c.y,
    x2: c.x,
    y2: c.y,
    radius: bar().grimWardRadius(n.radius, L),
    life,
    maxLife: life,
    every: 5,
    dmg: pk,
    level: L,
    elem: 'magic',
    aux: 0,
    dead: false,
  });
}

/** Compétences du Barbare : identifiant → effet */
const BARBARIAN_CASTS: Record<string, (c: BarbCast) => void> = {
  bash: castBash,
  stun: castStun,
  concentrate: castConcentrate,
  berserk: castBerserk,
  double_swing: castDoubleSwing,
  frenzy: castFrenzy,
  leap: castLeap,
  leap_attack: castLeapAttack,
  whirlwind: castWhirlwind,
  double_throw: castDoubleThrow,
  split_throw: castSplitThrow,
  howl: castHowl,
  taunt: castTaunt,
  battle_cry: castBattleCry,
  war_cry: castWarCry,
  shout: castShout,
  battle_orders: castShout,
  battle_command: castShout,
  find_potion: castFindPotion,
  find_item: castFindPotion,
  grim_ward: castGrimWard,
};

/** Rebonds du Double lancer : l'arme saute d'ennemi en ennemi (10 yards), test de toucher à chaque fois */
function bounceThrow(w: World, from: Monster, bounces: number, ar: number, wdmg: number, skill: string): void {
  const hitSet = new Set<number>([from.id]);
  let cur = from;
  for (let i = 0; i < bounces; i++) {
    let next: Monster | null = null;
    let bd = yd(10);
    for (const m of w.monstersNear(cur.x, cur.y, yd(10), buf)) {
      if (m.dead || m.isSummon || hitSet.has(m.id)) continue;
      const d = dist(cur.x, cur.y, m.x, m.y);
      if (d < bd) {
        bd = d;
        next = m;
      }
    }
    if (!next) return;
    hitSet.add(next.id);
    w.events.push({ t: 'beam', kind: 'throw', points: [cur.x, cur.y, next.x, next.y], elem: 'phys' });
    if (rollHit(w, next, ar)) w.hurtMonster(next, strikePacket(w, { wdmg, thrown: true, skill }));
    cur = next;
  }
}

/** Aura du Fétiche sinistre : le Barbare dans son rayon reçoit le bonus (buff rafraîchi chaque tick) */
export function barbarianTick(w: World): void {
  if (w.tick % 5 !== 0) return;
  const p = w.player;
  // D2 : le fétiche terrorise les monstres dans son rayon (ils fuient tant qu'ils y sont)
  if (bar().grimWardFear) {
    for (const a of w.areas) {
      if (a.kind !== 'grim_ward' || a.team !== 0 || a.dead) continue;
      for (const m of w.monstersNear(a.x, a.y, a.radius, buf)) if (!m.dead && !m.isSummon && m.rank !== 'boss') m.fleeUntil = w.tick + t25(0.6);
    }
    return;
  }
  let best = 0;
  for (const a of w.areas) if (a.kind === 'grim_ward' && a.team === 0 && !a.dead && dist(p.x, p.y, a.x, a.y) <= a.radius) best = Math.max(best, a.level);
  const cur = p.buffs.find((b) => b.id === 'grim_ward');
  if (best > 0 && (!cur || cur.level !== best)) addBuff(w, 'grim_ward', best, 0.6);
  else if (best > 0 && cur) cur.until = w.tick + t25(0.6);
}
