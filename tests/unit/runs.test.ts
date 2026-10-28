/** Déroulé des runs : vagues de Baal, herse, déblocage de difficulté ; tombeaux ; vaches. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { addXp, xpToReach } from '../../src/sim/progression';
import type { SimEvent } from '../../src/sim/events';
import { tombInfo } from '../../src/data/zones/tombs';
import { interactObject } from '../../src/sim/objects';
import { deserialize, serialize } from '../../src/sim/save';

Game.resumeOnLoad = true; // ces tests vérifient la reprise de run (le jeu, lui, revient toujours en ville)

function strong(level = 60): Game {
  const g = new Game();
  addXp(g.character, xpToReach(level));
  return g;
}

function killAlive(g: Game): number {
  const w = g.world;
  let n = 0;
  for (const m of w.monsters) if (!m.dead && !m.isSummon) (w.killMonster(m, w.player), n++);
  return n;
}

describe('Runs de leveling', () => {
  it('Baal : 5 vagues, herse ouverte, Baal tué → Cauchemar débloqué', () => {
    const g = strong();
    g.startRun('baal', 0, 7);
    const w = g.world;
    w.godMode = true;
    const events: SimEvent[] = [];
    g.onEvent((e) => events.push(e));
    // entrée dans la salle du trône
    w.player.x = 32;
    w.player.y = 50;
    let guard = 0;
    while (w.run!.wave < 5 && guard++ < 400) {
      g.step(5);
      killAlive(g);
    }
    expect(events.filter((e) => e.t === 'wave').length).toBe(5);
    // dernière vague vaincue → herse ouverte
    for (let i = 0; i < 100 && !w.objects.find((o) => o.kind === 'gate')!.used; i++) {
      killAlive(g);
      g.step(5);
    }
    expect(w.objects.find((o) => o.kind === 'gate')!.used).toBe(true);
    expect(w.grid.circleBlocked(32, 32, 0.3)).toBe(false);
    // Baal
    w.player.x = 32;
    w.player.y = 22;
    g.step(10);
    const baal = w.monsters.find((m) => m.def.id === 'baal');
    expect(baal).toBeTruthy();
    w.killMonster(baal!, w.player);
    g.step(1);
    expect(events.some((e) => e.t === 'runComplete')).toBe(true);
    expect(g.character.progression.highestDifficulty).toBe(1);
    expect(g.runOptions().find((o) => o.run.id === 'tristram' && o.difficulty === 1)?.unlocked).toBe(true);
  });

  it('Baal : la herse ouverte survit à la sauvegarde', async () => {
    const { serialize, deserialize } = await import('../../src/sim/save');
    const g = strong();
    g.startRun('baal', 0, 7);
    g.world.godMode = true;
    g.world.openGate('pierre_monde');
    const g2 = new Game(deserialize(serialize(g.toSave())));
    expect(g2.world.grid.circleBlocked(32, 32, 0.3)).toBe(false);
  });

  it('Tombeaux : Duriel attend au fond de chaque tombeau et sa mort termine la run', () => {
    for (let s = 1; s <= 40; s++) expect(tombInfo(s).trueTomb).toBe(true);
    const g = strong(20);
    g.startRun('tombs', 0, 3);
    const w = g.world;
    const boss = w.zone.spawns.findIndex((s) => s.runBoss);
    const [m] = w.spawnGroup(boss);
    w.pendingSpawns = w.pendingSpawns.filter((p) => p.idx !== boss);
    expect(m.runBoss).toBe(true);
    w.killMonster(m, w.player);
    const ev = g.step(1);
    expect(ev.some((e) => e.t === 'runComplete')).toBe(true);
  });

  it('Vaches : troupeaux denses (> 200 bovins), le Roi termine la run', () => {
    const g = strong(30);
    g.startRun('cows', 0, 5);
    const z = g.world.zone;
    const cows = z.spawns.filter((s) => s.monster === 'hell_bovine').reduce((a, s) => a + s.count, 0);
    expect(cows).toBeGreaterThan(200);
    const w = g.world;
    const k = z.spawns.findIndex((s) => s.monster === 'cow_king');
    const [king] = w.spawnGroup(k);
    w.killMonster(king, w.player);
    expect(g.step(1).some((e) => e.t === 'runComplete')).toBe(true);
  });

  it('Sanctuaire du Chaos : trois sceaux et leurs gardiens, puis Diablo ; les sceaux survivent à la sauvegarde', () => {
    let g = strong(40);
    g.startRun('chaos', 0, 11);
    let w = g.world;
    w.godMode = true;
    const events: SimEvent[] = [];
    const hasDiablo = () => g.world.monsters.some((m) => m.def.id === 'diablo' && !m.dead);
    const seals = w.objects.filter((o) => o.kind === 'seal');
    expect(seals.length).toBe(3);
    expect(w.monsters.some((m) => m.sealGuard)).toBe(false);
    // premier sceau, puis reprise de la sauvegarde
    interactObject(w, seals[0]);
    expect(w.monsters.filter((m) => m.sealGuard).length).toBe(1);
    g = new Game(deserialize(serialize(g.toSave())));
    w = g.world;
    w.godMode = true;
    g.onEvent((e) => events.push(e));
    expect(w.objects.filter((o) => o.kind === 'seal' && o.used).length).toBe(1);
    expect(w.monsters.filter((m) => m.sealGuard && !m.dead).length).toBe(1);
    expect(w.pendingSpawns.some((s) => s.seal === 'diablo')).toBe(true);
    // les gardiens tués mais un sceau intact : pas de Diablo
    for (const o of w.objects.filter((x) => x.kind === 'seal' && !x.used).slice(0, 1)) interactObject(w, o);
    killAlive(g);
    g.step(30);
    expect(hasDiablo()).toBe(false);
    // dernier sceau : Diablo n'apparaît qu'après la mort de son gardien
    for (const o of w.objects.filter((x) => x.kind === 'seal' && !x.used)) interactObject(w, o);
    g.step(30);
    expect(hasDiablo()).toBe(false);
    killAlive(g);
    g.step(30);
    expect(hasDiablo()).toBe(true);
    expect(events.some((e) => e.t === 'bossSpawn')).toBe(true);
    const diablo = w.monsters.find((m) => m.def.id === 'diablo')!;
    w.killMonster(diablo, w.player);
    expect(g.step(1).some((e) => e.t === 'runComplete')).toBe(true);
  });

  it('Sanctuaire du Chaos en Enfer : les gardiens de sceau ne sont jamais immunisés', () => {
    const g = strong(80);
    g.character.progression.highestDifficulty = 2;
    for (let seed = 1; seed <= 12; seed++) {
      g.startRun('chaos', 2, seed);
      const w = g.world;
      for (const o of w.objects.filter((x) => x.kind === 'seal')) interactObject(w, o);
      const guards = w.monsters.filter((m) => m.sealGuard);
      expect(guards.length).toBe(3);
      for (const m of guards) for (const v of Object.values(m.res)) expect(v).toBeLessThan(100);
    }
  });
});
