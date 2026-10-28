/** Lot 4 (audit 03, monstres et boss) : rangs D2, modificateurs d'élites, super-uniques, résistances monstats, auras et malédictions, régénération, nouvelles espèces. */
import { describe, expect, it } from 'vitest';
import { withoutPd2 } from '../needs-pd2';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { damagePlayer, damageMonster } from '../../src/sim/combat';
import { emptyPacket, type Monster } from '../../src/sim/actors';
import { addEliteRes, spawnMonster, speciesAlt, superUniqueOf } from '../../src/sim/spawn';
import { cursePlayer, hexElemRes } from '../../src/sim/monster-auras';
import { RANK_MULT, DIFF_MULT, monsterHp } from '../../src/data/curves';
import { MONSTERS, MONSTER_BY_ID, MONSTER_MODS } from '../../src/data/monsters';
import { MONSTER_FIDELITY, SUPER_UNIQUE_DEFS } from '../../src/data/monsters-fidelity';
import { MONSTER_OWNER } from '../../src/platform/d2sound-map';
import type { Difficulty } from '../../src/data/types';
import type { Element } from '../../src/data/stats';

function world(difficulty: Difficulty = 0, zoneLevel = 30, seed = 7): World {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 40, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(5, 20);
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed, difficulty, zoneLevel, character: g.character });
  return g.world;
}
const spawn = (w: World, id: string, rank: 'normal' | 'champion' | 'unique' | 'minion', extra: Partial<Parameters<typeof spawnMonster>[4]> = {}, key = '0:0') =>
  spawnMonster(w, id, 20, 20, { rank, ...extra }, key)!;

describe('Monstres : rangs et difficultés (D2 MonUMod)', () => {
  it('vie des sbires ×2/×1,75/×1,5, champions ×3/×2,5/×2, uniques ×4/×3/×2', () => {
    expect(RANK_MULT.minion.hp).toEqual([2, 1.75, 1.5]);
    expect(RANK_MULT.champion.hp).toEqual([3, 2.5, 2]);
    expect(RANK_MULT.unique.hp).toEqual([4, 3, 2]);
    for (const d of [0, 1, 2] as Difficulty[]) {
      const w = world(d);
      const n = spawn(w, 'zombie', 'normal');
      const c = spawn(w, 'zombie', 'champion', { inheritMods: [] }, '1:0');
      // même niveau de monstre : le champion a +2 niveaux, on compare à la courbe
      expect(c.hpMax / monsterHp(c.mlvl)).toBeCloseTo((n.hpMax / monsterHp(n.mlvl)) * RANK_MULT.champion.hp[d], 1);
    }
  });

  it('champions : +90/75/66 % de dégâts ; berserker ¼ de vie et dégâts ×3,7 ; possédé vie ×2', () => {
    const w = world(0);
    const c = spawn(w, 'zombie', 'champion', { inheritMods: [] });
    const b = spawn(w, 'zombie', 'champion', { inheritMods: ['berserk'] }, '1:0');
    const p = spawn(w, 'zombie', 'champion', { inheritMods: ['possessed'] }, '2:0');
    expect(b.hpMax / c.hpMax).toBeCloseTo(0.25, 1);
    expect(p.hpMax / c.hpMax).toBeCloseTo(2, 1);
    expect(b.dmgMax / c.dmgMax).toBeCloseTo(3.7 / 1.9, 1);
  });

  it("boss : vie par difficulté d'après monstats (Izual d'Enfer n'est plus 7× D2)", () => {
    const iz = MONSTER_BY_ID.izual;
    expect(iz.hpD).toBeDefined();
    expect(iz.hpD![2]).toBeLessThan(iz.hpD![0] / 5);
    const w = world(2, 80);
    const m = spawn(w, 'izual', 'normal');
    expect(m.rank).toBe('boss');
    expect(m.hpMax).toBe(Math.round(monsterHp(m.mlvl) * iz.hpD![2] * DIFF_MULT[2].hp));
    // PD2 (patch du mod) : Comtesse ×3, Invocateur ×8, Nihlathak ×3 en Enfer ; D2 : vie de MonStats (Invocateur : même vie en Cauchemar et en Enfer)
    const su = MONSTER_FIDELITY.summoner.hpD!;
    if (withoutPd2) expect(su[2]).toBe(su[1]);
    else expect(su[2] / su[1]).toBeGreaterThan(7);
  });
});

describe("Monstres : modificateurs d'élites", () => {
  it("catalogue : 13 modificateurs d'uniques à chances égales et 4 types de champions", () => {
    expect(MONSTER_MODS.filter((m) => !m.champion).map((m) => m.id)).toContain('auraEnchanted');
    expect(
      MONSTER_MODS.filter((m) => m.champion)
        .map((m) => m.id)
        .sort(),
    ).toEqual(['berserk', 'fanatic', 'ghostly', 'possessed']);
    expect(new Set(MONSTER_MODS.map((m) => m.weight)).size).toBe(1);
  });

  it('uniques : 1/2/3 modificateurs selon la difficulté, jamais Résistant à la magie en Normal', () => {
    for (const d of [0, 1, 2] as Difficulty[]) {
      for (let s = 1; s <= 20; s++) {
        const w = world(d, 30, s);
        const u = spawn(w, 'zombie', 'unique');
        expect(u.mods.length).toBe(d + 1);
        if (d === 0) expect(u.mods).not.toContain('magicResistant');
        expect(u.mods).not.toContain('multishot'); // le Zombie ne tire pas
      }
    }
  });

  it("les sbires héritent des modificateurs de leur unique, sauf l'aura", () => {
    const w = world(2);
    const b = new ZoneBuilder('arena2', 'Arène', 40, 40, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
    b.start(5, 20);
    b.spawn({ monster: 'skeleton', x: 20, y: 20, count: 4, r: 2, rank: 'unique' });
    const w2 = new World({ zone: b.build(), seed: 3, difficulty: 2, zoneLevel: 70, character: w.character });
    const out = w2.spawnGroup(0);
    const lead = out[0];
    expect(lead.rank).toBe('unique');
    for (const m of out.slice(1)) {
      expect(m.rank).toBe('minion');
      expect(m.mods).toEqual(lead.mods.filter((x) => x !== 'auraEnchanted'));
    }
  });

  it('super-uniques : modificateurs fixes de SuperUniques.txt, groupe MinGrp-MaxGrp et espèce de leur classe', () => {
    expect(superUniqueOf('Bishibosh')!.mods).toEqual(['magicResistant', 'fireEnchanted']);
    expect(superUniqueOf('Bonebreaker')!.mods).toEqual(['extraStrong', 'magicResistant']);
    expect(superUniqueOf('Bartuc le Sanglant')!.mods).toEqual(['lightningEnchanted']);
    const w = world(2, 70);
    const b = new ZoneBuilder('arena3', 'Arène', 40, 40, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
    b.start(5, 20);
    // la zone d'Acte I place Bishibosh sur un Déchu : SuperUniques.txt en fait un Chaman (fallenshaman1), escorté de 2
    b.spawn({ monster: 'fallen', x: 20, y: 20, count: 4, r: 2, rank: 'unique', uniqueName: 'Bishibosh' });
    const w2 = new World({ zone: b.build(), seed: 3, difficulty: 2, zoneLevel: 70, character: w.character });
    const out = w2.spawnGroup(0);
    expect(out[0].def.id).toBe('fallen_shaman');
    expect(out.length).toBe(1 + SUPER_UNIQUE_DEFS.bishibosh.grp[0]);
    // Enfer : deux modificateurs aléatoires en plus des fixes ; pas de régénération
    expect(out[0].mods.slice(0, 2)).toEqual(['magicResistant', 'fireEnchanted']);
    expect(out[0].mods.length).toBe(4);
    expect(out[0].regen).toBe(0);
  });

  it('bonus de résistance : jamais de troisième immunité', () => {
    const res: Record<Element, number> = { phys: 0, magic: 0, fire: 100, cold: 110, light: 60, poison: 0 };
    addEliteRes(res, 'light', 40);
    expect(res.light).toBe(60);
    addEliteRes(res, 'fire', 40);
    expect(res.fire).toBe(100);
    addEliteRes(res, 'poison', 40);
    expect(res.poison).toBe(40);
  });
});

describe("Monstres : résistances monstats et variantes d'immunité", () => {
  it('toutes les variantes viennent de monstats ; le Mage revenu est tour à tour immunisé au froid, à la foudre, au feu, au poison', () => {
    const v = MONSTER_BY_ID.skeleton_mage.resVariants!;
    const imm = (e: Element) => v.some((r) => (r[e]?.[2] ?? 0) >= 100);
    expect(imm('cold') && imm('light') && imm('fire')).toBe(true);
    // Zombie D2 (zombie1) : froid 120 en Enfer
    expect(MONSTER_BY_ID.zombie.res.cold![2]).toBe(120);
    // porte-clés et ubers : PD2 (patch du mod), sinon MonStats (corruptrogue3, uberandariel)
    expect(MONSTER_BY_ID.countess.res.fire![2]).toBe(withoutPd2 ? 33 : 108);
    expect(MONSTER_BY_ID.lilith.res.fire).toEqual(withoutPd2 ? [-50, -50, 75] : [90, 90, 90]);
  });

  it('le groupe entier tire la même variante', () => {
    const w = world(2, 70);
    const a = spawn(w, 'skeleton_mage', 'normal', {}, '5:0');
    const b = spawn(w, 'skeleton_mage', 'normal', {}, '5:1');
    expect(a.res).toEqual(b.res);
  });

  it('espèces sœurs par groupe (Archère et Lancière sombres avec les Rôdeurs)', () => {
    const got = new Set<string>();
    for (let i = 0; i < 60; i++) got.add(speciesAlt(42, i, 'dark_stalker'));
    expect([...got].sort()).toEqual(['dark_ranger', 'dark_spearwoman', 'dark_stalker']);
    expect(speciesAlt(42, 3, 'dark_stalker')).toBe(speciesAlt(42, 3, 'dark_stalker'));
    expect(speciesAlt(42, 3, 'zombie')).toBe('zombie');
  });
});

describe('Monstres : auras, malédictions, régénération', () => {
  it('Amplification des dégâts double les dégâts physiques reçus', () => {
    const w = world(0);
    const p = w.player;
    const hit = () => {
      p.hp = p.hpMax = 1e6;
      const pk = emptyPacket(true);
      pk.phys = 100;
      return damagePlayer(w, p, pk, null);
    };
    const base = hit();
    cursePlayer(w, 'amplify_damage', 5);
    expect(hit()).toBeCloseTo(base * (1 + 1 / (1 - Math.min(50, p.d.dr) / 100)) - base + base, 0);
  });

  it("Conviction d'une Aura enchantée : résistances du joueur réduites à portée", () => {
    const w = world(2, 70);
    const u = spawn(w, 'zombie', 'unique');
    u.auraId = 'conviction';
    u.auraLvl = 10;
    u.x = w.player.x + 2;
    u.y = w.player.y;
    for (let t = 0; t < 12; t++) w.step();
    expect(hexElemRes(w.player, w.tick)).toBe(63);
  });

  it('Puissance : les monstres proches frappent plus fort', () => {
    const w = world(1, 50);
    const u = spawn(w, 'zombie', 'unique');
    const m = spawn(w, 'zombie', 'normal', {}, '1:0');
    u.auraId = 'might';
    u.auraLvl = 7;
    for (let t = 0; t < 12; t++) w.step();
    expect(m.auraBuff?.dmg).toBe(100);
  });

  it("régénération D2 : ≈ 1,2 %/s, suspendue tant que le monstre saigne ou vient d'être touché", () => {
    const w = world(0);
    const m = spawn(w, 'zombie', 'normal');
    m.x = w.player.x + 30;
    expect(m.regen).toBeCloseTo((m.hpMax * 2 * 25) / 4096, 5);
    m.hp = m.hpMax / 2;
    m.lastHitTick = w.tick;
    for (let t = 0; t < 30; t++) w.step();
    expect(m.hp).toBe(m.hpMax / 2);
    for (let t = 0; t < 75; t++) w.step();
    expect(m.hp).toBeGreaterThan(m.hpMax / 2);
  });

  it("Enchanté par la foudre : salve de 8 éclairs quand l'unique est touché", () => {
    const w = world(2, 70);
    const u = spawn(w, 'zombie', 'unique');
    u.mods = ['lightningEnchanted'];
    u.hp = u.hpMax = 1e6;
    const before = w.missiles.length;
    const pk = emptyPacket(true);
    pk.magic = 10;
    damageMonster(w, u, pk, w.player);
    expect(w.missiles.length - before).toBe(8);
  });

  it('Self-resurrect : le Mort rôdeur se relève une fois', () => {
    const w = world(2, 75);
    const m = spawn(w, 'prowling_dead', 'normal');
    m.x = m.px = w.player.x + 25;
    w.killMonster(m, w.player);
    const n0 = w.monsters.filter((x) => !x.dead && x.def.id === 'prowling_dead').length;
    for (let t = 0; t < 80; t++) w.step();
    const alive = w.monsters.filter((x) => !x.dead && x.def.id === 'prowling_dead');
    expect(alive.length).toBe(n0 + 1);
    expect(alive[alive.length - 1].revived).toBe(true);
  });
});

describe('Monstres : espèces ajoutées', () => {
  it("Blood Raven, le Forgeron, Balrog, Chevaliers funestes et de l'abîme… existent, avec sons et données monstats", () => {
    for (const id of [
      'blood_raven',
      'the_smith',
      'balrog',
      'doom_knight',
      'abyss_knight',
      'dark_ranger',
      'dark_spearwoman',
      'flesh_beast',
      'maggot_young',
      'maggot_queen',
      'pain_worm',
      'water_watcher',
      'night_marauder',
      'spear_cat',
    ]) {
      expect(MONSTER_BY_ID[id], id).toBeDefined();
      expect(MONSTER_OWNER[id], id).toBeDefined();
      expect(MONSTER_FIDELITY[id], id).toBeDefined();
    }
    expect(MONSTERS.length).toBeGreaterThanOrEqual(106);
    // la Génitrice relâche des Bêtes de chair (Nest), le Souilleur des Vers de douleur
    expect(MONSTER_BY_ID.vile_mother.attacks.some((a) => a.summon === 'flesh_beast')).toBe(true);
    expect(MONSTER_BY_ID.putrid_defiler.attacks.some((a) => a.summon === 'pain_worm')).toBe(true);
  });
});

void ({} as Monster);
