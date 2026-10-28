/** Cartes de Diablo II : placement déterministe sur une carte synthétique, collision reprise de la carte */
import { afterEach, describe, expect, it } from 'vitest';
import { clearD2Maps, nearestOpen, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { buildAndariel } from '../../src/data/zones/farm';
import { buildGrid } from '../../src/sim/world';

const b64 = (a: Uint8Array) => Buffer.from(a).toString('base64');

/** Grille de 40 × 20 cases D2 vides : un couloir libre de 12 sous-tuiles de large */
function synthetic(id: string) {
  const cols = 40 * 5;
  const rows = 20 * 5;
  const blocked = new Uint8Array(cols * rows).fill(1);
  for (let y = 20; y < 80; y++) for (let x = 10; x < 190; x++) blocked[y * cols + x] = 0;
  return parseD2Map({ id, cases: [40, 20], units: [100, 50], grid: { cols, rows, blocked: b64(blocked), opaque: b64(new Uint8Array(cols * rows)) }, objects: [], landmarks: {} });
}

describe('cartes D2', () => {
  afterEach(() => clearD2Maps());

  it('sans carte : la zone d’origine, sans collision importée', () => {
    const z = buildAndariel(1, 0);
    expect(z.d2Map).toBeUndefined();
  });

  it('nearestOpen ramène un point bloqué sur une case libre', () => {
    const m = synthetic('andariel');
    const p = nearestOpen(m, 2, 2);
    const cols = m.grid.cols;
    expect(m.grid.blocked[Math.floor(p.y / 0.5) * cols + Math.floor(p.x / 0.5)]).toBe(0);
  });

  it('salle de farm : déterministe, groupes et boss sur cases libres, collision de la carte', () => {
    registerD2Map(synthetic('andariel'));
    const a = buildAndariel(3, 0);
    const b = buildAndariel(3, 0);
    expect(a.d2Map?.id).toBe('andariel');
    expect(JSON.stringify(a.spawns)).toBe(JSON.stringify(b.spawns));
    const g = buildGrid(a);
    expect(g.blocked[0]).toBe(1);
    for (const s of a.spawns) expect(g.isBlockedAt(s.x, s.y)).toBe(false);
    expect(a.spawns.some((s) => s.runBoss)).toBe(true);
    const boss = a.spawns.find((s) => s.runBoss)!;
    expect(Math.hypot(boss.x - a.start.x, boss.y - a.start.y)).toBeGreaterThan(40);
  });
});
