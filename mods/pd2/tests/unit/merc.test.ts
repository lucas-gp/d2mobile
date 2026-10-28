/**
 * Mercenaires PD2 : déblocage par niveau, embauche, accompagnement entre zones, auras sur le joueur,
 * équipement (7 emplacements, armes par acte), mort et résurrection, reprise d'une sauvegarde, et
 * les 13 sous-types (aura et compétences présentes, équipement autorisé/refusé), tableaux de stats
 * PD2, armes à une main ×2, découverte d'objets héritée, équipement lâché au sol, bonus de set,
 * objets éthérés sans usure.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { canMercEquip, mercDerived, mercFindBonus, mercOf, mercSkillLvl, mercWear } from '../../../../src/sim/merc';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { Rng } from '../../../../src/core/rng';
import { canEquip } from '../../../../src/sim/character';
import { deserialize, serialize } from '../../../../src/sim/save';
import { monsterIsImmune } from '../../../../src/sim/combat';
import { RUN_BY_ID } from '../../../../src/data/runs';
import { MERCS, MERC_BY_ID, mercSlots, mercVariant, type MercId } from '../../../../src/data/mercs';
import { SET_ITEM_BY_ID } from '../../../../src/data/items/sets';
import { durabilityOf, maxDurability } from '../../../../src/sim/durability';
import type { Item } from '../../../../src/sim/item';
import { withoutPd2 } from '../../../../tests/needs-pd2';

function rich(level: number, cls: 'sorceress' | 'druid' = 'sorceress'): Game {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(level));
  g.character.gold = 1e7;
  g.enterTown();
  return g;
}

function arena(g: Game, monster: string, difficulty: 0 | 1 | 2 = 0, zoneLevel = 30): World {
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster, x: 16, y: 15, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 3, difficulty, zoneLevel, character: g.character });
  g.world.populate();
  return g.world;
}

const item = (base: string, q: 'normal' | 'magic' = 'normal'): Item => generateItem(new Rng(`m-${base}`), base, 40, { forceQuality: q });

describe('Mercenaires', () => {
  it('déblocage : acte I au niveau 5, puis au niveau conseillé des Tombeaux, Vaches, Chaos et Baal', () => {
    const unlocked = (lvl: number) =>
      rich(lvl)
        .mercOffers()
        .filter((o) => o.unlocked)
        .map((o) => o.type.act);
    expect(unlocked(4)).toEqual([]);
    expect(unlocked(5)).toEqual([1]);
    expect(unlocked(RUN_BY_ID.tombs.recLevel[0])).toEqual([1, 2]);
    expect(unlocked(RUN_BY_ID.cows.recLevel[0])).toEqual([1, 2, 3]);
    expect(unlocked(RUN_BY_ID.chaos.recLevel[0])).toEqual([1, 2, 3, 4]);
    expect(unlocked(38)).toEqual([1, 2, 3, 4, 5]);
    expect(rich(10).hireMerc('desert', 'defiance').ok).toBe(false);
  });

  it('13 sous-types PD2 : 3 + 3 + 3 + 2 + 2, auras et compétences du wiki', () => {
    expect(MERCS.map((t) => t.variants.length)).toEqual([3, 3, 3, 2, 2]);
    const auras = MERCS.flatMap((t) => t.variants.map((v) => `${t.id}:${v.id}:${v.aura ?? '-'}`));
    expect(auras).toEqual([
      'rogue:fire:vigor',
      'rogue:cold:meditation',
      'rogue:phys:-',
      'desert:defiance:defiance',
      'desert:blessed_aim:blessed_aim',
      'desert:thorns:thorns',
      'ironwolf:fire:cleansing',
      'ironwolf:cold:prayer',
      'ironwolf:light:holy_shock',
      'ascendant:dark:-',
      'ascendant:light:sanctuary',
      'barbarian:combat:might',
      'barbarian:warcries:-',
    ]);
    // probabilités de tirage : 100 % par sous-type
    for (const t of MERCS)
      for (const v of t.variants)
        expect(
          v.skills.reduce((a, s) => a + s.pct, 0),
          `${t.id}:${v.id}`,
        ).toBe(100);
  });

  it('embauche : payé, présent en ville, suit en run et revient ; son aura profite au joueur', () => {
    const g = rich(30, 'druid');
    const gold = g.character.gold;
    const ar0 = g.world.player.d.attackRating;
    expect(g.hireMerc('desert', 'blessed_aim').ok).toBe(true);
    expect(g.character.gold).toBeLessThan(gold);
    expect(mercOf(g.world)).toBeTruthy();
    expect(g.world.player.buffs.some((b) => b.id === 'maura_blessed_aim')).toBe(true);
    expect(g.world.player.d.attackRating).toBeGreaterThan(ar0 * 1.5);
    g.startRun('tristram', 0, 5);
    expect(mercOf(g.world)).toBeTruthy();
    expect(g.world.monsters.filter((m) => m.pet === 'merc').length).toBe(1);
    g.enterTown();
    expect(g.world.monsters.filter((m) => m.pet === 'merc').length).toBe(1);
  });

  it('tue seul un monstre immunisé au feu que la Sorcière de feu ne peut pas blesser', () => {
    const g = rich(60);
    expect(g.hireMerc('desert', 'thorns').ok).toBe(true);
    g.character.merc!.equipment.mainhand = generateItem(new Rng('lance'), 'pike', 40, { forceQuality: 'normal' });
    const w = arena(g, 'fallen', 2, 60);
    w.godMode = true;
    const m = w.monsters.find((x) => !x.isSummon)!;
    expect(monsterIsImmune(m, 'fire', w.player, w)).toBe(true);
    m.aggro = true;
    let t = 0;
    while (!m.dead && t++ < 25 * 60) g.step(1);
    expect(m.dead, `fallen mort en ${(t / 25).toFixed(1)} s`).toBe(true);
    expect(g.character.xp).toBeGreaterThan(xpToReach(60));
  });

  it('équipement : arme d’hast pour le Garde du désert, jamais pour le joueur ; plus de dégâts', () => {
    const g = rich(40);
    g.hireMerc('desert', 'defiance');
    const d0 = mercDerived(g.character)!.dmg[1];
    const pike = item('pike');
    const bow = item('long_bow');
    expect(canEquip(g.character, pike).ok).toBe(false);
    g.character.inventory[0] = pike;
    g.character.inventory[1] = bow;
    expect(g.mercEquip(1).ok).toBe(false);
    expect(g.mercEquip(0).ok).toBe(true);
    expect(g.character.inventory[0]).toBe(null);
    expect(mercDerived(g.character)!.dmg[1]).toBeGreaterThan(d0 * 1.5);
    expect(mercOf(g.world)!.dmgMax).toBeCloseTo(mercDerived(g.character)!.dmg[1]);
    expect(g.mercUnequip('mainhand').ok).toBe(true);
    expect(g.character.inventory.some((x) => x?.uid === pike.uid)).toBe(true);
  });

  it('PD2 : tous les mercenaires portent casque, plastron, gants, bottes et ceinture', () => {
    for (const t of MERCS) expect(mercSlots(t)).toEqual(expect.arrayContaining(['mainhand', 'head', 'body', 'gloves', 'boots', 'belt']));
    const g = rich(60);
    g.hireMerc('rogue', 'cold');
    const md0 = mercDerived(g.character)!;
    for (const b of ['gloves_l', 'leather_boots', 'sash_l']) {
      g.character.inventory[0] = item(b);
      const r = g.mercEquip(0);
      expect(r.ok, `${b} ${r.reason}`).toBe(true);
    }
    expect(Object.keys(g.character.merc!.equipment).sort()).toEqual(['belt', 'boots', 'gloves']);
    expect(mercDerived(g.character)!.defense).toBeGreaterThan(md0.defense);
  });

  it('statistiques PD2 par niveau, identiques quelle que soit la difficulté (pénalité de résistance mise à part)', () => {
    const g = rich(50);
    g.hireMerc('rogue', 'fire');
    const n = mercDerived(g.character, 0)!;
    const h = mercDerived(g.character, 2)!;
    // tableau du wiki, Éclaireuse niveau 50 : 594 PV, 489 défense, 94 force, 139 dextérité, 90 % de résistances
    expect(n.lifeMax).toBe(594);
    expect(n.defense).toBe(489);
    expect([n.str, n.dex]).toEqual([94, 139]);
    expect(n.res.fire).toBe(75);
    expect(h.lifeMax).toBe(n.lifeMax);
    expect(h.res.fire).toBe(90 - 100);
    // Barbare niveau 98 : 2 232 PV, Garde du désert niveau 98 : 2 350 PV
    const b = rich(98);
    b.hireMerc('barbarian', 'combat');
    expect(mercDerived(b.character)!.lifeMax).toBe(2232);
    b.hireMerc('desert', 'thorns');
    expect(mercDerived(b.character)!.lifeMax).toBe(2350);
  });

  it('armes à une main ×2 pour le Garde du désert (javelots) et le Barbare, pas pour le Loup de fer', () => {
    const g = rich(85);
    g.hireMerc('barbarian', 'combat');
    const base = mercDerived(g.character)!.raw;
    const sword = item('long_sword');
    g.character.merc!.equipment.mainhand = sword;
    const raw = mercDerived(g.character)!.raw;
    const wd = generateItem(new Rng('m-long_sword'), 'long_sword', 40, { forceQuality: 'normal' });
    expect(wd.base).toBe('long_sword');
    // arme ×2 + dégâts de base du tableau PD2
    expect(raw[1] - base[1]).toBeGreaterThan(0);
    const two = item('two_handed_sword');
    g.character.merc!.equipment.mainhand = two;
    const raw2 = mercDerived(g.character)!.raw;
    // Épée longue (3-19) ×2 = 6-38 > Épée à deux mains (8-17)
    expect(raw[1] - base[1]).toBe(38);
    expect(raw2[1] - base[1]).toBe(17);
    g.hireMerc('desert', 'defiance');
    g.character.merc!.equipment.mainhand = item('javelin');
    expect(mercDerived(g.character)!.raw[1] - mercDerived(g.character)!.raw[0]).toBeGreaterThan(0);
    const jav = mercDerived(g.character)!.raw;
    g.character.merc!.equipment.mainhand = undefined;
    const none = mercDerived(g.character)!.raw;
    expect(jav[1] - none[1]).toBe(10); // Javelot 1-5, ×2
  });

  it('mort : reste mort (plus d’aura) jusqu’à la résurrection payante en ville', () => {
    const g = rich(30);
    g.hireMerc('desert', 'defiance');
    const def0 = g.world.player.d.defense;
    const m = mercOf(g.world)!;
    g.world.killMonster(m, null);
    expect(g.character.merc!.dead).toBe(true);
    expect(g.world.player.d.defense).toBeLessThan(def0);
    g.startRun('tristram', 0, 2);
    expect(mercOf(g.world)).toBeFalsy();
    g.enterTown();
    const gold = g.character.gold;
    expect(g.resurrectMerc().ok).toBe(true);
    expect(g.character.gold).toBe(gold - g.resurrectCost());
    expect(mercOf(g.world)).toBeTruthy();
    expect(g.world.player.d.defense).toBe(def0);
  });

  it('reprise d’une sauvegarde en pleine run : mercenaire, équipement et aura conservés', () => {
    const g = rich(45);
    g.hireMerc('rogue', 'cold');
    g.character.merc!.equipment.mainhand = generateItem(new Rng('arc'), 'long_war_bow', 40, { forceQuality: 'magic' });
    g.character.merc!.equipment.boots = item('heavy_boots');
    g.startRun('cows', 0, 4);
    g.step(50);
    const back = new Game(deserialize(serialize(g.toSave())));
    expect(back.character.merc?.type).toBe('rogue');
    expect(back.character.merc?.equipment.mainhand?.base).toBe('long_war_bow');
    expect(back.character.merc?.equipment.boots?.base).toBe('heavy_boots');
    expect(back.world.monsters.filter((m) => m.pet === 'merc' && !m.dead).length).toBe(1);
    back.step(50);
    expect(back.world.monsters.filter((m) => m.pet === 'merc' && !m.dead).length).toBe(1);
  });

  it('ancienne sauvegarde : sous-types D2 convertis (Puissance → Offensif, Coup violent → Combat), 4 emplacements', () => {
    const g = rich(85);
    g.hireMerc('desert', 'defiance');
    const save = g.toSave();
    save.character.merc = { type: 'desert', variant: 'might', name: 'Kasim', dead: false, equipment: { mainhand: item('pike'), head: item('cap') } };
    const back = new Game(deserialize(serialize(save)));
    const t = MERC_BY_ID.desert;
    expect(mercVariant(t, back.character.merc!.variant).id).toBe('blessed_aim');
    expect(mercVariant(MERC_BY_ID.barbarian, 'bash').id).toBe('combat');
    expect(mercDerived(back.character)!.auras.map((a) => a.id)).toContain('blessed_aim');
    back.character.inventory[0] = item('chain_gloves');
    expect(back.mercEquip(0).ok).toBe(true);
  });

  it('nouvelle embauche en ville : l’équipement de l’ancien mercenaire revient dans le sac', () => {
    const g = rich(60);
    g.hireMerc('rogue', 'fire');
    const bow = item('long_bow');
    const belt = item('light_belt');
    g.character.merc!.equipment.mainhand = bow;
    g.character.merc!.equipment.belt = belt;
    expect(g.mode).toBe('town');
    expect(g.hireMerc('desert', 'thorns').ok).toBe(true);
    expect(Object.keys(g.character.merc!.equipment)).toEqual([]);
    const bag = g.character.inventory.filter(Boolean).map((i) => i!.uid);
    expect(bag).toContain(bow.uid);
    expect(bag).toContain(belt.uid);
    expect(g.world.items.map((i) => i.item.uid)).not.toContain(bow.uid);
  });

  it('nouvelle embauche : sac plein en ville, l’équipement tombe au sol', () => {
    const g = rich(60);
    g.hireMerc('rogue', 'fire');
    const bow = item('long_bow');
    g.character.merc!.equipment.mainhand = bow;
    // sac saturé de petits objets
    const filler = item('cap');
    g.character.inventory = g.character.inventory.map(() => ({ ...filler, uid: Math.random().toString(36).slice(2) }));
    expect(g.hireMerc('desert', 'thorns').ok).toBe(true);
    expect(g.world.items.map((i) => i.item.uid)).toContain(bow.uid);
  });

  it('découverte d’objets et d’or : celle du mercenaire s’ajoute à celle du joueur sur ses victimes', () => {
    const g = rich(60);
    g.hireMerc('desert', 'thorns');
    const helm = item('cap', 'magic');
    helm.affixes = [];
    helm.craftMods = [
      { stat: 'mf', value: 80 },
      { stat: 'gf', value: 50 },
    ];
    g.character.merc!.equipment.head = helm;
    const w = arena(g, 'zombie', 0, 40);
    const merc = mercOf(w)!;
    const z = w.monsters.find((x) => !x.isSummon)!;
    expect(mercDerived(g.character)!.mf).toBe(80);
    z.mercHit = merc.id;
    expect(mercFindBonus(w, z)).toEqual({ mf: 80, gf: 50 });
    // le joueur porte le dernier coup : rien du mercenaire
    w.hurtMonster(z, { phys: 1, fire: 0, cold: 0, light: 0, poison: 0, magic: 0, spell: true });
    expect(mercFindBonus(w, z)).toEqual({ mf: 0, gf: 0 });
  });

  it('bonus de set : le mercenaire profite des bonus de panoplie (Isenhart sur le Loup de fer)', () => {
    const g = rich(85);
    g.hireMerc('ironwolf', 'fire');
    const piece = (id: string): Item => {
      const it = generateItem(new Rng(5), SET_ITEM_BY_ID[id].base, 60);
      it.quality = 'set';
      it.setId = id;
      return it;
    };
    const eq = g.character.merc!.equipment;
    eq.head = piece('s_isenharts_horns');
    eq.body = piece('s_isenharts_case');
    const two = mercDerived(g.character)!;
    eq.offhand = piece('s_isenharts_parry');
    eq.mainhand = piece('s_isenharts_lightbrand');
    const four = mercDerived(g.character)!;
    // panoplie complète : bonus de résistances (et autres) en plus des pièces
    expect(four.res.fire + four.res.cold + four.str + four.dex).toBeGreaterThan(two.res.fire + two.res.cold + two.str + two.dex);
  });

  // règle `merc.itemWear` : PD2, les objets éthérés ne s'usent pas ; D2 (sans le mod), aucun objet du mercenaire ne s'use
  it('objets éthérés : aucune usure sur le mercenaire, les autres s’usent (PD2 ; D2 : aucun ne s’use)', () => {
    const g = rich(60);
    g.hireMerc('desert', 'thorns');
    const a = item('breast_plate');
    const e = item('breast_plate');
    e.ethereal = true;
    const max = maxDurability(a);
    expect(max).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) {
      mercWear(g.world, a);
      mercWear(g.world, e);
    }
    expect(durabilityOf(a)).toBe(withoutPd2 ? max : max - 5);
    expect(durabilityOf(e)).toBe(max);
  });
});

/* ------------------------------------------------------------------ */
/* Un test par sous-type : aura, compétences, équipement autorisé/refusé */
/* ------------------------------------------------------------------ */

const GEAR: Record<MercId, { ok: string[]; ko: string[] }> = {
  rogue: { ok: ['long_bow', 'stag_bow', 'light_crossbow'], ko: ['pike', 'long_sword', 'buckler'] },
  desert: { ok: ['pike', 'maiden_spear', 'javelin'], ko: ['long_bow', 'long_sword', 'buckler'] },
  ironwolf: { ok: ['long_sword', 'flail', 'scepter', 'eagle_orb', 'buckler', 'targe'], ko: ['two_handed_sword', 'club', 'war_hammer', 'short_staff', 'long_bow'] },
  ascendant: { ok: ['short_staff', 'war_staff'], ko: ['long_sword', 'buckler', 'eagle_orb'] },
  barbarian: { ok: ['long_sword', 'two_handed_sword', 'hand_axe', 'war_hammer', 'flail', 'jawbone_cap'], ko: ['club', 'buckler', 'long_bow', 'pike'] },
};

describe('Sous-types de mercenaires PD2', () => {
  for (const t of MERCS) {
    for (const v of t.variants) {
      it(`${t.name} ${v.name} : aura ${v.aura ?? 'aucune'}, compétences ${v.skills.map((s) => s.id).join('/')}, équipement`, () => {
        const g = rich(85);
        expect(g.hireMerc(t.id, v.id).ok).toBe(true);
        const md = mercDerived(g.character)!;
        // aura native active sur le mercenaire et transmise au joueur
        if (v.aura) {
          expect(md.auras.find((a) => a.id === v.aura)?.level ?? 0).toBeGreaterThan(0);
          expect(g.world.player.buffs.some((b) => b.id === `maura_${v.aura}`)).toBe(true);
        }
        // toutes les compétences du sous-type sont apprises au niveau 85
        for (const s of v.skills) expect(mercSkillLvl(s.id, 85), s.id).toBeGreaterThan(0);
        // équipement autorisé / refusé (prérequis de niveau et de force mis à part)
        for (const b of GEAR[t.id].ok) expect(canMercEquip(g.character, item(b)).ok, `${t.id} porte ${b} : ${canMercEquip(g.character, item(b)).reason}`).toBe(true);
        for (const b of GEAR[t.id].ko) expect(canMercEquip(g.character, item(b)).ok, `${t.id} refuse ${b}`).toBe(false);
        // au combat : il blesse un mort-vivant en quelques secondes
        const w = arena(g, 'zombie', 0, 40);
        w.godMode = true;
        const z = w.monsters.find((x) => !x.isSummon)!;
        z.aggro = true;
        z.hp = z.hpMax = 1e6;
        g.step(25 * 6);
        expect(z.hp, `${t.id}:${v.id}`).toBeLessThan(z.hpMax);
      });
    }
  }

  // comportements PD2 des compétences des mercenaires (Ralentissement qui ralentit la marche, Champ statique qui réduit la résistance)
  it.skipIf(withoutPd2)('Éclaireuse physique : Ralentissement ralentit les monstres ; Loup de fer foudre : Champ statique réduit la résistance', () => {
    const g = rich(85);
    g.hireMerc('rogue', 'phys');
    let w = arena(g, 'zombie', 0, 40);
    w.godMode = true;
    let z = w.monsters.find((x) => !x.isSummon)!;
    z.hp = z.hpMax = 1e6;
    let slowed = false;
    for (let i = 0; i < 25 * 20 && !slowed; i++) {
      g.step(1);
      slowed = (z.slowMul ?? 1) < 1;
    }
    expect(slowed).toBe(true);
    g.hireMerc('ironwolf', 'light');
    w = arena(g, 'zombie', 0, 40);
    w.godMode = true;
    z = w.monsters.find((x) => !x.isSummon)!;
    z.hp = z.hpMax = 1e6;
    let red = false;
    for (let i = 0; i < 25 * 20 && !red; i++) {
      g.step(1);
      red = (z.red.light?.until ?? 0) > w.tick;
    }
    expect(red).toBe(true);
    expect(z.red.light!.v).toBeGreaterThanOrEqual(21);
  });

  it('Ascendant sombre : Amplification des dégâts réduit la résistance physique (table du mercenaire)', () => {
    const g = rich(85);
    expect(g.hireMerc('ascendant', 'dark').ok).toBe(true);
    const w = arena(g, 'zombie', 0, 40);
    w.godMode = true;
    const z = w.monsters.find((x) => !x.isSummon)!;
    z.aggro = true;
    z.hp = z.hpMax = 1e6;
    let ok = false;
    for (let i = 0; i < 25 * 40 && !ok; i++) {
      g.step(1);
      ok = (z.red.phys?.until ?? 0) > w.tick;
    }
    expect(ok).toBe(true);
    // niveau 85 : Amplification niveau 30 → -40 %
    expect(z.red.phys!.v).toBe(40);
  });

  it('Loup de fer : lance des sorts sans frapper de son arme, regagne de la vie à chaque victime (maîtrise)', () => {
    const g = rich(RUN_BY_ID.cows.recLevel[0] + 10);
    expect(g.hireMerc('ironwolf', 'fire').ok).toBe(true);
    g.character.merc!.equipment.mainhand = generateItem(new Rng('epee'), 'long_sword', 20, { forceQuality: 'normal' });
    expect(mercDerived(g.character)!.lifePerKill).toBeGreaterThanOrEqual(12);
    expect(mercDerived(g.character)!.mastery).toBeGreaterThan(20);
    const w = arena(g, 'zombie', 0, 40);
    w.godMode = true;
    const merc = mercOf(w)!;
    const z = w.monsters.find((x) => !x.isSummon)!;
    z.aggro = true;
    z.hp = z.hpMax = 1e6;
    merc.x = z.x - 1;
    merc.y = z.y;
    g.step(25 * 3);
    expect(w.missiles.some((m) => m.kind === 'fireball') || w.areas.some((a) => a.kind === 'meteor_fall') || z.hp < z.hpMax).toBe(true);
    merc.hp = 10;
    z.mercHit = merc.id;
    w.killMonster(z, null);
    expect(merc.hp).toBeGreaterThan(10);
  });

  it('Barbare (Cris de guerre) : Ordres de bataille pour le joueur', () => {
    const g = rich(43);
    const life0 = g.world.player.d.lifeMax;
    expect(g.hireMerc('barbarian', 'warcries').ok).toBe(true);
    expect(g.world.player.buffs.some((b) => b.id === 'maura_battle_orders')).toBe(true);
    expect(g.world.player.d.lifeMax).toBeGreaterThan(life0 * 1.3);
  });
});
