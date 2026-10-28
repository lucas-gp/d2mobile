// D2 Mobile "guild stash" service: a trading stash shared by trusted friends (shared code).
// Aucune dépendance npm : http natif, stockage JSON sur disque (écriture atomique par rename), toutes les
// opérations sont synchrones dans un seul processus, donc « retirer » est atomique (premier arrivé).
// Le serveur ne connaît pas les règles du jeu : un objet est un objet JSON avec une base (chaîne).
// Chaque coffre appartient à un jeu de règles (`ruleset`, ex. `pd2`, `d2`) : un client d'un autre jeu de règles ne le rejoint pas et n'y
// dépose ni n'y retire rien. Coffre ou requête sans jeu de règles (coffres et clients d'avant) : `pd2`.
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIMITS = {
  body: 64 * 1024,
  item: 4096,
  itemsPerGuild: 300,
  membersPerGuild: 8,
  guilds: 100,
  log: 200,
  nick: 20,
  name: 30,
  label: 60,
  reqIdsPerMember: 20,
  ratePerMin: 60,
  authRatePerMin: 10, // create / join par IP et par minute
  createPerDay: 20, // coffres créés par IP et par jour
  activePerIp: 5, // coffres actifs (non purgés) créés par une même IP : empêche quelques IP de saturer le plafond global
  idleDays: 30, // un coffre sans activité depuis ce délai est supprimé (à la création d'un nouveau, ou au démarrage)
  itemDepth: 6, // imbrication maximale d'un objet
  itemNodes: 400, // nombre maximal de valeurs (clés, éléments) dans un objet
  itemString: 200, // longueur maximale d'une chaîne dans un objet
  itemNumber: 1e9, // valeur absolue maximale d'un nombre dans un objet
};

/** Jeu de règles des coffres et des clients d'avant la segmentation (tous les coffres existants) */
export const DEFAULT_RULESET = 'pd2';
const RULESET_RE = /^[a-z0-9-]{1,32}$/;

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I, L, O, 0, 1
const sha = (s) => crypto.createHash('sha256').update(s).digest();
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

function newCode() {
  const out = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    // 4 caractères par groupe parmi 31 : 31^16 ≈ 2^79 ; on prend 5 bits/char via rejet pour rester uniforme
    while (s.length < 4) {
      const b = crypto.randomBytes(1)[0] & 31;
      if (b < ALPHABET.length) s += ALPHABET[b];
    }
    out.push(s);
  }
  return out.join('-');
}
const normCode = (c) => {
  const s = String(c ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return s.length === 16 ? s.match(/.{4}/g).join('-') : '';
};
const cleanText = (v, max) => {
  if (typeof v !== 'string') return '';
  return (
    v
      // eslint-disable-next-line no-control-regex -- on retire volontairement les caractères de contrôle
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .trim()
      .slice(0, max)
  );
};

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/**
 * Vérifie qu'un objet déposé est du JSON « ordinaire » et borné (le serveur ne connaît pas les règles du jeu) : base = identifiant court,
 * profondeur et nombre de valeurs limités, chaînes courtes, nombres finis et raisonnables, pas de clés `__proto__`/`constructor`.
 */
export function itemProblem(item, L = LIMITS) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'bad_item';
  if (typeof item.base !== 'string' || !/^[\w.-]{1,64}$/.test(item.base)) return 'bad_item';
  let nodes = 0;
  const walk = (v, depth) => {
    if (++nodes > L.itemNodes || depth > L.itemDepth) return false;
    if (v === null || typeof v === 'boolean') return true;
    if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= L.itemNumber;
    if (typeof v === 'string') return v.length <= L.itemString;
    if (Array.isArray(v)) return v.every((x) => walk(x, depth + 1));
    if (typeof v === 'object') return Object.keys(v).every((k) => k.length <= 64 && !BAD_KEYS.has(k) && walk(v[k], depth + 1));
    return false;
  };
  return walk(item, 0) ? '' : 'bad_item';
}

class HttpError extends Error {
  constructor(status, error) {
    super(error);
    this.status = status;
    this.error = error;
  }
}

/**
 * Lecture de l'adresse du client (copie identique dans server/stats/index.mjs : chaque service est un fichier autonome).
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

export function createGuildServer(opts = {}) {
  const dataFile = opts.dataFile ?? path.join(process.env.GUILD_DATA ?? path.join(process.cwd(), '.guild-data'), 'guilds.json');
  const L = { ...LIMITS, ...(opts.limits ?? {}) };
  const now = opts.now ?? (() => Date.now());
  // Adresse du client (limites par IP) : jamais `X-Forwarded-For`, que tout client peut forger (docs/EXPLOITATION-IP.md).
  // GUILD_CLIENT_IP=socket (défaut) : adresse de la connexion. GUILD_CLIENT_IP=cloudflare : `CF-Connecting-IP` (posé par Cloudflare, qui écrase
  // celui du client), lu SEULEMENT si la connexion vient d'un pair de confiance (cloudflared en local : GUILD_TRUSTED_PEERS, défaut 127.0.0.1,::1).
  const clientIp = makeClientIp({
    mode: opts.clientIp ?? process.env.GUILD_CLIENT_IP,
    peers: opts.trustedPeers ?? process.env.GUILD_TRUSTED_PEERS,
  });
  /** @type {{guilds: Record<string, any>}} */
  let db = { guilds: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (raw && typeof raw.guilds === 'object') db = raw;
  } catch {
    /* premier démarrage ou fichier absent */
  }

  /** Supprime les coffres inactifs depuis `idleDays` jours ; retourne le nombre supprimé */
  function purgeIdle() {
    const limit = now() - L.idleDays * 86400000;
    let n = 0;
    for (const [id, g] of Object.entries(db.guilds)) {
      if ((g.last ?? g.created ?? 0) < limit) {
        delete db.guilds[id];
        n++;
      }
    }
    return n;
  }
  if (purgeIdle()) {
    try {
      save();
    } catch {
      /* écriture impossible au démarrage : la purge sera refaite */
    }
  }

  function save() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify(db));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, dataFile);
  }

  const buckets = new Map(); // ip → {t0, n, a}
  function rate(ip, auth) {
    const t = now();
    let b = buckets.get(ip);
    if (!b || t - b.t0 >= 60000) {
      b = { t0: t, n: 0, a: 0 };
      buckets.set(ip, b);
      if (buckets.size > 5000) for (const [k, v] of buckets) if (t - v.t0 >= 60000) buckets.delete(k);
    }
    b.n++;
    if (auth) b.a++;
    if (b.n > L.ratePerMin || b.a > L.authRatePerMin) throw new HttpError(429, 'rate');
  }

  const creates = new Map(); // ip → {t0, n} : coffres créés sur 24 h
  function createQuota(ip) {
    const t = now();
    let c = creates.get(ip);
    if (!c || t - c.t0 >= 86400000) {
      c = { t0: t, n: 0 };
      creates.set(ip, c);
      if (creates.size > 5000) for (const [k, v] of creates) if (t - v.t0 >= 86400000) creates.delete(k);
    }
    if (++c.n > L.createPerDay) throw new HttpError(429, 'rate');
  }

  const ipKey = (ip) => sha(`guild-ip:${ip}`).toString('hex').slice(0, 16); // empreinte : l'adresse IP n'est pas écrite sur le disque
  function activeQuota(ip) {
    const k = ipKey(ip);
    purgeIdle();
    let n = 0;
    for (const g of Object.values(db.guilds)) if (g.cip === k) n++;
    if (n >= L.activePerIp) throw new HttpError(429, 'rate');
  }

  const guildByCode = (code) => {
    const h = sha(code);
    let found = null;
    for (const g of Object.values(db.guilds)) if (eq(sha(g.code), h)) found = g; // pas de sortie anticipée
    return found;
  };
  function authed(req) {
    const m = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(req.headers.authorization ?? '');
    if (!m) throw new HttpError(401, 'unauthorized');
    const h = sha(m[1]);
    let hit = null;
    for (const g of Object.values(db.guilds)) for (const mem of g.members) if (eq(Buffer.from(mem.th, 'hex'), h)) hit = { g, mem };
    if (!hit) throw new HttpError(401, 'unauthorized');
    return hit;
  }
  const addLog = (g, e) => {
    const at = now();
    g.last = at;
    g.log.push({ t: at, at, ...e });
    if (g.log.length > L.log) g.log.splice(0, g.log.length - L.log);
  };
  const newToken = () => crypto.randomBytes(24).toString('base64url'); // 192 bits
  const reqIdOf = (b) => {
    if (b.reqId === undefined) return '';
    if (typeof b.reqId !== 'string' || !/^[\w.-]{1,64}$/.test(b.reqId) || b.reqId in Object.prototype) throw new HttpError(400, 'bad_request');
    return b.reqId;
  };
  const remember = (mem, reqId, res) => {
    if (!reqId) return;
    (mem.reqs ??= {})[reqId] = res;
    const ks = Object.keys(mem.reqs);
    for (const k of ks.slice(0, Math.max(0, ks.length - L.reqIdsPerMember))) delete mem.reqs[k];
  };

  /** Jeu de règles d'une requête (absent : client d'avant, `pd2`) */
  const rulesetOf = (b) => {
    if (b.ruleset === undefined) return DEFAULT_RULESET;
    if (typeof b.ruleset !== 'string' || !RULESET_RE.test(b.ruleset)) throw new HttpError(400, 'bad_request');
    return b.ruleset;
  };
  const guildRuleset = (g) => g.ruleset ?? DEFAULT_RULESET;
  /** Refuse une requête d'un autre jeu de règles que celui du coffre */
  const sameRuleset = (g, b) => {
    if (rulesetOf(b) !== guildRuleset(g)) throw new HttpError(409, 'wrong_ruleset');
  };

  function join(g, nick) {
    if (g.members.length >= L.membersPerGuild) throw new HttpError(409, 'members_full');
    const token = newToken();
    g.members.push({ nick, th: sha(token).toString('hex'), reqs: {} });
    addLog(g, { type: 'join', by: nick });
    return token;
  }

  const routes = {
    'POST /create'(req, body) {
      const name = cleanText(body.name, L.name);
      const nick = cleanText(body.nick, L.nick);
      if (!name || !nick) throw new HttpError(400, 'bad_request');
      const ruleset = rulesetOf(body);
      if (Object.keys(db.guilds).length >= L.guilds && purgeIdle() === 0) throw new HttpError(503, 'server_full');
      const ip = clientIp(req);
      activeQuota(ip);
      createQuota(ip);
      const id = crypto.randomBytes(8).toString('hex');
      const g = { id, name, ruleset, code: newCode(), created: now(), last: now(), cip: ipKey(ip), members: [], items: [], log: [] };
      db.guilds[id] = g;
      const token = join(g, nick);
      save();
      return { guildId: id, code: g.code, token, ruleset };
    },
    'POST /join'(req, body) {
      const code = normCode(body.code);
      const nick = cleanText(body.nick, L.nick);
      if (!nick) throw new HttpError(400, 'bad_request');
      const g = code ? guildByCode(code) : null;
      if (!g) throw new HttpError(404, 'bad_code');
      sameRuleset(g, body);
      const token = join(g, nick);
      save();
      return { guildId: g.id, token, name: g.name, ruleset: guildRuleset(g) };
    },
    'GET /state'(req) {
      const { g } = authed(req);
      return {
        name: g.name,
        ruleset: guildRuleset(g),
        code: g.code,
        max: { items: L.itemsPerGuild, members: L.membersPerGuild },
        members: g.members.map((m) => m.nick),
        items: g.items.map((i) => ({ id: i.id, item: i.item, by: i.by, at: i.at, ...(i.name ? { name: i.name } : {}) })),
        log: g.log,
      };
    },
    'POST /deposit'(req, body) {
      const { g, mem } = authed(req);
      sameRuleset(g, body);
      const reqId = reqIdOf(body);
      if (reqId && mem.reqs?.[reqId]?.op === 'deposit') return { id: mem.reqs[reqId].id };
      const item = body.item;
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.base !== 'string' || !item.base) throw new HttpError(400, 'bad_item');
      if (Buffer.byteLength(JSON.stringify(item)) > L.item) throw new HttpError(413, 'item_too_large');
      if (itemProblem(item, L)) throw new HttpError(400, 'bad_item');
      if (g.items.length >= L.itemsPerGuild) throw new HttpError(409, 'guild_full');
      const id = crypto.randomBytes(8).toString('hex');
      const name = cleanText(body.name, L.label);
      g.items.push({ id, item, by: mem.nick, at: now(), ...(name ? { name } : {}) });
      addLog(g, { type: 'deposit', by: mem.nick, ...(name ? { name } : {}) });
      remember(mem, reqId, { op: 'deposit', id });
      save();
      return { id };
    },
    'POST /withdraw'(req, body) {
      const { g, mem } = authed(req);
      sameRuleset(g, body);
      const reqId = reqIdOf(body);
      if (reqId && mem.reqs?.[reqId]?.op === 'withdraw') return { item: mem.reqs[reqId].item };
      if (typeof body.id !== 'string') throw new HttpError(400, 'bad_request');
      const i = g.items.findIndex((x) => x.id === body.id);
      if (i < 0) throw new HttpError(409, 'gone');
      const [e] = g.items.splice(i, 1);
      addLog(g, { type: 'withdraw', by: mem.nick, ...(e.name ? { name: e.name } : {}) });
      remember(mem, reqId, { op: 'withdraw', item: e.item });
      save();
      return { item: e.item };
    },
    'POST /leave'(req) {
      const { g, mem } = authed(req);
      g.members.splice(g.members.indexOf(mem), 1);
      if (!g.members.length) delete db.guilds[g.id];
      else addLog(g, { type: 'leave', by: mem.nick });
      save();
      return { ok: true };
    },
  };

  function readBody(req) {
    return new Promise((resolve, reject) => {
      if (req.method === 'GET') return resolve({});
      const chunks = [];
      let n = 0;
      let over = false;
      req.on('data', (c) => {
        n += c.length;
        if (n > L.body) {
          if (!over) {
            over = true;
            chunks.length = 0;
            reject(new HttpError(413, 'too_large'));
          } // le reste du corps est jeté (réponse 413 puis fermeture)
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (n > L.body) return;
        try {
          const t = Buffer.concat(chunks).toString('utf8');
          const v = t ? JSON.parse(t) : {};
          if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0;
          resolve(v);
        } catch {
          reject(new HttpError(400, 'bad_request'));
        }
      });
      req.on('error', () => reject(new HttpError(400, 'bad_request')));
    });
  }

  const server = http.createServer(async (req, res) => {
    const send = (status, obj) => {
      const t = JSON.stringify(obj);
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(status === 413 ? { Connection: 'close' } : {}),
      });
      res.end(t);
    };
    try {
      const url = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';
      const ip = clientIp(req);
      const key = `${req.method} ${url}`;
      if (url === '/health') return send(200, { ok: true });
      const route = routes[key];
      if (!route) throw new HttpError(url in { '/create': 1, '/join': 1, '/state': 1, '/deposit': 1, '/withdraw': 1, '/leave': 1 } ? 405 : 404, 'not_found');
      rate(ip, key === 'POST /create' || key === 'POST /join');
      const body = await readBody(req);
      send(200, route(req, body));
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.error });
      else {
        console.error('guild: erreur interne', e?.message);
        send(500, { error: 'internal' });
      }
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;

  return {
    server,
    listen: (port = 0, host = '127.0.0.1') => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = createGuildServer({});
  const port = Number(process.env.GUILD_PORT ?? 5320);
  const host = process.env.GUILD_HOST || '127.0.0.1'; // loopback par défaut ; GUILD_HOST=0.0.0.0 pour exposer le service (adresse du client : GUILD_CLIENT_IP)
  if (process.env.GUILD_TRUST_PROXY) console.error('GUILD_TRUST_PROXY est ignoré (X-Forwarded-For forgeable) : voir GUILD_CLIENT_IP dans docs/EXPLOITATION-IP.md');
  s.listen(port, host).then((p) => console.log(`coffre de guilde : écoute sur ${host}:${p}`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => s.close().then(() => process.exit(0)));
}
