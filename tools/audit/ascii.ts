/** Dump ASCII d'une région de la grille de marche : npx tsx tools/audit/ascii.ts <zone> <x> <y> [demi-largeur en cases] */
import '../mods/auto';
import fs from 'node:fs';
import { parseD2Map, registerD2Map } from '../../src/data/d2map';
import { RUNS } from '../../src/data/runs';
import { buildHarrogath } from '../../src/data/zones/harrogath';
import { buildGrid } from '../../src/sim/world';
const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;
const [id, xs, ys, hs] = process.argv.slice(2);
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !x.startsWith('tmp_'))) {
  const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  if (j.grid) registerD2Map(parseD2Map(j));
}
const z = id === 'harrogath' ? buildHarrogath(1) : RUNS.find((r) => r.id === id)!.build(1, 0);
const g = buildGrid(z);
for (const b of z.blockers) if (b.gate && b.rect) g.unblockRect(...b.rect);
const cx = Math.floor(+xs / 0.5),
  cy = Math.floor(+ys / 0.5),
  h = +(hs ?? 20);
for (let y = cy - h; y <= cy + h; y++) {
  let s = String(y).padStart(4) + ' ';
  for (let x = cx - h * 2; x <= cx + h * 2; x++) s += x === cx && y === cy ? '@' : g.isBlockedCell(x, y) ? '#' : '.';
  console.log(s);
}
