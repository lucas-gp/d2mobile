import { beforeEach, describe, expect, it } from 'vitest';
import dict from '../../src/i18n/en.json';
import { RUNS } from '../../src/data/runs';
import { CAMPAIGNS } from '../../src/data/campaigns';
import { CLASS_IDS, CLASSES } from '../../src/data/classes';
import { actOfMap, actOfRun, buildCategories, buildRows, classOfSheet, levelingOrder, ACT_LABELS, type CatalogLike, type PlanZone } from '../../src/platform/d2plan';
import { PREGEN_MIN_FPS, PREGEN_TRIES, Pregen, pregenPause, resetPregenDone, type PregenCtx } from '../../src/platform/d2pregen';
import { emptyManifest } from '../../src/platform/d2local-core';
import { MPQ_ROWS, mpqStatus } from '../../src/ui/d2recap-ui';

describe('ordre de leveling', () => {
  const order = levelingOrder(RUNS, CAMPAIGNS);
  it('Tristram d’abord, aucune run cachée, aucun doublon', () => {
    expect(order[0].id).toBe('tristram');
    expect(order.some((r) => r.hidden)).toBe(false);
    expect(new Set(order.map((r) => r.id)).size).toBe(order.length);
  });
  it('contient toutes les zones de campagne, actes I à V dans l’ordre de leurs étapes', () => {
    const idx = new Map(order.map((r, i) => [r.id, i]));
    for (const c of CAMPAIGNS) {
      let last = -1;
      for (const st of c.steps) {
        expect(idx.has(st.id), st.id).toBe(true);
        expect(idx.get(st.id)!, st.id).toBeGreaterThan(last);
        last = idx.get(st.id)!;
      }
    }
    // l’Acte I précède l’Acte II, etc.
    const first = (c: string) => Math.min(...CAMPAIGNS.find((x) => x.id === c)!.steps.map((s) => idx.get(s.id)!));
    for (let a = 1; a < 5; a++) expect(first(`act${a}`)).toBeLessThan(first(`act${a + 1}`));
  });
  it('les runs hors campagne de bas niveau passent avant l’Acte I, les autres après la campagne', () => {
    const idx = new Map(order.map((r, i) => [r.id, i]));
    const a1 = idx.get('a1_town')!;
    for (const r of RUNS) {
      if (r.campaign || r.hidden || r.id === 'tristram') continue;
      if (r.recLevel[0] <= 12) expect(idx.get(r.id)!, r.id).toBeLessThan(a1);
      else expect(idx.get(r.id)!, r.id).toBeGreaterThan(idx.get('a5_throne') ?? a1);
    }
  });
  it('actes des runs et cartes', () => {
    expect(actOfRun(RUNS.find((r) => r.id === 'a3_town')!)).toBe(3);
    expect(actOfRun(RUNS.find((r) => r.id === 'tristram')!)).toBe(1);
    expect(actOfMap('a2_tomb1')).toBe(2);
    expect(actOfMap('baal')).toBe(5);
    expect(actOfMap('inconnue')).toBe(0);
  });
});

describe('récapitulatif', () => {
  const cat: CatalogLike = {
    units: ['sorceress', 'zombie', 'baal'],
    parts: ['sorceress_hd_a', 'druid_hd_a'],
    props: ['prop_tree'],
    fx: ['fx_a', 'fx_b'],
    grounds: ['ground_grass'],
    extras: ['ui', 'icons:items', 'text:npc'],
    maps: ['a1_bloodmoor', 'a5_throne', 'tristram'],
  };
  const plan: PlanZone[] = [
    { runId: 'tristram', name: 'Tristram', act: 1, sheets: ['zombie', 'prop_tree', 'ground_grass'] },
    { runId: 'x', name: 'x', act: 5, sheets: ['baal', 'zombie'] },
  ];
  const cats = buildCategories(cat, plan, CLASS_IDS, (c) => `Personnage — ${CLASSES[c as keyof typeof CLASSES].name}`);
  it('chaque identifiant n’est dans qu’une catégorie, rien n’est perdu', () => {
    const all = cats.flatMap((c) => c.ids);
    expect(new Set(all).size).toBe(all.length);
    const expected = [...cat.units, ...cat.parts, ...cat.props, ...cat.fx, ...cat.grounds, ...cat.extras, ...cat.maps.map((m) => `map:${m}`)];
    expect([...all].sort()).toEqual([...expected].sort());
  });
  it('personnages par classe, monstres par acte (premier acte qui les utilise), cartes par acte', () => {
    const by = (k: string) => cats.find((c) => c.key === k)?.ids;
    expect(by('class:sorceress')).toEqual(['sorceress', 'sorceress_hd_a']);
    expect(by('units:1')).toEqual(['zombie']);
    expect(by('units:5')).toEqual(['baal']);
    expect(by('decor:1')).toEqual(['ground_grass', 'prop_tree']);
    expect(by('maps:1')).toEqual(['map:a1_bloodmoor', 'map:tristram']);
    expect(by('maps:5')).toEqual(['map:a5_throne']);
    expect(classOfSheet('druid_hd_a', CLASS_IDS)).toBe('druid');
    expect(classOfSheet('zombie', CLASS_IDS)).toBeNull();
  });
  it('avancement, octets et temps restants', () => {
    const ready = (id: string) => id === 'zombie' || id === 'ui';
    const rows = buildRows(cats, cat, ready, (id) => (id === 'zombie' ? 1000 : 500), emptyManifest(), 'hi', 1);
    const u1 = rows.find((r) => r.key === 'units:1')!;
    expect(u1.done).toBe(1);
    expect(u1.todo).toEqual([]);
    expect(u1.bytes).toBe(1000);
    expect(u1.secondsLeft).toBe(0);
    const u5 = rows.find((r) => r.key === 'units:5')!;
    expect(u5.done).toBe(0);
    expect(u5.secondsLeft).toBeGreaterThan(0);
    // téléphone (vitesse × 4) : quatre fois plus long ; économe : moins d’octets que la haute
    const phone = buildRows(cats, cat, ready, () => 0, emptyManifest(), 'hi', 4).find((r) => r.key === 'units:5')!;
    expect(phone.secondsLeft).toBeCloseTo(u5.secondsLeft * 4, -1);
    const lo = buildRows(cats, cat, ready, () => 0, emptyManifest(), 'lo', 1).find((r) => r.key === 'units:5')!;
    expect(lo.bytesLeft).toBeLessThan(u5.bytesLeft);
    const maps = rows.find((r) => r.key === 'maps:1')!;
    expect(maps.todo).toEqual(['map:a1_bloodmoor', 'map:tristram']);
    expect(maps.bytesLeft).toBeGreaterThan(0);
  });
});

describe('préparation en arrière-plan : conditions de pause', () => {
  const ok: PregenCtx = { enabled: true, hasFiles: true, loading: false, copying: false, quotaFull: false, queueBusy: false, visible: true, fps: 60, saveData: false, battery: null };
  it('travaille quand tout va bien, s’arrête sinon', () => {
    expect(pregenPause(ok)).toBeNull();
    expect(pregenPause({ ...ok, enabled: false })).toBe('off');
    expect(pregenPause({ ...ok, hasFiles: false })).toBe('nofiles');
    expect(pregenPause({ ...ok, loading: true })).toBe('loading');
    expect(pregenPause({ ...ok, copying: true })).toBe('copying');
    expect(pregenPause({ ...ok, quotaFull: true })).toBe('quota');
    expect(pregenPause({ ...ok, visible: false })).toBe('hidden');
    expect(pregenPause({ ...ok, saveData: true })).toBe('saver');
    expect(pregenPause({ ...ok, battery: { level: 0.1, charging: false } })).toBe('battery');
    expect(pregenPause({ ...ok, battery: { level: 0.1, charging: true } })).toBeNull();
    expect(pregenPause({ ...ok, fps: PREGEN_MIN_FPS - 1 })).toBe('fps');
    expect(pregenPause({ ...ok, fps: 0 })).toBeNull();
    expect(pregenPause({ ...ok, queueBusy: true })).toBe('busy');
  });
});

describe('fichiers Diablo II', () => {
  it('statut des archives selon les fichiers connus', () => {
    const files = [
      { name: 'd2data.mpq', size: 1 },
      { name: 'D2Music.MPQ', size: 5 },
      { name: 'Patch_D2.mpq', size: 7 },
    ];
    const st = (key: string) =>
      mpqStatus(
        MPQ_ROWS.find((r) => r.key === key)!,
        files,
      );
    expect(st('d2data').present).toBe(true);
    expect(st('d2exp').present).toBe(false);
    expect(st('d2music')).toMatchObject({ present: true, size: 5 });
    expect(st('patch_d2').present).toBe(true);
    expect(st('d2sfx').present).toBe(false);
    expect(MPQ_ROWS.filter((r) => r.required).map((r) => r.key)).toEqual(['d2data', 'd2exp', 'd2char']);
    expect(MPQ_ROWS.find((r) => r.key === 'd2video')!.addable).toBe(false);
  });
  it('textes traduits en anglais (description des archives et libellés du récapitulatif)', () => {
    const d = dict as Record<string, string>;
    for (const r of MPQ_ROWS) expect(d[r.gives], r.key).toBeTruthy();
    for (const a of ACT_LABELS.slice(0)) {
      const label = a;
      for (const pre of ['Monstres et personnages — ', 'Sols, murs et décors — ', 'Cartes — ']) expect(d[pre + label], pre + label).toBeTruthy();
    }
    for (const c of CLASS_IDS) expect(d[`Personnage — ${CLASSES[c].name}`], c).toBeTruthy();
  });
});

describe('Pregen : une zone à la fois, dans l’ordre, avec reprise', () => {
  beforeEach(() => resetPregenDone());
  const mk = (over: Partial<PregenCtx> = {}) => {
    const ready = new Set<string>();
    const asked: string[] = [];
    let ctx: PregenCtx = { enabled: true, hasFiles: true, loading: false, copying: false, quotaFull: false, queueBusy: false, visible: true, fps: 60, saveData: false, battery: null, ...over };
    const order = [
      { id: 'a', name: 'A', recLevel: [1, 1, 1] },
      { id: 'b', name: 'B', recLevel: [2, 2, 2] },
    ] as never;
    const zones: Record<string, PlanZone> = {
      a: { runId: 'a', name: 'A', act: 1, sheets: Array.from({ length: 25 }, (_, i) => `a${i}`), map: 'm1' },
      b: { runId: 'b', name: 'B', act: 1, sheets: ['b0'] },
    };
    const p = new Pregen({
      order: () => order,
      prepare: async () => true,
      why: () => 'no',
      plan: (r) => zones[r.id],
      tier: () => 'hi',
      ctx: () => ctx,
      request: async (id) => {
        asked.push(id);
        ready.add(id);
        return true;
      },
      ready: (id) => ready.has(id),
      mapsEnabled: () => true,
    });
    return { p, asked, setCtx: (c: Partial<PregenCtx>) => (ctx = { ...ctx, ...c }), ready };
  };
  it('demande les assets de la première zone (carte comprise) puis passe à la suivante', async () => {
    const { p, asked } = mk();
    await p.tick();
    expect(asked.length).toBe(26);
    expect(asked.at(-1)).toBe('map:m1');
    expect(p.status.done).toBe(1);
    await p.tick();
    expect(asked.at(-1)).toBe('b0');
    await p.tick();
    expect(p.status.finished).toBe(true);
  });
  it('en pause : rien n’est demandé', async () => {
    const { p, asked } = mk({ loading: true });
    await p.tick();
    expect(asked).toEqual([]);
    expect(p.status.paused).toBe('loading');
  });
  it('s’arrête entre deux lots si le jeu ralentit, puis reprend sans refaire ce qui est prêt', async () => {
    const { p, asked, setCtx } = mk();
    let n = 0;
    const orig = (p as unknown as { d: { request: (id: string, t: string) => Promise<boolean> } }).d.request;
    (p as unknown as { d: { request: (id: string, t: string) => Promise<boolean> } }).d.request = async (id, t) => {
      if (++n === 10) setCtx({ fps: 20 });
      return orig(id, t);
    };
    await p.tick();
    expect(asked.length).toBe(10);
    expect(p.status.paused).toBe('fps');
    setCtx({ fps: 60 });
    await p.tick();
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.length).toBe(26);
  });
});

describe('Pregen : une zone n’est préparée que si tout est réellement prêt', () => {
  beforeEach(() => resetPregenDone());
  it('demandes qui échouent : zone jamais « préparée », abandonnée après plusieurs essais, raison donnée, retentée sur demande', async () => {
    const asked: string[] = [];
    let works = false;
    const ready = new Set<string>();
    const p = new Pregen({
      order: () => [{ id: 'z', name: 'Zone Z', recLevel: [1, 1, 1] }] as never,
      prepare: async () => true,
      why: (id) => `échec de ${id}`,
      plan: () => ({ runId: 'z', name: 'Zone Z', act: 1, sheets: ['s1', 's2'], map: 'm' }),
      tier: () => 'hi',
      ctx: () => ({ enabled: true, hasFiles: true, loading: false, copying: false, quotaFull: false, queueBusy: false, visible: true, fps: 60, saveData: false, battery: null }),
      request: async (id) => {
        asked.push(id);
        if (works) ready.add(id);
        return works;
      },
      ready: (id) => ready.has(id),
      mapsEnabled: () => true,
    });
    for (let i = 0; i < PREGEN_TRIES; i++) {
      await p.tick();
      expect(p.status.done).toBe(0);
    }
    expect(p.status.skipped).toBe(1);
    expect(p.status.lastError).toMatch(/Zone Z: 3 not ready \(s1: échec de s1/);
    await p.tick();
    expect(p.status.finished).toBe(true);
    expect(p.status.done).toBe(0);
    // une archive ajoutée : les zones abandonnées sont retentées, et cette fois tout est prêt
    works = true;
    p.retrySkipped();
    await p.tick();
    expect(p.status.done).toBe(1);
    expect(p.status.skipped).toBe(0);
  });
  it('carte non chargée (prepare échoue) : zone non préparée', async () => {
    const p = new Pregen({
      order: () => [{ id: 'z', name: 'Z', recLevel: [1, 1, 1] }] as never,
      prepare: async () => false,
      why: () => '',
      plan: () => null,
      tier: () => 'lo',
      ctx: () => ({ enabled: true, hasFiles: true, loading: false, copying: false, quotaFull: false, queueBusy: false, visible: true, fps: 60, saveData: false, battery: null }),
      request: async () => true,
      ready: () => true,
      mapsEnabled: () => true,
    });
    await p.tick();
    expect(p.status.done).toBe(0);
    expect(p.status.lastError).toMatch(/map data not available/);
  });
});
