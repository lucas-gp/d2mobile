/**
 * Assouplissement du déplacement : glissement élargi, passage de coin, aimant de sortie, dents de scie, chemin A* des clics.
 * Cas synthétiques (arène 40 × 20) puis cartes locales D2 quand elles sont présentes (ignorés sinon).
 */
import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map, smoothStairs } from '../../src/data/d2map';
import { RUN_BY_ID } from '../../src/data/runs';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { Game } from '../../src/sim/game';
import { CELL } from '../../src/sim/grid';
import { NAV_MAX_NODES } from '../../src/sim/nav';
import { World } from '../../src/sim/world';

function arena(): { g: Game; w: World } {
  const g = new Game(undefined, 'sorceress');
  const b = new ZoneBuilder('arena', 'Arène', 40, 20, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(5, 10);
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 3, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.autoCfg = g.settings;
  return { g, w: g.world };
}

const put = (w: World, x: number, y: number): void => {
  w.player.x = w.player.px = x;
  w.player.y = w.player.py = y;
};
/** Sous-tuile (cx, cy) bloquée */
const cell = (w: World, cx: number, cy: number): void => w.grid.blockRect(cx * CELL, cy * CELL, (cx + 1) * CELL, (cy + 1) * CELL);

/** Pousse le joystick dans une direction fixe pendant n ticks */
function push(w: World, ux: number, uy: number, n: number): void {
  const l = Math.hypot(ux, uy);
  w.input.moveX = ux / l;
  w.input.moveY = uy / l;
  w.step(n);
  w.input.moveX = w.input.moveY = 0;
}

/** Marche en suivant w.steer() jusqu'au but (clic) ; rend le nombre de ticks, ou max s'il n'arrive pas */
function click(w: World, tx: number, ty: number, max = 1500, tol = 0.4): number {
  for (let t = 0; t < max; t++) {
    if (Math.hypot(tx - w.player.x, ty - w.player.y) < tol) {
      w.input.moveX = w.input.moveY = 0;
      return t;
    }
    const d = w.steer(tx, ty);
    if (!d) {
      w.input.moveX = w.input.moveY = 0;
      return max;
    }
    w.input.moveX = d.x;
    w.input.moveY = d.y;
    w.step(1);
  }
  w.input.moveX = w.input.moveY = 0;
  return max;
}

describe('dents de scie (smoothStairs)', () => {
  const grid = (cells: [number, number][], cols = 30, rows = 30) => {
    const blocked = new Uint8Array(cols * rows);
    for (const [x, y] of cells) blocked[y * cols + x] = 1;
    return { cols, rows, blocked };
  };

  it('libère une dent d’un damier de 1 sous-tuile', () => {
    const g = grid([
      [10, 10],
      [11, 11],
    ]);
    expect(smoothStairs(g)).toBe(1);
    expect(g.blocked[10 * 30 + 10] + g.blocked[11 * 30 + 11]).toBe(1);
  });

  it('ne touche ni un mur plein, ni un mur fin en diagonale de 3 sous-tuiles ou plus', () => {
    const wall = grid([
      [9, 9],
      [10, 10],
      [11, 11],
      [12, 12],
    ]);
    expect(smoothStairs(wall)).toBe(0);
    const three = grid([
      [9, 9],
      [10, 10],
      [11, 11],
    ]);
    expect(smoothStairs(three)).toBe(0);
    const full = grid([
      [10, 10],
      [11, 10],
      [10, 11],
      [11, 11],
    ]);
    expect(smoothStairs(full)).toBe(0);
    const stray = grid([[10, 10]]);
    expect(smoothStairs(stray)).toBe(0);
  });

  it('ne relie pas deux zones séparées par la dent', () => {
    // mur en V : deux cases en diagonale ferment la communication entre deux salles (sinon entourées de plein)
    const cols = 12;
    const rows = 12;
    const blocked = new Uint8Array(cols * rows).fill(1);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) blocked[y * cols + x] = 0;
    for (let y = 5; y < 10; y++) for (let x = 5; x < 10; x++) blocked[y * cols + x] = 0;
    // les deux salles se touchent seulement par le coin (4,4) / (5,5) : cases (4,5) et (5,4) pleines
    const before = Uint8Array.from(blocked);
    smoothStairs({ cols, rows, blocked });
    expect(Array.from(blocked)).toEqual(Array.from(before));
  });
});

describe('glissement et passage de coin', () => {
  it('passe entre deux sous-tuiles bloquées en diagonale (coin isolé)', () => {
    const { w } = arena();
    cell(w, 40, 20);
    cell(w, 41, 21);
    // départ dans la case libre (40,21), arrivée dans (41,20)... on traverse en diagonale par le sommet commun
    put(w, 20.25, 10.75);
    push(w, 1, -1, 12);
    expect(w.player.x).toBeGreaterThan(20.5);
    expect(w.player.y).toBeLessThan(10.5);
  });

  it('un long mur fin en diagonale reste infranchissable (aucun passage de coin)', () => {
    const { w } = arena();
    for (let i = 0; i < 38; i++) cell(w, i, i);
    put(w, 6, 12);
    for (let k = 0; k < 6; k++) push(w, 1, -0.4, 25);
    expect(w.player.x - w.player.y).toBeLessThan(0.3);
    put(w, 12, 6);
    for (let k = 0; k < 6; k++) push(w, -1, 0.4, 25);
    expect(w.player.x - w.player.y).toBeGreaterThan(-0.3);
  });

  it('mur plein : pousser dedans ne fait ni passer ni glisser sans fin', () => {
    const { w } = arena();
    w.grid.blockRect(20, 0, 21, 20);
    put(w, 18, 10);
    push(w, 1, 0, 80);
    expect(w.player.x).toBeLessThan(20);
    expect(Math.abs(w.player.y - 10)).toBeLessThan(0.3);
  });

  it('aimant de sortie : une bosse de 3 sous-tuiles est contournée sans arrêt', () => {
    const { w } = arena();
    // bosse contre laquelle le joueur pousse en pleine face, avec un passage à 0,6 sur le côté
    for (let c = 40; c <= 42; c++) cell(w, c, 18);
    put(w, 20.9, 11);
    push(w, 0, -1, 70);
    expect(w.player.y).toBeLessThan(8.5);
  });

  it('la poussée contre un mur sans passage proche ne déplace pas le joueur', () => {
    const { w } = arena();
    w.grid.blockRect(10, 0, 12, 20);
    put(w, 9.5, 10);
    push(w, 1, 0, 60);
    expect(w.player.x).toBeLessThan(10);
    expect(Math.abs(w.player.y - 10)).toBeLessThan(0.6);
  });

  it('un monstre ennemi a la collision de terrain « point » (D2) : il passe un couloir d’une sous-tuile, mais jamais la diagonale d’un mur', () => {
    const { w } = arena();
    w.grid.blockRect(20, 0, 21, 10);
    w.grid.blockRect(20, 10 + CELL, 21, 20);
    // monstre minimal construit à la main
    const m = { x: 18, y: 10.25, px: 18, py: 10.25, radius: 0.6, team: 1, dead: false } as unknown as Parameters<World['moveActor']>[0];
    for (let i = 0; i < 40; i++) w.moveActor(m, 0.2, 0, false);
    expect(m.x).toBeGreaterThan(21);
    // diagonale de 2 sous-tuiles (coin isolé) : comme le joueur, l’ennemi y passe
    const w2 = arena().w;
    cell(w2, 40, 20);
    cell(w2, 41, 21);
    const e = { x: 20.25, y: 10.75, px: 20.25, py: 10.75, radius: 0.15, team: 1, dead: false } as unknown as Parameters<World['moveActor']>[0];
    for (let i = 0; i < 12; i++) w2.moveActor(e, 0.14, -0.14, false);
    expect(e.x).toBeGreaterThan(21);
  });
});

describe('chemin des clics (A*)', () => {
  it('contourne un obstacle large qui annulait le but', () => {
    const { w } = arena();
    w.grid.blockRect(20, 2, 21, 18);
    put(w, 15, 10);
    const t = click(w, 26, 10);
    expect(t).toBeLessThan(1500);
    expect(w.player.x).toBeGreaterThan(25.5);
    // peu de recherches : pas de recalcul à chaque image
    expect(w.navPlans).toBeLessThan(12);
  });

  it('droit devant quand rien ne gêne : une seule recherche, aucun détour', () => {
    const { w } = arena();
    put(w, 5, 10);
    const t = click(w, 30, 10);
    expect(t).toBeLessThan(25 * 6);
    expect(w.navPlans).toBeLessThanOrEqual(2);
  });

  it('but inatteignable (enclos fermé) : va au point le plus proche puis s’arrête', () => {
    const { w } = arena();
    w.grid.blockRect(26, 6, 34, 7);
    w.grid.blockRect(26, 13, 34, 14);
    w.grid.blockRect(26, 6, 27, 14);
    w.grid.blockRect(33, 6, 34, 14);
    put(w, 15, 10);
    const t = click(w, 30, 10, 900);
    expect(t).toBe(900); // jamais « arrivé »
    expect(w.steer(30, 10)).toBeNull();
    // longe l’enclos par l’extérieur jusqu’au point le plus proche du but, sans y entrer
    expect(w.player.x > 27 && w.player.x < 33 && w.player.y > 7 && w.player.y < 13).toBe(false);
    expect(Math.hypot(30 - w.player.x, 10 - w.player.y)).toBeLessThan(4.6);
    expect(w.grid.circleBlocked(w.player.x, w.player.y, 0.15)).toBe(false);
  });

  it('but dans un mur : on s’arrête à côté', () => {
    const { w } = arena();
    w.grid.blockRect(20, 0, 24, 20);
    put(w, 12, 10);
    click(w, 22, 10, 600);
    expect(w.player.x).toBeGreaterThan(18);
    expect(w.player.x).toBeLessThan(20);
  });

  it('limite de nœuds : une recherche reste bornée', () => {
    expect(NAV_MAX_NODES).toBeLessThanOrEqual(4000);
  });

  it('p.goal (objet, PNJ) passe aussi par le chemin', () => {
    const { w } = arena();
    w.grid.blockRect(20, 2, 21, 18);
    put(w, 15, 10);
    w.player.goal = { x: 26, y: 10, kind: 'move', ref: 0 };
    w.step(600);
    expect(w.player.x).toBeGreaterThan(24);
  });
});

describe('déplacement façon D2 : pousse latérale et étanchéité', () => {
  it('un pilier étroit en travers de la marche : le joueur se décale et passe sans perdre sa vitesse', () => {
    const { w } = arena();
    cell(w, 30, 20); // pilier d’une sous-tuile, bord sud à y = 10.5
    put(w, 13, 10.6);
    // marche exactement le long de l’arête du pilier
    push(w, 1, 0, 40);
    expect(w.player.x).toBeGreaterThan(18);
  });

  it('une direction diagonale bloquée de front glisse vers le côté libre à bonne vitesse', () => {
    const { w } = arena();
    w.grid.blockRect(20, 2, 21, 18);
    put(w, 19.7, 10);
    const y0 = w.player.y;
    push(w, 1, 0.5, 25);
    // pas d’arrêt : le long du mur à plus de la moitié de la vitesse de marche
    expect(Math.abs(w.player.y - y0)).toBeGreaterThan(1.0);
  });

  it('allié immobile loin du maître : replacé près de lui, jamais dans un mur', () => {
    const { g, w } = arena();
    void g;
    w.grid.blockRect(20, 0, 21, 20);
    put(w, 30, 10);
    const m = { x: 10, y: 10, px: 10, py: 10, speed: 5, id: 1, stuckT: 0, mode: 'idle' } as unknown as Parameters<World['allyStuck']>[0];
    for (let i = 0; i < 40; i++) w.allyStuck(m, 0, m.speed, 20);
    expect(m.x).toBeGreaterThan(20);
    expect(w.grid.circleBlocked(m.x, m.y, 0.15)).toBe(false);
  });

  it('étanchéité : des milliers de poussées aléatoires ne mettent jamais le point dans un mur ni de l’autre côté d’un mur fin en diagonale', () => {
    const { w } = arena();
    for (let i = 0; i < 40; i++) cell(w, 20 + i, i); // mur fin en diagonale de (10, 0) à (30, 20)
    cell(w, 70, 20);
    cell(w, 71, 20);
    cell(w, 70, 21);
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    put(w, 12, 15);
    // > 0 : sous la diagonale (y/CELL > x/CELL - 20)
    const side = (x: number, y: number) => Math.sign(y / CELL - (x / CELL - 20));
    const start = side(w.player.x, w.player.y);
    let ang = 0;
    for (let t = 0; t < 6000; t++) {
      if (t % 20 === 0) ang = rnd() * Math.PI * 2;
      push(w, Math.cos(ang), Math.sin(ang), 1);
      expect(w.grid.isBlockedAt(w.player.x, w.player.y)).toBe(false);
      if (w.player.x > 10.6 && w.player.x < 29.4) expect(side(w.player.x, w.player.y)).toBe(start);
    }
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;
describe.skipIf(!fs.existsSync(DIR))('cartes D2 locales', () => {
  afterAll(() => clearD2Maps());
  it('Sanctuaire du Chaos et Harrogath : les clics proches arrivent', () => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !x.startsWith('tmp_'))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
    for (const id of ['chaos', 'a4_chaos']) {
      const z = RUN_BY_ID[id].build(1, 0);
      if (!z.d2Map) continue;
      const g = new Game(undefined, 'sorceress');
      g.mode = 'run';
      g.world = new World({ zone: z, seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
      const w = g.world;
      w.autoCfg = g.settings;
      w.monsters.length = 0;
      w.pendingSpawns = [];
      let ok = 0;
      let tot = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const f = w.grid.nearestFree(z.start.x + Math.cos(a) * 12, z.start.y + Math.sin(a) * 12, 1);
        if (!f || w.grid.isBlockedAt(f.x, f.y)) continue;
        put(w, z.start.x, z.start.y);
        w.navPlans;
        tot++;
        if (click(w, f.x, f.y, 1200, 0.6) < 1200) ok++;
      }
      // les points joignables dans la limite de nœuds arrivent (les autres s’arrêtent au plus près, jamais dans un mur)
      expect(ok, id).toBeGreaterThanOrEqual(Math.floor(tot * 0.6));
      expect(w.grid.circleBlocked(w.player.x, w.player.y, 0.02)).toBe(false);
    }
  }, 60000);
});
