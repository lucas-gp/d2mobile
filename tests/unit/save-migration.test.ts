import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../../src/sim/game';
import { DEFAULT_RULESET, deserialize, migrate, SAVE_VERSION, serialize } from '../../src/sim/save';
import { SaveStore, FutureSaveError } from '../../src/platform/platform';
import { withoutPd2 } from '../needs-pd2';

/**
 * Sauvegardes de chaque ancienne version (fixtures littérales `fixtures/saves/vN.json`, figées : NE PAS les régénérer) : le même
 * personnage de niveau 24 (casque magique, ceinture, kriss rare et petit charme dans le sac, armure dans le coffre) sous la forme qu'il
 * avait en version N. Elles doivent toutes se charger dans la version courante, sans rien perdre.
 */
const fixture = (v: number): Record<string, unknown> => JSON.parse(readFileSync(new URL(`./fixtures/saves/v${v}.json`, import.meta.url), 'utf8'));
const VERSIONS = [1, 2, 3, 4, 5, 6];

describe('Migrations : fixtures v1 à v6', () => {
  for (const v of VERSIONS)
    it(`v${v} → v${SAVE_VERSION} : chargée, ruleset pd2, objets conservés`, () => {
      const raw = fixture(v);
      expect(raw.version).toBe(v);
      expect(raw.ruleset).toBeUndefined();
      const s = migrate(raw);
      expect(s.version).toBe(SAVE_VERSION);
      expect(s.ruleset).toBe(DEFAULT_RULESET);
      const c = s.character;
      expect(c.name).toBe('Fixture');
      expect(c.level).toBe(24);
      expect(c.gold).toBe(1234);
      // v1 → v2 : points bonus, matériaux, compteur de runs
      expect(c.progression.bonusSkillPoints).toBeTypeOf('number');
      expect(c.materials).toBeTypeOf('object');
      expect(s.runCounter).toBe(v === 1 ? 0 : 9);
      // v2 → v3 : filtre complet
      expect(c.filter.preset).toBeTypeOf('string');
      // v3 → v4 : pénombre par défaut
      expect(s.settings.lighting).toBe('penombre');
      // v4 → v5 : anciennes bases fusionnées
      expect(c.inventory[0]?.base).toBe('kriss');
      expect(c.equipment.belt?.base).toBe('sash_l');
      // v5 → v6 : le charme passe dans l'inventaire des charmes
      expect(c.inventory[3]).toBeNull();
      expect(c.charmInv.filter(Boolean).map((x) => x!.base)).toEqual(['small_charm']);
      expect(c.stash[0][0]?.base).toBe('quilted_armor');
      // jouable, et l'aller-retour garde le ruleset
      const g = new Game(s, s.character.classId);
      expect(g.ruleset).toBe('pd2');
      const back = deserialize(serialize(g.toSave()));
      expect(back.version).toBe(SAVE_VERSION);
      expect(back.ruleset).toBe('pd2');
      expect(back.character.charmInv.filter(Boolean).length).toBe(1);
    });

  it('les six fixtures donnent le même personnage une fois migrées (hors champs propres à une version)', () => {
    const norm = (v: number) => {
      const s = migrate(fixture(v));
      const c = s.character as unknown as Record<string, unknown>;
      return JSON.stringify({ eq: c.equipment, inv: c.inventory, charm: c.charmInv, stash: c.stash, skills: c.skills, base: c.base, ruleset: s.ruleset });
    };
    for (const v of VERSIONS) expect(norm(v)).toBe(norm(6));
  });
});

describe('Ruleset du personnage', () => {
  it('nouveau personnage : jeu de règles de la session (pd2 avec le mod, d2 sans), écrit dans la sauvegarde', () => {
    const s = new Game().toSave();
    expect(s.ruleset).toBe(withoutPd2 ? 'd2' : 'pd2');
    expect(JSON.parse(serialize(s)).ruleset).toBe(s.ruleset);
  });

  it('v7 : identifiant bien formé gardé tel quel, étiquette illisible remplacée par pd2', () => {
    const base = migrate(fixture(6));
    expect(migrate({ ...JSON.parse(serialize(base)), ruleset: 'd2' }).ruleset).toBe('d2');
    for (const bad of [42, null, '', 'PD2 !', { id: 'pd2' }]) expect(migrate({ ...JSON.parse(serialize(base)), ruleset: bad }).ruleset).toBe('pd2');
  });

  it('une sauvegarde v7 est « plus récente » pour un client v6 ; une v8 l’est pour ce client', () => {
    expect(() => migrate({ ...fixture(6), version: SAVE_VERSION + 1 })).toThrow(/plus récente/);
  });

  it('écran de sélection : le résumé porte le ruleset (pd2 par défaut pour une sauvegarde d’avant la v7)', () => {
    const store = new Map<string, string>();
    const ls = {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
    const prev = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    try {
      ls.setItem('d2m.save.a', JSON.stringify(fixture(6)));
      ls.setItem('d2m.save.b', serialize({ ...migrate(fixture(6)), ruleset: 'd2', savedAt: 5 }));
      const list = SaveStore.list();
      expect(list.map((c) => [c.slot, c.ruleset])).toEqual([
        ['d2m.save.a', 'pd2'],
        ['d2m.save.b', 'd2'],
      ]);
      ls.setItem('d2m.save.c', JSON.stringify({ ...fixture(6), version: SAVE_VERSION + 1 }));
      expect(() => SaveStore.load('d2m.save.c')).toThrow(FutureSaveError);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = prev;
    }
  });
});
