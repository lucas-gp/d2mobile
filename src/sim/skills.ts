/**
 * Exécution des 33 compétences de la Sorcière (PD2 S13) dans la simulation.
 * Les chiffres viennent de data/skills.ts ; ici on ne fait que les appliquer.
 */
import { teleportMerc } from './merc-core';
import { SKILL_BY_ID, lin, manaCost, ramp, synergyPct, type SorcSkill } from '../data/skills';
import type { Element } from '../data/stats';
import { clamp, dist } from '../core/math';
import { emptyPacket, type DamagePacket, type Monster } from './actors';
import { TERRAIN_RADIUS, TICK_HZ } from './constants';
import { attackFrames, fcrFrames, fcrFramesLightning } from './breakpoints';
import { explode } from './explosion';
import type { World } from './world';
import { meleeFrames } from './melee-frames';
import { offhandWeapon } from './weapons';
import { weaponRequirement } from './weaponreq';
import { strikeSchedule } from './rhythm';
import { RULES } from '../mods/rules';

/** Armures de froid de la Sorcière : une seule à la fois */
const ARMOR_BUFFS = ['frozen_armor', 'shiver_armor', 'chilling_armor'];

export function skillLevel(w: World, id: string): number {
  if (id === 'attack') return 1;
  return w.player.d.skillLevels[id] ?? 0;
}

/** Dégâts min/max d'une compétence à un niveau donné, synergies et maîtrises incluses. */
export function skillDamageRange(w: World, id: string, lvl?: number): { min: number; max: number; elem: Element } {
  const s = SKILL_BY_ID[id];
  const d = w.player.d;
  const L = lvl ?? skillLevel(w, id);
  if (!s || !s.n.min || !s.n.max || L <= 0) return { min: 0, max: 0, elem: s?.element ?? 'phys' };
  const syn = synergyPct(s, d.hardPoints);
  const mastery = d.elemDmgPct[s.element] ?? 0;
  const mul = (1 + syn / 100) * (1 + mastery / 100);
  return { min: ramp(s.n.min, L) * mul, max: ramp(s.n.max, L) * mul, elem: s.element };
}

/** Malus PD2 après téléportation : −(50 − (niv−1)) % de dégâts des sorts pendant 1 s */
export function tpPenalty(w: World): number {
  const p = w.player;
  return p.tpPenaltyUntil > w.tick ? 1 - p.tpPenaltyPct / 100 : 1;
}

export function packetFor(w: World, id: string, mul = 1): DamagePacket {
  const r = skillDamageRange(w, id);
  const pk = emptyPacket(true);
  pk[r.elem] = w.rng.combat.float(r.min, Math.max(r.min, r.max)) * mul * tpPenalty(w);
  pk.skill = id;
  return pk;
}

export function skillManaCost(w: World, id: string): number {
  if (id === 'attack') return 0;
  const s = SKILL_BY_ID[id];
  if (!s) return 0;
  const lvl = skillLevel(w, id);
  // Inferno : coût par seconde × durée de l'incantation
  // a game mode's cost (rule `skills.manaCost`, lot 292b); base: Diablo II's
  if (id === 'inferno' || id === 'arctic_blast') return RULES['skills.manaCost'](w, id, manaCost(s, lvl) * (castFrames(w, id) / TICK_HZ));
  return RULES['skills.manaCost'](w, id, manaCost(s, lvl));
}

/** Rythme d'attaque propre à certaines compétences de mêlée (PD2 : Zèle repart en arrière de 100 % des images) */
const MELEE_SPEED: Record<string, number> = { zeal: 0.6 };

/** Images d'un balayage de Tourbillon (deux coups de 5 images ; 6 images par coup à deux armes) */
export const WHIRLWIND_FRAMES = 10;
const WHIRLWIND_FRAMES_DUAL = 12;

export function castFrames(w: World, id: string): number {
  if (id === 'attack') return w.player.d.form ? meleeFrames(w, id) : attackFrames(w.player.d.ias - w.player.d.iasSkill, w.character.classId, w.player.d.atkSets, w.player.d.iasSkill);
  // Tourbillon à cadence fixe (un coup / 5 images, deux armes : deux / 6) : règle skills.barbarian (D2 : celle de l'arme)
  if (id === 'whirlwind' && RULES['skills.barbarian']().whirlwindFixedFrames) return offhandWeapon(w) ? WHIRLWIND_FRAMES_DUAL : WHIRLWIND_FRAMES;
  if (SKILL_BY_ID[id]?.melee) return Math.max(4, Math.round(meleeFrames(w, id) * (MELEE_SPEED[id] ?? 1)));
  // cadence « lente » de la Sorcière (images de la Foudre) : règle skills.sorceress (D2 : Foudre et Éclair en chaîne)
  if (RULES['skills.sorceress']().slowCast.includes(id)) return fcrFramesLightning(w.player.d.fcr);
  return fcrFrames(w.player.d.fcr, w.character.classId);
}

export function canCast(w: World, id: string): { ok: boolean; reason?: string } {
  const p = w.player;
  if (p.dead) return { ok: false };
  if (w.zone.town) return { ok: false, reason: 'Impossible en ville' };
  if (id === 'attack') return { ok: true };
  const s = SKILL_BY_ID[id];
  if (!s) return { ok: false };
  if (s.passive) return { ok: false, reason: 'Compétence passive' };
  if (skillLevel(w, id) <= 0) return { ok: false, reason: 'Compétence non apprise' };
  if ((p.cooldowns[id] ?? 0) > w.tick) return { ok: false };
  if (p.mana < skillManaCost(w, id)) return { ok: false, reason: 'Pas assez de mana' };
  const req = weaponRequirement(w, id);
  if (req) return { ok: false, reason: req };
  return { ok: true };
}

export function setCooldown(w: World, s: SorcSkill): void {
  // never sooner than a game mode's own floor already set at the cast (lot 301, rule `skills.onCast`)
  if (s.n.cooldown) w.player.cooldowns[s.id] = Math.max(w.player.cooldowns[s.id] ?? 0, w.tick + Math.round(s.n.cooldown * (1 - clamp(w.player.d.all.get('cooldownRed') ?? 0, 0, 75) / 100) * TICK_HZ));
}

export function addBuff(w: World, id: string, lvl: number, seconds: number): void {
  const p = w.player;
  if (ARMOR_BUFFS.includes(id)) p.buffs = p.buffs.filter((b) => !ARMOR_BUFFS.includes(b.id));
  p.buffs = p.buffs.filter((b) => b.id !== id);
  p.buffs.push({ id, level: lvl, until: w.tick + Math.round(seconds * TICK_HZ) });
  p.shieldActive = p.buffs.some((b) => b.id === 'energy_shield');
  w.refreshPlayer();
}

export function addStack(w: World, id: string, L: number, max: number, seconds: number): void {
  const p = w.player;
  const cur = p.buffs.find((b) => b.id === id);
  const stacks = Math.min(max, (cur?.stacks ?? 0) + 1);
  p.buffs = p.buffs.filter((b) => b.id !== id);
  p.buffs.push({ id, level: L, until: w.tick + Math.round(seconds * TICK_HZ), stacks });
  w.refreshPlayer();
}

export function hasBuff(w: World, id: string): boolean {
  return w.player.buffs.some((b) => b.id === id && b.until > w.tick);
}

export function applyReduction(w: World, m: Monster, e: Element, v: number, ticks: number): void {
  const cur = m.red[e];
  if (!cur || cur.until <= w.tick || cur.v <= v) m.red[e] = { v, until: w.tick + ticks };
}

/** Saute à l'endroit visé (distance max `maxDist`) : point libre atteignable, sinon le plus proche ; renvoie false si aucun. Téléportation et Rafale. */
export function teleportPlayer(w: World, tx: number, ty: number, maxDist: number): boolean {
  const p = w.player;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const d = Math.min(dist(p.x, p.y, tx, ty), maxDist);
  let dx = p.x + Math.cos(ang) * d;
  let dy = p.y + Math.sin(ang) * d;
  // point d'arrivée valide : libre, et dans la zone jouable (atteignable à pied depuis le lanceur)
  const landable = (x: number, y: number) => !w.grid.circleBlocked(x, y, TERRAIN_RADIUS) && w.grid.connected(p.x, p.y, x, y);
  let ok = landable(dx, dy);
  // D2 : cible bloquée (mur, décor) → point libre le plus proche de la cible, sinon en
  // reculant vers le lanceur
  if (!ok) {
    const cx = dx;
    const cy = dy;
    for (let r = 0.5; !ok && r <= 3; r += 0.5)
      for (let k = 0; k < 16; k++) {
        const x = cx + Math.cos((k / 16) * Math.PI * 2) * r;
        const y = cy + Math.sin((k / 16) * Math.PI * 2) * r;
        if (landable(x, y) && dist(p.x, p.y, x, y) > 0.75) {
          dx = x;
          dy = y;
          ok = true;
          break;
        }
      }
  }
  for (let t = d - 0.5; !ok && t >= 0.5; t -= 0.5) {
    dx = p.x + Math.cos(ang) * t;
    dy = p.y + Math.sin(ang) * t;
    ok = landable(dx, dy);
  }
  if (!ok) return false;
  w.events.push({ t: 'teleport', id: p.id, fx: p.x, fy: p.y, tx: dx, ty: dy });
  p.x = dx;
  p.y = dy;
  p.px = dx;
  p.py = dy;
  teleportMerc(w, p);
  return true;
}

export function enchantDamage(w: World, id: 'enchant' | 'cold_enchant', lvl: number): [number, number] {
  const r = skillDamageRange(w, id, lvl);
  return [r.min, r.max];
}

export function makeSummon(w: World, def: Monster['def']): Monster {
  return {
    kind: 'monster',
    id: w.newId(),
    team: 0,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    radius: 0.4,
    facing: 0,
    hp: 1,
    hpMax: 1,
    mode: 'idle',
    modeT: 0,
    modeLen: 0,
    dead: false,
    deathTick: 0,
    chillT: 0,
    chillPct: 0,
    freezeT: 0,
    stunT: 0,
    burnDps: 0,
    burnT: 0,
    lastHitTick: -999,
    def,
    mlvl: 1,
    rank: 'normal',
    name: 'Invocation',
    mods: [],
    res: { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 },
    dmgMin: 0,
    dmgMax: 0,
    ar: 0,
    defense: 0,
    xp: 0,
    speed: 0,
    scale: 1,
    tint: 0xffffff,
    aggro: true,
    atk: 0,
    atkCd: [10],
    atkTarget: { x: 0, y: 0 },
    atkApplied: true,
    spawnX: 0,
    spawnY: 0,
    leader: 0,
    thinkTick: 0,
    wanderX: 0,
    wanderY: 0,
    phase: 0,
    summoned: 0,
    noLoot: true,
    red: {},
    spawnKey: `summon:${w.tick}`,
    isSummon: true,
  };
}

/**
 * Riposte des armures de froid quand un monstre frappe au corps à corps (règle skills.sorceress : D2, gel de l'Armure gelée et dégâts de
 * froid de l'Armure de frisson ; l'Armure glaçante ne riposte qu'aux projectiles)
 */
export function armorRetaliate(w: World, attacker: Monster): void {
  const p = w.player;
  const rules = RULES['skills.sorceress']().armorMelee;
  for (const b of p.buffs) {
    const a = rules[b.id];
    if (!a) continue;
    const pk = emptyPacket(true);
    if (a.damage) {
      const r = skillDamageRange(w, b.id, b.level);
      pk.cold = w.rng.combat.float(r.min, r.max);
      pk.chill = Math.round(lin(SKILL_BY_ID[b.id].n.chill, b.level) * TICK_HZ); // durée du froid de la compétence
      pk.chillPct = 0.5;
    }
    const freeze = a.freeze === 'skill' ? lin(SKILL_BY_ID[b.id].n.chill, b.level) : a.freeze;
    if (freeze > 0) pk.freeze = Math.round(TICK_HZ * freeze);
    w.hurtMonster(attacker, pk);
  }
}

/** Armure glaçante : riposte à chaque attaque à distance subie (sur l'attaquant ; règle skills.sorceress : rayon de l'explosion) */
export function armorRetaliateRanged(w: World, attacker: Monster): void {
  const b = w.player.buffs.find((x) => x.id === 'chilling_armor' && x.until > w.tick);
  if (!b || attacker.dead) return;
  const r = skillDamageRange(w, 'chilling_armor', b.level);
  const pk = emptyPacket(true);
  pk.cold = w.rng.combat.float(r.min, r.max);
  pk.chill = Math.round(lin(SKILL_BY_ID.chilling_armor.n.chill, b.level) * TICK_HZ);
  pk.chillPct = 0.5;
  const radius = RULES['skills.sorceress']().chillingRangedRadius;
  if (radius > 0) explode(w, 0, attacker.x, attacker.y, radius, pk, 'blizzard_shard', 'cold', w.player.id);
  else w.hurtMonster(attacker, pk);
}

/** Nombre de frappes d'une compétence à frappes multiples (1 : pas de séquence) */
export function strikeCount(w: World, id: string): number {
  const s = SKILL_BY_ID[id];
  if (!s) return 1;
  const L = skillLevel(w, id);
  switch (id) {
    case 'zeal':
      return RULES['skills.paladin']().zealHits(s.n.count, L); // règle skills.paladin (D2 : 2 à 5 coups, calc1)
    case 'fury':
    case 'strafe':
      return Math.max(1, Math.floor(lin(s.n.count, L)));
    case 'frenzy':
      return offhandWeapon(w) ? 2 : 1;
    default:
      return 1;
  }
}

/** Instants des frappes suivantes pour une incantation de `frames` images libérée à `releaseAt` (voir rhythm.ts) */
export function strikePlan(w: World, id: string, frames: number, releaseAt: number): number[] | undefined {
  const n = strikeCount(w, id);
  if (n <= 1) return undefined;
  // images à 0 % de VA : la compression due à la vitesse d'attaque s'applique au rythme de référence
  const f0 = Math.max(1, castFramesNoIas(w, id));
  const scale = frames / f0;
  const refStep = id === 'zeal' || id === 'fury' ? 4 : id === 'strafe' ? 1 : Math.max(1, Math.round(frames / 2 - releaseAt));
  const plan = strikeSchedule(n, frames, releaseAt, refStep, id === 'frenzy' ? 1 : scale);
  return plan.length ? plan : undefined;
}

/** Images d'attaque de la compétence sans aucune vitesse d'attaque (référence du rythme) */
function castFramesNoIas(w: World, id: string): number {
  const d = w.player.d;
  const base = attackFrames(0, w.character.classId, d.atkSets, 0);
  return Math.max(4, Math.round(base * (MELEE_SPEED[id] ?? 1) * (id === 'fury' ? 1.5 : 1)));
}
