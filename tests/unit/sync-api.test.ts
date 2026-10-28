/** API de synchronisation : logique serveur avec un faux stockage Blob en mémoire (ETag, écriture conditionnelle). */
import { beforeEach, describe, expect, it } from 'vitest';
import { handle, MAX_SAVE_BYTES, MAX_SLOTS, resetRateLimits, StoreConflict, type Deps, type Res, type Store } from '../../api/_lib/core';
import { originAllowed } from '../../api/sync';

class MemStore implements Store {
  files = new Map<string, { data: Uint8Array; etag: string }>();
  n = 0;
  failNextPutFor: string | null = null;
  async get(p: string) {
    return this.files.get(p) ?? null;
  }
  async put(p: string, data: Uint8Array, o: { ifMatch?: string; createOnly?: boolean } = {}) {
    const cur = this.files.get(p);
    if (this.failNextPutFor === p) {
      this.failNextPutFor = null;
      throw new StoreConflict();
    }
    if (o.createOnly && cur) throw new StoreConflict();
    if (o.ifMatch && cur?.etag !== o.ifMatch) throw new StoreConflict();
    const etag = `e${++this.n}`;
    this.files.set(p, { data: new Uint8Array(data), etag });
    return { etag };
  }
  async del(ps: string[]) {
    for (const p of ps) this.files.delete(p);
  }
  async list(prefix: string) {
    return [...this.files.keys()].filter((k) => k.startsWith(prefix));
  }
}

const b64 = (n: number, fill = 7) => Buffer.alloc(n, fill).toString('base64');
const AUTH = b64(32, 1);
const SALT = b64(16, 2);
let store: MemStore;
let clock: number;
let sleeps: number[];
let deps: Deps;
const call = (body: Record<string, unknown>, ip = '1.1.1.1'): Promise<Res> => handle(deps, { ip, body });
const reg = (name = 'alice', auth = AUTH) => call({ action: 'register', name, authHash: auth, salt: SALT, iterations: 600000 });
const cred = { name: 'alice', authHash: AUTH };
const put = (slot: string, base: number | undefined, fill = 9, size = 64) => call({ action: 'put', ...cred, slot, blob: b64(size, fill), updatedAt: clock, baseUpdatedAt: base });

beforeEach(() => {
  store = new MemStore();
  clock = 1_700_000_000_000;
  sleeps = [];
  resetRateLimits();
  deps = { store, pepper: 'p'.repeat(40), now: () => (clock += 10), sleep: async (ms) => void sleeps.push(ms) };
});

describe('API sync : comptes', () => {
  it('crée un compte, refuse un doublon et un nom invalide', async () => {
    expect((await reg()).status).toBe(200);
    expect((await reg('ALICE')).status).toBe(409); // nom normalisé
    expect((await reg('ab')).status).toBe(400);
    expect((await reg('a b c')).status).toBe(400);
    expect((await reg('x'.repeat(33))).status).toBe(400);
    expect((await call({ action: 'register', name: 'bob', authHash: AUTH, salt: SALT, iterations: 1000 })).status).toBe(400); // dérivation trop faible
  });

  it('ne stocke ni le nom en clair, ni l’authHash en clair', async () => {
    await reg();
    const keys = [...store.files.keys()];
    expect(keys.every((k) => !k.includes('alice'))).toBe(true);
    const raw = Buffer.from(store.files.get(keys[0])!.data).toString();
    expect(raw).not.toContain(AUTH);
    expect(raw).not.toContain('alice');
  });

  it('login : bon mot de passe, mauvais mot de passe et compte inconnu donnent la même erreur', async () => {
    await reg();
    expect((await call({ action: 'login', ...cred })).status).toBe(200);
    const bad = await call({ action: 'login', name: 'alice', authHash: b64(32, 5) });
    const unknown = await call({ action: 'login', name: 'zoe', authHash: AUTH });
    expect(bad).toEqual(unknown);
    expect(bad.status).toBe(401);
  });

  it('params : faux sel déterministe pour un compte inconnu, vrai sel pour un compte existant', async () => {
    const a = await call({ action: 'params', name: 'zoe' });
    const b = await call({ action: 'params', name: 'zoe' });
    expect(a.body.salt).toBe(b.body.salt);
    await reg();
    expect((await call({ action: 'params', name: 'alice' })).body.salt).toBe(SALT);
    expect(a.body.iterations).toBe(600000);
  });

  it('verrouillage doux après 5 échecs, délai croissant, même le bon mot de passe est refusé pendant le verrou', async () => {
    await reg();
    const bad = { action: 'login', name: 'alice', authHash: b64(32, 5) };
    for (let i = 0; i < 5; i++) expect((await call(bad)).status).toBe(401);
    expect(sleeps.length).toBe(5);
    expect(sleeps[4]).toBeGreaterThan(sleeps[0]);
    expect((await call({ action: 'login', ...cred })).status).toBe(429);
    clock += 60_000;
    expect((await call({ action: 'login', ...cred })).status).toBe(200);
    // le compteur est remis à zéro après une réussite
    expect((await call(bad)).status).toBe(401);
    expect((await call({ action: 'login', ...cred })).status).toBe(200);
  });

  it('limite de débit par IP pour les créations de compte', async () => {
    for (let i = 0; i < 5; i++) expect((await reg(`user${i}`)).status).toBe(200);
    expect((await reg('user99')).status).toBe(429);
    expect((await reg('user98', AUTH)).status).toBe(429);
    expect((await call({ action: 'register', name: 'other', authHash: AUTH, salt: SALT, iterations: 600000 }, '2.2.2.2')).status).toBe(200);
  });
});

describe('API sync : sauvegardes', () => {
  beforeEach(async () => void (await reg()));

  it('put / list / get : aller-retour du blob tel quel', async () => {
    const r = await put('abc-1', undefined, 9);
    expect(r.status).toBe(200);
    const l = await call({ action: 'list', ...cred });
    expect(l.body.slots).toEqual([expect.objectContaining({ slot: 'abc-1', updatedAt: r.body.updatedAt, size: 64 })]);
    const g = await call({ action: 'get', ...cred, slot: 'abc-1' });
    expect(g.body.blob).toBe(b64(64, 9));
    expect((await call({ action: 'get', ...cred, slot: 'nope' })).status).toBe(404);
  });

  it('409 si la version serveur est plus récente que la base ; accepté avec la bonne base', async () => {
    deps.gcBatch = 1; // suppression immédiate (comportement historique) ; le mode groupé est testé dans sync-quota.test.ts
    const a = await put('s1', undefined, 1);
    const rev1 = a.body.updatedAt as number;
    expect((await put('s1', undefined, 2)).status).toBe(409); // « nouvel appareil » qui ne connaît pas la version
    const c = await put('s1', 0, 2);
    expect(c.status).toBe(409);
    expect(c.body.serverUpdatedAt).toBe(rev1);
    const ok = await put('s1', rev1, 3);
    expect(ok.status).toBe(200);
    expect(ok.body.updatedAt as number).toBeGreaterThan(rev1);
    expect((await call({ action: 'get', ...cred, slot: 's1' })).body.blob).toBe(b64(64, 3));
    expect((await put('s1', rev1, 4)).status).toBe(409); // base périmée
    // l'ancienne révision est supprimée du stockage
    expect([...store.files.keys()].filter((k) => k.startsWith('saves/')).length).toBe(1);
  });

  it('course entre deux appareils : l’écriture conditionnelle de l’index n’écrase pas la plus récente', async () => {
    const a = await put('s1', undefined, 1);
    const base = a.body.updatedAt as number;
    // l'appareil B écrit juste après la lecture de A : on simule en faisant échouer la 1re écriture d'index de A
    const idx = [...store.files.keys()].find((k) => k.startsWith('accounts/'))!;
    store.failNextPutFor = idx;
    const sneaky = put('s1', base, 2);
    // entre-temps, B écrit réellement
    const r = await sneaky; // A rejoue : l'index n'a pas changé, donc A passe au 2e essai
    expect(r.status).toBe(200);
    const b = await put('s1', base, 3); // B a la même base : refusé
    expect(b.status).toBe(409);
    expect((await call({ action: 'get', ...cred, slot: 's1' })).body.blob).toBe(b64(64, 2));
  });

  it('limites : taille, nombre d’emplacements, identifiants et corps invalides', async () => {
    expect((await put('big', undefined, 1, MAX_SAVE_BYTES + 1)).status).toBe(413);
    expect((await put('big', undefined, 1, MAX_SAVE_BYTES)).status).toBe(200);
    for (let i = 0; i < MAX_SLOTS - 1; i++) expect((await put(`s${i}`, undefined)).status).toBe(200);
    expect((await put('one-too-many', undefined)).status).toBe(400);
    expect((await put('s0', 1e15)).status).toBe(200); // un emplacement existant reste modifiable
    expect((await put('../evil', undefined)).status).toBe(400);
    expect((await put('A/B', undefined)).status).toBe(400);
    expect((await call({ action: 'put', ...cred, slot: 'x', blob: '!!!', updatedAt: 1 })).status).toBe(400);
    expect((await call({ action: 'nope', ...cred })).status).toBe(400);
    expect((await handle(deps, { ip: 'x', body: null })).status).toBe(400);
  });

  it('emplacements nommés comme une propriété d’objet (constructor, __proto__…) : refusés partout', async () => {
    for (const slot of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']) {
      expect((await put(slot, undefined)).status).toBe(400);
      expect((await call({ action: 'get', ...cred, slot })).status).toBe(404);
      expect((await call({ action: 'delete', ...cred, slot })).status).toBe(400);
    }
    expect((await put('proto', undefined)).status).toBe(200);
  });

  it('un compte ne voit jamais les emplacements d’un autre', async () => {
    await put('mine', undefined, 4);
    await reg('bobby', b64(32, 3));
    const l = await call({ action: 'list', name: 'bobby', authHash: b64(32, 3) });
    expect(l.body.slots).toEqual([]);
    expect((await call({ action: 'get', name: 'bobby', authHash: b64(32, 3), slot: 'mine' })).status).toBe(404);
  });

  it('delete : un emplacement (avec contrôle de version), puis tout le compte', async () => {
    const a = await put('s1', undefined);
    expect((await call({ action: 'delete', ...cred, slot: 's1', baseUpdatedAt: 1 })).status).toBe(409);
    expect((await call({ action: 'delete', ...cred, slot: 's1', baseUpdatedAt: a.body.updatedAt })).status).toBe(200);
    expect((await call({ action: 'list', ...cred })).body.slots).toEqual([]);
    await put('s2', undefined);
    expect((await call({ action: 'delete', ...cred, all: true })).status).toBe(200);
    // il ne reste que le compteur global des comptes, revenu à zéro
    expect([...store.files.keys()]).toEqual(['meta/accounts.json']);
    expect(JSON.parse(Buffer.from(store.files.get('meta/accounts.json')!.data).toString()).count).toBe(0);
    expect((await call({ action: 'login', ...cred })).status).toBe(401);
  });

  it('changePassword : blobs ré-chiffrés mis de côté puis validés ; l’ancien mot de passe ne marche plus', async () => {
    const a = await put('s1', undefined, 1);
    const newAuth = b64(32, 8);
    const newSalt = b64(16, 4);
    const body = { action: 'changePassword', ...cred, newAuthHash: newAuth, newSalt, newIterations: 700000 };
    expect((await call(body)).status).toBe(409); // rien de mis de côté
    expect((await call({ action: 'stage', ...cred, slot: 's1', sourceUpdatedAt: 5, blob: b64(64, 6) })).status).toBe(409);
    expect((await call({ action: 'stage', ...cred, slot: 's1', sourceUpdatedAt: a.body.updatedAt, blob: b64(64, 6) })).status).toBe(200);
    expect((await call({ action: 'get', ...cred, slot: 's1' })).body.blob).toBe(b64(64, 1)); // copie en ligne intacte
    expect((await call(body)).status).toBe(200);
    expect((await call({ action: 'login', ...cred })).status).toBe(401);
    const l = await call({ action: 'login', name: 'alice', authHash: newAuth });
    expect(l.status).toBe(200);
    expect(l.body.salt).toBe(newSalt);
    expect(l.body.iterations).toBe(700000);
    expect((await call({ action: 'get', name: 'alice', authHash: newAuth, slot: 's1' })).body.blob).toBe(b64(64, 6));
    expect([...store.files.keys()].filter((k) => k.startsWith('staging/')).length).toBe(0);
  });
});

describe('API sync : origines (CORS)', () => {
  it('autorise le site, son domaine et localhost hors production, refuse le reste', () => {
    expect(originAllowed('https://app.example.com', 'x', { SYNC_ALLOWED_ORIGINS: 'https://app.example.com' })).toBe(true);
    expect(originAllowed('https://app.example.com', 'x', {})).toBe(false);
    expect(originAllowed('https://abc-preview.vercel.app', 'abc-preview.vercel.app', { VERCEL_ENV: 'preview' })).toBe(true);
    expect(originAllowed('https://evil.example', 'app.example.com', {})).toBe(false);
    expect(originAllowed('http://localhost:5173', 'x', {})).toBe(true);
    expect(originAllowed('http://localhost:5173', 'x', { VERCEL_ENV: 'production' })).toBe(false);
    expect(originAllowed('not a url', 'x', {})).toBe(false);
  });
});

describe('API sync : verrouillage par un tiers, appareils reconnus et plafonds de stockage (lot 247)', () => {
  const DEV = b64(32, 3);
  const acctOf = () => {
    const k = [...store.files.keys()].find((x) => x.startsWith('accounts/'))!;
    return JSON.parse(Buffer.from(store.files.get(k)!.data).toString()) as { devices?: { id: string; fails: number }[] };
  };
  const bad = { action: 'login', name: 'alice', authHash: b64(32, 5) };

  it('un tiers qui verrouille le compte ne bloque pas un appareil déjà connecté', async () => {
    expect((await call({ action: 'register', name: 'alice', authHash: AUTH, salt: SALT, iterations: 600000, device: DEV })).status).toBe(200);
    expect(acctOf().devices).toHaveLength(1);
    expect(JSON.stringify(acctOf())).not.toContain(DEV); // seulement une empreinte
    for (let i = 0; i < 5; i++) expect((await call(bad, `9.9.9.${i}`)).status).toBe(401);
    expect((await call({ action: 'login', ...cred })).status).toBe(429); // sans jeton : verrouillé
    expect((await call({ action: 'login', ...cred, device: b64(32, 4) })).status).toBe(429); // appareil inconnu : verrouillé
    expect((await call({ action: 'list', ...cred, device: DEV })).status).toBe(200); // appareil reconnu : passe
    expect((await call({ action: 'login', ...cred, device: 'pas-du-base64' })).status).toBe(401);
  });

  it('un appareil reconnu a ses propres échecs et est oublié après 5', async () => {
    await call({ action: 'register', name: 'alice', authHash: AUTH, salt: SALT, iterations: 600000, device: DEV });
    for (let i = 0; i < 4; i++) expect((await call({ ...bad, device: DEV })).status).toBe(401);
    expect(acctOf().devices?.[0].fails).toBe(4);
    expect((await call({ action: 'login', ...cred })).status).toBe(200); // le compte lui-même n'est pas verrouillé
    expect((await call({ ...bad, device: DEV })).status).toBe(401);
    expect(acctOf().devices).toEqual([]);
    // une réussite normale le reconnaît de nouveau
    expect((await call({ action: 'login', ...cred, device: DEV })).status).toBe(200);
    expect(acctOf().devices).toHaveLength(1);
  });

  it('nouvel appareil reconnu après une réussite hors verrouillage ; 10 appareils au plus', async () => {
    await reg();
    expect(acctOf().devices).toBeUndefined(); // ancien client : aucun champ
    for (let i = 0; i < 12; i++) expect((await call({ action: 'login', ...cred, device: b64(32, 100 + i) })).status).toBe(200);
    expect(acctOf().devices).toHaveLength(10);
  });

  it('plafond global de comptes (compteur recréé depuis les comptes existants), rendu à la suppression', async () => {
    deps.maxAccounts = 2;
    expect((await reg('alice')).status).toBe(200);
    expect((await reg('bob')).status).toBe(200);
    expect((await reg('alice')).status).toBe(409); // déjà pris : aucune place consommée
    expect((await call({ action: 'register', name: 'carol', authHash: AUTH, salt: SALT, iterations: 600000 }, '2.2.2.2')).status).toBe(403);
    store.files.delete('meta/accounts.json'); // compteur absent (comptes d'avant le lot 247) : recompté
    expect((await call({ action: 'register', name: 'carol', authHash: AUTH, salt: SALT, iterations: 600000 }, '2.2.2.2')).body.error).toBe('accounts_full');
    expect((await call({ action: 'delete', ...cred, all: true })).status).toBe(200);
    expect((await call({ action: 'register', name: 'carol', authHash: AUTH, salt: SALT, iterations: 600000 }, '2.2.2.2')).status).toBe(200);
  });

  it('plafond de taille par compte ; un compte déjà au-dessus peut rétrécir ou garder sa taille', async () => {
    await reg();
    deps.maxAccountBytes = 200;
    const a = await put('s1', undefined, 1, 100);
    expect(a.status).toBe(200);
    expect((await put('s2', undefined, 1, 100)).status).toBe(200);
    const over = await put('s3', undefined, 1, 64);
    expect(over.status).toBe(413);
    expect(over.body).toMatchObject({ error: 'quota', max: 200 });
    deps.maxAccountBytes = 150; // plafond abaissé : le compte (200) est au-dessus
    const same = await put('s1', a.body.updatedAt as number, 2, 100);
    expect(same.status).toBe(200);
    expect((await put('s1', same.body.updatedAt as number, 2, 120)).status).toBe(413);
    expect((await put('s1', same.body.updatedAt as number, 2, 40)).status).toBe(200);
  });

  it('stage : une seule copie mise de côté par emplacement, taille bornée par celle de la sauvegarde', async () => {
    await reg();
    const r1 = await put('s1', undefined, 1, 100);
    const st = (src: number, size = 100) => call({ action: 'stage', ...cred, slot: 's1', sourceUpdatedAt: src, blob: b64(size, 6) });
    expect((await st(r1.body.updatedAt as number)).status).toBe(200);
    const r2 = await put('s1', r1.body.updatedAt as number, 2, 100);
    expect((await st(r2.body.updatedAt as number)).status).toBe(200);
    expect([...store.files.keys()].filter((k) => k.startsWith('staging/'))).toHaveLength(1);
    expect((await st(r2.body.updatedAt as number, 100 + 1025)).status).toBe(413);
  });
});

describe('API sync : variables de plafond', () => {
  it('envInt : entier positif, sinon défaut', async () => {
    const { envInt } = await import('../../api/sync');
    expect(envInt('500')).toBe(500);
    for (const v of [undefined, '', '0', '-3', '1.5', 'abc']) expect(envInt(v)).toBeUndefined();
  });
});
