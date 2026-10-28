/**
 * Synchronisation entre deux appareils (mobile + PC) : compte créé sur A, personnage créé sur A, connexion sur B → le personnage apparaît ;
 * conflit simulé (les deux modifient hors ligne) → fenêtre de choix, « garder les deux » ; /api/ jamais en cache.
 * L'API est celle du dépôt (api/_lib/core.ts) avec un faux stockage en mémoire, branchée par interception réseau Playwright.
 *   npx vite build && npx vite preview --port 4199   puis   npx tsx tools/e2e/sync.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
import { handle, resetRateLimits, StoreConflict } from '../../api/_lib/core.ts';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const files = new Map();
let n = 0;
const store = {
  async get(p) {
    return files.get(p) ?? null;
  },
  async put(p, data, o = {}) {
    const cur = files.get(p);
    if ((o.createOnly && cur) || (o.ifMatch && cur?.etag !== o.ifMatch)) throw new StoreConflict();
    const etag = `e${++n}`;
    files.set(p, { data: new Uint8Array(data), etag });
    return { etag };
  },
  async del(ps) {
    for (const p of ps) files.delete(p);
  },
  async list(prefix) {
    return [...files.keys()].filter((k) => k.startsWith(prefix));
  },
};
const deps = { store, pepper: 'e2e'.repeat(15), now: Date.now, sleep: async () => undefined };
let apiCalls = 0;
const route = async (r) => {
  apiCalls++;
  const out = await handle(deps, { ip: '8.8.8.8', body: JSON.parse(r.request().postData() ?? 'null') });
  await r.fulfill({ status: out.status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(out.body) });
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let ok = true;
const check = (cond, what, detail = '') => {
  if (!cond) ok = false;
  console.log(`${cond ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const errors = [];
async function device(opts) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...opts });
  // sans cela le jeu saute l'écran de sélection (navigateur piloté)
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await ctx.route('**/api/sync', route);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page };
}
const open = async (page) => {
  await page.goto(`${URL}?sync-debug=1`);
  await page.waitForSelector('.charselect', { timeout: 60000 });
};
const act = (page, a) => page.locator(`[data-act="${a}"]`).first().click();

try {
  // ---------- appareil A : téléphone ----------
  const A = await device({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await open(A.page);
  await act(A.page, 'sync');
  await act(A.page, 'tab-register');
  const inputs = A.page.locator('.sync-box input.sync-input');
  await inputs.nth(0).fill('Alice_E2E');
  await inputs.nth(1).fill('un-mot-de-passe-solide');
  await inputs.nth(2).fill('un-mot-de-passe-solide');
  await act(A.page, 'go');
  await A.page.waitForSelector('.sync-box .statrow', { timeout: 60000 });
  check(/alice_e2e/.test(await A.page.locator('.sync-box').innerText()), 'A : compte créé, connecté');
  await act(A.page, 'close');
  // création d'un personnage
  await A.page.locator('.cs-main input').fill('Alpha');
  await A.page.locator('.cs-main button.primary').first().click();
  await A.page.waitForFunction(() => window.__arpg && window.__arpg.state().mode, null, { timeout: 90000 });
  await A.page.evaluate(() => window.__sync.flush(false));
  await A.page.waitForFunction(() => window.__sync.state.count >= 1 || window.__sync.state.status === 'idle', null, { timeout: 30000 });
  const onlineA = await A.page.evaluate(async () => {
    await window.__sync.syncAll();
    return window.__sync.state;
  });
  check(onlineA.count === 1 && onlineA.status === 'idle', 'A : le personnage est en ligne', JSON.stringify(onlineA));

  // ---------- appareil B : PC ----------
  const B = await device({ viewport: { width: 1280, height: 720 } });
  await open(B.page);
  await act(B.page, 'sync');
  const bi = B.page.locator('.sync-box input.sync-input');
  await bi.nth(0).fill('alice_e2e');
  await bi.nth(1).fill('un-mot-de-passe-solide');
  await act(B.page, 'go');
  await B.page.waitForSelector('.sync-box .statrow', { timeout: 60000 });
  await act(B.page, 'close');
  await B.page.waitForSelector('.chars .char', { timeout: 15000 });
  check((await B.page.locator('.chars .char').first().innerText()).includes('Alpha'), 'B : le personnage de A apparaît à la sélection');
  const slotKeys = await B.page.evaluate(() => Object.keys(localStorage).filter((k) => /^d2m\.save\.[^.]+$/.test(k)));
  check(slotKeys.length === 1 && /[0-9a-f]{8}-/.test(slotKeys[0]), 'identifiant d’emplacement unique (UUID)', slotKeys.join());

  // ---------- conflit : les deux modifient le même personnage ----------
  const edit = (page, level) =>
    page.evaluate((lvl) => {
      const k = Object.keys(localStorage).find((x) => /^d2m\.save\.[^.]+$/.test(x));
      const d = JSON.parse(localStorage.getItem(k));
      d.character.level = lvl;
      d.savedAt = Date.now() + lvl;
      localStorage.setItem(k, JSON.stringify(d));
    }, level);
  await edit(A.page, 20);
  await edit(B.page, 15);
  await A.page.evaluate(() => window.__sync.syncAll());
  await B.page.reload();
  await B.page.waitForSelector('.sync-overlay', { timeout: 60000 });
  const txt = await B.page.locator('.sync-overlay').innerText();
  check(/deux appareils|two devices/.test(txt) && /15/.test(txt) && /20/.test(txt), 'B : fenêtre de conflit avec les deux versions', txt.replace(/\s+/g, ' ').slice(0, 160));
  await act(B.page, 'c-both');
  await B.page.waitForFunction(() => document.querySelectorAll('.chars .char').length === 2 || window.__sync.state.status === 'idle', null, { timeout: 30000 });
  await B.page.evaluate(() => window.__sync.syncAll());
  const keysB = await B.page.evaluate(() => Object.keys(localStorage).filter((k) => /^d2m\.save\.[^.]+$/.test(k)).length);
  check(keysB === 2, 'B : « garder les deux » : deux personnages, aucune perte', String(keysB));
  await A.page.evaluate(() => window.__sync.syncAll());
  const keysA = await A.page.evaluate(() => Object.keys(localStorage).filter((k) => /^d2m\.save\.[^.]+$/.test(k)).length);
  check(keysA === 2, 'A : reçoit aussi le deuxième personnage', String(keysA));

  // ---------- /api/ jamais en cache ----------
  const cached = await B.page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (r.url.includes('/api/')) out.push(r.url);
    return out;
  });
  check(cached.length === 0, '/api/ absent des caches du service worker');
  check(apiCalls > 5, 'l’API a bien été appelée', String(apiCalls));
  check(errors.length === 0, 'aucune erreur de page', errors.slice(0, 3).join(' | '));
} catch (e) {
  ok = false;
  console.log('✗ exception', e);
}
await browser.close();
process.exit(ok ? 0 : 1);
