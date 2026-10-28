/**
 * Tests d'intégrité des données : chaque identifiant référencé existe, chaque runeword a
 * des bases et un nombre de châsses possibles, chaque affixe a un groupe et un niveau
 * cohérents, chaque classe de trésor aboutit à des objets réels.
 */
import { describe, expect, it } from 'vitest';
import '../../src/data/items/index';
import { BASES, BASE_BY_ID } from '../../src/data/items/bases';
import { AFFIXES, AFFIX_TYPES, LEGACY_AFFIXES, affixTypeMatches } from '../../src/data/items/affixes';
import { D2_ITEM_TYPES } from '../../src/data/items/itemtypes-d2';
import { UNIQUES, UNIQUE_BY_ID } from '../../src/data/items/uniques';
import { SETS, SET_ITEMS, SET_ITEM_BY_ID } from '../../src/data/items/sets';
import { RUNES, RUNE_BY_ID, GEMS } from '../../src/data/items/runes';
import { RUNEWORDS, runewordFits } from '../../src/data/items/runewords';
import { STATS } from '../../src/data/stats';
import { MONSTERS, MONSTER_BY_ID } from '../../src/data/monsters';
import { SKILLS, SKILL_BY_ID } from '../../src/data/skills';
import { TYPE_GROUPS, type ItemType } from '../../src/data/types';
import { PROPS, PROP_BY_ID } from '../../src/data/props';
import { RUNS } from '../../src/data/runs';
import { buildHarrogath } from '../../src/data/zones/harrogath';
import { MONSTER_TC, JEWELRY_TC } from '../../src/data/treasure';
import { rollTc } from '../../src/sim/loot/drops';
import { NO_BONUS } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { buildGrid } from '../../src/sim/world';
import { withoutPd2 } from '../needs-pd2';

const ALL_TYPES = new Set<string>([...Object.keys(TYPE_GROUPS), ...BASES.map((b) => b.type)]);

function checkStat(stat: string, param?: string) {
  expect(STATS[stat], `stat inconnue ${stat}`).toBeTruthy();
  if (stat === 'oskill' || stat === 'classSkill') expect(SKILL_BY_ID[param ?? ''], `${stat} ${param}`).toBeTruthy();
  if (stat.startsWith('proc')) expect(SKILL_BY_ID[(param ?? '').split(':')[0]], `${stat} ${param}`).toBeTruthy();
}

describe('Intégrité des objets', () => {
  it('bases : identifiants uniques, niveaux et prérequis cohérents', () => {
    const ids = new Set<string>();
    for (const b of BASES) {
      expect(ids.has(b.id), b.id).toBe(false);
      ids.add(b.id);
      expect(b.qlvl).toBeGreaterThanOrEqual(1);
      // D2 : la rune Hel n'exige aucun niveau (reqLvl 0) ; tout le reste demande au moins 1
      expect(b.reqLvl).toBeGreaterThanOrEqual(b.id === 'r15' ? 0 : 1);
      expect(b.maxSockets).toBeGreaterThanOrEqual(0);
      if (b.dmg) expect(b.dmg[1]).toBeGreaterThanOrEqual(b.dmg[0]);
      if (b.defense) expect(b.defense[1]).toBeGreaterThanOrEqual(b.defense[0]);
      for (const m of b.implicit ?? []) checkStat(m.stat, m.param);
    }
  });

  it('affixes : groupe, niveau, types et stats valides', () => {
    const ids = new Set<string>();
    for (const a of AFFIXES) {
      expect(ids.has(a.id), a.id).toBe(false);
      ids.add(a.id);
      expect(a.group.length).toBeGreaterThan(0);
      expect(a.level).toBeGreaterThanOrEqual(1);
      // D2 : « of Vita » des grands charmes (alvl 110, MagicSuffix.txt) n'est jamais tiré (alvl au plus 99)
      expect(a.level).toBeLessThanOrEqual(a.id === 'vita_s340' ? 110 : 99);
      if (a.maxLevel !== undefined) expect(a.maxLevel).toBeGreaterThanOrEqual(a.level);
      // D2 : quatre lignes de charmes exigent un niveau supérieur à leur alvl (« of Greed », « of Life » : MagicSuffix.txt)
      if (!a.types.some((t) => t.startsWith('d2:'))) expect(a.reqLvl).toBeLessThanOrEqual(a.level);
      // fréquence 0 : préfixe réservé à une recette du Cube (jamais tiré au hasard)
      if (a.id.endsWith('_cube')) expect(a.freq).toBe(0);
      else expect(a.freq).toBeGreaterThan(0);
      // types : codes d'ItemTypes.txt (affixes de D2) ou noms du wiki PD2 (patch du mod)
      for (const t of [...a.types, ...(a.excludeTypes ?? []), ...(a.rareTypes ?? [])]) expect(t.startsWith('d2:') ? D2_ITEM_TYPES[t.slice(3)] : AFFIX_TYPES[t], `${a.id} type ${t}`).toBeTruthy();
      for (const m of a.mods) {
        checkStat(m.stat, m.param);
        expect(m.max).toBeGreaterThanOrEqual(m.min);
      }
      // au moins une base peut porter cet affixe
      expect(
        BASES.some((b) => affixTypeMatches(b, a.types)),
        `${a.id} sans base`,
      ).toBe(true);
    }
    // chaque type d'affixe désigne au moins une base
    // (noms du wiki PD2 : les carquois sont des bases du mod)
    if (!withoutPd2) for (const [t, f] of Object.entries(AFFIX_TYPES)) expect(BASES.some(f), `type ${t} sans base`).toBe(true);
    // anciens affixes (sauvegardes) : toujours lisibles
    for (const a of LEGACY_AFFIXES) {
      for (const t of a.types) expect(ALL_TYPES.has(t), `${a.id} type ${t}`).toBe(true);
      for (const m of a.mods) checkStat(m.stat, m.param);
    }
  });

  it('uniques et sets : bases existantes, stats connues', () => {
    for (const u of UNIQUES) {
      expect(BASE_BY_ID[u.base], `${u.id} base ${u.base}`).toBeTruthy();
      for (const m of u.mods) checkStat(m.stat, m.param);
    }
    for (const s of SET_ITEMS) {
      expect(BASE_BY_ID[s.base], `${s.id} base ${s.base}`).toBeTruthy();
      for (const m of s.mods) checkStat(m.stat, m.param);
    }
    for (const set of SETS) {
      for (const i of set.items) expect(SET_ITEM_BY_ID[i]?.set, `${set.id}/${i}`).toBe(set.id);
      for (const bz of set.bonuses) for (const m of bz.mods) checkStat(m.stat, m.param);
    }
  });

  it('33 runes et 35 gemmes avec effets valides', () => {
    expect(RUNES.length).toBe(33);
    expect(GEMS.length).toBe(35);
    for (const r of RUNES) for (const m of [...r.weapon, ...r.armor, ...r.shield]) checkStat(m.stat, m.param);
    for (const g of GEMS) for (const m of [...g.weapon, ...g.armor, ...g.shield]) checkStat(m.stat, m.param);
  });

  // mots runiques : ceux de D2 (runewords-d2.ts, lot M10b) ou de PD2 (patch du mod), chacun avec les châsses de son jeu de règles
  it('chaque runeword a une base valide avec assez de châsses', () => {
    for (const rw of RUNEWORDS) {
      for (const r of rw.runes) expect(RUNE_BY_ID[r], `${rw.id} rune ${r}`).toBeTruthy();
      const bases = BASES.filter((b) => runewordFits(rw, b) && b.maxSockets >= rw.runes.length && !b.noRandomDrop);
      expect(bases.length, `${rw.name} : aucune base à ${rw.runes.length} châsses`).toBeGreaterThan(0);
      for (const m of rw.mods) checkStat(m.stat, m.param);
      // le niveau requis (valeur PD2 publiée) reste proche de celui des runes (PD2 abaisse certains : Mythe 25 avec Hel)
      const maxRune = Math.max(...rw.runes.map((r) => RUNE_BY_ID[r].reqLvl));
      expect(rw.reqLvl, rw.name).toBeGreaterThanOrEqual(maxRune - 8);
    }
  });
});

describe('Intégrité des monstres et compétences', () => {
  it('monstres : attaques et invocations valides', () => {
    for (const m of MONSTERS) {
      expect(m.attacks.length, m.id).toBeGreaterThan(0);
      for (const a of m.attacks) {
        expect(a.hitFrame).toBeLessThanOrEqual(a.frames);
        if (a.kind === 'summon' && a.summon !== '*') expect(MONSTER_BY_ID[a.summon ?? ''], `${m.id} invoque ${a.summon}`).toBeTruthy();
      }
      expect(m.radius).toBeGreaterThan(0);
    }
  });

  it('compétences (Diablo II : 210 ; arbres PD2 S13 : 219), prérequis et synergies existants, niveaux cohérents', () => {
    expect(SKILLS.length).toBe(withoutPd2 ? 210 : 219);
    for (const s of SKILLS) {
      for (const p of s.prereqs) {
        expect(SKILL_BY_ID[p], `${s.id} prérequis ${p}`).toBeTruthy();
        expect(SKILL_BY_ID[p].tree).toBe(s.tree);
        expect(SKILL_BY_ID[p].reqLvl).toBeLessThanOrEqual(s.reqLvl);
      }
      for (const syn of s.synergies) expect(SKILL_BY_ID[syn.skill], `${s.id} synergie ${syn.skill}`).toBeTruthy();
    }
    for (const tree of ['fire', 'cold', 'light', 'elemental', 'shape', 'summon']) {
      expect(SKILLS.filter((s) => s.tree === tree).length, `arbre ${tree}`).toBeGreaterThanOrEqual(10);
      const cells = SKILLS.filter((s) => s.tree === tree).map((s) => `${s.row}:${s.col}`);
      expect(new Set(cells).size, `cases en double dans l'arbre ${tree}`).toBe(cells.length);
    }
  });
});

describe('Intégrité des zones', () => {
  const zones = [buildHarrogath(), ...RUNS.flatMap((r) => [0, 1, 2].map((d) => r.build(1, d as 0 | 1 | 2)))];
  it('décor, monstres et départ valides', () => {
    for (const z of zones) {
      for (const p of z.props) expect(PROP_BY_ID[p.prop], `${z.id} décor ${p.prop}`).toBeTruthy();
      for (const s of z.spawns) expect(MONSTER_BY_ID[s.monster], `${z.id} monstre ${s.monster}`).toBeTruthy();
      const g = buildGrid(z);
      expect(g.circleBlocked(z.start.x, z.start.y, 0.38), `${z.id} départ bloqué`).toBe(false);
      for (const o of z.objects) expect(g.nearestFree(o.x, o.y, 3), `${z.id} objet ${o.kind} inaccessible`).not.toBeNull();
    }
  });
  it('catalogue de décor : identifiants uniques', () => {
    expect(new Set(PROPS.map((p) => p.id)).size).toBe(PROPS.length);
  });
});

describe('Classes de trésor', () => {
  it('chaque TC aboutit à des objets réels', () => {
    const rng = new Rng(5);
    for (const id of Object.keys(MONSTER_TC)) {
      for (const diff of [0, 1, 2] as const) {
        for (let i = 0; i < 200; i++) {
          const items = rollTc({ rng, ilvl: [8, 45, 85][diff], mf: 100, difficulty: diff, zoneKey: 'baal', mapTier: 0, bonus: NO_BONUS, gf: 0, quantity: 1 }, id);
          for (const it of items) expect(BASE_BY_ID[it.base], `${id} → ${it.base}`).toBeTruthy();
        }
      }
    }
    for (const e of JEWELRY_TC) expect(BASE_BY_ID[e.ref], e.ref).toBeTruthy();
    // chaque entrée : TC de la table, feuille du moteur, objet du jeu, unique du jeu (`unique:…`, Annihilus du Clone) ou objet D2 absent du jeu (`d2:…`, sans objet)
    const LEAVES = new Set(['gold', 'gold125', 'gold150', 'gold200', 'equip', 'equip_magic', 'good', 'potion', 'junk', 'misc']);
    for (const tc of Object.values(MONSTER_TC))
      for (const e of tc.entries)
        expect(
          MONSTER_TC[e.ref] || LEAVES.has(e.ref) || BASE_BY_ID[e.ref] || (e.ref.startsWith('unique:') && UNIQUE_BY_ID[e.ref.slice(7)]) || /^(runes:\d+|d2:.+)$/.test(e.ref),
          `${tc.id} → ${e.ref}`,
        ).toBeTruthy();
  }, 30000);

  it('un boss lâche plusieurs objets, au moins magiques pour l’équipement', () => {
    const rng = new Rng(6);
    let n = 0;
    for (let i = 0; i < 100; i++) {
      const items = rollTc({ rng, ilvl: 85, mf: 0, difficulty: 2, zoneKey: 'baal', mapTier: 0, bonus: NO_BONUS, gf: 0, quantity: 1 }, 'boss');
      n += items.length;
      for (const it of items) {
        const b = BASE_BY_ID[it.base];
        if (b.slot && !['amulet', 'ring'].includes(b.type as ItemType)) expect(['magic', 'rare', 'set', 'unique']).toContain(it.quality);
      }
    }
    expect(n / 100).toBeGreaterThan(4);
  });
});

describe('Couverture du catalogue', () => {
  it('uniques : la compensation de couverture reste ≤ 2,5 dès l’ilvl 10 (BACKLOG n° 1)', async () => {
    const { coverageFactor } = await import('../../src/sim/loot/itemgen');
    for (let ilvl = 10; ilvl <= 99; ilvl++) expect(coverageFactor('unique', ilvl)).toBeLessThanOrEqual(2.5);
  });

  it('sets : la compensation de couverture reste ≤ 2 dès l’ilvl 25', async () => {
    const { coverageFactor } = await import('../../src/sim/loot/itemgen');
    for (let ilvl = 25; ilvl <= 99; ilvl++) expect(coverageFactor('set', ilvl)).toBeLessThanOrEqual(2);
  });
});
