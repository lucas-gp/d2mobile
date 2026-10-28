/**
 * Bot de progression jusqu'au prérequis des cartes d'endgame (Enfer débloqué, niveau 75) : objectif d'équilibre calibré sur Project
 * Diablo 2 (builds S13, chiffres des compétences et règles de PD2), autrefois dans tests/bots/progression.test.ts. Sans le mod, le jeu
 * de règles `d2` n'a pas encore ses compétences ni ses règles vanilla (lots M8, M9) : son objectif propre viendra avec les bots par jeu de
 * règles (M13).
 * Rapport : test-results/bots/progression-maps.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { progressionSession } from '../../../../src/sim/bot/runner';
import { Game } from '../../../../src/sim/game';

Game.resumeOnLoad = true; // aller-retour fidèle de la sauvegarde, y compris en pleine run

describe('Bot de progression (prérequis des cartes)', () => {
  it('graine 1 : Enfer débloqué (Baal Cauchemar) et niveau 75 — prérequis des maps — en moins de 2 h 30', () => {
    const game = new Game();
    const done = (g: Game) => g.character.progression.highestDifficulty >= 2 && g.character.level >= 75;
    const rep = progressionSession({ bot: { build: 'cold', seed: 1 }, targetLevel: 99, maxSeconds: 150 * 60, until: done }, game);
    mkdirSync(join(process.cwd(), 'test-results', 'bots'), { recursive: true });
    writeFileSync(join(process.cwd(), 'test-results', 'bots', 'progression-maps.json'), JSON.stringify(rep, null, 1));
    expect(done(game)).toBe(true);
    // morts : au plus une toutes les 7 minutes de jeu en moyenne (les zones suivent maintenant Levels.txt : familles et densité de D2, un peu plus dures : 15 morts mesurées pour un plafond de 14)
    // Plafond relâché de 7 à 5 minutes par mort (audit des sorts de la Sorcière PD2) : ce test est une loterie de
    // graine unique. Mesure sur 5 graines : 1,6 à 4,2 morts / 1000 s avant le lot (la graine 1 était la plus chanceuse),
    // et un décalage de ±1 % de pénétration de froid fait osciller la graine 1 de 15 à 24 morts. Le plafond garde
    // son rôle (détecter un effondrement), pas celui de départager des tirages.
    // Plafond relâché de 5 à 4 minutes par mort (kits de boss D2 : Mur de feu, Blizzard…) : avant le lot la graine 1 était déjà pile au plafond
    // (21 morts / 6 281 s). Mesure avant → après sur 3 graines : 21 → 24 (3,3 → 3,8 / 1000 s), 23 → 27 (3,5 → 3,6), 15 → 10 (1,7 → 1,7) :
    // le taux moyen ne bouge pas, la graine 1 bascule seulement avec le décalage du tirage aléatoire (parcours divergent en Cauchemar).
    expect(rep.deaths.length).toBeLessThanOrEqual(Math.ceil(rep.totalSeconds / 240));
  });
});
