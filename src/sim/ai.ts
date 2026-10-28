/** Intelligence artificielle des monstres et des invocations (Hydre). */
import { fireProcs, reflectFlat } from './procs';
import { dist, TAU } from '../core/math';
import type { MonsterAttack } from '../data/types';
import { SKILL_BY_ID, lin } from '../data/skills';
import type { DamagePacket, Monster, Player } from './actors';
import { activeCurse, emptyPacket } from './actors';
import { damageMonster } from './combat';
import { hurtPet, updatePet } from './druid';
import { updateMerc } from './merc';
import { DT, TERRAIN_RADIUS, TICK_HZ } from './constants';
import { spawnMissile } from './missiles';
import type { World } from './world';
import { spawnMonster } from './spawn';
import { castBossSkill } from './boss-skills';
import { RULES } from '../mods/rules';
import { armorRetaliate } from './skills';
import { updateControlled } from './mindcontrol';
import { rollMonsterDamage } from './monster-damage';

export { rollMonsterDamage };
import { expireCurses } from './necromancer';
import { REGEN_PAUSE_TICKS } from '../data/curves';
import { auraAtkMul, auraSpeedMul, cursePlayer, updateMonsterAura } from './monster-auras';

const nearBuf: Monster[] = [];

/** Facteur de ralentissement (froid) appliqué à la vitesse et aux animations */
function slowFactor(m: Monster): number {
  return (m.chillT > 0 ? 1 - m.chillPct : 1) * (m.slowMul ?? 1);
}

/** Au-delà (unités) et hors de l'écran, un monstre au repos ne flâne plus : il attend immobile (portée d'aggro max : 20) */
const SLEEP_RANGE = 40;

/** Délai de relève des guerriers souillés (D2 : self-resurrect, 3 s après la mort) */
const SELF_RES_DELAY = TICK_HZ * 3;
/** Recul de `deathTick` qui fait disparaître un cadavre tout de suite (le corps reste 12 s) */
const CORPSE_GONE = TICK_HZ * 12;
/** Ticks entre deux réévaluations des attaques quand aucune n'est possible */
const THINK_INTERVAL = 2;
/** Au-delà (unités), un monstre en chasse abandonne et revient au calme */
const LEASH_RANGE = 45;
/** Le monstre aveuglé (Vision réduite) ne voit plus qu'à cette distance (unités) */
const BLIND_SIGHT = 2.2;

/**
 * Un tick d'un monstre (ou d'une créature invoquée, déléguée à son module) : états et dégâts sur la durée, contrôle (gel, étourdissement,
 * charme), animation en cours (coup reçu, attaque), puis réveil, poursuite, fuite, choix d'une attaque et déplacement vers la cible.
 */
export function updateMonster(w: World, m: Monster): void {
  if (m.dead) {
    updateCorpse(w, m);
    return;
  }
  if (expireTimedState(w, m)) return;
  if (m.isSummon) {
    if (m.pet === 'merc') updateMerc(w, m);
    else if (m.pet) updatePet(w, m);
    else updateSummon(w, m);
    return;
  }
  // boss de carte : arène, phases, compétences spéciales télégraphiées (règle du mod qui fournit les cartes)
  if (m.mapBoss && RULES['ai.mapBoss'](w, m)) return;
  if (damageOverTime(w, m)) return;
  regenerate(w, m);
  if (m.auraId) updateMonsterAura(w, m);
  holyFreezeAura(w, m);
  if (crowdControlled(m)) return;
  if (updateControlled(w, m)) return;
  const slow = slowFactor(m);
  if (m.mode === 'hit') {
    m.modeT += slow;
    if (m.modeT >= m.modeLen) m.mode = 'idle';
    return;
  }
  for (let i = 0; i < m.atkCd.length; i++) if (m.atkCd[i] > 0) m.atkCd[i] -= slow * (m.curseAtk ?? 1);
  if (m.mode === 'attack') {
    continueAttack(w, m, slow);
    return;
  }
  const pl = w.player;
  // cible : le joueur, ou une créature du Druide plus proche (D2 : les monstres frappent ce qui est à portée)
  const p: Player | Monster = w.pets.length ? chooseTarget(w, m) : pl;
  const d = dist(m.x, m.y, p.x, p.y);
  if (!engaged(w, m, p, d)) return;
  monsterTeleport(w, m, p, d);
  if (flee(w, m, p, d, slow)) return;
  // choix d'une attaque
  const reach = d - m.radius - p.radius;
  if (w.tick >= m.thinkTick) {
    if (pickAttack(w, m, p, reach)) return;
    // prochaine réévaluation des attaques (le déplacement, lui, continue chaque tick)
    m.thinkTick = w.tick + THINK_INTERVAL;
  }
  moveTowards(w, m, p, d, reach, slow);
}

/** Cadavre : horloge d'animation ; Self-resurrect (D2 : guerriers souillés) : le cadavre intact se relève une fois, sans butin */
function updateCorpse(w: World, m: Monster): void {
  m.modeT++;
  if (m.def.selfRes && !m.revived && !m.isSummon && !m.eaten && w.tick - m.deathTick === SELF_RES_DELAY) {
    const s = spawnMonster(w, m.def.id, m.x, m.y, { rank: m.rank === 'minion' ? 'minion' : 'normal', leader: m.leader, noLoot: true, inheritMods: m.mods }, `self:${m.id}`);
    m.deathTick = w.tick - CORPSE_GONE;
    if (s) {
      s.revived = true;
      s.aggro = true;
    }
  }
}

/** Malédictions et affaiblissements expirés ; créature invoquée par un monstre en fin de vie (vrai : elle vient de disparaître) */
function expireTimedState(w: World, m: Monster): boolean {
  if (m.curses !== undefined) expireCurses(w, m);
  if (m.debuffUntil !== undefined && w.tick >= m.debuffUntil) {
    m.dmgMul = m.arMul = m.defMul = m.slowMul = m.missileMul = undefined;
    m.debuffUntil = undefined;
  }
  // créatures invoquées par un monstre (Hydre des Membres du Conseil) : durée de vie limitée
  if (!m.isSummon && m.expireTick !== undefined && w.tick >= m.expireTick) {
    m.hp = 0;
    m.dead = true;
    m.deathTick = w.tick - CORPSE_GONE;
    m.mode = 'death';
    return true;
  }
  return false;
}

/** Poison, saignement et brûlure ; vrai si le monstre en meurt */
function damageOverTime(w: World, m: Monster): boolean {
  // poison (Rage, Liane empoisonnée)
  if (m.poisonT && m.poisonT > 0) {
    m.poisonT--;
    m.hp -= (m.poisonDps ?? 0) * DT;
    if (m.hp <= 0) {
      w.killMonster(m, w.player);
      return true;
    }
  }
  // blessures ouvertes (Blessures profondes, objets) : saignement physique (règle `combat.bleedTick`)
  if (m.bleedT && m.bleedT > 0) {
    m.bleedT--;
    m.hp -= RULES['combat.bleedTick'](m, DT);
    if (m.hp <= 0) {
      w.killMonster(m, w.player);
      return true;
    }
  }
  // brûlure
  if (m.burnT > 0) {
    m.burnT--;
    const dmg = m.burnDps * DT;
    if (dmg > 0) {
      m.hp -= dmg;
      if (m.hp <= 0) {
        w.killMonster(m, w.player);
        return true;
      }
    }
  }
  return false;
}

/** Régénération D2 (DamageRegen) : suspendue tant que le monstre subit des dégâts */
function regenerate(w: World, m: Monster): void {
  if (m.regen && m.hp < m.hpMax && w.tick - m.lastHitTick > REGEN_PAUSE_TICKS && w.tick >= (m.noHealUntil ?? 0) && !(m.poisonT && m.poisonT > 0) && !(m.bleedT && m.bleedT > 0) && m.burnT <= 0) {
    m.hp = Math.min(m.hpMax, m.hp + m.regen * DT);
  }
}

/** Aura Holy Freeze (Duriel) : le joueur proche est ralenti par le froid (un tick sur 10, décalé par monstre) */
function holyFreezeAura(w: World, m: Monster): void {
  if (m.def.holyFreeze && w.tick % 10 === m.id % 10 && !w.player.dead && dist(m.x, m.y, w.player.x, w.player.y) < 7 && !w.player.d.cbf) {
    w.player.chillT = Math.max(w.player.chillT, 20);
    w.player.chillPct = Math.max(w.player.chillPct, 0.3);
  }
}

/** Décompte du froid ; vrai si le monstre est gelé ou étourdi (il ne fait rien ce tick) */
function crowdControlled(m: Monster): boolean {
  if (m.chillT > 0) m.chillT--;
  else m.chillPct = 0;
  if (m.freezeT > 0) {
    m.freezeT--;
    return true;
  }
  if (m.stunT > 0) {
    m.stunT--;
    return true;
  }
  return false;
}

/** Animation d'attaque en cours : le coup part à `hitFrame`, puis délai de récupération de l'attaque à la fin de l'animation */
function continueAttack(w: World, m: Monster, slow: number): void {
  const atk = m.def.attacks[m.atk];
  m.modeT += slow * (m.mods.includes('extraFast') ? 1.3 : 1) * (1 + (m.atkSpdPct ?? 0) / 100) * auraAtkMul(m, w.tick) * (m.curseAtk ?? 1);
  if (!m.atkApplied && m.modeT >= atk.hitFrame) {
    m.atkApplied = true;
    applyAttack(w, m, atk);
  } else if (m.atkApplied && atk.kind === 'breath' && atk.element === 'light' && w.tick % 2 === 0) {
    // jet continu : l'éclair rouge reste visible tant que dure l'animation des mains
    redLightning(w, m, atk.range + 1, m.facing);
  }
  if (m.modeT >= m.modeLen) {
    m.mode = 'idle';
    m.atkCd[m.atk] = atk.cooldown;
  }
}

/** Réveil (vue de la cible : la meute s'éveille), flânerie, aveuglement, abandon de la chasse ; faux : le monstre ne poursuit pas ce tick */
function engaged(w: World, m: Monster, p: Player | Monster, d: number): boolean {
  if (!m.aggro) {
    if (!p.dead && d < m.def.aggro && (d < 5 || w.grid.lineOfSight(m.x, m.y, p.x, p.y))) {
      aggroPack(w, m);
    } else {
      // au repos loin du joueur, hors de l'écran : pas de flânerie (cartes denses : ~1 000 monstres)
      if (d > Math.max(SLEEP_RANGE, w.viewReach + 8)) {
        m.mode = 'idle';
        return false;
      }
      wander(w, m);
      return false;
    }
  }
  if (p.dead) {
    wander(w, m);
    return false;
  }
  // Vision réduite : le monstre aveuglé ne voit plus que de tout près
  if ((m.blindUntil ?? 0) > w.tick && d > BLIND_SIGHT) {
    wander(w, m);
    return false;
  }
  // perte d'aggro si très loin (retour au calme)
  if (d > LEASH_RANGE) {
    m.aggro = false;
    return false;
  }
  return true;
}

/** Téléportation (modificateur d'unique) : près de la cible quand elle est loin, un tick sur 50 */
function monsterTeleport(w: World, m: Monster, p: Player | Monster, d: number): void {
  if (!(m.mods.includes('teleport') && d > 9 && w.tick % 50 === m.id % 50)) return;
  const a = w.rng.ai.float(0, TAU);
  const spot = w.grid.nearestFree(p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3, 3);
  if (spot) {
    w.events.push({ t: 'teleport', id: m.id, fx: m.x, fy: m.y, tx: spot.x, ty: spot.y });
    m.x = spot.x;
    m.y = spot.y;
    m.px = spot.x;
    m.py = spot.y;
  }
}

/** Panique : on s'éloigne de la cible (le Déchu au trésor fuit tant qu'on l'approche) ; vrai si le monstre fuit ce tick */
function flee(w: World, m: Monster, p: Player | Monster, d: number, slow: number): boolean {
  if (!((m.fleeUntil !== undefined && m.fleeUntil > w.tick) || (m.def.coward && m.aggro && d < 9))) return false;
  const fx = (m.x - p.x) / (d || 1);
  const fy = (m.y - p.y) / (d || 1);
  m.facing = Math.atan2(fy, fx);
  w.moveActor(m, fx * m.speed * auraSpeedMul(m, w.tick) * slow * (m.curseMove ?? 1) * DT, fy * m.speed * auraSpeedMul(m, w.tick) * slow * (m.curseMove ?? 1) * DT, false);
  m.mode = 'walk';
  return true;
}

/** Tirage pondéré parmi les attaques prêtes, à portée et possibles (ligne de vue, invocations, soins) ; vrai si une attaque commence */
function pickAttack(w: World, m: Monster, p: Player | Monster, reach: number): boolean {
  const choices: number[] = [];
  const weights: number[] = [];
  m.def.attacks.forEach((a, i) => {
    if (m.atkCd[i] > 0) return;
    if (reach > a.range) return;
    if (a.kind === 'missile' || a.kind === 'breath' || (a.kind === 'cast' && a.pattern !== 'prison' && a.pattern !== 'blizzard' && a.pattern !== 'tentacle')) {
      if (!w.grid.lineOfSight(m.x, m.y, p.x, p.y)) return;
    }
    if (a.kind === 'summon' && m.summoned >= 6) return;
    if (a.kind === 'summon' && a.revive && !reviveTarget(w, m, a)) return;
    if (a.kind === 'heal' && !healTarget(w, m, a)) return;
    choices.push(i);
    weights.push(a.weight);
  });
  if (!choices.length) return false;
  const pick = choices[w.rng.ai.weightedIndex(weights)];
  startAttack(w, m, pick, p);
  return true;
}

/**
 * Déplacement : les tireurs (`keepDistance`) reculent ou tournent autour de la cible ; les autres vont droit sur elle si le trajet est
 * praticable, sinon suivent le champ de flux. Séparation entre monstres et collision dure avec le joueur ajoutées au pas.
 */
function moveTowards(w: World, m: Monster, p: Player | Monster, d: number, reach: number, slow: number): void {
  const pl = w.player;
  const keep = m.def.keepDistance ?? 0;
  let dirX = 0;
  let dirY = 0;
  if (keep > 0 && d < keep * 0.7) {
    // les tireurs reculent, mais jamais dans un mur : le recul glisse le long de l'obstacle, ou s'arrête (le tireur tient sa position)
    const back = retreatDirection(w, m, (m.x - p.x) / (d || 1), (m.y - p.y) / (d || 1));
    if (back) {
      dirX = back.x;
      dirY = back.y;
    }
  } else if (keep > 0 && d < keep && w.grid.lineOfSight(m.x, m.y, p.x, p.y)) {
    // à bonne distance : on tourne autour
    const side = m.id % 2 === 0 ? 1 : -1;
    dirX = (-(p.y - m.y) / (d || 1)) * side * 0.6;
    dirY = ((p.x - m.x) / (d || 1)) * side * 0.6;
  } else if (reach > 0.05) {
    // ligne droite seulement si le trajet est praticable (une clôture laisse voir mais bloque)
    // a game mode's open arenas (rule `ai.directChase`, lot 292b): straight at any distance when the way is clear
    if ((d < 10 || RULES['ai.directChase'](w, m)) && w.grid.walkLine(m.x, m.y, p.x, p.y, TERRAIN_RADIUS + 0.02)) {
      dirX = (p.x - m.x) / d;
      dirY = (p.y - m.y) / d;
    } else {
      const f = w.flowField().direction(m.x, m.y);
      if (f) {
        dirX = f.x;
        dirY = f.y;
      } else {
        dirX = (p.x - m.x) / (d || 1);
        dirY = (p.y - m.y) / (d || 1);
      }
    }
  }
  const { sx, sy } = separation(w, m, pl);
  // a game mode's catch-up (rule `ai.chaseSpeed`, lot 301); base: 1
  const speed = m.speed * auraSpeedMul(m, w.tick) * slow * (m.curseMove ?? 1) * RULES['ai.chaseSpeed'](w, m, d);
  if (dirX !== 0 || dirY !== 0) {
    m.facing = Math.atan2(dirY, dirX);
    if (keep > 0 && d < keep) m.facing = Math.atan2(p.y - m.y, p.x - m.x);
    w.moveActor(m, dirX * speed * DT + sx * 0.5, dirY * speed * DT + sy * 0.5, false);
    m.mode = 'walk';
  } else {
    if (sx !== 0 || sy !== 0) w.moveActor(m, sx * 0.5, sy * 0.5, false);
    m.facing = Math.atan2(p.y - m.y, p.x - m.x);
    m.mode = 'idle';
  }
}

/** Poussée de séparation : chevauchement avec les monstres voisins, et collision dure (double) avec le joueur */
function separation(w: World, m: Monster, pl: Player): { sx: number; sy: number } {
  const near = w.monsterHash.query(m.x, m.y, m.radius + 0.6, nearBuf);
  let sx = 0;
  let sy = 0;
  for (const o of near) {
    if (o === m || o.dead) continue;
    const dx = m.x - o.x;
    const dy = m.y - o.y;
    const dd = Math.hypot(dx, dy) || 0.01;
    const overlap = m.radius + o.radius - dd;
    if (overlap > 0) {
      sx += (dx / dd) * overlap;
      sy += (dy / dd) * overlap;
    }
  }
  const pdx = m.x - pl.x;
  const pdy = m.y - pl.y;
  const pdd = Math.hypot(pdx, pdy) || 0.01;
  const pov = m.radius + pl.radius - pdd;
  if (pov > 0) {
    sx += (pdx / pdd) * pov * 2;
    sy += (pdy / pdd) * pov * 2;
  }
  return { sx, sy };
}

/**
 * Direction de recul d'un tireur : l'opposé du joueur si le chemin est libre sur ~1,5 unité, sinon la direction libre la plus proche
 * (rotations jusqu'à 90°, sans jamais se rapprocher du joueur). null : acculé, il reste en place et tire.
 */
export function retreatDirection(w: Pick<World, 'grid'>, m: { x: number; y: number; radius: number }, ax: number, ay: number): { x: number; y: number } | null {
  const reach = 1.5;
  for (const deg of [0, 35, -35, 70, -70, 90, -90]) {
    const a = (deg * Math.PI) / 180;
    const x = ax * Math.cos(a) - ay * Math.sin(a);
    const y = ax * Math.sin(a) + ay * Math.cos(a);
    if (w.grid.walkLine(m.x, m.y, m.x + x * reach, m.y + y * reach, Math.min(m.radius, 0.4))) return { x, y };
  }
  return null;
}

function aggroPack(w: World, m: Monster): void {
  m.aggro = true;
  const near = w.monsterHash.query(m.x, m.y, 7, nearBuf);
  // D2 : seule la meute (même chef) est alertée ; les groupes voisins non liés ne le sont que s'ils sont collés
  const group = m.leader || m.id;
  for (const o of near) {
    if (o.dead || o.isSummon) continue;
    if ((o.leader || o.id) === group || dist(m.x, m.y, o.x, o.y) < 3) o.aggro = true;
  }
  if (m.rank === 'boss') w.events.push({ t: 'bossSpawn', id: m.id, name: m.name });
}

function wander(w: World, m: Monster): void {
  if (w.tick % 75 === m.id % 75) {
    const a = w.rng.ai.float(0, TAU);
    const r = w.rng.ai.float(0, 3);
    m.wanderX = m.spawnX + Math.cos(a) * r;
    m.wanderY = m.spawnY + Math.sin(a) * r;
  }
  const dx = m.wanderX - m.x;
  const dy = m.wanderY - m.y;
  const dd = Math.hypot(dx, dy);
  if (dd > 0.3) {
    const s = m.speed * 0.35 * DT;
    m.facing = Math.atan2(dy, dx);
    w.moveActor(m, (dx / dd) * s, (dy / dd) * s, false);
    m.mode = 'walk';
  } else {
    m.mode = 'idle';
  }
}

function startAttack(w: World, m: Monster, i: number, p: Player | Monster): void {
  const atk = m.def.attacks[i];
  m.mode = 'attack';
  m.atk = i;
  m.modeT = 0;
  m.modeLen = atk.frames;
  m.atkApplied = false;
  m.atkTarget = { x: p.x, y: p.y };
  m.facing = Math.atan2(p.y - m.y, p.x - m.x);
  w.events.push({ t: 'monsterAttack', id: m.id, tx: p.x, ty: p.y, kind: atk.kind });
}

/** Cible actuelle d'un monstre : une créature du Druide (m.tgt) ou le joueur */
function targetOf(w: World, m: Monster): Player | Monster {
  if (m.tgt) {
    const t = w.pets.find((x) => x.id === m.tgt);
    if (t && !t.dead) return t;
  }
  return w.player;
}

/** Choix de cible (réévalué toutes les 0,4 s) : la plus proche entre le joueur et ses créatures */
function chooseTarget(w: World, m: Monster): Player | Monster {
  const cur = targetOf(w, m);
  if (cur !== w.player && w.tick % 10 !== m.id % 10) return cur;
  // a game mode's target keeping (rule `ai.targetLock`, lot 301): the target held a while, another taken only when clearly nearer
  const lock = RULES['ai.targetLock'](w, m);
  const curAlive = !cur.dead;
  if (lock.hold > 0 && curAlive && m.tgtAt !== undefined && w.tick - m.tgtAt < lock.hold) return cur;
  const pl = w.player;
  let best: Player | Monster = pl;
  let bd = pl.dead ? Infinity : dist(m.x, m.y, pl.x, pl.y);
  for (const pet of w.pets) {
    const dd = dist(m.x, m.y, pet.x, pet.y) + lock.margin;
    if (dd - lock.margin > lock.petRange) continue;
    if (dd < bd) {
      bd = dd;
      best = pet;
    }
  }
  // the base's margin favours the hero; a lock's margin favours the current target too
  const cd = dist(m.x, m.y, cur.x, cur.y);
  if (lock.hold > 0 && curAlive && best !== cur && cd <= bd + lock.margin && (cur === pl || cd <= lock.petRange)) best = cur;
  const id = best === pl ? 0 : best.id;
  if (lock.hold > 0 && id !== (m.tgt ?? 0)) m.tgtAt = w.tick;
  m.tgt = id;
  return best;
}

/** Coup porté à la cible : joueur (armures de froid, ronces) ou créature */
function hitTarget(w: World, m: Monster, t: Player | Monster, pk: DamagePacket): number {
  if (t.kind === 'monster') return hurtPet(w, t, pk, m);
  const dealt = w.hurtPlayerPacket(m, pk);
  if (dealt > 0) {
    if (!pk.spell) reflectFlat(w, m);
    fireProcs(w, 'GetHit', m);
  }
  // Vierge de fer : le monstre maudit subit une part des dégâts qu'il inflige
  const im = activeCurse(m, 'iron_maiden', w.tick);
  if (!pk.spell && dealt > 0 && im) damageMonster(w, m, { ...emptyPacket(false), phys: (dealt * lin(SKILL_BY_ID.iron_maiden.n.value, im.level)) / 100 }, w.player);
  if (!pk.spell && dealt > 0 && w.player.d.thorns > 0) damageMonster(w, m, { ...emptyPacket(false), phys: (dealt * w.player.d.thorns) / 100 }, w.player);
  return dealt;
}

/** Créatures prises dans une zone (nova, souffle) */
function petsInRadius(w: World, x: number, y: number, r: number, m: Monster, pk: DamagePacket): void {
  for (const pet of w.pets) if (!pet.dead && dist(x, y, pet.x, pet.y) <= r + pet.radius) hurtPet(w, pet, { ...pk }, m);
}

/** Trait d'éclair rouge (Diablo) de la gueule du monstre vers l'angle donné (visuel seul ; les dégâts sont dans applyAttack). */
function redLightning(w: World, m: Monster, r: number, ang: number): void {
  const pts = [m.x, m.y];
  for (let k = 1; k <= 4; k++) {
    const j = k < 4 ? w.rng.ai.float(-0.5, 0.5) : 0;
    pts.push(m.x + Math.cos(ang) * r * (k / 4) - Math.sin(ang) * j, m.y + Math.sin(ang) * r * (k / 4) + Math.cos(ang) * j);
  }
  w.events.push({ t: 'beam', kind: 'red_lightning', points: pts, elem: 'light' });
}

/** Attaque de monstre en cours : attaquant, attaque, joueur, cible (joueur ou créature du Druide), dégâts tirés */
interface AttackCtx {
  w: World;
  m: Monster;
  atk: MonsterAttack;
  pl: Player;
  p: Player | Monster;
  dmg: number;
}

/** Applique le coup d'une attaque de monstre (dégâts tirés une fois, puis effet propre à sa nature : `ATTACKS`) */
function applyAttack(w: World, m: Monster, atk: MonsterAttack): void {
  const pl = w.player;
  const p = targetOf(w, m);
  const dmg = rollMonsterDamage(w, m, atk);
  const run = Object.prototype.hasOwnProperty.call(ATTACKS, atk.kind) ? ATTACKS[atk.kind] : undefined;
  run?.({ w, m, atk, pl, p, dmg });
}

function attackMelee({ w, m, atk, pl, p, dmg }: AttackCtx): void {
  const d = dist(m.x, m.y, p.x, p.y) - m.radius - p.radius;
  if (d <= atk.range + 0.6) {
    const pk = emptyPacket(atk.element !== 'phys');
    pk[atk.element] += dmg;
    eliteElemBonus(w, m, pk, dmg);
    const dealt = hitTarget(w, m, p, pk);
    if (p === pl) {
      if (dealt > 0 && m.mods.includes('manaBurn')) pl.mana = Math.max(0, pl.mana - dealt * 0.5);
      // Châtiment (D2 Smite) : le coup étourdit (récupération forcée)
      if (dealt > 0 && atk.stun && !pl.dead) {
        pl.mode = 'hit';
        pl.modeT = 0;
        pl.modeLen = atk.stun;
        pl.goal = null;
      }
      if (pl.buffs.length) armorRetaliate(w, m);
    }
  }
}

function attackCharge({ w, m, atk, p, dmg }: AttackCtx): void {
  const d = dist(m.x, m.y, p.x, p.y);
  const step = Math.min(d - m.radius - p.radius, atk.range);
  if (step > 0) w.moveActor(m, ((p.x - m.x) / d) * step, ((p.y - m.y) / d) * step, false);
  if (dist(m.x, m.y, p.x, p.y) - m.radius - p.radius < 1.2) {
    const pk = emptyPacket(false);
    pk[atk.element] += dmg;
    hitTarget(w, m, p, pk);
  }
}

function attackMissile({ w, m, atk, dmg }: AttackCtx): void {
  const shots = m.mods.includes('multishot') ? 3 : 1;
  // a game mode's aim (rule `ai.missileLead`, base 0: the place the target was at the attack's start)
  let tx = m.atkTarget.x;
  let ty = m.atkTarget.y;
  const lead = RULES['ai.missileLead'](w, m);
  if (lead > 0) {
    // the intercept of a missile of speed `sp` (units a tick) with the target moving on as it does this tick
    const t = targetOf(w, m);
    const vx = t.x - t.px;
    const vy = t.y - t.py;
    const dx = t.x - m.x;
    const dy = t.y - m.y;
    const sp = Math.max(0.01, missileSpeed(atk.missile) * (m.missileMul ?? 1) * DT);
    const a = vx * vx + vy * vy - sp * sp;
    const b = 2 * (dx * vx + dy * vy);
    const c = dx * dx + dy * dy;
    const disc = b * b - 4 * a * c;
    const k = Math.abs(a) < 1e-9 ? (b < 0 ? -c / b : 0) : disc >= 0 ? Math.max(0, (-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)) : 0;
    tx = t.x + vx * k * lead;
    ty = t.y + vy * k * lead;
  }
  const base = Math.atan2(ty - m.y, tx - m.x);
  for (let s = 0; s < shots; s++) {
    const a = base + (s - (shots - 1) / 2) * 0.2;
    const pk = emptyPacket(true);
    pk[atk.element] += dmg;
    eliteElemBonus(w, m, pk, dmg);
    spawnMissile(w, {
      kind: atk.missile ?? 'arrow',
      team: 1,
      owner: m.id,
      x: m.x,
      y: m.y,
      angle: a,
      speed: missileSpeed(atk.missile) * (m.missileMul ?? 1),
      radius: 0.3,
      range: atk.range + 4,
      dmg: pk,
      elem: atk.element,
    });
  }
}

function attackNova({ w, m, atk, pl, dmg }: AttackCtx): void {
  const r = atk.radius ?? 4;
  w.events.push({ t: 'nova', kind: `m_${atk.element}`, x: m.x, y: m.y, radius: r, elem: atk.element });
  const pk = emptyPacket(true);
  pk[atk.element] += dmg;
  if (atk.element === 'cold') pk.freeze = 20;
  if (dist(m.x, m.y, pl.x, pl.y) <= r + pl.radius) w.hurtPlayerPacket(m, { ...pk });
  if (w.pets.length) petsInRadius(w, m.x, m.y, r, m, pk);
}

function attackBreath({ w, m, atk, pl, p, dmg }: AttackCtx): void {
  const r = atk.range + 1;
  const ang = Math.atan2(p.y - m.y, p.x - m.x);
  if (atk.element === 'light') {
    // Éclair rouge (Diablo) : trait brisé de la gueule vers la cible (puis jet continu jusqu'à la fin de l'animation, voir updateMonster)
    redLightning(w, m, r, ang);
  } else w.events.push({ t: 'impact', kind: `breath_${atk.element}`, x: m.x + Math.cos(ang) * r * 0.5, y: m.y + Math.sin(ang) * r * 0.5, radius: r * 0.5, elem: atk.element });
  const pk = emptyPacket(true);
  pk[atk.element] += dmg;
  if (dist(m.x, m.y, pl.x, pl.y) <= r) w.hurtPlayerPacket(m, { ...pk });
  if (w.pets.length) petsInRadius(w, m.x + Math.cos(ang) * r * 0.5, m.y + Math.sin(ang) * r * 0.5, r * 0.5, m, pk);
}

function attackCast({ w, m, atk, dmg }: AttackCtx): void {
  castBossSkill(w, m, atk, dmg);
}

function attackCurse({ w, m, atk, pl, p }: AttackCtx): void {
  // malédiction lancée sur le joueur (niveau : celui du monstre / 5 + 1, comme le modificateur « Maudit » ; Uber Baal : −75 %)
  if (p === pl && dist(m.x, m.y, pl.x, pl.y) <= atk.range + 1)
    cursePlayer(w, atk.curse ?? 'amplify_damage', m.def.id === 'uber_baal' && atk.curse === 'lower_resist' ? 99 : Math.floor(m.mlvl / 5) + 1);
}

function attackHeal({ w, m, atk }: AttackCtx): void {
  // Soin zakarum / Vortex de soin : l'allié le plus blessé à portée regagne 25 % de ses PV
  const t = healTarget(w, m, atk);
  if (t && w.tick >= (t.noHealUntil ?? 0)) {
    t.hp = Math.min(t.hpMax, t.hp + t.hpMax * 0.25);
    w.events.push({ t: 'impact', kind: 'heal', x: t.x, y: t.y, radius: 0.8, elem: 'magic' });
  }
}

function attackSummon({ w, m, atk }: AttackCtx): void {
  if (atk.revive) {
    // D2 : le Chaman relève un Déchu mort près de lui (le cadavre disparaît), sans butin
    const corpse = reviveTarget(w, m, atk);
    if (!corpse) return;
    const s = spawnMonster(w, corpse.def.id, corpse.x, corpse.y, { rank: corpse.rank === 'minion' ? 'minion' : 'normal', leader: corpse.leader, noLoot: true }, `rez:${corpse.id}:${m.summoned}`);
    corpse.deathTick = w.tick - TICK_HZ * 12;
    if (s) {
      s.aggro = true;
      m.summoned++;
    }
    return;
  }
  const hydra = atk.summon === 'baal_hydra';
  const n = hydra ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const a = w.rng.ai.float(0, TAU);
    const s = spawnMonster(w, atk.summon ?? 'fallen', m.x + Math.cos(a) * 2, m.y + Math.sin(a) * 2, { rank: 'minion', leader: m.id, noLoot: true }, `sum:${m.id}:${m.summoned}`);
    if (s && hydra) s.expireTick = w.tick + TICK_HZ * 12;
    if (s) {
      s.aggro = true;
      m.summoned++;
    }
  }
}

/** Effet d'une attaque de monstre selon sa nature (au moment du coup, voir continueAttack) */
const ATTACKS: Record<string, (c: AttackCtx) => void> = {
  melee: attackMelee,
  charge: attackCharge,
  missile: attackMissile,
  nova: attackNova,
  breath: attackBreath,
  cast: attackCast,
  curse: attackCurse,
  heal: attackHeal,
  summon: attackSummon,
};

/**
 * Dégâts élémentaires des élites (Arreat Summit) : uniques enchantés +66-100 % de l'élément (moyenne 0,83) ; sbires +33-50 %
 * en Cauchemar et en Enfer ; Coup spectral : un élément au hasard (magie, feu, foudre, froid, poison) ; champions fantomatiques : froid +33-50 %.
 */
function eliteElemBonus(w: World, m: Monster, pk: DamagePacket, dmg: number): void {
  if (!m.mods.length) return;
  const lead = m.rank === 'unique';
  const mul = lead ? 0.83 : m.rank === 'minion' && w.difficulty > 0 ? 0.415 : 0;
  for (const mod of m.mods) {
    if (mod === 'ghostly') {
      pk.cold += dmg * 0.415;
    }
    if (!mul) continue;
    if (mod === 'fireEnchanted') pk.fire += dmg * mul;
    else if (mod === 'coldEnchanted') pk.cold += dmg * mul;
    else if (mod === 'lightningEnchanted') pk.light += dmg * mul;
    else if (mod === 'manaBurn') pk.magic += dmg * mul * 0.5;
    else if (mod === 'spectralHit') pk[w.rng.combat.pick(['magic', 'fire', 'light', 'cold', 'poison'] as const)] += dmg * mul;
  }
}

/** Allié blessé (moins de 70 % de ses PV) à portée de soin */
function healTarget(w: World, m: Monster, a: MonsterAttack): Monster | undefined {
  let best: Monster | undefined;
  for (const o of w.monsterHash.query(m.x, m.y, a.range, nearBuf)) {
    if (o.dead || o.isSummon || o.pet || o.rank === 'boss' || o.hp > o.hpMax * 0.7) continue;
    if (!best || o.hp / o.hpMax < best.hp / best.hpMax) best = o;
  }
  return best;
}

/** Cadavre récent (encore visible) de l'espèce invoquée, à portée de résurrection */
function reviveTarget(w: World, m: Monster, a: MonsterAttack): Monster | undefined {
  // '*' : n'importe quel cadavre de monstre (Démêleur, Résurrection), sauf boss et créatures invoquées par un joueur
  return w.monsters.find(
    (x) => x.dead && (a.summon === '*' ? x.def.family !== 'pet' && !x.isSummon && x.rank !== 'boss' : x.def.id === a.summon) && w.tick - x.deathTick < TICK_HZ * 10 && dist(x.x, x.y, m.x, m.y) < 9,
  );
}

function missileSpeed(kind: string | undefined): number {
  switch (kind) {
    case 'arrow':
      return 16;
    case 'bone':
      return 11;
    case 'firebolt_m':
      return 12;
    case 'coldbolt_m':
      return 11;
    case 'lightning_m':
      return 18;
    case 'spit':
      return 10;
    default:
      return 12;
  }
}

/** Effets à la mort des champions/uniques enchantés */
export function monsterDeathEffects(w: World, m: Monster): void {
  const p = w.player;
  // D2 : seul l'unique explose ou libère sa nova (ses sbires partagent l'enchantement, pas l'effet de mort)
  if (m.rank !== 'unique') return;
  if (m.mods.includes('fireEnchanted')) {
    w.events.push({ t: 'nova', kind: 'm_fire', x: m.x, y: m.y, radius: 3, elem: 'fire' });
    if (dist(m.x, m.y, p.x, p.y) < 3) w.hurtPlayer(m, 'fire', m.dmgMax * 1.2, true);
  }
  if (m.mods.includes('coldEnchanted')) {
    w.events.push({ t: 'nova', kind: 'm_cold', x: m.x, y: m.y, radius: 3.5, elem: 'cold' });
    if (dist(m.x, m.y, p.x, p.y) < 3.5) w.hurtPlayer(m, 'cold', m.dmgMax * 0.8, true, { freeze: 30 });
  }
}

/** Hydre : tourelle immobile qui tire des traits de feu sur l'ennemi le plus proche. */
function updateSummon(w: World, m: Monster): void {
  if (m.expireTick !== undefined && w.tick >= m.expireTick) {
    m.dead = true;
    m.deathTick = w.tick;
    m.mode = 'death';
    return;
  }
  for (let i = 0; i < m.atkCd.length; i++) if (m.atkCd[i] > 0) m.atkCd[i]--;
  if (m.atkCd[0] > 0) return;
  const targets = w.monstersNear(m.x, m.y, 11, nearBuf);
  let best: Monster | null = null;
  let bd = Infinity;
  for (const t of targets) {
    const d = dist(m.x, m.y, t.x, t.y);
    if (d < bd && w.grid.lineOfSight(m.x, m.y, t.x, t.y)) {
      bd = d;
      best = t;
    }
  }
  if (!best) return;
  m.facing = Math.atan2(best.y - m.y, best.x - m.x);
  m.mode = 'attack';
  m.modeT = 0;
  m.atkCd[0] = Math.round(TICK_HZ * 0.9);
  const pk = emptyPacket(true);
  pk.fire = w.rng.combat.float(m.dmgMin, m.dmgMax);
  const big = m.summonSkill === 'hydra';
  // boules de l'Hydre perforantes : règle skills.sorceress (D2 : non)
  spawnMissile(w, {
    kind: big ? 'hydra_ball' : 'hydra_bolt',
    team: 0,
    owner: w.player.id,
    x: m.x,
    y: m.y,
    angle: m.facing,
    speed: 14,
    radius: 0.35,
    range: 14,
    dmg: pk,
    elem: 'fire',
    pierce: big && RULES['skills.sorceress']().hydraPierce,
  });
}
