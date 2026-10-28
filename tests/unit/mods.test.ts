import { describe, expect, it, vi } from 'vitest';
import { BASE_MOD_ID, Registry, RegistryError } from '../../src/mods/registry';
import { activateMods, activateRuleset, activeModIds, activeRuleset, defaultRuleset, isKnownRuleset, rulesets, rulesetSwitch } from '../../src/mods/activate';
import { discoveredMods } from '../../src/mods/discover';
import { modIncluded, parseModsEnv } from '../../src/mods/mods-env';
import { includedMods } from '../../tools/build/mods-plugin';
import { REGISTRIES } from '../../src/mods/registries';
import { applyTablePatch, type ModDef } from '../../src/mods/api';
import { BASES, registerBases } from '../../src/data/items/bases';
import { UNIQUES } from '../../src/data/items/uniques';

type E = { id: string; v: number; w?: number };
const table = () => {
  const list: E[] = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  return { list, byId: Object.fromEntries(list.map((e) => [e.id, e])) as Record<string, E> };
};

describe('Registre', () => {
  it('ajout, patch sur place, retrait : table et index modifiés ensemble, identité gardée', () => {
    const { list, byId } = table();
    const a = list[0];
    const r = new Registry('t', list, byId);
    expect(r.ownerOf('a')).toBe(BASE_MOD_ID);
    r.add('m', { id: 'm:c', v: 3 });
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'm:c']);
    expect(byId['m:c'].v).toBe(3);
    expect(r.ownerOf('m:c')).toBe('m');
    r.patch('m', 'a', { v: 10 });
    expect(a.v).toBe(10);
    expect(byId.a).toBe(a);
    r.remove('m', 'b');
    expect(list.map((e) => e.id)).toEqual(['a', 'm:c']);
    expect('b' in byId).toBe(false);
    expect(r.problems()).toEqual([]);
  });

  it('ajout à une position : la table et l’ordre des clés de l’index suivent', () => {
    const { list, byId } = table();
    const r = new Registry('t', list, byId);
    r.add('m', { id: 'm:x', v: 0 }, undefined, { after: 'a' });
    r.add('m', { id: 'm:y', v: 0 }, undefined, { before: 'a' });
    r.add('m', { id: 'm:z', v: 0 }, undefined, { after: 'b' });
    expect(list.map((e) => e.id)).toEqual(['m:y', 'a', 'm:x', 'b', 'm:z']);
    expect(Object.keys(byId)).toEqual(['m:y', 'a', 'm:x', 'b', 'm:z']);
    expect(r.problems()).toEqual([]);
    expect(() => r.add('m', { id: 'm:w', v: 0 }, undefined, { after: 'zz' })).toThrow(/position d'ajout/);
    expect(r.ownersCount()).toEqual({ m: 3 });
  });

  it('patch d’une table vanilla : champ à undefined retiré, ordre des champs imposé, index secondaire recalculé seulement si ses champs changent', () => {
    const { list, byId } = table();
    const seen: string[] = [];
    const r = new Registry('t', list, byId, { index: (e, present) => seen.push(`${e.id}:${present}`), indexFields: ['v'] });
    r.patch('m', 'a', { w: 3 });
    expect(Object.keys(byId.a)).toEqual(['id', 'v', 'w']);
    expect(seen).toEqual([]);
    r.patch('m', 'a', { v: 2, w: undefined });
    expect(Object.keys(byId.a)).toEqual(['id', 'v']);
    expect('w' in byId.a).toBe(false);
    expect(seen).toEqual(['a:false', 'a:true']);
    const b = byId.b;
    r.patch('m', 'b', { w: 1 }, { keyOrder: ['id', 'w', 'v'] });
    expect(byId.b).toBe(b);
    expect(Object.keys(b)).toEqual(['id', 'w', 'v']);
    expect(() => r.patch('m', 'b', { w: 2 }, { keyOrder: ['id', 'v'] })).toThrow(/ordre des champs/);
  });

  it('applyTablePatch : retraits, champs puis ajouts à leur position', () => {
    const { list, byId } = table();
    const r = new Registry('t', list, byId);
    const view = {
      has: (id: string) => r.has(id),
      get: (id: string) => r.get(id),
      all: () => r.all(),
      add: (e: E, at?: { after?: string; before?: string }) => r.add('m', e, new Set(['c']), at),
      patch: (id: string, f: Partial<E>, o?: { keyOrder?: readonly string[] }) => r.patch('m', id, f, o),
      remove: (id: string) => r.remove('m', id),
    };
    applyTablePatch(view, { patch: { a: { v: 9 } }, keyOrder: { a: ['v', 'id'] }, add: [{ entry: { id: 'c', v: 3 }, before: 'a' }], remove: ['b'] });
    expect(list.map((e) => e.id)).toEqual(['c', 'a']);
    expect(Object.keys(byId)).toEqual(['c', 'a']);
    expect(Object.keys(byId.a)).toEqual(['v', 'id']);
    expect(byId.a.v).toBe(9);
  });

  it('erreurs : doublon, entrée absente, espace de noms, identifiant patché, conflit de champs', () => {
    const { list, byId } = table();
    const r = new Registry('t', list, byId);
    expect(() => r.add('m', { id: 'm:a', v: 0 })).not.toThrow();
    expect(() => r.add('m', { id: 'm:a', v: 0 })).toThrow(RegistryError);
    expect(() => r.add('m', { id: 'x', v: 0 })).toThrow(/doit commencer par « m: »/);
    expect(() => r.add('m', { id: 'x', v: 0 }, new Set(['x']))).not.toThrow();
    expect(() => r.patch('m', 'zz', { v: 1 })).toThrow(/entrée absente/);
    expect(() => r.remove('m', 'zz')).toThrow(/entrée absente/);
    expect(() => r.patch('m', 'a', { id: 'b' })).toThrow(/ne se patche pas/);
    r.patch('m', 'a', { v: 5 });
    r.patch('m', 'a', { v: 6 });
    expect(() => r.patch('n', 'a', { v: 7 })).toThrow(/déjà patché par « m »/);
    r.patch('n', 'a', { w: 1 });
    r.patch('n', 'a', { v: 8 }, { override: true });
    expect(byId.a.v).toBe(8);
  });

  it('gel : plus aucune modification ; tables gelées sur demande', () => {
    const { list, byId } = table();
    const r = new Registry('t', list, byId);
    r.freeze(true);
    expect(r.isFrozen).toBe(true);
    expect(() => r.add('base', { id: 'c', v: 0 })).toThrow(/gelé/);
    expect(() => r.patch('base', 'a', { v: 0 })).toThrow(/gelé/);
    expect(() => r.remove('base', 'a')).toThrow(/gelé/);
    expect(() => list.push({ id: 'd', v: 0 })).toThrow(TypeError);
  });

  it('incohérences détectées', () => {
    const list: E[] = [
      { id: 'a', v: 1 },
      { id: 'a', v: 2 },
    ];
    expect(new Registry('t', list, { a: list[0] }).problems()).toEqual(['t : « a » en double', "t : « a » absent de l'index ou différent"]);
  });
});

describe('Jeu de règles actif (activé par tests/setup-ruleset.ts, comme au démarrage du jeu)', () => {
  it('jeu de règles par défaut actif (pd2 si le mod est présent), registres et tables gelés, chaque entrée a un propriétaire actif', () => {
    expect(activeRuleset()).toBe(defaultRuleset());
    expect(activeModIds()).toEqual(rulesets()[defaultRuleset()].mods);
    for (const r of Object.values(REGISTRIES)) {
      expect(r.isFrozen).toBe(true);
      expect(r.problems()).toEqual([]);
      for (const id of r.ids()) expect([BASE_MOD_ID, ...activeModIds()]).toContain(r.ownerOf(id));
    }
    expect(REGISTRIES.uniques.size).toBe(UNIQUES.length);
    expect(Object.isFrozen(BASES)).toBe(true);
    expect(() => registerBases([{ ...BASES[0], id: 'tardive' }])).toThrow(/gelé/);
    expect(() => BASES.push(BASES[0])).toThrow(TypeError);
  });

  it('un seul jeu de règles par session : le même est sans effet, un autre est refusé ; changement = rechargement', async () => {
    const cur = activeRuleset()!;
    const other = cur === 'd2' ? Object.keys(rulesets()).find((k) => k !== 'd2') : 'd2';
    await activateRuleset(cur);
    if (other) await expect(activateRuleset(other)).rejects.toThrow(/recharger la page/);
    await expect(activateRuleset('pd3')).rejects.toThrow(/inconnu/);
    expect(() => activateMods('autre', [])).toThrow(/recharger la page/);
    expect(isKnownRuleset('d2')).toBe(true);
    expect(isKnownRuleset('constructor')).toBe(false);
    expect(rulesetSwitch(cur)).toBe('same');
    if (other) expect(rulesetSwitch(other)).toBe('reload');
    expect(rulesetSwitch('pd3')).toBe('unknown');
  });
});

describe('Découverte des mods et variable MODS', () => {
  it('chaque dossier mods/<id>/ avec un manifest est découvert, filtré par MODS ; d2 = la base seule, proposée à la création', () => {
    const ids = discoveredMods().map((m) => m.id);
    expect(ids).toEqual(includedMods(process.cwd()));
    expect(rulesets().d2).toMatchObject({ id: 'd2', name: 'Diablo II', mods: [] });
    expect(rulesets().d2.hidden).toBeUndefined();
    if (ids.includes('pd2')) {
      expect(rulesets().pd2.mods).toEqual(['pd2']);
      expect(defaultRuleset()).toBe('pd2');
    } else expect(defaultRuleset()).toBe('d2');
  });

  it('MODS : absente = tous, vide = aucun, liste ; un mod demandé mais absent est une erreur', () => {
    expect(parseModsEnv(undefined)).toBeNull();
    expect(parseModsEnv('')).toEqual([]);
    expect(parseModsEnv(' pd2, x ')).toEqual(['pd2', 'x']);
    expect(modIncluded('pd2', null)).toBe(true);
    expect(modIncluded('pd2', [])).toBe(false);
    expect(includedMods(process.cwd(), '')).toEqual([]);
    expect(() => includedMods(process.cwd(), 'inexistant')).toThrow(/absent de mods/);
  });
});

describe('Mod de démonstration sur des registres neufs (graphe de modules réinitialisé, non activé)', () => {
  it('ajout, patch et retrait visibles par le jeu ; index secondaires suivis ; gel ensuite', async () => {
    vi.resetModules();
    const A = await import('../../src/mods/activate');
    const R = await import('../../src/mods/registries');
    const { UNIQUE_BY_ID } = await import('../../src/data/items/uniques');
    const { RUNE_BY_NAME, RUNE_BY_ID } = await import('../../src/data/items/runes');
    const { RUNEWORDS, RUNEWORD_BY_ID } = await import('../../src/data/items/runewords');
    const { generateItem } = await import('../../src/sim/loot/itemgen');
    const { itemName } = await import('../../src/sim/itemstats');
    const { Rng } = await import('../../src/core/rng');
    expect(A.activeRuleset()).toBeNull();
    const rw = RUNEWORDS[0].id;
    const shako = R.REGISTRIES.uniques.all().find((u) => u.id === 'u_shako') ?? R.REGISTRIES.uniques.all()[0];
    const probe: ModDef = {
      id: 'probe',
      name: 'Démonstration',
      version: '0.0.1',
      kind: 'addon',
      register(api) {
        api.uniques.add({ ...shako, id: 'probe:u_test', name: 'Casque d’essai', noRandomDrop: true });
        api.runes.patch('r01', { name: 'Elx' });
        api.runewords.remove(rw);
        expect(() => api.uniques.add({ ...shako, id: 'u_sans_prefixe' })).toThrow(/doit commencer/);
      },
    };
    A.activateMods('demo', [probe]);
    expect(A.activeRuleset()).toBe('demo');
    expect(R.REGISTRIES.uniques.ownerOf('probe:u_test')).toBe('probe');
    expect(UNIQUE_BY_ID['probe:u_test'].name).toBe('Casque d’essai');
    const it = generateItem(new Rng('probe'), shako.base, 99, { forceUniqueId: 'probe:u_test' });
    expect(it.uniqueId).toBe('probe:u_test');
    expect(itemName(it)).toBe('Casque d’essai');
    expect(RUNE_BY_ID.r01.name).toBe('Elx');
    expect(RUNE_BY_NAME.elx).toBe(RUNE_BY_ID.r01);
    expect(RUNE_BY_NAME.el).toBeUndefined();
    expect(RUNEWORD_BY_ID[rw]).toBeUndefined();
    expect(RUNEWORDS.some((w) => w.id === rw)).toBe(false);
    expect(() => R.REGISTRIES.uniques.add('probe', { ...shako, id: 'probe:tard' })).toThrow(/gelé/);
    vi.resetModules();
  });

  it('tables dérivées recalculées après les mods : bases et recettes des runes, cartes, recettes de châsses, monstres, traductions', async () => {
    vi.resetModules();
    const A = await import('../../src/mods/activate');
    const { RUNES } = await import('../../src/data/items/runes');
    const { BASE_BY_ID } = await import('../../src/data/items/index');
    const { CUBE_RECIPES, CUBE_BY_ID } = await import('../../src/data/cube');
    const { MAP_ZONES, MAP_RANDOM_ZONES, MAP_UNIQUE_ZONES } = await import('../../src/data/maps');
    const { MONSTERS, MONSTER_BY_ID } = await import('../../src/data/monsters');
    const { SOCKET_RECIPES } = await import('../../src/sim/cube');
    const { derivedNames } = await import('../../src/mods/derived');
    const I = await import('../../src/i18n');
    expect(derivedNames()).toEqual(expect.arrayContaining(['bases des runes et gemmes', 'recettes des runes', 'cartes ordinaires', 'recettes de châsses', 'fidélité et animations des monstres']));
    const random = MAP_RANDOM_ZONES.length;
    const sockets = SOCKET_RECIPES.length;
    const last = RUNES[RUNES.length - 1];
    const sock = CUBE_RECIPES.find((r) => r.effect.kind === 'addSockets')!;
    const zone = MAP_ZONES.find((z) => !z.unique)!;
    const mon = MONSTERS[0];
    const probe: ModDef = {
      id: 'probe',
      name: 'Démonstration',
      version: '0.0.1',
      kind: 'addon',
      register(api) {
        api.runes.add({ ...last, id: 'probe:r34', name: 'Xyz', rank: last.rank + 1 });
        api.cubeRecipes.add({ ...sock, id: 'probe:sock' });
        api.mapZones.add({ ...zone, id: 'probe:zone' });
        api.monsters.add({ ...mon, id: 'probe:mon' });
        api.i18n.add({ 'Phrase d’essai du mod': 'Mod test sentence' });
      },
    };
    A.activateMods('demo', [probe]);
    expect(BASE_BY_ID['probe:r34']?.name).toBe('Rune Xyz');
    const chain = CUBE_RECIPES.filter((r) => r.category === 'Runes').map((r) => r.id);
    expect(chain[chain.length - 1]).toBe(`rune_${last.id}`);
    expect(CUBE_BY_ID[`rune_${last.id}`].effect).toEqual({ kind: 'material', id: 'probe:r34', qty: 1 });
    expect(MAP_RANDOM_ZONES.length).toBe(random + 1);
    expect(MAP_UNIQUE_ZONES.some((z) => z.id === 'probe:zone')).toBe(false);
    expect(SOCKET_RECIPES.length).toBe(sockets + 1);
    expect(MONSTER_BY_ID['probe:mon']).toBeDefined();
    I.setLang('en');
    await I.loadDict();
    expect(I.tr('Phrase d’essai du mod')).toBe('Mod test sentence');
    vi.resetModules();
  });

  it('compétences et règles nommées : chiffres fusionnés, synergies du même type remplacées, règle remplacée puis composée, conflit, gel', async () => {
    vi.resetModules();
    const A = await import('../../src/mods/activate');
    const { SKILL_BY_ID, skillHard } = await import('../../src/data/skills');
    const { ruleOwner } = await import('../../src/mods/rules');
    const s = SKILL_BY_ID.fire_bolt;
    const before = { ...s.n };
    const others = s.synergies.filter((x) => x.what !== 'duration');
    // base : aucune table par points durs
    expect(skillHard('fire_bolt', 'Essai', 5)).toBe(0);
    const mk = (id: string, factor: number): ModDef => ({
      id,
      name: id,
      version: '0.0.1',
      kind: 'addon',
      register(api) {
        if (id === 'probe') {
          api.skills.patchNumbers({ fire_bolt: { mana: [9, 1] } });
          api.skills.patchSynergies({ fire_bolt: [{ skill: 'fire_ball', pct: 7, what: 'duration' }] });
          expect(() => api.skills.patchNumbers({ inexistante: { mana: [1, 1] } })).toThrow(/absente/);
          api.rules.set('skills.hardValue', () => (sid, table, hard) => (table === 'Essai' ? hard * factor : 0));
        } else {
          expect(() => api.skills.patchNumbers({ fire_bolt: { mana: [1, 1] } })).toThrow(/déjà patché/);
          expect(() => api.rules.set('skills.hardValue', () => () => 1)).toThrow(/déjà remplacée/);
          api.rules.set('skills.hardValue', (prev) => (sid, table, hard) => prev(sid, table, hard) * factor, { override: true });
          expect(() => api.rules.set('inconnue' as 'skills.hardValue', () => () => 0)).toThrow(/inconnue/);
        }
      },
    });
    A.activateMods('demo', [mk('probe', 2), mk('probe2', 10)]);
    expect(s.n.mana).toEqual([9, 1]);
    expect({ ...s.n, mana: before.mana }).toEqual(before);
    expect(s.synergies).toEqual([...others, { skill: 'fire_ball', pct: 7, what: 'duration' }]);
    expect(skillHard('fire_bolt', 'Essai', 3)).toBe(60);
    expect(ruleOwner('skills.hardValue')).toBe('probe2');
    const R = await import('../../src/mods/rules');
    expect(() => R.setRule('tard', 'skills.hardValue', () => () => 0)).toThrow(/après l'activation/);
    vi.resetModules();
  });
});
