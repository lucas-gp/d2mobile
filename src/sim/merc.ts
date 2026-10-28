/**
 * Mercenaire (PD2) : un allié persistant. Son état durable (type, sous-type, nom, mort, équipement)
 * vit sur le personnage (`CharacterState.merc`) ; en zone, c'est un `Monster` allié (`pet: 'merc'`)
 * recréé à chaque monde et ciblé par les monstres comme les créatures du Druide.
 *
 * PD2 : statistiques de base par niveau (tableaux du wiki, mêmes valeurs dans toutes les difficultés,
 * pénalité de résistance de la difficulté comprise), compétences tirées au sort à chaque attaque avec
 * leurs niveaux « durs » par niveau de mercenaire, auras natives, maîtrises (vie par victime), bonus
 * de set, armes à une main ×2 (Garde du désert, Barbare), découverte d'objets du joueur ajoutée à la
 * sienne sur ses victimes, objets éthérés sans usure.
 *
 * Adaptations mobiles (JOURNAL, lot 9) : niveau = niveau du personnage ; soigné en ville ;
 * régénère 2 % de sa vie par seconde après 3 s sans coup reçu ; survit à la mort du joueur (D2).
 */
import { MERC_BY_ID, mercVariant, type MercSkillId, type MercSlot, type MercType, type MercVariant } from '../data/mercs';
import { MERC_DEFS } from '../data/monsters';
import { SKILL_BY_ID, lin } from '../data/skills';
import type { Element } from '../data/stats';
import type { Item } from './item';
import { itemName } from './itemstats';
import { emptyPacket, type DamagePacket, type Monster } from './actors';
import type { World } from './world';
import { makeSummon } from './skills';
import { damageMonster, hitChance } from './combat';
import { spawnMissile } from './missiles';
import { isBroken, maxDurability, wear } from './durability';
import { TICK_HZ, DT } from './constants';
import { dist } from '../core/math';
import { RULES } from '../mods/rules';
import { strikeBySkill } from './merc-strike';
import { auraCache, convDefAt, mercDerived, mercKiller, mercOf, mercHardLvl, mercSkillLvl, mercType, nv, MERC_AURA_RADIUS, type MercDerived } from './merc-core';

export * from './merc-core';

const buf: Monster[] = [];

/* ------------------------------------------------------------------ */
/* En zone                                                              */
/* ------------------------------------------------------------------ */

function applyDerived(m: Monster, md: MercDerived): void {
  const ratio = m.hpMax > 0 ? m.hp / m.hpMax : 1;
  m.hpMax = md.lifeMax;
  m.hp = Math.max(1, Math.min(md.lifeMax, Math.round(md.lifeMax * ratio)));
  m.dmgMin = md.dmg[0];
  m.dmgMax = md.dmg[1];
  m.ar = md.ar;
  m.defense = md.defense;
  m.res = { ...md.res };
  m.mlvl = md.lvl;
  m.summonLevel = md.skillLvl;
}

/** Recrée le mercenaire vivant dans un monde (entrée de zone, embauche, résurrection) */
export function spawnMerc(w: World): Monster | null {
  const c = w.character;
  const st = c.merc;
  const t = mercType(c);
  if (!st || !t || st.dead) {
    syncMercAuras(w);
    return null;
  }
  const cur = mercOf(w);
  if (cur) return cur;
  const def = MERC_DEFS[t.id];
  const md = mercDerived(c, w.difficulty)!;
  const p = w.player;
  const spot = w.grid.nearestFree(p.x - Math.cos(p.facing) * 1.5, p.y - Math.sin(p.facing) * 1.5, 4) ?? { x: p.x, y: p.y };
  const m: Monster = {
    ...makeSummon(w, def),
    x: spot.x,
    y: spot.y,
    px: spot.x,
    py: spot.y,
    radius: def.radius,
    speed: t.speed,
    scale: def.scale,
    name: st.name,
    atkCd: [0, 0],
    pet: 'merc',
    spawnKey: `merc:${w.tick}`,
    hpMax: 0,
    hp: 0,
  };
  m.hpMax = md.lifeMax;
  m.hp = md.lifeMax;
  applyDerived(m, md);
  w.monsters.push(m);
  syncMercAuras(w);
  return m;
}

/** Recalcule le mercenaire en jeu (équipement, niveau) en gardant sa part de vie */
export function refreshMerc(w: World): void {
  const m = mercOf(w);
  const md = mercDerived(w.character, w.difficulty);
  if (m && md) applyDerived(m, md);
  syncMercAuras(w);
}

/** Auras du mercenaire sur le joueur : présentes tant qu'il est en vie ET à portée (rafraîchi chaque seconde) */
export function syncMercAuras(w: World): void {
  const p = w.player;
  const before = p.buffs
    .filter((b) => b.id.startsWith('maura_'))
    .map((b) => `${b.id}:${b.level}`)
    .join(',');
  p.buffs = p.buffs.filter((b) => !b.id.startsWith('maura_'));
  const mm = mercOf(w);
  const alive = !!mm && !w.character.merc?.dead;
  if (alive) {
    const md = mercDerived(w.character, w.difficulty);
    auraCache.set(mm, md?.auras ?? []);
    if (dist(mm.x, mm.y, p.x, p.y) <= MERC_AURA_RADIUS && !p.dead) for (const a of md?.auras ?? []) p.buffs.push({ id: `maura_${a.id}`, level: a.level, until: w.tick + 1e8 });
  }
  const after = p.buffs
    .filter((b) => b.id.startsWith('maura_'))
    .map((b) => `${b.id}:${b.level}`)
    .join(',');
  if (before !== after) w.refreshPlayer();
}

/** Mort du mercenaire : il reste mort jusqu'à sa résurrection en ville */
export function onMercDeath(w: World, m: Monster): void {
  const st = w.character.merc;
  if (!st) return;
  st.dead = true;
  syncMercAuras(w);
  w.events.push({ t: 'message', text: `${m.name} est mort — ressuscitez-le auprès de Qual-Kehk`, color: '#e05030' });
}

/** Maîtrise : le mercenaire regagne de la vie quand il tue un monstre */
export function onMercKill(w: World, victim: Monster): void {
  const m = mercKiller(w, victim);
  const md = m ? mercDerived(w.character, w.difficulty) : null;
  if (m && md && md.lifePerKill > 0) m.hp = Math.min(m.hpMax, m.hp + md.lifePerKill);
}

/* ------------------------------------------------------------------ */
/* Usure et Armure d'os                                                 */
/* ------------------------------------------------------------------ */

/** État de combat propre au mercenaire en zone (compétence en cours, coups reçus, Armure d'os) */
interface MercRt {
  skill: MercSkillId;
  hitTick: number;
  hp: number;
  bone: number;
}
const RT = new WeakMap<Monster, MercRt>();
function rt(m: Monster): MercRt {
  let r = RT.get(m);
  if (!r) RT.set(m, (r = { skill: 'attack', hitTick: m.lastHitTick, hp: m.hp, bone: 0 }));
  return r;
}

/** Use un objet du mercenaire, si le jeu de règles use son équipement (règle `merc.itemWear` ; PD2 : sauf les objets éthérés ; D2 : jamais) */
export function mercWear(w: World, it: Item | undefined): void {
  if (!it || !RULES['merc.itemWear'](it) || maxDurability(it) <= 0 || isBroken(it)) return;
  if (wear(it)) {
    refreshMerc(w);
    w.events.push({ t: 'message', text: `${itemName(it)} du mercenaire est brisé : à réparer chez un forgeron`, color: '#e8604a' });
  }
}

/** Coups reçus : Armure d'os (absorbe les dégâts physiques) puis usure d'une pièce d'armure (1 fois sur 4) */
function onMercHurt(w: World, m: Monster): void {
  const r = rt(m);
  if (r.bone > 0 && m.hp < r.hp) {
    const back = Math.min(r.bone, r.hp - m.hp);
    m.hp += back;
    r.bone -= back;
  }
  if (m.lastHitTick !== r.hitTick) {
    r.hitTick = m.lastHitTick;
    if (w.rng.combat.chance(0.25)) {
      const eq = w.character.merc?.equipment;
      const pieces = (['head', 'body', 'gloves', 'boots', 'belt', 'offhand'] as MercSlot[]).map((s) => eq?.[s]).filter((x): x is Item => !!x);
      if (pieces.length) mercWear(w, pieces[w.rng.combat.int(pieces.length)]);
    }
  }
  r.hp = m.hp;
}

/* ------------------------------------------------------------------ */
/* IA                                                                   */
/* ------------------------------------------------------------------ */

export function updateMerc(w: World, m: Monster): void {
  const p = w.player;
  const c = w.character;
  const t = mercType(c);
  if (!t) return;
  onMercHurt(w, m);
  for (let i = 0; i < m.atkCd.length; i++) if (m.atkCd[i] > 0) m.atkCd[i]--;
  // niveau du personnage monté : caractéristiques recalculées
  if (w.tick % TICK_HZ === m.id % TICK_HZ) {
    if (m.mlvl !== c.level) refreshMerc(w);
    const md = mercDerived(c, w.difficulty);
    // soins : en ville, et hors combat (3 s sans coup reçu) ; régénération de la maîtrise (Ascendant)
    if (w.zone.town) m.hp = m.hpMax;
    else if (w.tick - m.lastHitTick > TICK_HZ * 3) m.hp = Math.min(m.hpMax, m.hp + m.hpMax * 0.02);
    if (md?.regen) m.hp = Math.min(m.hpMax, m.hp + md.regen);
    if (md) auraPulse(w, m, md);
    syncMercAuras(w);
    rt(m).hp = m.hp;
  }
  if (m.stunT > 0) {
    m.stunT--;
    return;
  }
  if (m.freezeT > 0) {
    m.freezeT--;
    return;
  }
  const dp = dist(m.x, m.y, p.x, p.y);
  if (dp > 18 || (p.dead && dp > 6)) {
    const spot = w.grid.nearestFree(p.x - Math.cos(p.facing) * 1.5, p.y - Math.sin(p.facing) * 1.5, 3) ?? { x: p.x, y: p.y };
    m.x = m.px = spot.x;
    m.y = m.py = spot.y;
    m.tgt = 0;
    m.mode = 'idle';
    return;
  }
  if (m.mode === 'attack' || m.mode === 'cast') {
    m.modeT++;
    if (!m.atkApplied && m.modeT >= Math.max(4, Math.round(m.modeLen * 0.55))) {
      m.atkApplied = true;
      mercStrike(w, m, t);
    }
    if (m.modeT >= m.modeLen) m.mode = 'idle';
    return;
  }
  if (w.zone.town || p.dead) {
    follow(w, m, 2.5);
    return;
  }
  // cible : l'ennemi le plus proche autour du joueur (re-choisie toutes les 0,4 s)
  let tg = m.tgt ? w.monsters.find((x) => x.id === m.tgt && !x.dead && !x.isSummon) : undefined;
  if (!tg || w.tick % 10 === m.id % 10) {
    tg = undefined;
    let bd = Infinity;
    for (const o of w.monstersNear(p.x, p.y, 11, buf)) {
      const dd = dist(m.x, m.y, o.x, o.y);
      if (dd < bd && w.grid.lineOfSight(m.x, m.y, o.x, o.y)) {
        bd = dd;
        tg = o;
      }
    }
    m.tgt = tg?.id ?? 0;
  }
  if (!tg) {
    follow(w, m, 2.5);
    return;
  }
  const d = dist(m.x, m.y, tg.x, tg.y);
  const reach = d - m.radius - tg.radius;
  m.facing = Math.atan2(tg.y - m.y, tg.x - m.x);
  // PD2 : les lanceurs de sorts (Loup de fer, Ascendant) n'attaquent jamais de leur arme
  const melee = t.style === 'melee';
  if (reach <= t.range && (melee || w.grid.lineOfSight(m.x, m.y, tg.x, tg.y))) {
    // à distance, garder ses distances quand un monstre colle (archère)
    if (reach < 1.2 && t.style === 'bow' && w.tick % 3 === 0) {
      const md = Math.max(0.01, d);
      if (moveFree(w, m, (m.x - tg.x) / md, (m.y - tg.y) / md)) return;
    }
    if (m.atkCd[0] <= 0) {
      const md = mercDerived(c, w.difficulty)!;
      const sk = pickSkill(w, md, mercVariant(t, c.merc!.variant));
      rt(m).skill = sk;
      m.mode = !melee ? 'cast' : 'attack';
      m.modeT = 0;
      m.modeLen = Math.max(8, Math.round(md.atkTicks * 0.8));
      m.atkApplied = false;
      m.atkCd[0] = md.atkTicks;
      m.atkTarget = { x: tg.x, y: tg.y };
      m.phase = melee ? 1 : 0;
    } else m.mode = 'idle';
    return;
  }
  const dd = Math.max(0.01, d);
  moveFree(w, m, (tg.x - m.x) / dd, (tg.y - m.y) / dd);
}

/** Tirage de la compétence (probabilités du wiki), parmi celles que son niveau lui a apprises */
function pickSkill(w: World, md: MercDerived, v: MercVariant): MercSkillId {
  // compétences et poids : modèle du jeu de règles (D2 : Hireling.txt selon le niveau ; PD2 : probabilités du wiki)
  const c = w.character;
  const t = c.merc ? MERC_BY_ID[c.merc.type] : undefined;
  const list = t ? RULES['merc.model']().skillWeights(t, v, md.lvl, c.merc?.hire ?? 0) : v.skills;
  const avail = (list as MercVariant['skills']).filter((s) => s.id === 'attack' || mercSkillLvl(s.id, md.lvl, 0, c) > 0);
  if (!avail.length) return v.skills[0].id;
  let r = w.rng.ai.float(
    0,
    avail.reduce((a, s) => a + s.pct, 0),
  );
  for (const s of avail) if ((r -= s.pct) < 0) return s.id;
  return avail[avail.length - 1].id;
}

function follow(w: World, m: Monster, keep: number): void {
  const p = w.player;
  const d = dist(m.x, m.y, p.x, p.y);
  if (d <= keep) {
    m.mode = 'idle';
    return;
  }
  const f = w.dirToPlayer(m);
  const bx = m.x;
  const by = m.y;
  moveFree(w, m, f.x, f.y);
  w.allyStuck(m, dist(bx, by, m.x, m.y), m.speed, d);
}

function moveFree(w: World, m: Monster, dx: number, dy: number): boolean {
  const s = m.speed * (m.chillT > 0 ? 1 - m.chillPct : 1) * DT;
  m.facing = Math.atan2(dy, dx);
  m.mode = 'walk';
  if (w.moveActor(m, dx * s, dy * s, false)) return true;
  // contourner : glisser le long de l'obstacle
  return w.moveActor(m, -dy * s, dx * s, false) || w.moveActor(m, dy * s, -dx * s, false);
}

const isUndead = (o: Monster) => o.def.family === 'undead' || o.def.family === 'skeleton';

function mercStrike(w: World, m: Monster, t: MercType): void {
  const tg = m.tgt ? w.monsters.find((x) => x.id === m.tgt && !x.dead) : undefined;
  const c = w.character;
  const md = mercDerived(c, w.difficulty);
  if (!md || !c.merc) return;
  const skill = rt(m).skill;
  const L = mercSkillLvl(skill, md.lvl, md.allSkills, c);
  const SL = (id: string) => mercHardLvl(id, md.lvl, c); // niveaux durs (synergies)
  const ang = tg ? Math.atan2(tg.y - m.y, tg.x - m.x) : m.facing;
  const rng = w.rng.combat;
  const rr = (a: number, b: number) => rng.float(a, Math.max(a, b));
  /** Coup d'arme : dégâts bruts × (1 + bonus % + compétence %) */
  const phys = (wdmg = 0) => rr(md.raw[0], md.raw[1]) * (1 + (md.dmgPct + wdmg) / 100);
  const addElem = (pk: DamagePacket, mul = 1) => {
    for (const [e, r] of Object.entries(md.added) as ['fire' | 'cold' | 'light' | 'magic' | 'poison', [number, number]][]) pk[e] += rr(r[0], r[1]) * mul;
    if (pk.cold > 0 && !pk.chill) {
      pk.chill = TICK_HZ * 2;
      pk.chillPct = 0.4;
    }
  };
  const mast = 1 + md.mastery / 100;
  const shoot = (kind: string, pk: DamagePacket, elem: Element, opts: { angle?: number; pierce?: boolean; aux?: number; arPct?: number; weapon?: boolean } = {}) => {
    if (opts.weapon !== false && t.style === 'bow') {
      pk.ar = md.ar * (1 + (opts.arPct ?? 0) / 100);
      pk.pierceChance = Math.min(100, md.pierce);
      pk.pierceRes = md.pierceRes;
      pk.ranged = true;
    }
    pk.skill = skill;
    spawnMissile(w, { kind, team: 0, owner: m.id, x: m.x, y: m.y, angle: opts.angle ?? ang, speed: 16, radius: 0.32, range: t.range + 4, dmg: pk, elem, pierce: opts.pierce, aux: opts.aux, level: L });
  };
  const meleeHit = (o: Monster, pk: DamagePacket, arPct = 0): boolean => {
    if (!rng.chance(hitChance(m.ar * (1 + arPct / 100), o.defense * (o.defMul ?? 1) * (1 - convDefAt(w, o.x, o.y) / 100), m.mlvl, o.mlvl))) return false;
    if (md.deadly > 0 && rng.chance(md.deadly / 100)) pk.phys *= 2;
    pk.crush = md.crush;
    pk.skill = skill;
    leech(m, md, damageMonster(w, o, pk, m));
    mercWear(w, c.merc?.equipment.mainhand && rng.chance(1 / 12) ? c.merc.equipment.mainhand : undefined);
    return true;
  };
  const inReach = (o: Monster | undefined): o is Monster => !!o && !o.dead && dist(m.x, m.y, o.x, o.y) - m.radius - o.radius <= t.range + 0.6;

  strikeBySkill({ w, m, t, tg, c, md, skill, L, SL, ang, rng, rr, phys, addElem, shoot, meleeHit, inReach, mast, isUndead, rt, syncMercAuras });
}

function leech(m: Monster, md: MercDerived, dealt: number): void {
  if (md.lifeLeech > 0 && dealt > 0) m.hp = Math.min(m.hpMax, m.hp + (dealt * md.lifeLeech) / 100);
}

/** Auras à effet périodique (chaque seconde) : Prière (soins), Choc sacré (foudre), Sanctuaire (morts-vivants) */
function auraPulse(w: World, m: Monster, md: MercDerived): void {
  for (const a of md.auras) {
    const L = a.level;
    if (a.id === 'prayer') {
      // même mise à l'échelle que la Prière du Paladin (vie du joueur)
      const p = w.player;
      const heal = nv('prayer', 'value', L);
      if (!p.dead && dist(m.x, m.y, p.x, p.y) <= MERC_AURA_RADIUS) p.hp = Math.min(p.hpMax, p.hp + heal * (1 + p.hpMax / 400));
      m.hp = Math.min(m.hpMax, m.hp + heal * (1 + m.hpMax / 400));
    } else if ((a.id === 'holy_shock' || a.id === 'sanctuary' || a.id === 'holy_freeze' || a.id === 'holy_fire') && !w.zone.town) {
      const e: Element = a.id === 'holy_shock' ? 'light' : a.id === 'sanctuary' ? 'magic' : a.id === 'holy_freeze' ? 'cold' : 'fire';
      const r = Math.max(2.5, lin(SKILL_BY_ID[a.id].n.radius, L));
      let hit = false;
      for (const o of w.monstersNear(m.x, m.y, r, buf)) {
        if (a.id === 'sanctuary' && !isUndead(o)) continue;
        const pk = emptyPacket(true);
        pk[e] = rr2(w, nv(a.id, 'min', L), nv(a.id, 'max', L));
        if (a.id === 'sanctuary') {
          pk.magic *= 1 + nv('sanctuary', 'value', L) / 100;
          pk.knockback = 0.9;
          pk.srcX = m.x;
          pk.srcY = m.y;
        }
        if (a.id === 'holy_freeze') {
          pk.chill = TICK_HZ + 5;
          pk.chillPct = nv('holy_freeze', 'value', L) / 100;
        }
        pk.skill = a.id;
        damageMonster(w, o, pk, m);
        hit = true;
      }
      if (hit) w.events.push({ t: 'nova', kind: a.id, x: m.x, y: m.y, radius: r, elem: e });
    }
  }
}

const rr2 = (w: World, a: number, b: number) => w.rng.combat.float(a, Math.max(a, b));
