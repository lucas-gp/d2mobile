/**
 * Barre d'invocations du HUD (façon panneau d'invocations de Diablo II) : nombre de créatures vivantes par type,
 * avec le plafond de la compétence. Le mercenaire n'en fait pas partie (il a son propre portrait).
 * Calculé quand la liste change ou une fois par seconde, jamais à chaque image.
 */
import { SKILL_BY_ID } from '../data/skills';
import type { World } from './world';
import { minionCap } from './minions';
import { petMax } from './druid';
import { MAX_SENTRIES, SENTRIES } from './assassin';

export interface SummonEntry {
  /** Identifiant de la compétence (sert d'icône) */
  id: string;
  name: string;
  count: number;
  /** Plafond (0 : sans plafond) */
  cap: number;
}

/** Ordre d'affichage (les types inconnus passent à la fin) */
const ORDER = [
  'raise_skeleton',
  'raise_skeleton_archer',
  'skeletal_mage',
  'clay_golem',
  'blood_golem',
  'iron_golem',
  'fire_golem',
  'revive',
  'spirit_wolf',
  'summon_fenris',
  'grizzly',
  'raven',
  'oak_sage',
  'heart_wolverine',
  'spirit_barbs',
  'plague_poppy',
  'cycle_of_life',
  'vines',
  'valkyrie',
  'decoy',
  'shadow_warrior',
  'shadow_master',
  'hydra',
  'hydra_minor',
];
const IGNORED = new Set(['merc', 'bone_wall', 'returned']);

function capOf(w: World, id: string): number {
  const L = Math.max(1, w.player.d.skillLevels[id] ?? 1);
  if (id === 'iron_golem') return Math.min(1, minionCap(w, id, L));
  const c = minionCap(w, id, L);
  if (c > 0) return c;
  const s = SKILL_BY_ID[id];
  if (!s?.n?.pet && !s?.n?.count) return 0;
  const hard = w.player.d.hardPoints[id] ?? 0;
  try {
    return petMax(id, L, hard) + (w.player.d.all.get(`extraSummon:${id}`) ?? 0);
  } catch {
    return 0;
  }
}

/** Créatures vivantes du joueur, par type d'invocation (liste vide si aucune) */
export function summonEntries(w: World): SummonEntry[] {
  const counts = new Map<string, number>();
  for (const m of w.monsters) {
    if (m.dead) continue;
    const key = m.pet ? (IGNORED.has(m.pet) ? '' : m.pet) : m.isSummon && m.summonSkill ? m.summonSkill : '';
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const a of w.areas) {
    // tourelles du joueur seulement (celles d'une ombre lui appartiennent et ont leur propre plafond)
    if (a.dead || a.team !== 0 || a.shadow || !a.kind.startsWith('trap_')) continue;
    const id = a.kind.slice(5);
    if (SENTRIES.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const out: SummonEntry[] = [];
  for (const [id, count] of counts) {
    const s = SKILL_BY_ID[id];
    out.push({ id, name: s?.name ?? id, count, cap: SENTRIES.includes(id) ? MAX_SENTRIES : capOf(w, id) });
  }
  const rank = (id: string): number => {
    const i = ORDER.indexOf(id);
    return i < 0 ? 999 : i;
  };
  out.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  return out;
}

/** Clé compacte pour détecter un changement (évite de reconstruire le DOM) */
export function summonKey(list: SummonEntry[]): string {
  let k = '';
  for (const e of list) k += `${e.id}:${e.count}/${e.cap};`;
  return k;
}
