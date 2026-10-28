import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach, levelDiffMultiplier } from '../../src/sim/progression';
import { deserialize, serialize, SAVE_VERSION } from '../../src/sim/save';
import { spawnMonster } from '../../src/sim/spawn';
import { TICK_HZ } from '../../src/sim/constants';
import { XP_TABLE } from '../../src/data/xp';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { withoutPd2 } from '../needs-pd2';

describe('Expérience', () => {
  it('table D2 officielle', () => {
    expect(XP_TABLE.length).toBe(99);
    expect(xpToReach(2)).toBe(500);
    expect(xpToReach(99)).toBe(3520485254);
    for (let i = 1; i < XP_TABLE.length; i++) expect(XP_TABLE[i]).toBeGreaterThan(XP_TABLE[i - 1]);
  });

  it('montées de niveau multiples, 5 points de caractéristiques et 1 de compétence', () => {
    const g = new Game();
    const c = g.character;
    const gained = addXp(c, xpToReach(5));
    expect(gained).toBe(4);
    expect(c.level).toBe(5);
    expect(c.statPoints).toBe(20);
    expect(c.skillPoints).toBe(4);
  });

  // règle `xp.levelFactor` : approximation du jeu pd2 ; D2 1.13c, facteurs sur 256 (tests/unit/vanilla-progression.test.ts)
  it('pénalité d’écart de niveau', () => {
    expect(levelDiffMultiplier(10, 10)).toBe(1);
    expect(levelDiffMultiplier(20, 10)).toBe(withoutPd2 ? 13 / 256 : 0.05);
    expect(levelDiffMultiplier(16, 10)).toBe(withoutPd2 ? 207 / 256 : 0.81);
    expect(levelDiffMultiplier(10, 20)).toBe(withoutPd2 ? 5 / 256 : 0.5);
  });
});

describe('Simulation', () => {
  it('la Sorcière tue un monstre au Trait de feu et gagne de l’expérience', () => {
    const g = new Game();
    g.startRun('tristram', 0, 42);
    const w = g.world;
    w.monsters.length = 0;
    w.pendingSpawns.length = 0;
    const p = w.player;
    const m = spawnMonster(w, 'zombie', p.x + 5, p.y, { rank: 'normal' }, 't')!;
    expect(m).toBeTruthy();
    const xp0 = g.character.xp;
    for (let i = 0; i < TICK_HZ * 20 && !m.dead; i++) {
      w.input.cast = { skill: 'fire_bolt', tx: m.x, ty: m.y, targetId: m.id };
      g.step(1);
    }
    expect(m.dead).toBe(true);
    expect(g.character.xp).toBeGreaterThan(xp0);
  });

  it('déterminisme : même graine, même partie', () => {
    const run = () => {
      const g = new Game();
      g.startRun('tristram', 0, 7);
      const w = g.world;
      for (let i = 0; i < 1500; i++) {
        w.input.moveX = Math.cos(i / 200);
        w.input.moveY = Math.sin(i / 300) - 0.5;
        if (i % 10 === 0) {
          const t = w.aliveMonsters()[0];
          if (t) w.input.cast = { skill: 'fire_bolt', tx: t.x, ty: t.y, targetId: t.id };
        }
        g.step(1);
      }
      return JSON.stringify({ p: [w.player.x, w.player.y, w.player.hp], m: w.monsters.map((m) => [m.x, m.y, m.hp]), xp: g.character.xp });
    };
    expect(run()).toBe(run());
  });

  it('le joueur glisse le long des murs au lieu de se bloquer', () => {
    const g = new Game();
    g.startRun('tristram', 0, 1);
    const w = g.world;
    w.monsters.length = 0;
    w.pendingSpawns.length = 0;
    // on pousse en diagonale vers le bord nord : le personnage doit continuer à avancer en x
    w.player.x = 30;
    w.player.y = 4.5;
    const x0 = w.player.x;
    for (let i = 0; i < 50; i++) {
      w.input.moveX = 0.7;
      w.input.moveY = -0.7;
      g.step(1);
    }
    expect(w.player.x).toBeGreaterThan(x0 + 2);
  });
});

describe('Sauvegarde', () => {
  it('aller-retour d’un personnage complexe, y compris en pleine run', () => {
    const g = new Game();
    const c = g.character;
    addXp(c, xpToReach(30));
    g.allocateStat('vit', 20);
    g.learnSkill('ice_bolt');
    g.learnSkill('frost_nova');
    const rng = new Rng(4);
    c.inventory[0] = generateItem(rng, 'swirling_crystal', 50, { forceUniqueId: 'u_the_oculus' });
    c.inventory[1] = generateItem(rng, 'circlet', 30, { forceQuality: 'rare' });
    c.stash[1][3] = generateItem(rng, 'archon_plate', 80, { forceQuality: 'normal' });
    c.materials.r10 = 3;
    g.equip(1);
    g.startRun('tristram', 0, 1234);
    // invulnérable : le test porte sur la sauvegarde, pas sur la survie
    g.world.godMode = true;
    for (let i = 0; i < 400; i++) {
      g.world.input.moveX = -0.5;
      g.world.input.moveY = -0.7;
      g.step(1);
    }
    const text = serialize(g.toSave());
    const g2 = new Game(deserialize(text));
    expect(serialize(g2.toSave())).toBe(text);
    expect(g2.mode).toBe('run');
    expect(g2.world.player.x).toBeCloseTo(g.world.player.x, 5);
    expect(g2.world.monsters.length).toBe(g.world.monsters.filter((m) => !m.dead).length);
    expect(g2.character.equipment.head?.quality).toBe('rare');
  });

  it('migration v1 → version courante', () => {
    const g = new Game();
    const s = JSON.parse(serialize(g.toSave()));
    s.version = 1;
    delete s.character.progression.bonusSkillPoints;
    delete s.character.materials;
    delete s.runCounter;
    const d = deserialize(JSON.stringify(s));
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.character.progression.bonusSkillPoints).toBe(0);
    expect(d.character.materials).toEqual({});
  });

  it('migration v2 → v3 : filtre de butin complet, réglages v2 conservés', () => {
    const g = new Game();
    const s = JSON.parse(serialize(g.toSave()));
    s.version = 2;
    // filtre tel qu'enregistré en v2
    s.character.filter = { minQuality: 1, showSocketedNormals: true, showSuperior: false, autoPickupRunes: true, autoPickupGems: false, autoPickupCharms: true, beamRuneRank: 15, hideLowRunes: 0 };
    const d = deserialize(JSON.stringify(s));
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.character.filter.preset).toBe('standard');
    expect(d.character.filter.autoPickupGems).toBe(false);
    expect(d.character.filter.minBaseTier).toBe(0);
    expect(d.character.filter.showPotions).toBe(true);
    expect(d.character.filter.revealHidden).toBe(false);
    // un réglage v2 hors préréglage devient « personnalisé »
    s.character.filter.minQuality = 2;
    expect(deserialize(JSON.stringify(s)).character.filter.preset).toBe('custom');
    // aller-retour après migration
    const text = serialize(new Game(d).toSave());
    expect(serialize(new Game(deserialize(text)).toSave())).toBe(text);
  });

  it('migration v3 → v4 : luminosité « pénombre » par défaut', () => {
    const g = new Game();
    const s = JSON.parse(serialize(g.toSave()));
    s.version = 3;
    s.settings.lighting = 'clair';
    expect(deserialize(JSON.stringify(s)).settings.lighting).toBe('penombre');
    s.settings.lighting = 'd2';
    expect(deserialize(JSON.stringify(s)).settings.lighting).toBe('d2');
  });
});

import { withDefaultSettings } from '../../src/sim/save';

Game.resumeOnLoad = true; // ces tests vérifient la reprise de run (le jeu, lui, revient toujours en ville)

describe('Réglages', () => {
  it('conseils : activés par défaut, liste des conseils vus propre à chaque partie', () => {
    const a = withDefaultSettings();
    const b = withDefaultSettings({ sound: 0.3 });
    expect(a.tips).toBe(true);
    a.tipsSeen.push('controls');
    expect(b.tipsSeen).toEqual([]);
    expect(withDefaultSettings().tipsSeen).toEqual([]);
    expect(withDefaultSettings({ tipsSeen: ['skills'] }).tipsSeen).toEqual(['skills']);
  });
});
