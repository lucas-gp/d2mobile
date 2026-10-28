import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { spawnMonster } from '../../src/sim/spawn';
import { MONSTER_BY_ID } from '../../src/data/monsters';

function world(): World {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 40, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(5, 20);
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 40, character: g.character });
  return g.world;
}

/** Fait attaquer le monstre avec l'attaque `idx` (forcée) et renvoie les événements et les dégâts de foudre reçus. */
function force(id: string, idx: number) {
  const w = world();
  const m = spawnMonster(w, id, 20, 20, { rank: 'boss' }, '0:0')!;
  expect(m, id).toBeTruthy();
  w.player.x = 20 + m.radius + 4;
  w.player.y = 20;
  const hp0 = w.player.hp;
  m.aggro = true;
  m.def.attacks.forEach((_, i) => {
    if (i !== idx) m.atkCd[i] = 99999;
  });
  const kinds: string[] = [];
  let beams = 0;
  let attacked = false;
  for (let t = 0; t < 120; t++) {
    w.player.hp = Math.max(w.player.hp, 1);
    w.step();
    for (const e of w.events.drain()) {
      if (e.t === 'beam') beams++;
      if (e.t === 'monsterAttack') {
        attacked = true;
        kinds.push(e.kind);
      }
    }
  }
  return { beams, attacked, kinds, lost: hp0 - w.player.hp };
}

describe('Éclair rouge de Diablo', () => {
  it.each(['diablo', 'dclone', 'uber_diablo'])('%s : le souffle de foudre produit un éclair visible ET des dégâts', (id) => {
    const idx = MONSTER_BY_ID[id].attacks.findIndex((a) => a.kind === 'breath' && a.element === 'light');
    expect(idx).toBeGreaterThanOrEqual(0);
    const r = force(id, idx);
    expect(r.kinds).toContain('breath');
    expect(r.beams).toBeGreaterThan(2); // jet continu, pas un seul trait
    expect(r.lost).toBeGreaterThan(0);
  });
});
