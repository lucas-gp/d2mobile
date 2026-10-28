/**
 * Coups du mercenaire : une fonction par compétence (Éclaireuse, Mage du feu, Nécromancien, Paladin, Barbare…),
 * répartie par table. Le contexte (dégâts d'arme, tir, coup de mêlée, portée) est construit par `mercStrike` (merc.ts).
 */
import type { CharacterState } from './character-state';
import { type MercSkillId, type MercType } from '../data/mercs';
import type { Element } from '../data/stats';
import type {} from './item';
import { emptyPacket, type DamagePacket, type Monster } from './actors';
import type { World } from './world';
import { damageMonster } from './combat';
import { spawnArea } from './missiles';
import { debuff } from './barbarian';
import { TICK_HZ } from './constants';
import { dist, TAU } from '../core/math';
import { mercTables, mtab, nv, MERC_AURA_RADIUS, type MercDerived } from './merc-core';

/** Contexte d'un coup de mercenaire : acteurs, statistiques dérivées et aides de dégâts */
export interface MercStrikeCtx {
  w: World;
  m: Monster;
  t: MercType;
  tg: Monster | undefined;
  c: CharacterState;
  md: MercDerived;
  skill: MercSkillId;
  L: number;
  /** Niveaux durs (synergies) */
  SL: (id: string) => number;
  ang: number;
  rng: World['rng']['combat'];
  rr: (a: number, b: number) => number;
  /** Coup d'arme : dégâts bruts × (1 + bonus % + compétence %) */
  phys: (wdmg?: number) => number;
  addElem: (pk: DamagePacket, mul?: number) => void;
  shoot: (kind: string, pk: DamagePacket, elem: Element, opts?: { angle?: number; pierce?: boolean; aux?: number; arPct?: number; weapon?: boolean }) => void;
  meleeHit: (o: Monster, pk: DamagePacket, arPct?: number) => boolean;
  inReach: (o: Monster | undefined) => o is Monster;
  mast: number;
  isUndead: (o: Monster) => boolean;
  rt: (m: Monster) => { skill: MercSkillId; hitTick: number; hp: number; bone: number };
  syncMercAuras: (w: World) => void;
}

const buf: Monster[] = [];

function strikeAttack(k: MercStrikeCtx): void {
  const { t, tg, phys, addElem, shoot, meleeHit, inReach } = k;
  if (t.style === 'bow') {
    const pk = emptyPacket(false);
    pk.phys = phys();
    addElem(pk);
    shoot('arrow', pk, 'phys');
  } else if (inReach(tg)) {
    const pk = emptyPacket(false);
    pk.phys = phys();
    addElem(pk);
    meleeHit(tg, pk);
  }
  return;
}

function strikeFireArrow(k: MercStrikeCtx): void {
  const { skill, L, SL, rr, phys, addElem, shoot } = k;
  // 100 % des dégâts d'arme, 50 % du physique converti en feu ; synergie : Flèche explosive +12 %/niv.
  const pk = emptyPacket(false);
  const wd = phys();
  pk.phys = wd * 0.5;
  pk.fire = wd * 0.5 + rr(mtab(skill, 'fire_damage_min', L, 'min'), mtab(skill, 'fire_damage_max', L, 'max')) * (1 + (12 * Math.min(31, SL('exploding_arrow'))) / 100);
  addElem(pk);
  shoot('fire_arrow', pk, 'fire', { arPct: mtab(skill, 'attack_rating', L, 'ar') });
  return;
}

function strikeExplodingArrow(k: MercStrikeCtx): void {
  const { skill, L, rr, phys, addElem, shoot } = k;
  const pk = emptyPacket(false);
  pk.phys = phys();
  pk.fire = rr(nv(skill, 'min', L), nv(skill, 'max', L));
  addElem(pk);
  shoot('exploding_arrow', pk, 'fire', { arPct: nv(skill, 'ar', L) });
  return;
}

function strikeColdArrow(k: MercStrikeCtx): void {
  const { skill, L, SL, rr, phys, addElem, shoot } = k;
  // 50 % des dégâts d'arme, 50 % du physique converti en froid ; synergie : Flèche de gel +18 %/niv.
  const pk = emptyPacket(false);
  const wd = phys() * 0.5;
  pk.phys = wd * 0.5;
  pk.cold = wd * 0.5 + rr(mtab(skill, 'cold_damage_min', L, 'min'), mtab(skill, 'cold_damage_max', L, 'max')) * (1 + (18 * Math.min(31, SL('freezing_arrow'))) / 100);
  pk.chill = Math.round(TICK_HZ * Math.min(8, mtab(skill, 'cold_length_seconds', L, 'chill')));
  pk.chillPct = 0.5;
  addElem(pk);
  shoot('cold_arrow', pk, 'cold', { arPct: mtab(skill, 'attack_rating', L, 'ar') });
  return;
}

function strikeFreezingArrow(k: MercStrikeCtx): void {
  const { skill, L, rr, phys, addElem, shoot } = k;
  const pk = emptyPacket(false);
  pk.phys = phys();
  pk.cold = rr(nv(skill, 'min', L), nv(skill, 'max', L));
  pk.freeze = TICK_HZ * 2;
  addElem(pk);
  shoot('freezing_arrow', pk, 'cold', { arPct: nv(skill, 'ar', L), aux: nv(skill, 'radius', L) || 1.65 });
  return;
}

function strikeMagicArrow(k: MercStrikeCtx): void {
  const { skill, L, SL, rr, phys, addElem, shoot } = k;
  // 75 % des dégâts d'arme, 50 % du physique converti en magie ; synergie : Ralentissement +18 %/niv.
  const pk = emptyPacket(false);
  const wd = phys() * 0.75;
  pk.phys = wd * 0.5;
  pk.magic = wd * 0.5 + rr(mtab(skill, 'magic_damage_min', L), mtab(skill, 'magic_damage_max', L)) * (1 + (18 * Math.min(6, SL('slow_movement'))) / 100);
  addElem(pk);
  shoot('magic_arrow', pk, 'magic', { arPct: mtab(skill, 'attack_rating', L) });
  return;
}

function strikeStrafe(k: MercStrikeCtx): void {
  const { w, m, t, tg, skill, L, phys, addElem, shoot } = k;
  // une flèche par monstre proche (jusqu'au nombre de la compétence)
  const n = Math.max(1, Math.round(nv(skill, 'count', L)));
  const near = w.monstersNear(m.x, m.y, t.range + 2, buf).filter((o) => !o.dead && w.grid.lineOfSight(m.x, m.y, o.x, o.y));
  const targets = near.length ? near.slice(0, n) : tg ? [tg] : [];
  for (let i = 0; i < n && targets.length; i++) {
    const o = targets[i % targets.length];
    const pk = emptyPacket(false);
    pk.phys = phys(nv(skill, 'wdmg', L) - 100);
    addElem(pk);
    shoot('arrow', pk, 'phys', { angle: Math.atan2(o.y - m.y, o.x - m.x) });
  }
  return;
}

function strikeSlowMovement(k: MercStrikeCtx): void {
  const { w, tg, skill, L } = k;
  // les monstres autour de la cible ralentissent (boss : moitié moindre)
  if (!tg) return;
  const pct = nv(skill, 'value', L);
  const ticks = Math.round(TICK_HZ * nv(skill, 'duration', L));
  for (const o of w.monstersNear(tg.x, tg.y, 4, buf)) debuff(w, o, { slow: 1 - (o.rank === 'boss' ? pct / 2 : pct) / 100 }, ticks);
  w.events.push({ t: 'impact', kind: 'slow_movement', x: tg.x, y: tg.y, radius: 4, elem: 'magic' });
  return;
}

function strikeJab(k: MercStrikeCtx): void {
  const { tg, skill, L, phys, addElem, meleeHit, inReach } = k;
  // trois coups rapides (le premier plein, les suivants à 85 %)
  if (!inReach(tg)) return;
  for (let i = 0; i < 3 && !tg.dead; i++) {
    const pk = emptyPacket(false);
    pk.phys = phys(nv(skill, 'wdmg', L)) * (i === 0 ? 1 : 0.85);
    addElem(pk, i === 0 ? 1 : 0.85);
    meleeHit(tg, pk, nv(skill, 'ar', L));
  }
  return;
}

function strikeFireBall(k: MercStrikeCtx): void {
  const { skill, L, rr, mast, shoot } = k;
  const pk = emptyPacket(true);
  pk.fire = rr(mtab(skill, 'fire_damage_min', L, 'min'), mtab(skill, 'fire_damage_max', L, 'max')) * mast;
  shoot('fireball', pk, 'fire', { weapon: false });
  return;
}

function strikeMeteor(k: MercStrikeCtx): void {
  const { w, m, tg, skill, L, rr, mast } = k;
  if (!tg) return;
  const pk = emptyPacket(true);
  pk.phys = rr(mtab(skill, 'physical_damage_min', L), mtab(skill, 'physical_damage_max', L));
  pk.fire = rr(mtab(skill, 'fire_damage_min', L), mtab(skill, 'fire_damage_max', L)) * mast;
  pk.skill = skill;
  const ground = ((mtab(skill, 'ground_damage_min', L) + mtab(skill, 'ground_damage_max', L)) / 2) * mast;
  spawnArea(w, { kind: 'meteor_fall', team: 0, owner: m.id, x: tg.x, y: tg.y, radius: 2.4, ticks: Math.round(TICK_HZ * 0.8), every: 1, dmg: pk, elem: 'fire', level: L, aux: ground });
  return;
}

function strikeIceBlast(k: MercStrikeCtx): void {
  const { skill, L, rr, mast, shoot } = k;
  const pk = emptyPacket(true);
  pk.cold = rr(mtab(skill, 'cold_damage_min', L, 'min'), mtab(skill, 'cold_damage_max', L, 'max')) * mast;
  // gel : 2 s (tables PD2) ; D2 : durée de la compétence
  pk.freeze = mercTables() ? TICK_HZ * 2 : Math.round(TICK_HZ * nv(skill, 'chill', L));
  shoot('ice_blast', pk, 'cold', { weapon: false });
  return;
}

function strikeBlizzard(k: MercStrikeCtx): void {
  const { w, m, tg, skill, L, rr, mast } = k;
  if (!tg) return;
  const pk = emptyPacket(true);
  pk.cold = rr(mtab(skill, 'cold_damage_min', L), mtab(skill, 'cold_damage_max', L)) * mast;
  pk.chill = TICK_HZ * 4;
  pk.chillPct = 0.4;
  pk.skill = skill;
  spawnArea(w, { kind: 'blizzard', team: 0, owner: m.id, x: tg.x, y: tg.y, radius: 2.8, ticks: TICK_HZ * 4, every: 8, dmg: pk, elem: 'cold', level: L });
  return;
}

function strikeLightning(k: MercStrikeCtx): void {
  const { w, m, tg, skill, L, rr, mast } = k;
  if (!tg) return;
  const pk = emptyPacket(true);
  pk.light = rr(mtab(skill, 'lightning_damage_min', L, 'min'), mtab(skill, 'lightning_damage_max', L, 'max')) * mast;
  pk.skill = skill;
  w.events.push({ t: 'beam', kind: 'lightning', points: [m.x, m.y, tg.x, tg.y], elem: 'light' });
  damageMonster(w, tg, pk, m);
  return;
}

function strikeStaticField(k: MercStrikeCtx): void {
  const { w, m, skill, L } = k;
  // -25 % de la vie actuelle au-dessus de 55/70/85 % (Normal/Cauchemar/Enfer), résistance à la foudre réduite 13 s
  const cap = [0.55, 0.7, 0.85][w.difficulty] ?? 0.85;
  const r = Math.min(8, mtab(skill, 'radius_yards', L) * 0.6);
  const red = -mtab(skill, 'enemy_lightning_resistance', L);
  for (const o of w.monstersNear(m.x, m.y, r, buf)) {
    o.red.light = { v: red, until: w.tick + TICK_HZ * 13 };
    if (o.hp > o.hpMax * cap) {
      const pk = emptyPacket(true);
      pk.light = o.hp * 0.25;
      pk.skill = skill;
      damageMonster(w, o, pk, m);
    }
  }
  w.events.push({ t: 'nova', kind: 'static_field', x: m.x, y: m.y, radius: r, elem: 'light' });
  return;
}

function strikeAmplifyDamage(k: MercStrikeCtx): void {
  const { w, tg, skill, L } = k;
  // version du mercenaire : résistance physique des monstres réduite (8 m autour de la cible)
  if (!tg) return;
  const v = -mtab(skill, 'enemy_physical_resistance', L);
  const until = w.tick + Math.round(TICK_HZ * mtab(skill, 'duration_seconds', L));
  for (const o of w.monstersNear(tg.x, tg.y, 4.8, buf)) o.red.phys = { v, until };
  w.events.push({ t: 'impact', kind: 'amplify', x: tg.x, y: tg.y, radius: 4.8, elem: 'magic' });
  return;
}

function strikeTeeth(k: MercStrikeCtx): void {
  const { skill, L, SL, ang, rr, shoot } = k;
  // synergies : Armure d'os +24 %/niv. (jusqu'à 32), Lance d'os +24 %/niv. (jusqu'à 23)
  const syn = 1 + (24 * (Math.min(32, SL('bone_armor')) + Math.min(23, SL('bone_spear')))) / 100;
  // dents en éventail (au plus 12 projectiles sur 1,2 rad : lisibilité et coût sur mobile)
  const n = Math.max(2, Math.min(12, Math.round(nv(skill, 'count', L))));
  for (let i = 0; i < n; i++) {
    const pk = emptyPacket(true);
    pk.magic = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * syn;
    shoot('teeth', pk, 'magic', { weapon: false, angle: ang + (i / (n - 1) - 0.5) * 1.2 });
  }
  return;
}

function strikeBoneSpear(k: MercStrikeCtx): void {
  const { skill, L, SL, rr, shoot } = k;
  // synergies : Dents +15 %/niv. (jusqu'à 29), Armure d'os +15 %/niv. (jusqu'à 32)
  const syn = 1 + (15 * (Math.min(29, SL('teeth')) + Math.min(32, SL('bone_armor')))) / 100;
  const pk = emptyPacket(true);
  pk.magic = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * syn;
  shoot('bone_spear', pk, 'magic', { weapon: false, pierce: true });
  return;
}

function strikeBoneArmor(k: MercStrikeCtx): void {
  const { w, m, skill, L, rt } = k;
  // réserve de dégâts physiques absorbés (rechargée à chaque incantation)
  rt(m).bone = Math.max(rt(m).bone, nv(skill, 'value', L));
  w.events.push({ t: 'impact', kind: 'bone_armor', x: m.x, y: m.y, radius: 0.8, elem: 'magic' });
  return;
}

function strikeHolyBolt(k: MercStrikeCtx): void {
  const { skill, L, SL, rr, shoot } = k;
  // synergies : Lumière sacrée et Poing des cieux +11 %/niv.
  const syn = 1 + (11 * (Math.min(27, SL('holy_light')) + Math.min(26, SL('fist_of_the_heavens')))) / 100;
  const pk = emptyPacket(true);
  pk.magic = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * syn;
  shoot('holy_bolt', pk, 'magic', { weapon: false });
  return;
}

function strikeHolyLight(k: MercStrikeCtx): void {
  const { w, m, skill, L, SL, rr, isUndead } = k;
  // soigne le joueur et le mercenaire ; blesse les morts-vivants proches (synergies +10 %/niv.)
  const syn = 1 + (10 * (Math.min(19, SL('holy_bolt')) + Math.min(26, SL('fist_of_the_heavens')))) / 100;
  const v = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * syn;
  const p = w.player;
  if (!p.dead && dist(m.x, m.y, p.x, p.y) <= MERC_AURA_RADIUS) p.hp = Math.min(p.hpMax, p.hp + v);
  m.hp = Math.min(m.hpMax, m.hp + v);
  for (const o of w.monstersNear(m.x, m.y, 4.5, buf)) {
    if (!isUndead(o)) continue;
    const pk = emptyPacket(true);
    pk.magic = v;
    damageMonster(w, o, pk, m);
  }
  w.events.push({ t: 'nova', kind: 'holy_light', x: m.x, y: m.y, radius: 4.5, elem: 'magic' });
  return;
}

function strikeFistOfTheHeavens(k: MercStrikeCtx): void {
  const { w, m, tg, skill, L, SL, rr } = k;
  // foudre sur la cible puis éclairs sacrés sur les monstres alentour (synergies +11 %/niv.)
  if (!tg) return;
  const syn = 1 + (11 * (Math.min(19, SL('holy_bolt')) + Math.min(27, SL('holy_light')))) / 100;
  const pk = emptyPacket(true);
  pk.light = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * syn;
  pk.skill = skill;
  w.events.push({ t: 'beam', kind: 'lightning', points: [tg.x, tg.y - 6, tg.x, tg.y], elem: 'light' });
  damageMonster(w, tg, pk, m);
  let bolts = 0;
  for (const o of w.monstersNear(tg.x, tg.y, 6, buf)) {
    if (o === tg || o.dead || bolts >= 4) continue;
    const b = emptyPacket(true);
    b.magic = rr(nv(skill, 'min2', L), nv(skill, 'max2', L)) * syn;
    w.events.push({ t: 'beam', kind: 'holybolt', points: [tg.x, tg.y, o.x, o.y], elem: 'magic' });
    damageMonster(w, o, b, m);
    bolts++;
  }
  return;
}

function strikeBash(k: MercStrikeCtx): void {
  const { m, tg, skill, L, SL, phys, addElem, meleeHit, inReach } = k;
  // synergie : Attaque concentrée +20 %/niv. (jusqu'à 17) ; repousse la cible
  if (!inReach(tg)) return;
  const pk = emptyPacket(false);
  pk.phys = phys(nv(skill, 'wdmg', L) + 20 * Math.min(17, SL('concentrate'))) + nv(skill, 'flat', L);
  pk.knockback = 0.8;
  pk.srcX = m.x;
  pk.srcY = m.y;
  addElem(pk);
  meleeHit(tg, pk, nv(skill, 'ar', L));
  return;
}

function strikeConcentrate(k: MercStrikeCtx): void {
  const { tg, skill, L, SL, phys, addElem, meleeHit, inReach } = k;
  // synergie : Coup violent +25 %/niv. (jusqu'à 21)
  if (!inReach(tg)) return;
  const pk = emptyPacket(false);
  pk.phys = phys(nv(skill, 'wdmg', L) + 25 * Math.min(21, SL('bash')));
  addElem(pk);
  meleeHit(tg, pk, nv(skill, 'ar', L));
  return;
}

function strikeWhirlwind(k: MercStrikeCtx): void {
  const { w, m, t, skill, L, phys, addElem, meleeHit } = k;
  // un coup sur chaque monstre au contact (dégâts de la table du mercenaire)
  const pct = mtab(skill, 'damage', L);
  const r = t.range + m.radius + 1.2;
  for (const o of w.monstersNear(m.x, m.y, r, buf)) {
    if (o.dead) continue;
    const pk = emptyPacket(false);
    pk.phys = phys(pct);
    pk.leechMul = 0.5;
    addElem(pk);
    meleeHit(o, pk);
  }
  w.events.push({ t: 'nova', kind: 'whirlwind', x: m.x, y: m.y, radius: r, elem: 'phys' });
  return;
}

function strikeBattleCry(k: MercStrikeCtx): void {
  const { w, m, skill, L } = k;
  // défense et dégâts des monstres proches réduits
  const def = nv(skill, 'value', L);
  const dmgRed = nv(skill, 'value2', L);
  const ticks = Math.round(TICK_HZ * nv(skill, 'duration', L));
  for (const o of w.monstersNear(m.x, m.y, 6, buf)) debuff(w, o, { def: 1 - Math.min(90, def) / 100, dmg: 1 - Math.min(75, dmgRed) / 100 }, ticks);
  w.events.push({ t: 'nova', kind: 'battle_cry', x: m.x, y: m.y, radius: 6, elem: 'phys' });
  return;
}

function strikeBattleOrders(k: MercStrikeCtx): void {
  const { w, m, syncMercAuras } = k;
  // l'aura « maura_battle_orders » est entretenue tant qu'il vit (relancée dès qu'elle manque en PD2)
  syncMercAuras(w);
  w.events.push({ t: 'nova', kind: 'battle_orders', x: m.x, y: m.y, radius: 3, elem: 'phys' });
  return;
}

/* ---------------- Diablo II (Hireling.txt, lot M10d) : compétences des mercenaires de la base ---------------- */

function strikeInnerSight(k: MercStrikeCtx): void {
  const { w, tg, skill, L } = k;
  // Vision intérieure : la défense des monstres autour de la cible baisse (valeur fixe de la compétence)
  if (!tg) return;
  const v = nv(skill, 'value', L);
  const r = Math.max(2, nv(skill, 'radius', L));
  const ticks = Math.round(TICK_HZ * nv(skill, 'duration', L));
  for (const o of w.monstersNear(tg.x, tg.y, r, buf)) if (!o.dead) debuff(w, o, { def: Math.max(0, 1 - v / Math.max(1, o.defense)) }, ticks);
  w.events.push({ t: 'impact', kind: 'inner_sight', x: tg.x, y: tg.y, radius: r, elem: 'magic' });
}

function strikeInferno(k: MercStrikeCtx): void {
  const { w, m, tg, md, skill, L, rr, mast, ang } = k;
  // Inferno : jet de flammes devant lui (dégâts par seconde × durée de l'attaque), à courte portée
  if (!tg) return;
  const r = Math.max(2, nv(skill, 'radius', L));
  if (dist(m.x, m.y, tg.x, tg.y) - tg.radius > r) return;
  const secs = md.atkTicks / TICK_HZ;
  for (const o of w.monstersNear(m.x, m.y, r + 0.6, buf)) {
    if (o.dead) continue;
    let da = Math.abs(Math.atan2(o.y - m.y, o.x - m.x) - ang) % TAU;
    if (da > Math.PI) da = TAU - da;
    if (da > 0.5) continue;
    const pk = emptyPacket(true);
    pk.fire = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * mast * secs;
    pk.skill = skill;
    damageMonster(w, o, pk, m);
  }
  w.events.push({ t: 'impact', kind: 'inferno', x: m.x + Math.cos(ang) * r * 0.5, y: m.y + Math.sin(ang) * r * 0.5, radius: r * 0.5, elem: 'fire' });
}

function strikeGlacialSpike(k: MercStrikeCtx): void {
  const { skill, L, rr, mast, shoot } = k;
  // Pointe glaciale : explose à l'impact et gèle
  const pk = emptyPacket(true);
  pk.cold = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * mast;
  pk.freeze = Math.round(TICK_HZ * nv(skill, 'chill', L));
  shoot('glacial_spike', pk, 'cold', { weapon: false });
}

function strikeChargedBolt(k: MercStrikeCtx): void {
  const { skill, L, rr, mast, shoot, ang } = k;
  // Éclair chargé : plusieurs éclairs erratiques
  const n = Math.max(1, Math.floor(nv(skill, 'count', L)));
  for (let i = 0; i < n; i++) {
    const pk = emptyPacket(true);
    pk.light = rr(nv(skill, 'min', L), nv(skill, 'max', L)) * mast;
    shoot('charged_bolt', pk, 'light', { weapon: false, angle: ang + (i - (n - 1) / 2) * 0.25 });
  }
}

function strikeStun(k: MercStrikeCtx): void {
  const { tg, skill, L, phys, addElem, meleeHit, inReach } = k;
  // Étourdissement : un coup qui étourdit la cible
  if (!inReach(tg)) return;
  const pk = emptyPacket(false);
  pk.phys = phys(nv(skill, 'wdmg', L));
  pk.stun = Math.round(TICK_HZ * nv(skill, 'stun', L));
  addElem(pk);
  meleeHit(tg, pk, nv(skill, 'ar', L));
}

const STRIKES: Record<string, (k: MercStrikeCtx) => void> = {
  // mêlée et arc : attaque de base
  attack: strikeAttack,
  // acte I : Éclaireuse
  fire_arrow: strikeFireArrow,
  exploding_arrow: strikeExplodingArrow,
  cold_arrow: strikeColdArrow,
  freezing_arrow: strikeFreezingArrow,
  magic_arrow: strikeMagicArrow,
  strafe: strikeStrafe,
  slow_movement: strikeSlowMovement,
  // acte II : Garde du désert
  jab: strikeJab,
  // acte III : Loup de fer
  fire_ball: strikeFireBall,
  meteor: strikeMeteor,
  ice_blast: strikeIceBlast,
  blizzard: strikeBlizzard,
  lightning: strikeLightning,
  static_field: strikeStaticField,
  // acte IV : Ascendant
  amplify_damage: strikeAmplifyDamage,
  teeth: strikeTeeth,
  bone_spear: strikeBoneSpear,
  bone_armor: strikeBoneArmor,
  holy_bolt: strikeHolyBolt,
  holy_light: strikeHolyLight,
  fist_of_the_heavens: strikeFistOfTheHeavens,
  // acte V : Barbare
  bash: strikeBash,
  concentrate: strikeConcentrate,
  whirlwind: strikeWhirlwind,
  battle_cry: strikeBattleCry,
  battle_orders: strikeBattleOrders,
  // Diablo II (base) : Éclaireuse, Loup de fer, Barbare
  inner_sight: strikeInnerSight,
  inferno: strikeInferno,
  glacial_spike: strikeGlacialSpike,
  charged_bolt: strikeChargedBolt,
  stun: strikeStun,
};

/** Exécute la compétence courante du mercenaire ; sans effet pour une compétence inconnue */
export function strikeBySkill(k: MercStrikeCtx): void {
  STRIKES[k.skill]?.(k);
}
