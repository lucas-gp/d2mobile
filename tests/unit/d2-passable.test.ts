/** Décor sur cartes D2 : un prop ne bouche jamais un passage (pied d'arche des Anciens) ; zone des Anciens parcourable à pied */
import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { RUN_BY_ID } from '../../src/data/runs';
import { keepPassable } from '../../src/data/zones/d2passable';
import type { PropPlacement, ZoneDef } from '../../src/data/zone-types';
import { PLAYER_RADIUS } from '../../src/sim/constants';
import { buildGrid } from '../../src/sim/world';
import type { WalkGrid } from '../../src/sim/grid';

const b64 = (a: Uint8Array) => Buffer.from(a).toString('base64');

/** Atteignable à pied depuis (x, y) avec le disque du personnage (8-connexe sans couper les coins) */
function walkable(g: WalkGrid, x: number, y: number): (tx: number, ty: number) => boolean {
  const free = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < g.cols && cy < g.rows && !g.circleBlocked((cx + 0.5) * 0.5, (cy + 0.5) * 0.5, PLAYER_RADIUS);
  const seen = new Uint8Array(g.cols * g.rows);
  let sx = Math.floor(x / 0.5);
  let sy = Math.floor(y / 0.5);
  for (let r = 0; r < 6 && !free(sx, sy); r++)
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++)
        if (free(sx + ox, sy + oy)) {
          sx += ox;
          sy += oy;
          r = 99;
          oy = 99;
          break;
        }
  const st = [sy * g.cols + sx];
  seen[st[0]] = 1;
  while (st.length) {
    const i = st.pop()!;
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox;
        const ny = cy + oy;
        if ((!ox && !oy) || seen[ny * g.cols + nx] || !free(nx, ny)) continue;
        if (ox && oy && (!free(cx + ox, cy) || !free(cx, cy + oy))) continue;
        seen[ny * g.cols + nx] = 1;
        st.push(ny * g.cols + nx);
      }
  }
  return (tx, ty) => seen[Math.floor(ty / 0.5) * g.cols + Math.floor(tx / 0.5)] === 1;
}

describe('décor qui ne bouche pas les passages', () => {
  afterEach(() => clearD2Maps());

  it('un tonneau posé à l’entrée d’un passage d’une case de large (pied d’arche) est retiré, un autre en terrain dégagé reste', () => {
    // 40 × 24 unités : mur plein sauf une salle et, au milieu, un mur avec une porte de 3 sous-cases (1,5 unité) entre deux piliers
    const cols = 80;
    const rows = 48;
    const blocked = new Uint8Array(cols * rows);
    for (let x = 0; x < cols; x++) for (const y of [0, 1, rows - 2, rows - 1]) blocked[y * cols + x] = 1;
    for (let y = 0; y < rows; y++) for (const x of [0, 1, cols - 2, cols - 1]) blocked[y * cols + x] = 1;
    for (let y = 2; y < rows - 2; y++) if (y < 22 || y > 24) for (let x = 38; x < 43; x++) blocked[y * cols + x] = 1;
    const m = parseD2Map({ id: 'passage', cases: [16, 10], units: [40, 24], grid: { cols, rows, blocked: b64(blocked), opaque: b64(new Uint8Array(cols * rows)) }, objects: [], landmarks: {} });
    const barrel = (x: number, y: number): PropPlacement => ({ prop: 'barrel', x, y, variant: 0, scale: 1 });
    // la porte est à y = 11 .. 12,5 ; le tonneau est juste à sa bouche ouest, l'autre loin du mur
    const out = { width: 40, height: 24, start: { x: 10, y: 12 }, props: [barrel(18.75, 10.75), barrel(10, 6)] } as unknown as ZoneDef;
    const before = buildGrid({ ...out, props: out.props, walls: [], blockers: [], d2Map: { cols, rows, blocked, opaque: new Uint8Array(cols * rows) } } as unknown as ZoneDef);
    expect(walkable(before, 10, 12)(30, 12)).toBe(false); // le tonneau ferme bien la porte
    keepPassable(out, m);
    expect(out.props.map((p) => [p.x, p.y])).toEqual([[10, 6]]);
    const after = buildGrid({ ...out, walls: [], blockers: [], d2Map: { cols, rows, blocked, opaque: new Uint8Array(cols * rows) } } as unknown as ZoneDef);
    expect(walkable(after, 10, 12)(30, 12)).toBe(true);
  });
});

const PRIVATE = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps/ancients.json`;
describe.skipIf(!fs.existsSync(PRIVATE))('Les Anciens : l’arche est praticable (cartes privées présentes)', () => {
  afterEach(() => clearD2Maps());

  it('le passage sous l’arche est dégagé et les trois Anciens sont atteignables à pied, pour plusieurs graines', () => {
    registerD2Map(parseD2Map(JSON.parse(fs.readFileSync(PRIVATE, 'utf8'))));
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const z = RUN_BY_ID.ancients.build(seed, 0);
      expect(z.d2Map?.id).toBe('ancients');
      const g = buildGrid(z);
      // l'arche : deux piliers de 5 sous-cases, passage de 3 entre eux (x = 25 à 26,5, y = 50 à 51,5) ; de part et d'autre, le couloir central doit rester libre
      for (let cy = 98; cy <= 104; cy++) expect(g.circleBlocked(25.75, (cy + 0.5) * 0.5, PLAYER_RADIUS), `seed ${seed}, y ${cy}`).toBe(false);
      const reach = walkable(g, z.start.x, z.start.y);
      for (const s of z.spawns.filter((x) => x.runBoss)) expect(reach(s.x, s.y), `seed ${seed} ${s.monster}`).toBe(true);
      // on peut traverser l'arche d'un bout à l'autre sans quitter le couloir : de l'entrée sud à la sortie nord
      const through = walkable(g, 25.75, 52.75);
      expect(through(25.75, 49), `seed ${seed}`).toBe(true);
    }
  });
});
