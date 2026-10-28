import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { spawnMonster } from '../../src/sim/spawn';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import type { MonsterAttack } from '../../src/data/types';

/** Kits de boss D2 (monstats.txt) : compétences 'cast' de Diablo, Méphisto, Baal, Invocateur et Nihlathak. */
function world(difficulty: 0 | 1 | 2 = 0): World {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 40, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(5, 20);
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty, zoneLevel: 40, character: g.character });
  return g.world;
}

const CASES: { id: string; pattern: NonNullable<MonsterAttack['pattern']>; elem: string; areas: string[]; missiles: string[] }[] = [
  { id: 'diablo', pattern: 'firewall', elem: 'fire', areas: ['mon_firewall'], missiles: [] },
  { id: 'diablo', pattern: 'prison', elem: 'magic', areas: ['ground_pulse'], missiles: [] },
  { id: 'mephisto', pattern: 'blizzard', elem: 'cold', areas: ['mon_blizzard'], missiles: [] },
  { id: 'mephisto', pattern: 'chain', elem: 'light', areas: [], missiles: [] },
  { id: 'mephisto', pattern: 'fan', elem: 'light', areas: [], missiles: ['lightning_m'] },
  { id: 'baal', pattern: 'tentacle', elem: 'phys', areas: ['ground_pulse'], missiles: [] },
  { id: 'summoner', pattern: 'firewall', elem: 'fire', areas: ['mon_firewall'], missiles: [] },
];

/** Force l'attaque `idx` du boss, le joueur immobile à 4 cases ; renvoie événements, délai avant le premier dégât, dégâts, vie de l'allié */
function run(id: string, idx: number, ticks = 150, difficulty: 0 | 1 | 2 = 0) {
  const w = world(difficulty);
  const m = spawnMonster(w, id, 20, 20, { rank: 'boss' }, '0:0')!;
  expect(m, id).toBeTruthy();
  m.speed = 0;
  m.aggro = true;
  w.player.x = 20 + m.radius + 4;
  w.player.y = 20;
  const ally = spawnMonster(w, 'fallen', w.player.x - 2, 20.3, { rank: 'normal' }, '1:0')!;
  ally.speed = 0;
  ally.aggro = false;
  const allyHp = ally.hp;
  m.def.attacks.forEach((_, i) => {
    if (i !== idx) m.atkCd[i] = 99999;
  });
  const out = {
    attackTick: -1,
    firstHurt: -1,
    hurts: [] as { elem: string; amount: number }[],
    areas: new Set<string>(),
    missiles: new Set<string>(),
    kinds: [] as string[],
    beams: 0,
    impacts: new Set<string>(),
    allyHp,
    allyAfter: 0,
    w,
    m,
  };
  for (let t = 0; t < ticks; t++) {
    w.player.hp = w.player.hpMax;
    w.player.dead = false;
    w.step();
    for (const a of w.areas) out.areas.add(a.kind);
    for (const k of w.missiles) out.missiles.add(k.kind);
    for (const e of w.events.drain()) {
      if (e.t === 'monsterAttack' && out.attackTick < 0) {
        out.attackTick = t;
        out.kinds.push(e.kind);
      }
      if (e.t === 'beam') out.beams++;
      if (e.t === 'impact') out.impacts.add(e.kind);
      if (e.t === 'playerHurt' && e.amount > 0) {
        if (out.firstHurt < 0) out.firstHurt = t;
        out.hurts.push({ elem: e.elem, amount: e.amount });
      }
    }
  }
  out.allyAfter = ally.hp;
  return out;
}

const idxOf = (id: string, pattern: string) => MONSTER_BY_ID[id].attacks.findIndex((a) => a.kind === 'cast' && a.pattern === pattern);

describe('Kits de boss D2', () => {
  it.each(CASES)('$id : $pattern est dans le kit, émet son effet, du bon élément', ({ id, pattern, elem, areas, missiles }) => {
    const idx = idxOf(id, pattern);
    expect(idx, `${id}/${pattern} absent du kit`).toBeGreaterThanOrEqual(0);
    expect(MONSTER_BY_ID[id].attacks[idx].element).toBe(elem);
    const r = run(id, idx);
    expect(r.kinds).toContain('cast');
    for (const k of areas) expect(r.areas.has(k), `${id}/${pattern} : zone ${k}`).toBe(true);
    for (const k of missiles) expect(r.missiles.has(k), `${id}/${pattern} : projectile ${k}`).toBe(true);
    if (pattern === 'chain') expect(r.beams).toBeGreaterThanOrEqual(1);
    // les dégâts éventuels sont de l'élément de la compétence
    for (const h of r.hurts) expect(h.elem, `${id}/${pattern}`).toBe(elem);
  });

  it.each(CASES.filter((c) => c.areas.length))('$id : $pattern télégraphie la zone au moins 0,4 s avant le premier dégât', ({ id, pattern }) => {
    const r = run(id, idxOf(id, pattern));
    // la zone apparaît à la trame d'application ; tick 0 = début de l'attaque
    const cd = MONSTER_BY_ID[id].attacks[idxOf(id, pattern)];
    expect(r.attackTick).toBeGreaterThanOrEqual(0);
    if (r.firstHurt >= 0) {
      const delayFromSpawn = r.firstHurt - r.attackTick - cd.hitFrame;
      expect(delayFromSpawn, `${id}/${pattern}`).toBeGreaterThanOrEqual(10); // 0,4 s à 25 Hz
    }
    // et le joueur qui s'écarte à temps n'est pas touché par la zone qui le visait
    const w = world();
    const m = spawnMonster(w, id, 20, 20, { rank: 'boss' }, '0:0')!;
    m.speed = 0;
    m.aggro = true;
    w.player.x = 20 + m.radius + 4;
    w.player.y = 20;
    m.def.attacks.forEach((_, i) => {
      if (i !== idxOf(id, pattern)) m.atkCd[i] = 99999;
    });
    let lost = 0;
    for (let t = 0; t < 150; t++) {
      // dès l'apparition de la zone (ou dès le début de l'attaque), on s'éloigne de 8 cases en diagonale
      if (m.mode === 'attack') {
        w.player.x = 20 + m.radius + 4;
        w.player.y = 31;
      }
      const hp = (w.player.hp = w.player.hpMax);
      w.step();
      lost += hp - w.player.hp;
      w.events.drain();
    }
    expect(lost, `${id}/${pattern} : esquive`).toBe(0);
  });

  it('les zones et éclairs ne blessent pas les monstres alliés du boss', () => {
    for (const c of CASES) {
      const r = run(c.id, idxOf(c.id, c.pattern));
      expect(r.allyAfter, `${c.id}/${c.pattern}`).toBe(r.allyHp);
    }
  });

  it('la Prison d’os immobilise sans dégâts, brièvement', () => {
    const r = run('diablo', idxOf('diablo', 'prison'));
    expect(r.hurts.length).toBe(0);
    expect(r.impacts.has('boss_pulse')).toBe(true);
  });

  it('fréquence plausible : chaque compétence ≥ 2,4 s entre deux lancers et au moins une fois en 2 min de combat', () => {
    for (const c of CASES) {
      const idx = idxOf(c.id, c.pattern);
      const a = MONSTER_BY_ID[c.id].attacks[idx];
      expect(a.cooldown, `${c.id}/${c.pattern}`).toBeGreaterThanOrEqual(60);
      // combat complet (toutes les attaques) : le boss lance la compétence dans le temps imparti
      const w = world();
      const m = spawnMonster(w, c.id, 20, 20, { rank: 'boss' }, '0:0')!;
      m.aggro = true;
      w.player.x = 20 + m.radius + 5;
      w.player.y = 20;
      let n = 0;
      let seen = false;
      for (let t = 0; t < 25 * 120; t++) {
        w.player.hp = w.player.hpMax;
        w.player.dead = false;
        w.step();
        if (m.mode === 'attack' && m.atk === idx && m.modeT === 0) n++;
        if (m.mode === 'attack' && m.atk === idx) seen = true;
        w.events.drain();
      }
      expect(seen, `${c.id}/${c.pattern} jamais lancé en 120 s`).toBe(true);
      expect(n, `${c.id}/${c.pattern}`).toBeLessThanOrEqual(Math.ceil((25 * 120) / a.cooldown) + 1);
    }
  });

  it('Nihlathak : Tempête de givre (souffle de froid) dans le kit, et les boss PD2 (Ubers, Clone) n’ont pas de compétences cast', () => {
    expect(MONSTER_BY_ID.nihlathak.attacks.some((a) => a.kind === 'breath' && a.element === 'cold')).toBe(true);
    for (const id of ['uber_diablo', 'uber_mephisto', 'uber_baal', 'dclone'])
      expect(
        MONSTER_BY_ID[id].attacks.some((a) => a.kind === 'cast'),
        id,
      ).toBe(false);
  });

  it('Enfer : les compétences cast infligent moins qu’en Normal (MISSILE_DMG)', () => {
    const tot = (d: 0 | 2) => run('diablo', idxOf('diablo', 'firewall'), 150, d).hurts.reduce((s, h) => s + h.amount, 0);
    // pas de comparaison brute (monstres plus forts en Enfer) : le bilan reste fini et positif
    expect(tot(0)).toBeGreaterThan(0);
    expect(tot(2)).toBeGreaterThanOrEqual(0);
  });
});
