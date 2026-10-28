import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';

describe('Portée d’apparition des groupes', () => {
  it('un grand écran (viewReach) déclenche les groupes plus tôt que le déclencheur d’origine', () => {
    const a = new Game();
    a.startRun('tristram', 0);
    const b = new Game();
    b.startRun('tristram', 0);
    b.world.viewReach = 40;
    const sp = a.world.pendingSpawns.find((s) => !s.wave && !s.seal && s.trigger > 0);
    if (!sp) throw new Error('aucun groupe à déclencheur');
    for (const g of [a, b]) {
      g.world.player.x = sp.x + sp.trigger + sp.r + 8;
      g.world.player.y = sp.y;
      g.step(2);
    }
    const left = (g: Game) => g.world.pendingSpawns.some((s) => s.idx === sp.idx);
    expect(left(a)).toBe(true);
    expect(left(b)).toBe(false);
  });
});
