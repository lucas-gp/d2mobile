/** Plateforme : SaveStore (sauvegarde, copie de secours, quota), journal d'erreurs, cache hors ligne, packs */
import { beforeEach, describe, expect, it } from 'vitest';
import { SaveStore, isValidSaveText, FutureSaveError, keyOfSyncId, sharedKeyOf, sharedRulesetOfKey, sharedSyncIdOf, syncIdOfKey } from '../../src/platform/platform';
import { Game } from '../../src/sim/game';
import { deserialize, serialize, SAVE_VERSION, migrate } from '../../src/sim/save';
import { formatErrorLog, installGlobalErrorHandlers, logError, onAlert, raiseAlert, readErrorLog, resetErrorHandlersForTest, reportError } from '../../src/platform/errorlog';
import { isQuotaError, packStatus, purgeOtherVersions, recordPack, storeFile } from '../../src/platform/d2cache';
import { downloadPack, PackError, PACKS, type PackBank } from '../../src/platform/packs';

/** localStorage factice avec quota (en caractères) */
class FakeStorage {
  data = new Map<string, string>();
  quota = Infinity;
  get length(): number {
    return this.data.size;
  }
  key(i: number): string | null {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    let total = v.length;
    for (const [kk, vv] of this.data) if (kk !== k) total += vv.length;
    if (total > this.quota) {
      const e = new Error('The quota has been exceeded.');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

/** API Cache factice (clés = adresses complètes) */
class FakeCache {
  map = new Map<string, Response>();
  failPut: Error | null = null;
  async match(req: string | { url: string }): Promise<Response | undefined> {
    return this.map.get(typeof req === 'string' ? req : req.url)?.clone();
  }
  async put(req: string | { url: string }, res: Response): Promise<void> {
    if (this.failPut) throw this.failPut;
    this.map.set(typeof req === 'string' ? req : req.url, res);
  }
  async delete(req: string | { url: string }): Promise<boolean> {
    return this.map.delete(typeof req === 'string' ? req : req.url);
  }
  async keys(req?: string, opts?: { ignoreSearch?: boolean }): Promise<{ url: string }[]> {
    const all = [...this.map.keys()].map((url) => ({ url }));
    if (!req || !opts?.ignoreSearch) return all;
    const base = new URL(req).pathname;
    return all.filter((k) => new URL(k.url).pathname === base);
  }
}

let ls: FakeStorage;
let cache: FakeCache;
beforeEach(() => {
  ls = new FakeStorage();
  cache = new FakeCache();
  (globalThis as unknown as { localStorage: FakeStorage }).localStorage = ls;
  (globalThis as unknown as { caches: unknown }).caches = { open: async () => cache };
  (globalThis as unknown as { location: { href: string } }).location = { href: 'http://localhost/app/' };
  resetErrorHandlersForTest();
});

const save = () => new Game().toSave();

describe('SaveStore', () => {
  it('aller-retour et copie de secours de l’écriture précédente', () => {
    const s = save();
    s.character.name = 'A';
    expect(SaveStore.save(s, 'd2m.save.x')).toBe(true);
    s.character.name = 'B';
    expect(SaveStore.save(s, 'd2m.save.x')).toBe(true);
    expect(SaveStore.load('d2m.save.x')!.character.name).toBe('B');
    expect(deserialize(ls.getItem('d2m.save.x.backup')!).character.name).toBe('A');
  });

  it('copie avant fusion des coffres : écrite une seule fois, jamais écrasée, hors liste des personnages', () => {
    const slot = 'd2m.save.z';
    const s = save();
    s.character.name = 'Avant';
    SaveStore.save(s, slot);
    expect(SaveStore.backupBeforeStashMerge(slot)).toBe(true);
    s.character.name = 'Apres';
    SaveStore.save(s, slot);
    expect(SaveStore.backupBeforeStashMerge(slot)).toBe(true);
    expect(deserialize(ls.getItem(`${slot}.premigration-stash`)!).character.name).toBe('Avant');
    expect(SaveStore.slotKeys()).toEqual([slot]);
    SaveStore.clear(slot);
    expect(ls.getItem(`${slot}.premigration-stash`)).toBeNull();
  });

  it('emplacement d’origine : ses copies (.backup, .presync, .premigration-stash) ne sont pas des personnages', () => {
    const s = save();
    s.character.name = 'Origine';
    SaveStore.save(s, 'd2m.save');
    s.character.name = 'Origine2';
    SaveStore.save(s, 'd2m.save'); // crée d2m.save.backup
    expect(SaveStore.backupBeforeStashMerge('d2m.save')).toBe(true);
    ls.setItem('d2m.save.presync', ls.getItem('d2m.save')!);
    expect(SaveStore.slotKeys()).toEqual(['d2m.save']);
    expect(SaveStore.list().map((c) => c.slot)).toEqual(['d2m.save']);
  });

  it('R2 : une principale corrompue n’écrase pas la copie saine', () => {
    const slot = 'd2m.save.y';
    const s = save();
    s.character.name = 'Sain';
    SaveStore.save(s, slot);
    s.character.name = 'Sain2';
    SaveStore.save(s, slot); // backup = Sain
    ls.setItem(slot, '{corrompu');
    s.character.name = 'Apres';
    SaveStore.save(s, slot);
    // la copie de secours est toujours la dernière bonne (Sain), pas le JSON cassé
    expect(isValidSaveText(ls.getItem(`${slot}.backup`))).toBe(true);
    expect(deserialize(ls.getItem(`${slot}.backup`)!).character.name).toBe('Sain');
    expect(SaveStore.load(slot)!.character.name).toBe('Apres');
  });

  it('load retombe sur la copie quand la principale est illisible', () => {
    const slot = 'd2m.save.z';
    const s = save();
    s.character.name = 'Copie';
    ls.setItem(`${slot}.backup`, serialize(s));
    ls.setItem(slot, 'pas du json');
    expect(SaveStore.load(slot)!.character.name).toBe('Copie');
  });

  it('R1 : quota dépassé -> false, lastError, alerte visible, journal ; la précédente reste intacte', () => {
    const slot = 'd2m.save.q';
    const s = save();
    expect(SaveStore.save(s, slot)).toBe(true);
    const before = ls.getItem(slot);
    ls.quota = (before?.length ?? 0) - 10;
    const alerts: string[] = [];
    onAlert((k, t) => alerts.push(`${k}:${t}`));
    expect(SaveStore.save(s, slot)).toBe(false);
    expect(SaveStore.lastError?.quota).toBe(true);
    expect(alerts.some((a) => a.startsWith('save:') && /plein/.test(a))).toBe(true);
    expect(readErrorLog().some((e) => e.kind === 'sauvegarde')).toBe(true);
    expect(SaveStore.load(slot)).not.toBeNull();
    // retour à la normale
    ls.quota = Infinity;
    expect(SaveStore.save(s, slot)).toBe(true);
    expect(SaveStore.lastError).toBeNull();
  });

  it('plus de place pour la copie : la principale s’écrit quand même', () => {
    const slot = 'd2m.save.c';
    const s = save();
    SaveStore.save(s, slot);
    const size = ls.getItem(slot)!.length;
    ls.quota = size + 50; // la principale tient, pas la copie
    expect(SaveStore.save(s, slot)).toBe(true);
  });

  it('B8 : une sauvegarde d’une version plus récente ne retombe pas silencieusement sur la copie', () => {
    const slot = 'd2m.save.f';
    const old = save();
    ls.setItem(`${slot}.backup`, serialize(old));
    ls.setItem(slot, JSON.stringify({ ...old, version: SAVE_VERSION + 1 }));
    expect(() => SaveStore.load(slot)).toThrow(FutureSaveError);
  });

  it('list : trie par date et ignore les emplacements illisibles', () => {
    const a = { ...save(), savedAt: 10 };
    const b = { ...save(), savedAt: 20 };
    ls.setItem('d2m.save.a', JSON.stringify(a));
    ls.setItem('d2m.save.b', JSON.stringify(b));
    ls.setItem('d2m.save.c', '{x');
    expect(SaveStore.list().map((c) => c.slot)).toEqual(['d2m.save.b', 'd2m.save.a']);
  });

  it('coffre partagé : copie valide seulement, alerte au quota', () => {
    const shared = { version: 1 as const, tabs: [[null], [null]] };
    SaveStore.saveShared(shared, 'pd2');
    SaveStore.saveShared({ ...shared, tabs: [[null]] }, 'pd2');
    ls.setItem('d2m.shared', 'cassé');
    SaveStore.saveShared(shared, 'pd2');
    expect(ls.getItem('d2m.shared.backup')).toContain('tabs');
  });

  it('coffre partagé inchangé : aucune écriture, et la copie de secours garde la version d’avant le dernier changement', () => {
    const a = { version: 1 as const, tabs: [[null]], gold: 1 };
    const b = { version: 1 as const, tabs: [[null]], gold: 2 };
    SaveStore.saveShared(a as never, 'pd2');
    SaveStore.saveShared(b as never, 'pd2');
    expect(ls.getItem('d2m.shared.backup')).toContain('"gold":1');
    const writes: string[] = [];
    const set = ls.setItem.bind(ls);
    ls.setItem = (k: string, v: string) => {
      writes.push(k);
      set(k, v);
    };
    for (let i = 0; i < 5; i++) expect(SaveStore.saveShared(b as never, 'pd2')).toBe(true);
    expect(writes).toEqual([]);
    expect(ls.getItem('d2m.shared.backup')).toContain('"gold":1');
  });

  it('un coffre partagé par jeu de règles : celui de pd2 garde la clé et l’identifiant de synchronisation d’origine', () => {
    expect(sharedKeyOf('pd2')).toBe('d2m.shared');
    expect(sharedKeyOf('d2')).toBe('d2m.shared.d2');
    expect(sharedSyncIdOf('pd2')).toBe('shared');
    expect(sharedSyncIdOf('d2')).toBe('shared-d2');
    expect(syncIdOfKey('d2m.shared.d2')).toBe('shared-d2');
    expect(keyOfSyncId('shared-d2')).toBe('d2m.shared.d2');
    expect(keyOfSyncId('shared')).toBe('d2m.shared');
    // copies et dates d'un coffre : jamais un jeu de règles
    for (const k of ['d2m.shared.backup', 'd2m.shared.at', 'd2m.shared.presync', 'd2m.shared.d2.at']) expect(sharedRulesetOfKey(k), k).toBeNull();
    expect(() => sharedKeyOf('backup')).toThrow();
    const a = { version: 1 as const, tabs: [[null]], gold: 1 };
    const b = { version: 1 as const, tabs: [[null]], gold: 2 };
    SaveStore.saveShared(a as never, 'pd2');
    SaveStore.saveShared(b as never, 'd2');
    expect(SaveStore.loadShared('pd2')).toMatchObject({ gold: 1 });
    expect(SaveStore.loadShared('d2')).toMatchObject({ gold: 2 });
    expect(SaveStore.sharedKeys()).toEqual(['d2m.shared', 'd2m.shared.d2']);
    expect(SaveStore.rawText('d2m.shared.d2')?.text).toContain('"gold":2');
  });

  it('lot 299: a game mode has its own stash, first a copy of its content stash, then apart from it', () => {
    expect(sharedKeyOf('d2+survivals')).toBe('d2m.shared.d2+survivals');
    expect(sharedKeyOf('pd2+survivals')).toBe('d2m.shared.pd2+survivals');
    expect(sharedSyncIdOf('pd2+survivals')).toBe('shared-pd2_survivals');
    expect(keyOfSyncId('shared-pd2_survivals')).toBe('d2m.shared.pd2+survivals');
    expect(syncIdOfKey('d2m.shared.d2+survivals')).toBe('shared-d2_survivals');
    for (const k of ['d2m.shared.d2+survivals.backup', 'd2m.shared.d2+survivals.at', 'd2m.shared.d2+at']) expect(sharedRulesetOfKey(k), k).toBeNull();
    expect(sharedRulesetOfKey('d2m.shared.d2+survivals')).toBe('d2+survivals');
    const pd2 = { version: 1 as const, tabs: [[null]], gold: 7 };
    SaveStore.saveShared(pd2 as never, 'pd2');
    // first use: the content's stash copied (nothing it held is lost to the mode), the content's untouched
    expect(SaveStore.loadShared('pd2+survivals')).toMatchObject({ gold: 7 });
    SaveStore.saveShared({ ...pd2, gold: 50 } as never, 'pd2+survivals');
    expect(SaveStore.loadShared('pd2')).toMatchObject({ gold: 7 });
    // copied once: a later change of the content's stash does not reach the mode's, and the reverse
    SaveStore.saveShared({ ...pd2, gold: 9 } as never, 'pd2');
    expect(SaveStore.loadShared('pd2+survivals')).toMatchObject({ gold: 50 });
    // the two modes apart: d2's has no stash, so d2+survivals starts empty
    expect(SaveStore.loadShared('d2+survivals')).toBeNull();
    expect(SaveStore.sharedKeys()).toContain('d2m.shared.pd2+survivals');
  });
});

describe('Migrations de sauvegarde', () => {
  it('une sauvegarde v1 minimale est migrée jusqu’à la version courante', () => {
    const s = save();
    const v1 = JSON.parse(serialize(s)) as Record<string, unknown>;
    v1.version = 1;
    delete v1.runCounter;
    const c = v1.character as Record<string, unknown>;
    delete c.materials;
    const prog = c.progression as Record<string, unknown>;
    delete prog.bonusSkillPoints;
    delete prog.bonusStatPoints;
    (v1.settings as Record<string, unknown>).lighting = 'clair';
    const m = migrate(v1);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.runCounter).toBe(0);
    expect(m.character.materials).toEqual({});
    expect(m.character.progression.bonusSkillPoints).toBe(0);
    expect(m.settings.lighting).toBe('penombre');
    expect(new Game(m).character.name).toBe(s.character.name);
  });

  it('version future refusée, entrée non objet refusée', () => {
    expect(() => migrate({ version: SAVE_VERSION + 3 })).toThrow(/plus récente/);
    expect(() => migrate(null)).toThrow();
  });

  it('craftSeq : absent -> 0, et fait l’aller-retour', () => {
    const g = new Game();
    expect(g.craftSeq).toBe(0);
    g.craftSeq = 7;
    expect(new Game(deserialize(serialize(g.toSave()))).craftSeq).toBe(7);
  });
});

describe('Journal d’erreurs', () => {
  it('borne le journal, fusionne les répétitions, exporte du texte', () => {
    for (let i = 0; i < 100; i++) logError('t', new Error(`e${i}`), 1000 + i);
    expect(readErrorLog().length).toBe(60);
    expect(logError('t', new Error('e99'), 5000)).toBe(false);
    expect(readErrorLog().length).toBe(60);
    const txt = formatErrorLog(readErrorLog().slice(-2), 'UA');
    expect(txt).toContain('UA');
    expect(txt).toContain('e99');
  });

  it('raiseAlert : limite de fréquence par texte', () => {
    const got: string[] = [];
    onAlert((_k, t) => got.push(t));
    expect(raiseAlert('error', 'x', 1000, 0)).toBe(true);
    expect(raiseAlert('error', 'x', 1000, 500)).toBe(false);
    expect(raiseAlert('error', 'x', 1000, 1500)).toBe(true);
    expect(raiseAlert('error', 'y', 1000, 1500)).toBe(true);
    expect(got).toEqual(['x', 'x', 'y']);
  });

  it('gestionnaire global : error et unhandledrejection journalisés, alerte discrète, aucune exception', () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    installGlobalErrorHandlers({ addEventListener: ((t: string, h: (e: unknown) => void) => (handlers[t] = h)) as never });
    const alerts: string[] = [];
    onAlert((k, t) => alerts.push(`${k}:${t}`));
    handlers.error({ error: new Error('boum'), message: 'boum' });
    handlers.unhandledrejection({ reason: 'refusée' });
    handlers.error({ message: '' }); // erreur de chargement de ressource : ignorée
    const log = readErrorLog();
    expect(log.map((e) => e.kind)).toEqual(['erreur', 'promesse']);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]).toMatch(/^error:.*boum/);
    // le stockage plein ne fait pas planter le gestionnaire
    ls.quota = 0;
    expect(() => reportError('x', new Error('encore'))).not.toThrow();
  });
});

describe('Cache hors ligne D2 et packs', () => {
  const url = (p: string, v = 'a') => `http://localhost/app/d2/${p}.enc?v=${v}`;

  it('isQuotaError reconnaît les variantes de navigateurs', () => {
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('Quota exceeded'))).toBe(true);
    expect(isQuotaError(new Error('autre'))).toBe(false);
  });

  it('storeFile range le fichier et purge les anciennes empreintes du même chemin', async () => {
    expect(await storeFile(url('lo/a.png', 'old'), new Response('1'))).toBe('ok');
    expect(await storeFile(url('lo/b.png', 'old'), new Response('2'))).toBe('ok');
    expect(await storeFile(url('lo/a.png', 'new'), new Response('3'))).toBe('ok');
    expect([...cache.map.keys()].sort()).toEqual([url('lo/a.png', 'new'), url('lo/b.png', 'old')]);
    expect(await purgeOtherVersions(cache as unknown as Cache, url('lo/b.png', 'new'))).toBe(1);
  });

  it('storeFile signale le quota plein', async () => {
    const e = new Error('quota');
    e.name = 'QuotaExceededError';
    cache.failPut = e;
    expect(await storeFile(url('x'), new Response('1'))).toBe('quota');
  });

  it('packStatus : ok / incomplet / aucun, relu dans le cache', async () => {
    const urls = [url('a'), url('b'), url('c')];
    expect((await packStatus('p', '?v=a')).state).toBe('none');
    await recordPack('p', urls, '?v=a');
    expect(await packStatus('p', '?v=a')).toMatchObject({ state: 'none', have: 0, total: 3 });
    for (const u of urls.slice(0, 2)) await storeFile(u, new Response('x'));
    expect(await packStatus('p', '?v=a')).toMatchObject({ state: 'partial', have: 2, total: 3 });
    await storeFile(urls[2], new Response('x'));
    expect(await packStatus('p', '?v=a')).toMatchObject({ state: 'ok', have: 3 });
    // le navigateur purge un fichier : l'état le voit
    cache.map.delete(urls[1]);
    expect((await packStatus('p', '?v=a')).state).toBe('partial');
    // autre empreinte du dossier : la fiche ne vaut plus
    expect((await packStatus('p', '?v=b')).state).toBe('none');
  });

  /** Banque factice : une planche par monstre, deux fichiers par planche */
  const bank = (over: Partial<PackBank> = {}): PackBank & { calls: string[] } => {
    const calls: string[] = [];
    return {
      tier: 'lo',
      d2Version: '?v=t',
      rawUrl: (p) => `http://localhost/app/d2/${p}.enc?v=t`,
      sheetPaths: async (id) => [`lo/${id}.json`, `lo/${id}-0.png`],
      prefetchRaw: async (p) => {
        calls.push(p);
        return 1;
      },
      calls,
      ...over,
    };
  };
  const pack = PACKS.find((p) => p.id === 'act4')!;

  it('succès : tous les fichiers sont pris, la liste est enregistrée, le pack est marqué', async () => {
    const b = bank();
    const recorded: string[][] = [];
    let last = [0, 0];
    const n = await downloadPack(pack, b, (d, t) => (last = [d, t]), undefined, { record: async (_id, urls) => void recorded.push(urls) });
    expect(n).toBeGreaterThan(0);
    expect(last[0]).toBe(last[1]);
    expect(recorded[0].length).toBe(n);
    expect(JSON.parse(ls.getItem('d2m.packs')!)[pack.id]).toBeGreaterThan(0);
  });

  it('R5 : un échec réseau (après réessai) -> PackError incomplete, pack NON marqué', async () => {
    const b = bank({
      prefetchRaw: async (p) => {
        if (p.endsWith('-0.png')) {
          throw new Error('réseau');
        }
        return 1;
      },
    });
    await expect(downloadPack(pack, b, () => undefined)).rejects.toMatchObject({ kind: 'incomplete' });
    expect(ls.getItem('d2m.packs')).toBeNull();
  });

  it('un fichier inexistant (404) n’empêche pas le pack d’être complet', async () => {
    const b = bank({ prefetchRaw: async (p) => (p.endsWith('.png') ? 0 : 1) });
    await expect(downloadPack(pack, b, () => undefined)).resolves.toBeGreaterThan(0);
    expect(ls.getItem('d2m.packs')).not.toBeNull();
  });

  it('quota plein pendant le téléchargement -> arrêt net, erreur claire, pas de marque', async () => {
    const q = new Error('x');
    q.name = 'QuotaError';
    let n = 0;
    const b = bank({
      prefetchRaw: async () => {
        if (++n > 3) throw q;
        return 1;
      },
    });
    const err = await downloadPack(pack, b, () => undefined).catch((e) => e as PackError);
    expect(err).toBeInstanceOf(PackError);
    expect((err as PackError).kind).toBe('quota');
    expect(n).toBeLessThan(40);
    expect(ls.getItem('d2m.packs')).toBeNull();
  });

  it('annulation par le joueur et espace insuffisant', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(downloadPack(pack, bank(), () => undefined, undefined, { signal: ac.signal })).rejects.toMatchObject({ kind: 'cancel' });
    await expect(downloadPack(pack, bank(), () => undefined, undefined, { hasRoom: async () => false })).rejects.toMatchObject({ kind: 'room' });
  });
});

describe('fusion des bases en double (v4 → v5)', () => {
  it('réécrit les anciens ids de base (équipement, sac)', async () => {
    const { remapLegacyBases, LEGACY_BASE_ALIAS } = await import('../../src/sim/save');
    const { BASE_BY_ID } = await import('../../src/data/items/bases');
    const d = { character: { equipment: { belt: { base: 'sash' } }, inventory: [{ base: 'kris' }, null, { base: 'boots' }] } };
    remapLegacyBases(d as unknown as Parameters<typeof remapLegacyBases>[0]);
    expect(d.character.equipment.belt.base).toBe('sash_l');
    expect(d.character.inventory[0]?.base).toBe('kriss');
    expect(d.character.inventory[2]?.base).toBe('leather_boots');
    for (const [old, nw] of Object.entries(LEGACY_BASE_ALIAS)) {
      expect(BASE_BY_ID[old], old).toBeUndefined();
      expect(BASE_BY_ID[nw], nw).toBeDefined();
    }
  });
});
