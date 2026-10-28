import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATS_EVERY_MS, STATS_ID_MAX_AGE_MS, StatsClient, type StatsEnv } from '../../src/platform/stats';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const ID = '11111111-2222-4333-8444-555555555555';

interface Sent {
  url: string;
  body: Record<string, unknown>;
  init: RequestInit;
}
function setup(o: { status?: number; reject?: boolean; dnt?: boolean; visible?: boolean; storage?: ReturnType<typeof mem> | null; id?: string | null } = {}) {
  const storage = o.storage === undefined ? mem() : o.storage;
  const sent: Sent[] = [];
  const state = { status: o.status ?? 204, reject: o.reject ?? false, visible: o.visible ?? true, dnt: o.dnt ?? false };
  let onVisible: (() => void) | null = null;
  const env: Partial<StatsEnv> = {
    storage: () => storage,
    doNotTrack: () => state.dnt,
    visible: () => state.visible,
    onVisible: (cb) => {
      onVisible = cb;
      return () => {
        onVisible = null;
      };
    },
    randomId: () => (o.id === undefined ? ID : o.id),
    fetch: ((url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)), init });
      return state.reject ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(new Response(null, { status: state.status }));
    }) as unknown as typeof fetch,
  };
  const client = new StatsClient('owner', '2026-10-18', env, () => Date.now());
  return { client, sent, storage, state, show: () => onVisible?.() };
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-18T12:00:00Z') }));
afterEach(() => vi.useRealTimers());

describe('statistiques anonymes (client)', () => {
  it('ping à l’ouverture, avec uniquement id, playing, ver et site', async () => {
    const { client, sent, storage } = setup();
    client.start();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('/stats-api/ping');
    expect(sent[0].body).toEqual({ id: ID, playing: false, ver: '2026-10-18', site: 'owner' });
    expect(storage!.getItem('d2m.stats.id')).toBe(ID);
    // aucun cookie, aucun en-tête d’identité, aucune référence
    expect(sent[0].init.credentials).toBe('omit');
    expect(sent[0].init.referrerPolicy).toBe('no-referrer');
    expect(Object.keys(sent[0].init.headers as object)).toEqual(['Content-Type']);
    client.stop();
  });

  it('l’identifiant est conservé d’un lancement à l’autre', () => {
    const storage = mem();
    storage.setItem('d2m.stats.id', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    const { client, sent } = setup({ storage });
    client.start();
    expect(sent[0].body.id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    client.stop();
  });

  it('puis toutes les 60 s ; « en jeu » une fois la partie lancée', () => {
    const { client, sent } = setup();
    client.start();
    vi.advanceTimersByTime(STATS_EVERY_MS - 1);
    expect(sent).toHaveLength(1);
    client.setPlaying(true);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(2);
    expect(sent[1].body.playing).toBe(true);
    vi.advanceTimersByTime(STATS_EVERY_MS * 3);
    expect(sent).toHaveLength(5);
    client.stop();
    vi.advanceTimersByTime(STATS_EVERY_MS * 3);
    expect(sent).toHaveLength(5);
  });

  it('onglet masqué : rien n’est envoyé ; au retour, un ping si le dernier date de plus d’une minute', () => {
    const { client, sent, state, show } = setup();
    client.start();
    state.visible = false;
    vi.advanceTimersByTime(STATS_EVERY_MS * 5);
    expect(sent).toHaveLength(1);
    state.visible = true;
    show();
    expect(sent).toHaveLength(2);
    // retour rapproché : pas de doublon
    show();
    expect(sent).toHaveLength(2);
    client.stop();
  });

  it('ouverture dans un onglet masqué : aucun ping avant d’être visible', () => {
    const { client, sent, state, show } = setup({ visible: false });
    client.start();
    expect(sent).toHaveLength(0);
    state.visible = true;
    show();
    expect(sent).toHaveLength(1);
    client.stop();
  });

  it('désactivation : arrêt immédiat, identifiant supprimé, choix mémorisé', () => {
    const { client, sent, storage } = setup();
    client.start();
    expect(storage!.getItem('d2m.stats.id')).toBe(ID);
    client.setEnabled(false);
    expect(client.mode()).toBe('off');
    expect(storage!.getItem('d2m.stats.id')).toBeNull();
    vi.advanceTimersByTime(STATS_EVERY_MS * 3);
    expect(sent).toHaveLength(1);
    // un nouveau lancement désactivé n’envoie rien et ne crée pas d’identifiant
    const again = setup({ storage });
    again.client.start();
    expect(again.sent).toHaveLength(0);
    expect(storage!.getItem('d2m.stats.id')).toBeNull();
    // réactivation : reprise avec un nouvel identifiant
    again.client.setEnabled(true);
    expect(again.client.mode()).toBe('on');
    expect(again.sent).toHaveLength(1);
    client.stop();
    again.client.stop();
  });

  it('Ne pas suivre / Global Privacy Control : aucun envoi, aucun identifiant', () => {
    const storage = mem();
    storage.setItem('d2m.stats.id', ID);
    const { client, sent } = setup({ dnt: true, storage });
    expect(client.mode()).toBe('dnt');
    client.start();
    vi.advanceTimersByTime(STATS_EVERY_MS * 3);
    expect(sent).toHaveLength(0);
    expect(storage.getItem('d2m.stats.id')).toBeNull();
  });

  it('stockage indisponible : identifiant en mémoire pour la page, pas d’exception', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const { client, sent } = setup({ storage: broken as unknown as ReturnType<typeof mem> });
    expect(() => client.start()).not.toThrow();
    vi.advanceTimersByTime(STATS_EVERY_MS);
    expect(sent).toHaveLength(2);
    expect(sent[1].body.id).toBe(sent[0].body.id);
    // la désactivation vaut pour la page même sans stockage
    client.setEnabled(false);
    expect(client.mode()).toBe('off');
    vi.advanceTimersByTime(STATS_EVERY_MS * 2);
    expect(sent).toHaveLength(2);
    client.stop();
  });

  it('aucun identifiant possible (ni randomUUID ni getRandomValues) : pas de ping', () => {
    const { client, sent } = setup({ id: null });
    client.start();
    vi.advanceTimersByTime(STATS_EVERY_MS * 2);
    expect(sent).toHaveLength(0);
    client.stop();
  });

  it('404 (pas de service derrière /stats-api) : le client cesse d’insister', async () => {
    const { client, sent } = setup({ status: 404 });
    client.start();
    await vi.advanceTimersByTimeAsync(STATS_EVERY_MS * 5);
    expect(sent).toHaveLength(1);
  });

  it('échecs réseau : silencieux, espacés puis abandonnés ; un succès remet le compteur à zéro', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const { client, sent, state } = setup({ reject: true });
    client.start();
    await vi.advanceTimersByTimeAsync(STATS_EVERY_MS * 40);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.length).toBeLessThanOrEqual(5);
    const n = sent.length;
    await vi.advanceTimersByTimeAsync(STATS_EVERY_MS * 40);
    expect(sent).toHaveLength(n);
    expect(errors).toEqual([]);
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
    spy.mockRestore();
    // 500 puis rétablissement
    const b = setup({ status: 500 });
    b.client.start();
    await vi.advanceTimersByTimeAsync(STATS_EVERY_MS * 2);
    b.state.status = 204;
    await vi.advanceTimersByTimeAsync(STATS_EVERY_MS * 10);
    expect(b.sent.length).toBeGreaterThan(3);
    b.client.stop();
    expect(state.reject).toBe(true);
  });

  it('une exception du fetch lui-même n’échappe pas', () => {
    const { client } = setup();
    (client as unknown as { env: StatsEnv }).env.fetch = (() => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    expect(() => client.start()).not.toThrow();
    client.stop();
  });

  it('sans fetch disponible : rien, sans erreur', () => {
    const c = new StatsClient('public', 'x', { fetch: null, storage: () => mem(), doNotTrack: () => false, visible: () => true, onVisible: () => () => undefined, randomId: () => ID });
    expect(() => c.start()).not.toThrow();
    c.stop();
  });

  it('identifiant daté et remplacé après 13 mois (identifiant d’avant la date : compté à partir d’aujourd’hui)', () => {
    const OLD = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const storage = mem();
    storage.setItem('d2m.stats.id', OLD);
    const ids = [ID, '99999999-8888-4777-8666-555555555555'];
    const { client, sent } = setup({ storage, id: undefined });
    (client as unknown as { env: StatsEnv }).env.randomId = () => ids.shift() ?? null;
    client.start();
    expect(sent[0].body.id).toBe(OLD); // gardé
    expect(Number(storage.getItem('d2m.stats.idAt'))).toBe(Date.now());
    vi.setSystemTime(Date.now() + STATS_ID_MAX_AGE_MS - STATS_EVERY_MS); // 13 mois tout juste au prochain ping : encore valable
    vi.advanceTimersByTime(STATS_EVERY_MS);
    expect(sent.at(-1)!.body.id).toBe(OLD);
    vi.setSystemTime(Date.now() + 86_400_000); // au-delà : nouvel identifiant, daté
    vi.advanceTimersByTime(STATS_EVERY_MS);
    expect(sent.at(-1)!.body.id).toBe(ID);
    expect(storage.getItem('d2m.stats.id')).toBe(ID);
    expect(Number(storage.getItem('d2m.stats.idAt'))).toBe(Date.now());
    client.setEnabled(false); // désactiver efface l’identifiant et sa date
    expect(storage.getItem('d2m.stats.idAt')).toBeNull();
    client.stop();
  });

  it('date de création invalide ou dans le futur : remise à aujourd’hui', () => {
    const storage = mem();
    storage.setItem('d2m.stats.id', ID);
    storage.setItem('d2m.stats.idAt', String(Date.now() + 10 * STATS_ID_MAX_AGE_MS));
    const { client, sent } = setup({ storage });
    client.start();
    expect(sent[0].body.id).toBe(ID);
    expect(Number(storage.getItem('d2m.stats.idAt'))).toBe(Date.now());
    client.stop();
  });
});
