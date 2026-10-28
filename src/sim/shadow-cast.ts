/**
 * Ombres de l'Assassin (Guerrière et Maître de l'ombre) : lancer des compétences du joueur.
 *
 * PD2 (wiki, x_All_Skills) :
 *  - Guerrière de l'ombre : « utilise les deux compétences actives (clic gauche et droit) » ; niveau de
 *    compétence = celui du joueur (supposé : le wiki ne donne pas de formule pour la Guerrière).
 *  - Maître de l'ombre : « peut utiliser toute compétence d'Assassin, même celles que vous n'avez pas » ;
 *    niveau utilisé = niv. du Maître ÷ 3 + niv. de la compétence chez le joueur ÷ 2 ; davantage d'arts
 *    martiaux que de pièges.
 *  - Synergies figées sur celles du joueur (S11) ; pièges posés par l'ombre : ils lui appartiennent (S13) ;
 *    délai d'IA 0,4 s (ici : au moins 0,8 s entre deux lancers, pour borner le nombre d'effets).
 *
 * Lanceur « répliqué » : le temps d'un lancer, le joueur est placé à la position de l'ombre, ses charges
 * d'arts martiaux sont remplacées par celles de l'ombre, et `w.actingAs` désigne l'ombre (les coups
 * comptent pour elle : ni vol de vie, ni déclencheurs d'objets, ni usure d'arme du joueur ; projectiles
 * et zones créés prennent l'ombre pour propriétaire). Puis tout est restauré : position, orientation,
 * vie, mana, recharges et charges du joueur. Aucun coût en mana ni recharge pour le joueur.
 */
import { SKILL_BY_ID } from '../data/skills';
import { dist } from '../core/math';
import type { Monster } from './actors';
import { castAssassin } from './assassin';
import type { World } from './world';
export {};

/** Au moins 0,8 s entre deux lancers d'une ombre */
export const SHADOW_CAST_EVERY = 20;
/** Projectiles et zones gardés par lancer d'une ombre (Explosion de feu, Toile d'éclairs : le reste est retiré) */
export const SHADOW_MAX_SPAWNS = 8;
/** Portée des compétences à distance d'une ombre (unités) */
const RANGED_REACH = 8;

/** Compétences à charges et coups de finition au corps à corps (Envol du dragon exclu : déplacement) */
const MELEE = ['tiger_strike', 'fists_of_fire', 'cobra_strike', 'claws_of_thunder', 'blades_of_ice', 'phoenix_strike', 'dragon_talon', 'dragon_claw', 'dragon_tail'];
/** Compétences à distance : projectiles, zones, pièges et tourelles */
const RANGED = [
  'psychic_hammer',
  'mind_blast',
  'fire_blast',
  'shock_web',
  'blade_fury',
  'charged_bolt_sentry',
  'wake_of_fire',
  'lightning_sentry',
  'wake_of_inferno',
  'death_sentry',
  'chain_lightning_sentry',
];
/** Liste blanche des compétences qu'une ombre sait lancer */
export const SHADOW_SKILLS: readonly string[] = [...MELEE, ...RANGED];
/** Exclues, et pourquoi */
export const SHADOW_EXCLUDED: Record<string, string> = {
  dragon_flight: 'déplacement (téléporte le lanceur, recharge propre)',
  blade_sentinel: 'la lame revient vers le joueur, pas vers le lanceur',
  blade_shield: 'buff du joueur',
  venom: 'buff du joueur',
  fade: 'buff du joueur',
  burst_of_speed: 'buff du joueur',
  cloak_of_shadows: 'buff du joueur',
  shadow_warrior: 'invocation',
  shadow_master: 'invocation',
};

function isShadow(m: Monster): boolean {
  return m.pet === 'shadow_warrior' || m.pet === 'shadow_master';
}

const isChargeBuff = (id: string): boolean => id.startsWith('charge_') || id === 'asn_cycle';

/** Niveau de la compétence `id` lancée par l'ombre (0 : indisponible) */
export function shadowSkillLevel(w: World, m: Monster, id: string): number {
  const own = w.player.d.skillLevels[id] ?? 0;
  if (m.pet !== 'shadow_master') return own;
  return Math.max(1, Math.floor((m.summonLevel ?? 1) / 3) + Math.floor(own / 2));
}

/** Compétences que l'ombre peut lancer : la Guerrière, celles des clics gauche et droit ; le Maître, toutes */
export function shadowPool(w: World, m: Monster): string[] {
  if (m.pet === 'shadow_master') return SHADOW_SKILLS.filter((id) => SKILL_BY_ID[id]);
  const hb = w.character.hotbar;
  const ok = (id: string | null | undefined): id is string => !!id && SHADOW_SKILLS.includes(id) && (w.player.d.skillLevels[id] ?? 0) > 0;
  const lr = [hb.primary, hb.secondary].filter(ok);
  // adaptation (mobile : les compétences se lancent aussi depuis la barre) : sans compétence prise en charge
  // sur les clics gauche/droit, la Guerrière prend celles de la barre
  return [...new Set(lr.length ? lr : hb.slots.filter(ok))];
}

/** L'ombre lance `id` vers `t` comme le ferait le joueur, depuis sa position. Renvoie faux si impossible. */
export function shadowCast(w: World, m: Monster, id: string, t: Monster): boolean {
  if (!SHADOW_SKILLS.includes(id) || !SKILL_BY_ID[id]) return false;
  const L = shadowSkillLevel(w, m, id);
  if (L <= 0) return false;
  const p = w.player;
  const saved = { x: p.x, y: p.y, px: p.px, py: p.py, facing: p.facing, hp: p.hp, mana: p.mana, cooldowns: { ...p.cooldowns } };
  const own = p.buffs.filter((b) => isChargeBuff(b.id));
  const swap = own.length > 0 || (m.shadowCharges?.length ?? 0) > 0;
  p.buffs = p.buffs.filter((b) => !isChargeBuff(b.id)).concat(m.shadowCharges ?? []);
  if (swap) w.refreshPlayer();
  const facing = Math.atan2(t.y - m.y, t.x - m.x);
  p.x = p.px = m.x;
  p.y = p.py = m.y;
  p.facing = facing;
  const nM = w.missiles.length;
  const nA = w.areas.length;
  const prev = w.actingAs;
  w.actingAs = m;
  try {
    castAssassin(w, id, t.x, t.y, t.id, L);
  } finally {
    w.actingAs = prev;
    m.shadowCharges = p.buffs.filter((b) => isChargeBuff(b.id));
    const after = p.buffs.filter((b) => !isChargeBuff(b.id));
    p.buffs = after.concat(own);
    if (swap || m.shadowCharges.length) w.refreshPlayer();
    // vol de vie de la Frappe du cobra : pour l'ombre
    const gain = p.hp - saved.hp;
    if (gain > 0) m.hp = Math.min(m.hpMax, m.hp + gain);
    p.x = saved.x;
    p.y = saved.y;
    p.px = saved.px;
    p.py = saved.py;
    p.facing = saved.facing;
    p.hp = saved.hp;
    p.mana = saved.mana;
    p.cooldowns = saved.cooldowns;
  }
  // pas d'explosion combinatoire : au plus SHADOW_MAX_SPAWNS projectiles et zones par lancer
  let kept = 0;
  for (const list of [w.missiles, w.areas]) {
    const from = list === w.missiles ? nM : nA;
    for (let i = from; i < list.length; i++) {
      if (list[i].dead) continue;
      if (++kept > SHADOW_MAX_SPAWNS) list[i].dead = true;
    }
  }
  m.facing = facing;
  return true;
}

/** IA : l'ombre lance une compétence sur `t` si sa cadence le permet. Vrai si elle a lancé (sinon : IA d'arme). */
export function shadowAct(w: World, m: Monster, t: Monster): boolean {
  if ((m.shadowNextCast ?? 0) > w.tick || m.mode === 'attack') return false;
  const d = dist(m.x, m.y, t.x, t.y) - m.radius - t.radius;
  const master = m.pet === 'shadow_master';
  const held = (m.shadowCharges ?? []).some((b) => b.id.startsWith('charge_'));
  const usable: [string, number][] = [];
  for (const id of shadowPool(w, m)) {
    const s = SKILL_BY_ID[id];
    if (MELEE.includes(id)) {
      if (d > Math.max(s.range, m.def.attacks[0].range)) continue;
      // le Maître préfère les arts martiaux ; finitions surtout quand il a des charges
      const fin = id.startsWith('dragon_');
      usable.push([id, master ? (fin ? (held ? 4 : 1) : 3) : 1]);
    } else {
      if (d > Math.min(RANGED_REACH, Math.max(4, s.range)) || !w.grid.lineOfSight(m.x, m.y, t.x, t.y)) continue;
      usable.push([id, 1]);
    }
  }
  if (!usable.length) return false;
  let r = w.rng.ai.float(
    0,
    usable.reduce((a, u) => a + u[1], 0),
  );
  let pick = usable[usable.length - 1][0];
  for (const [id, wt] of usable) {
    if ((r -= wt) <= 0) {
      pick = id;
      break;
    }
  }
  if (!shadowCast(w, m, pick, t)) return false;
  m.shadowNextCast = w.tick + SHADOW_CAST_EVERY;
  m.mode = 'attack';
  m.modeT = 0;
  m.modeLen = 12;
  m.atkApplied = true;
  return true;
}

/** Met à jour un projectile ou une zone d'une ombre en son nom ; ils disparaissent avec elle */
export function shadowOwned<T extends { owner: number; dead: boolean }>(w: World, o: T, fn: (w: World, o: T) => void): void {
  const sh = w.monsters.find((m) => m.id === o.owner && !m.dead && isShadow(m));
  if (!sh) {
    o.dead = true;
    return;
  }
  const prev = w.actingAs;
  w.actingAs = sh;
  try {
    fn(w, o);
  } finally {
    w.actingAs = prev;
  }
}
