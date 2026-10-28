/**
 * The Diablo II logo's fire on the home screen (lot 298, owner's report from a Galaxy Z Fold, Chrome Android: "no animation at all on the
 * DIABLO logo"): the player's own MPQ files imported ($D2_PRIVATE_DIR/in, the local mode), then on the home screen the logo's sprite is
 * sampled over 1.5 s: its frame (background position) and its pixels must change from one sample to the next, the letters stay in place
 * (the sprite's box fixed), on a PC window, a phone in landscape and in portrait, and with the system's "reduce motion" (the fire burns
 * on, slower: a discreet movement kept); then revision 1's art (a pack generated before revision 2: `logo-fire` alone, shown still until lot 298)
 * rebuilt in the browser by the game at revision 2's places.
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/logo-fire.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>]
 */
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const SHOTS = args.get('shots') ?? '/tmp/logo-fire';
mkdirSync(SHOTS, { recursive: true });
const mpqs = readdirSync(IN)
  .filter((f) => /^(d2data|d2char|d2exp)\.mpq$/i.test(f))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const VIEWS = [
  { name: 'pc-1280x800', w: 1280, h: 800, mobile: false },
  { name: 'phone-landscape-882x344', w: 882, h: 344, mobile: true },
  { name: 'phone-portrait-344x882', w: 344, h: 882, mobile: true },
  { name: 'fold-open-portrait-673x841', w: 673, h: 841, mobile: true },
  { name: 'reduced-motion-882x344', w: 882, h: 344, mobile: true, reduce: true },
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// the files imported once (the generated art is kept in the browser's storage of this context)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.goto(URL);
await page.waitForSelector('.d2c', { timeout: 60000 });
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.d2c-card .btn.primary')]);
await fc.setFiles(mpqs);
await page.waitForSelector('.charselect', { timeout: 400000 });
for (const v of VIEWS) {
  await page.setViewportSize({ width: v.w, height: v.h });
  await page.emulateMedia({ reducedMotion: v.reduce ? 'reduce' : 'no-preference' });
  await page.reload();
  await page.waitForSelector('[data-sprite="logo"]', { timeout: 120000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const has = await page.$('[data-sprite="logo"]');
  check(!!has, `${v.name}: the logo's sprite on the home screen`);
  if (!has) continue;
  const samples = [];
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => {
      const e = document.querySelector('[data-sprite="logo"]');
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { pos: cs.backgroundPosition, box: [r.left, r.top, r.width, r.height].map(Math.round).join(','), vis: cs.visibility !== 'hidden' && +cs.opacity > 0 && r.width > 0 };
    });
    const png = await has.screenshot();
    samples.push({ ...s, hash: createHash('sha1').update(png).digest('hex').slice(0, 10) });
    if (i === 0 || i === 3) await has.screenshot({ path: join(SHOTS, `${v.name}-${i}.png`) });
    await page.waitForTimeout(190);
  }
  const frames = new Set(samples.map((s) => s.pos)).size;
  const pixels = new Set(samples.map((s) => s.hash)).size;
  const boxes = new Set(samples.map((s) => s.box)).size;
  check(
    samples.every((s) => s.vis),
    `${v.name}: the logo is visible`,
  );
  check(frames >= (v.reduce ? 2 : 4), `${v.name}: the fire's frame changes (${frames} frames in 8 samples)`, [...new Set(samples.map((s) => s.pos))].slice(0, 4).join(' | '));
  check(pixels >= (v.reduce ? 2 : 4), `${v.name}: the drawn pixels change (${pixels} different images in 8)`);
  check(boxes === 1, `${v.name}: the logo stays in place (its box fixed)`, [...new Set(samples.map((s) => s.box))].join(' | '));
  await page.screenshot({ path: join(SHOTS, `${v.name}-page.png`) });
}
// revision 1's art (a pack never generated again): a sheet in its layout (each half at the bottom of a 370 × 170
// cell, the right one 2 px before the left one's width) cut from revision 2's, rebuilt by the game (`legacyLogo`) in the browser: the
// halves back at the same places (the same pixels), so the fire animates and the letters stay fixed
const legacy = await page.evaluate(async () => {
  const m = await import('/src/ui/d2ui.ts');
  // the sheet drawn on the home screen (the page's own copy of the module may differ from this one: the element's image is read)
  const bg = getComputedStyle(document.querySelector('[data-sprite="logo"]')).backgroundImage;
  const logo = { url: bg.slice(5, -2) };
  if (!logo.url) return { error: 'no logo' };
  const src = new Image();
  src.src = logo.url;
  await src.decode();
  const old = document.createElement('canvas');
  old.width = 1850;
  old.height = 510;
  const g = old.getContext('2d');
  const rects = m.legacyLogoRects();
  for (const frame of rects) for (const [sx, sy, w, h, dx, dy] of frame) g.drawImage(src, dx, dy, w, h, sx, sy, w, h);
  const blob = await new Promise((r) => old.toBlob(r, 'image/png'));
  const rebuilt = await m.legacyLogo({ url: URL.createObjectURL(blob), w: 1850, h: 510, frames: 15, cols: 5, cw: 370, ch: 170 });
  if (!rebuilt) return { error: 'not rebuilt' };
  const read = async (url) => {
    const i = new Image();
    i.src = url;
    await i.decode();
    const c = document.createElement('canvas');
    c.width = 1800;
    c.height = 510;
    const x = c.getContext('2d');
    x.drawImage(i, 0, 0);
    return x.getImageData(0, 0, 1800, 510).data;
  };
  const a = await read(rebuilt.url);
  const b = await read(logo.url);
  // the pixels inside the halves' destinations (where revision 1 kept them)
  let same = 0;
  let total = 0;
  for (const frame of rects)
    for (const [, , w, h, dx, dy] of frame)
      for (let y = dy; y < dy + h; y++)
        for (let x = dx + 2; x < dx + w - 2; x++) {
          const o = (y * 1800 + x) * 4;
          total++;
          if (Math.abs(a[o + 3] - b[o + 3]) < 8) same++;
        }
  return { meta: { w: rebuilt.w, h: rebuilt.h, frames: rebuilt.frames, cw: rebuilt.cw, ch: rebuilt.ch, ax: rebuilt.ax, ay: rebuilt.ay }, same: same / total };
});
check(
  !legacy.error && legacy.meta.frames === 15 && legacy.meta.cw === 360 && legacy.meta.ax === 180 && legacy.same > 0.97,
  'revision 1’s logo rebuilt in the browser: 15 frames at revision 2’s places',
  JSON.stringify(legacy),
);
check(errs.length === 0, '0 page error', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
