/** Collision du joueur avec le terrain : un POINT (rayon de terrain) contre la grille de sous-tuiles, comme Diablo 2, pas le disque de corps */
import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { RUN_BY_ID } from '../../src/data/runs';
import { buildHarrogath } from '../../src/data/zones/harrogath';
import { ZoneBuilder } from '../../src/data/zones/builder';
import type { ZoneDef } from '../../src/data/zone-types';
import { PLAYER_RADIUS, TERRAIN_RADIUS } from '../../src/sim/constants';
import { Game } from '../../src/sim/game';
import { CELL } from '../../src/sim/grid';
import { buildGrid, World } from '../../src/sim/world';
import { findPath } from '../../src/sim/bot/pathfind';

function arena(): { g: Game; w: World } {
  const g = new Game(undefined, 'sorceress');
  const b = new ZoneBuilder('arena', 'Arène', 40, 20, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(5, 10);
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 3, difficulty: 0, zoneLevel: 30, character: g.character });
  return { g, w: g.world };
}

/** Marche vers (tx, ty) en poussant le joueur droit dessus ; rend le nombre de ticks utilisés (max si jamais arrivé) */
function walkTo(g: Game, tx: number, ty: number, max = 400, tol = 0.3): number {
  const w = g.world!;
  const p = w.player;
  for (let t = 0; t < max; t++) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < tol) {
      w.input.moveX = w.input.moveY = 0;
      return t;
    }
    w.input.moveX = dx / d;
    w.input.moveY = dy / d;
    g.step(1);
  }
  w.input.moveX = w.input.moveY = 0;
  return max;
}

function put(w: World, x: number, y: number): void {
  w.player.x = w.player.px = x;
  w.player.y = w.player.py = y;
}

describe('rayon de terrain', () => {
  it('est un point : plus petit qu’une demi-sous-tuile, et le corps garde son rayon', () => {
    expect(TERRAIN_RADIUS).toBeLessThan(CELL / 2);
    expect(PLAYER_RADIUS).toBeGreaterThan(CELL / 2);
  });

  it('passage d’une sous-tuile de large : le joueur passe', () => {
    const { g, w } = arena();
    w.grid.blockRect(20, 0, 21, 10);
    w.grid.blockRect(20, 10 + CELL, 21, 20);
    put(w, 15, 10.25);
    walkTo(g, 25, 10.25);
    expect(w.player.x).toBeGreaterThan(24);
  });

  it('passage d’une sous-tuile, pris en oblique : le glissement le fait entrer', () => {
    const { g, w } = arena();
    w.grid.blockRect(20, 0, 21, 10);
    w.grid.blockRect(20, 10 + CELL, 21, 20);
    put(w, 15, 8);
    walkTo(g, 25, 10.25, 600);
    expect(w.player.x).toBeGreaterThan(19);
    walkTo(g, 25, 10.25, 600);
    expect(w.player.x).toBeGreaterThan(24);
  });

  it('bord d’escalier en diagonale : le joueur longe la marche sans s’accrocher', () => {
    const { g, w } = arena();
    // escalier : marches d’une sous-tuile, au-dessus de la diagonale tout est plein
    for (let i = 0; i < 24; i++) w.grid.blockRect(10 + i * CELL, 0, 10 + (i + 1) * CELL, 2 + i * CELL);
    put(w, 10.3, 2.6);
    const t = walkTo(g, 21, 13.2, 600, 0.4);
    expect(t).toBeLessThan(600);
  });

  it('coin de mur en diagonale : le joueur contourne', () => {
    const { g, w } = arena();
    w.grid.blockRect(18, 0, 22, 9);
    put(w, 14, 5);
    const t = walkTo(g, 26, 13, 600);
    expect(t).toBeLessThan(600);
  });

  it('mur plein : le joueur ne passe pas, et ne sort pas de la zone', () => {
    const { g, w } = arena();
    w.grid.blockRect(20, 0, 21, 20);
    put(w, 15, 10);
    walkTo(g, 30, 10, 200);
    expect(w.player.x).toBeLessThan(20);
    put(w, 1, 10);
    walkTo(g, -10, 10, 100);
    expect(w.player.x).toBeGreaterThanOrEqual(0);
  });

  it('deux cases bloquées en diagonale : le point ne se faufile pas par leur sommet commun', () => {
    const { g, w } = arena();
    w.grid.blockRect(20, 0, 20.5, 10);
    w.grid.blockRect(20.5, 10, 21, 20);
    put(w, 18, 10.5);
    walkTo(g, 23, 9.5, 200);
    expect(w.player.x).toBeLessThan(21.5);
  });

  it('un joueur dans une case bloquée est replacé sur la case libre la plus proche', () => {
    const { g, w } = arena();
    w.grid.blockRect(18, 0, 24, 20);
    put(w, 21, 10);
    g.step(14);
    expect(w.grid.circleBlocked(w.player.x, w.player.y, TERRAIN_RADIUS)).toBe(false);
  });

  it('un monstre ennemi a la collision de terrain « point » comme le joueur : il traverse un couloir d’une sous-tuile sans s’y coincer', () => {
    const { w } = arena();
    w.grid.blockRect(20, 0, 21, 10);
    w.grid.blockRect(20, 10 + CELL, 21, 20);
    const m = { x: 15, y: 10.25, radius: 0.4, team: 1 } as unknown as Parameters<World['moveActor']>[0];
    for (let i = 0; i < 200; i++) w.moveActor(m, 0.1, 0, false);
    expect(m.x).toBeGreaterThan(21);
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;
describe.skipIf(!fs.existsSync(`${DIR}/harrogath.json`) || !fs.existsSync(`${DIR}/tristram.json`))('Harrogath et Tristram (cartes locales)', () => {
  afterAll(() => clearD2Maps());
  const load = (): void => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !x.startsWith('tmp_'))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  };

  /** Marche le long du chemin A* vers chaque point clé avec la physique du jeu : jamais coincé */
  function check(z: ZoneDef): string[] {
    const g = new Game(undefined, 'sorceress');
    g.mode = 'run';
    g.world = new World({ zone: z, seed: 3, difficulty: 0, zoneLevel: 30, character: g.character });
    const w = g.world;
    const grid = buildGrid(z);
    for (const b of z.blockers) if (b.gate && b.rect) grid.unblockRect(...b.rect);
    const targets = [
      ...z.objects.filter((o) => ['npc', 'waypoint', 'stash', 'cube', 'portal', 'quest'].includes(o.kind)).map((o) => ({ x: o.x, y: o.y, what: `objet ${o.kind}` })),
      ...(z.exits ?? []).map((o) => ({ x: o.x, y: o.y, what: `sortie ${o.kind ?? ''}` })),
    ].slice(0, 14);
    // et des cases libres réparties sur toute la carte (escaliers, passerelles, ruelles), prises à pas fixe
    const freeCells: number[] = [];
    for (let i = 0; i < grid.blocked.length; i++) if (!grid.blocked[i]) freeCells.push(i);
    for (let k = 0; k < 24; k++) {
      const i = freeCells[Math.floor(((k + 0.5) * freeCells.length) / 24)];
      targets.push({ x: ((i % grid.cols) + 0.5) * CELL, y: (Math.floor(i / grid.cols) + 0.5) * CELL, what: 'case libre' });
    }
    const errs: string[] = [];
    for (const t of targets) {
      const path = findPath(grid, z.start.x, z.start.y, t.x, t.y, 300000);
      if (!path) {
        // îlot isolé de la carte D2 (jamais relié, même pour un point) : sans objet ici ; un objet ou une sortie, lui, doit l'être
        if (t.what !== 'case libre') errs.push(`${z.id} : ${t.what} hors du graphe de cases`);
        continue;
      }
      w.player.x = w.player.px = z.start.x;
      w.player.y = w.player.py = z.start.y;
      for (const q of path) {
        const n = walkTo(g, q.x, q.y, 300, 0.35);
        if (n >= 300) {
          errs.push(`${z.id} : joueur bloqué en (${w.player.x.toFixed(1)}, ${w.player.y.toFixed(1)}) vers ${t.what} (${q.x.toFixed(1)}, ${q.y.toFixed(1)})`);
          break;
        }
      }
    }
    return errs;
  }

  it('Harrogath : tous les points clés atteignables en marchant', () => {
    load();
    const z = buildHarrogath(1);
    expect(z.d2Map).toBeTruthy();
    const errs = check(z);
    expect(errs, errs.join('\n')).toEqual([]);
  }, 120000);

  it('Tristram (run) : tous les points clés atteignables en marchant', () => {
    load();
    const z = RUN_BY_ID.tristram.build(1, 0);
    expect(z.d2Map).toBeTruthy();
    const errs = check(z);
    expect(errs, errs.join('\n')).toEqual([]);
  }, 120000);
});
