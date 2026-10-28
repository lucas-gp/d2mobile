/**
 * Bot de combat : chaque monstre, chaque rang, dans chaque difficulté, contre une Sorcière de
 * référence du niveau de la zone (plan de compétences + équipement de référence).
 * Mesure le temps de mise à mort (comparé à TTK_TARGETS), la létalité et les morts.
 * Rapport complet : test-results/bots/combat.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import { TTK_TARGETS } from '../../src/data/curves';
import type { Difficulty, MonsterRank } from '../../src/data/types';
import { fightArena, type ArenaResult } from '../../src/sim/bot/arena';
import { botRules } from '../../src/sim/bot/brain';

/** Niveau de référence de chaque monstre par difficulté (zone où il vit) */
const HOME: Record<string, [number, number, number]> = {
  fallen: [8, 40, 82],
  fallen_shaman: [8, 40, 82],
  zombie: [8, 40, 82],
  skeleton: [8, 40, 82],
  skeleton_archer: [8, 40, 82],
  griswold: [12, 40, 82],
};
const DEFAULT_HOME: [number, number, number] = [20, 50, 85];

describe('Bot de combat', () => {
  const results: ArenaResult[] = [];

  // difficultés où tout monstre doit tomber : seuil du jeu de règles (règle `bots.profile`, lot M13)
  const { combatStrictDifficulties: strict, combatUnkilledMax } = botRules().checks;
  it('tous les monstres sont tuables à leur niveau, sans monstre immortel', () => {
    const failures: string[] = [];
    // le Déchu au trésor (événement, il fuit) n'est pas une cible de rythme de combat
    for (const def of MONSTERS.filter((d) => !d.coward)) {
      const home = HOME[def.id] ?? DEFAULT_HOME;
      const isBoss = def.boss;
      const ranks: MonsterRank[] = isBoss ? ['boss'] : ['normal', 'champion', 'unique'];
      for (const d of [0, 1, 2] as Difficulty[]) {
        for (const rank of ranks) {
          const count = rank === 'normal' ? 5 : rank === 'champion' ? 3 : 1;
          // comme un joueur : le build dont l'élément résiste le moins à ce monstre (Froid à égalité)
          const res = (e: 'cold' | 'fire' | 'light') => (def.res as Record<string, number[] | undefined>)[e]?.[d] ?? 0;
          const build = (['cold', 'fire', 'light'] as const).reduce((b, e) => (res(e) < res(b) ? e : b), 'cold' as 'cold' | 'fire' | 'light');
          const r = fightArena({ monster: def.id, rank, count, level: home[d], difficulty: d, build, maxSec: isBoss ? 180 : 90 });
          results.push(r);
          // en Normal et Cauchemar, rien ne doit résister au personnage de référence, sauf l'élite qu'un modificateur D2 rend
          // immunisée ou très résistante (75 % ou plus) à son unique élément (Enchanté par le froid +75 %, variante d'immunité) : un
          // joueur changerait d'élément (D2 : un unique n'est jamais gelé, il n'est plus tenu sur place par le froid)
          if (d < strict && r.clearSec === null && !r.died && !r.immune && (r.elemRes ?? 0) < 75) failures.push(`${def.id}/${rank}/${d} : non tué en ${isBoss ? 180 : 90} s`);
        }
      }
    }
    expect(failures.length, failures.join('\n')).toBeLessThanOrEqual(combatUnkilledMax);
  });

  it('écrit le rapport et compare aux durées cibles', () => {
    const table: Record<string, { ttkMoyen: number | null; ttkMedian: number | null; cible: number; ecart: string; ecartMedian: string; morts: number; viePerdueMoy: number; n: number }> = {};
    for (const rank of Object.keys(TTK_TARGETS) as MonsterRank[]) {
      for (const d of [0, 1, 2] as Difficulty[]) {
        const rs = results.filter((r) => r.rank === rank && r.difficulty === d);
        if (!rs.length) continue;
        const ok = rs.filter((r) => r.perKillSec !== null);
        const avg = ok.length ? ok.reduce((s, r) => s + r.perKillSec!, 0) / ok.length : null;
        // médiane : peu sensible aux quelques monstres extrêmes (Chaman qui fuit, momies très robustes)
        const sorted = ok.map((r) => r.perKillSec!).sort((a, b) => a - b);
        const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
        table[`${rank}/${d}`] = {
          ttkMoyen: avg === null ? null : +avg.toFixed(2),
          ttkMedian: med === null ? null : +med.toFixed(2),
          ecartMedian: med === null ? '—' : `×${(med / TTK_TARGETS[rank]).toFixed(1)}`,
          cible: TTK_TARGETS[rank],
          ecart: avg === null ? '—' : `×${(avg / TTK_TARGETS[rank]).toFixed(1)}`,
          morts: rs.filter((r) => r.died).length,
          viePerdueMoy: Math.round(rs.reduce((s, r) => s + r.lifeLostPct, 0) / rs.length),
          n: rs.length,
        };
      }
    }
    const dir = join(process.cwd(), 'test-results', 'bots');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'combat.json'), JSON.stringify({ table, results }, null, 1));
    console.table(table);
    expect(Object.keys(table).length).toBeGreaterThan(0);
  });
});
