import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStats, createStatsServer, makeClientIp, parsePing, type Ping } from '../../server/stats/index.mjs';

const TOKEN = 'jeton-de-test-0123456789';
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ping = (n: number, o: Partial<Ping> = {}): Ping => ({ id: uuid(n), playing: false, ver: '2026-10-18', site: 'owner', ...o });
const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const MIN = 60_000;

/** Service avec horloge simulée */
function clock(start = T0) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v), advance: (ms: number) => (t += ms) };
}

describe('validation des pings', () => {
  const ok = JSON.stringify(ping(1));
  it('accepte un ping valide', () => {
    expect(parsePing(ok)).toEqual(ping(1));
  });
  it.each([
    ['JSON invalide', '{'],
    ['tableau', '[]'],
    ['null', 'null'],
    ['id absent', JSON.stringify({ ...ping(1), id: undefined })],
    ['id qui n’est pas un UUID', JSON.stringify({ ...ping(1), id: 'abc' })],
    ['id d’une adresse IP', JSON.stringify({ ...ping(1), id: '127.0.0.1' })],
    ['playing non booléen', JSON.stringify({ ...ping(1), playing: 'oui' })],
    ['version trop longue', JSON.stringify({ ...ping(1), ver: 'x'.repeat(17) })],
    ['version avec espaces', JSON.stringify({ ...ping(1), ver: 'a b' })],
    ['site inconnu', JSON.stringify({ ...ping(1), site: 'ailleurs' })],
    ['champ supplémentaire', JSON.stringify({ ...ping(1), nick: 'Alice' })],
  ])('refuse : %s', (_n, raw) => {
    expect(() => parsePing(raw)).toThrow();
  });
});

describe('agrégats', () => {
  it('compte nouveaux et retours, simultanés, pics et sessions', () => {
    const c = clock();
    const s = createStats({ now: c.now });
    // jour 1 : A et B arrivent, A passe en jeu
    expect(s.record(ping(1)).isNew).toBe(true);
    expect(s.record(ping(2)).isNew).toBe(true);
    c.advance(MIN);
    s.record(ping(1, { playing: true }));
    let r = s.stats();
    expect(r.uniquePlayers).toBe(2);
    expect(r.live).toEqual({ concurrent: 2, playing: 1, menu: 1 });
    expect(r.today).toMatchObject({ active: 2, new: 2, returning: 0, peak: 2, peakPlaying: 1 });
    // 3 minutes plus tard plus personne (fenêtre de 2 min) ; les agrégats restent
    c.advance(3 * MIN);
    r = s.stats();
    expect(r.live.concurrent).toBe(0);
    expect(r.record.peak).toBe(2);
    // jour 2 : A revient, C est nouveau
    c.set(Date.UTC(2026, 9, 19, 9, 0, 0));
    expect(s.record(ping(1)).isNew).toBe(false);
    s.record(ping(3));
    r = s.stats();
    expect(r.uniquePlayers).toBe(3);
    expect(r.today).toMatchObject({ day: '2026-10-19', active: 2, new: 1, returning: 1, peak: 2 });
    expect(r.days).toHaveLength(30);
    const d1 = r.days.find((d) => d.day === '2026-10-18')!;
    expect(d1).toMatchObject({ active: 2, new: 2, returning: 0, peak: 2, peakPlaying: 1, played: 1 });
    expect(r.days[r.days.length - 1].day).toBe('2026-10-19');
    expect(r.days[0].active).toBe(0);
    expect(r.record).toMatchObject({ peak: 2, day: '2026-10-18' });
    expect(r.bySite).toEqual({ owner: 3 });
    expect(r.byVersion).toEqual({ '2026-10-18': 3 });
    s.close();
  });

  it('durée de session : écarts cumulés + une minute, nouvelle session après un long silence', () => {
    const c = clock();
    const s = createStats({ now: c.now });
    for (let i = 0; i < 4; i++) {
      s.record(ping(1));
      c.advance(MIN);
    }
    // 3 écarts d’une minute = 180 s, +60 s pour le dernier ping = 240 s
    expect(s.stats().days.at(-1)).toMatchObject({ sessions: 1, avgSessionSec: 240 });
    c.advance(10 * MIN);
    s.record(ping(1));
    expect(s.stats().days.at(-1)!.sessions).toBe(2);
    s.close();
  });

  it('un ping trop rapproché du précédent est ignoré', () => {
    const c = clock();
    const s = createStats({ now: c.now });
    expect(s.record(ping(1)).stored).toBe(true);
    c.advance(5000);
    expect(s.record(ping(1)).stored).toBe(false);
    c.advance(20_000);
    expect(s.record(ping(1)).stored).toBe(true);
    s.close();
  });

  it('répartition par site et par version : dernière ligne de chaque joueur', () => {
    const c = clock();
    const s = createStats({ now: c.now });
    s.record(ping(1, { site: 'public', ver: '1' }));
    s.record(ping(2, { site: 'owner', ver: '2' }));
    c.set(c.now() + 86400_000);
    s.record(ping(1, { site: 'public', ver: '2' }));
    const r = s.stats();
    expect(r.bySite).toEqual({ public: 1, owner: 1 });
    expect(r.byVersion).toEqual({ '2': 2 });
    s.close();
  });

  it('purge : pings bruts supprimés après 48 h, agrégats et joueurs conservés', () => {
    const c = clock();
    const s = createStats({ now: c.now });
    s.record(ping(1));
    expect(s._db.prepare('SELECT COUNT(*) AS n FROM pings').get()).toEqual({ n: 1 });
    c.advance(47 * 3600_000);
    s.purge();
    expect(s._db.prepare('SELECT COUNT(*) AS n FROM pings').get()).toEqual({ n: 1 });
    c.advance(2 * 3600_000);
    s.purge();
    expect(s._db.prepare('SELECT COUNT(*) AS n FROM pings').get()).toEqual({ n: 0 });
    expect(s._db.prepare('SELECT COUNT(*) AS n FROM daily').get()).toEqual({ n: 1 });
    expect(s.stats().uniquePlayers).toBe(1);
    // au-delà de la conservation des lignes agrégées, elles partent aussi
    c.advance(401 * 86400_000);
    s.purge();
    expect(s._db.prepare('SELECT COUNT(*) AS n FROM daily').get()).toEqual({ n: 0 });
    s.close();
  });

  it('ne stocke que les champs prévus (aucune colonne d’IP, d’agent ou de texte libre)', () => {
    const s = createStats();
    const cols = (t: string) => (s._db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((x) => x.name);
    expect(cols('pings')).toEqual(['id', 'ts', 'playing', 'ver', 'site']);
    expect(cols('players')).toEqual(['id', 'first_day']);
    expect(cols('daily').join()).not.toMatch(/ip|agent|ua|addr|host/i);
    s.close();
  });
});

describe('service HTTP', () => {
  const open: ReturnType<typeof createStatsServer>[] = [];
  const dirs: string[] = [];
  afterEach(async () => {
    while (open.length) await open.pop()!.close();
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  async function start(o: Partial<Parameters<typeof createStatsServer>[0]> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'stats-'));
    dirs.push(dir);
    const s = createStatsServer({ adminToken: TOKEN, dataFile: join(dir, 'stats.sqlite'), ...o });
    open.push(s);
    const port = await s.listen(0, '127.0.0.1');
    const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    return { s, dir, call };
  }

  it('POST /ping → 204, puis /stats avec le jeton', async () => {
    const { call } = await start();
    expect((await call('POST', '/ping', ping(1, { playing: true }))).status).toBe(204);
    const r = await call('GET', '/stats', undefined, { Authorization: `Bearer ${TOKEN}` });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { uniquePlayers: number; live: { playing: number } };
    expect(j.uniquePlayers).toBe(1);
    expect(j.live.playing).toBe(1);
  });

  it('mauvais ping : 400 ; trop gros : 413 ; mauvaise méthode : 405', async () => {
    const { call } = await start();
    expect((await call('POST', '/ping', { ...ping(1), id: 'x' })).status).toBe(400);
    expect((await call('POST', '/ping', 'x'.repeat(5000))).status).toBe(413);
    expect((await call('GET', '/ping')).status).toBe(405);
    expect((await call('GET', '/inconnu')).status).toBe(404);
  });

  it('/stats : jeton absent ou faux → 401, jamais dans l’URL', async () => {
    const { call } = await start();
    expect((await call('GET', '/stats')).status).toBe(401);
    expect((await call('GET', '/stats', undefined, { Authorization: 'Bearer faux' })).status).toBe(401);
    expect((await call('GET', '/stats', undefined, { Authorization: `Basic ${TOKEN}` })).status).toBe(401);
    expect((await call('GET', `/stats?token=${TOKEN}`)).status).toBe(401);
  });

  it('administration désactivée sans jeton (ou jeton trop court) : 503, même avec « Bearer »', async () => {
    for (const adminToken of ['', 'court']) {
      const { call } = await start({ adminToken });
      expect((await call('GET', '/stats', undefined, { Authorization: `Bearer ${adminToken}` })).status).toBe(503);
    }
  });

  it('essais de jeton limités par IP : 429 après le plafond', async () => {
    const { call } = await start({ limits: { authFailPerMin: 3 } });
    for (let i = 0; i < 3; i++) expect((await call('GET', '/stats', undefined, { Authorization: 'Bearer faux' })).status).toBe(401);
    expect((await call('GET', '/stats', undefined, { Authorization: 'Bearer faux' })).status).toBe(429);
    // même le bon jeton est refusé pendant le blocage
    expect((await call('GET', '/stats', undefined, { Authorization: `Bearer ${TOKEN}` })).status).toBe(429);
  });

  it('limite de débit des pings par IP et plafond d’identifiants nouveaux', async () => {
    const a = await start({ limits: { ratePerMin: 3 } });
    for (let i = 1; i <= 3; i++) expect((await a.call('POST', '/ping', ping(i))).status).toBe(204);
    expect((await a.call('POST', '/ping', ping(4))).status).toBe(429);
    const b = await start({ limits: { newIdsPerIpPerDay: 2 } });
    expect((await b.call('POST', '/ping', ping(1))).status).toBe(204);
    expect((await b.call('POST', '/ping', ping(2))).status).toBe(204);
    expect((await b.call('POST', '/ping', ping(3))).status).toBe(429);
    // un identifiant déjà connu n’est pas concerné
    expect((await b.call('POST', '/ping', ping(1))).status).toBe(204);
  });

  it('adresse du client : X-Forwarded-For forgé toujours ignoré ; CF-Connecting-IP lu seulement en mode cloudflare depuis un pair de confiance', async () => {
    // mode par défaut (socket) : en-têtes forgés sans effet
    const a = await start({ limits: { ratePerMin: 2 } });
    const forged = (n: number) => ({ 'X-Forwarded-For': `10.0.0.${n}`, 'CF-Connecting-IP': `8.8.8.${n}` });
    for (let i = 1; i <= 2; i++) expect((await a.call('POST', '/ping', ping(i), forged(i))).status).toBe(204);
    expect((await a.call('POST', '/ping', ping(3), forged(3))).status).toBe(429);
    // mode cloudflare : une adresse par CF-Connecting-IP
    const b = await start({ limits: { ratePerMin: 1 }, clientIp: 'cloudflare' });
    expect((await b.call('POST', '/ping', ping(1), { 'CF-Connecting-IP': '198.51.100.1' })).status).toBe(204);
    expect((await b.call('POST', '/ping', ping(2), { 'CF-Connecting-IP': '198.51.100.2' })).status).toBe(204);
    expect((await b.call('POST', '/ping', ping(3), { 'CF-Connecting-IP': '198.51.100.2' })).status).toBe(429);
    // contournement mesuré par l'audit (ancien STATS_PROXY_HOPS=2) : X-Forwarded-For varié, vraie adresse fixe → limité
    const c = await start({ limits: { ratePerMin: 2, authFailPerMin: 2 }, clientIp: 'cloudflare' });
    const atk = (n: number) => ({ 'X-Forwarded-For': `1.1.1.1, 10.0.${n}.${n}, 203.0.113.9`, 'CF-Connecting-IP': '203.0.113.9' });
    for (let i = 1; i <= 2; i++) expect((await c.call('POST', '/ping', ping(i), atk(i))).status).toBe(204);
    expect((await c.call('POST', '/ping', ping(3), atk(3))).status).toBe(429);
    // même chose pour les essais de jeton d'administration
    for (let i = 0; i < 2; i++) expect((await c.call('GET', '/stats', undefined, { ...atk(10 + i), Authorization: 'Bearer faux' })).status).toBe(401);
    expect((await c.call('GET', '/stats', undefined, { ...atk(20), Authorization: 'Bearer faux' })).status).toBe(429);
    // pair qui n'est pas de confiance : CF-Connecting-IP ignoré
    const d = await start({ limits: { ratePerMin: 1 }, clientIp: 'cloudflare', trustedPeers: ['10.0.0.1'] });
    expect((await d.call('POST', '/ping', ping(1), { 'CF-Connecting-IP': '198.51.100.1' })).status).toBe(204);
    expect((await d.call('POST', '/ping', ping(2), { 'CF-Connecting-IP': '198.51.100.2' })).status).toBe(429);
  });

  it('makeClientIp (copie de celle de la guilde) : mêmes réponses', async () => {
    const guild = (await import('../../server/guild/index.mjs')).makeClientIp;
    const req = (remoteAddress: string, headers: Record<string, string>) => ({ socket: { remoteAddress }, headers }) as never;
    const cases: [string, Record<string, string>][] = [
      ['::ffff:127.0.0.1', { 'cf-connecting-ip': '2001:db8::1' }],
      ['127.0.0.1', { 'cf-connecting-ip': 'pas-une-ip', 'x-forwarded-for': '1.2.3.4' }],
      ['192.0.2.1', { 'cf-connecting-ip': '1.2.3.4' }],
    ];
    for (const mode of [undefined, 'socket', 'cloudflare']) for (const [peer, h] of cases) expect(makeClientIp({ mode })(req(peer, h))).toBe(guild({ mode })(req(peer, h)));
    expect(() => makeClientIp({ mode: 'hops' })).toThrow(/inconnu/);
  });

  it('aucune adresse IP ni User-Agent dans la base, CORS fermé', async () => {
    const { call, dir } = await start();
    const r = await call('POST', '/ping', ping(1), { 'User-Agent': 'AgentSecretXYZ', 'X-Forwarded-For': '203.0.113.77', Origin: 'https://autre.example' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    const o = await call('OPTIONS', '/ping', undefined, { Origin: 'https://autre.example', 'Access-Control-Request-Method': 'POST' });
    expect(o.headers.get('access-control-allow-origin')).toBeNull();
    for (const f of readdirSync(dir)) {
      const raw = readFileSync(join(dir, f)).toString('latin1');
      expect(raw).not.toContain('AgentSecretXYZ');
      expect(raw).not.toContain('203.0.113.77');
      expect(raw).not.toContain('127.0.0.1');
    }
  });

  it('page /stats.html sans donnée, avec CSP stricte ; le script est servi à part', async () => {
    const { call } = await start();
    await call('POST', '/ping', ping(1));
    const h = await call('GET', '/stats.html');
    const html = await h.text();
    expect(h.status).toBe(200);
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/uniquePlayers|00000000-0000/);
    expect(html).not.toMatch(/<script>[^<]/);
    expect(h.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(h.headers.get('cache-control')).toContain('no-store');
    const js = await (await call('GET', '/stats.js')).text();
    expect(js).toContain("'Bearer '");
    expect(js).not.toContain('location.search');
  });

  it('les données survivent à un redémarrage', async () => {
    const { s, dir, call } = await start();
    await call('POST', '/ping', ping(1));
    await s.close();
    open.pop();
    const again = createStatsServer({ adminToken: TOKEN, dataFile: join(dir, 'stats.sqlite') });
    open.push(again);
    expect(again.core.stats().uniquePlayers).toBe(1);
  });

  it('sauvegarde à chaud', async () => {
    const { s, dir } = await start();
    s.core.record(ping(1));
    const dest = join(dir, 'copie.sqlite');
    s.core.backup(dest);
    expect(existsSync(dest)).toBe(true);
    const c = createStats({ file: dest });
    expect(c.stats().uniquePlayers).toBe(1);
    c.close();
  });
});
