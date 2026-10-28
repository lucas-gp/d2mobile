/**
 * Lot 171 : qualité haute par défaut, préparation à l'avance dans l'ordre de leveling, récapitulatif « Graphismes & fichiers Diablo II »
 * (Réglages › Avancé) et ajout d'un fichier MPQ sans tout resélectionner. Vrais MPQ ($D2_PRIVATE_DIR/in, audio-in/d2sfx.mpq, patch/Patch_D2.mpq).
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-recap.mjs [--shots=<dossier>] [--skip-patch]
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const SFX = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'audio-in', 'd2sfx.mpq');
const PATCH = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'patch', 'Patch_D2.mpq');
const SHOTS = args.get('shots');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const mpqs = readdirSync(IN)
  .filter((f) => /^d2(char|data|exp)\.mpq$/i.test(f))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 840, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  try {
    if (!localStorage.getItem('d2m.lang')) localStorage.setItem('d2m.lang', 'fr');
  } catch {}
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, `${n}.png`) });
page.on('dialog', (d) => void d.accept());

await page.goto(URL);
await page.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
  for (const k of await caches.keys()) await caches.delete(k);
  try {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  } catch {}
});
await page.goto(URL);
await page.waitForSelector('.d2c', { timeout: 60000 });
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .btn.primary')]);
await fc.setFiles(mpqs);
await page.waitForSelector('.charselect.d2s', { timeout: 600000 });
await pickFirstMode(page, { tap: true });
await page.waitForTimeout(1200);
await page.fill('.d2input', 'Recap');
await page.tap('.d2b.ok');
await page.waitForFunction(() => window.__arpg, null, { timeout: 600000 });
await page.waitForFunction(() => !document.querySelector('.loading') && window.__d2local.manifestJson().sheets && Object.keys(window.__d2local.manifestJson().sheets).length > 5, null, {
  timeout: 300000,
});
await page.waitForTimeout(2000);

/* ---- 1. qualité haute par défaut, même sur un appareil tactile (840×360, DPR 3) ---- */
const tiers = await page.evaluate(() => {
  const L = window.__d2local;
  const m = L.manifestJson();
  const ids = [...Object.keys(m.sheets), ...Object.keys(m.tiles)];
  return {
    n: ids.length,
    lo: ids.filter((id) => {
      const t = L.tiersOf(id);
      return t.length === 1 && t[0] === 'lo';
    }).length,
    hi: ids.filter((id) => L.tiersOf(id).includes('hi')).length,
    setting: localStorage.getItem('d2m.d2localTier'),
    coarse: matchMedia('(pointer: coarse)').matches,
  };
});
console.log('   ' + JSON.stringify(tiers));
check(tiers.coarse && tiers.n > 5, 'appareil tactile, planches générées', `${tiers.n}`);
check(tiers.lo === 0 && tiers.hi === tiers.n, 'qualité Auto = haute : aucune planche en économe seule', `hi ${tiers.hi}/${tiers.n}, lo seul ${tiers.lo}`);

/* ---- 2. Réglages : récapitulatif et fichiers ---- */
const openSettings = async () => {
  await page.evaluate(() => {
    localStorage.setItem('d2m.settings.cat', 'advanced');
    window.__arpg.app.panels.hide();
    window.__arpg.app.panels.show('settings');
  });
  await page.waitForSelector('.d2l-recap', { timeout: 30000 });
};
await openSettings();
await page.waitForFunction(() => !/Calcul de la répartition/.test(document.querySelector('.d2l-recap')?.innerText ?? ''), null, { timeout: 120000 });
const labels = await page.evaluate(() => [...document.querySelectorAll('.d2l-recap .d2l-row')].map((r) => r.querySelector('span')?.textContent ?? ''));
console.log('   ' + labels.join(' | ').slice(0, 600));
for (const want of ['Interface', 'Icônes et textes', 'Personnage — Sorcière', 'Monstres et personnages — Acte I', 'Cartes — Acte I', 'Effets', 'Sons et musique'])
  check(labels.includes(want), `ligne « ${want} »`);
check(labels.filter((l) => /^Personnage — /.test(l)).length === 7, 'sept classes');
const qual = await page.evaluate(() => [...document.querySelectorAll('.d2l-recap .tabs .btn')].map((b) => b.textContent + (b.classList.contains('sel') ? '*' : '')));
check(qual.includes('Auto (haute)*'), 'qualité : « Auto (haute) » sélectionné', qual.join(' '));
const rec = await page.evaluate(() => document.querySelector('.d2l-recap').innerText);
check(/Généré : .* reste ≈ .* \(qualité haute\)/.test(rec), 'total généré / restant / temps estimé en haute qualité');
const files = await page.evaluate(() => [...document.querySelectorAll('.d2l-files .d2l-row')].map((r) => r.innerText.replace(/\n/g, ' | ')));
console.log('   ' + files.map((f) => f.slice(0, 70)).join('\n   '));
for (const n of ['d2data.mpq', 'd2exp.mpq', 'd2char.mpq'])
  check(
    files.some((f) => f.startsWith(n) && /✓ ajouté/.test(f) && /obligatoire/.test(f)),
    `${n} : obligatoire, ajouté`,
  );
check(
  files.some((f) => f.startsWith('d2sfx.mpq') && /non ajouté/.test(f) && /effets sonores/.test(f)),
  'd2sfx.mpq : non ajouté, « effets sonores »',
);
check(
  files.some((f) => f.startsWith('d2video.mpq') && /non utilisées/.test(f)),
  'd2video.mpq : indiqué comme non utilisé',
);
const fit = await page.evaluate(() => ({
  sw: document.documentElement.scrollWidth,
  iw: innerWidth,
  small: [...document.querySelectorAll('.d2l-recap .btn, .d2l-files .btn')].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.height > 0 && r.height < 30;
  }).length,
}));
check(fit.sw <= fit.iw + 1, 'pas de défilement horizontal en 840×360', JSON.stringify(fit));
check(fit.small === 0, 'boutons assez hauts pour le doigt (≥ 30 px)', `${fit.small} trop petits`);
await page.evaluate(() => document.querySelector('.d2l-recap').scrollIntoView());
await shot('1-recap-840x360');
await page.setViewportSize({ width: 900, height: 800 });
await page.waitForTimeout(500);
await shot('2-recap-900x800');
const fit2 = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
check(fit2, 'pas de défilement horizontal en 900×800');
await page.setViewportSize({ width: 840, height: 360 });

if (!args.has('lang-only')) {
  /* ---- 3. préparation à l'avance dans l'ordre de leveling ---- */
  const prog = () =>
    page.evaluate(() => {
      const t = document.querySelector('.d2l-recap')?.innerText ?? '';
      const m = /Zones préparées : (\d+)\/(\d+)/.exec(t);
      return m ? [Number(m[1]), Number(m[2])] : null;
    });
  const p0 = await prog();
  check(!!p0 && p0[1] > 50, 'préparation en arrière-plan active, plan de zones affiché', JSON.stringify(p0));
  const t0 = Date.now();
  let p1 = p0;
  while (Date.now() - t0 < Number(args.get('pregen') ?? 420000) && (!p1 || p1[0] < 1)) {
    await page.waitForTimeout(8000);
    await openSettings();
    p1 = await prog();
  }
  check(!!p1 && p1[0] >= 1, 'au moins une zone (Tristram) préparée seule, sans action', `${JSON.stringify(p1)} en ${Math.round((Date.now() - t0) / 1000)} s`);
  const doneKey = await page.evaluate(() => JSON.parse(localStorage.getItem('d2m.d2pregen.done') ?? 'null'));
  check(doneKey?.tier === 'hi' && doneKey.done[0] === 'tristram', 'zone faite mémorisée, Tristram en premier', JSON.stringify(doneKey)?.slice(0, 80));
  // une zone « préparée » a TOUS ses assets prêts : sa carte (palier courant) est bien générée, jamais marquée à vide
  const sample = async () => {
    await openSettings();
    await page.waitForTimeout(1200);
    return page.evaluate(() => {
      const t = document.querySelector('.d2l-recap')?.innerText ?? '';
      const mb = /Généré : ([\d.]+) (MB|GB)/.exec(t);
      const z = /Zones préparées : (\d+)\/(\d+)/.exec(t);
      const L = window.__d2local;
      const done = JSON.parse(localStorage.getItem('d2m.d2pregen.done') ?? 'null')?.done ?? [];
      const maps = done.filter((id) => L.catalog.maps.includes(id));
      return {
        mb: mb ? Number(mb[1]) * (mb[2] === 'GB' ? 1000 : 1) : 0,
        zones: z ? Number(z[1]) : 0,
        done: done.length,
        mapsDone: maps.length,
        mapsReady: maps.filter((id) => L.assetReady('map:' + id, 'hi')).length,
        pause: /En pause : ([^.]*)\./.exec(t)?.[1] ?? '',
        manifestMaps: Object.keys(L.manifestJson().maps ?? {}).length,
      };
    });
  };
  const a0 = await sample();
  await page.waitForTimeout(Number(args.get('grow') ?? 150000));
  const a1 = await sample();
  console.log('   ' + JSON.stringify(a0) + ' -> ' + JSON.stringify(a1));
  check(a1.done > a0.done && a1.zones === a1.done, 'le compteur de zones augmente réellement et affiche le même nombre que la liste faite', `${a0.done} -> ${a1.done}`);
  check(a1.mb > a0.mb, 'les Mo générés affichés augmentent pendant la préparation (rafraîchis sans rouvrir)', `${a0.mb} -> ${a1.mb} MB`);
  check(a1.mapsDone > 0 && a1.mapsReady === a1.mapsDone, 'chaque zone préparée a sa carte réellement générée', `${a1.mapsReady}/${a1.mapsDone}`);
  check(a1.manifestMaps > a0.manifestMaps || a1.mapsDone === 0, 'des cartes de campagne sont générées (plus seulement les cartes hors campagne)', `${a0.manifestMaps} -> ${a1.manifestMaps}`);
  // reprise après rechargement : la liste faite est conservée
  await page.reload();
  await page.waitForSelector('.charselect.d2s', { timeout: 300000 });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('d2m.d2pregen.done') ?? 'null')?.done?.length ?? 0);
  check(kept >= 1, 'la progression survit au rechargement', `${kept}`);
  await pickFirstMode(page, { tap: true });
  await page.waitForTimeout(1200);
  await page.tap('.d2b.ok');
  await page.waitForFunction(() => window.__arpg, null, { timeout: 600000 });
  await page.waitForTimeout(2000);

  /* ---- 4. annulable, générer / effacer par catégorie ---- */
  await openSettings();
  await page.waitForFunction(() => !/Calcul de la répartition/.test(document.querySelector('.d2l-recap')?.innerText ?? ''), null, { timeout: 120000 });
  await page.tap('.d2l-recap .statrow:has-text("Préparer les zones suivantes") .btn');
  await page.waitForFunction(
    () => /Désactivée/.test(document.querySelector('.d2l-recap .statrow:nth-of-type(2) .btn')?.textContent ?? '') || /Désactivée/.test(document.querySelector('.d2l-recap')?.innerText ?? ''),
  );
  check(await page.evaluate(() => localStorage.getItem('d2m.d2pregen') === 'off'), 'préparation à l’avance désactivable (Réglages)');
  await page.tap('.d2l-recap .statrow:has-text("Préparer les zones suivantes") .btn');
  check(await page.evaluate(() => localStorage.getItem('d2m.d2pregen') === null), 'et réactivable');
  // effacer « Effets » puis le régénérer
  const fxRow = async () =>
    page.evaluate(() => {
      const r = [...document.querySelectorAll('.d2l-recap .d2l-row')].find((x) => x.querySelector('span')?.textContent === 'Effets');
      return r ? /(\d+)\/(\d+)/.exec(r.innerText)?.slice(1).map(Number) : null;
    });
  await page.evaluate(() => {
    const L = window.__d2local;
    for (const id of L.catalog.fx.slice(0, 3)) void L.requestAsset(id, 'hi', 5);
  });
  await page.waitForFunction(() => window.__d2local.catalog.fx.slice(0, 3).every((id) => window.__d2local.isReady(id, 'hi')), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const f0 = await fxRow();
  check(!!f0 && f0[0] >= 3, 'ligne Effets : éléments générés comptés', JSON.stringify(f0));
  await page.tap('.d2l-recap .d2l-row:has(span:text-is("Effets")) .btn.danger');
  await page.waitForFunction(() => window.__d2local.catalog.fx.slice(0, 3).every((id) => !window.__d2local.isReady(id, 'hi') && !window.__d2local.isReady(id, 'lo')), null, { timeout: 30000 });
  check(true, 'Effacer : les effets sont effacés (manifeste et cache)');
  const keys = await page.evaluate(async () => {
    const c = await caches.open('d2m-d2-local');
    return (await c.keys()).filter((r) => /\/(hi|lo)\/fx_/.test(r.url)).length;
  });
  console.log(`   fichiers fx restants dans le cache : ${keys}`);
  await page.waitForTimeout(1500);
  await page.tap('.d2l-recap .d2l-row:has(span:text-is("Effets")) .btn:has-text("Générer maintenant")');
  await page.waitForFunction(() => window.__d2local.catalog.fx.slice(0, 3).every((id) => window.__d2local.isReady(id, 'hi')), null, { timeout: 300000 });
  check(true, 'Générer maintenant : les effets reviennent');

  /* ---- 5. ajouter un fichier sans tout resélectionner ---- */
  if (existsSync(SFX)) {
    await openSettings();
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2l-files .d2l-row:has-text("d2sfx.mpq") .btn')]);
    await fc2.setFiles([SFX]);
    await page.waitForFunction(() => /d2sfx\.mpq[\s\S]{0,40}✓ ajouté/.test(document.querySelector('.d2l-files')?.innerText ?? ''), null, { timeout: 300000 });
    check(true, 'd2sfx.mpq ajouté seul : statut « ✓ ajouté »');
    const still = await page.evaluate(() => [...document.querySelectorAll('.d2l-files .d2l-row')].filter((r) => /obligatoire/.test(r.innerText)).every((r) => /✓ ajouté/.test(r.innerText)));
    check(still, 'les trois archives obligatoires sont toujours là');
    const sfx = await page.evaluate(() => window.__d2local.status.audio.names);
    check(sfx.includes('d2sfx.mpq'), 'le service audio connaît d2sfx.mpq', sfx.join(','));
  }
  if (existsSync(PATCH) && !args.has('skip-patch')) {
    const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2l-files .d2l-row:has-text("Patch_D2.mpq") .btn')]);
    await fc3.setFiles([PATCH]);
    await page.waitForFunction(() => /Patch_D2\.mpq[\s\S]{0,40}✓ ajouté/.test(document.querySelector('.d2l-files')?.innerText ?? ''), null, { timeout: 300000 });
    check(true, 'Patch_D2.mpq ajouté seul : statut « ✓ ajouté »');
    const names = await page.evaluate(() => window.__d2local.fileInfo().map((f) => f.name));
    check(
      ['d2char.mpq', 'd2data.mpq', 'd2exp.mpq', 'Patch_D2.mpq'].every((n) => names.includes(n)),
      'les quatre archives sont dans le pool',
      names.join(','),
    );
    // copie OPFS : le fichier ajouté est copié et vérifié, les autres ne sont pas recopiés
    const listOpfs = () =>
      page.evaluate(async () => {
        const r = await navigator.storage.getDirectory();
        const d = await r.getDirectoryHandle('d2m-d2').catch(() => null);
        if (!d) return null;
        const out = [];
        for await (const [n] of d.entries()) out.push(n);
        return { out, copying: !!window.__d2local.status.copy };
      });
    for (let i = 0; i < 90; i++) {
      const l = await listOpfs();
      if (l?.out.includes('Patch_D2.mpq') && !l.copying) break;
      await page.waitForTimeout(2000);
    }
    const opfs = await page.evaluate(async () => {
      const r = await navigator.storage.getDirectory();
      const d = await r.getDirectoryHandle('d2m-d2').catch(() => null);
      if (!d) return null;
      const out = [];
      for await (const [n] of d.entries()) out.push(n);
      return out;
    });
    console.log('   OPFS : ' + JSON.stringify(opfs));
    const integ = await page.evaluate(() => window.__d2local.status.integrity.state);
    check(integ === 'verified' || integ === 'unverified', 'intégrité de la copie connue', integ);
    check(!!opfs && ['d2char.mpq', 'd2data.mpq', 'd2exp.mpq', 'Patch_D2.mpq'].every((n) => opfs.includes(n)), 'copie OPFS : les quatre archives y sont');
  }
}

/* ---- 6. anglais : aucune chaîne française restée dans le menu ---- */
await page.evaluate(() => localStorage.setItem('d2m.lang', 'en'));
await page.reload();
await page.waitForSelector('.charselect.d2s', { timeout: 300000 });
await pickFirstMode(page, { tap: true });
await page.waitForTimeout(1200);
await page.tap('.d2b.ok');
await page.waitForFunction(() => window.__arpg, null, { timeout: 600000 });
await page.waitForTimeout(2500);
await openSettings();
await page.waitForFunction(() => !/Working out|Calcul/.test(document.querySelector('.d2l-recap')?.innerText ?? ''), null, { timeout: 180000 });
const fr = await page.evaluate(() => {
  const out = new Set();
  const walker = document.createTreeWalker(document.querySelector('.d2l-sec'), NodeFilter.SHOW_TEXT);
  const FR = /[éèêàâùûôîçœ]|\b(les|des|du|dans|pour|est|sont|avec|fichiers|générer|effacer|reste|ajouter|manquant|requis|facultatif)\b/i;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim();
    if (t.length > 1 && FR.test(t)) out.add(t.slice(0, 120));
  }
  return [...out];
});
console.log('   chaînes suspectes : ' + JSON.stringify(fr));
check(fr.length === 0, 'menu entièrement traduit en anglais', `${fr.length} chaîne(s) française(s)`);
check(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} échec(s)` : '\nOK');
process.exit(fails ? 1 : 0);
