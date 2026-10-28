/**
 * Bot de progression : du niveau 1, n'utilise que ce qu'il trouve, enchaîne les runs
 * disponibles et mesure le temps par étape. Tristram et les premières runs (objectif : seuil du jeu de règles), pour
 * la Sorcière (Froid) et les quatre builds du Druide.
 * Rapports : test-results/bots/progression-<graine>.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { progressionSession } from '../../src/sim/bot/runner';
import { botRules } from '../../src/sim/bot/brain';
import { deserialize, serialize } from '../../src/sim/save';
import { Game } from '../../src/sim/game';

Game.resumeOnLoad = true; // aller-retour fidèle de la sauvegarde, y compris en pleine run

/**
 * Seuils du jeu de règles (règle `bots.profile`, lot M13) : niveau visé en 45 min de jeu et morts tolérées d'un Druide (pd2 : 12 et 3,
 * mods/pd2/bots ; base Diablo II : src/mods/d2/bots.ts)
 */
const { progressionLevel: TARGET, druidDeaths: MAX_DEATHS } = botRules().checks;

describe('Bot de progression', () => {
  for (const seed of [1, 2]) {
    it(`graine ${seed} : niveau ${TARGET} en moins de 45 min de jeu, sans blocage`, () => {
      const game = new Game();
      const rep = progressionSession({ bot: { build: 'cold', seed }, targetLevel: TARGET, maxSeconds: 45 * 60 }, game);
      const dir = join(process.cwd(), 'test-results', 'bots');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `progression-${seed}.json`), JSON.stringify(rep, null, 1));
      expect(rep.finalLevel).toBeGreaterThanOrEqual(TARGET);
      // pas plus d'une run sur cinq bloquée ou hors délai
      const bad = rep.runs.filter((r) => r.stuck || r.timedOut).length;
      expect(bad).toBeLessThanOrEqual(Math.ceil(rep.runs.length / 5));
      // Griswold tombe au moins une fois
      expect(rep.runs.some((r) => r.completed)).toBe(true);
      // la sauvegarde du personnage après une longue session fait l'aller-retour
      // la run suspendue (mort juste avant la fin) n’est reprise qu’avec Game.resumeOnLoad : le personnage seul fait l’aller-retour
      const text = serialize({ ...game.toSave(), run: null });
      expect(serialize(new Game(deserialize(text)).toSave())).toBe(text);
    });
  }

  // Druide : les quatre builds (vent, feu, ours-garou, invocateur) de la même façon
  for (const build of ['wind', 'fissure', 'bear', 'summon'] as const) {
    it(`Druide ${build} : niveau ${TARGET} en moins de 45 min de jeu, sans blocage, au plus ${MAX_DEATHS} morts`, () => {
      const rep = progressionSession({ bot: { build, seed: 1 }, targetLevel: TARGET, maxSeconds: 45 * 60 });
      writeFileSync(join(process.cwd(), 'test-results', 'bots', `progression-druid-${build}.json`), JSON.stringify(rep, null, 1));
      expect(rep.finalLevel).toBeGreaterThanOrEqual(TARGET);
      expect(rep.runs.filter((r) => r.stuck || r.timedOut).length).toBeLessThanOrEqual(Math.ceil(rep.runs.length / 5));
      expect(rep.deaths.length).toBeLessThanOrEqual(MAX_DEATHS);
    });
  }
});
