/**
 * Interface art generated on the device by an earlier version (lot 270, `UI_REVISION`): only the interface is generated again, once, and
 * the anchored logo (`logo`) replaces the old misplaced one. Needs the player's archives ($D2_PRIVATE_DIR/in, never in git).
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-ui-revision.mjs [--url=…] [--in=…]
 * Steps: import the archives (game ready) → ui.json rewritten as revision 1 (no `rev`) and the logo removed from the cache → reload: the
 * interface is generated again (ui.json `rev` 2, `logo.png` back, CSS variable `--u-logo` set), the other generated graphics are kept.
 */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 200)}`));
  const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  /** ui.json of the generated cache, and the number of generated entries */
  const cache = () =>
    page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        const keys = (await c.keys()).map((r) => r.url);
        const ui = keys.find((k) => k.endsWith('/d2-local/ui/ui.json'));
        if (!ui) continue;
        const index = await (await c.match(ui)).json();
        return { name, entries: keys.length, rev: index.rev ?? null, logoIndexed: !!index.files.logo, logoPng: keys.some((k) => k.endsWith('/d2-local/ui/logo.png')) };
      }
      return null;
    });

  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 60000 });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.d2c-card .btn.primary')]);
  await fc.setFiles(mpqs);
  await page.waitForSelector('.d2c', { state: 'detached', timeout: 240000 });
  await ready();
  await page.waitForFunction(() => window.__d2local?.status && window.__d2local.status.queued + window.__d2local.status.active === 0, null, { timeout: 120000 });
  const before = await cache();
  check(before?.rev === 2 && before.logoPng, 'generated interface: revision 2, anchored logo', JSON.stringify(before));

  // as left by an earlier version: no revision, no anchored logo
  await page.evaluate(async (name) => {
    const c = await caches.open(name);
    const base = new URL('./', location.href).href;
    const r = await c.match(`${base}d2-local/ui/ui.json`);
    const index = await r.json();
    delete index.rev;
    delete index.files.logo;
    await c.put(`${base}d2-local/ui/ui.json`, new Response(JSON.stringify(index)));
    await c.delete(`${base}d2-local/ui/logo.png`);
  }, before.name);
  const stale = await cache();
  check(stale?.rev === null && !stale.logoPng, 'cache made stale (revision 1)', JSON.stringify(stale));

  await page.reload();
  await ready();
  await page.waitForFunction(
    async () => {
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        const r = await c.match(new URL('./d2-local/ui/ui.json', location.href).href);
        if (r) return (await r.json()).rev === 2;
      }
      return false;
    },
    null,
    { timeout: 120000, polling: 1000 },
  );
  const after = await cache();
  check(after?.rev === 2 && after.logoIndexed && after.logoPng, 'after the reload: the interface generated again (revision 2, logo)', JSON.stringify(after));
  check(after.entries >= before.entries - 1, 'the other generated graphics are kept', `${before.entries} → ${after.entries} entries`);
  await page.waitForFunction(() => !!getComputedStyle(document.documentElement).getPropertyValue('--u-logo'), null, { timeout: 30000 });
  check(true, 'anchored logo loaded in the page (--u-logo)');
  check(errs.length === 0, 'no console error', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
