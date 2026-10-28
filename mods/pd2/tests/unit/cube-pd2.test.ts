/** Cube PD2 : chaîne du Pandémonium, Jeton d'absolution, sept familles d'artisanat, réparation, armes magiques à châsses, amulette prismatique. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { CUBE_BY_ID, type CraftFamily } from '../../../../src/data/cube';
import { CRAFT_RUNES } from '../../data/cube';
import { MONSTER_BY_ID } from '../../../../src/data/monsters';
import { RUN_BY_ID } from '../../../../src/data/runs';
import { Game } from '../../../../src/sim/game';
import type { Item } from '../../../../src/sim/item';
import { cubeTransmute } from '../../../../src/sim/cube';
import { itemFinal } from '../../../../src/sim/itemstats';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { validateItem } from '../../../../src/sim/loot/validate';
import { PANDEMONIUM_RATES } from '../../sim/pandemonium';

Game.resumeOnLoad = true;

/** Taux de chute d'un matériau sur un monstre fictif (boss ou super-unique) dans une run donnée */
function rate(runId: string, d: 0 | 1 | 2, def: string, rank: 'boss' | 'unique', name: string, mat: string, n = 4000): number {
  const g = new Game();
  g.startRun(runId, d, 7);
  const w = g.world;
  const m = { def: MONSTER_BY_ID[def], rank, name, runBoss: rank === 'boss', dead: true } as never;
  let k = 0;
  for (let i = 0; i < n; i++) k += (w.run!.extraDrops(w, m) as Item[]).filter((x) => x.base === mat).length;
  return k / n;
}

describe('Pandémonium PD2 : sources des clés, essences et organes', () => {
  it('les clés tombent des six détenteurs PD2 en Enfer, à leurs taux, et jamais avant', () => {
    const cases: [string, string, 'boss' | 'unique', string, string, number][] = [
      ['countess', 'countess', 'boss', 'La Comtesse', 'key_terror', PANDEMONIUM_RATES.keys.countess],
      ['a1_burial', 'dark_stalker', 'unique', 'Blood Raven', 'key_terror', PANDEMONIUM_RATES.keys.bloodraven],
      ['a2_arcane', 'summoner', 'boss', 'Invocateur', 'key_hate', PANDEMONIUM_RATES.keys.summoner],
      ['a2_tomb1', 'panther_woman', 'unique', 'Bloodwitch la Sauvage', 'key_hate', PANDEMONIUM_RATES.keys.bloodwitch],
      ['nihlathak', 'nihlathak', 'boss', 'Nihlathak', 'key_destruction', PANDEMONIUM_RATES.keys.nihlathak],
      ['a4_plains', 'izual', 'boss', 'Izual', 'key_destruction', PANDEMONIUM_RATES.keys.izual],
    ];
    for (const [run, def, rank, name, key, p] of cases) {
      const r = rate(run, 2, def, rank, name, key);
      expect(r, `${name} ${key}`).toBeGreaterThan(p * 0.75);
      expect(r, `${name} ${key}`).toBeLessThan(p * 1.3);
      expect(rate(run, 1, def, rank, name, key, 500), `${name} en Cauchemar`).toBe(0);
    }
    // Andariel, Duriel et Méphisto ne lâchent plus de clés
    for (const [run, def] of [
      ['andariel', 'andariel'],
      ['tombs', 'duriel'],
      ['mephisto', 'mephisto'],
    ])
      for (const key of ['key_terror', 'key_hate', 'key_destruction']) expect(rate(run, 2, def, 'boss', def, key, 500)).toBe(0);
    // un unique quelconque ne lâche rien
    expect(rate('a1_burial', 2, 'dark_stalker', 'unique', 'Coldcrow', 'key_terror', 500)).toBe(0);
  });

  it('les essences tombent des boss d’acte dès le Cauchemar, à leurs taux PD2', () => {
    const cases: [string, string, string, number][] = [
      ['andariel', 'andariel', 'essence_twisted', PANDEMONIUM_RATES.essences.andariel],
      ['tombs', 'duriel', 'essence_twisted', PANDEMONIUM_RATES.essences.duriel],
      ['mephisto', 'mephisto', 'essence_charged', PANDEMONIUM_RATES.essences.mephisto],
      ['chaos', 'diablo', 'essence_burning', PANDEMONIUM_RATES.essences.diablo],
      ['baal', 'baal', 'essence_festering', PANDEMONIUM_RATES.essences.baal],
    ];
    for (const [run, def, ess, p] of cases) {
      for (const d of [1, 2] as const) {
        const r = rate(run, d, def, 'boss', def, ess);
        expect(r, `${def} ${d}`).toBeGreaterThan(p * 0.75);
        expect(r, `${def} ${d}`).toBeLessThan(p * 1.3);
      }
      expect(rate(run, 0, def, 'boss', def, ess, 500), `${def} en Normal`).toBe(0);
    }
  });

  it('les organes tombent à coup sûr des trois mini-ubers (Lilith : corne, Duriel : œil, Izual : cervelle) et plus des ubers de Tristram', () => {
    expect(rate('uber_lilith', 2, 'lilith', 'boss', 'Lilith', 'organ_horn', 50)).toBe(1);
    expect(rate('uber_duriel', 2, 'uber_duriel', 'boss', 'Duriel', 'organ_eye', 50)).toBe(1);
    expect(rate('uber_izual', 2, 'uber_izual', 'boss', 'Izual', 'organ_brain', 50)).toBe(1);
    for (const id of ['uber_mephisto', 'uber_diablo', 'uber_baal']) for (const o of ['organ_horn', 'organ_eye', 'organ_brain']) expect(rate('uber_tristram', 2, id, 'boss', id, o, 50)).toBe(0);
    // les mini-ubers ne lâchent plus d'essences
    for (const id of ['lilith', 'uber_duriel', 'uber_izual']) for (const e of ['essence_twisted', 'essence_charged', 'essence_burning']) expect(rate('uber_lilith', 2, id, 'boss', id, e, 50)).toBe(0);
  });

  it('zones d’uber : niveau 85 en Enfer et monstres de Levels.txt (Pandemonium 1 à 3)', () => {
    for (const id of ['uber_lilith', 'uber_duriel', 'uber_izual', 'uber_tristram']) expect(RUN_BY_ID[id].zoneLevel[2]).toBe(85);
    const mons = (id: string) =>
      new Set(
        RUN_BY_ID[id]
          .build(3, 2)
          .spawns.filter((s) => !s.runBoss)
          .map((s) => s.monster),
      );
    expect([...mons('uber_lilith')]).toEqual(expect.arrayContaining(['succubus', 'succubus_witch', 'dark_stalker']));
    expect([...mons('uber_duriel')]).toEqual(expect.arrayContaining(['sand_maggot', 'arach', 'scarab']));
    expect([...mons('uber_izual')]).toEqual(expect.arrayContaining(['overseer', 'oblivion_knight', 'venom_lord']));
  });
});

describe('Pandémonium PD2 : portails, Talisman et Jeton d’absolution', () => {
  it('le portail des clés ne repasse par une zone qu’après avoir ouvert les trois', () => {
    const g = new Game();
    const c = g.character;
    c.materials.key_terror = 6;
    c.materials.key_hate = 6;
    c.materials.key_destruction = 6;
    const first = [0, 1, 2].map(() => g.transmute('pandemonium_keys', []).run!);
    expect(new Set(first).size).toBe(3);
    const next = g.transmute('pandemonium_keys', []).run!;
    expect(['uber_lilith', 'uber_duriel', 'uber_izual']).toContain(next);
    expect(c.materials.key_terror).toBe(2);
  });

  it('quatre essences forment le Jeton d’absolution, qui donne une réinitialisation de plus', () => {
    const g = new Game();
    const c = g.character;
    for (const id of ['essence_twisted', 'essence_charged', 'essence_burning', 'essence_festering']) c.materials[id] = 1;
    expect(g.transmute('token_absolution', []).ok).toBe(true);
    expect(c.materials.token_absolution).toBe(1);
    expect(c.materials.essence_twisted ?? 0).toBe(0);
    const before = c.respecs;
    const r = g.transmute('token_use', []);
    expect(r.ok).toBe(true);
    expect(c.respecs).toBe(before + 1);
    expect(c.materials.token_absolution ?? 0).toBe(0);
    expect(g.transmute('token_use', []).ok).toBe(false);
    expect(g.respec()).toBe(true);
  });
});

/** Objet magique d'essai pour un emplacement d'artisanat */
const SLOT_BASE: Record<string, string> = {
  amulet: 'amulet',
  ring: 'ring',
  belt: 'sash_l',
  gloves: 'gloves_l',
  boots: 'leather_boots',
  helm: 'cap',
  armor: 'quilted_armor',
  shield: 'buckler',
  weapon: 'short_sword',
  quiver: 'sharp_arrows',
};
const GEM: Record<CraftFamily, string> = { blood: 'ruby', caster: 'amethyst', hitpower: 'sapphire', safety: 'emerald', vampiric: 'skull', bountiful: 'topaz', brilliant: 'diamond' };

function craftOnce(family: CraftFamily, base: string, opts: { clvl?: number; ilvl?: number; quality?: 'magic' | 'rare'; ethereal?: boolean; seed?: string } = {}) {
  const g = new Game();
  const c = g.character;
  c.level = opts.clvl ?? 80;
  const src = generateItem(new Rng(opts.seed ?? `${family}:${base}`), base, opts.ilvl ?? 60, { forceQuality: opts.quality ?? 'magic' });
  if (opts.ethereal) src.ethereal = true;
  c.inventory[0] = src;
  c.inventory[1] = generateItem(new Rng('jewel'), 'jewel', 50, { forceQuality: 'magic' });
  for (let k = 1; k <= 33; k++) c.materials[`r${String(k).padStart(2, '0')}`] = 1;
  c.materials[`gem_${GEM[family]}_4`] = 1;
  // graine propre à l'essai (celle de Game.transmute ne dépend que du personnage)
  const r = cubeTransmute(c, new Rng(`craft:${opts.seed ?? family + base}`), `craft_${family}`, [0]);
  return { r, c, src, out: c.inventory[0] };
}

describe('Artisanat PD2 : sept familles', () => {
  it('chaque famille × emplacement : rune du tableau consommée, propriétés fixes, objet valide', () => {
    for (const family of Object.keys(GEM) as CraftFamily[]) {
      expect(CUBE_BY_ID[`craft_${family}`], family).toBeTruthy();
      for (const [slot, base] of Object.entries(SLOT_BASE)) {
        const { r, c, out } = craftOnce(family, base);
        expect(r.ok, `${family} ${slot} : ${r.reason}`).toBe(true);
        expect(out!.quality).toBe('crafted');
        expect(out!.craftMods!.length, `${family} ${slot}`).toBeGreaterThanOrEqual(3);
        expect(c.materials[CRAFT_RUNES[family][slot]] ?? 0, `${family} ${slot} rune`).toBe(0);
        expect(c.materials[`gem_${GEM[family]}_4`] ?? 0).toBe(0);
        expect(validateItem(out!), `${family} ${slot}`).toEqual([]);
      }
    }
  });

  it('valeurs fixes PD2 : Puissance (Nova de glace quand vous êtes frappé), Vampirique, Abondance, Éclat', () => {
    const ring = craftOnce('hitpower', 'ring').out!;
    expect(ring.craftMods!.find((m) => m.stat === 'procGetHit')).toMatchObject({ value: 5, param: 'frost_nova:4' });
    expect(itemFinal(ring).stats.get('procGetHit:frost_nova:4')).toBe(5);
    const chest = craftOnce('hitpower', 'quilted_armor').out!;
    expect(chest.craftMods!.find((m) => m.stat === 'procGetHit')!.value).toBe(8);
    const vamp = craftOnce('vampiric', 'short_sword').out!;
    for (const s of ['dmgDemonPct', 'dmgUndeadPct', 'manaLeech', 'lifeRegen'])
      expect(
        vamp.craftMods!.some((m) => m.stat === s),
        s,
      ).toBe(true);
    const mf = craftOnce('bountiful', 'quilted_armor').out!.craftMods!;
    expect(mf.find((m) => m.stat === 'mf')!.value).toBeGreaterThanOrEqual(20);
    expect(mf.find((m) => m.stat === 'gf')!.value).toBeGreaterThanOrEqual(30);
    const amu = craftOnce('brilliant', 'amulet').out!.craftMods!;
    expect(amu.map((m) => m.stat)).toEqual(['defMissile', 'allAttr', 'resAll']);
    const safe = craftOnce('safety', 'amulet').out!.craftMods!;
    expect(safe.map((m) => m.stat)).toEqual(['block', 'mdr', 'drFlat']);
  });

  it('ilvl = ⌊clvl/2⌋ + ⌊ilvl/2⌋ ; rares acceptés ; éthéré conservé ; diadème refusé ; tête réduite = bouclier', () => {
    expect(craftOnce('blood', 'amulet', { clvl: 81, ilvl: 63 }).out!.ilvl).toBe(40 + 31);
    expect(craftOnce('blood', 'ring', { quality: 'rare' }).r.ok).toBe(true);
    const eth = craftOnce('safety', 'quilted_armor', { ethereal: true }).out!;
    expect(eth.ethereal).toBe(true);
    const circ = craftOnce('caster', 'circlet');
    expect(circ.r.ok).toBe(false);
    expect(circ.out!.quality).toBe('magic');
    const head = craftOnce('caster', 'preserved_head');
    expect(head.r.ok, head.r.reason).toBe(true);
    expect(head.c.materials[CRAFT_RUNES.caster.shield] ?? 0).toBe(0);
  });

  it('nombre de propriétés aléatoires selon l’ilvl (tableau PD2)', () => {
    const count = (clvl: number, ilvl: number) => {
      const t = [0, 0, 0, 0, 0];
      for (let i = 0; i < 200; i++) t[craftOnce('blood', 'amulet', { clvl, ilvl, seed: `n${clvl}:${ilvl}:${i}` }).out!.affixes!.length]++;
      return t;
    };
    const low = count(20, 20); // ilvl 20 : 40 / 20 / 20 / 20 %
    expect(low[1] / 200).toBeGreaterThan(0.25);
    expect(low[4] / 200).toBeGreaterThan(0.08);
    const mid = count(80, 80); // ilvl 80 : 4 propriétés
    expect(mid[4]).toBe(200);
  });
});

describe('Cube PD2 : réparation, armes magiques à châsses, amulette prismatique', () => {
  it('Ort répare une arme, Ral une armure (pas l’éthéré) ; Zod + crâne parfait répare tout, éthéré compris', () => {
    const g = new Game();
    const c = g.character;
    c.materials = { r09: 1, r08: 1, r33: 1, gem_skull_4: 1 };
    const sword = generateItem(new Rng('s'), 'short_sword', 20, { forceQuality: 'normal' });
    sword.dur = 3;
    const armor = generateItem(new Rng('a'), 'quilted_armor', 20, { forceQuality: 'magic' });
    armor.dur = 1;
    armor.ethereal = true;
    c.inventory[0] = sword;
    c.inventory[1] = armor;
    expect(g.transmute('repair_weapon', [0]).ok).toBe(true);
    expect(sword.dur).toBeUndefined();
    expect(c.inventory[0]).toBe(sword);
    expect(g.transmute('repair_armor', [1]).ok).toBe(false);
    expect(g.transmute('repair_any', [1]).ok).toBe(true);
    expect(armor.dur).toBeUndefined();
    expect(c.materials.r33 ?? 0).toBe(0);
    // un bijou n'a pas de durabilité
    c.materials.r33 = 1;
    c.materials.gem_skull_4 = 1;
    c.inventory[2] = generateItem(new Rng('r'), 'ring', 20, { forceQuality: 'magic' });
    expect(g.transmute('repair_any', [2]).ok).toBe(false);
  });

  it('arme magique + 3 gemmes ébréchées / sans défaut, arme à châsses + 3 gemmes normales : arme magique à 1-2 châsses', () => {
    for (const [id, grade, quality, ilvl] of [
      ['sock_magic_chipped', 0, 'magic', 25],
      ['sock_magic_flawless', 3, 'magic', 30],
      ['sock_magic_standard', 2, 'normal', 30],
    ] as const) {
      const g = new Game();
      const c = g.character;
      c.materials = { [`gem_ruby_${grade}`]: 2, [`gem_topaz_${grade}`]: 1 };
      const w = generateItem(new Rng(id), 'long_sword', 40, { forceQuality: quality });
      if (id === 'sock_magic_standard') w.sockets = 2;
      c.inventory[0] = w;
      const r = g.transmute(id, [0]);
      expect(r.ok, `${id} : ${r.reason}`).toBe(true);
      expect(r.item!.base).toBe('long_sword');
      expect(r.item!.quality).toBe('magic');
      expect(r.item!.ilvl).toBe(ilvl);
      expect(r.item!.sockets).toBeGreaterThanOrEqual(1);
      expect(r.item!.sockets).toBeLessThanOrEqual(2);
      expect(validateItem(r.item!)).toEqual([]);
      expect(Object.values(c.materials).reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it('amulette magique + six gemmes parfaites (hors crâne) : Prismatique +16-20', () => {
    const g = new Game();
    const c = g.character;
    for (const k of ['ruby', 'sapphire', 'topaz', 'emerald', 'diamond', 'amethyst']) c.materials[`gem_${k}_4`] = 1;
    c.inventory[0] = generateItem(new Rng('amu'), 'amulet', 30, { forceQuality: 'magic' });
    const r = g.transmute('prismatic_amulet', [0]);
    expect(r.ok, r.reason).toBe(true);
    const pre = r.item!.affixes!.find((a) => a.id === 'prismatic_cube')!;
    expect(pre.values[0]).toBeGreaterThanOrEqual(16);
    expect(pre.values[0]).toBeLessThanOrEqual(20);
    expect(r.item!.ilvl).toBe(50);
    expect(validateItem(r.item!)).toEqual([]);
  });
});

describe('Cube en grille : monnaies du Pandémonium posées dans le Cube', () => {
  it('quatre essences posées dans le Cube proposent et forment le Jeton ; une clé posée seule ne correspond à rien', async () => {
    const { cubeFromTab, cubeItems } = await import('../../../../src/sim/materials');
    const g = new Game();
    const c = g.character;
    for (const id of ['essence_twisted', 'essence_charged', 'essence_burning', 'essence_festering']) {
      c.materials[id] = 1;
      expect(cubeFromTab(c, id)).toBe(true);
    }
    expect(g.cubeMatches().map((r) => r.id)).toEqual(['token_absolution']);
    expect(g.transmuteGrid('token_absolution').ok).toBe(true);
    expect(cubeItems(c).length).toBe(0);
    expect(c.materials.token_absolution).toBe(1);
    c.materials.key_terror = 1;
    cubeFromTab(c, 'key_terror');
    expect(g.cubeMatches()).toEqual([]);
  });
});
