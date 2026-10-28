/**
 * Formules de combat : résistances, immunités, pénétration, test de toucher, blocage,
 * réduction de dégâts, récupération après coup. Aucune dépendance au rendu.
 */
import { ELEMENTS, type Element } from '../data/stats';
import { clamp, dist } from '../core/math';
import type { DamagePacket, Monster, Player } from './actors';
import { activeCurse } from './actors';
import type { World } from './world';
import { fbrFrames, fhrFrames, type RecCtx } from './breakpoints';
import { announceBroken, wearOnHit } from './durability';
import { TICK_HZ } from './constants';
import { fireProcs } from './procs';
import { RULES } from '../mods/rules';
import { SKILL_BY_ID } from '../data/skills';
import { hexDefensePct, hexElemRes, hexPhysRes, hexPlayerDmgMul, lightningEnchantedBurst, onMonsterHitPlayer } from './monster-auras';
import { convictionRes, mercAuraAt } from './merc-core';

const IMMUNE_THRESHOLD = 100;

/**
 * Résistance effective d'un monstre face à un élément : règle `combat.monsterRes` du jeu de règles (base : D2, src/mods/d2/combat.ts).
 * `pierce` : pénétrations (maîtrises, « −% à la résistance ennemie ») ; `sunder` : brisure de l'immunité ; `reduction` : réductions qui
 * cassent les immunités (Conviction, malédictions) ; `soft` : réduction « douce » (Berserk).
 */
export function effectiveMonsterRes(baseRes: number, pierce: number, sunder: boolean, reduction = 0, soft = 0): { res: number; immune: boolean } {
  return RULES['combat.monsterRes'](baseRes, pierce, sunder, reduction, soft);
}

/** Réduction totale (aura + débuffs actifs) sur un monstre pour un élément */
export function monsterReduction(w: World, m: Monster, e: Element, attacker: Player | null): number {
  let r = 0;
  const d = m.red[e];
  if (d && d.until > w.tick && !d.soft) r += d.v;
  // Conviction (aura du joueur ou de son mercenaire) : agit sur les monstres, quel que soit l'attaquant
  if (e === 'fire' || e === 'cold' || e === 'light')
    r += Math.max(dist(w.player.x, w.player.y, m.x, m.y) <= (attacker ?? w.player).d.convictionRadius ? (attacker ?? w.player).d.conviction : 0, convictionRes(mercAuraAt(w, 'conviction', m.x, m.y)));
  return r;
}

/** Réduction « douce » (Berserk : perce la résistance physique sans briser l'immunité) */
function monsterSoftReduction(w: World, m: Monster, e: Element): number {
  const d = m.red[e];
  return d && d.soft && d.until > w.tick ? d.v : 0;
}

export function monsterIsImmune(m: Monster, e: Element, attacker?: Player, w?: World): boolean {
  const base = m.res[e] ?? 0;
  if (base < IMMUNE_THRESHOLD) return false;
  const red = w ? monsterReduction(w, m, e, attacker ?? null) : 0;
  return RULES['combat.monsterRes'](base, 0, !!attacker?.d.sunder[e], red, 0).immune;
}

/** Chance de toucher façon D2 : 2 × alvl/(alvl+dlvl) × AR/(AR+DEF), bornée à [5 %, 95 %]. */
export function hitChance(ar: number, def: number, alvl: number, dlvl: number): number {
  if (ar <= 0) return 0.05;
  const c = 2 * (alvl / (alvl + dlvl)) * (ar / (ar + Math.max(0, def)));
  return clamp(c, 0.05, 0.95);
}

/** Chance de blocage D2 : bloc × (dex − 15) / (niveau × 2), plafonnée à 75 %. */
export function blockChance(block: number, dex: number, clvl: number): number {
  if (block <= 0) return 0;
  return clamp((block * Math.max(0, dex - 15)) / (clvl * 2) / 100, 0, 0.75);
}

/** Inflige des dégâts à un monstre. Renvoie les dégâts réellement infligés. */
export function damageMonster(w: World, m: Monster, p: DamagePacket, attacker: Player | Monster | null): number {
  if (m.dead) return 0;
  const player = attacker && attacker.kind === 'player' ? attacker : null;
  let total = 0;
  let physDealt = 0;
  let mainElem: Element = 'phys';
  let mainAmt = 0;
  let immuneTo: Element | null = null;
  // dégâts d'arme contre les morts-vivants / démons (objets, runes, mots runiques)
  let vsMul = 1;
  if (player && !p.spell) {
    const fam = m.def.family;
    if (fam === 'undead' || fam === 'skeleton') vsMul += (player.d.all.get('dmgUndeadPct') ?? 0) / 100;
    else if (fam.startsWith('demon')) vsMul += (player.d.all.get('dmgDemonPct') ?? 0) / 100;
  }
  // malédictions de monstres sur le joueur : Affaiblissement, Décrépitude
  if (player) vsMul *= hexPlayerDmgMul(player, w.tick);
  // mercenaire contre un boss : part de ses dégâts (règle `merc.bossDamagePct`)
  if ((attacker as Monster | null)?.pet === 'merc') vsMul *= RULES['merc.bossDamagePct'](w, m) / 100;
  for (const e of ELEMENTS) {
    const raw = p[e] * vsMul;
    if (raw <= 0) continue;
    const pierce = (player ? player.d.pierce[e] : 0) + (p.pierceRes?.[e] ?? 0);
    const sunder = player ? player.d.sunder[e] : false;
    // PD2 : le porteur de l'aura Sanctuaire ignore la résistance et l'immunité physiques des morts-vivants (pas des boss)
    const ignorePhys = e === 'phys' && !!player && (player.d.all.get('sanctuaryAura') ?? 0) > 0 && (m.def.family === 'undead' || m.def.family === 'skeleton') && m.rank !== 'boss' && !m.mapBoss;
    const { res, immune } = effectiveMonsterRes(ignorePhys ? 0 : (m.res[e] ?? 0), pierce, sunder, monsterReduction(w, m, e, player), monsterSoftReduction(w, m, e));
    if (immune) {
      immuneTo = e;
      continue;
    }
    let dmg = raw * (1 - res / 100);
    if (e === 'phys' && (player || (attacker as Monster | null)?.pet === 'merc')) {
      // frappe écrasante : une part des PV actuels (règle `combat.crushingBlow`)
      if (p.crush && w.rng.combat.chance(p.crush / 100)) dmg += RULES['combat.crushingBlow'](w, m, p, player, res);
    }
    if (dmg > 0) {
      if (e === 'phys') physDealt += dmg;
      total += dmg;
      if (dmg > mainAmt) {
        mainAmt = dmg;
        mainElem = e;
      }
    }
  }
  // Statuts : ne s'appliquent que si le froid n'est pas bloqué par une immunité
  const coldImmune = monsterIsImmune(m, 'cold', player ?? undefined, w);
  if (!coldImmune)
    RULES['combat.chillFreeze'](
      w,
      m,
      p,
      () => effectiveMonsterRes(m.res.cold ?? 0, player ? player.d.pierce.cold : 0, player ? player.d.sunder.cold : false, monsterReduction(w, m, 'cold', player)).res,
    );
  if (p.burn && !monsterIsImmune(m, 'fire', player ?? undefined, w)) {
    const { res } = effectiveMonsterRes(m.res.fire ?? 0, player ? player.d.pierce.fire : 0, player ? player.d.sunder.fire : false, monsterReduction(w, m, 'fire', player));
    m.burnDps = Math.max(m.burnDps, p.burn.dps * (1 - res / 100));
    m.burnT = Math.max(m.burnT, p.burn.ticks);
  }
  if (p.poisonDot && !monsterIsImmune(m, 'poison', player ?? undefined, w)) {
    const { res } = effectiveMonsterRes(m.res.poison ?? 0, player ? player.d.pierce.poison : 0, false, monsterReduction(w, m, 'poison', player));
    // D2 : le poison ne se cumule pas, le plus fort (dégâts totaux restants) remplace l'ancien
    const dps = p.poisonDot.dps * (1 - res / 100);
    const remaining = (m.poisonDps ?? 0) * Math.max(0, m.poisonT ?? 0);
    if (dps * p.poisonDot.ticks >= remaining) {
      m.poisonDps = dps;
      m.poisonT = p.poisonDot.ticks;
    }
    m.aggro = true;
  }
  if (p.stun && m.rank !== 'boss') m.stunT = Math.max(m.stunT, p.stun);
  // « ralentit la cible » (objets) : effet de coup d'arme, moitié moindre sur les boss
  if (player && !p.spell) {
    const sl = player.d.all.get('slowTarget') ?? 0;
    if (sl > 0) {
      const pct = (m.rank === 'boss' || m.mapBoss ? sl / 2 : sl) / 100;
      m.chillT = Math.max(m.chillT, 2 * TICK_HZ);
      m.chillPct = Math.max(m.chillPct, pct);
    }
  }
  // effets de coup d'arme : le monstre ne guérit plus pendant quelques secondes, il peut fuir
  if (player && !p.spell && total > 0) {
    const d = player.d.all;
    if (d.get('preventMonsterHeal')) m.noHealUntil = w.tick + 8 * TICK_HZ;
    const fl = d.get('fleeChance') ?? 0;
    if (fl > 0 && m.rank !== 'boss' && m.rank !== 'unique' && w.rng.combat.chance(fl / 100)) m.fleeUntil = w.tick + 2 * TICK_HZ;
  }
  if (total <= 0) {
    if (immuneTo) w.events.push({ t: 'immune', target: m.id, elem: immuneTo, x: m.x, y: m.y });
    return 0;
  }
  // dernier coup du mercenaire (vie par victime, découverte d'objets) ; un autre attaquant le lui reprend
  if ((attacker as Monster | null)?.pet === 'merc') m.mercHit = attacker!.id;
  else if (attacker) m.mercHit = undefined;
  const hpBefore = m.hp;
  applyMonsterDamage(w, m, total, mainElem, player);
  if (player && p.knockback && m.rank !== 'boss' && !m.mapBoss && (p.knockbackPct === undefined || w.rng.combat.chance(p.knockbackPct / 100)))
    w.knockback(m, p.srcX ?? player.x, p.srcY ?? player.y, p.knockback);
  // vol de vie / mana (attaques physiques uniquement, comme D2)
  if (player && !p.spell) {
    // Drain de vie : le Nécromancien regagne une part des dégâts d'attaque infligés aux maudits
    // part volée : règle skills.necromancer (D2 : calc1 de la table ; PD2 : selon les points investis)
    const lt = activeCurse(m, 'life_tap', w.tick);
    if (lt) player.hp = Math.min(player.hpMax, player.hp + (total * (lt.v ?? 50)) / 100);
    // vol de vie et de mana sur la part physique (règle `combat.leech` : difficulté, Drain du monstre)
    const leech = RULES['combat.leech'](w, m, p, physDealt, hpBefore);
    if (player.d.lifeLeech > 0) player.hp = Math.min(player.hpMax, player.hp + leech.life);
    // vie à chaque coup porté (PD2 : Prière ; D2 : aucune source de compétence)
    const lah = player.d.all.get('lifeAfterHit') ?? 0;
    if (lah > 0 && p.leechMul !== 0 && total > 0) player.hp = Math.min(player.hpMax, player.hp + lah);
    if (player.d.manaLeech > 0) player.mana = Math.min(player.manaMax, player.mana + leech.mana);
  }
  return total;
}

function applyMonsterDamage(w: World, m: Monster, amount: number, elem: Element, player: Player | null): void {
  // boss de carte : bouclier de phase (dégâts réduits tant que ses gardiens vivent)
  if (m.mapBoss) amount *= RULES['combat.mapBossTaken'](w, m);
  m.hp -= amount;
  m.lastHitTick = w.tick;
  m.aggro = true;
  w.events.push({ t: 'hit', target: m.id, amount: Math.round(amount), elem, x: m.x, y: m.y, toPlayer: false });
  if (m.hp <= 0) {
    w.killMonster(m, player);
    return;
  }
  if (m.rank === 'unique' && m.mods.includes('lightningEnchanted')) lightningEnchantedBurst(w, m);
  // récupération après coup : un coup >= 1/10 des PV max interrompt le monstre
  if (m.rank !== 'boss' && !m.mapBoss && amount >= (m.hpMax / 10) * (1 + RULES['combat.monsterFhrPct'](w) / 100) && m.mode !== 'death' && m.freezeT <= 0) {
    m.mode = 'hit';
    m.modeT = 0;
    m.modeLen = 5;
    m.atkApplied = true;
  }
}

/**
 * Dégâts reçus par le joueur. Les attaques physiques de mêlée passent par le test
 * de toucher et le blocage ; les sorts non. Ordre : absorption, résistances, réduction,
 * bouclier d'énergie, puis PV.
 */
/**
 * Absorption D2 : après la résistance, le pourcentage retire une part des dégâts (plafond : règle `combat.absorbPctMax`), puis
 * l'absorption plate retire des points 1 pour 1 (jamais en dessous de 0). Elle ne soigne jamais.
 */
export function applyAbsorb(dmg: number, pct: number, flat: number): number {
  let d = dmg * (1 - clamp(pct, 0, RULES['combat.absorbPctMax']()) / 100);
  d -= Math.max(0, flat);
  return Math.max(0, d);
}

/** Durée du poison infligé au joueur (ticks) */
export const POISON_TICKS = 2 * TICK_HZ;

function recCtx(pl: Player): RecCtx {
  return { form: pl.d.form, weapon: pl.d.recWeapon, holyShield: pl.buffs.some((b) => b.id === 'holy_shield') };
}

export function damagePlayer(w: World, pl: Player, p: DamagePacket, src: Monster | null): number {
  if (pl.dead) return 0;
  if (w.godMode) return 0;
  const d = pl.d;
  if (!p.spell && src && avoidsHit(w, pl, p, src)) return 0;
  if (src) p = RULES['combat.monsterHitPacket'](w, p, src);
  const toMana = d.all.get('dmgToMana') ?? 0;
  const { poisonAdded, mainElem, total: raw } = incomingDamage(w, pl, p);
  if (poisonAdded > 0) w.events.push({ t: 'playerHurt', amount: poisonAdded, elem: 'poison', pctOfMax: poisonAdded / pl.hpMax, src: src ? `${src.def.id}:poison` : undefined });
  if (raw <= 0) return poisonAdded;
  const total = energyShield(pl, raw);
  // Froid : ralentit le joueur
  const half = (d.all.get('halfFreeze') ?? 0) > 0 ? 0.5 : 1; // « durée de gel réduite de moitié »
  if (p.cold > 0 && !d.cbf) {
    pl.chillT = Math.max(pl.chillT, Math.round(50 * half * (1 - d.res.cold / 150)));
    pl.chillPct = 0.3;
  }
  if (p.freeze && !d.cbf) pl.freezeT = Math.max(pl.freezeT, Math.round((p.freeze * half) / 2));
  pl.hp -= total;
  RULES['combat.afterMonsterHit'](w, pl, src, total, !p.spell && !p.ranged);
  // un coup physique de mêlée ou de projectile use l'armure
  if (!p.spell && src && p.phys > 0) announceBroken(w, wearOnHit(w));
  onMonsterHitPlayer(w, src);
  if (toMana > 0) pl.mana = Math.min(pl.manaMax, pl.mana + (total * toMana) / 100);
  pl.lastHitTick = w.tick;
  w.events.push({ t: 'hit', target: pl.id, amount: Math.round(total), elem: mainElem, x: pl.x, y: pl.y, toPlayer: true });
  w.events.push({ t: 'playerHurt', amount: total, elem: mainElem, pctOfMax: total / pl.hpMax, src: src ? `${src.def.id}:${p.spell ? 'sort' : 'coup'}` : undefined });
  if (pl.hp <= 0) {
    w.killPlayer();
    return total;
  }
  // récupération après coup (FHR) : seuil du jeu de règles (D2 et PD2 : 1/12 de la vie), sauf pendant une
  // incantation ou une récupération déjà en cours
  if (!RULES['combat.playerHitRecovery'](total, pl.hpMax)) return total;
  const steady = pl.mode === 'attack' && d.uninterrupt > 0 && w.rng.combat.chance(clamp(d.uninterrupt, 0, 100) / 100);
  if (pl.mode !== 'cast' && pl.mode !== 'hit' && !steady) {
    pl.mode = 'hit';
    pl.modeT = 0;
    pl.modeLen = fhrFrames(d.fhr, w.character.classId, recCtx(pl));
    pl.goal = null;
  }
  return total;
}

/** Coup physique d'un monstre : esquive ou dérobade (puis 4 images sans esquive), test de toucher contre la défense, blocage (récupération FBR) */
function avoidsHit(w: World, pl: Player, p: DamagePacket, src: Monster): boolean {
  const d = pl.d;
  // esquive (immobile : mêlée / projectiles), dérobade (en marchant : tout) : jamais touché
  const moving = pl.mode === 'walk';
  const dodge = moving ? d.dodgeAny : p.ranged ? d.dodgeMissile : d.dodgeMelee;
  // après une esquive réussie, quelques images sans nouvelle esquive : règle skills.amazon (D2 : aucune ; PD2 : 4 images, 0,16 s)
  if (dodge > 0 && w.tick >= (pl.dodgeAt ?? 0) && w.rng.combat.chance(clamp(dodge, 0, 75) / 100)) {
    pl.dodgeAt = w.tick + RULES['skills.amazon']().dodgeLockTicks;
    w.events.push({ t: 'block', id: pl.id });
    return true;
  }
  // Conviction, Malédiction de défense : défense réduite
  const defVs = (d.defense + (d.all.get(p.ranged ? 'defMissile' : 'defMelee') ?? 0)) * (1 - hexDefensePct(pl, w.tick) / 100);
  if (!w.rng.combat.chance(hitChance(src.ar * (src.arMul ?? 1), defVs, src.mlvl, w.character.level))) return true;
  if (w.rng.combat.chance(blockChance(Math.max(d.block, d.weaponBlock), d.dex, w.character.level))) {
    w.events.push({ t: 'block', id: pl.id });
    fireProcs(w, 'Block', src);
    // récupération après blocage : table FBR de la classe (D2)
    if (pl.mode === 'idle' || pl.mode === 'walk') {
      pl.mode = 'hit';
      pl.modeT = 0;
      pl.modeLen = fbrFrames(d.all.get('fbr') ?? 0, w.character.classId, recCtx(pl));
      pl.goal = null;
    }
    return true;
  }
  return false;
}

/**
 * Dégâts reçus par élément : résistances et réductions (malédictions comprises), absorptions (Armure d'os, Armure du cyclone) ;
 * le poison ne se cumule pas (le plus fort remplace) et n'est pas compté dans `total`
 */
function incomingDamage(w: World, pl: Player, p: DamagePacket): { total: number; poisonAdded: number; mainElem: Element } {
  const d = pl.d;
  let total = 0;
  let poisonAdded = 0;
  let mainElem: Element = 'phys';
  let mainAmt = 0;
  for (const e of ELEMENTS) {
    let dmg = p[e];
    if (dmg <= 0) continue;
    if (e === 'poison') {
      // D2 : le poison agit sur POISON_TICKS et ne se cumule pas — le plus fort remplace
      dmg *= 1 - Math.max(-100, d.res.poison - hexElemRes(pl, w.tick)) / 100;
      // Purification / Évanescence : le poison agit moins longtemps (dégâts totaux réduits d'autant)
      dmg *= 1 - clamp(d.poisonReduce, 0, 90) / 100;
      const rate = dmg / POISON_TICKS;
      if ((pl.poisonT ?? 0) <= 0 || rate >= (pl.poisonRate ?? 0)) {
        const gained = rate * POISON_TICKS - (pl.poisonT > 0 ? pl.poisonRate * pl.poisonT : 0);
        pl.poisonRate = rate;
        pl.poisonT = POISON_TICKS;
        if (gained > 0) poisonAdded = gained;
      }
      continue;
    } else if (e === 'phys') {
      dmg = Math.max(0, dmg - d.drFlat);
      // Amplification des dégâts (−100 %) / Décrépitude (−50 %) : la résistance physique peut devenir négative
      dmg *= 1 - (clamp(d.dr, 0, 50) - hexPhysRes(pl, w.tick)) / 100;
      // Armure d'os (Nécromancien) : absorbe les dégâts physiques jusqu'à épuisement
      if (pl.boneAbsorb && pl.boneAbsorb > 0) {
        const a = Math.min(dmg, pl.boneAbsorb);
        pl.boneAbsorb -= a;
        dmg -= a;
        if (pl.boneAbsorb <= 0) {
          pl.boneAbsorb = 0;
          pl.buffs = pl.buffs.filter((b) => b.id !== 'bone_armor');
        }
      }
    } else if (e === 'magic') {
      dmg = applyAbsorb(Math.max(0, dmg - d.mdr), 0, d.absorbFlat.magic);
    } else {
      // Conviction / Résistance réduite des monstres : jusqu'à −100 % (D2)
      const res = Math.max(-100, d.res[e] - hexElemRes(pl, w.tick));
      dmg *= 1 - res / 100;
      // Armure du cyclone (Druide) : absorbe feu, froid et foudre jusqu'à épuisement
      if (pl.absorbPool) dmg -= cycloneAbsorb(w, dmg);
      dmg = applyAbsorb(dmg, d.absorb[e] ?? 0, d.absorbFlat[e] ?? 0);
    }
    if (dmg > mainAmt) {
      mainAmt = dmg;
      mainElem = e;
    }
    total += dmg;
  }
  return { total, poisonAdded, mainElem };
}

/** Bouclier d'énergie : une part des dégâts est prise sur le mana (règle skills.sorceress : D2, calc1 % et calc2 / 16 mana par point ; PD2 S13) */
function energyShield(pl: Player, total: number): number {
  const d = pl.d;
  if (!pl.shieldActive) return total;
  const lvl = d.skillLevels['energy_shield'] ?? 0;
  if (lvl > 0) {
    const es = RULES['skills.sorceress']().energyShield(lvl, d.hardPoints['energy_shield'] ?? 0, d.hardPoints['telekinesis'] ?? 0, SKILL_BY_ID.energy_shield?.n.value);
    const absorbPct = es.pct;
    const manaPerDmg = es.manaPerDmg;
    const want = total * absorbPct;
    const canAbsorb = pl.mana / manaPerDmg;
    const absorbed = Math.min(want, canAbsorb);
    pl.mana -= absorbed * manaPerDmg;
    total -= absorbed;
  }
  return total;
}

/** Armure du cyclone : absorbe les dégâts élémentaires ; renvoie la part absorbée */
function cycloneAbsorb(w: World, amount: number): number {
  const p = w.player;
  if (!p.absorbPool || p.absorbPool <= 0) return 0;
  const a = Math.min(amount, p.absorbPool);
  p.absorbPool -= a;
  if (p.absorbPool <= 0) {
    p.absorbPool = 0;
    p.buffs = p.buffs.filter((b) => b.id !== 'cyclone_armor');
  }
  return a;
}
