/**
 * Trône de Baal en Enfer depuis les sauvegardes d'endgame des bots : N tentatives par build
 * (issue, durée, cause). Critère BACKLOG n° 19 : au moins 1 réussite sur 3 par build.
 *   npx tsx tools/bots/baal-matrix.ts [--n=3] [--dir=test-results/bots] [--respec]
 * --respec : points de compétence redistribués selon le plan actuel du build (essai d'un plan).
 */
import '../mods/auto';
import { readFileSync } from 'node:fs';
import type { BuildId } from '../../src/sim/bot/brain';
import { BotBrain } from '../../src/sim/bot/brain';
import { playRun } from '../../src/sim/bot/runner';
import { Game } from '../../src/sim/game';
import { migrate } from '../../src/sim/save';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const n = Number(args.get('n') ?? 3);
const dir = args.get('dir') ?? 'test-results/bots';
for (const build of ['cold', 'fire', 'light'] as BuildId[]) {
  const raw = JSON.parse(readFileSync(`${dir}/endmaps-${build}-1.json`, 'utf8'));
  const cells: string[] = [];
  let ok = 0;
  for (let k = 0; k < n; k++) {
    const g = new Game(migrate(structuredClone(raw.save)));
    g.character.name = `Baal-${k}`;
    const brain = new BotBrain(g, { build, seed: k + 1 });
    if (args.has('respec')) {
      const c = g.character;
      c.skillPoints += Object.values(c.skills).reduce((a, b) => a + b, 0);
      c.skills = {};
    }
    brain.town();
    let wave = 0;
    const r = playRun(g, brain, 'baal', 2, { maxSeconds: 600, onTick: (gg) => (wave = gg.world.run?.wave ?? wave) });
    if (r.completed) ok++;
    cells.push(`${r.completed ? '✓' : r.died ? '✗' : '⌛'}${Math.round(r.seconds)}s${r.completed ? '' : `(vague ${wave})`}`);
  }
  console.log(`${build.padEnd(6)} ${cells.join('  ')}  → ${ok}/${n}`);
}
