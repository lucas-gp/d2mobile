/** Sanctuaires (shrines.txt) : les 21 effets, leurs durées, le réarmement, le cumul PD2 ; puits. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { interactObject, rearmObjects } from '../../src/sim/objects';
import { spawnMonster } from '../../src/sim/spawn';
import { pickShrine, SHRINES, SHRINE_BY_ID } from '../../src/data/shrines';
import { TICK_HZ } from '../../src/sim/constants';
import type { WorldObject } from '../../src/sim/actors';

function setup(level = 30) {
  const g = new Game();
  g.character.level = level;
  g.startRun('tristram', 0, 7);
  const w = g.world;
  w.monsters = [];
  w.pendingSpawns = [];
  w.refreshPlayer();
  return { g, w, p: w.player };
}

function shrine(w: Game['world'], variant?: string): WorldObject {
  const p = w.player;
  const o: WorldObject = { id: w.newId(), kind: 'shrine', x: p.x + 1, y: p.y, radius: 0.8, used: false, variant, label: 'Sanctuaire' };
  w.objects.push(o);
  return o;
}

describe('Table des sanctuaires', () => {
  it('22 effets (codes 1 à 22 de shrines.txt), durées en images à 25 par seconde', () => {
    expect(SHRINES.map((s) => s.code)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(SHRINE_BY_ID.armor.duration).toBe(2400);
    expect(SHRINE_BY_ID.combat.duration).toBe(2400);
    expect(SHRINE_BY_ID.resist_fire.duration).toBe(3600);
    expect(SHRINE_BY_ID.experience.duration).toBe(3600);
    expect(SHRINE_BY_ID.skill.duration).toBe(2400);
    // PD2 : endurance ramenée à la durée des autres
    expect(SHRINE_BY_ID.stamina.duration).toBe(2400);
    expect(SHRINE_BY_ID.refill.resetMin).toBe(2);
    expect(SHRINE_BY_ID.experience.resetMin).toBe(0);
  });

  it('tirage « magique » : jamais au-dessus du niveau de la zone, jamais santé ni mana', () => {
    let i = 0;
    for (let k = 0; k < 400; k++) {
      const s = pickShrine((n) => (i++ * 7919) % n, 4);
      expect(s.levelMin).toBeLessThanOrEqual(4);
      expect(['health', 'mana']).not.toContain(s.id);
    }
    const seen = new Set<string>();
    for (let k = 0; k < 2000; k++) seen.add(pickShrine((n) => (k * 104729 + 13) % n, 85).id);
    expect(seen.size).toBe(20);
  });
});

describe('Effets instantanés', () => {
  it('recharge, santé, mana', () => {
    const { w, p } = setup();
    p.hp = 1;
    p.mana = 1;
    interactObject(w, shrine(w, 'refill'));
    expect(p.hp).toBe(p.hpMax);
    expect(p.mana).toBe(p.manaMax);
    p.hp = 1;
    p.mana = 1;
    interactObject(w, shrine(w, 'health'));
    expect(p.hp).toBe(p.hpMax);
    expect(p.mana).toBe(1);
    interactObject(w, shrine(w, 'mana'));
    expect(p.mana).toBe(p.manaMax);
  });

  it('échanges : la moitié de la vie donne cinq fois plus de mana, et inversement', () => {
    const { w, p } = setup();
    p.hp = 100;
    p.mana = 0;
    interactObject(w, shrine(w, 'health_exchange'));
    expect(p.hp).toBe(50);
    expect(p.mana).toBe(Math.min(p.manaMax, 250));
    p.mana = 40;
    p.hp = 1;
    interactObject(w, shrine(w, 'mana_exchange'));
    expect(p.mana).toBe(20);
    expect(p.hp).toBe(Math.min(p.hpMax, 101));
  });

  it('portail : un portail vers la ville s’ouvre', () => {
    const { w } = setup();
    w.objects = w.objects.filter((o) => !(o.kind === 'portal' && o.ref === 'town'));
    interactObject(w, shrine(w, 'portal'));
    expect(w.objects.some((o) => o.kind === 'portal' && o.ref === 'town')).toBe(true);
  });

  it('gemmes : améliore une gemme de l’onglet (PD2, gemmes empilées), sinon en donne une', () => {
    const { g, w } = setup();
    g.character.materials = { gem_ruby_1: 2 };
    interactObject(w, shrine(w, 'gem'));
    expect(g.character.materials.gem_ruby_1).toBe(1);
    expect(g.character.materials.gem_ruby_2).toBe(1);
    g.character.materials = {};
    const before = w.items.length;
    interactObject(w, shrine(w, 'gem'));
    expect(w.items.length).toBe(before + 1);
    expect(w.items[w.items.length - 1].item.base).toMatch(/^gem_/);
  });

  it('orage : joueur et monstres proches perdent la moitié de leur vie', () => {
    const { w, p } = setup();
    const m = spawnMonster(w, 'zombie', p.x + 4, p.y, { rank: 'normal' }, 't')!;
    const hp = m.hp;
    p.hp = 200;
    interactObject(w, shrine(w, 'storm'));
    expect(p.hp).toBe(100);
    expect(m.hp).toBe(hp - Math.floor(hp / 2));
  });

  it('distorsion : le monstre ordinaire le plus proche devient unique', () => {
    const { w, p } = setup();
    spawnMonster(w, 'zombie', p.x + 4, p.y, { rank: 'normal' }, 't');
    interactObject(w, shrine(w, 'warping'));
    expect(w.monsters.filter((m) => !m.dead).map((m) => m.rank)).toEqual(['unique']);
  });

  it('explosif et poison : potions lancées autour, les monstres prennent des dégâts', () => {
    for (const id of ['exploding', 'poison']) {
      const { w, p } = setup(40);
      const ms = [0, 1, 2, 3, 4, 5].map((k) => spawnMonster(w, 'zombie', p.x + 1 + Math.cos(k) * 3, p.y + Math.sin(k) * 3, { rank: 'normal' }, `t${k}`)!);
      // la grille spatiale des monstres se reconstruit au tick suivant
      w.step(1);
      interactObject(w, shrine(w, id));
      if (id === 'poison') w.step(TICK_HZ * 2);
      expect(
        ms.some((m) => m.hp < m.hpMax || m.dead),
        id,
      ).toBe(true);
    }
  });

  it('Enirhs : le nom du personnage s’affiche à l’envers', () => {
    const { g, w } = setup();
    g.character.name = 'Abc';
    w.events.drain();
    interactObject(w, shrine(w, 'enirhs'));
    expect(w.events.drain().some((e) => e.t === 'message' && e.text.startsWith('cbA'))).toBe(true);
  });
});

describe('Effets durables', () => {
  const cases: [string, (d: Game['world']['player']['d'], b: Game['world']['player']['d']) => void][] = [
    ['armor', (a, b) => expect(a.defense).toBeGreaterThanOrEqual(b.defense * 2 - 1)],
    [
      'combat',
      (a, b) => {
        expect(a.attackRating).toBeGreaterThan(b.attackRating * 2.5);
        expect(a.meleeDmgPct - b.meleeDmgPct).toBe(200);
      },
    ],
    ['resist_fire', (a, b) => expect(a.res.fire).toBe(Math.min(a.maxRes.fire, b.res.fire + 75))],
    ['resist_cold', (a, b) => expect(a.res.cold).toBe(Math.min(a.maxRes.cold, b.res.cold + 75))],
    ['resist_light', (a, b) => expect(a.res.light).toBe(Math.min(a.maxRes.light, b.res.light + 75))],
    [
      'resist_poison',
      (a, b) => {
        expect(a.res.poison).toBe(Math.min(a.maxRes.poison, b.res.poison + 75));
        expect(a.poisonReduce - b.poisonReduce).toBe(100);
      },
    ],
    ['skill', (a, b) => expect(a.skillLevels.fire_bolt - b.skillLevels.fire_bolt).toBe(2)],
    // +400 % de récupération de mana : le personnage de test a déjà un bonus de base (tables PD2), le rapport est donc légèrement inférieur à 5
    [
      'recharge',
      (a, b) => {
        expect(a.manaRegen / b.manaRegen).toBeGreaterThan(4);
        expect(a.manaRegen / b.manaRegen).toBeLessThanOrEqual(5.05);
      },
    ],
    ['stamina', (a, b) => expect(a.frw - b.frw).toBe(35)],
    ['experience', (a, b) => expect(a.xpPct - b.xpPct).toBe(50)],
  ];
  for (const [id, check] of cases) {
    it(`${id} : effet et durée de shrines.txt`, () => {
      const { w, p } = setup();
      const before = { ...p.d, res: { ...p.d.res }, skillLevels: { ...p.d.skillLevels } };
      interactObject(w, shrine(w, id));
      const b = p.buffs.find((x) => x.id === `shrine_${id}`)!;
      expect(b.until - w.tick).toBe(SHRINE_BY_ID[id].duration);
      check(p.d, before);
      // l'effet tombe à la fin de sa durée
      w.step(SHRINE_BY_ID[id].duration + 1);
      expect(p.buffs.some((x) => x.id === `shrine_${id}`)).toBe(false);
    });
  }

  it('PD2 : des sanctuaires différents se cumulent, le même se renouvelle', () => {
    const { w, p } = setup();
    interactObject(w, shrine(w, 'armor'));
    w.step(100);
    interactObject(w, shrine(w, 'skill'));
    interactObject(w, shrine(w, 'armor'));
    expect(p.buffs.filter((b) => b.id === 'shrine_armor').length).toBe(1);
    expect(p.buffs.find((b) => b.id === 'shrine_armor')!.until - w.tick).toBe(2400);
    expect(p.buffs.some((b) => b.id === 'shrine_skill')).toBe(true);
  });
});

describe('Réarmement et puits', () => {
  it('un sanctuaire se réarme après son délai (recharge : 2 min), l’expérience jamais', () => {
    const { w } = setup();
    const a = shrine(w, 'refill');
    const b = shrine(w, 'experience');
    interactObject(w, a);
    interactObject(w, b);
    expect(a.used && b.used).toBe(true);
    w.tick += 2 * 60 * TICK_HZ;
    rearmObjects(w);
    expect(a.used).toBe(false);
    expect(a.variant).toBe('refill');
    expect(b.used).toBe(true);
  });

  it('un sanctuaire « magique » garde son effet et prend son nom', () => {
    const { w } = setup();
    const o = shrine(w);
    interactObject(w, o);
    expect(SHRINE_BY_ID[o.variant!]).toBeDefined();
    expect(o.label).toBe(SHRINE_BY_ID[o.variant!].name);
  });

  it('puits : trois gorgées qui rendent vie et mana et guérissent le poison', () => {
    const { w, p } = setup();
    const o: WorldObject = { id: w.newId(), kind: 'well', x: p.x + 1, y: p.y, radius: 0.8, used: false, label: 'Puits' };
    w.objects.push(o);
    for (let k = 0; k < 3; k++) {
      p.hp = 1;
      p.poisonT = 50;
      interactObject(w, o);
      expect(p.hp).toBeGreaterThan(p.hpMax * 0.4);
      expect(p.poisonT).toBe(0);
    }
    expect(o.used).toBe(true);
  });
});
