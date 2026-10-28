/**
 * Druide : classe (caractéristiques D2, arbres propres), métamorphoses automatiques, créatures
 * ciblées par les monstres, Armure du cyclone, suivi des créatures entre zones, reprise d'une
 * sauvegarde en pleine run avec des créatures.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { hasBuff } from '../../src/sim/skills';
import { petsOf, playerForm } from '../../src/sim/druid';
import { emptyPacket } from '../../src/sim/actors';
import { deserialize, serialize } from '../../src/sim/save';
import { Rng } from '../../src/core/rng';
import { generateItem } from '../../src/sim/loot/itemgen';
import { itemFinal } from '../../src/sim/itemstats';
import { STAT_CLASS } from '../../src/data/classes';
import { canEquip } from '../../src/sim/character';
import { pickEquipBase } from '../../src/sim/loot/drops';

Game.resumeOnLoad = true; // ces tests vérifient la reprise de run (le jeu, lui, revient toujours en ville)

function druidArena(skills: Record<string, number>, monster = 'hell_bovine'): { g: Game; w: World } {
  const g = new Game(undefined, 'druid');
  addXp(g.character, xpToReach(40));
  g.character.skills = skills;
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster, x: 16, y: 15, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 3, difficulty: 0, zoneLevel: 20, character: g.character });
  g.world.populate();
  return { g, w: g.world };
}

function cast(g: Game, skill: string, tx: number, ty: number, targetId = 0): void {
  const w = g.world;
  w.player.mana = w.player.manaMax;
  w.input.cast = { skill, tx, ty, targetId };
  g.step(30);
}

describe('Druide', () => {
  it('caractéristiques D2, premier sort et arbres propres', () => {
    const g = new Game(undefined, 'druid');
    const c = g.character;
    expect(c.classId).toBe('druid');
    expect(c.base).toEqual({ str: 15, dex: 20, vit: 25, ene: 20 });
    expect(c.skills.firestorm).toBe(1);
    expect(g.world.player.d.lifeMax).toBe(55);
    expect(g.world.player.d.manaMax).toBe(20);
    c.skillPoints = 5;
    expect(g.canLearn('fire_bolt').ok).toBe(false);
    expect(g.canLearn('raven').ok).toBe(true);
    // la Sorcière ne peut pas apprendre les compétences du Druide
    const s = new Game();
    s.character.skillPoints = 5;
    expect(s.canLearn('arctic_blast').ok).toBe(false);
  });

  it('une attaque de loup-garou transforme le Druide ; un sort élémentaire le ramène à forme humaine', () => {
    // PD2 : la vie en forme animale vient de la Lycanthropie
    const { g, w } = druidArena({ werewolf: 1, feral_rage: 5, tornado: 5, shape_shifting: 5 });
    const m = w.monsters[0];
    m.x = m.px = w.player.x + 1.2;
    cast(g, 'feral_rage', m.x, m.y, m.id);
    expect(playerForm(w)).toBe('werewolf');
    const life = w.player.hpMax;
    expect(life).toBeGreaterThan(g.character.level * 1.5);
    cast(g, 'tornado', m.x, m.y, m.id);
    expect(playerForm(w)).toBe(null);
    expect(w.player.hpMax).toBeLessThan(life);
  });

  it('les monstres attaquent une créature plus proche que le Druide', () => {
    const { g, w } = druidArena({ spirit_wolf: 5, raven: 1 }, 'zombie');
    cast(g, 'spirit_wolf', w.player.x + 3, w.player.y);
    const wolves = petsOf(w, 'spirit_wolf');
    expect(wolves.length).toBeGreaterThan(0);
    const hp0 = wolves.map((x) => x.hp);
    const zombie = w.monsters.find((x) => !x.isSummon)!;
    zombie.aggro = true;
    g.world.godMode = true;
    g.step(25 * 10);
    const hurt = wolves.some((x, i) => x.dead || x.hp < hp0[i]);
    expect(hurt || zombie.dead, 'un loup a été frappé, ou le zombie est mort').toBe(true);
  });

  it("l'Armure du cyclone absorbe les dégâts élémentaires", () => {
    const { g, w } = druidArena({ arctic_blast: 1, cyclone_armor: 10 });
    cast(g, 'cyclone_armor', w.player.x, w.player.y);
    expect(hasBuff(w, 'cyclone_armor')).toBe(true);
    const pool = w.player.absorbPool ?? 0;
    expect(pool).toBeGreaterThan(100);
    const hp = w.player.hp;
    const pk = emptyPacket(true);
    pk.fire = 50;
    w.hurtPlayerPacket(null, pk);
    expect(w.player.hp).toBe(hp);
    expect(w.player.absorbPool).toBeLessThan(pool);
  });

  it('créatures et formes suivent le Druide en ville, pas après sa mort', () => {
    const { g, w } = druidArena({ spirit_wolf: 3, oak_sage: 1, raven: 1, werebear: 1 });
    cast(g, 'spirit_wolf', w.player.x + 2, w.player.y);
    cast(g, 'oak_sage', w.player.x, w.player.y);
    expect(petsOf(w).length).toBeGreaterThanOrEqual(2);
    g.enterTown();
    expect(petsOf(g.world, 'spirit_wolf').length).toBe(1);
    expect(hasBuff(g.world, 'oak_sage')).toBe(true);
    // mort : les créatures disparaissent
    const { g: g2, w: w2 } = druidArena({ spirit_wolf: 3 });
    cast(g2, 'spirit_wolf', w2.player.x + 2, w2.player.y);
    w2.killPlayer();
    g2.step(25 * 4);
    expect(petsOf(g2.world).length).toBe(0);
  });

  it('reprise en pleine run avec des créatures', () => {
    const g = new Game(undefined, 'druid');
    addXp(g.character, xpToReach(20));
    g.character.skills = { raven: 1, spirit_wolf: 3, oak_sage: 1 };
    g.startRun('tristram', 0, 7);
    const w = g.world;
    cast(g, 'spirit_wolf', w.player.x + 2, w.player.y);
    const n = petsOf(g.world).length;
    expect(n).toBeGreaterThan(0);
    const back = new Game(deserialize(serialize(g.toSave())));
    expect(back.character.classId).toBe('druid');
    expect(petsOf(back.world).length).toBe(n);
    back.step(50);
    expect(petsOf(back.world).length).toBe(n);
  });

  it('les affixes « +compétences » ne tombent que pour la classe en jeu', () => {
    for (const cls of ['sorceress', 'druid'] as const) {
      new Game(undefined, cls);
      const rng = new Rng(`affixes:${cls}`);
      const seen = new Set<string>();
      for (let i = 0; i < 600; i++) {
        const it = generateItem(rng, i % 2 ? 'amulet' : 'circlet', 70, { forceQuality: 'magic' });
        for (const k of itemFinal(it, 70).stats.keys()) if (STAT_CLASS[k]) seen.add(STAT_CLASS[k]);
      }
      expect([...seen]).toEqual([cls]);
    }
  });

  it('coffre partagé : un objet déposé par la Sorcière est repris par le Druide', () => {
    const sorc = new Game();
    sorc.attachShared(null);
    const it = generateItem(new Rng('partage'), 'amulet', 40, { forceQuality: 'rare' });
    sorc.character.inventory[0] = it;
    const sharedTab = sorc.character.stash.length - 1;
    expect(sorc.stash(0, sharedTab)).toBe(true);
    // la sauvegarde du personnage n'emporte pas le coffre partagé ; celui-ci a la sienne
    expect(sorc.toSave().character.stash.length).toBe(4);
    const shared = JSON.parse(JSON.stringify(sorc.sharedStash()));
    const druid = new Game(undefined, 'druid');
    druid.attachShared(shared);
    const found = druid.character.stash[sharedTab].findIndex((x) => x?.uid === it.uid);
    expect(found).toBeGreaterThanOrEqual(0);
    expect(druid.unstash(sharedTab, found)).toBe(true);
    expect(druid.character.inventory.some((x) => x?.uid === it.uid)).toBe(true);
    expect(
      druid
        .sharedStash()!
        .tabs.flat()
        .some((x) => x?.uid === it.uid),
    ).toBe(false);
  });

  it('peaux du Druide : bonus automatique de compétence, réservées au Druide ; orbes réservés à la Sorcière', () => {
    const druid = new Game(undefined, 'druid');
    const rng = new Rng('peaux');
    // staffmods PD2 : 0 à 3 compétences de Druide (10 % sans)
    let pelt = generateItem(rng, 'blood_spirit', 80, { forceQuality: 'magic' });
    while (!pelt.automod?.length) pelt = generateItem(rng, 'blood_spirit', 80, { forceQuality: 'magic' });
    const auto = pelt.automod?.[0];
    expect(auto?.stat).toBe('classSkill');
    expect(auto?.value).toBeGreaterThanOrEqual(1);
    const c = druid.character;
    c.level = 70;
    c.base.str = 120;
    const before = druid.world.player.d.skillLevels[auto!.param!] ?? 0;
    c.equipment.head = pelt;
    druid.world.refreshPlayer();
    expect(druid.world.player.d.skillLevels[auto!.param!]).toBe(before + auto!.value);
    const sorc = new Game();
    sorc.character.level = 70;
    sorc.character.base.str = 120;
    expect(canEquip(sorc.character, pelt).ok).toBe(false);
    expect(canEquip(c, generateItem(rng, 'eagle_orb', 10, { forceQuality: 'normal' })).ok).toBe(false);
    // butin : jamais d'objet réservé à l'autre classe
    for (const [cls, other] of [
      ['druid', 'sorceress'],
      ['sorceress', 'druid'],
    ] as const) {
      new Game(undefined, cls);
      const r = new Rng(`butin:${other}`);
      for (let i = 0; i < 3000; i++) {
        const b = pickEquipBase(r, 85);
        expect(b?.classOnly === other).toBe(false);
      }
    }
  });
});
