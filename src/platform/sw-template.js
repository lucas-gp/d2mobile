/* D2 Mobile service worker (generated at build time from this template). */
const VERSION = '__VERSION__';
const CORE = '__CORE__';
const SPRITES = '__SPRITES__';
// application files of one version (purged when a new version activates)
const APP_PREFIX = 'd2m-app-';
const CACHE = `${APP_PREFIX}${VERSION}`;
// former name of the game (src/platform/legacy-names.ts, substituted at build time): caches created by earlier versions
const LEGACY = '__LEGACY_PREFIX__';
// data caches of earlier versions, kept and still used under their former name (src/platform/storage-names.ts): never purged here
const LEGACY_DATA = ['d2', 'd2-local', 'd2-audio'].map((s) => `${LEGACY}-${s}`);
// fichiers D2 chiffrés : cache à part, NON versionné avec l'application (adresses immuables `?v=` : une mise à
// jour du jeu ne doit pas refaire télécharger des centaines de Mo). Voir src/platform/d2cache.ts.
const D2_NEW = 'd2m-d2';
// the cache of an earlier version keeps being used under its former name while it exists (same rule as storage-names.ts)
const D2_LEGACY = `${LEGACY}-d2`;
let d2Name = null;
async function openD2() {
  if (!d2Name) d2Name = (await caches.has(D2_LEGACY).catch(() => false)) ? D2_LEGACY : D2_NEW;
  return caches.open(d2Name);
}
/** Cache to purge on activation: another version's application files (never the D2 data caches, current or former names) */
const isOldAppCache = (k) => (k.startsWith(APP_PREFIX) && k !== CACHE) || (k.startsWith(`${LEGACY}-`) && !LEGACY_DATA.includes(k));
let quotaWarned = false;

/** Tells the open pages how far the download of this version went (lot 297: the update button's progress bar) */
async function tellProgress(done, total) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })) c.postMessage({ type: 'INSTALL_PROGRESS', version: VERSION, done, total });
}

/**
 * Download of this version's files (lot 297; was `cache.addAll`, silent and all-or-nothing in one go): six at a time, each file tried twice,
 * the page told the progress; the hashed files (`assets/`) already in this version's cache are kept (a download resumed after a failure),
 * the others asked of the server again (`no-cache`: never an HTTP cache's older copy); one file failing twice fails the install (the
 * page tells it and offers to retry).
 */
async function installFiles() {
  const c = await caches.open(CACHE);
  const files = ['./', ...CORE];
  let done = 0;
  let told = -1;
  const step = async () => {
    done++;
    // at most a message every 2 % (and the last one)
    const pct = Math.floor((done / files.length) * 50);
    if (pct !== told || done === files.length) {
      told = pct;
      await tellProgress(done, files.length).catch(() => undefined);
    }
  };
  const one = async (f) => {
    const hashed = f.startsWith('assets/');
    if (hashed && (await c.match(f))) return step();
    let err;
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(new Request(f, { cache: hashed ? 'default' : 'no-cache' }));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await c.put(f, res);
        return step();
      } catch (e) {
        err = e;
      }
    }
    throw err;
  };
  await tellProgress(0, files.length).catch(() => undefined);
  let next = 0;
  const worker = async () => {
    while (next < files.length) await one(files[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
}

self.addEventListener('install', (e) => {
  e.waitUntil(installFiles());
});

// activation immédiate : le navigateur met en attente toutes les requêtes de la page tant que
// le service worker s'active — y compris l'ouverture de l'application. Rien de long ici (le
// préchargement des planches bloquait la relance de la PWA sur l'écran de démarrage).
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(isOldAppCache).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Préchargement de toutes les planches (hors ligne ensuite), demandé par le jeu une fois lancé */
async function precacheSprites() {
  const c = await caches.open(CACHE);
  for (const f of SPRITES) {
    if (await c.match(f)) continue;
    try {
      await c.add(f);
    } catch {
      /* réseau coupé : on réessaiera au prochain lancement */
    }
  }
}

self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  // the running version (lot 297: compared with the server's version.json)
  if (e.data.type === 'VERSION') e.ports[0]?.postMessage({ version: VERSION });
  if (e.data.type === 'PRECACHE') e.waitUntil(precacheSprites());
});

/** Prévient les pages ouvertes (stockage plein : le fichier n'est pas gardé pour le hors ligne) */
async function tell(type) {
  for (const c of await self.clients.matchAll()) c.postMessage({ type });
}

const isQuota = (e) => !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''));
/** Quota : le fichier est servi mais ne sera pas disponible hors ligne ; on le dit au jeu (une fois) */
function noteQuota(err) {
  if (isQuota(err) && !quotaWarned) {
    quotaWarned = true;
    tell('D2_QUOTA');
  }
}

/** Supprime les entrées de même chemin dont l'empreinte `?v=` diffère (anciennes versions du dossier chiffré) */
async function purgeOld(c, reqUrl) {
  const u = new URL(reqUrl);
  for (const k of await c.keys(reqUrl, { ignoreSearch: true })) {
    const ku = new URL(k.url);
    if (ku.pathname === u.pathname && ku.search !== u.search) await c.delete(k);
  }
}

/** Nouvelle empreinte du dossier : tout fichier d'une autre empreinte est obsolète (comptabilité des packs comprise) */
async function purgeByVersion(c, ver) {
  const keep = ver ? `?v=${ver}` : '';
  for (const k of await c.keys()) {
    const ku = new URL(k.url);
    if (ku.pathname.endsWith('/d2/index.json')) continue;
    if (ku.search !== keep) await c.delete(k);
  }
}

/** Fichier immuable : cache d'abord, réseau sinon (puis rangé). */
async function d2CacheFirst(req) {
  const c = await openD2();
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && !(res.headers.get('content-type') || '').includes('text/html')) {
    try {
      await purgeOld(c, req.url);
      await c.put(req, res.clone());
    } catch (err) {
      noteQuota(err);
    }
  }
  return res;
}

/** index.json : réseau d'abord (c'est lui qui porte l'empreinte), copie en cache pour démarrer hors ligne */
async function d2Index(req) {
  const c = await openD2();
  try {
    const res = await fetch(req);
    if (res.ok && !(res.headers.get('content-type') || '').includes('text/html')) {
      try {
        const ver = (await res.clone().json()).ver;
        await purgeByVersion(c, ver);
        await c.put(req, res.clone());
      } catch {
        /* illisible ou stockage plein : la réponse réseau suffit */
      }
      return res;
    }
  } catch {
    /* hors ligne */
  }
  const hit = await c.match(req);
  return hit || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // API de synchronisation : jamais interceptée ni mise en cache (données personnelles chiffrées, toujours le réseau)
  if (url.pathname.includes('/api/')) return;
  // statistiques anonymes : page d'administration et données jamais servies par le cache (ni repli sur l'application)
  if (url.pathname.includes('/stats-api/')) return;
  // the server's version (lot 297): always the network, never this cache (a cached copy told "up to date" forever)
  if (url.pathname.endsWith('/version.json')) return;
  if (url.pathname.includes('/d2/')) {
    // seuls les fichiers chiffrés et l'index passent par le cache D2 (le mode « plain » local reste en no-cache)
    if (url.pathname.endsWith('.enc')) return void e.respondWith(d2CacheFirst(req).catch(() => new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
    if (url.pathname.endsWith('/d2/index.json')) return void e.respondWith(d2Index(req));
  }
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        // une page HTML reçue pour autre chose qu'une ouverture de page (repli d'un serveur,
        // portail wifi) n'est jamais transmise : le jeu la lirait comme des données
        if (req.mode !== 'navigate' && (res.headers.get('content-type') || '').includes('text/html')) throw new Error('HTML');
        // mise en cache sans retarder la réponse ; un échec (quota) n'est plus un rejet non géré du service worker
        if (res.ok && (url.pathname.includes('/sprites/') || url.pathname.includes('/assets/'))) e.waitUntil(c.put(req, res.clone()).catch(noteQuota));
        return res;
      } catch {
        // la page d'accueil ne sert de repli qu'à l'ouverture de la page : renvoyée pour un
        // fichier JSON ou JS, elle faisait planter le démarrage (« Unexpected token '<' »)
        if (req.mode === 'navigate') {
          const fallback = await c.match('./');
          if (fallback) return fallback;
        }
        return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })(),
  );
});
