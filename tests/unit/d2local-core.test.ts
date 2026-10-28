import { describe, expect, it } from 'vitest';
import {
  GENERATOR_VERSION,
  GenQueue,
  PRIO,
  archiveReport,
  chooseGenTier,
  autoTierReason,
  copyPlan,
  estimateAll,
  extraOfPath,
  hasTier,
  isBlockingId,
  isMapAsset,
  mapAssetId,
  mapDataAssetId,
  mapIdOfAsset,
  mapOfPath,
  mapSliceAssetId,
  mapSlicesOf,
  onboardAction,
  relevantMpq,
  isModestDevice,
  mergeEntry,
  parseCopyState,
  setFingerprint,
  staleReason,
  tiersOf,
  type LocalMeta,
  type ManifestEntry,
} from '../../src/platform/d2local-core';

const entry = (hi: number, lo: number): ManifestEntry => ({ hi: { bytes: hi, gpu: hi * 2 }, lo: { bytes: lo, gpu: lo * 2 }, kind: 'actor' });

describe('file de priorité des générations', () => {
  it('sert par priorité puis par ancienneté', () => {
    const q = new GenQueue();
    void q.add('c', 'lo', PRIO.near);
    void q.add('a', 'lo', PRIO.zone);
    void q.add('b', 'lo', PRIO.near);
    void q.add('d', 'lo', PRIO.player);
    const order: string[] = [];
    for (let j = q.next(); j; j = q.next()) order.push(j.id);
    expect(order).toEqual(['a', 'd', 'c', 'b']);
  });

  it('dédoublonne : une seule entrée par (asset, palier), toutes les promesses résolues ensemble', async () => {
    const q = new GenQueue();
    const p1 = q.add('x', 'lo', PRIO.near);
    const p2 = q.add('x', 'lo', PRIO.zoneRest);
    const p3 = q.add('x', 'hi', PRIO.zoneRest);
    expect(q.pending).toBe(2);
    const j = q.next()!;
    expect(j.key).toBe('x|lo');
    q.finish(j, true);
    await expect(Promise.all([p1, p2])).resolves.toEqual([true, true]);
    const j2 = q.next()!;
    q.finish(j2, false);
    await expect(p3).resolves.toBe(false);
  });

  it('une demande en double plus urgente remonte l’existante (jamais l’inverse)', () => {
    const q = new GenQueue();
    void q.add('a', 'lo', PRIO.prefetch);
    void q.add('b', 'lo', PRIO.near);
    void q.add('a', 'lo', PRIO.zone);
    expect(q.next()!.id).toBe('a');
    void q.add('c', 'lo', PRIO.zone);
    void q.add('c', 'lo', PRIO.background);
    expect(q.snapshot().find((s) => s.id === 'c')!.prio).toBe(PRIO.zone);
  });

  it('bump remonte sans empiler d’écouteur', () => {
    const q = new GenQueue();
    void q.add('a', 'hi', PRIO.background);
    q.bump('a', 'hi', PRIO.player);
    q.bump('a', 'hi', PRIO.prefetch);
    expect(q.snapshot()[0].prio).toBe(PRIO.player);
  });

  it('annule les demandes moins urgentes hors de la zone voulue, pas celles en cours', async () => {
    const q = new GenQueue();
    const keep = q.add('keep', 'lo', PRIO.prefetch);
    const drop = q.add('drop', 'lo', PRIO.prefetch);
    void q.add('urgent', 'lo', PRIO.zone);
    void q.add('player', 'lo', PRIO.player);
    const running = q.add('run', 'lo', PRIO.prefetch);
    const first = q.next()!; // urgent
    expect(first.id).toBe('urgent');
    // `run` est parti : non annulable
    q.cancel((j) => j.id === 'noop');
    const n = q.cancelAbove(PRIO.player, new Set(['keep']));
    expect(n).toBe(2); // drop + run (encore en attente, pas parti)
    await expect(drop).resolves.toBe(false);
    await expect(running).resolves.toBe(false);
    expect(
      q
        .snapshot()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['keep', 'player']);
    void keep;
  });

  it('un travail en cours n’est pas annulé et rejoint les nouvelles demandes', async () => {
    const q = new GenQueue();
    const a = q.add('a', 'lo', PRIO.near);
    const job = q.next()!;
    expect(q.has('a', 'lo')).toBe(true);
    expect(q.cancelAbove(0)).toBe(0);
    const again = q.add('a', 'lo', PRIO.zone);
    q.finish(job, true);
    await expect(Promise.all([a, again])).resolves.toEqual([true, true]);
    expect(q.has('a', 'lo')).toBe(false);
  });
});

describe('entrées de manifeste par palier', () => {
  it('un asset généré en lo seul garde une estimation de mémoire pour hi', () => {
    const e = mergeEntry(undefined, entry(0, 100), ['lo']);
    expect(e.tiers).toEqual(['lo']);
    expect(hasTier(e, 'lo')).toBe(true);
    expect(hasTier(e, 'hi')).toBe(false);
    expect(e.hi.gpu).toBe(e.lo.gpu * 4);
  });

  it('générer ensuite hi complète : plus de `tiers`, valeurs mesurées conservées', () => {
    const lo = mergeEntry(undefined, entry(0, 100), ['lo']);
    const both = mergeEntry(lo, entry(900, 0), ['hi']);
    expect(both.tiers).toBeUndefined();
    expect(both.lo).toEqual(lo.lo);
    expect(both.hi.bytes).toBe(900);
    expect(tiersOf(both)).toEqual(['hi', 'lo']);
  });

  it('entrée ancienne (sans `tiers`) = deux paliers', () => {
    expect(tiersOf(entry(1, 1))).toEqual(['hi', 'lo']);
    expect(tiersOf(undefined)).toEqual([]);
  });
});

describe('chemins et identifiants', () => {
  it('chemins du lot interface / icônes', () => {
    expect(extraOfPath('ui/ui.json')).toBe('ui');
    expect(extraOfPath('ui/panel-main.png')).toBe('ui');
    expect(extraOfPath('icons/skills.png')).toBe('icons:skills');
    expect(extraOfPath('icons/items.json')).toBe('icons:items');
    expect(extraOfPath('audio/npc-text.json')).toBe('text:npc');
    expect(extraOfPath('hi/paladin.json')).toBeNull();
    expect(extraOfPath('maps/a1_town.json')).toBeNull();
  });

  it('sol et décor bloquent l’entrée de zone, pas les unités', () => {
    expect(isBlockingId('ground_snow')).toBe(true);
    expect(isBlockingId('prop_barrel')).toBe(true);
    expect(isBlockingId('paladin')).toBe(false);
    expect(isBlockingId('fx_nova')).toBe(false);
  });
});

describe('archives fournies', () => {
  const f = (name: string, size = 250e6) => ({ name, size });

  it('les trois archives de base suffisent ; les patchs sont facultatifs mais signalés', () => {
    const r = archiveReport([f('D2Data.MPQ'), f('d2char.mpq'), f('D2EXP.mpq')]);
    expect(r.ok).toBe(true);
    expect(r.hasPatch).toBe(false);
    expect(r.messages.join(' ')).toMatch(/Patch_D2\.mpq not provided/);
  });

  it('un fichier manquant est nommé en anglais (écran d import)', () => {
    const r = archiveReport([f('d2data.mpq'), f('d2exp.mpq')]);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['d2char.mpq']);
    expect(r.messages[0]).toBe('Missing file: d2char.mpq.');
  });

  it('un fichier tronqué ou invalide compte comme manquant, avec un message distinct', () => {
    const r = archiveReport([f('d2data.mpq'), f('d2char.mpq'), f('d2exp.mpq', 12)]);
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toMatch(/Unreadable file: d2exp\.mpq/);
    const r2 = archiveReport([f('d2data.mpq'), f('d2char.mpq'), f('d2exp.mpq')], ['d2char.mpq']);
    expect(r2.ok).toBe(false);
    expect(r2.missing).toEqual(['d2char.mpq']);
  });

  it('un patch illisible est ignoré sans bloquer', () => {
    const r = archiveReport([f('d2data.mpq'), f('d2char.mpq'), f('d2exp.mpq'), f('Patch_D2.mpq'), f('pd2.mpq')], ['pd2.mpq']);
    expect(r.ok).toBe(true);
    expect(r.invalid).toEqual(['pd2.mpq']);
    expect(r.hasPatchD2).toBe(true);
  });
});

describe('invalidation par empreinte', () => {
  const meta = (gen: number, fp: string): LocalMeta => ({ gen, fp, files: [], created: 1 });

  it('l’empreinte ne dépend ni de l’ordre ni de la casse des noms', () => {
    const a = setFingerprint([
      { name: 'D2DATA.MPQ', size: 5, fp: 'aa' },
      { name: 'd2char.mpq', size: 7, fp: 'bb' },
    ]);
    const b = setFingerprint([
      { name: 'd2char.mpq', size: 7, fp: 'bb' },
      { name: 'd2data.mpq', size: 5, fp: 'aa' },
    ]);
    expect(a).toBe(b);
    expect(setFingerprint([{ name: 'd2data.mpq', size: 6, fp: 'aa' }])).not.toBe(setFingerprint([{ name: 'd2data.mpq', size: 5, fp: 'aa' }]));
  });

  it('valide : même version, mêmes fichiers (ou fichiers pas encore connus)', () => {
    expect(staleReason(meta(GENERATOR_VERSION, 'x'), 'x')).toBeNull();
    expect(staleReason(meta(GENERATOR_VERSION, 'x'), null)).toBeNull();
    expect(staleReason(null, 'x')).toBeNull();
  });

  it('périmé : version du générateur ou fichiers différents', () => {
    expect(staleReason(meta(GENERATOR_VERSION - 1, 'x'), 'x')).toBe('generator');
    expect(staleReason(meta(GENERATOR_VERSION, 'x'), 'y')).toBe('files');
    expect(staleReason(meta(GENERATOR_VERSION + 1, 'x'), null)).toBe('generator');
  });
});

describe('palier, stockage et estimations', () => {
  it('lo seul sur appareil modeste, sauf réglage explicite ; hi seulement si la qualité le demande', () => {
    // Auto = haute partout (tactile et modeste compris), sauf appareil très faible ou stockage presque plein
    expect(chooseGenTier('auto')).toBe('hi');
    expect(chooseGenTier('auto', 8)).toBe('hi');
    expect(chooseGenTier('auto', 4)).toBe('hi');
    expect(chooseGenTier('auto', 2)).toBe('lo');
    expect(chooseGenTier('auto', 1)).toBe('lo');
    expect(chooseGenTier('auto', 8, true)).toBe('lo');
    // un choix explicite est toujours respecté
    expect(chooseGenTier('hi', 1, true)).toBe('hi');
    expect(chooseGenTier('lo', 8)).toBe('lo');
    expect(autoTierReason(2)).toBe('weak');
    expect(autoTierReason(8, true)).toBe('storage');
    expect(autoTierReason(8)).toBeNull();
  });

  it('appareil modeste : tactile, peu de mémoire ou peu de cœurs', () => {
    expect(isModestDevice({ coarse: true, memoryGb: 8, cores: 8 })).toBe(true);
    expect(isModestDevice({ coarse: false, memoryGb: 2, cores: 8 })).toBe(true);
    expect(isModestDevice({ coarse: false, memoryGb: 8, cores: 4 })).toBe(true);
    expect(isModestDevice({ coarse: false, memoryGb: 8, cores: 16 })).toBe(false);
    expect(isModestDevice({ coarse: false })).toBe(false);
  });

  it('plan de copie : espace libre contre taille des MPQ + marge', () => {
    const sizes = [267e6, 256e6, 250e6];
    expect(copyPlan(sizes, 7e9, 1e9).fits).toBe(true);
    expect(copyPlan(sizes, 1e9, 400e6).fits).toBe(false);
    expect(copyPlan(sizes, null, null).fits).toBe(true);
    expect(copyPlan(sizes, 1e9, 0).need).toBeCloseTo(923e6, -7);
  });

  it('estimation : lo coûte moins de temps et de place que les deux paliers', () => {
    const c = { units: 251, parts: 691, props: 40, fx: 118, grounds: 21 };
    const both = estimateAll(c, 'both');
    const lo = estimateAll(c, 'lo');
    expect(lo.seconds).toBeLessThan(both.seconds);
    expect(lo.bytes).toBeLessThan(both.bytes);
    const slow = estimateAll(c, 'lo', 4).seconds;
    expect(Math.abs(slow - lo.seconds * 4)).toBeLessThanOrEqual(2);
  });
});

describe('reprise d’une copie interrompue', () => {
  const st = (seq: number, done: number) => JSON.stringify({ seq, state: { 'd2data.mpq': { size: 100, done, fp: 'x' } } });

  it('prend l’état valide le plus récent des deux fichiers alternés', () => {
    expect(parseCopyState(st(4, 40), st(5, 50)).state['d2data.mpq'].done).toBe(50);
    expect(parseCopyState(st(6, 60), st(5, 50)).state['d2data.mpq'].done).toBe(60);
  });

  it('une écriture coupée net (JSON tronqué ou vide) ne perd pas l’état précédent', () => {
    expect(parseCopyState(st(4, 40), '{"seq":5,"sta').state['d2data.mpq'].done).toBe(40);
    expect(parseCopyState('', st(2, 20)).state['d2data.mpq'].done).toBe(20);
  });

  it('aucun fichier : état vide, jamais d’exception', () => {
    expect(parseCopyState(null, null)).toEqual({ seq: -1, state: {} });
    expect(parseCopyState('pas du json', '[]').state).toEqual({});
  });
});

describe('file : fond et zone', () => {
  it('le changement de zone n’annule pas la tâche de fond', async () => {
    const q = new GenQueue();
    const bg = q.add('bg', 'lo', PRIO.background);
    const pre = q.add('pre', 'lo', PRIO.prefetch);
    expect(q.cancelAbove(PRIO.player, undefined, PRIO.background)).toBe(1);
    await expect(pre).resolves.toBe(false);
    expect(q.snapshot().map((s) => s.id)).toEqual(['bg']);
    void bg;
  });

  it('la tâche de fond peut être limitée : next() ignore les travaux refusés', () => {
    const q = new GenQueue();
    void q.add('bg1', 'lo', PRIO.background);
    void q.add('fg', 'lo', PRIO.near);
    const first = q.next((j) => j.prio < PRIO.background)!;
    expect(first.id).toBe('fg');
    expect(q.next((j) => j.prio < PRIO.background)).toBeUndefined();
    expect(q.runningFrom(PRIO.background)).toBe(0);
    expect(q.next()!.id).toBe('bg1');
    expect(q.runningFrom(PRIO.background)).toBe(1);
  });
});

describe('écran de choix : fichiers utiles et décision de lancement', () => {
  const f = (name: string, size = 100) => ({ name, size });
  it('ne garde que les archives requises et les patchs, ignore l’audio et la vidéo', () => {
    const r = relevantMpq([f('d2data.mpq', 5), f('D2Char.MPQ'), f('d2exp.mpq'), f('d2music.mpq'), f('d2speech.mpq'), f('Patch_D2.mpq'), f('PD2_ext.mpq'), f('readme.txt')]);
    expect(r.used.map((x) => x.name.toLowerCase()).sort()).toEqual(['d2char.mpq', 'd2data.mpq', 'd2exp.mpq', 'patch_d2.mpq', 'pd2_ext.mpq']);
    expect(r.ignored.sort()).toEqual(['d2music.mpq', 'd2speech.mpq']);
  });
  it('un doublon (sous-dossiers) garde le plus gros fichier', () => {
    const r = relevantMpq([f('d2data.mpq', 10), f('d2data.mpq', 900)]);
    expect(r.used).toHaveLength(1);
    expect(r.used[0].size).toBe(900);
  });
  const base = { build: 'off' as const, publicOrForced: true, savedPassword: false, refused: false, sessionSkip: false, localFlag: false, haveAssets: false };
  it('version publique sans rien : écran de choix', () => expect(onboardAction(base)).toBe('choose'));
  it('développement (dossier en clair) : jamais d’écran', () => expect(onboardAction({ ...base, build: 'plain' })).toBe('none'));
  it('sans version publique ni réglage : rien (e2e et développement inchangés)', () => expect(onboardAction({ ...base, publicOrForced: false })).toBe('none'));
  it('dossier chiffré : mot de passe mémorisé ou refus mémorisé → rien', () => {
    expect(onboardAction({ ...base, build: 'enc', savedPassword: true })).toBe('none');
    expect(onboardAction({ ...base, build: 'enc', refused: true })).toBe('none');
  });
  it('dossier chiffré sans mot de passe : écran de choix', () => expect(onboardAction({ ...base, build: 'enc', publicOrForced: false })).toBe('choose'));
  it('réglage actif et fichiers à fournir de nouveau : import direct ; déjà là : rien', () => {
    expect(onboardAction({ ...base, localFlag: true })).toBe('import');
    expect(onboardAction({ ...base, localFlag: true, haveAssets: true })).toBe('none');
  });
  it('« graphismes de remplacement » choisi dans l’onglet : plus d’écran', () => expect(onboardAction({ ...base, sessionSkip: true })).toBe('none'));
});

describe('cartes DS1 : chemins et identifiants d’asset', () => {
  it('reconnaît index, données, sol et atlas selon le palier', () => {
    expect(mapOfPath('maps/index.json')).toEqual({ kind: 'index', id: '' });
    expect(mapOfPath('maps/a1_cave1.json')).toEqual({ kind: 'json', id: 'a1_cave1' });
    expect(mapOfPath('maps/a1_cave1-g12.png')).toEqual({ kind: 'png', id: 'a1_cave1', tier: 'hi' });
    expect(mapOfPath('maps/a1_cave1-g12-lo.png')).toEqual({ kind: 'png', id: 'a1_cave1', tier: 'lo' });
    expect(mapOfPath('maps/harrogath-t0.png')).toEqual({ kind: 'png', id: 'harrogath', tier: 'hi' });
    expect(mapOfPath('maps/harrogath-tlo-1.png')).toEqual({ kind: 'png', id: 'harrogath', tier: 'lo' });
    expect(mapOfPath('hi/paladin.json')).toBeNull();
    expect(mapOfPath('maps/../etc.json')).toBeNull();
  });
  it('parts d’une carte : identifiant, carte d’origine et nombre de parts', () => {
    const id = mapSliceAssetId('a1_bloodmoor', 1, 2);
    expect(id).toBe('map:a1_bloodmoor@1/2');
    expect(isMapAsset(id)).toBe(true);
    expect(mapIdOfAsset(id)).toBe('a1_bloodmoor');
    expect(mapSlicesOf(id)).toBe(2);
    expect(mapSlicesOf(mapAssetId('a1_bloodmoor'))).toBe(1);
  });
  it('identifiants d’asset aller-retour', () => {
    expect(mapIdOfAsset(mapAssetId('a2_town'))).toBe('a2_town');
    expect(mapIdOfAsset(mapDataAssetId('a2_town'))).toBe('a2_town');
    expect(isMapAsset('map:x') && isMapAsset('mapdata:x') && !isMapAsset('fx_x')).toBe(true);
  });
});
