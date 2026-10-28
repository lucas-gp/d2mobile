/**
 * Créatures invoquées des classes D2 : squelettes, mages squelettes, golems (argile, sang, fer,
 * feu), morts ressuscités, murs et prison d'os du Nécromancien ; Valkyrie et Leurre de l'Amazone ;
 * Guerrière et Maître de l'ombre de l'Assassin. Elles réutilisent l'IA des créatures du Druide
 * (druid.ts : updatePet, hurtPet) ; ici, leurs caractéristiques tirées des tables D2 (life, dégâts,
 * score d'attaque) mises à l'échelle du niveau du personnage comme les monstres du jeu.
 */
import { SKILL_BY_ID, lin, skillHard, ramp, synergyPct, type SorcSkill } from '../data/skills';
import type { Element } from '../data/stats';
import { PET_DEFS } from '../data/monsters';
import { monsterAr, monsterDmg, monsterHp } from '../data/curves';
import { dist, TAU } from '../core/math';
import type { Monster, Player } from './actors';
import { TICK_HZ } from './constants';
import { makeSummon } from './skills';
import { corpseNear } from './barbarian';
import type { World } from './world';
import { RULES } from '../mods/rules';

/** PD2 : golems multiples (Maîtrise des golems), Valkyries multiples (niveaux 20 et 30), une seule ombre */
const GOLEMS = ['clay_golem', 'blood_golem', 'iron_golem', 'fire_golem'];
const SHADOWS = ['shadow_warrior', 'shadow_master'];
/** PD2 : synergies de dégâts des golems entre eux et avec la Maîtrise des golems (% par point investi) */
const GOLEM_SYN: Record<string, [number, string[]]> = {
  clay_golem: [40, ['golem_mastery', 'blood_golem', 'iron_golem', 'fire_golem']],
  blood_golem: [12, ['golem_mastery', 'clay_golem', 'iron_golem', 'fire_golem']],
  iron_golem: [20, ['golem_mastery', 'clay_golem', 'blood_golem', 'fire_golem']],
  fire_golem: [9, ['golem_mastery', 'clay_golem', 'blood_golem', 'iron_golem']],
};

/** Multiplicateur de dégâts des synergies PD2 d'un golem */
export function golemSynergy(w: World, id: string): number {
  const g = GOLEM_SYN[id];
  if (!g || !RULES['skills.necromancer']().golemSynergies) return 1;
  let pts = 0;
  for (const o of g[1]) pts += w.player.d.hardPoints[o] ?? 0;
  return 1 + (g[0] * pts) / 100;
}

const HP_REF = 200;
const DMG_REF = 40;

const lvlOf = (w: World, id: string): number => w.player.d.skillLevels[id] ?? 0;
const nv = (id: string, key: 'min' | 'max' | 'ar' | 'wdmg', L: number): number => {
  const r = SKILL_BY_ID[id].n[key];
  return r ? ramp(r, L) : 0;
};

/** Minions du type donné en jeu */
export function minionsOf(w: World, ...ids: string[]): Monster[] {
  return w.monsters.filter((m) => m.pet && !m.dead && ids.includes(m.pet));
}

function kill(w: World, m: Monster): void {
  if (!m.dead) w.killMonster(m, null);
}

export interface Stats {
  hp: number;
  dmg: [number, number];
  ar: number;
  def: number;
  res?: number;
  speed?: number;
  element?: Element;
}

/** Caractéristiques d'une créature à partir de ses tables D2 */
/** Équilibrage du Nécromancien : ses créatures comptent pour toute sa puissance (le kit de référence n'a pas d'objets d'invocation) */
const NEC_BOOST = { hp: 3, dmg: 3.5 };

export function minionStats(w: World, id: string, L: number): Stats {
  const st = baseStats(w, id, L);
  if (id === 'raise_skeleton' || id === 'skeletal_mage' || id === 'raise_skeleton_archer' || GOLEMS.includes(id)) {
    // les Enfers exigent des invocations d'objets (+ compétences) : l'écart se comble en partie ici
    const hp = NEC_BOOST.hp * (1 + 0.6 * w.difficulty);
    const dmg = NEC_BOOST.dmg * (1 + 0.9 * w.difficulty);
    st.hp *= hp;
    st.dmg = [st.dmg[0] * dmg, st.dmg[1] * dmg];
  }
  return st;
}

function baseStats(w: World, id: string, L: number): Stats {
  const st = rawStats(w, id, L);
  // PD2 : synergies de dégâts (Maîtrise des squelettes, golems entre eux)
  let k = 1;
  if (id === 'raise_skeleton' || id === 'raise_skeleton_archer') k = 1 + synergyPct(SKILL_BY_ID[id], w.player.d.hardPoints) / 100;
  else if (id === 'skeletal_mage') {
    const sm = lvlOf(w, 'skeleton_mastery');
    k = 1 + (sm > 0 && SKILL_BY_ID.skeleton_mastery.n.v5 ? lin(SKILL_BY_ID.skeleton_mastery.n.v5, sm) : 0) / 100;
  } else if (GOLEMS.includes(id)) k = golemSynergy(w, id);
  if (k !== 1) st.dmg = [st.dmg[0] * k, st.dmg[1] * k];
  return st;
}

function rawStats(w: World, id: string, L: number): Stats {
  const d = w.player.d;
  const clvl = w.character.level;
  const hpK = monsterHp(clvl) / HP_REF;
  const dmgK = monsterDmg(clvl) / DMG_REF;
  const arOf = (tbl: number): number => monsterAr(clvl) * (1 + tbl / 300);
  const sm = lvlOf(w, 'skeleton_mastery');
  const gm = lvlOf(w, 'golem_mastery');
  const res = 0;
  const skelLife = sm > 0 ? lin(SKILL_BY_ID.skeleton_mastery.n.value, sm) : 0;
  const skelDmg = sm > 0 ? lin(SKILL_BY_ID.skeleton_mastery.n.value2, sm) : 0;
  // PD2 : vitesse des guerriers (v3) et des mages et archers (v4) selon la Maîtrise des squelettes
  const warVel = sm > 0 ? 1 + lin(SKILL_BY_ID.skeleton_mastery.n.v3!, sm) / 100 : 1;
  const magVel = sm > 0 ? 1 + lin(SKILL_BY_ID.skeleton_mastery.n.v4!, sm) / 100 : 1;
  const gLife = gm > 0 ? 1 + lin(SKILL_BY_ID.golem_mastery.n.value, gm) / 100 : 1;
  const gAr = gm > 0 ? lin(SKILL_BY_ID.golem_mastery.n.v3, gm) : 0;
  const gSpd = gm > 0 ? 1 + lin(SKILL_BY_ID.golem_mastery.n.value2, gm) / 100 : 1;
  switch (id) {
    case 'raise_skeleton': {
      const lo = nv(id, 'min', L) + skelDmg;
      const hi = nv(id, 'max', L) + skelDmg;
      return { hp: (lin(SKILL_BY_ID[id].n.life, L) + skelLife) * hpK, dmg: [lo * dmgK, hi * dmgK], ar: arOf(nv(id, 'ar', L)), def: monsterAr(clvl) * 0.3, res, speed: 5.2 * warVel };
    }
    case 'skeletal_mage': {
      const avg = (3 + 1.5 * sm + 1.2 * L + skelDmg * 0.6) * dmgK;
      return { hp: (lin(SKILL_BY_ID[id].n.life, L) + skelLife) * hpK, dmg: [avg * 0.7, avg * 1.3], ar: arOf(100), def: 20 + lin(SKILL_BY_ID[id].n.value, L), res, speed: 5 * magVel };
    }
    case 'raise_skeleton_archer': {
      const avg = (4 + 1.4 * L + skelDmg * 0.7) * dmgK;
      return { hp: (lin(SKILL_BY_ID[id].n.life, L) + skelLife) * hpK * 0.8, dmg: [avg * 0.7, avg * 1.3], ar: arOf(120), def: 20, res, speed: 5 * magVel };
    }
    case 'clay_golem':
      return {
        hp: lin(SKILL_BY_ID[id].n.life, L) * gLife * hpK * 1.5,
        dmg: [nv(id, 'min', L) * dmgK * 1.4, nv(id, 'max', L) * dmgK * 1.4],
        ar: arOf(nv(id, 'ar', L) + gAr),
        def: 20,
        res,
        speed: 4.2 * gSpd,
      };
    case 'blood_golem':
      return { hp: 201 * gLife * hpK * 1.5, dmg: [nv(id, 'min', L) * dmgK * 1.6, nv(id, 'max', L) * dmgK * 1.6], ar: arOf(150 + gAr), def: 80, res, speed: 4.6 * gSpd };
    case 'iron_golem': {
      const avg = (12 + 4.5 * L) * dmgK * 1.6;
      return { hp: 321 * gLife * hpK * 1.5, dmg: [avg * 0.7, avg * 1.3], ar: arOf(100 + gAr), def: lin(SKILL_BY_ID[id].n.v3, L), res, speed: 4.4 * gSpd };
    }
    case 'fire_golem':
      return {
        hp: 328 * gLife * hpK * 1.5,
        dmg: [nv(id, 'min', L) * dmgK, nv(id, 'max', L) * dmgK],
        ar: arOf(140 + gAr),
        def: 235,
        res: Math.max(res, lin(SKILL_BY_ID[id].n.value, L)),
        speed: 4.8 * gSpd,
        element: 'fire',
      };
    case 'valkyrie': {
      // synergies de Leurre (dégâts) et de Pénétration (score d'attaque) : règle skills.amazon (D2 : aucune) ; résistances de la table
      const hardP = d.hardPoints;
      const va = RULES['skills.amazon']();
      const base = (8 + 2.2 * clvl) * (1 + nv(id, 'wdmg', L) / 100 + (va.valkyrieDecoyDmgPct / 100) * (hardP.decoy ?? 0)) * 1.4;
      return {
        hp: lin(SKILL_BY_ID[id].n.life, L) * hpK * 0.9,
        dmg: [base * 0.75, base * 1.25],
        ar: arOf(nv(id, 'ar', L) + va.valkyriePenetrateAr * (hardP.penetrate ?? 0)),
        def: monsterAr(clvl) * (0.4 + lin(SKILL_BY_ID[id].n.value, L) / 200),
        res: Math.min(75, lin(SKILL_BY_ID[id].n.value2!, L)),
        speed: 6.2,
      };
    }
    case 'decoy': {
      // PD2 : le Leurre tire des flèches de dégâts physiques fixes de la table (synergies : +10 % par point de Mitraille et de Valkyrie)
      const syn = 1 + synergyPct(SKILL_BY_ID[id], d.hardPoints) / 100;
      return {
        hp: monsterHp(clvl) * 1.5 * (1 + lin(SKILL_BY_ID[id].n.value, L) / 100),
        dmg: [nv(id, 'min', L) * syn, nv(id, 'max', L) * syn],
        ar: monsterAr(clvl),
        def: 50,
        res: Math.min(85, lin(SKILL_BY_ID[id].n.value2!, L)),
        speed: 0,
      };
    }
    case 'shadow_warrior':
    case 'shadow_master': {
      const wAvg = (d.weaponDmg[0] + d.weaponDmg[1]) / 2;
      const r = id === 'shadow_master' ? lin(SKILL_BY_ID[id].n.value, L) : 0;
      return {
        hp: lin(SKILL_BY_ID[id].n.life, L) * hpK,
        dmg: [wAvg * 0.8, wAvg * 1.2],
        ar: arOf(nv(id, 'ar', L)),
        def: monsterAr(clvl) * (0.4 + (SKILL_BY_ID[id].n.value ? lin(SKILL_BY_ID[id].n.value, L) / 300 : 0)),
        res: r,
        speed: 6,
      };
    }
  }
  return { hp: 10, dmg: [1, 2], ar: 50, def: 20 };
}

function build(w: World, id: string, defId: string, st: Stats, x: number, y: number): Monster {
  const def = PET_DEFS[defId];
  if (!def) throw new Error(`Créature inconnue : ${defId}`);
  const spot = w.grid.nearestFree(x, y, 3) ?? { x: w.player.x, y: w.player.y };
  const m: Monster = {
    ...makeSummon(w, def),
    x: spot.x,
    y: spot.y,
    px: spot.x,
    py: spot.y,
    radius: def.radius,
    hp: Math.max(5, st.hp),
    hpMax: Math.max(5, st.hp),
    dmgMin: st.dmg[0],
    dmgMax: st.dmg[1],
    ar: st.ar,
    defense: st.def,
    mlvl: w.character.level,
    speed: st.speed ?? def.speed,
    scale: def.scale,
    tint: def.tint ?? 0xffffff,
    name: def.name,
    atkCd: [0],
    summonSkill: id,
    summonLevel: lvlOf(w, id),
    pet: id === 'bone_prison' ? 'bone_wall' : id,
  };
  if (st.res) for (const e of ['fire', 'cold', 'light', 'poison', 'magic'] as Element[]) m.res[e] = Math.min(90, st.res);
  // Résistance des invocations (D2) : résistances de toutes les créatures invoquées
  const sr = lvlOf(w, 'summon_resist');
  if (sr > 0 && SKILL_BY_ID.summon_resist) for (const e of ['fire', 'cold', 'light', 'poison'] as Element[]) m.res[e] = Math.min(90, m.res[e] + lin(SKILL_BY_ID.summon_resist.n.value, sr));
  // Golem de fer immunisé au poison : règle skills.necromancer (D2 : non)
  if (id === 'iron_golem' && RULES['skills.necromancer']().ironGolemPoisonImmune) m.res.poison = 100;
  if (st.element) m.aura = st.element;
  w.monsters.push(m);
  w.events.push({ t: 'impact', kind: 'summon_pet', x: m.x, y: m.y, radius: 1, elem: 'magic' });
  return m;
}

const MAGE_ELEMENTS: Element[] = ['fire', 'cold', 'light', 'poison'];

/** Invoque la ou les créatures d'une compétence. `L` : niveau effectif. */
/** « X % de chances de ranimer le monstre tué en Revenant » (Toucher de la mort) : un allié à moitié de vie, au plus six */
export function reanimateReturned(w: World, c: Monster): void {
  if (c.def.family === 'pet' || c.isSummon || c.rank === 'boss' || c.pet) return;
  const mine = w.monsters.filter((m) => m.pet === 'returned' && !m.dead);
  while (mine.length >= 6) kill(w, mine.shift()!);
  const spot = w.grid.nearestFree(c.x, c.y, 3) ?? { x: c.x, y: c.y };
  const r: Monster = {
    ...makeSummon(w, c.def),
    x: spot.x,
    y: spot.y,
    px: spot.x,
    py: spot.y,
    radius: c.radius,
    hp: c.hpMax * 0.5,
    hpMax: c.hpMax * 0.5,
    dmgMin: c.dmgMin * 0.6,
    dmgMax: c.dmgMax * 0.6,
    ar: c.ar,
    defense: c.defense,
    mlvl: c.mlvl,
    speed: c.speed,
    scale: c.scale,
    tint: c.tint,
    name: 'Revenant',
    res: { ...c.res },
    atkCd: [0],
    pet: 'returned',
    expireTick: w.tick + 60 * TICK_HZ,
  };
  w.monsters.push(r);
  w.events.push({ t: 'impact', kind: 'summon_pet', x: r.x, y: r.y, radius: 1, elem: 'magic' });
}

/** Plafond d'un type de créature (0 : pas de plafond propre) ; partagé par l'invocation et la barre d'invocations du HUD */
export function minionCap(w: World, id: string, L: number): number {
  const p = w.player;
  const s = SKILL_BY_ID[id];
  switch (id) {
    case 'raise_skeleton':
    case 'raise_skeleton_archer':
    case 'skeletal_mage':
      // guerriers selon la table du niveau ; mages : règle skills.necromancer (D2 : comme les guerriers) ; archers selon les points investis (8 au plus)
      return (
        Math.min(
          8,
          id === 'raise_skeleton'
            ? Math.floor(lin(s.n.count, L))
            : id === 'skeletal_mage'
              ? RULES['skills.necromancer']().mageCount(s.n.count, L, p.d.hardPoints[id] ?? 0)
              : skillHard(id, 'Number of Archers', p.d.hardPoints[id] ?? 0) || 1,
        ) + (p.d.all.get(`extraSummon:${id}`) ?? 0)
      );
    case 'clay_golem':
    case 'blood_golem':
    case 'iron_golem':
    case 'fire_golem':
      // PD2 : un golem de plus tous les 5 points de Maîtrise des golems (plafond commun à tous les golems)
      return Math.max(1, skillHard('golem_mastery', 'Number of Golems', p.d.hardPoints.golem_mastery ?? 0)) + (p.d.all.get('extraSummon:golem_mastery') ?? 0);
    case 'revive':
      return RULES['skills.necromancer']().reviveCount(s.n.count, L, p.d.hardPoints.revive ?? 0) + (p.d.all.get('extraSummon:revive') ?? 0);
    case 'valkyrie':
      return Math.max(1, Math.floor(lin(s.n.count, L)));
    case 'decoy':
      return Math.max(1, skillHard('decoy', 'Number of Decoys', p.d.hardPoints.decoy ?? 0));
    default:
      return 0;
  }
}

/** Invocation en cours : compétence, niveau, point visé, statistiques des créatures, point d'apparition entre le joueur et la cible */
interface SummonCtx {
  w: World;
  id: string;
  L: number;
  tx: number;
  ty: number;
  p: Player;
  s: SorcSkill;
  st: ReturnType<typeof minionStats>;
  spawnAt: (x: number, y: number) => { x: number; y: number };
}

export function summonMinion(w: World, id: string, L: number, tx: number, ty: number): void {
  const p = w.player;
  const s = SKILL_BY_ID[id];
  const st = minionStats(w, id, L);
  const spawnAt = (x: number, y: number): { x: number; y: number } => ({ x: (x + p.x) / 2, y: (y + p.y) / 2 });
  const run = Object.prototype.hasOwnProperty.call(SUMMONS, id) ? SUMMONS[id] : undefined;
  if (run) {
    run({ w, id, L, tx, ty, p, s, st, spawnAt });
    return;
  }
  void dist;
}

function summonRaiseSkeleton({ w, id, L, tx, ty, p, st }: SummonCtx): void {
  // D2 : il faut un cadavre (le plus proche du point visé, sinon du Nécromancien)
  const c = corpseNear(w, tx, ty, 6) ?? corpseNear(w, p.x, p.y, 9);
  if (!c) {
    w.events.push({ t: 'message', text: 'Aucun cadavre à relever', color: '#9aa' });
    return;
  }
  c.eaten = true;
  c.deathTick = Math.min(c.deathTick, w.tick - TICK_HZ * 11);
  // PD2 : nombre de guerriers selon la table du niveau, de mages et d'archers selon les points investis (8 au plus)
  const max = minionCap(w, id, L);
  const mine = minionsOf(w, id);
  while (mine.length >= max) kill(w, mine.shift()!);
  const m = build(w, id, id === 'raise_skeleton' ? 'skeleton' : id, st, c.x, c.y);
  if (id === 'skeletal_mage') m.aura = MAGE_ELEMENTS[w.rng.combat.int(MAGE_ELEMENTS.length)];
}

function summonClayGolem({ w, id, L, tx, ty, st, spawnAt }: SummonCtx): void {
  // PD2 : un golem de plus tous les 5 points de Maîtrise des golems ; un seul Golem de fer
  const golems = minionsOf(w, ...GOLEMS);
  const max = minionCap(w, id, L);
  if (id === 'iron_golem') for (const g of minionsOf(w, 'iron_golem')) kill(w, golems.splice(golems.indexOf(g), 1)[0]);
  while (golems.length >= max) kill(w, golems.shift()!);
  const sp = spawnAt(tx, ty);
  const m = build(w, id, id, st, sp.x, sp.y);
  if (id === 'fire_golem') w.events.push({ t: 'nova', kind: 'golem_fire', x: m.x, y: m.y, radius: 2.5, elem: 'fire' });
}

function summonRevive({ w, id, L, tx, ty, p, s }: SummonCtx): void {
  // PD2 : 3 ressuscités, puis un de plus tous les 4 points investis (8 au plus)
  const n = minionCap(w, id, L);
  const list = minionsOf(w, 'revive');
  for (let i = 0; i < n; i++) {
    const c = corpseNear(w, tx, ty, 7) ?? corpseNear(w, p.x, p.y, 10);
    if (!c || c.def.family === 'pet') break;
    c.eaten = true;
    c.deathTick = Math.min(c.deathTick, w.tick - TICK_HZ * 11);
    // PD2 : plus d'effet de la Maîtrise des squelettes ; dégâts physiques +30 %/niveau et +20 %/niveau de Profanation
    const lifeMul = 3;
    const dmgMul = 1 + (lin(s.n.value!, L) + synergyPct(SKILL_BY_ID.revive, w.player.d.hardPoints)) / 100;
    const spot = w.grid.nearestFree(c.x, c.y, 3) ?? { x: c.x, y: c.y };
    const r: Monster = {
      ...makeSummon(w, c.def),
      x: spot.x,
      y: spot.y,
      px: spot.x,
      py: spot.y,
      radius: c.radius,
      hp: c.hpMax * lifeMul * 0.5,
      hpMax: c.hpMax * lifeMul * 0.5,
      dmgMin: c.dmgMin * dmgMul * 0.6,
      dmgMax: c.dmgMax * dmgMul * 0.6,
      ar: c.ar,
      defense: c.defense,
      mlvl: c.mlvl,
      speed: c.speed * 1.5,
      scale: c.scale,
      tint: c.tint,
      name: `${c.name} (ressuscité)`,
      res: { ...c.res },
      atkCd: [0],
      summonSkill: id,
      summonLevel: L,
      pet: 'revive',
      expireTick: w.tick + Math.round(lin(s.n.duration, L) * TICK_HZ),
    };
    while (list.length >= n) kill(w, list.shift()!);
    w.monsters.push(r);
    list.push(r);
    w.events.push({ t: 'impact', kind: 'summon_pet', x: r.x, y: r.y, radius: 1, elem: 'magic' });
  }
}

function summonValkyrie({ w, id, L, tx, ty, st, spawnAt }: SummonCtx): void {
  // PD2 : 2e Valkyrie au niveau 20, 3e au niveau 30
  const vk = minionsOf(w, 'valkyrie');
  while (vk.length >= minionCap(w, id, L)) kill(w, vk.shift()!);
  const sp = spawnAt(tx, ty);
  build(w, id, 'valkyrie', st, sp.x, sp.y);
}

function summonDecoy({ w, id, L, tx, ty, s, st }: SummonCtx): void {
  const dc = minionsOf(w, 'decoy');
  while (dc.length >= minionCap(w, id, L)) kill(w, dc.shift()!);
  const m = build(w, id, 'decoy', st, tx, ty);
  m.expireTick = w.tick + Math.round(lin(s.n.duration, L) * TICK_HZ);
}

function summonShadowWarrior({ w, id, tx, ty, st, spawnAt }: SummonCtx): void {
  for (const v of minionsOf(w, ...SHADOWS)) kill(w, v);
  const sp = spawnAt(tx, ty);
  build(w, id, id, st, sp.x, sp.y);
  // « vous pouvez invoquer une ombre supplémentaire » (Odium de Natalya)
  if ((w.player.d.all.get('extraShadow') ?? 0) > 0) build(w, id, id, st, sp.x + 1.2, sp.y);
}

function summonBoneWall({ w, id, L, tx, ty, p, s }: SummonCtx): void {
  // murs d'os : des obstacles dotés de vie, qui attirent les coups des monstres
  // PD2 : synergies de vie de Mur et de Prison d'os (+5 % par point de l'autre et d'Armure d'os)
  const hp = lin(s.n.life, L) * (1 + synergyPct(s, w.player.d.hardPoints) / 100) * (monsterHp(w.character.level) / 20) * (1 + w.difficulty);
  const dur = Math.round(lin(s.n.duration, L) * TICK_HZ);
  const count = id === 'bone_wall' ? 3 : 8;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    if (id === 'bone_wall') {
      const off = (i - 1) * 0.9;
      x = tx + Math.cos(ang + Math.PI / 2) * off;
      y = ty + Math.sin(ang + Math.PI / 2) * off;
    } else {
      const a = (i / count) * TAU;
      x = tx + Math.cos(a) * 1.6;
      y = ty + Math.sin(a) * 1.6;
    }
    const m = build(w, id, 'bone_wall', { hp, dmg: [0, 0], ar: 0, def: 0, speed: 0 }, x, y);
    m.expireTick = w.tick + dur;
    m.dmgMax = 0;
  }
}

/** Invocations du Nécromancien par compétence */
const SUMMONS: Record<string, (c: SummonCtx) => void> = {
  raise_skeleton: summonRaiseSkeleton,
  raise_skeleton_archer: summonRaiseSkeleton,
  skeletal_mage: summonRaiseSkeleton,
  clay_golem: summonClayGolem,
  blood_golem: summonClayGolem,
  iron_golem: summonClayGolem,
  fire_golem: summonClayGolem,
  revive: summonRevive,
  valkyrie: summonValkyrie,
  decoy: summonDecoy,
  shadow_warrior: summonShadowWarrior,
  shadow_master: summonShadowWarrior,
  bone_wall: summonBoneWall,
  bone_prison: summonBoneWall,
};
