/** Quêtes de Diablo II : les 27, leurs objets, livraisons, objets du monde, vraies récompenses et verrous d'acte. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { QUESTS, QUEST_BY_ID, QUEST_ITEMS, QUEST_OBJECTS } from '../../src/data/quests';
import { RUNS } from '../../src/data/runs';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { onMonsterDeath, useQuestObject } from '../../src/sim/quests';
import { interactObject } from '../../src/sim/objects';
import { spawnMonster } from '../../src/sim/spawn';
import { matCount } from '../../src/sim/materials';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import type { Difficulty } from '../../src/data/types';

/** Lance la zone et renvoie l'objet de quête `id` qu'elle contient */
function zoneWith(g: Game, zone: string, id: string, d: Difficulty = 0) {
  g.startRun(zone, d, 3);
  const o = g.world.objects.find((x) => x.kind === 'quest' && x.ref === id);
  expect(o, `${zone} : ${id}`).toBeDefined();
  return o!;
}
const touch = (g: Game, id: number) => {
  const o = g.world.objects.find((x) => x.id === id)!;
  interactObject(g.world, o);
  g.step(1);
};
const give = (g: Game, id: string) => (g.character.materials[id] = (g.character.materials[id] ?? 0) + 1);

describe('Liste des quêtes', () => {
  it('27 quêtes : 6 / 6 / 6 / 3 / 6, chacune avec sa zone de campagne et son PNJ', () => {
    const n = (a: string) => QUESTS.filter((q) => q.act === a).length;
    expect([n('act1'), n('act2'), n('act3'), n('act4'), n('act5')]).toEqual([6, 6, 6, 3, 6]);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(27);
    for (const q of QUESTS) expect(q.giver, q.id).toBeTruthy();
  });

  it('D2 : 4 points de compétence et 5 de caractéristiques par difficulté, aucun donné par une run', () => {
    expect(QUESTS.reduce((a, q) => a + (q.reward?.skillPoints ?? 0), 0)).toBe(4);
    expect(QUESTS.reduce((a, q) => a + (q.reward?.statPoints ?? 0), 0)).toBe(5);
    for (const r of RUNS) expect(r.firstClear, r.id).toEqual({});
    expect(QUEST_BY_ID.den.reward?.skillPoints).toBe(1);
    expect(QUEST_BY_ID.radament.reward?.skillPoints).toBe(1);
    expect(QUEST_BY_ID.izual.reward?.skillPoints).toBe(2);
    expect(QUEST_BY_ID.lam_esen.reward?.statPoints).toBe(5);
    expect(QUEST_BY_ID.anya.reward?.resAll).toBe(10);
    expect(QUEST_BY_ID.golden_bird.reward?.life).toBe(20);
  });

  it('objets de quête : des bases d’objet invendables, objets du monde reliés à une quête', () => {
    for (const q of QUEST_ITEMS) {
      expect(BASE_BY_ID[q.id], q.id).toBeDefined();
      expect(BASE_BY_ID[q.id].price).toBe(0);
    }
    for (const o of QUEST_OBJECTS) {
      if (o.quest) expect(QUEST_BY_ID[o.quest], o.id).toBeDefined();
      if (o.gives) expect(BASE_BY_ID[o.gives], o.gives).toBeDefined();
      if (o.needs) expect(BASE_BY_ID[o.needs], o.needs).toBeDefined();
    }
  });
});

describe('Acte I', () => {
  it('Les Outils du métier : Malus des Casernes rapporté à Charsi → imprégnation', () => {
    const g = new Game();
    const o = zoneWith(g, 'a1_barracks', 'q_malus');
    expect(g.imbueAvailable()).toBe(false);
    touch(g, o.id);
    expect(matCount(g.character, 'horadric_malus')).toBe(1);
    g.enterTown();
    g.talkTo('charsi');
    expect(matCount(g.character, 'horadric_malus')).toBe(0);
    expect(g.questDone('malus')).toBe(true);
    expect(g.imbueAvailable()).toBe(true);
    // Cain délivré ne donne plus l'imprégnation
    const g2 = new Game();
    g2.character.progression.completions['a1_tristram:0'] = 1;
    expect(g2.imbueAvailable()).toBe(false);
  });

  it('imprégnation PD2 : objet normal sans châsse, niveau d’objet = niveau du personnage + 4', () => {
    const g = new Game();
    g.character.level = 30;
    g.completeQuest('malus');
    g.character.inventory[0] = generateItem(new Rng('m'), 'short_sword', 10, { forceQuality: 'magic' });
    expect(g.imbue(0).ok).toBe(false);
    const sock = generateItem(new Rng('s'), 'short_sword', 10, { forceQuality: 'normal' });
    sock.sockets = 1;
    g.character.inventory[0] = sock;
    expect(g.imbue(0).ok).toBe(false);
    g.character.inventory[0] = generateItem(new Rng('n'), 'short_sword', 10, { forceQuality: 'normal' });
    expect(g.imbue(0).ok).toBe(true);
    expect(g.character.inventory[0]?.quality).toBe('rare');
    expect(g.character.inventory[0]?.ilvl).toBe(34);
    expect(g.imbueAvailable()).toBe(false);
  });

  it('Le Cimetière des Sœurs : Kashya offre le prochain mercenaire de l’Acte I', () => {
    const g = new Game();
    g.character.level = 20;
    g.character.gold = 0;
    g.completeQuest('raven');
    const offer = g.mercOffers().find((o) => o.type.act === 1)!;
    expect(offer.cost).toBe(0);
    expect(g.hireMerc(offer.type.id, offer.type.variants[0].id).ok).toBe(true);
    expect(g.mercOffers().find((o) => o.type.act === 1)!.cost).toBeGreaterThan(0);
  });

  it('L’Antre du Mal : zone nettoyée → 1 point de compétence, une fois par difficulté', () => {
    const g = new Game();
    const sp = g.character.skillPoints;
    g.startRun('a1_den', 0, 1);
    for (const m of g.world.monsters) g.world.killMonster(m, g.world.player);
    g.world.pendingSpawns = [];
    const m = spawnMonster(g.world, 'zombie', g.world.player.x + 3, g.world.player.y, { rank: 'normal' }, 'x')!;
    g.world.killMonster(m, g.world.player);
    g.step(1);
    expect(g.questDone('den')).toBe(true);
    expect(g.character.skillPoints).toBe(sp + 1);
    g.completeQuest('den');
    expect(g.character.skillPoints).toBe(sp + 1);
    expect(g.questDone('den', 1)).toBe(false);
  });
});

describe('Acte II', () => {
  it('Le Soleil terni : l’autel donne l’Amulette de la Vipère et accomplit la quête', () => {
    const g = new Game();
    const o = zoneWith(g, 'a2_viper2', 'q_viper_altar');
    touch(g, o.id);
    expect(matCount(g.character, 'viper_amulet')).toBe(1);
    expect(g.questDone('tainted')).toBe(true);
  });

  it('Le Bâton horadrique : coffre doré du Repaire des vers, orifice du vrai tombeau (seulement lui)', () => {
    const g = new Game();
    const c = zoneWith(g, 'a2_maggot3', 'qchest_staff');
    touch(g, c.id);
    expect(matCount(g.character, 'staff_of_kings')).toBe(1);
    // le vrai tombeau change avec la difficulté (Normal : le 4e)
    g.startRun('a2_tomb1', 0, 3);
    expect(g.world.objects.some((x) => x.kind === 'quest' && x.ref === 'q_orifice')).toBe(false);
    const o = zoneWith(g, 'a2_tomb4', 'q_orifice');
    touch(g, o.id);
    expect(g.questDone('staff')).toBe(false);
    expect(o.used).toBe(false);
    // le Cube (autre lot) assemble le Bâton horadrique ; on le donne ici
    give(g, 'horadric_staff');
    touch(g, o.id);
    expect(g.questDone('staff')).toBe(true);
    expect(matCount(g.character, 'horadric_staff')).toBe(0);
  });

  it('Le Sanctuaire des arcanes : accompli en y entrant ; L’Invocateur : à sa mort', () => {
    const g = new Game();
    g.startRun('a2_arcane', 0, 2);
    g.step(1);
    expect(g.questDone('arcane')).toBe(true);
    onMonsterDeath(g, { id: -1, x: 0, y: 0, monster: 'summoner' });
    expect(g.questDone('summoner')).toBe(true);
  });

  it('La Tanière de Radament : 1 point de compétence', () => {
    const g = new Game();
    g.startRun('a2_sewer3', 0, 2);
    const sp = g.character.skillPoints;
    onMonsterDeath(g, { id: -1, x: 0, y: 0, monster: 'radament' });
    expect(g.character.skillPoints).toBe(sp + 1);
  });
});

describe('Acte III', () => {
  it('L’Oiseau d’or : figurine sur le premier élite de l’acte, Meshif, Alkor → +20 vie', () => {
    const g = new Game();
    g.startRun('a3_spider', 0, 2);
    const p = g.world.player;
    onMonsterDeath(g, { id: -1, x: p.x, y: p.y, monster: 'zombie', rank: 'normal' });
    expect(g.world.items.some((i) => i.item.base === 'jade_figurine')).toBe(false);
    onMonsterDeath(g, { id: -1, x: p.x, y: p.y, monster: 'zombie', rank: 'champion' });
    expect(g.world.items.filter((i) => i.item.base === 'jade_figurine').length).toBe(1);
    onMonsterDeath(g, { id: -1, x: p.x, y: p.y, monster: 'zombie', rank: 'unique' });
    expect(g.world.items.filter((i) => i.item.base === 'jade_figurine').length).toBe(1);
    give(g, 'jade_figurine');
    g.talkTo('meshif3');
    expect(matCount(g.character, 'golden_bird')).toBe(1);
    const life = g.world.player.hpMax;
    g.talkTo('alkor');
    expect(g.questDone('golden_bird')).toBe(true);
    expect(g.character.bonuses.life).toBe(20);
    expect(g.world.player.hpMax).toBeGreaterThan(life);
  });

  it('Le Grimoire de Lam Esen : trouvé au Temple en ruine, rapporté à Alkor → +5 caractéristiques', () => {
    const g = new Game();
    const o = zoneWith(g, 'a3_temple1', 'q_lam_esen');
    touch(g, o.id);
    const st = g.character.statPoints;
    g.talkTo('alkor');
    expect(g.character.statPoints).toBe(st + 5);
    expect(g.questDone('lam_esen')).toBe(true);
  });

  it('La Lame de l’ancienne religion : Gidbinn rapporté à Ormus → anneau rare corrompu, mercenaire offert', () => {
    const g = new Game();
    g.character.level = 30;
    const o = zoneWith(g, 'a3_jungle', 'q_gidbinn');
    touch(g, o.id);
    g.talkTo('ormus');
    expect(g.questDone('gidbinn')).toBe(true);
    const all = [...g.character.inventory, ...g.character.stash.flat()].filter(Boolean);
    const ring = all.find((it) => it!.base === 'ring');
    expect(ring?.quality === 'rare' || ring?.quality === 'magic').toBe(true);
    expect(ring?.corrupted).toBeDefined();
    expect(g.mercOffers().find((x) => x.type.act === 3)!.cost).toBe(0);
  });

  it('La Volonté de Khalim : trois coffres dorés, le Fléau du Conseil, l’Orbe exige la Volonté', () => {
    const g = new Game();
    for (const [zone, id, item] of [
      ['a3_cave2', 'qchest_eye', 'khalim_eye'],
      ['a3_flayer3', 'qchest_brain', 'khalim_brain'],
      ['a3_sewer2', 'qchest_heart', 'khalim_heart'],
    ] as const) {
      const o = zoneWith(g, zone, id);
      touch(g, o.id);
      expect(matCount(g.character, item), item).toBe(1);
    }
    const orb = zoneWith(g, 'a3_travincal', 'q_compelling_orb');
    const p = g.world.player;
    onMonsterDeath(g, { id: -1, x: p.x, y: p.y, monster: 'council_member' });
    expect(g.world.items.some((i) => i.item.base === 'khalim_flail')).toBe(true);
    touch(g, orb.id);
    expect(g.questDone('khalim')).toBe(false);
    give(g, 'khalim_will');
    touch(g, orb.id);
    expect(g.questDone('khalim')).toBe(true);
  });

  it('Le Temple noirci : tous les membres du Haut Conseil', () => {
    const g = new Game();
    g.startRun('a3_travincal', 0, 3);
    const w = g.world;
    w.monsters = [];
    w.pendingSpawns = [];
    const a = spawnMonster(w, 'council_member', w.player.x + 4, w.player.y, { rank: 'unique' }, 'a')!;
    const b = spawnMonster(w, 'council_member', w.player.x + 6, w.player.y, { rank: 'unique' }, 'b')!;
    w.killMonster(a, w.player);
    g.step(1);
    expect(g.questDone('council')).toBe(false);
    w.killMonster(b, w.player);
    g.step(1);
    expect(g.questDone('council')).toBe(true);
  });
});

describe('Acte IV', () => {
  it('La Forge infernale : marteau d’Héphasto, Forge → une rune de la plage de la difficulté et quatre gemmes', () => {
    for (const d of [0, 1, 2] as Difficulty[]) {
      const g = new Game();
      g.character.progression.highestDifficulty = 2;
      const forge = zoneWith(g, 'a4_river', 'q_hellforge', d);
      const p = g.world.player;
      onMonsterDeath(g, { id: -1, x: p.x, y: p.y, monster: 'hephasto' });
      const hammer = g.world.items.find((i) => i.item.base === 'hellforge_hammer');
      expect(hammer).toBeDefined();
      give(g, 'hellforge_hammer');
      const before = g.world.items.length;
      touch(g, forge.id);
      expect(g.questDone('forge', d)).toBe(true);
      const drops = g.world.items.slice(before).map((i) => i.item.base);
      const rune = drops.find((b) => /^r\d\d$/.test(b))!;
      const [lo, hi] = [
        [1, 11],
        [12, 22],
        [15, 25],
      ][d];
      expect(Number(rune.slice(1))).toBeGreaterThanOrEqual(lo);
      expect(Number(rune.slice(1))).toBeLessThanOrEqual(hi);
      expect(
        drops
          .filter((b) => b.startsWith('gem_'))
          .map((b) => Number(b.slice(-1)))
          .sort(),
      ).toEqual([2, 3, 3, 4]);
    }
  });

  it('L’Ange déchu : 2 points de compétence', () => {
    const g = new Game();
    g.startRun('a4_plains', 0, 1);
    const sp = g.character.skillPoints;
    onMonsterDeath(g, { id: -1, x: 0, y: 0, monster: 'izual' });
    expect(g.character.skillPoints).toBe(sp + 2);
  });
});

describe('Acte V', () => {
  it('Le Siège d’Harrogath : Shenk (campagne ou run d’Eldritch) → Larzuk perce un objet selon les règles PD2', () => {
    const g = new Game();
    g.startRun('eldritch', 0, 1);
    onMonsterDeath(g, { id: -1, x: 0, y: 0, monster: 'shenk' });
    expect(g.questDone('siege')).toBe(true);
    expect(g.socketQuestAvailable()).toBe(true);
    const normal = generateItem(new Rng('a'), 'war_axe', 50, { forceQuality: 'normal' });
    normal.sockets = 0;
    g.character.inventory[0] = normal;
    const r = g.socketQuest(0);
    expect(r.ok).toBe(true);
    expect(normal.sockets).toBe(BASE_BY_ID.war_axe.maxSockets);
    expect(g.socketQuestAvailable()).toBe(false);
    // magique : 1 ou 2 ; rare : 1
    for (const [q, max] of [
      ['magic', 2],
      ['rare', 1],
    ] as const) {
      const g2 = new Game();
      g2.completeQuest('siege');
      const it = generateItem(new Rng(q), 'war_axe', 50, { forceQuality: q });
      it.sockets = 0;
      g2.character.inventory[0] = it;
      expect(g2.socketQuest(0).ok).toBe(true);
      expect(it.sockets).toBeGreaterThanOrEqual(1);
      expect(it.sockets).toBeLessThanOrEqual(max);
    }
  });

  it('Sauvetage sur le mont Arreat : toutes les cages ouvertes → Ral, Ort, Tal', () => {
    const g = new Game();
    g.startRun('a5_highlands', 0, 1);
    const cages = g.world.objects.filter((o) => o.kind === 'quest' && o.ref === 'q_prison');
    expect(cages.length).toBe(3);
    for (const o of cages.slice(0, -1)) touch(g, o.id);
    expect(g.questDone('rescue')).toBe(false);
    touch(g, cages[cages.length - 1].id);
    expect(g.questDone('rescue')).toBe(true);
    for (const r of ['r07', 'r08', 'r09']) expect(matCount(g.character, r), r).toBe(1);
  });

  it('La Prison de glace : Anya délivrée → +10 % à toutes les résistances', () => {
    const g = new Game();
    const o = zoneWith(g, 'a5_river', 'q_anya');
    const before = g.world.player.d.res.fire;
    touch(g, o.id);
    expect(g.questDone('anya')).toBe(true);
    expect(g.character.bonuses.resAll).toBe(10);
    expect(g.world.player.d.res.fire).toBe(before + 10);
  });
});

describe('Verrous d’acte', () => {
  it('l’acte suivant s’ouvre à la mort du boss, par difficulté seulement (lot 320 : comme Diablo II)', () => {
    const g = new Game();
    expect(g.actLock('act1', 0)).toBeNull();
    for (const a of ['act2', 'act3', 'act4', 'act5']) expect(g.actLock(a, 0), a).not.toBeNull();
    g.character.progression.completions['a1_andariel:0'] = 1;
    expect(g.actLock('act2', 0)).toBeNull();
    expect(g.actLock('act2', 1)).not.toBeNull();
    // lot 320 (audit 3.12) : une difficulté dépassée n'ouvre plus ses actes, ni une zone de l'acte déjà parcourue
    g.character.progression.highestDifficulty = 1;
    expect(g.actLock('act5', 0)).not.toBeNull();
    const old = new Game();
    old.character.progression.milestones['zone:a3_spider'] = 10;
    expect(old.actLock('act3', 0)).not.toBeNull();
    old.character.progression.completions['a2_tomb4:0'] = 1;
    expect(old.actLock('act3', 0)).toBeNull();
  });
});

describe('Objets de quête du monde', () => {
  it('chaque objet de quête est posé dans sa zone (cartes absentes : près du départ)', () => {
    for (const def of QUEST_OBJECTS) {
      if (def.zone === 'river' || def.zone === 'a2_tomb' || def.zone === 'a1_tristram') continue;
      const g = new Game();
      g.character.progression.highestDifficulty = 2;
      g.startRun(def.zone, 0, 9);
      expect(g.world.objects.filter((o) => o.kind === 'quest' && o.ref === def.id).length, def.zone).toBe(def.count ?? 1);
    }
  });

  it('un objet déjà rapporté ne se reprend pas à la même difficulté', () => {
    const g = new Game();
    g.completeQuest('lam_esen');
    const o = zoneWith(g, 'a3_temple1', 'q_lam_esen');
    useQuestObject(g, o.id);
    expect(matCount(g.character, 'lam_esen_tome')).toBe(0);
  });
});
