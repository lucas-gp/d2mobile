/**
 * Effets déclenchés par l'équipement (D2 : « X % de chances de lancer <sort> niv. N en frappant »,
 * quand on est frappé, à la mort d'un monstre, au passage de niveau) et épines fixes des objets.
 * Les stats d'objet `procHit:<sort>:<niveau>` = chance (%) sont agrégées dans `d.all`.
 */
import { SKILL_BY_ID } from '../data/skills';
import { emptyPacket, type Monster } from './actors';
import { simHooks } from './hooks';
import type { World } from './world';

export type ProcKind = 'Hit' | 'Att' | 'GetHit' | 'Kill' | 'Death' | 'LevelUp' | 'Cast' | 'Block';

interface Proc {
  skill: string;
  level: number;
  chance: number;
}

const cache = new WeakMap<object, Record<string, Proc[]>>();

function procsOf(w: World, kind: ProcKind): Proc[] {
  const all = w.player.d.all;
  let c = cache.get(all);
  if (!c) {
    c = {};
    for (const [k, v] of all) {
      if (!k.startsWith('proc')) continue;
      const [stat, sk, lv] = k.split(':');
      if (!sk || !SKILL_BY_ID[sk]) continue;
      (c[stat] ??= []).push({ skill: sk, level: Number(lv) || 1, chance: v });
    }
    cache.set(all, c);
  }
  return c[`proc${kind}`] ?? [];
}

/** Lance un sort d'objet à un niveau fixe, sans mana ni temps de recharge */
function procCast(w: World, pr: Proc, x: number, y: number, targetId: number): void {
  const p = w.player;
  const d = p.d;
  const s = SKILL_BY_ID[pr.skill];
  if (!s || s.passive || s.kind === 'aura') return;
  const prevLevel = d.skillLevels[pr.skill];
  const prevCd = p.cooldowns[pr.skill];
  d.skillLevels[pr.skill] = pr.level;
  w.inProc = true;
  try {
    simHooks.castSkill(w, pr.skill, x, y, targetId);
  } finally {
    w.inProc = false;
    if (prevLevel === undefined) delete d.skillLevels[pr.skill];
    else d.skillLevels[pr.skill] = prevLevel;
    if (prevCd === undefined) delete p.cooldowns[pr.skill];
    else p.cooldowns[pr.skill] = prevCd;
  }
}

/** Tente les déclencheurs d'un type ; `at` = monstre visé (ou point d'un cadavre) */
export function fireProcs(w: World, kind: ProcKind, at: { x: number; y: number; id?: number } | null): void {
  // les ombres de l'Assassin ont leur propre équipement : les objets du joueur ne se déclenchent pas sur leurs coups
  if (w.inProc || w.player.dead || w.actingAs) return;
  const list = procsOf(w, kind);
  if (!list.length) return;
  const p = w.player;
  for (const pr of list) {
    if (!w.rng.combat.chance(Math.min(100, pr.chance) / 100)) continue;
    const x = at ? at.x : p.x;
    const y = at ? at.y : p.y;
    procCast(w, pr, x, y, at?.id ?? 0);
  }
}

/** Épines fixes de l'équipement : dégâts renvoyés à l'attaquant en mêlée */
export function reflectFlat(w: World, attacker: Monster): void {
  const d = w.player.d;
  const phys = d.all.get('thornsFlat') ?? 0;
  const light = d.all.get('lightThornsFlat') ?? 0;
  if (phys <= 0 && light <= 0) return;
  const pk = emptyPacket(false);
  pk.phys = phys;
  pk.light = light;
  w.hurtMonster(attacker, pk);
}
