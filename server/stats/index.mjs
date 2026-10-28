// D2 Mobile "anonymous statistics" service: counts distinct players without knowing anything about them.
// Aucune dépendance npm : http natif et `node:sqlite` (Node ≥ 22.13). Ne stocke NI adresse IP NI User-Agent NI rien de personnel :
// un identifiant aléatoire (UUID tiré par le client), l'heure du ping, « en jeu / au menu », la version du jeu et le site (public / owner).
// L'adresse du client ne sert qu'à limiter le débit, en mémoire, sans jamais être écrite (ni sur disque ni dans un journal).
// Rétention : les pings bruts sont purgés au bout de 48 h ; ne restent que des lignes agrégées par identifiant et par jour (UTC).
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const LIMITS = {
  body: 1024, // octets d'un ping
  ver: 16, // longueur de la version
  ratePerMin: 60, // requêtes de ping par IP et par minute
  globalPerMin: 1200, // pings acceptés par minute, toutes IP confondues (filet de sécurité)
  newIdsPerIpPerDay: 50, // identifiants jamais vus créés depuis une même IP en 24 h
  minGapMs: 20_000, // deux pings d'un même identifiant plus proches que cela sont ignorés
  authFailPerMin: 10, // jetons d'administration refusés par IP et par minute
  liveWindowMs: 120_000, // « simultané » : dernier ping il y a moins de 2 min
  sessionGapMs: 150_000, // au-delà de cet écart entre deux pings, une nouvelle session commence
  pingEveryMs: 60_000, // cadence du client (durée comptée pour le dernier ping d'une session)
  rawKeepMs: 48 * 3600_000, // pings bruts conservés
  keepDays: 400, // lignes agrégées conservées
  minTokenLength: 16,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VER_RE = /^[\w.-]{1,16}$/;
export const SITES = ['public', 'owner'];
const DAY = 86400_000;

const sha = (s) => crypto.createHash('sha256').update(s).digest();
const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);

class HttpError extends Error {
  constructor(status, error, headers) {
    super(error);
    this.status = status;
    this.error = error;
    this.headers = headers;
  }
}

/** Valide le corps d'un ping ; retourne { id, playing, ver, site } ou lève une HttpError(400). Toute clé inconnue est refusée. */
export function parsePing(raw) {
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'bad_json');
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'bad_body');
  const keys = Object.keys(b);
  if (keys.some((k) => !['id', 'playing', 'ver', 'site', 'v'].includes(k))) throw new HttpError(400, 'bad_body');
  if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) throw new HttpError(400, 'bad_id');
  if (typeof b.playing !== 'boolean') throw new HttpError(400, 'bad_playing');
  if (typeof b.ver !== 'string' || !VER_RE.test(b.ver)) throw new HttpError(400, 'bad_ver');
  if (typeof b.site !== 'string' || !SITES.includes(b.site)) throw new HttpError(400, 'bad_site');
  return { id: b.id, playing: b.playing, ver: b.ver, site: b.site };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, first_day TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pings (id TEXT NOT NULL, ts INTEGER NOT NULL, playing INTEGER NOT NULL, ver TEXT NOT NULL, site TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pings_ts ON pings (ts);
CREATE TABLE IF NOT EXISTS daily (
  day TEXT NOT NULL, id TEXT NOT NULL, site TEXT NOT NULL, ver TEXT NOT NULL,
  first_ts INTEGER NOT NULL, last_ts INTEGER NOT NULL, pings INTEGER NOT NULL, play_pings INTEGER NOT NULL,
  sessions INTEGER NOT NULL, secs INTEGER NOT NULL, is_new INTEGER NOT NULL,
  PRIMARY KEY (day, id)
);
CREATE INDEX IF NOT EXISTS daily_id ON daily (id);
CREATE TABLE IF NOT EXISTS peaks (day TEXT PRIMARY KEY, peak INTEGER NOT NULL, peak_playing INTEGER NOT NULL, peak_ts INTEGER NOT NULL);
`;

/**
 * Cœur du service (sans HTTP) : enregistre les pings et calcule les statistiques. Testé directement.
 * @param {{ file?: string, now?: () => number, limits?: Record<string, number> }} opts `file` : base SQLite (':memory:' en test)
 */
export function createStats(opts = {}) {
  const L = { ...LIMITS, ...(opts.limits ?? {}) };
  const now = opts.now ?? (() => Date.now());
  const db = new DatabaseSync(opts.file ?? ':memory:');
  if (opts.file && opts.file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  const q = {
    insPing: db.prepare('INSERT INTO pings (id, ts, playing, ver, site) VALUES (?, ?, ?, ?, ?)'),
    insPlayer: db.prepare('INSERT OR IGNORE INTO players (id, first_day) VALUES (?, ?)'),
    getDaily: db.prepare('SELECT last_ts FROM daily WHERE day = ? AND id = ?'),
    insDaily: db.prepare('INSERT INTO daily (day, id, site, ver, first_ts, last_ts, pings, play_pings, sessions, secs, is_new) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, 0, ?)'),
    updDaily: db.prepare('UPDATE daily SET last_ts = ?, site = ?, ver = ?, pings = pings + 1, play_pings = play_pings + ?, sessions = sessions + ?, secs = secs + ? WHERE day = ? AND id = ?'),
    peak: db.prepare(
      `INSERT INTO peaks (day, peak, peak_playing, peak_ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET peak = MAX(peak, excluded.peak), peak_playing = MAX(peak_playing, excluded.peak_playing),
         peak_ts = CASE WHEN excluded.peak > peak THEN excluded.peak_ts ELSE peak_ts END`,
    ),
    purgePings: db.prepare('DELETE FROM pings WHERE ts < ?'),
    purgeDaily: db.prepare('DELETE FROM daily WHERE day < ?'),
    purgePeaks: db.prepare('DELETE FROM peaks WHERE day < ?'),
    recent: db.prepare('SELECT id, MAX(ts) AS ts, playing FROM pings WHERE ts >= ? GROUP BY id'),
  };

  /** Dernier ping de chaque identifiant récent : id → { ts, playing } (rebuilt depuis les pings bruts au démarrage, jamais écrit à part) */
  const live = new Map();
  for (const r of q.recent.all(now() - L.liveWindowMs * 2)) live.set(r.id, { ts: r.ts, playing: !!r.playing });
  let lastPurge = 0;

  function purge() {
    const t = now();
    lastPurge = t;
    const n = q.purgePings.run(t - L.rawKeepMs).changes;
    const cut = dayOf(t - L.keepDays * DAY);
    q.purgeDaily.run(cut);
    q.purgePeaks.run(cut);
    for (const [id, v] of live) if (v.ts < t - L.liveWindowMs * 2) live.delete(id);
    return Number(n);
  }
  purge();

  function counts(t) {
    let concurrent = 0;
    let playing = 0;
    for (const v of live.values())
      if (v.ts > t - L.liveWindowMs) {
        concurrent++;
        if (v.playing) playing++;
      }
    return { concurrent, playing };
  }

  /** Enregistre un ping validé. Retourne { stored, isNew } (stored faux : ping trop rapproché, ignoré). */
  function record(p) {
    const t = now();
    if (t - lastPurge > 3600_000) purge();
    const prev = live.get(p.id);
    if (prev && t - prev.ts < L.minGapMs) return { stored: false, isNew: false };
    const day = dayOf(t);
    db.exec('BEGIN');
    try {
      q.insPing.run(p.id, t, p.playing ? 1 : 0, p.ver, p.site);
      const isNew = Number(q.insPlayer.run(p.id, day).changes) === 1;
      const row = q.getDaily.get(day, p.id);
      if (!row) q.insDaily.run(day, p.id, p.site, p.ver, t, t, p.playing ? 1 : 0, isNew ? 1 : 0);
      else {
        const gap = t - row.last_ts;
        const sameSession = gap <= L.sessionGapMs;
        q.updDaily.run(t, p.site, p.ver, p.playing ? 1 : 0, sameSession ? 0 : 1, sameSession ? Math.round(gap / 1000) : 0, day, p.id);
      }
      live.set(p.id, { ts: t, playing: p.playing });
      const c = counts(t);
      q.peak.run(day, c.concurrent, c.playing, t);
      db.exec('COMMIT');
      return { stored: true, isNew };
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Statistiques pour l'administrateur */
  function stats() {
    const t = now();
    const today = dayOf(t);
    const days30 = [];
    for (let i = 29; i >= 0; i--) days30.push(dayOf(t - i * DAY));
    const from = days30[0];
    const perDay = new Map(
      db
        .prepare('SELECT day, COUNT(*) AS active, SUM(is_new) AS fresh, SUM(sessions) AS sessions, SUM(secs) AS secs, SUM(play_pings > 0) AS played FROM daily WHERE day >= ? GROUP BY day')
        .all(from)
        .map((r) => [r.day, r]),
    );
    const peaks = new Map(
      db
        .prepare('SELECT day, peak, peak_playing FROM peaks WHERE day >= ?')
        .all(from)
        .map((r) => [r.day, r]),
    );
    const days = days30.map((day) => {
      const r = perDay.get(day);
      const pk = peaks.get(day);
      const active = Number(r?.active ?? 0);
      const fresh = Number(r?.fresh ?? 0);
      const sessions = Number(r?.sessions ?? 0);
      return {
        day,
        active,
        new: fresh,
        returning: active - fresh,
        played: Number(r?.played ?? 0),
        peak: Number(pk?.peak ?? 0),
        peakPlaying: Number(pk?.peak_playing ?? 0),
        sessions,
        avgSessionSec: sessions ? Math.round(Number(r.secs) / sessions + L.pingEveryMs / 1000) : 0,
      };
    });
    const sess = days.reduce((a, d) => a + d.sessions, 0);
    const secs = days.reduce((a, d) => a + (perDay.get(d.day) ? Number(perDay.get(d.day).secs) : 0), 0);
    const record = db.prepare('SELECT day, peak, peak_ts FROM peaks ORDER BY peak DESC, day ASC LIMIT 1').get();
    // répartition : dernière ligne de chaque joueur actif sur 30 jours
    const last = db
      .prepare(
        `SELECT site, ver, COUNT(*) AS n FROM daily d WHERE day >= ? AND day = (SELECT MAX(day) FROM daily WHERE id = d.id)
         GROUP BY site, ver`,
      )
      .all(from);
    const bySite = {};
    const byVersion = {};
    for (const r of last) {
      bySite[r.site] = (bySite[r.site] ?? 0) + Number(r.n);
      byVersion[r.ver] = (byVersion[r.ver] ?? 0) + Number(r.n);
    }
    const c = counts(t);
    const td = days[days.length - 1];
    const total = Number(db.prepare('SELECT COUNT(*) AS n FROM players').get().n);
    return {
      generatedAt: new Date(t).toISOString(),
      uniquePlayers: total,
      live: { concurrent: c.concurrent, playing: c.playing, menu: c.concurrent - c.playing },
      today: { day: today, active: td.active, new: td.new, returning: td.returning, peak: td.peak, peakPlaying: td.peakPlaying },
      record: record ? { peak: Number(record.peak), day: record.day, at: new Date(Number(record.peak_ts)).toISOString() } : { peak: 0, day: null, at: null },
      avgSessionSec30d: sess ? Math.round(secs / sess + L.pingEveryMs / 1000) : 0,
      days,
      bySite,
      byVersion,
    };
  }

  /** Copie cohérente de la base dans un fichier (sauvegarde à chaud) */
  function backup(dest) {
    db.exec(`VACUUM INTO '${String(dest).replace(/'/g, "''")}'`);
  }

  return { record, stats, purge, backup, close: () => db.close(), _db: db };
}

const PAGE = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Statistiques</title>
<style>
body{font:15px/1.4 system-ui,sans-serif;margin:0;padding:12px;background:#12100e;color:#e8dfd0;max-width:760px;margin:auto}
h1{font-size:18px}h2{font-size:15px;margin:18px 0 6px;color:#d9a050}
form{display:flex;gap:8px;margin:12px 0}input{flex:1;padding:8px;background:#1d1a16;color:inherit;border:1px solid #4a4034;border-radius:4px}
button{padding:8px 14px;background:#6b3a1f;color:#fff;border:0;border-radius:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.card{background:#1d1a16;border:1px solid #3a3228;border-radius:6px;padding:8px}.card b{display:block;font-size:22px}.card span{font-size:12px;color:#a89c88}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:3px 6px;text-align:right;border-bottom:1px solid #2a241d}th:first-child,td:first-child{text-align:left}
.bar{display:inline-block;height:8px;background:#d9a050;vertical-align:middle}#err{color:#e57}
</style></head><body>
<h1>Statistiques des joueurs (anonymes)</h1>
<form id="f"><input id="t" type="password" autocomplete="off" placeholder="Jeton d’administration" aria-label="Jeton d’administration"><button>Afficher</button></form>
<div id="err"></div><div id="out"></div>
<script src="stats.js"></script></body></html>
`;

const PAGE_JS = `(() => {
  const $ = (id) => document.getElementById(id);
  let token = '';
  let timer = 0;
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const dur = (s) => (s ? Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s' : '–');
  const card = (v, l) => { const c = el('div', undefined, 'card'); c.append(el('b', String(v)), el('span', l)); return c; };
  function render(s) {
    const out = $('out');
    out.replaceChildren();
    const g = el('div', undefined, 'grid');
    g.append(card(s.uniquePlayers, 'joueurs différents depuis le début'), card(s.live.concurrent, 'en ce moment (dont ' + s.live.playing + ' en jeu, ' + s.live.menu + ' au menu)'),
      card(s.today.active, 'actifs aujourd’hui (' + s.today.new + ' nouveaux, ' + s.today.returning + ' de retour)'), card(s.today.peak, 'pic de simultanés aujourd’hui'),
      card(s.record.peak, 'record de simultanés' + (s.record.day ? ' (' + s.record.day + ')' : '')), card(dur(s.avgSessionSec30d), 'durée moyenne d’une session (30 j, approx.)'));
    out.append(g);
    out.append(el('h2', 'Répartition (joueurs actifs sur 30 jours)'));
    const rep = (o) => Object.entries(o).map(([k, v]) => k + ' : ' + v).join(' · ') || '–';
    out.append(el('div', 'Site — ' + rep(s.bySite)), el('div', 'Version — ' + rep(s.byVersion)));
    out.append(el('h2', '30 derniers jours (UTC)'));
    const t = el('table');
    const head = el('tr');
    for (const h of ['Jour', 'Actifs', 'Nouv.', 'Retour', 'Pic', 'Pic jeu', 'Session']) head.append(el('th', h));
    t.append(head);
    const max = Math.max(1, ...s.days.map((d) => d.active));
    for (const d of s.days.slice().reverse()) {
      const r = el('tr');
      const first = el('td', d.day.slice(5));
      r.append(first, el('td', String(d.active)), el('td', String(d.new)), el('td', String(d.returning)), el('td', String(d.peak)), el('td', String(d.peakPlaying)), el('td', dur(d.avgSessionSec)));
      const b = el('span', undefined, 'bar'); b.style.width = Math.round((d.active / max) * 60) + 'px'; first.append(' ', b);
      t.append(r);
    }
    out.append(t);
    out.append(el('div', 'Mis à jour ' + s.generatedAt, 'card'));
  }
  async function load() {
    $('err').textContent = '';
    try {
      const r = await fetch('stats', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', credentials: 'omit' });
      if (r.status === 401 || r.status === 503 || r.status === 429) { $('err').textContent = r.status === 401 ? 'Jeton refusé.' : r.status === 429 ? 'Trop d’essais, patientez.' : 'Administration non configurée sur le serveur.'; token = ''; clearInterval(timer); return; }
      if (!r.ok) throw new Error(String(r.status));
      render(await r.json());
    } catch { $('err').textContent = 'Serveur injoignable.'; }
  }
  $('f').addEventListener('submit', (e) => { e.preventDefault(); token = $('t').value.trim(); $('t').value = ''; if (!token) return; clearInterval(timer); void load(); timer = setInterval(load, 30000); });
})();
`;

const SEC_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

/**
 * Lecture de l'adresse du client (copie identique dans server/guild/index.mjs : chaque service est un fichier autonome).
 * @param {{mode?: string, peers?: string | string[]}} o
 * @returns {(req: import('node:http').IncomingMessage) => string}
 */
export function makeClientIp({ mode, peers } = {}) {
  const m = String(mode ?? '').trim() || 'socket';
  if (m !== 'socket' && m !== 'cloudflare') throw new Error(`mode d'adresse client inconnu : ${m} (socket | cloudflare)`);
  const norm = (a) =>
    String(a ?? '')
      .trim()
      .replace(/^::ffff:/, '');
  const trusted = new Set((Array.isArray(peers) ? peers : String(peers ?? '127.0.0.1,::1').split(',')).map(norm).filter(Boolean));
  return (req) => {
    const peer = norm(req.socket.remoteAddress) || '?';
    if (m === 'socket' || !trusted.has(peer)) return peer;
    const h = req.headers['cf-connecting-ip'];
    const v = typeof h === 'string' ? norm(h) : '';
    return v && net.isIP(v) ? v : peer;
  };
}

export function createStatsServer(opts = {}) {
  const adminToken = opts.adminToken ?? process.env.STATS_ADMIN_TOKEN ?? '';
  const adminOn = adminToken.length >= (opts.limits?.minTokenLength ?? LIMITS.minTokenLength);
  const adminHash = adminOn ? sha(adminToken) : null;
  const dataFile = opts.dataFile ?? path.join(process.env.STATS_DATA ?? path.join(process.cwd(), '.stats-data'), 'stats.sqlite');
  if (dataFile !== ':memory:') fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const L = { ...LIMITS, ...(opts.limits ?? {}) };
  const now = opts.now ?? (() => Date.now());
  const core = createStats({ file: dataFile, now, limits: opts.limits });
  // Adresse du client (limitation de débit seulement, jamais écrite) : jamais `X-Forwarded-For`, que tout client peut forger (docs/EXPLOITATION-IP.md).
  // STATS_CLIENT_IP=socket (défaut) : adresse de la connexion. STATS_CLIENT_IP=cloudflare : `CF-Connecting-IP`, lu SEULEMENT si la connexion
  // vient d'un pair de confiance (cloudflared en local : STATS_TRUSTED_PEERS, défaut 127.0.0.1,::1).
  const clientIp = makeClientIp({
    mode: opts.clientIp ?? process.env.STATS_CLIENT_IP,
    peers: opts.trustedPeers ?? process.env.STATS_TRUSTED_PEERS,
  });

  // limites en mémoire (jamais écrites) : fenêtre d'une minute par IP, identifiants créés par IP, essais de jeton
  const win = (m, key, t, span) => {
    const e = m.get(key);
    if (!e || t - e.start >= span) {
      const n = { start: t, n: 1 };
      m.set(key, n);
      return 1;
    }
    return ++e.n;
  };
  const rate = new Map();
  const authFail = new Map();
  const newIds = new Map();
  let global = { start: 0, n: 0 };
  const sweep = (m, t, span) => {
    if (m.size > 5000) for (const [k, e] of m) if (t - e.start >= span) m.delete(k);
  };

  const send = (res, status, body, headers = {}) => {
    const isStr = typeof body === 'string';
    res.writeHead(status, { ...SEC_HEADERS, ...(body === undefined ? {} : { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' }), ...headers });
    res.end(body === undefined ? undefined : isStr ? body : JSON.stringify(body));
  };

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > L.body) {
          reject(new HttpError(413, 'too_large'));
          chunks.length = 0;
        } else if (size <= L.body) chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function authorized(req, ip, t) {
    if (!adminOn) throw new HttpError(503, 'admin_disabled');
    if ((authFail.get(ip)?.n ?? 0) >= L.authFailPerMin && t - authFail.get(ip).start < 60_000) throw new HttpError(429, 'too_many');
    const m = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''));
    const ok = !!m && crypto.timingSafeEqual(sha(m[1]), adminHash);
    if (!ok) {
      win(authFail, ip, t, 60_000);
      sweep(authFail, t, 60_000);
      throw new HttpError(401, 'unauthorized');
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const t = now();
      const ip = clientIp(req);
      const url = new URL(req.url ?? '/', 'http://x');
      const p = url.pathname;
      if (p === '/health' && req.method === 'GET') return send(res, 200, { ok: true });
      if (p === '/ping') {
        if (req.method !== 'POST') throw new HttpError(405, 'method', { Allow: 'POST' });
        if (win(rate, ip, t, 60_000) > L.ratePerMin) throw new HttpError(429, 'too_many');
        sweep(rate, t, 60_000);
        if (t - global.start >= 60_000) global = { start: t, n: 0 };
        if (++global.n > L.globalPerMin) throw new HttpError(429, 'too_many');
        const ping = parsePing(await readBody(req));
        // un identifiant jamais vu ne peut pas être créé en rafale depuis une même IP
        const known = core._db.prepare('SELECT 1 AS x FROM players WHERE id = ?').get(ping.id);
        if (!known && win(newIds, ip, t, DAY) > L.newIdsPerIpPerDay) throw new HttpError(429, 'too_many');
        sweep(newIds, t, DAY);
        core.record(ping);
        return send(res, 204);
      }
      if (p === '/stats' && req.method === 'GET') {
        authorized(req, ip, t);
        return send(res, 200, core.stats());
      }
      if (p === '/stats.html' && req.method === 'GET')
        return res
          .writeHead(200, {
            ...SEC_HEADERS,
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          })
          .end(PAGE);
      if (p === '/stats.js' && req.method === 'GET') return res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': 'text/javascript; charset=utf-8' }).end(PAGE_JS);
      throw new HttpError(404, 'not_found');
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 413) {
          // corps refusé : la réponse part, puis la connexion est fermée sans lire le reste
          res.on('finish', () => req.destroy());
          return send(res, 413, { error: e.error }, { Connection: 'close' });
        }
        return send(res, e.status, { error: e.error }, e.headers);
      }
      // aucun détail (ni adresse) dans la réponse ; la cause n'est pas journalisée avec la requête
      console.error('stats: erreur interne', e instanceof Error ? e.message : '');
      return send(res, 500, { error: 'internal' });
    }
  });
  // une connexion lente ne doit pas rester ouverte
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;

  return {
    server,
    core,
    listen: (port = 0, host = '127.0.0.1') =>
      new Promise((resolve) => {
        server.listen(port, host, () => resolve(server.address().port));
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          core.close();
          resolve();
        });
        server.closeAllConnections?.();
      }),
  };
}

// Lancement direct : STATS_PORT (5330), STATS_HOST (127.0.0.1), STATS_DATA (./.stats-data), STATS_ADMIN_TOKEN (≥ 16 caractères, obligatoire pour /stats)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const backupAt = process.argv.indexOf('--backup');
  if (backupAt > 0) {
    // node server/stats/index.mjs --backup /chemin/copie.sqlite : copie à chaud de la base
    const dest = process.argv[backupAt + 1];
    if (!dest) throw new Error('--backup <fichier>');
    const c = createStats({ file: path.join(process.env.STATS_DATA ?? path.join(process.cwd(), '.stats-data'), 'stats.sqlite') });
    c.backup(dest);
    c.close();
    console.log('sauvegarde écrite');
  } else {
    const port = Number(process.env.STATS_PORT ?? 5330);
    const host = process.env.STATS_HOST ?? '127.0.0.1';
    const s = createStatsServer();
    if (process.env.STATS_TRUST_PROXY || process.env.STATS_PROXY_HOPS)
      console.error('stats: STATS_TRUST_PROXY / STATS_PROXY_HOPS sont ignorés (X-Forwarded-For forgeable) : voir STATS_CLIENT_IP dans docs/EXPLOITATION-IP.md');
    if ((process.env.STATS_ADMIN_TOKEN ?? '').length < LIMITS.minTokenLength) console.warn(`stats: STATS_ADMIN_TOKEN absent ou trop court (< ${LIMITS.minTokenLength}) : /stats est désactivé`);
    s.listen(port, host).then((pt) => console.log(`stats: écoute sur ${host}:${pt}`));
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => void s.close().then(() => process.exit(0)));
  }
}
