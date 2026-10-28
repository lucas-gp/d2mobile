/**
 * Icônes d'interface (game-icons.net, CC BY 3.0 — attribution dans ASSETS.md et l'écran de
 * crédits) : retire le carré de fond et produit des SVG blancs, teintés en CSS (mask).
 *   npx tsx tools/build-icons.ts
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'assets-src/ui/game-icons');
const OUT = join(ROOT, 'public/icons');
mkdirSync(OUT, { recursive: true });
const list = readFileSync(join(SRC, 'icons.txt'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => l.split(' ')[0]);
for (const id of list) {
  let svg = readFileSync(join(SRC, `${id}.svg`), 'utf8');
  svg = svg.replace(/<path d="M0 0h512v512H0z"\/>/, '').replace(/fill="#fff"/g, 'fill="#ffffff"');
  writeFileSync(join(OUT, `${id}.svg`), svg);
}
// polices (OFL) utilisées par l'interface
const FONTS = join(ROOT, 'assets-src/fonts');
mkdirSync(join(ROOT, 'public/fonts'), { recursive: true });
for (const [src, dst] of [
  ['cinzel/Cinzel[wght].ttf', 'Cinzel.ttf'],
  ['alegreyasc/AlegreyaSC-Regular.ttf', 'AlegreyaSC-Regular.ttf'],
  ['alegreyasc/AlegreyaSC-Bold.ttf', 'AlegreyaSC-Bold.ttf'],
])
  copyFileSync(join(FONTS, src), join(ROOT, 'public/fonts', dst));
// licence OFL jointe aux polices servies par le site
copyFileSync(join(FONTS, 'cinzel/OFL.txt'), join(ROOT, 'public/fonts/OFL-Cinzel.txt'));
copyFileSync(join(FONTS, 'alegreyasc/OFL.txt'), join(ROOT, 'public/fonts/OFL-AlegreyaSC.txt'));
console.log(`${list.length} icônes, 3 polices`);

// Les icônes de l'application (PWA) sont générées par tools/build-app-icon.ts.
