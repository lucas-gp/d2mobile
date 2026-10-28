/**
 * Mercenaires dans le vrai client : Qual-Kehk à Harrogath ouvre le recrutement, embauche d'un
 * Garde du désert, barre de vie au HUD, arme d'hast donnée depuis l'inventaire, puis le
 * mercenaire suit en run et combat (planche chargée, aucune erreur).
 *   node tools/e2e/merc.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/merc/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'merc');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
await page.addInitScript(() => {
  localStorage.clear();
  // the checks read the French texts
  localStorage.setItem('d2m.lang', 'fr');
});
await page.goto(URL);
const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
await ready();

// Harrogath, niveau 20, de l'or ; on parle à Qual-Kehk
await page.evaluate(() => {
  window.__arpg.setLevel(20);
  const g = window.__arpg.game();
  g.character.gold = 500000;
  window.__arpg.town();
});
await ready();
await page.evaluate(() => {
  const w = window.__arpg.game().world;
  const o = w.objects.find((x) => x.ref === 'qual_kehk');
  window.__arpg.teleport(o.x - 1.2, o.y);
  w.input.interact = o.id;
});
// the NPC's dialog (D2 lines imported): its action « Mercenaires »
await page.waitForSelector('.npc-dialog button.primary, .panel', { timeout: 10000 }).catch(() => {});
await page.evaluate(() => document.querySelector('.npc-dialog button.primary')?.click());
await page.waitForSelector('.panel', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(400);
const panelText = await page.evaluate(() => document.querySelector('.panel')?.textContent ?? '');
check(
  panelText.includes('Qual-Kehk') && panelText.includes('Garde du désert') && panelText.includes('Barbare'),
  'Qual-Kehk : recrutement ouvert, les Barbares et les mercenaires des actes pas encore ouverts (lot 321)',
);
check(panelText.includes('Niveau'), 'actes verrouillés : niveau requis affiché');
await page.screenshot({ path: join(OUT, '1-recrutement.png') });

// embauche : Garde du désert, Offensif (Visée bénie)
const hired = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.panel .runcard')];
  const card = cards.find((c) => c.textContent.includes('Garde du désert'));
  const b = [...card.querySelectorAll('button')].find((x) => x.textContent === 'Offensif');
  b?.click();
  const m = window.__arpg.game().character.merc;
  return m ? `${m.type}/${m.variant}/${m.name}` : null;
});
check(hired?.startsWith('desert/blessed_aim'), 'Garde du désert (Offensif) recruté', hired ?? 'aucun');
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, '2-fiche.png') });

// une Pique donnée depuis l'inventaire
await page.evaluate(() => {
  window.__arpg.giveItem('pike', { forceQuality: 'magic', ilvl: 20 });
  // le panneau est déjà ouvert (Qual-Kehk) : on le redessine
  window.__arpg.app.panels.refresh();
});
await page.waitForTimeout(300);
const gave = await page.evaluate(() => {
  const c = window.__arpg.game().character;
  const idx = c.inventory.findIndex((x) => x?.base === 'pike');
  const cells = [...document.querySelectorAll('.panel .grid')][1]?.querySelectorAll('.cell');
  cells?.[idx]?.click();
  return idx;
});
await page.waitForTimeout(200);
await page.evaluate(() => [...document.querySelectorAll('.panel button')].find((b) => b.textContent === 'Donner au mercenaire')?.click());
await page.waitForTimeout(200);
const weapon = await page.evaluate(() => window.__arpg.game().character.merc?.equipment.mainhand?.base ?? null);
check(gave >= 0 && weapon === 'pike', 'arme d’hast donnée au mercenaire depuis le panneau', `${weapon}`);
await page.screenshot({ path: join(OUT, '3-equipe.png') });
await page.evaluate(() => window.__arpg.app.closePanels?.());
await page.keyboard.press('Escape').catch(() => {});

// en run : il suit et combat
await page.evaluate(() => {
  document.querySelector('.panel .close')?.click();
  window.__arpg.startRun('tristram', 0, 11);
});
await page.waitForFunction(() => window.__arpg.state().zone === 'tristram', null, { timeout: 30000 }).catch(() => {});
await ready();
await page.evaluate(() => {
  window.__arpg.bot(true);
  window.__arpg.god(true);
  window.__arpg.speed(4);
});
await page.waitForTimeout(8000);
await page.evaluate(() => window.__arpg.speed(0));
await page.waitForTimeout(400);
const st = await page.evaluate(() => {
  const w = window.__arpg.game().world;
  const r = window.__arpg.renderer();
  const m = w.monsters.find((x) => x.pet === 'merc' && !x.dead);
  const bar = document.querySelector('.bar.merc');
  return {
    merc: !!m,
    near: m ? Math.hypot(m.x - w.player.x, m.y - w.player.y) : -1,
    sheet: !!r.bank.get('merc_desert'),
    missing: r.missingSheetViews(w),
    bar: bar ? getComputedStyle(bar).display : 'absent',
    kills: w.stats.kills,
  };
});
await page.screenshot({ path: join(OUT, '4-en-run.png') });
check(st.merc && st.near < 20, 'le mercenaire suit en run', `à ${st.near.toFixed(1)} du joueur`);
check(st.sheet && st.missing === 0, 'planche du mercenaire chargée, aucun acteur invisible');
check(st.bar === 'block', 'barre de vie du mercenaire au HUD');
check(st.kills > 0, 'combat en cours', `${st.kills} tués`);
check(errors.length === 0, 'aucune erreur', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} ÉCHEC(S)` : 'MERCENAIRES DANS LE CLIENT OK');
process.exit(fails ? 1 : 0);
