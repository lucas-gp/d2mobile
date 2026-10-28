/**
 * Musique en Web Audio pur : aucun élément média (pas de carte « lecteur » Android, pas de prise du focus audio),
 * navigator.mediaSession inchangé, musique qui joue (AudioContext « running », source en boucle), volume 0 = rien de décodé.
 *   node tools/e2e/music-webaudio.mjs [--url=http://127.0.0.1:5233/]
 * Non vérifiable ici : le focus audio et la notification Android réels (à tester sur l'appareil).
 */
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';
const URL = (process.argv.find((a) => a.startsWith('--url=')) ?? `--url=${process.env.E2E_URL ?? 'http://127.0.0.1:5233/'}`).slice(6);
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  const t = (window.__t = { mediaPlay: 0, audioNew: 0, mediaSrc: 0, decodes: 0, decodeBytes: 0, loopStarts: 0, ctxs: [], msMeta: 0 });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    t.mediaPlay++;
    return play.apply(this, arguments);
  };
  const A = window.Audio;
  window.Audio = function () {
    t.audioNew++;
    return new A(...arguments);
  };
  const cm = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function () {
    t.mediaSrc++;
    return cm.apply(this, arguments);
  };
  const dd = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (buf) {
    t.decodes++;
    t.decodeBytes += buf.byteLength;
    if (buf.byteLength > 200000) (t.big ??= []).push(buf.byteLength);
    return dd.apply(this, arguments);
  };
  const st = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function () {
    if (this.loop && this.buffer && this.buffer.duration > 20) t.loopStarts++;
    return st.apply(this, arguments);
  };
  const AC = window.AudioContext;
  window.AudioContext = function () {
    const c = new AC(...arguments);
    t.ctxs.push(c);
    return c;
  };
  window.AudioContext.prototype = AC.prototype;
  if (navigator.mediaSession) {
    const d = Object.getOwnPropertyDescriptor(MediaSession.prototype, 'metadata');
    if (d?.set)
      Object.defineProperty(navigator.mediaSession, 'metadata', {
        get: d.get.bind(navigator.mediaSession),
        set(v) {
          t.msMeta++;
          d.set.call(navigator.mediaSession, v);
        },
      });
  }
});
await ctx.addInitScript(() => {
  // ?zeromusic : volume de musique forcé à 0 dans les sauvegardes avant le démarrage du jeu
  if (location.search.includes('fresh')) {
    try {
      localStorage.clear();
    } catch {}
  }
  if (location.search.includes('zeromusic')) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try {
        const j = JSON.parse(localStorage.getItem(k));
        if (j?.settings && typeof j.settings.music === 'number') {
          j.settings.music = 0;
          localStorage.setItem(k, JSON.stringify(j));
        }
      } catch {}
    }
  }
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

async function enter(url) {
  await page.goto(url);
  await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
  await pickFirstMode(page);
  await page.waitForSelector('.d2plate');
  await page.click('.d2plate:has-text("99")');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
}
const snap = () =>
  page.evaluate(() => {
    const t = window.__t;
    return { ...t, ctxs: t.ctxs.map((c) => c.state), media: document.querySelectorAll('audio,video').length, meta: navigator.mediaSession ? navigator.mediaSession.metadata : null };
  });

// 1) musique par défaut (50 %)
await enter(URL + '?testchar=1&fresh');
await page.mouse.click(400, 200); // geste utilisateur : déverrouille l'audio
await page.waitForFunction(() => window.__t.loopStarts > 0, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
let s = await snap();
console.log(JSON.stringify(s));
check(s.media === 0, 'aucun <audio>/<video> dans le document');
check(s.mediaPlay === 0 && s.audioNew === 0 && s.mediaSrc === 0, 'HTMLMediaElement.play, new Audio, createMediaElementSource jamais appelés');
check(s.meta === null && s.msMeta === 0, 'navigator.mediaSession.metadata reste null');
check(s.loopStarts >= 1, 'la musique joue (AudioBufferSourceNode en boucle démarré)');
check(s.ctxs.includes('running'), 'AudioContext « running »', s.ctxs.join());

// 2) volume 0 : on le règle dans la sauvegarde, rechargement, rien ne doit être décodé
const stored = await (async () => {
  await page.goto(URL + '?zeromusic');
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      try {
        const j = JSON.parse(localStorage.getItem(localStorage.key(i)));
        if (j?.settings) return j.settings.music;
      } catch {}
    }
    return 'illisible';
  });
})();
console.log('music en sauvegarde =', stored);
if (stored === 0) {
  await enter(URL + '?zeromusic');
  await page.mouse.click(400, 200);
  await page.waitForTimeout(8000);
  s = await snap();
  console.log(JSON.stringify(s));
  const musicDecodes = (s.big ?? []).length > 0; // un morceau de musique pèse > 200 Ko (les effets sont plus petits)
  check(s.loopStarts === 0 && !musicDecodes, 'volume 0 : aucune musique décodée ni lue', `decodes=${s.decodes} octets=${s.decodeBytes}`);
  check(s.media === 0 && s.mediaPlay === 0 && s.audioNew === 0, 'volume 0 : toujours aucun élément média');
} else check(false, 'sauvegarde illisible pour le test volume 0');
check(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
await b.close();
process.exit(fails ? 1 : 0);
