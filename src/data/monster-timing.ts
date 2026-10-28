// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/** Calage des animations d'attaque des monstres sur animdata.d2 (monster-anim.gen.ts). */
import type { MonsterAnimTicks } from './monster-anim.gen';
import { MONSTER_ANIM } from './monster-anim.gen';
import type { MonsterAttack, MonsterDef } from './types';

/** Laissés tels quels (demande du joueur) : Anciens, Rathma, Lucion, Clone PD2 et leurs versions ultimes */
export const TIMING_EXCLUDED = new Set(['ancient_talic', 'ancient_madawc', 'ancient_korlic', 'uber_talic', 'uber_madawc', 'uber_korlic', 'rathma', 'lucion', 'dclone']);

/** Mode d'animation D2 (clé de MonsterAnimTicks) qui joue une attaque du jeu : coup = A1 ; sorts = modes S des compétences (monstats Sk#mode) */
export function attackAnimMode(t: MonsterAnimTicks, kind: MonsterAttack['kind']): 'a1' | 's1' | 's2' | 's3' | 's4' | undefined {
  if (kind === 'melee' || kind === 'charge') return t.a1 ? 'a1' : undefined;
  const s = [...new Set(t.used.match(/S[1-4]/g) ?? [])].map((x) => x.toLowerCase()) as ('s1' | 's2' | 's3' | 's4')[];
  const pick = (kind === 'curse' || kind === 'heal' || kind === 'summon' ? s[s.length - 1] : s[0]) ?? 's1';
  return t[pick] ? pick : t.s1 ? 's1' : t.a1 ? 'a1' : undefined;
}

/** Remplace `frames` / `hitFrame` de toutes les attaques de l'espèce par les valeurs d'animdata.d2 ; les cooldowns et dégâts ne changent pas */
export function applyAnimTiming(m: MonsterDef): void {
  const t = MONSTER_ANIM[m.id];
  if (!t || TIMING_EXCLUDED.has(m.id)) return;
  m.attacks = m.attacks.map((a) => {
    const mode = attackAnimMode(t, a.kind);
    const v = mode ? t[mode] : undefined;
    return v ? { ...a, frames: v[0], hitFrame: Math.min(v[1], v[0]) } : a;
  });
}
