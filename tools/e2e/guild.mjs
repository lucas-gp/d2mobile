// Coffre de guilde : lance le service sur un port éphémère + le serveur vite (proxy /guild-api), deux « joueurs » (deux contextes).
// A crée, B rejoint par code, A dépose, B voit et prend, A ne peut plus le prendre ; à 900x800 aucun débordement.
// Usage : node tools/e2e/guild.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createGuildServer } from '../../server/guild/index.mjs';
import { pickFirstMode } from './pick-mode.mjs';

const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
const dir = mkdtempSync(join(tmpdir(), 'guild-e2e-'));
const svc = createGuildServer({ dataFile: join(dir, 'guilds.json') });
const gport = await svc.listen(0, '127.0.0.1');
const vport = await freePort();
const vite = spawn('npx', ['vite', '--port', String(vport), '--strictPort', '--host', '127.0.0.1'], {
  env: { ...process.env, GUILD_API_URL: `http://127.0.0.1:${gport}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let up = false;
vite.stdout.on('data', (d) => {
  if (String(d).includes('Local')) up = true;
});
for (let i = 0; i < 120 && !up; i++) await new Promise((r) => setTimeout(r, 500));
const URL = `http://127.0.0.1:${vport}/`;
let bad = 0;
const check = (ok, label, extra = '') => {
  if (!ok) bad++;
  console.log(ok ? 'OK ' : 'BAD', label, extra);
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function player(nick) {
  const page = await (await b.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('ERR', nick, e.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(URL + '?testchar=1');
  await page.waitForSelector('.charselect.d2s', { timeout: 120000 });
  await pickFirstMode(page);
  await page.waitForSelector('.d2plate');
  await page.click('.d2plate:has-text("99")');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
  await page.waitForTimeout(800);
  return page;
}
const openGuild = async (p) => {
  await p.evaluate(() => window.__arpg.app.openPanel('close'));
  await p.evaluate(() => window.__arpg.app.openPanel('stash'));
  await p.waitForSelector('[data-testid="stash-top-guilde"]');
  await p.click('[data-testid="stash-top-guilde"]');
  await p.waitForTimeout(300);
};
const overflow = (p) =>
  p.evaluate(() => {
    const pn = document.querySelector('.panel');
    const r = pn.getBoundingClientRect();
    const body = pn.querySelector('.body');
    const small = [...pn.querySelectorAll('.guildtab button')].filter((x) => x.getBoundingClientRect().height < 40).length;
    return { inside: r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.top >= -1, scrollW: body.scrollWidth - body.clientWidth, small };
  });

try {
  const A = await player('A');
  const B = await player('B');
  // A : un objet de test dans le sac, puis création du coffre
  await A.evaluate(() => {
    const c = window.__arpg.app.game.character;
    c.inventory[3] = { uid: 'guild-e2e-1', base: 'ring', quality: 'rare', ilvl: 20, rareName: 'Anneau de test', sockets: 0, socketed: [], affixes: [] };
  });
  await openGuild(A);
  check((await A.locator('[data-testid="guild-create"]').count()) === 1, 'A : état non connecté (formulaire)');
  await A.fill('[data-testid="guild-name"]', 'Les Amis');
  await A.fill('[data-testid="guild-nick"]', 'Alice');
  await A.click('[data-testid="guild-create"]');
  await A.waitForSelector('[data-testid="guild-leave"]', { timeout: 10000 });
  if ((await A.textContent('[data-testid="guild-code"]')).includes('•')) await A.click('[data-testid="guild-code-toggle"]');
  const code = (await A.textContent('[data-testid="guild-code"]')).trim();
  check(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code), 'A : code d’invitation affiché', code);
  let o = await overflow(A);
  check(o.inside && o.scrollW <= 1 && o.small === 0, 'A : 900x800 sans débordement, boutons >= 40 px', JSON.stringify(o));
  await A.screenshot({ path: '/tmp/guild-A-created.png' });

  // B rejoint
  await openGuild(B);
  await B.fill('[data-testid="guild-code"]', code);
  // sans pseudo : message visible dans le panneau (avant, le bouton ne faisait rien)
  await B.click('[data-testid="guild-join"]');
  await B.waitForSelector('[data-testid="guild-error"]', { timeout: 5000 });
  // l'invité ne renseigne que le bloc « Rejoindre » (il n'a pas à toucher au bloc « Créer »)
  await B.fill('[data-testid="guild-jnick"]', 'Bob');
  await B.click('[data-testid="guild-join"]');
  await B.waitForSelector('[data-testid="guild-leave"]', { timeout: 10000 });
  check((await B.textContent('[data-testid="guild-members"]')).includes('Alice'), 'B : rejoint, voit Alice');

  // A dépose : sélection d'un objet du sac puis « Déposer »
  await A.click('[data-inv="3"]');
  await A.waitForTimeout(200);
  const label = await A.textContent('[data-testid="guild-deposit"]');
  check(label.includes('Anneau de test'), 'A : bouton Déposer propose l’objet', label);
  await A.click('[data-testid="guild-deposit"]');
  await A.waitForSelector('[data-testid="guild-item"]', { timeout: 10000 }).catch(async () => console.log('  dépôt : pas d’objet ;', await A.textContent('.guildtab').then((t) => t.slice(0, 300))));
  const left = await A.evaluate(() => window.__arpg.app.game.character.inventory.filter((x) => x && x.uid === 'guild-e2e-1').length);
  check(left === 0, 'A : objet retiré du sac après le dépôt');

  // B actualise, voit et prend ; puis A actualise et ne le voit plus
  await B.click('[data-testid="guild-refresh"]');
  await B.waitForSelector('[data-testid="guild-item"]', { timeout: 10000 });
  o = await overflow(B);
  check(o.inside && o.scrollW <= 1 && o.small === 0, 'B : liste sans débordement', JSON.stringify(o));
  await B.screenshot({ path: '/tmp/guild-B-list.png' });
  // A garde une copie de la liste affichée : retrait par B d'abord
  await B.click('[data-testid="guild-take"]');
  await B.waitForFunction(() => !document.querySelector('[data-testid="guild-item"]'), null, { timeout: 10000 });
  const got = await B.evaluate(() => window.__arpg.app.game.character.inventory.filter((x) => x && x.uid === 'guild-e2e-1').length);
  check(got === 1, 'B : objet reçu dans le sac (une seule fois)');
  // A tente de le prendre alors que sa liste est périmée
  await A.click('[data-testid="guild-take"]');
  await A.waitForTimeout(1500);
  const err = await A.locator('[data-testid="guild-error"]').count();
  const aGot = await A.evaluate(() => window.__arpg.app.game.character.inventory.filter((x) => x && x.uid === 'guild-e2e-1').length);
  check(aGot === 0, 'A : n’obtient pas l’objet (déjà pris)', `erreur affichée=${err}`);
  await A.screenshot({ path: '/tmp/guild-A-gone.png' });
  const log = await B.textContent('[data-testid="guild-log"]');
  check(/déposé/.test(log) && /pris/.test(log), 'journal : dépôt et retrait', log.slice(0, 200));

  // B quitte avec confirmation
  await B.click('[data-testid="guild-leave"]');
  await B.click('[data-testid="guild-leave-ok"]');
  await B.waitForSelector('[data-testid="guild-create"]', { timeout: 10000 });
  check(true, 'B : a quitté le coffre');
} catch (e) {
  bad++;
  console.log('ECHEC', e.message);
} finally {
  await b.close();
  vite.kill('SIGTERM');
  await svc.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(bad ? `${bad} cas en échec` : 'tout est OK');
process.exit(bad ? 1 : 0);
