import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuildServer, makeClientIp } from '../../server/guild/index.mjs';

type Srv = ReturnType<typeof createGuildServer>;
/** Corps de réponse (champs utilisés par les tests) */
interface Body {
  error: string;
  id: string;
  guildId: string;
  code: string;
  token: string;
  name: string;
  item: Record<string, unknown>;
  items: { id: string; by: string }[];
  log: { type: string; by: string; name?: string }[];
  members: string[];
  ruleset: string;
}
const open: Srv[] = [];
const dirs: string[] = [];
async function start(dir?: string, limits?: Record<string, number>, extra: { now?: () => number; clientIp?: 'socket' | 'cloudflare'; trustedPeers?: string[] } = {}) {
  const d = dir ?? mkdtempSync(join(tmpdir(), 'guild-'));
  if (!dir) dirs.push(d);
  const s = createGuildServer({ dataFile: join(d, 'guilds.json'), limits, ...extra });
  open.push(s);
  const port = await s.listen(0, '127.0.0.1');
  const call = async (method: string, path: string, body?: unknown, token?: string, raw?: string, headers: Record<string, string> = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    return { status: r.status, body: (await r.json()) as Body };
  };
  return { s, d, call };
}
afterEach(async () => {
  while (open.length) await open.pop()!.close();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const sword = (n = 0) => ({ uid: `u${n}`, base: 'sword', quality: 'normal', ilvl: 5, sockets: 0, socketed: [] });

describe('serveur de guilde', () => {
  it('créer, rejoindre, déposer, voir, retirer', async () => {
    const { call } = await start();
    const a = (await call('POST', '/create', { name: 'Les Amis', nick: 'Alice' })).body;
    expect(a.code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(a.token.length).toBeGreaterThanOrEqual(32);
    const j = await call('POST', '/join', { code: a.code.toLowerCase().replace(/-/g, ' '), nick: 'Bob' });
    expect(j.status).toBe(200);
    expect(j.body.name).toBe('Les Amis');
    const dep = await call('POST', '/deposit', { item: sword(1), reqId: 'r1', name: 'Épée' }, a.token);
    expect(dep.status).toBe(200);
    const st = (await call('GET', '/state', undefined, j.body.token)).body;
    expect(st.members).toEqual(['Alice', 'Bob']);
    expect(st.items).toHaveLength(1);
    expect(st.items[0].by).toBe('Alice');
    expect(st.log.map((e: { type: string }) => e.type)).toEqual(['join', 'join', 'deposit']);
    const w = await call('POST', '/withdraw', { id: dep.body.id, reqId: 'w1' }, j.body.token);
    expect(w.body.item.base).toBe('sword');
    expect(JSON.stringify(st.log)).not.toContain(a.token);
  });

  it('retrait atomique : deux retraits concurrents, un seul réussit', async () => {
    const { call } = await start();
    const a = (await call('POST', '/create', { name: 'G', nick: 'A' })).body;
    const b = (await call('POST', '/join', { code: a.code, nick: 'B' })).body;
    const { id } = (await call('POST', '/deposit', { item: sword() }, a.token)).body;
    const rs = await Promise.all([call('POST', '/withdraw', { id, reqId: 'x' }, a.token), call('POST', '/withdraw', { id, reqId: 'y' }, b.token)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error).toBe('gone');
    expect((await call('GET', '/state', undefined, a.token)).body.items).toHaveLength(0);
  });

  it('idempotence reqId : rejeu sans doublon', async () => {
    const { call } = await start();
    const a = (await call('POST', '/create', { name: 'G', nick: 'A' })).body;
    const d1 = await call('POST', '/deposit', { item: sword(), reqId: 'same' }, a.token);
    const d2 = await call('POST', '/deposit', { item: sword(), reqId: 'same' }, a.token);
    expect(d2.body.id).toBe(d1.body.id);
    expect((await call('GET', '/state', undefined, a.token)).body.items).toHaveLength(1);
    const w1 = await call('POST', '/withdraw', { id: d1.body.id, reqId: 'wr' }, a.token);
    const w2 = await call('POST', '/withdraw', { id: d1.body.id, reqId: 'wr' }, a.token);
    expect(w2.status).toBe(200);
    expect(w2.body).toEqual(w1.body);
    const w3 = await call('POST', '/withdraw', { id: d1.body.id, reqId: 'other' }, a.token);
    expect(w3.status).toBe(409);
  });

  it('limites : objets, membres, taille, corps, forme', async () => {
    const { call } = await start(undefined, { itemsPerGuild: 2, membersPerGuild: 2, item: 200, body: 2000 });
    const a = (await call('POST', '/create', { name: 'G', nick: 'A' })).body;
    expect((await call('POST', '/join', { code: a.code, nick: 'B' })).status).toBe(200);
    const full = await call('POST', '/join', { code: a.code, nick: 'C' });
    expect(full.status).toBe(409);
    expect(full.body.error).toBe('members_full');
    await call('POST', '/deposit', { item: sword(1) }, a.token);
    await call('POST', '/deposit', { item: sword(2) }, a.token);
    const over = await call('POST', '/deposit', { item: sword(3) }, a.token);
    expect(over.status).toBe(409);
    expect(over.body.error).toBe('guild_full');
    const { call: c2 } = await start(undefined, { item: 200, body: 2000 });
    const a2 = (await c2('POST', '/create', { name: 'G', nick: 'A' })).body;
    expect((await c2('POST', '/deposit', { item: { base: 'x', pad: 'y'.repeat(300) } }, a2.token)).status).toBe(413);
    expect((await c2('POST', '/deposit', { item: { base: 'x', pad: 'y'.repeat(3000) } }, a2.token)).status).toBe(413);
    expect((await c2('POST', '/deposit', { item: { nobase: 1 } }, a2.token)).status).toBe(400);
    expect((await c2('POST', '/deposit', { item: [1] }, a2.token)).status).toBe(400);
    expect((await c2('POST', '/deposit', undefined, a2.token, '{pas du json')).status).toBe(400);
  });

  it('nombre de coffres borné, jetons et codes invalides', async () => {
    const { call } = await start(undefined, { guilds: 1 });
    expect((await call('POST', '/create', { name: 'G', nick: 'A' })).status).toBe(200);
    expect((await call('POST', '/create', { name: 'H', nick: 'A' })).status).toBe(503);
    expect((await call('GET', '/state')).status).toBe(401);
    expect((await call('GET', '/state', undefined, 'x'.repeat(32))).status).toBe(401);
    expect((await call('POST', '/join', { code: 'AAAA-BBBB-CCCC-DDDD', nick: 'Z' })).status).toBe(404);
    expect((await call('POST', '/create', { name: '', nick: 'A' })).status).toBe(400);
  });

  it('quitter : jeton invalidé, coffre supprimé quand vide', async () => {
    const { call } = await start();
    const a = (await call('POST', '/create', { name: 'G', nick: 'A' })).body;
    const b = (await call('POST', '/join', { code: a.code, nick: 'B' })).body;
    await call('POST', '/leave', {}, b.token);
    expect((await call('GET', '/state', undefined, b.token)).status).toBe(401);
    expect((await call('GET', '/state', undefined, a.token)).body.members).toEqual(['A']);
    await call('POST', '/leave', {}, a.token);
    expect((await call('POST', '/join', { code: a.code, nick: 'C' })).status).toBe(404);
  });

  it('limite de débit par IP', async () => {
    const { call } = await start(undefined, { ratePerMin: 5 });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await call('GET', '/state')).status);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[6]).toBe(429);
  });

  it('persistance après redémarrage et écriture atomique', async () => {
    const first = await start();
    const a = (await first.call('POST', '/create', { name: 'Persist', nick: 'A' })).body;
    const { id } = (await first.call('POST', '/deposit', { item: sword(9) }, a.token)).body;
    await first.s.close();
    open.length = 0;
    // un reste de fichier temporaire corrompu ne doit rien changer
    writeFileSync(join(first.d, 'guilds.json.99999.tmp'), '{corrompu');
    const second = await start(first.d);
    const st = await second.call('GET', '/state', undefined, a.token);
    expect(st.status).toBe(200);
    expect(st.body.name).toBe('Persist');
    expect(st.body.items[0].id).toBe(id);
    await second.call('POST', '/withdraw', { id }, a.token);
    JSON.parse(readFileSync(join(first.d, 'guilds.json'), 'utf8'));
    expect(readdirSync(first.d).filter((f) => f.endsWith('.tmp') && f.includes(String(process.pid)))).toEqual([]);
  });

  it('objet : structure JSON bornée (base, profondeur, nombres, clés dangereuses)', async () => {
    const { call } = await start();
    const a = (await call('POST', '/create', { name: 'G', nick: 'A' })).body;
    const dep = (item: unknown, raw?: string) => call('POST', '/deposit', raw ? undefined : { item }, a.token, raw).then((r) => r.status);
    expect(await dep({ ...sword(1) })).toBe(200);
    expect(await dep({ base: 'a b' })).toBe(400);
    expect(await dep({ base: 'x'.repeat(65) })).toBe(400);
    expect(await dep({ base: 'x', n: 1e12 })).toBe(400);
    expect(await dep(undefined, '{"item":{"base":"x","n":1e999}}')).toBe(400); // Infinity
    expect(await dep({ base: 'x', a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toBe(400); // trop profond
    expect(await dep(undefined, '{"item":{"base":"x","__proto__":{"admin":true}}}')).toBe(400);
    expect(await dep({ base: 'x', constructor: 1 })).toBe(400);
    expect(await dep({ base: 'x', list: Array.from({ length: 450 }, () => 1) })).toBe(400); // trop de valeurs
    expect(await dep({ base: 'x', list: Array.from({ length: 2500 }, () => 1) })).toBe(413); // plus de 4 Ko
    expect(await dep({ base: 'x', s: 'y'.repeat(300) })).toBe(400); // chaîne trop longue
    expect(await dep({ base: 'x', fn: undefined, ok: [1, 'a', null, true] })).toBe(200);
  });

  it('identifiants de requête qui portent le nom d’une propriété d’objet : refusés', async () => {
    const { call } = await start();
    const a = (await call('POST', '/create', { name: 'G', nick: 'A' })).body;
    for (const reqId of ['__proto__', 'constructor', 'toString']) expect((await call('POST', '/deposit', { item: sword(1), reqId }, a.token)).status).toBe(400);
    expect((await call('POST', '/deposit', { item: sword(1), reqId: 'r-1' }, a.token)).status).toBe(200);
  });

  it('adresse du client : X-Forwarded-For forgé toujours ignoré ; CF-Connecting-IP lu seulement en mode cloudflare et depuis un pair de confiance', async () => {
    const statuses = async (srv: Awaited<ReturnType<typeof start>>, hdr: (i: number) => Record<string, string>) => {
      const out: number[] = [];
      for (let i = 0; i < 5; i++) out.push((await srv.call('GET', '/state', undefined, undefined, undefined, hdr(i))).status);
      return out;
    };
    // mode par défaut (socket) : ni X-Forwarded-For ni CF-Connecting-IP ne changent l'adresse
    const plain = await start(undefined, { ratePerMin: 3 });
    expect((await statuses(plain, (i) => ({ 'X-Forwarded-For': `9.9.9.${i}`, 'CF-Connecting-IP': `8.8.8.${i}` })))[4]).toBe(429);
    // mode cloudflare derrière cloudflared (pair 127.0.0.1) : une adresse par CF-Connecting-IP
    const cf = await start(undefined, { ratePerMin: 3 }, { clientIp: 'cloudflare' });
    expect(await statuses(cf, (i) => ({ 'CF-Connecting-IP': `8.8.8.${i}` }))).toEqual([401, 401, 401, 401, 401]);
    // attaque d'avant le lot 247 : X-Forwarded-For à plusieurs entrées, varié à chaque requête, CF-Connecting-IP fixe (le vrai, posé par Cloudflare)
    const cf2 = await start(undefined, { ratePerMin: 3 }, { clientIp: 'cloudflare' });
    expect((await statuses(cf2, (i) => ({ 'X-Forwarded-For': `1.1.1.${i}, 10.0.0.${i}, 203.0.113.9`, 'CF-Connecting-IP': '203.0.113.9' })))[4]).toBe(429);
    // pair qui n'est pas de confiance : CF-Connecting-IP ignoré
    const other = await start(undefined, { ratePerMin: 3 }, { clientIp: 'cloudflare', trustedPeers: ['10.0.0.1'] });
    expect((await statuses(other, (i) => ({ 'CF-Connecting-IP': `8.8.8.${i}` })))[4]).toBe(429);
  });

  it('makeClientIp : valeurs invalides, IPv6, mode inconnu', () => {
    const req = (remoteAddress: string, headers: Record<string, string | string[]> = {}) => ({ socket: { remoteAddress }, headers }) as never;
    const cf = makeClientIp({ mode: 'cloudflare' });
    expect(cf(req('::ffff:127.0.0.1', { 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(cf(req('::1', { 'cf-connecting-ip': ' 198.51.100.7 ' }))).toBe('198.51.100.7');
    expect(cf(req('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' }))).toBe('127.0.0.1'); // pas une adresse : pair
    expect(cf(req('127.0.0.1', { 'cf-connecting-ip': ['1.2.3.4', '5.6.7.8'] }))).toBe('127.0.0.1');
    expect(cf(req('127.0.0.1', { 'x-forwarded-for': '1.2.3.4' }))).toBe('127.0.0.1');
    expect(cf(req('192.0.2.1', { 'cf-connecting-ip': '1.2.3.4' }))).toBe('192.0.2.1');
    expect(makeClientIp({ mode: 'cloudflare', peers: '192.0.2.1, 192.0.2.2' })(req('192.0.2.2', { 'cf-connecting-ip': '1.2.3.4' }))).toBe('1.2.3.4');
    expect(makeClientIp()(req('127.0.0.1', { 'cf-connecting-ip': '1.2.3.4' }))).toBe('127.0.0.1');
    expect(() => makeClientIp({ mode: 'xff' })).toThrow(/inconnu/);
  });

  it('plafonds : coffres inactifs purgés pour faire de la place, créations limitées par IP et par jour', async () => {
    let t = 1_700_000_000_000;
    const lim = { guilds: 2, authRatePerMin: 100, ratePerMin: 100 };
    const a = await start(undefined, lim, { now: () => t });
    expect((await a.call('POST', '/create', { name: 'A', nick: 'a' })).status).toBe(200);
    expect((await a.call('POST', '/create', { name: 'B', nick: 'b' })).status).toBe(200);
    expect((await a.call('POST', '/create', { name: 'C', nick: 'c' })).status).toBe(503); // 2 coffres au plus
    t += 31 * 86400000; // tout est inactif depuis plus de 30 jours
    expect((await a.call('POST', '/create', { name: 'D', nick: 'd' })).status).toBe(200);
    const b = await start(undefined, { createPerDay: 2, authRatePerMin: 100, ratePerMin: 100 }, { now: () => t });
    expect((await b.call('POST', '/create', { name: 'A', nick: 'a' })).status).toBe(200);
    expect((await b.call('POST', '/create', { name: 'B', nick: 'b' })).status).toBe(200);
    expect((await b.call('POST', '/create', { name: 'C', nick: 'c' })).status).toBe(429);
    t += 86400000;
    expect((await b.call('POST', '/create', { name: 'C', nick: 'c' })).status).toBe(200);
  });

  it('plafond de coffres actifs par IP : 5 IP ne saturent pas le plafond global', async () => {
    let t = 1_700_000_000_000;
    const a = await start(undefined, { activePerIp: 2, authRatePerMin: 100, ratePerMin: 100, guilds: 100 }, { now: () => t, clientIp: 'cloudflare' });
    const as = (ip: string, n: string) => a.call('POST', '/create', { name: n, nick: n }, undefined, undefined, { 'CF-Connecting-IP': ip });
    expect((await as('1.1.1.1', 'A')).status).toBe(200);
    expect((await as('1.1.1.1', 'B')).status).toBe(200);
    expect((await as('1.1.1.1', 'C')).status).toBe(429); // 2 coffres actifs au plus par IP
    expect((await as('2.2.2.2', 'D')).status).toBe(200); // une autre IP n'est pas touchée
    t += 31 * 86400000; // coffres inactifs purgés : la place revient
    expect((await as('1.1.1.1', 'E')).status).toBe(200);
  });

  it('un coffre par jeu de règles : coffres et clients d’avant = pd2, un autre jeu de règles est refusé', async () => {
    const { call, d } = await start();
    // client d'avant (sans jeu de règles) : coffre pd2
    const old = (await call('POST', '/create', { name: 'Ancienne', nick: 'Alice' })).body;
    expect((await call('GET', '/state', undefined, old.token)).body.ruleset).toBe('pd2');
    expect((await call('POST', '/join', { code: old.code, nick: 'Bob', ruleset: 'pd2' })).status).toBe(200);
    expect((await call('POST', '/join', { code: old.code, nick: 'Carl', ruleset: 'd2' })).body.error).toBe('wrong_ruleset');
    // coffre d2 : refusé aux clients pd2 et d'avant (dépôt, retrait, adhésion)
    const v = (await call('POST', '/create', { name: 'Vanilla', nick: 'Dan', ruleset: 'd2' })).body;
    expect((await call('GET', '/state', undefined, v.token)).body.ruleset).toBe('d2');
    expect((await call('POST', '/join', { code: v.code, nick: 'Eve' })).body.error).toBe('wrong_ruleset');
    expect((await call('POST', '/deposit', { item: sword(1), reqId: 'r1' }, v.token)).body.error).toBe('wrong_ruleset');
    const dep = await call('POST', '/deposit', { item: sword(2), reqId: 'r2', ruleset: 'd2' }, v.token);
    expect(dep.status).toBe(200);
    expect((await call('POST', '/withdraw', { id: dep.body.id, reqId: 'r3', ruleset: 'pd2' }, v.token)).body.error).toBe('wrong_ruleset');
    expect((await call('POST', '/withdraw', { id: dep.body.id, reqId: 'r4', ruleset: 'd2' }, v.token)).status).toBe(200);
    expect((await call('POST', '/create', { name: 'X', nick: 'Y', ruleset: 'Pas Valide' })).body.error).toBe('bad_request');
    // coffre enregistré sans jeu de règles (données d'avant) : pd2, sans réécriture préalable
    const file = join(d, 'guilds.json');
    const db = JSON.parse(readFileSync(file, 'utf8'));
    delete db.guilds[old.guildId].ruleset;
    writeFileSync(file, JSON.stringify(db));
    const { call: c2 } = await start(d);
    expect((await c2('GET', '/state', undefined, old.token)).body.ruleset).toBe('pd2');
    expect((await c2('POST', '/deposit', { item: sword(3), reqId: 'r5' }, old.token)).status).toBe(200);
  });
});
