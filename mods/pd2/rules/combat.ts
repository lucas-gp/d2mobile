/**
 * Formules de combat de Project Diablo 2 (lot M8a : autrefois en dur dans src/sim/combat.ts, melee.ts et ai.ts, déplacées telles
 * quelles), branchées sur les règles nommées `combat.*` du jeu (src/mods/rules.ts) ; la base a celles de Diablo II LoD 1.13c
 * (src/mods/d2/combat.ts). Sources PD2 : mods/pd2/docs/ETUDE-PD2.md §7.5 et §8.1, wiki PD2 (General Changes, Skills).
 */
import type { ModApi } from '../../../src/mods/api';
import { addBleed, clamp, lin, SKILL_BY_ID, synergyPct, type Monster, type World } from '../../../src/mods/sdk';

const IMMUNE_THRESHOLD = 100;

/**
 * Résistance effective d'un monstre face à un élément (règles PD2, mods/pd2/docs/ETUDE-PD2.md §7.5 / §8.1) :
 * - immunité si résistance >= 100 ;
 * - les RÉDUCTIONS (Conviction, Inferno, Champ statique) cassent les immunités mais ne
 *   comptent que pour moitié contre une cible immunisée ;
 * - un charme Sunder ramène une immunité à 95 % ;
 * - les PÉNÉTRATIONS (maîtrises, -% rés. ennemie des objets) ne s'appliquent qu'une fois
 *   l'immunité cassée ;
 * - la partie négative est divisée par 2, plancher -100 %.
 */
function effectiveMonsterRes(baseRes: number, pierce: number, sunder: boolean, reduction = 0, soft = 0): { res: number; immune: boolean } {
  let res = baseRes;
  if (res >= IMMUNE_THRESHOLD) {
    if (sunder) res = 95;
    else {
      res -= Math.floor(reduction / 2);
      if (res >= IMMUNE_THRESHOLD) return { res, immune: true };
      reduction = 0;
    }
  }
  res -= reduction + soft;
  res -= pierce;
  if (res < 0) res = res / 2;
  return { res: clamp(res, -100, 95), immune: false };
}

/** Blessures ouvertes (objets, Blessures profondes) : saignement sur 5 s */
function openWounds(w: World, t: Monster, dealt: number): void {
  const dw = w.player.d.skillLevels['deep_wounds'] ?? 0;
  const chance = (w.player.d.all.get('openWounds') ?? 0) + (dw > 0 ? lin(SKILL_BY_ID.deep_wounds.n.value, dw) : 0);
  if (chance > 0 && !t.dead && w.rng.combat.chance(Math.min(100, chance) / 100)) {
    // PD2 : Blessures profondes ajoutent des dégâts de saignement par seconde (table « Open Wounds Damage »)
    const flat = dw > 0 ? lin(SKILL_BY_ID.deep_wounds.n.v3, dw) * (1 + synergyPct(SKILL_BY_ID.deep_wounds, w.player.d.hardPoints) / 100) : 0;
    // PD2 : « +X aux dégâts des blessures ouvertes par seconde » s'ajoute au saignement
    const dps = Math.max(dealt * 0.3 + (w.player.d.all.get('openWoundsDps') ?? 0), flat);
    addBleed(t, dps);
  }
}

export function registerCombatRules(api: ModApi): void {
  api.rules.set('combat.monsterRes', () => effectiveMonsterRes);
  api.rules.set('combat.leech', () => (w, m, p, physDealt) => {
    const player = w.player;
    // PD2 : vol de vie et de mana sur la part physique seulement ; ÷ 2 pour les dégâts de zone et les projectiles d'arme, ÷ 2 en Cauchemar, ÷ 3 en Enfer
    // Drain PD2 : efficacité propre à certains boss (Méphisto ultime 0 %, Comtesse 100 %…)
    const lm = (p.leechMul ?? 1) * (p.ar !== undefined ? 0.5 : 1) * (w.difficulty === 1 ? 0.5 : w.difficulty === 2 ? 1 / 3 : 1) * ((m.def.drain ?? 100) / 100);
    return { life: Math.floor((physDealt * player.d.lifeLeech * lm) / 100), mana: Math.floor((physDealt * player.d.manaLeech * lm) / 100) };
  });
  // frappe écrasante : 1/4 des PV actuels (1/8 pour les boss), réduite par la résistance physique ; efficacité en plus (Châtiment, objets)
  api.rules.set(
    'combat.crushingBlow',
    () => (_w, m, p, player, res) => m.hp * (m.rank === 'boss' || m.mapBoss ? 0.125 : 0.25) * (1 + ((player ? (player.d.all.get('crushEff') ?? 0) : 0) + (p.crushEff ?? 0)) / 100) * (1 - res / 100),
  );
  // PD2 : coup critique (maîtrises, ×2) puis, s'il n'a pas eu lieu, frappe mortelle (objets, ×1,5) ; plafond 75 % chacun, physique seulement
  api.rules.set('combat.criticalMul', () => (w, crit, critMult) => {
    const d = w.player.d;
    const deadly = d.all.get('deadlyStrike') ?? 0;
    if (crit > 0 && w.rng.combat.chance(clamp(crit, 0, 75) / 100)) return 2 + critMult / 100;
    else if (deadly > 0 && w.rng.combat.chance(clamp(deadly, 0, 75 + (d.all.get('maxDeadly') ?? 0)) / 100)) return 1.5 + (d.all.get('deadlyMult') ?? 0) / 100;
    return 1;
  });
  // dégâts de zone de la mêlée (PD2 : toutes les armes)
  api.rules.set('combat.weaponSplash', () => () => true);
  api.rules.set('combat.openWounds', () => openWounds);
  // saignement physique, réduit par la résistance physique du monstre (90 % au plus)
  api.rules.set('combat.bleedTick', () => (m, dt) => (m.bleedDps ?? 0) * dt * (1 - Math.min(90, m.res.phys ?? 0) / 100));
  api.rules.set('combat.chillFreeze', () => (_w, m, p) => {
    // durée du gel selon le rang du monstre (le ÷ 2 / ÷ 4 de D2 en Cauchemar / Enfer n'est pas appliqué : il sape les builds de froid, mesuré par le bot d'endgame)
    const freezeMul = m.rank === 'boss' ? 0.25 : m.rank === 'unique' || m.rank === 'champion' ? 0.5 : 1;
    // boss de carte (Baal, Duriel des donjons) : jamais insensible au froid, mais rendements décroissants (map-boss.ts)
    const noFreeze = !!m.def.noFreeze && !m.mapBoss;
    if (p.chill && p.chill > 0 && !noFreeze) {
      m.chillT = Math.max(m.chillT, Math.round(p.chill * freezeMul));
      m.chillPct = Math.max(m.chillPct, p.chillPct ?? 0.5);
    }
    if (p.freeze && p.freeze > 0 && !noFreeze && m.rank !== 'boss') {
      m.freezeT = Math.max(m.freezeT, Math.round(p.freeze * freezeMul));
    }
  });
  // absorption élémentaire en pourcentage : 90 % au plus
  api.rules.set('combat.absorbPctMax', () => () => 90);
  // récupération après coup : celle de la base (Diablo II, 1/12 de la vie max.), que Project Diablo 2 garde. Lot 321 : la règle « tout
  // coup qui touche interrompt » est retirée ; c'était le modèle du jeu d'avant le lot M13, laissé au pd2 alors pour ne pas changer son équilibre
}
