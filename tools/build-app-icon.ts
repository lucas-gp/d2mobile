/**
 * Icônes de l'application (PWA) : sceau/portail rouge et or, création originale.
 * Source vectorielle : assets-src/app-icon/*.svg ; sortie : public/icon-{32,192,512,maskable-512}.png
 * Rastérisé par Chromium (playwright-core). Si le navigateur n'est pas trouvé :
 *   PLAYWRIGHT_BROWSERS_PATH=<dossier> npx tsx tools/build-app-icon.ts   (ou D2_CHROME=<chemin de chrome>)
 *   npx tsx tools/build-app-icon.ts
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const read = (n: string) => readFileSync(join(ROOT, 'assets-src/app-icon', n), 'utf8');
const jobs: Array<[string, string, number]> = [
  ['icon.svg', 'icon-32.png', 32],
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
];
const browser = await chromium.launch(process.env.D2_CHROME ? { executablePath: process.env.D2_CHROME } : {});
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const svg = read(src).replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: join(ROOT, 'public', out) });
  console.log(out);
}
await browser.close();
