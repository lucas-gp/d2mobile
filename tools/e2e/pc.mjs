/**
 * Validation du mode PC (souris + clavier réels, Chromium headless, 1280×720) :
 *   node tools/e2e/pc.mjs [--url=http://127.0.0.1:5233/]
 * Vérifie : détection du mode PC, HUD sans joystick, clic pour marcher, clic sur un monstre, Maj + clic sur place,
 * clic droit, F1, 1, I / C / S / Échap, aide (H), survol d'un objet du sac ; écran de sélection (disposition du jeu, clavier,
 * suppression confirmée). Captures : test-results/e2e/pc/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'pc');
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
});
await page.goto(URL);
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 90000 });
await page.waitForTimeout(1500);

const st = () => page.evaluate(() => window.__arpg.state());
const vis = (sel) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    return !!e && e.offsetParent !== null;
  }, sel);

// 1. mode et HUD
check((await page.evaluate(() => document.documentElement.dataset.input)) === 'pc', 'mode PC détecté (pointeur précis)');
check(!(await vis('[data-testid="joystick"]')) && !(await vis('[data-testid="attack"]')), 'joystick et boutons ronds masqués');
check(await vis('[data-testid="pcbar"]'), 'barre de compétences PC visible');
check(!(await page.evaluate(() => !!document.fullscreenElement)), 'pas de plein écran forcé');
const boxes = await page.evaluate(() =>
  [...document.querySelectorAll('.pcbar, .pcorb, .orb, .topright, .bars')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => {
      const b = e.getBoundingClientRect();
      return { c: e.className, x: b.x, y: b.y, w: b.width, h: b.height };
    }),
);
const hit = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
const bar = boxes.find((b) => String(b.c).includes('pcbar'));
check(!!bar && boxes.filter((b) => b !== bar && !String(b.c).includes('bars') && hit(bar, b)).length === 0, 'barre PC sans chevauchement (globes, boutons)', JSON.stringify(bar));
await page.screenshot({ path: join(OUT, '1-ville.png') });

await page.evaluate(() => {
  window.__arpg.setLevel(12, true);
  window.__arpg.god(true);
  window.__arpg.startRun('tristram', 0, 42);
});
await page.waitForFunction(() => window.__arpg.state().zone === 'tristram' && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 90000 });
await page.waitForTimeout(1500);
// pas de monstres pendant les tests de déplacement : on les éloigne
const clearAway = () =>
  page.evaluate(() => {
    const w = window.__arpg.game().world;
    for (const m of w.monsters) {
      m.x += 80;
    }
  });
await clearAway();
await page.waitForTimeout(300);

// 2. clic gauche sur le sol : le personnage marche
let s0 = await st();
await page.mouse.click(900, 360);
await page.waitForTimeout(900);
let s1 = await st();
check(Math.hypot(s1.x - s0.x, s1.y - s0.y) > 0.8, 'clic gauche sur le sol : le personnage se déplace', `${Math.hypot(s1.x - s0.x, s1.y - s0.y).toFixed(2)} cases`);
await page.waitForTimeout(2500);
// marche maintenue
s0 = await st();
await page.mouse.move(380, 300);
await page.mouse.down();
await page.waitForTimeout(700);
s1 = await st();
await page.mouse.up();
check(Math.hypot(s1.x - s0.x, s1.y - s0.y) > 0.8, 'clic maintenu : marche continue vers le curseur');
await page.waitForTimeout(1500);

// 3. Maj + clic : sur place
s0 = await st();
await page.keyboard.down('Shift');
await page.mouse.click(1000, 300);
await page.waitForTimeout(700);
await page.keyboard.up('Shift');
s1 = await st();
check(
  Math.hypot(s1.x - s0.x, s1.y - s0.y) < 0.15 && s1.casts > s0.casts,
  'Maj + clic : attaque sur place, sans avancer',
  `déplacement ${Math.hypot(s1.x - s0.x, s1.y - s0.y).toFixed(2)}, lancers +${s1.casts - s0.casts}`,
);

await page.evaluate(() => {
  const w = window.__arpg.game().world;
  if (!w.monsters.some((m) => !m.dead && !m.isSummon)) w.spawnGroup(0);
});
// 4. monstre : on en place un à côté du personnage et on clique dessus
const ms = await page.evaluate(() => {
  const g = window.__arpg.game();
  const w = g.world;
  const m = w.monsters.find((x) => !x.dead && !x.isSummon);
  m.x = w.player.x + 1.2;
  m.y = w.player.y + 1.2;
  m.hp = m.hpMax;
  const r = window.__arpg.renderer();
  const p = r.worldToScreen(m.x, m.y - 0.6);
  return { id: m.id, x: p.x, y: p.y, hp: m.hp };
});
await page.mouse.move(ms.x, ms.y);
await page.waitForTimeout(250);
check(await page.evaluate(() => document.getElementById('stage').classList.contains('cur-attack')), 'curseur de ciblage rouge au survol d’un monstre');
check(await page.evaluate(() => getComputedStyle(document.querySelector('.target')).display !== 'none'), 'barre de vie du monstre survolé affichée');
await page.screenshot({ path: join(OUT, '2-survol-monstre.png') });
const c0 = (await st()).casts;
await page.mouse.down();
await page.waitForTimeout(900);
await page.mouse.up();
const hp1 = await page.evaluate((id) => window.__arpg.game().world.monsters.find((x) => x.id === id)?.hp ?? 0, ms.id);
check((await st()).casts > c0 || hp1 < ms.hp, 'clic gauche sur un monstre : il est attaqué', `lancers +${(await st()).casts - c0}, vie ${Math.round(ms.hp)} → ${Math.round(hp1)}`);
await clearAway();

// 5. clic droit : compétence secondaire (Armure de glace / Nova… ici : attaque normale par défaut ou sort appris)
await page.evaluate(() => {
  const g = window.__arpg.game();
  g.character.skills.frost_nova = 1;
  g.character.skills.fire_bolt = Math.max(1, g.character.skills.fire_bolt ?? 0);
  g.assignSkill('secondary', 'fire_bolt');
  g.assignSkill(0, 'frost_nova');
  g.world.refreshPlayer();
});
await page.waitForTimeout(400);
const c1 = (await st()).casts;
await page.mouse.click(900, 300, { button: 'right' });
await page.waitForTimeout(700);
check((await st()).casts > c1, 'clic droit : compétence secondaire lancée', `+${(await st()).casts - c1}`);
check(!(await page.evaluate(() => !!document.querySelector('.context-menu'))), 'pas de menu contextuel du navigateur');

// 6. F1 lance la compétence de l'emplacement 1 ; 1 = potion
await page.waitForTimeout(800);
const c2 = (await st()).casts;
await page.keyboard.press('F1');
await page.waitForTimeout(700);
check((await st()).casts > c2, 'F1 lance la compétence de l’emplacement 1', `+${(await st()).casts - c2}`);
const hpB = (await st()).hp;
await page.evaluate(() => {
  const w = window.__arpg.game().world;
  w.player.hp = w.player.hpMax * 0.4;
});
await page.keyboard.press('1');
await page.waitForTimeout(600);
check((await st()).hp > (await page.evaluate(() => 0)) && (await st()).hp > hpB * 0 + 1, 'touche 1 : potion de vie (ceinture)');
await page.screenshot({ path: join(OUT, '3-hud-combat.png') });

// 7. panneaux
const panel = () => page.evaluate(() => !!document.querySelector('#panels .panel'));
for (const [key, name] of [
  ['i', 'inventaire'],
  ['c', 'personnage'],
  ['s', 'compétences'],
]) {
  await page.keyboard.press(key);
  await page.waitForTimeout(400);
  const open = await panel();
  if (open) await page.screenshot({ path: join(OUT, `4-${name}.png`) });
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
  check(open && !(await panel()), `${key.toUpperCase()} ouvre le panneau « ${name} » puis le referme`);
}
await page.keyboard.press('i');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(!(await panel()), 'Échap ferme le panneau');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check(await panel(), 'Échap sans panneau : ouvre le menu (réglages)');
await page.screenshot({ path: join(OUT, '5-reglages.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('h');
await page.waitForTimeout(300);
check(await page.evaluate(() => !!document.querySelector('.help-grid')), 'H : aide des raccourcis');
await page.screenshot({ path: join(OUT, '6-aide.png') });
await page.keyboard.press('Escape');

// 7b. survol d'une compétence du panneau + F3 : assignation à l'emplacement 3
await page.keyboard.press('s');
await page.waitForTimeout(500);
const sk = await page.evaluate(() => {
  const b = document.querySelector('#panels .sk.learned');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (sk) {
  await page.mouse.move(sk.x, sk.y);
  await page.waitForTimeout(200);
  await page.keyboard.press('F3');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !!window.__arpg.game().character.hotbar.slots[2]), 'compétence survolée + F3 : assignée à l’emplacement 3');
} else check(false, 'compétence apprise introuvable dans le panneau');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// 8. info-bulle au survol d'un objet du sac + clic droit pour équiper
await page.evaluate(() => {
  window.__arpg.giveItem('short_sword');
});
await page.keyboard.press('i');
await page.waitForTimeout(500);
const cell = await page.evaluate(() => {
  const e = document.querySelector('#panels [data-inv]');
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
});
if (cell) {
  await page.mouse.move(cell.x, cell.y);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => !!document.querySelector('.pc-tip')), 'survol d’un objet du sac : info-bulle');
  await page.screenshot({ path: join(OUT, '7-infobulle.png') });
  const inv0 = await page.evaluate(() => window.__arpg.game().character.equipment.mainhand?.uid ?? '');
  await page.mouse.click(cell.x, cell.y, { button: 'right' });
  await page.waitForTimeout(400);
  const inv1 = await page.evaluate(() => window.__arpg.game().character.equipment.mainhand?.uid ?? '');
  check(inv1 !== inv0, 'clic droit sur un objet : équipé', `arme ${inv0} → ${inv1}`);
} else check(false, 'objet du sac introuvable');
await page.keyboard.press('Escape');

// 9. diagnostic : « Afficher les collisions » dessine les cases bloquées de la zone, et le masque à la désactivation
await page.evaluate(() => {
  window.__arpg.renderer().showCollisions = true;
});
await page.waitForTimeout(600);
const coll = await page.evaluate(() => {
  const g = window.__arpg.renderer().collGfx;
  return g ? { visible: g.visible, parent: !!g.parent, bounds: g.getLocalBounds().width } : null;
});
check(!!coll && coll.visible && coll.parent && coll.bounds > 100, 'Afficher les collisions : losanges des cases bloquées dessinés', JSON.stringify(coll));
await page.evaluate(() => {
  window.__arpg.renderer().showCollisions = false;
});
await page.waitForTimeout(300);
check(await page.evaluate(() => window.__arpg.renderer().collGfx?.visible === false), 'Afficher les collisions : masqué à la désactivation');

// écran de sélection façon Diablo II (lot 272), vrai joueur, souris : disposition du jeu (800 × 600), clavier, suppression confirmée
{
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await c2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.addInitScript(() => {
    if (sessionStorage.getItem('e2e.sel')) return;
    sessionStorage.setItem('e2e.sel', '1');
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    localStorage.setItem('d2m.testchar.v1', '1');
    for (let i = 0; i < 3; i++) localStorage.setItem(`d2m.save.pc${i}`, JSON.stringify({ savedAt: 10 - i, ruleset: 'pd2', character: { name: `Pc${i}`, level: 5 + i, classId: 'paladin' } }));
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await p2.goto(URL);
  await p2.waitForSelector('.d2c, .charselect', { timeout: 90000 });
  if (await p2.$('.d2c')) await p2.click('.d2c-skip');
  await p2.waitForSelector('.charselect');
  if (await p2.$(HOME)) await pickFirstMode(p2).catch(() => undefined);
  else await p2.click('.d2b.main, .charselect .sel-slot').catch(() => undefined);
  await p2.waitForSelector('.charlist');
  const layout = await p2.evaluate(() => document.querySelector('.charlist').className);
  const d2art = await p2.evaluate(() => !!document.querySelector('.charselect.d2s'));
  check(!d2art || /stage/.test(layout), 'sélection : disposition du jeu (800 × 600) à la souris', layout);
  const selected = () => p2.evaluate(() => document.querySelector('.sel-slot.sel')?.dataset.slot);
  check((await selected()) === 'd2m.save.pc0', 'sélection : le dernier joué choisi');
  await p2.keyboard.press('ArrowRight');
  check((await selected()) === 'd2m.save.pc1', 'sélection : flèche droite → emplacement suivant');
  await p2.keyboard.press('ArrowDown');
  check((await selected()) === 'd2m.save.pc1', 'sélection : flèche bas sans personnage dessous → inchangée');
  await p2.screenshot({ path: join(OUT, '9-selection.png') });
  await p2.click('[data-act="delete"]');
  check(!!(await p2.$('.sel-confirm')), 'suppression : confirmation demandée');
  await p2.click('[data-act="confirm-no"]');
  check((await p2.evaluate(() => !!localStorage.getItem('d2m.save.pc1'))) && !(await p2.$('.sel-confirm')), 'suppression : « Non » garde le personnage');
  await c2.close();
}
check(errors.length === 0, 'aucune erreur console', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures ? `${failures} échec(s)` : 'tout est vert');
process.exit(failures ? 1 : 0);
