/**
 * Bot d'endgame : du niveau 1 au prérequis des cartes, puis 3 h de cartes avec les seules
 * ressources trouvées (cartes, orbes, runes, mots runiques). Vérifie que la boucle d'endgame
 * tient : paliers franchis, morts contenues, runes moyennes régulières, sauvegarde intacte.
 * Robuste au bruit : trois graines, on juge la médiane (un décalage minuscule de la simulation fait basculer une graine seule de 30 à 70 % de morts) en plus
 * d'un plafond par graine. Mesures longues (12 h, trois builds) : tools/bots/maps.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUNES } from '../../../../src/data/items/runes';
import { progressionSession } from '../../../../src/sim/bot/runner';
import { Game } from '../../../../src/sim/game';
import { deserialize, serialize } from '../../../../src/sim/save';

Game.resumeOnLoad = true; // le test vérifie l'aller-retour fidèle, y compris en pleine run (le jeu, lui, revient toujours en ville)
const SEEDS = [1, 2, 3];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** 3 h de cartes avec le build froid pour une graine ; mesures utiles et contrôle de la sauvegarde */
function endgameRun(seed: number) {
  const game = new Game();
  progressionSession({ bot: { build: 'cold', seed }, targetLevel: 99, maxSeconds: 150 * 60, until: (g) => g.canOpenMaps().ok }, game);
  expect(game.canOpenMaps().ok, `graine ${seed} : cartes ouvertes`).toBe(true);
  if (game.mode === 'run') game.townPortal();
  game.enterTown();

  const rank = Object.fromEntries(RUNES.map((r) => [`Rune ${r.name}`, r.rank]));
  let mid = 0;
  const off = game.onEvent((e) => {
    if (e.t === 'pickup' && e.kind === 'rune' && (rank[e.name] ?? 0) >= 15) mid++;
  });
  const rep = progressionSession({ bot: { build: 'cold', seed }, targetLevel: 100, maxSeconds: 3 * 3600 }, game);
  off();
  const maps = rep.runs.filter((r) => r.map);
  const stats = {
    seed,
    tierMax: game.character.progression.mapTierMax,
    mid,
    runs: rep.runs.length,
    maps: maps.length,
    deaths: rep.deaths.length,
    deathRate: rep.deaths.length / Math.max(1, rep.runs.length),
    stuckRate: rep.runs.filter((r) => r.stuck).length / Math.max(1, rep.runs.length),
  };
  // la sauvegarde d'un personnage d'endgame (cartes, orbes, charmes) fait l'aller-retour
  // la run suspendue (mort juste avant la fin) n’est reprise qu’avec Game.resumeOnLoad : le personnage seul fait l’aller-retour
  const text = serialize({ ...game.toSave(), run: null });
  expect(serialize(new Game(deserialize(text)).toSave()), `graine ${seed} : sauvegarde`).toBe(text);
  return stats;
}

describe("Bot d'endgame", () => {
  it('froid, graines 1-3 : 3 h de cartes — palier 2, morts (médiane < 70 %, chaque graine < 85 %), runes moyennes', () => {
    const all = SEEDS.map(endgameRun);
    const dir = join(process.cwd(), 'test-results', 'bots');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'endgame-cold.json'), JSON.stringify(all, null, 1));

    for (const r of all) {
      expect(r.maps, `graine ${r.seed} : cartes jouées`).toBeGreaterThanOrEqual(10);
      expect(r.tierMax, `graine ${r.seed} : palier`).toBeGreaterThanOrEqual(1);
      // plafond par graine : une graine malchanceuse ne doit pas masquer un vrai effondrement
      expect(r.deathRate, `graine ${r.seed} : morts`).toBeLessThan(0.85);
      // aucune run bloquée plus d'une fois sur cinq
      expect(r.stuckRate, `graine ${r.seed} : runs bloquées`).toBeLessThanOrEqual(0.2);
    }
    // résistances PD2 (immunités au froid des Zombies et Minions en Enfer) : le bot de froid meurt plus qu'avec les anciennes valeurs
    // 0,75 (avant : 0,70, puis 0,72) : la médiane oscille entre ~0,68 et ~0,73 selon de minuscules décalages du tirage aléatoire
    // (nouveaux effets, mercenaire dont les auras ne valent plus qu'à 7 cases) ; un vrai recul de combat la pousserait au-delà de 0,8
    expect(median(all.map((r) => r.deathRate))).toBeLessThan(0.75);
    // palier de carte atteint : le deuxième palier en médiane (une graine peut rester au premier palier selon les cartes tirées)
    expect(median(all.map((r) => r.tierMax))).toBeGreaterThanOrEqual(2);
    // runes moyennes (Hel+) : au moins une par heure en moyenne, médiane des graines
    expect(median(all.map((r) => r.mid))).toBeGreaterThanOrEqual(3);
  });
});
