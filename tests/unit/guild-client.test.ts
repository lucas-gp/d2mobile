import { describe, it, expect } from 'vitest';
import { GuildClient, GuildError, depositBlock, isPlausibleItem, type GuildEntry } from '../../src/platform/guild';
import type { Item } from '../../src/sim/item';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const sword = (uid = 's1'): Item => ({ uid, base: 'short_sword', quality: 'normal', ilvl: 1, sockets: 0, socketed: [] });
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

function make(handler: (path: string, body: Record<string, unknown>, n: number) => Promise<Response>, ruleset = 'pd2') {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let ids = 0;
  const storage = mem();
  storage.setItem('d2m.guild', JSON.stringify({ guildId: 'g', token: 'T'.repeat(32), name: 'G', nick: 'Moi' }));
  const c = new GuildClient({
    storage,
    ruleset: () => ruleset,
    newReqId: () => `req${++ids}`,
    timeoutMs: 200,
    fetch: ((url: string, init: RequestInit) => {
      const path = String(url).replace('/guild-api', '');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, body });
      return handler(path, body, calls.length);
    }) as unknown as typeof fetch,
  });
  return { c, calls, storage };
}
const entry = (it = sword()): GuildEntry => ({ id: 'e1', item: it, by: 'Alice', at: 0 });

describe('client de guilde', () => {
  it('retrait sans place : aucun appel réseau', async () => {
    const { c, calls } = make(() => json(200, {}));
    await expect(c.withdraw(entry(), { hasRoom: () => false, place: () => true })).rejects.toMatchObject({ kind: 'bag_full' });
    expect(calls).toHaveLength(0);
  });

  it('retrait : objet déjà pris (409 gone)', async () => {
    const { c } = make(() => json(409, { error: 'gone' }));
    let placed = 0;
    await expect(c.withdraw(entry(), { hasRoom: () => true, place: () => (placed++, true) })).rejects.toMatchObject({ kind: 'gone' });
    expect(placed).toBe(0);
    expect(c.hasPending()).toBe(false);
  });

  it('retrait : ajout local impossible → remis au coffre', async () => {
    const { c, calls } = make((p) => (p === '/withdraw' ? json(200, { item: sword() }) : json(200, { id: 'n' })));
    await expect(c.withdraw(entry(), { hasRoom: () => true, place: () => false })).rejects.toMatchObject({ kind: 'bag_full' });
    expect(calls.map((x) => x.path)).toEqual(['/withdraw', '/deposit']);
    expect(c.hasPending()).toBe(false);
  });

  it('retrait : ajout local impossible ET réseau coupé à la remise au coffre → objet gardé en note, redéposé à la reprise', async () => {
    let online = true;
    const server: string[] = [];
    const { c } = make((p, b) => {
      if (p === '/withdraw') return json(200, { item: sword('rare') });
      if (!online) return Promise.reject(new TypeError('fetch failed'));
      server.push(`${p}:${b.reqId}:${(b.item as Item).uid}`);
      return json(200, { id: 'n' });
    });
    online = true;
    const run = c.withdraw(entry(), { hasRoom: () => true, place: () => false });
    online = false;
    await expect(run).rejects.toMatchObject({ kind: 'bag_full' });
    expect(c.hasPending()).toBe(true); // la seule copie de l'objet
    online = true;
    await c.recover({ hasRoom: () => true, place: () => true });
    expect(server).toHaveLength(1);
    expect(server[0]).toMatch(/^\/deposit:req\d+:rare$/);
    expect(c.hasPending()).toBe(false);
  });

  it('réseau coupé : dépôt non retiré, puis reprise sans doublon', async () => {
    let online = false;
    const server: string[] = [];
    const { c, calls } = make((p, b) => {
      if (!online) return Promise.reject(new TypeError('fetch failed'));
      server.push(p + ':' + b?.reqId);
      return json(200, p === '/deposit' ? { id: 'srv1' } : { item: sword() });
    });
    let removed = 0;
    await expect(c.deposit(sword(), 'Épée', () => (removed++, true))).rejects.toMatchObject({ kind: 'network' });
    expect(removed).toBe(0);
    expect(calls).toHaveLength(2); // un seul rejeu automatique, même reqId
    expect(calls[0].body.reqId).toBe(calls[1].body.reqId);
    expect(c.hasPending()).toBe(true);
    online = true;
    await c.recover({ hasRoom: () => true, place: () => true });
    expect(server[0]).toBe('/deposit:' + calls[0].body.reqId);
    expect(server[1].startsWith('/withdraw')).toBe(true); // annulé côté coffre : l'objet est resté local, jamais en double
    expect(c.hasPending()).toBe(false);
  });

  it('dépôt rejoué après une réponse perdue : même reqId, objet retiré une seule fois', async () => {
    let n = 0;
    const { c, calls } = make(() => (++n === 1 ? Promise.reject(new TypeError('x')) : json(200, { id: 'srv1' })));
    let removed = 0;
    const id = await c.deposit(sword(), 'Épée', () => (removed++, true));
    expect(id).toBe('srv1');
    expect(removed).toBe(1);
    expect(calls[0].body.reqId).toBe(calls[1].body.reqId);
  });

  it('retrait dont la réponse est perdue : repris à la reprise', async () => {
    let online = false;
    const { c } = make((_p) => (online ? json(200, { item: sword('back') }) : Promise.reject(new TypeError('x'))));
    await expect(c.withdraw(entry(), { hasRoom: () => true, place: () => true })).rejects.toMatchObject({ kind: 'network' });
    expect(c.hasPending()).toBe(true);
    online = true;
    const placed: string[] = [];
    const n = await c.recover({ hasRoom: () => true, place: (it) => (placed.push(it.uid), true) });
    expect(n).toBe(1);
    expect(placed).toEqual(['back']);
    expect(c.hasPending()).toBe(false);
  });

  it('401 : session effacée ; erreurs en français', async () => {
    const { c, storage } = make(() => json(401, { error: 'unauthorized' }));
    await expect(c.state()).rejects.toBeInstanceOf(GuildError);
    expect(c.session()).toBeNull();
    expect(storage.m.has('d2m.guild')).toBe(false);
    expect(new GuildError('network').message).toBe('Coffre de guilde indisponible');
  });

  it('objets non déposables', () => {
    expect(depositBlock(sword())).toBeNull();
    expect(depositBlock({ ...sword(), soulbound: true } as unknown as Item)).toMatch(/lié/);
    expect(depositBlock({ ...sword(), rareName: 'x'.repeat(5000) })).toMatch(/volumineux/);
  });
});

describe('objets reçus d’un coffre', () => {
  it('tous les objets que le jeu génère sont jugés plausibles (toutes bases, toutes qualités)', async () => {
    const { generateItem } = await import('../../src/sim/loot/itemgen');
    const { Rng } = await import('../../src/core/rng');
    const { BASES } = await import('../../src/data/items');
    const qualities = ['normal', 'magic', 'rare', 'unique', 'set', 'crafted'] as const;
    let n = 0;
    for (const b of BASES) {
      for (const q of qualities) {
        for (const seed of [1, 2, 3]) {
          let it: Item;
          try {
            it = generateItem(new Rng(seed * 7919), b.id, 10 + seed * 30, { forceQuality: q });
          } catch {
            continue; // combinaison impossible pour cette base
          }
          expect(isPlausibleItem(it), `${b.id}/${q}/${seed}`).toBe(true);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('refuse base inconnue, nombres absurdes, qualité inventée, trop de châsses', () => {
    const ok = sword();
    expect(isPlausibleItem(ok)).toBe(true);
    expect(isPlausibleItem({ ...ok, base: 'nope' })).toBe(false);
    expect(isPlausibleItem({ ...ok, base: '__proto__' })).toBe(false);
    expect(isPlausibleItem({ ...ok, ilvl: Infinity })).toBe(false);
    expect(isPlausibleItem({ ...ok, ilvl: NaN })).toBe(false);
    expect(isPlausibleItem({ ...ok, quality: 'divine' })).toBe(false);
    expect(isPlausibleItem({ ...ok, socketed: Array.from({ length: 20 }, () => sword()) })).toBe(false);
    expect(isPlausibleItem({ ...ok, qty: 1e12 })).toBe(false);
    expect(isPlausibleItem({ ...ok, affixes: [{ id: 'x', values: [1, 'a'] }] })).toBe(false);
    expect(isPlausibleItem(null)).toBe(false);
    expect(isPlausibleItem([])).toBe(false);
  });

  it('retrait d’un objet inconnu : refusé avant tout appel réseau', async () => {
    const { c, calls } = make(() => json(200, {}));
    await expect(c.withdraw(entry({ ...sword(), base: 'unknown_base' }), { hasRoom: () => true, place: () => true })).rejects.toMatchObject({ kind: 'bad_item' });
    expect(calls).toHaveLength(0);
  });

  it('un coffre de guilde par jeu de règles : session à part, jeu de règles envoyé, coffre d’un autre jeu de règles refusé', async () => {
    const pd2 = make(() => json(200, { name: 'G', members: [], items: [], log: [] }));
    // serveur d'avant (sans jeu de règles) : coffre pd2, accepté par un client pd2
    expect((await pd2.c.state()).ruleset).toBe('pd2');
    const d2 = make(() => json(200, { name: 'G', ruleset: 'pd2', members: [], items: [], log: [] }), 'd2');
    // session de pd2 seulement : le client d2 n'est membre de rien
    expect(d2.c.session()).toBeNull();
    d2.storage.setItem('d2m.guild.d2', JSON.stringify({ guildId: 'v', token: 'V'.repeat(32), name: 'V', nick: 'Moi' }));
    await expect(d2.c.state()).rejects.toMatchObject({ kind: 'wrong_ruleset' });
    await d2.c.deposit(sword(), 'Épée', () => true).catch(() => undefined);
    expect(d2.calls.at(-1)?.body.ruleset).toBe('d2');
    const e = make(() => json(409, { error: 'wrong_ruleset' }));
    await expect(e.c.join('ABCD-EFGH-JKMN-PQRS', 'Moi')).rejects.toBeInstanceOf(GuildError);
    expect(e.calls[0].body.ruleset).toBe('pd2');
  });
});
