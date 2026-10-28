/**
 * Fumée vanilla (lots M9 à M10d) : sans le mod, un bot par classe joue le jeu de règles `d2` (compétences, règles de classe et
 * mercenaires de Diablo II) pendant quelques runs de l'acte I, sans erreur ni blocage. Plans de compétences et seuils des bots de la base :
 * src/mods/d2/bots.ts (lot M13).
 */
import { describe, expect, it } from 'vitest';
import { progressionSession } from '../../src/sim/bot/runner';
import { botRules, BUILD_CLASS, type BuildId } from '../../src/sim/bot/brain';
import { deserialize, serialize } from '../../src/sim/save';
import { Game } from '../../src/sim/game';
import { withoutPd2 } from '../needs-pd2';

/** Un build par classe */
const BUILDS: BuildId[] = ['cold', 'bowazon', 'bonemancer', 'hammerdin', 'whirlwind', 'wind', 'trapsin'];

describe.skipIf(!withoutPd2)('Bots vanilla (jeu de règles d2) : une classe chacun', () => {
  it('les sept classes ont un build', () => {
    expect(new Set(BUILDS.map((b) => BUILD_CLASS[b])).size).toBe(7);
  });
  for (const build of BUILDS) {
    it(`${BUILD_CLASS[build]} (${build}) : quelques runs sans erreur ni blocage, la sauvegarde fait l’aller-retour`, () => {
      const game = new Game(undefined, BUILD_CLASS[build]);
      const rep = progressionSession({ bot: { build, seed: 1 }, targetLevel: 5, maxSeconds: 12 * 60 }, game);
      expect(rep.runs.length).toBeGreaterThan(0);
      expect(rep.finalLevel).toBeGreaterThanOrEqual(2);
      expect(rep.runs.filter((r) => r.stuck).length).toBeLessThanOrEqual(Math.ceil(rep.runs.length / 5));
      const text = serialize({ ...game.toSave(), run: null });
      expect(serialize(new Game(deserialize(text)).toSave())).toBe(text);
    });
  }
});

/** Campagne du jeu de règles de la base : Actes I à V en Normal, jusqu'à Baal (seuil : règle `bots.profile`, src/mods/d2/bots.ts) */
const campaign = botRules().checks.campaign;
describe.skipIf(!withoutPd2 || !campaign)('Bot de campagne vanilla (jeu de règles d2)', () => {
  it(`${campaign?.build} : Baal tué en Normal (Cauchemar ouvert) en moins de ${campaign?.minutes} min de jeu`, () => {
    const { build, minutes } = campaign!;
    const game = new Game(undefined, BUILD_CLASS[build as BuildId]);
    const rep = progressionSession({ bot: { build: build as BuildId, seed: 1 }, targetLevel: 99, maxSeconds: minutes * 60, until: (g) => g.character.progression.highestDifficulty >= 1 }, game);
    expect(game.character.progression.highestDifficulty, `niveau ${rep.finalLevel}, ${rep.runs.length} runs, ${rep.deaths.length} morts`).toBeGreaterThanOrEqual(1);
    expect(rep.runs.filter((r) => r.stuck).length).toBeLessThanOrEqual(Math.ceil(rep.runs.length / 5));
  });
});
