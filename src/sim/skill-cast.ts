/**
 * Lancement des compétences : répartition vers les modules de classe, attaque de base et effets
 * périodiques des buffs. Séparé de skills.ts (aides communes) pour casser le cycle skills <-> classes.
 */
import { fireProcs } from './procs';
import { SKILL_BY_ID } from '../data/skills';
import type { Element } from '../data/stats';
import { emptyPacket, type Monster } from './actors';
import { TICK_HZ } from './constants';
import { spawnArea } from './missiles';
import { explode } from './explosion';
import type { World } from './world';
import { castDruid, druidBasicAttack, druidTick } from './druid';
import { barbarianTick, castBarbarian } from './barbarian';
import { castPaladin, paladinTick } from './paladin';
import { castAmazon } from './amazon';
import { castNecromancer } from './necromancer';
import { assassinTick, castAssassin } from './assassin';
import { attackReach, fireWeapon, isRangedKind, isThrownKind, meleeTarget, rollHit, strikePacket, weaponKind, weaponMastery } from './melee';
import { withStrike } from './rhythm';
import { setCooldown, skillLevel, skillDamageRange, enchantDamage } from './skills';

import { simHooks } from './hooks';
import { RULES } from '../mods/rules';
import { castSorceress } from './skill-cast-sorc';

const buf: Monster[] = [];

/** Lance l'effet d'une compétence (au moment de la « libération » dans l'animation). */
export function castSkill(w: World, id: string, tx: number, ty: number, targetId: number, strike?: number): void {
  withStrike(strike, () => castSkillImpl(w, id, tx, ty, targetId, strike));
}

function castSkillImpl(w: World, id: string, tx: number, ty: number, targetId: number, strike?: number): void {
  const p = w.player;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const s = SKILL_BY_ID[id];
  const L = skillLevel(w, id);
  if (id === 'attack') {
    if (!druidBasicAttack(w, targetId)) basicAttack(w, targetId);
    return;
  }
  if (!s) return;
  // frappes suivantes d'une séquence (rhythm.ts) : ni nouveau délai de récupération ni nouveau déclencheur d'objet
  const followUp = strike !== undefined && strike > 0;
  if (!followUp) setCooldown(w, s);
  // « X % de chances de lancer <sort> en incantant » (objets) : hors sorts d'objet eux-mêmes
  if (!followUp && !w.inProc && !s.passive) fireProcs(w, 'Cast', w.monsters.find((m) => m.id === targetId && !m.dead) ?? null);
  if (castDruid(w, id, tx, ty, targetId, L)) return;
  if (castBarbarian(w, id, tx, ty, targetId, L)) return;
  if (castPaladin(w, id, tx, ty, targetId, L)) return;
  if (castAmazon(w, id, tx, ty, targetId, L)) return;
  if (castNecromancer(w, id, tx, ty, targetId, L)) return;
  if (castAssassin(w, id, tx, ty, targetId, L)) return;
  castSorceress(w, id, tx, ty, targetId, L, ang, s);
}

/** Attaque de base : mêlée (allonge de l'arme), tir à l'arc ou à l'arbalète, arme de jet ; enchantements de feu et de froid */
function basicAttack(w: World, targetId: number): void {
  const p = w.player;
  const k = weaponKind(w);
  if (isRangedKind(k) || isThrownKind(k)) {
    const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon);
    const tx = t ? t.x : p.x + Math.cos(p.facing) * 8;
    const ty = t ? t.y : p.y + Math.sin(p.facing) * 8;
    fireWeapon(w, tx, ty, { kind: isThrownKind(k) ? (k === 'javelin' ? 'javelin' : 'throw_axe') : undefined, speed: 16, range: 12 });
    return;
  }
  const t = meleeTarget(w, targetId, attackReach(w));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  fireProcs(w, 'Att', t);
  if (!rollHit(w, t, weaponMastery(w).ar)) return;
  const pk = strikePacket(w);
  for (const b of p.buffs) {
    if (b.id === 'enchant' || b.id === 'cold_enchant') {
      const [a, c] = enchantDamage(w, b.id, b.level);
      const e: Element = b.id === 'enchant' ? 'fire' : 'cold';
      pk[e] += w.rng.combat.float(a, c);
      if (e === 'cold') {
        pk.chill = 2 * TICK_HZ;
        pk.chillPct = 0.5;
      }
    }
  }
  if (w.hurtMonster(t, pk) > 0) fireProcs(w, 'Hit', t);
}

/** Effets périodiques des buffs : Embrasement (traînée), Tempête de foudre, Ouragan, Armageddon. */
export function applyPassiveTick(w: World): void {
  const p = w.player;
  if (w.character.classId === 'barbarian') barbarianTick(w);
  if (p.buffs.length === 0) return;
  if (w.character.classId === 'druid') druidTick(w);
  if (w.character.classId === 'paladin') paladinTick(w);
  if (w.character.classId === 'assassin') assassinTick(w);
  const sorc = RULES['skills.sorceress']();
  const blaze = p.buffs.find((b) => b.id === 'blaze');
  if (blaze && p.mode === 'walk' && w.tick % 3 === 0) {
    const r = skillDamageRange(w, 'blaze', blaze.level);
    const pk = emptyPacket(true);
    pk.fire = (r.min + r.max) / 2;
    // durée de la traînée : règle skills.sorceress (D2 : missile blaze), sinon 2,4 s
    const secs = sorc.blazeTrailSeconds(SKILL_BY_ID.blaze.n.v3, blaze.level) ?? 2.4;
    spawnArea(w, { kind: 'blaze', team: 0, owner: p.id, x: p.x, y: p.y, radius: 0.8, ticks: Math.round(secs * TICK_HZ), every: 5, dmg: pk, elem: 'fire', level: blaze.level });
  }
  const storm = p.buffs.find((b) => b.id === 'thunder_storm');
  if (storm) {
    const blvl = w.player.d.hardPoints['thunder_storm'] ?? 0;
    // intervalle entre deux éclairs : règle skills.sorceress (D2 : perdelay de Skills.txt)
    const every = sorc.thunderStormTicks(SKILL_BY_ID.thunder_storm.n.value, storm.level, blvl);
    if (w.tick % every === 0) {
      const targets = w.monstersNear(p.x, p.y, 9, buf);
      if (targets.length) {
        const t = targets[w.rng.combat.int(targets.length)];
        const r = skillDamageRange(w, 'thunder_storm', storm.level);
        const pk = emptyPacket(true);
        pk.light = w.rng.combat.float(r.min, r.max);
        w.events.push({ t: 'beam', kind: 'thunder', points: [t.x, t.y - 0.01, t.x, t.y], elem: 'light' });
        explode(w, 0, t.x, t.y, 1.5, pk, 'thunder', 'light');
      }
    }
  }
}

simHooks.castSkill = castSkill;
