/**
 * End of a round (slot `run.complete`): time, kills, level, the checkpoint, and the loot left on the arena's ground taken at once (lot 285:
 * no list to sort; worn when it fits an empty slot, kept, or turned into gold: sim/loot.ts, `collectAll`); then the next round at once
 * (rounds chained: back to town and into the next round in one tap), overtime (stay, the density keeps rising) or the hub.
 */
import type { RunCompleteCtx } from '../../../src/mods/api';
import { roundOfRun } from '../data/chapters';
import { collectAll } from '../sim/loot';
import { button, ensureStyle, h } from './dom';
import { nextRound, playNext } from './hub';
import { mmss } from './hud';
import { isRunMode } from '../sim/runmode';

export function recapScreen(ctx: RunCompleteCtx): void {
  const g = ctx.game;
  const round = roundOfRun(ctx.summary.runId);
  if (!round) return;
  // Run mode (lot 289): no screen, the next zone comes by itself (sim/runmode.ts, `runStep`)
  if (isRunMode(g.character)) return;
  ensureStyle();
  const got = collectAll(g);
  const node = h('div', { cls: 'sv-screen', data: { svScreen: 'recap' } });
  const scr = ctx.screen.open(node);
  const next = nextRound(g);
  const lines: [string, string][] = [
    ['Durée', mmss(ctx.summary.seconds)],
    ['Monstres tués', String(ctx.summary.kills)],
    ['Niveau', String(g.character.level)],
  ];
  if (got.gold) lines.push(['Or du butin', `+${got.gold}`]);
  const go = button(
    `Manche suivante : ${next.round.name}`,
    () => {
      scr.close();
      g.townPortal();
      if (!playNext(g)) ctx.host.haptic('fail');
    },
    'primary',
  );
  go.dataset.sv = 'next';
  node.append(
    h(
      'div',
      { cls: 'sv-box' },
      h('h2', { cls: 'sv-title', text: `${round.name} : point de reprise atteint` }),
      h('div', { cls: 'sv-recap' }, ...lines.flatMap(([k, v]) => [h('span', { text: k }), h('b', { text: v })])),
      got.equipped.length ? h('p', { cls: 'sv-sub', text: `Équipé : ${got.equipped.join(', ')}` }) : null,
      got.kept.length ? h('p', { cls: 'sv-sub', text: `Au sac : ${got.kept.join(', ')}` }) : null,
      go,
      h(
        'div',
        { cls: 'sv-row' },
        button('Prolongation', () => scr.close()),
        button('Retour au camp', () => {
          scr.close();
          g.townPortal();
        }),
      ),
    ),
  );
}
