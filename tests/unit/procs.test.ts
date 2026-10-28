/**
 * Effets d'objets issus des tables D2/PD2 : sorts déclenchés (sur coup, coup reçu, mort, niveau),
 * épines fixes, dégâts aux morts-vivants, défense de cible réduite, dégâts subis en mana.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { emptyPacket } from '../../src/sim/actors';
import { damageMonster, damagePlayer } from '../../src/sim/combat';
import { fireProcs, reflectFlat } from '../../src/sim/procs';
import { strike } from '../../src/sim/melee';
import { UNIQUES, SETS } from '../../src/data/items/index';
import { STATS } from '../../src/data/stats';

function arena(monster: string, cls: 'sorceress' | 'barbarian' = 'barbarian'): { g: Game; w: World } {
  const g = new Game(undefined, cls);
  addXp(g.character, xpToReach(40));
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster, x: 12, y: 15, count: 3, r: 1 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 5, difficulty: 0, zoneLevel: 40, character: g.character });
  g.world.populate();
  g.world.refreshPlayer();
  return { g, w: g.world };
}

describe("Effets d'objets", () => {
  it('un sort déclenché sur coup se lance à niveau fixe, sans mana ni niveau appris', () => {
    const { g, w } = arena('zombie');
    g.step(1);
    w.player.d.all.set('procHit:frost_nova:10', 100);
    expect(w.player.d.skillLevels.frost_nova ?? 0).toBe(0);
    const hp0 = w.aliveMonsters().reduce((a, m) => a + m.hp, 0);
    const mana0 = w.player.mana;
    const m = w.aliveMonsters()[0];
    w.player.x = m.x - 1;
    w.player.y = m.y;
    fireProcs(w, 'Hit', m);
    g.step(30);
    expect(w.aliveMonsters().reduce((a, x) => a + x.hp, 0)).toBeLessThan(hp0);
    expect(w.player.mana).toBe(mana0);
    expect(w.player.d.skillLevels.frost_nova ?? 0).toBe(0);
    expect(w.inProc).toBe(false);
  });

  it('les déclencheurs ne s’enchaînent pas et n’agissent pas sans stat', () => {
    const { w } = arena('zombie');
    const m = w.aliveMonsters()[0];
    const hp0 = m.hp;
    fireProcs(w, 'Hit', m);
    expect(m.hp).toBe(hp0);
  });

  it('épines fixes : l’attaquant subit les dégâts', () => {
    const { w } = arena('zombie');
    w.player.d.all.set('thornsFlat', 60);
    const m = w.aliveMonsters()[0];
    const hp0 = m.hp;
    reflectFlat(w, m);
    expect(hp0 - m.hp).toBeGreaterThan(0);
  });

  it('dégâts d’arme aux morts-vivants : +100 % double les dégâts contre un zombie', () => {
    const { w } = arena('zombie');
    const [a, b] = w.aliveMonsters();
    const pk = () => {
      const p = emptyPacket(false);
      p.phys = 100;
      return p;
    };
    damageMonster(w, a, pk(), w.player);
    const lost1 = a.hpMax - a.hp;
    w.player.d.all.set('dmgUndeadPct', 100);
    damageMonster(w, b, pk(), w.player);
    const lost2 = b.hpMax - b.hp;
    expect(lost2 / lost1).toBeCloseTo(2, 1);
  });

  it('dégâts subis convertis en mana', () => {
    const { w } = arena('zombie');
    const p = w.player;
    w.player.d.all.set('dmgToMana', 50);
    p.manaMax = 1000;
    p.mana = 0;
    const pk = emptyPacket(true);
    pk.fire = 100;
    const took = damagePlayer(w, p, pk, null);
    expect(took).toBeGreaterThan(0);
    expect(p.mana).toBeCloseTo(took / 2, 0);
  });

  it('défense de la cible réduite : le taux de toucher monte', () => {
    const { w } = arena('zombie');
    const m = w.aliveMonsters()[0];
    m.defense = 5000;
    const hits = (n: number): number => {
      let h = 0;
      for (let i = 0; i < n; i++) if (strike(w, m, {}) > 0) h++;
      m.hp = m.hpMax;
      return h;
    };
    const base = hits(300);
    w.player.d.all.set('reduceDef', 100);
    expect(hits(300)).toBeGreaterThan(base);
  });

  it('toutes les propriétés des uniques et des sets sont des statistiques connues', () => {
    const unknown = new Set<string>();
    for (const u of UNIQUES) for (const m of u.mods) if (!STATS[m.stat]) unknown.add(m.stat);
    for (const s of SETS) for (const b of s.bonuses) for (const m of b.mods) if (!STATS[m.stat]) unknown.add(m.stat);
    expect([...unknown]).toEqual([]);
  });
});
