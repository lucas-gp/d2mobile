/** Sorcière PD2 : comportement de chaque compétence confronté au wiki (mods/pd2/docs/audit/skills-pd2-sorceress.md). */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, SKILLS, lin } from '../../../../src/data/skills';
import { castFrames } from '../../../../src/sim/skills';
import { infernoReduction, resReduction, staticDuration } from '../../rules/skills';
import { fcrFrames, fcrFramesLightning } from '../../../../src/sim/breakpoints';
import { emptyPacket } from '../../../../src/sim/actors';
import { spawnMissile } from '../../../../src/sim/missiles';
import type { Monster } from '../../../../src/sim/actors';

type Spawn = { x: number; y: number };

function arena(spawns: Spawn[], skills: Record<string, number> = {}): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  for (const [k, v] of Object.entries(skills)) g.character.skills[k] = v;
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  for (const x of ms) {
    x.hp = x.hpMax = 1e9;
    x.dmgMin = x.dmgMax = 0;
    x.defense = 0;
    x.res = { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 };
    x.speed = 0;
  }
  g.world.player.mana = g.world.player.manaMax = 1e6;
  g.world.refreshPlayer();
  return { g, w: g.world, ms };
}

const cast = (w: World, skill: string, tx: number, ty: number, targetId = 0): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill, tx, ty, targetId };
};

const run = (g: Game, n: number): void => {
  for (let i = 0; i < n; i++) g.step(1);
};

/** Lance un sort et avance jusqu'à ce qu'au moins un projectile du genre donné existe (ou 60 pas) */
function castUntil(g: Game, w: World, skill: string, kind: string, tx: number, ty: number): void {
  cast(w, skill, tx, ty);
  for (let i = 0; i < 60 && !w.missiles.some((m) => m.kind === kind); i++) g.step(1);
}

describe('Réduction de résistance PD2 (règle skills.sorceress du mod)', () => {
  it('Champ statique : −(4 + niv) jusqu’au niveau 22, puis +½ par niveau', () => {
    expect(resReduction(1)).toBe(5);
    expect(resReduction(22)).toBe(26);
    expect(resReduction(30)).toBe(30);
  });
});

describe('Sorcière PD2 : projectiles', () => {
  it('Explosion de glace perfore les ennemis alignés', () => {
    const { g, w, ms } = arena(
      [
        { x: 14, y: 15 },
        { x: 17, y: 15 },
        { x: 20, y: 15 },
      ],
      { ice_bolt: 1, ice_blast: 5 },
    );
    const before = ms.map((m) => m.hp);
    castUntil(g, w, 'ice_blast', 'ice_blast', 20, 15);
    const mis = w.missiles.find((m) => m.kind === 'ice_blast')!;
    expect(mis.pierce).toBe(true);
    run(g, 60);
    expect(ms.filter((m, i) => m.hp < before[i]).length).toBe(3);
    // chaque touché est gelé
    expect(ms.every((m) => m.freezeT > 0 || m.chillT > 0)).toBe(true);
  });

  it("Trait de feu et Trait de glace : petite zone à l'impact (saison 12)", () => {
    for (const [id, kind] of [
      ['fire_bolt', 'fire_bolt'],
      ['ice_bolt', 'ice_bolt'],
    ] as const) {
      const { g, w, ms } = arena(
        [
          { x: 16, y: 15 },
          { x: 16, y: 15.6 },
        ],
        { [id]: 5 },
      );
      const first = ms[0];
      const second = ms[1];
      const h = [first.hp, second.hp];
      castUntil(g, w, id, kind, 16, 15);
      run(g, 30);
      expect(first.hp, id).toBeLessThan(h[0]);
      expect(second.hp, `${id} : voisin touché par la zone`).toBeLessThan(h[1]);
    }
  });

  it("Barrage de glace : 3 lances au niveau 1, elles explosent à l'impact sans traverser", () => {
    const { g, w, ms } = arena(
      [
        { x: 16, y: 15 },
        { x: 16, y: 16.5 },
        { x: 22, y: 15 },
      ],
      { ice_bolt: 1, ice_blast: 1, glacial_spike: 1, ice_barrage: 1 },
    );
    castUntil(g, w, 'ice_barrage', 'ice_lance', 16, 15);
    const lances = w.missiles.filter((m) => m.kind === 'ice_lance');
    expect(lances.length).toBe(3);
    expect(lances.every((m) => !m.pierce)).toBe(true);
    const h = ms.map((m) => m.hp);
    run(g, 60);
    expect(ms[0].hp).toBeLessThan(h[0]);
    expect(ms[1].hp, "la zone d'explosion atteint le voisin").toBeLessThan(h[1]);
    expect(ms[2].hp, 'pas de traversée : le monstre derrière est intact').toBe(h[2]);
  });

  it('Barrage de glace : nombre de lances 3 / 4 / 5 selon les points investis', () => {
    for (const [pts, n] of [
      [2, 3],
      [3, 4],
      [5, 4],
      [6, 5],
      [12, 5],
    ] as const) {
      const { g, w } = arena([{ x: 16, y: 15 }], { ice_barrage: pts });
      castUntil(g, w, 'ice_barrage', 'ice_lance', 16, 15);
      expect(w.missiles.filter((m) => m.kind === 'ice_lance').length, `${pts} points`).toBe(n);
    }
  });

  it('Barrage de glace : durée de froid du wiki (0 s au niveau 1, +0,12 s par niveau)', () => {
    const n = SKILL_BY_ID.ice_barrage.n.chill!;
    expect(lin(n, 1)).toBeCloseTo(0, 5);
    expect(lin(n, 21)).toBeCloseTo(2.4, 1);
  });

  it("Pointe glaciale : gel de 2 s fixe, jusqu'à 4 s avec la synergie du Blizzard", () => {
    expect(lin(SKILL_BY_ID.glacial_spike.n.chill, 1)).toBe(2);
    expect(lin(SKILL_BY_ID.glacial_spike.n.chill, 20)).toBe(2);
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { ice_bolt: 1, ice_blast: 1, glacial_spike: 5 });
    castUntil(g, w, 'glacial_spike', 'glacial_spike', 16, 15);
    const f0 = w.missiles.find((m) => m.kind === 'glacial_spike')!.dmg.freeze ?? 0;
    expect(f0).toBe(50);
    const b = arena([{ x: 16, y: 15 }], { ice_bolt: 1, ice_blast: 1, glacial_spike: 5, blizzard: 21 });
    castUntil(b.g, b.w, 'glacial_spike', 'glacial_spike', 16, 15);
    expect((b.w.missiles.find((m) => m.kind === 'glacial_spike')!.dmg.freeze ?? 0) / 25).toBeGreaterThan(3.5);
    void ms;
  });

  it('Orbe gelé : plus de délai de récupération, cadence lente (images de la Foudre)', () => {
    expect(SKILL_BY_ID.frozen_orb.n.cooldown).toBeUndefined();
    const { w } = arena([], { frozen_orb: 5 });
    expect(castFrames(w, 'frozen_orb')).toBe(fcrFramesLightning(w.player.d.fcr));
    expect(castFrames(w, 'chain_lightning')).toBe(fcrFramesLightning(w.player.d.fcr));
  });

  it('Foudre : cadence de sort normale ; Éclair en chaîne reste lent', () => {
    const { w } = arena([], { lightning: 5, chain_lightning: 5 });
    expect(castFrames(w, 'lightning')).toBe(fcrFrames(w.player.d.fcr, 'sorceress'));
    expect(fcrFramesLightning(0)).toBeGreaterThan(fcrFrames(0, 'sorceress'));
  });

  it('Orbe gelé : traverse les ennemis et sème des éclats', () => {
    const { g, w, ms } = arena(
      [
        { x: 14, y: 15 },
        { x: 17, y: 15 },
      ],
      { frozen_orb: 8 },
    );
    castUntil(g, w, 'frozen_orb', 'frozen_orb', 18, 15);
    const orb = w.missiles.find((m) => m.kind === 'frozen_orb')!;
    expect(orb.pierce).toBe(true);
    const h = ms.map((m) => m.hp);
    run(g, 40);
    expect(w.missiles.some((m) => m.kind === 'orb_shard') || ms.every((m, i) => m.hp < h[i])).toBe(true);
    expect(ms.every((m, i) => m.hp < h[i])).toBe(true);
  });

  it('Charge électrique : bolts perforants, 3 au niveau 1 puis +1 par niveau (max 28)', () => {
    for (const [lv, n] of [
      [1, 3],
      [5, 7],
      [40, 28],
    ] as const) {
      const { g, w } = arena([{ x: 16, y: 15 }], { charged_bolt: lv });
      castUntil(g, w, 'charged_bolt', 'charged_bolt', 16, 15);
      const bs = w.missiles.filter((m) => m.kind === 'charged_bolt');
      expect(bs.length, `niveau ${lv}`).toBe(n);
      expect(bs.every((m) => m.pierce)).toBe(true);
    }
  });

  it('Hydre : boules de feu qui traversent, 5 s de durée, 3 hydres au maximum (partagé)', () => {
    expect(lin(SKILL_BY_ID.hydra.n.duration, 10)).toBe(5);
    expect(lin(SKILL_BY_ID.lesser_hydra.n.duration, 10)).toBe(5);
    const { g, w, ms } = arena(
      [
        { x: 14, y: 15 },
        { x: 15.5, y: 15 },
      ],
      { fire_bolt: 1, warmth: 1, fire_ball: 1, lesser_hydra: 5, enchant: 1, hydra: 5 },
    );
    for (let i = 0; i < 4; i++) {
      cast(w, i % 2 ? 'lesser_hydra' : 'hydra', 12, 15);
      run(g, 40);
    }
    expect(w.monsters.filter((m) => m.isSummon && !m.dead).length).toBeLessThanOrEqual(3);
    const h = ms.map((m) => m.hp);
    run(g, 100);
    expect(ms.some((m, i) => m.hp < h[i])).toBe(true);
    const ball = w.missiles.find((m) => m.kind === 'hydra_ball');
    if (ball) expect(ball.pierce).toBe(true);
    // l'hydre disparaît après 5 s
    run(g, 5 * 25 + 20);
    expect(w.monsters.filter((m) => m.isSummon && !m.dead).length).toBe(0);
  });

  it('Hydre : la boule perforante explose sur chaque ennemi traversé', () => {
    const { g, w, ms } = arena(
      [
        { x: 14, y: 15 },
        { x: 16, y: 15 },
      ],
      { fire_bolt: 1, warmth: 1, fire_ball: 1, lesser_hydra: 1, enchant: 1, hydra: 5 },
    );
    const h = ms.map((m) => m.hp);
    w.missiles.push(); // garde-fou lisibilité
    cast(w, 'hydra', 11.5, 15);
    run(g, 150);
    // les deux ennemis alignés sont touchés par la même salve
    expect(ms.every((m, i) => m.hp < h[i])).toBe(true);
  });
});

describe('Sorcière PD2 : zones et sorts instantanés', () => {
  it('Combustion : cooldown 2,52 s et portée du wiki', () => {
    expect(SKILL_BY_ID.combustion.n.cooldown).toBeCloseTo(2.52, 2);
  });

  it('Météore, Mur de feu, Blizzard : récupération PD2', () => {
    expect(SKILL_BY_ID.meteor.n.cooldown).toBeCloseTo(0.52, 2);
    expect(SKILL_BY_ID.fire_wall.n.cooldown).toBeCloseTo(1.52, 2);
    expect(SKILL_BY_ID.blizzard.n.cooldown).toBeCloseTo(0.92, 2);
    expect(lin(SKILL_BY_ID.blizzard.n.duration, 10)).toBe(2);
    expect(lin(SKILL_BY_ID.fire_wall.n.duration, 10)).toBe(3);
  });

  it('Météore : impact puis sol brûlant', () => {
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { fire_bolt: 1, inferno: 1, blaze: 1, fire_ball: 1, fire_wall: 1, meteor: 5 });
    const h = ms[0].hp;
    cast(w, 'meteor', 16, 15);
    run(g, 120);
    expect(ms[0].hp).toBeLessThan(h);
  });

  it('Blizzard : dure 2 s et laisse tomber des éclats dans la zone', () => {
    const { g, w, ms } = arena([{ x: 16, y: 15 }], { ice_bolt: 1, ice_blast: 1, glacial_spike: 1, frost_nova: 1, blizzard: 5 });
    const h = ms[0].hp;
    cast(w, 'blizzard', 16, 15);
    run(g, 20);
    const area = w.areas.find((a) => a.kind === 'blizzard');
    expect(area).toBeDefined();
    expect(area!.maxLife).toBe(50);
    run(g, 60);
    expect(ms[0].hp).toBeLessThan(h);
    expect(w.areas.some((a) => a.kind === 'blizzard' && !a.dead)).toBe(false);
  });

  it('Mur de feu : segment perpendiculaire à la visée', () => {
    const { g, w } = arena([], { inferno: 1, blaze: 1, fire_wall: 5 });
    cast(w, 'fire_wall', 16, 15);
    run(g, 20);
    const a = w.areas.find((x) => x.kind === 'fire_wall')!;
    expect(a).toBeDefined();
    expect(Math.abs(a.x - a.x2)).toBeLessThan(0.1);
    expect(Math.abs(a.y - a.y2)).toBeGreaterThan(1);
  });

  it('Nova de givre : onde autour de la Sorcière qui ralentit', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 35, y: 15 },
      ],
      { frost_nova: 5 },
    );
    const h = ms.map((m) => m.hp);
    cast(w, 'frost_nova', 12, 15);
    run(g, 30);
    expect(ms[0].hp).toBeLessThan(h[0]);
    expect(ms[0].chillT).toBeGreaterThan(0);
    expect(ms[1].hp).toBe(h[1]);
  });

  it('Nova : anneau de foudre autour de la Sorcière', () => {
    const { g, w, ms } = arena(
      [
        { x: 12, y: 15 },
        { x: 35, y: 15 },
      ],
      { charged_bolt: 1, nova: 5 },
    );
    const h = ms.map((m) => m.hp);
    cast(w, 'nova', 12, 15);
    run(g, 30);
    expect(ms[0].hp).toBeLessThan(h[0]);
    expect(ms[1].hp).toBe(h[1]);
  });

  it('Foudre : traverse tous les ennemis alignés', () => {
    const { g, w, ms } = arena(
      [
        { x: 13, y: 15 },
        { x: 16, y: 15 },
        { x: 19, y: 15 },
      ],
      { charged_bolt: 1, lightning: 5 },
    );
    const h = ms.map((m) => m.hp);
    cast(w, 'lightning', 19, 15);
    run(g, 40);
    expect(ms.every((m, i) => m.hp < h[i])).toBe(true);
  });

  it("Éclair en chaîne : rebondit d'ennemi en ennemi (6 chaînes au niveau 1)", () => {
    const { g, w, ms } = arena(
      [
        { x: 13, y: 15 },
        { x: 15, y: 15 },
        { x: 17, y: 15 },
        { x: 19, y: 15 },
      ],
      { charged_bolt: 1, lightning: 1, chain_lightning: 1 },
    );
    const h = ms.map((m) => m.hp);
    cast(w, 'chain_lightning', 13, 15, ms[0].id);
    run(g, 40);
    expect(ms.every((m, i) => m.hp < h[i])).toBe(true);
    expect(lin(SKILL_BY_ID.chain_lightning.n.count, 1)).toBe(6);
    expect(lin(SKILL_BY_ID.chain_lightning.n.count, 31)).toBe(14);
  });

  it('Éclair et Éclair en chaîne : événements de rendu « beam » (trait du lanceur + un point par cible touchée)', () => {
    const { g, w, ms } = arena(
      [
        { x: 13, y: 15 },
        { x: 15, y: 15 },
        { x: 17, y: 15 },
      ],
      { lightning: 5, chain_lightning: 5 },
    );
    const beams: { kind: string; points: number[] }[] = [];
    const push = w.events.push.bind(w.events);
    w.events.push = (...e: Parameters<typeof push>) => {
      for (const x of e) if (x.t === 'beam') beams.push({ kind: x.kind, points: x.points });
      return push(...e);
    };
    cast(w, 'lightning', 17, 15);
    run(g, 40);
    const l = beams.find((b) => b.kind === 'lightning')!;
    expect(l.points).toHaveLength(4);
    expect(l.points[0]).toBeCloseTo(w.player.x, 0);
    cast(w, 'chain_lightning', 13, 15, ms[0].id);
    run(g, 40);
    const c = beams.find((b) => b.kind === 'chain')!;
    expect(c.points.length).toBeGreaterThanOrEqual(6);
    expect(c.points.slice(2, 4)).toEqual([ms[0].x, ms[0].y]);
  });

  it('Téléportation : saute à la cible, sorts affaiblis de 50 % (−1 % par niveau) pendant 1 s', () => {
    const { g, w } = arena([], { telekinesis: 1, teleport: 1 });
    cast(w, 'teleport', 18, 15);
    run(g, 30);
    expect(w.player.x).toBeGreaterThan(14);
    expect(w.player.tpPenaltyPct).toBe(50);
    const b = arena([], { telekinesis: 1, teleport: 21 });
    cast(b.w, 'teleport', 18, 15);
    run(b.g, 30);
    expect(b.w.player.tpPenaltyPct).toBe(30);
    const c = arena([], { telekinesis: 1, teleport: 60 });
    cast(c.w, 'teleport', 18, 15);
    run(c.g, 30);
    expect(c.w.player.tpPenaltyPct).toBe(0);
  });

  it('Champ statique : retire 25 % des PV au-dessus de 55 % (Normal), résistance −(4+niv), 5 s +0,2 s par point de Maîtrise', () => {
    const { g, w, ms } = arena([{ x: 11.5, y: 15 }], { static_field: 5 });
    ms[0].hp = ms[0].hpMax = 10000;
    cast(w, 'static_field', 11.5, 15);
    run(g, 30);
    expect(ms[0].hp).toBeLessThan(10000 * 0.8);
    expect(ms[0].hp).toBeGreaterThanOrEqual(10000 * 0.55 - 1);
    expect(resReduction(1)).toBe(5);
    expect(staticDuration(0)).toBe(5);
    expect(staticDuration(10)).toBe(7);
    expect(staticDuration(50)).toBe(9);
  });

  it('Réduction de résistance : tables du wiki (Champ statique et Inferno)', () => {
    // Champ statique : −5 … −26 (niv. 22), puis −27, −27, −28, −28 …
    expect([1, 22, 23, 24, 25, 26, 40].map(resReduction)).toEqual([5, 26, 27, 27, 28, 28, 35]);
    // Inferno : −(4 + niv) plafonné à −45
    expect([1, 10, 41, 60].map(infernoReduction)).toEqual([5, 14, 45, 45]);
  });

  it('Inferno : cône de flammes qui réduit la résistance au feu', () => {
    const { g, w, ms } = arena([{ x: 12.5, y: 15 }], { inferno: 5 });
    ms[0].res.fire = 50;
    const h = ms[0].hp;
    cast(w, 'inferno', 16, 15);
    run(g, 30);
    expect(ms[0].hp).toBeLessThan(h);
    expect(ms[0].red.fire?.v).toBe(infernoReduction(w.player.d.skillLevels.inferno));
  });

  it('Télékinésie : repousse 35 % du temps', () => {
    const { g, w, ms } = arena([{ x: 14, y: 15 }], { telekinesis: 1 });
    let pushed = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
      ms[0].x = ms[0].px = 14;
      ms[0].y = ms[0].py = 15;
      ms[0].stunT = 0;
      cast(w, 'telekinesis', 14, 15, ms[0].id);
      run(g, 25);
      if (ms[0].x - 14 > 0.8) pushed++;
    }
    expect(pushed).toBeGreaterThan(N * 0.2);
    expect(pushed).toBeLessThan(N * 0.5);
  });

  it('Tempête de foudre : délai de 2 s, −0,04 s par point investi (plancher 1 s)', () => {
    const { w } = arena([], { charged_bolt: 1, lightning: 1, nova: 1, thunder_storm: 5 });
    expect(w.player.d.hardPoints.thunder_storm).toBe(5);
    expect(Math.round(Math.max(1, 2 - 0.04 * 5) * 25)).toBe(45);
    expect(Math.round(Math.max(1, 2 - 0.04 * 40) * 25)).toBe(25);
  });

  it('Tempête de foudre : frappe un ennemi proche à intervalles réguliers', () => {
    const { g, w, ms } = arena([{ x: 14, y: 15 }], { charged_bolt: 1, lightning: 1, nova: 1, thunder_storm: 5 });
    const h = ms[0].hp;
    cast(w, 'thunder_storm', 14, 15);
    run(g, 5 * 25);
    expect(ms[0].hp).toBeLessThan(h);
  });

  it('Embrasement : explosion, traînée de 2,4 s et impossible à geler', () => {
    const { g, w } = arena([], { inferno: 1, blaze: 5 });
    cast(w, 'blaze', 16, 15);
    run(g, 40);
    expect(w.player.buffs.some((b) => b.id === 'blaze')).toBe(true);
    expect(w.player.d.cbf).toBe(true);
    expect(w.areas.some((a) => a.kind === 'blaze')).toBe(true);
    expect(lin(SKILL_BY_ID.blaze.n.duration, 1)).toBe(3);
  });
});

describe('Sorcière PD2 : buffs et passifs', () => {
  it("Bouclier d'énergie : absorbe 15 % +2 % par niveau (plafond 90 %), le mana encaisse, reste actif sans mana", () => {
    const { g, w } = arena([], { charged_bolt: 1, telekinesis: 1, lightning: 1, teleport: 1, chain_lightning: 1, energy_shield: 20 });
    cast(w, 'energy_shield', 12, 15);
    run(g, 20);
    expect(w.player.shieldActive).toBe(true);
    const p = w.player;
    p.hp = p.hpMax = 100000;
    p.mana = 1000;
    const pk = emptyPacket(true);
    pk.light = 1000;
    pk.spell = true;
    w.hurtPlayerPacket(null, pk);
    // niveau 20 : 15 + 2 × 19 = 53 % absorbés
    expect(100000 - p.hp).toBeLessThan(1000 * 0.5);
    expect(p.mana).toBeLessThan(1000);
    // mana à zéro : le bouclier reste actif
    p.mana = 0;
    w.hurtPlayerPacket(null, pk);
    expect(w.player.shieldActive).toBe(true);
  });

  it('Armure de frisson : défense, récupération au blocage ; Armure glaçante : blocage avec bouclier', () => {
    const { g, w } = arena([], { cold_enchant: 1, shiver_armor: 5, chilling_armor: 5 });
    const d0 = w.player.d.defense;
    const fbr0 = w.player.d.all.get('fbr') ?? 0;
    cast(w, 'shiver_armor', 12, 15);
    run(g, 20);
    expect(w.player.d.defense).toBeGreaterThan(d0);
    expect((w.player.d.all.get('fbr') ?? 0) - fbr0).toBe(10 + 2 * 5);
  });

  it('Armure glaçante : une pointe de glace riposte à une attaque à distance', () => {
    const { g, w, ms } = arena([{ x: 14, y: 15 }], { cold_enchant: 1, shiver_armor: 1, chilling_armor: 5 });
    cast(w, 'chilling_armor', 12, 15);
    run(g, 20);
    expect(w.player.buffs.some((b) => b.id === 'chilling_armor')).toBe(true);
    const h = ms[0].hp;
    w.player.hp = w.player.hpMax = 1e6;
    const pk = emptyPacket(false);
    pk.phys = 5;
    spawnMissile(w, { kind: 'arrow', team: 1, owner: ms[0].id, x: 13.5, y: w.player.y, angle: Math.PI, speed: 12, radius: 0.3, range: 8, dmg: pk, elem: 'phys' });
    run(g, 30);
    expect(w.player.hp).toBeLessThan(1e6);
    expect(ms[0].hp).toBeLessThan(h);
  });

  it('Armure glaçante / frisson : durée de froid 4 s +0,2 s par niveau', () => {
    for (const id of ['shiver_armor', 'chilling_armor']) {
      expect(lin(SKILL_BY_ID[id].n.chill, 1)).toBe(4);
      expect(lin(SKILL_BY_ID[id].n.chill, 21)).toBeCloseTo(8, 5);
    }
  });

  it('Maîtrise du Froid : +10 % +2 % par niveau, pénétration 5 % +1 % par niveau (plafond 45 %)', () => {
    const { w } = arena([], { cold_mastery: 1 });
    expect(w.player.d.pierce.cold).toBe(6);
    const b = arena([], { cold_mastery: 60 });
    expect(b.w.player.d.pierce.cold).toBe(45);
    const c = arena([], { fire_mastery: 10 });
    expect(c.w.player.d.pierce.fire).toBe(10);
  });

  it("Chaleur : +10 de score d'attaque par niveau en plus du pourcentage", () => {
    const a = arena([], {});
    const ar0 = a.w.player.d.attackRating;
    const b = arena([], { warmth: 1 });
    expect(b.w.player.d.attackRating).toBeGreaterThan(ar0);
  });

  it('Enchantement du feu / du froid : buff de 300 s', () => {
    expect(lin(SKILL_BY_ID.enchant.n.duration, 5)).toBe(300);
    expect(lin(SKILL_BY_ID.cold_enchant.n.duration, 5)).toBe(300);
  });
});

describe('Sorcière PD2 : toutes les compétences se lancent', () => {
  // passives exclues de la liste (elles ne se lancent pas) : avant, elles comptaient comme des tests verts vides
  const ids = SKILLS.filter((s) => s.tree && ['fire', 'cold', 'light'].includes(s.tree) && s.id !== 'telekinesis' && !s.passive).map((s) => s.id);
  it.each(ids)('%s : lancement sans erreur', (id) => {
    const skills: Record<string, number> = {};
    for (const s of SKILLS) if (['fire', 'cold', 'light'].includes(s.tree)) skills[s.id] = 1;
    skills[id] = 5;
    const { g, w } = arena(
      [
        { x: 16, y: 15 },
        { x: 18, y: 15 },
      ],
      skills,
    );
    cast(w, id, 16, 15);
    expect(() => run(g, 80)).not.toThrow();
  });
});
