/**
 * Formes des cartes d'endgame (mods/pd2/data/zones/mapshapes.ts) : chaque carte du catalogue, quelques graines —
 * déterminisme, connexité complète (départ → boss → groupes → objets), boss loin du départ, surface
 * dans les bornes du palier, formes non rectangulaires et distinctes, génération rapide, runs complètes ;
 * densité (un groupe pour ~215 u²), plafond de monstres vivants, butin propre aux cartes compensé, coût
 * de simulation en pleine densité.
 */
import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../../../../src/core/rng';
import { MAP_ZONES, MAP_ZONE_BY_ID } from '../../../../src/data/maps';
import { AREA_PER_PACK } from '../../data/zones/mapbuild';
import { generateShape, MAP_AREA, MAP_SHAPES, mapShapeOf, OPEN } from '../../data/zones/mapshapes';
import { buildMapZone } from '../../data/zones/mapzone';
import { MAP_DENSITY_DROP_DIV, MAX_LIVE_MONSTERS } from '../../../../src/sim/constants';
import { Game, MAP_MIN_LEVEL } from '../../../../src/sim/game';
import { CELL, type WalkGrid } from '../../../../src/sim/grid';
import { makeMap } from '../../sim/maps';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { deserialize, serialize } from '../../../../src/sim/save';
import { reachFrom, walkClear } from './map-reach';
import { perfMs } from '../../../../tests/perf';

const SEEDS = [1, 2, 3];
/** Surface praticable visée avant l'agrandissement ×2 (palier 1 : 9 500 u²) */
const OLD_TIER1_AREA = 9500;

/** Distances de marche sur la grille (2 en ligne droite, 3 en diagonale sans couper les coins) depuis une sous-case */
function bfs(g: WalkGrid, from: number): Int32Array {
  const d = new Int32Array(g.cols * g.rows).fill(-1);
  const buckets: number[][] = [[from]];
  d[from] = 0;
  for (let cur = 0; cur < buckets.length; cur++) {
    for (const i of buckets[cur] ?? []) {
      if (d[i] !== cur) continue;
      const cx = i % g.cols;
      const cy = (i - cx) / g.cols;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          if (g.isBlockedCell(cx + ox, cy + oy)) continue;
          if (ox && oy && (g.isBlockedCell(cx + ox, cy) || g.isBlockedCell(cx, cy + oy))) continue;
          const j = g.idx(cx + ox, cy + oy);
          const nd = cur + (ox && oy ? 3 : 2);
          if (d[j] >= 0 && d[j] <= nd) continue;
          d[j] = nd;
          (buckets[nd] ??= []).push(j);
        }
    }
  }
  return d;
}

const cellAt = (g: WalkGrid, x: number, y: number) => {
  const f = g.nearestFree(x, y, 3) ?? { x, y };
  return g.idx(Math.floor(f.x / CELL), Math.floor(f.y / CELL));
};

describe('Formes des cartes', () => {
  it('le catalogue couvre toutes les cartes, variées dans chaque famille (champ / labyrinthe)', () => {
    for (const d of MAP_ZONES) expect(MAP_SHAPES[d.id], d.id).toBeTruthy();
    for (const layout of ['field', 'labyrinth'] as const) {
      const kinds = new Set(MAP_ZONES.filter((d) => d.layout === layout).map((d) => mapShapeOf(d.id, layout).kind));
      expect(kinds.size, layout).toBeGreaterThanOrEqual(9);
    }
  });

  it('chaque carte × graines : déterministe, connexe, boss loin, surface bornée, forme non carrée', () => {
    const errs: string[] = [];
    for (const def of MAP_ZONES) {
      const spec = mapShapeOf(def.id, def.layout);
      const target = (MAP_AREA[def.tier] ?? MAP_AREA[1]) * (spec.size ?? 1);
      for (const seed of SEEDS) {
        const opts = { density: 0, rarity: 0, event: seed === 2 ? ('horde' as const) : undefined, extraBoss: seed === 3 };
        const z = buildMapZone(def, seed, opts);
        const z2 = buildMapZone(def, seed, opts);
        const tag = `${def.id}/${seed}`;
        if (JSON.stringify({ ...z, groundTiles: [...z.groundTiles!.data] }) !== JSON.stringify({ ...z2, groundTiles: [...z2.groundTiles!.data] })) errs.push(`${tag} : non déterministe`);
        const { grid: g, reach, free } = reachFrom(z);
        if (g.circleBlocked(z.start.x, z.start.y, 0.4)) errs.push(`${tag} : départ dans un mur`);
        const boss = z.spawns.find((s) => s.runBoss);
        if (!boss) errs.push(`${tag} : pas de boss`);
        else if (g.isBlockedAt(boss.x, boss.y)) errs.push(`${tag} : boss dans un mur`);
        for (const s of z.spawns) {
          if (!reach(s.x, s.y)) errs.push(`${tag} : groupe ${s.monster} inaccessible`);
          if (g.isBlockedAt(s.x, s.y)) errs.push(`${tag} : groupe ${s.monster} dans un mur`);
        }
        for (const o of z.objects) if (!reach(o.x, o.y)) errs.push(`${tag} : objet ${o.kind} inaccessible`);
        // boss à ≥ 60 % du diamètre de marche (double balayage)
        const dS = bfs(g, cellAt(g, z.start.x, z.start.y));
        let far = 0;
        for (let i = 0; i < dS.length; i++) if (dS[i] > dS[far]) far = i;
        const diam = bfs(g, far).reduce((a, b) => Math.max(a, b), 0);
        if (boss && dS[cellAt(g, boss.x, boss.y)] < 0.6 * diam) errs.push(`${tag} : boss trop près (${dS[cellAt(g, boss.x, boss.y)]} / ${diam})`);
        // surface praticable : ×2 par rapport aux formes précédentes (cible du palier ±25 %)
        const area = free * CELL * CELL;
        if (area < Math.max(OLD_TIER1_AREA * 1.5, target * 0.75) || area > target * 1.3) errs.push(`${tag} : surface ${Math.round(area)} (cible ${target})`);
        // forme non rectangulaire : la boîte englobante est loin d'être remplie
        if (area / (z.width * z.height) >= 0.8) errs.push(`${tag} : forme trop pleine (${(area / (z.width * z.height)).toFixed(2)})`);
        // densité de monstres proportionnelle à la surface : un groupe pour ~215 u² (escortes des uniques à part)
        const packs = z.spawns.filter((s) => !s.runBoss && s.trigger === 12 && !s.escort);
        const expected = area / AREA_PER_PACK;
        if (packs.length < expected * 0.8 || packs.length > expected * 1.25) errs.push(`${tag} : ${packs.length} groupes pour ${Math.round(area)} u²`);
        const mons = z.spawns.filter((s) => !s.runBoss).reduce((n, s) => n + s.count, 0);
        if (mons < 480 || mons > 950) errs.push(`${tag} : ${mons} monstres`);
      }
    }
    expect(errs.slice(0, 20), errs.slice(0, 20).join('\n')).toEqual([]);
  }, 120000);

  it('grille de forme : pas de passage d’une case (2 unités) ni de pincement en diagonale', () => {
    const errs: string[] = [];
    for (const def of MAP_ZONES) {
      const s = generateShape(mapShapeOf(def.id, def.layout), def.layout === 'labyrinth', def.tier, new Rng(`t:${def.id}`));
      const g = s.g;
      const o = (x: number, y: number) => g.get(x, y) === OPEN;
      for (let y = 0; y < g.rows; y++)
        for (let x = 0; x < g.cols; x++) {
          if (!o(x, y)) continue;
          if (
            g.cell === 2 &&
            ![
              [0, 0],
              [-1, 0],
              [0, -1],
              [-1, -1],
            ].some(([dx, dy]) => o(x + dx, y + dy) && o(x + dx + 1, y + dy) && o(x + dx, y + dy + 1) && o(x + dx + 1, y + dy + 1))
          )
            errs.push(`${def.id} : passage d’une case en ${x},${y}`);
          if (o(x + 1, y + 1) && !o(x + 1, y) && !o(x, y + 1)) errs.push(`${def.id} : pincement en ${x},${y}`);
          if (o(x - 1, y + 1) && !o(x - 1, y) && !o(x, y + 1)) errs.push(`${def.id} : pincement en ${x},${y}`);
        }
    }
    expect(errs.slice(0, 10), errs.slice(0, 10).join('\n')).toEqual([]);
  });

  it('formes distinctes : empreintes toutes différentes ; génération < 250 ms', () => {
    const hashes = new Map<string, string>();
    const slow: string[] = [];
    for (const def of MAP_ZONES) {
      buildMapZone(def, 99, { density: 0, rarity: 0 }); // échauffement (JIT)
      const times: number[] = [];
      let z = buildMapZone(def, 1, { density: 0, rarity: 0 });
      for (const seed of SEEDS) {
        const t0 = performance.now();
        z = buildMapZone(def, seed, { density: 0, rarity: 0 });
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      if (times[1] > perfMs(250)) slow.push(`${def.id} : ${times[1].toFixed(0)} ms`);
      // empreinte de la forme : grille de tuiles praticables / non praticables
      const gt = z.groundTiles!;
      const h = String(hashSeed(`${gt.cols}x${gt.rows}:${[...gt.data].map((k) => (k === 255 ? 9 : k)).join('')}`));
      expect(hashes.has(h), `${def.id} = ${hashes.get(h)}`).toBe(false);
      hashes.set(h, def.id);
    }
    expect(slow, slow.join('\n')).toEqual([]);
  });

  it('runs complètes à pied (îlots de lave, village, spirale, canyon) : tout est nettoyé, la run se termine', () => {
    for (const id of ['phlegethon', 'shadows_westmarch', 'throne_insanity', 'sescheron']) {
      const g = new Game();
      addXp(g.character, xpToReach(MAP_MIN_LEVEL + 5));
      g.character.progression.highestDifficulty = 2;
      const def = MAP_ZONE_BY_ID[id];
      g.character.inventory[0] = makeMap(new Rng(`run:${id}`), Math.min(3, def.tier), 'normal', id);
      expect(g.startMap({ invIndex: 0 }, 11).ok).toBe(true);
      const r = walkClear(g, 1800);
      expect(r.stuck, `${id} : bloqué`).toBe(false);
      expect(r.left, `${id} : restants`).toBe(0);
      expect(r.completed, `${id} : run terminée`).toBe(true);
      // cartes ×2 et ~1 000 monstres : 6 à 12 minutes pour un joueur ; le parcours à pied qui va d'un groupe à
      // l'autre en tuant au contact en prend 6 à 10 (mesuré 350-560 s sur ces quatre cartes)
      expect(r.seconds, `${id} : durée`).toBeLessThan(720);
    }
  }, 180000);

  it('plafond de monstres vivants : les groupes lointains attendent, ceux à portée apparaissent toujours', () => {
    const g = new Game();
    addXp(g.character, xpToReach(MAP_MIN_LEVEL + 5));
    g.character.progression.highestDifficulty = 2;
    g.character.inventory[0] = makeMap(new Rng('cap'), 2, 'normal', 'kyovashad');
    expect(g.startMap({ invIndex: 0 }, 5).ok).toBe(true);
    const w = g.world;
    w.godMode = true;
    // écran immense : toute la carte est dans l'anneau de la portée de l'écran
    w.viewReach = 1000;
    const p = w.player;
    const nearCount = () => w.zone.spawns.reduce((n, s) => n + (Math.hypot(s.x - p.x, s.y - p.y) <= (s.trigger ?? 0) + s.r || s.runBoss ? s.count : 0), 0);
    g.step(1);
    expect(w.liveMonsters()).toBeLessThanOrEqual(MAX_LIVE_MONSTERS + nearCount() + 16);
    expect(w.pendingSpawns.length).toBeGreaterThan(20);
    // les monstres tués libèrent la place : les groupes en attente apparaissent
    const before = w.pendingSpawns.length;
    for (const m of [...w.monsters]) if (!m.dead && m.team === 1 && !m.pet && !m.runBoss) w.killMonster(m, p);
    g.step(1);
    expect(w.pendingSpawns.length).toBeLessThan(before);
    expect(w.liveMonsters()).toBeLessThanOrEqual(MAX_LIVE_MONSTERS + nearCount() + 16);
  });

  it('butin propre aux cartes compensé : autant de cartes et d’orbes par carte (hors boss) qu’avant la densité ×3,5', () => {
    // espérance (poids des chances par rang avant RATES), 37 cartes × graines 1-4, carte entièrement nettoyée ;
    // avant l'agrandissement : 1,728 carte et 1,357 orbe par carte jouée (~185 monstres)
    const P: Record<string, [number, number]> = { unique: [0.12, 0.1], champion: [0.05, 0.04], normal: [0.004, 0.003] };
    let maps = 0;
    let orbs = 0;
    let mons = 0;
    let n = 0;
    for (const def of MAP_ZONES)
      for (const seed of [1, 2, 3, 4]) {
        n++;
        for (const s of buildMapZone(def, seed, { density: 0, rarity: 0 }).spawns) {
          if (s.runBoss) continue;
          const lead = s.rank === 'unique' ? 'unique' : (s.rank ?? 'normal');
          const rest = s.rank === 'unique' ? 'normal' : lead;
          for (const [rank, k] of [
            [lead, 1],
            [rest, s.count - 1],
          ] as [string, number][]) {
            maps += P[rank][0] * k;
            orbs += P[rank][1] * k;
            mons += k;
          }
        }
      }
    expect(mons / n).toBeGreaterThan(550);
    expect(maps / n / MAP_DENSITY_DROP_DIV / 1.728).toBeGreaterThan(0.9);
    expect(maps / n / MAP_DENSITY_DROP_DIV / 1.728).toBeLessThan(1.1);
    expect(orbs / n / MAP_DENSITY_DROP_DIV / 1.357).toBeGreaterThan(0.9);
    expect(orbs / n / MAP_DENSITY_DROP_DIV / 1.357).toBeLessThan(1.1);
  });

  it('coût de simulation en pleine densité : tous les groupes d’une carte d’un coup (~1 000 monstres)', () => {
    // pire cas (une carte entière déclenchée) : mesuré ~0,4-1 ms par tick sur un serveur (avant la densité : ~0,3 ms
    // pour ~185 monstres) ; seuil large (machines de test chargées, mobile ~4× plus lent) : 12 ms, le budget d'un tick à 25 Hz est 40 ms
    const g = new Game();
    addXp(g.character, xpToReach(MAP_MIN_LEVEL + 5));
    g.character.progression.highestDifficulty = 2;
    g.character.inventory[0] = makeMap(new Rng('perf'), 2, 'normal', 'kyovashad');
    expect(g.startMap({ invIndex: 0 }, 7).ok).toBe(true);
    const w = g.world;
    w.godMode = true;
    for (const s of [...w.pendingSpawns]) if (!s.wave && !s.seal) w.spawnGroup(s.idx);
    w.pendingSpawns = [];
    expect(w.liveMonsters()).toBeGreaterThan(700);
    g.step(25);
    const t0 = performance.now();
    g.step(100);
    const ms = (performance.now() - t0) / 100;
    expect(ms).toBeLessThan(perfMs(12));
  });

  it('reprise d’une run de carte sauvegardée : la zone régénérée ne coince personne dans un mur', () => {
    const g = new Game();
    addXp(g.character, xpToReach(MAP_MIN_LEVEL + 5));
    g.character.progression.highestDifficulty = 2;
    g.character.inventory[0] = makeMap(new Rng('resume'), 1, 'normal', 'zoltun_kulle');
    expect(g.startMap({ invIndex: 0 }, 3).ok).toBe(true);
    g.world.godMode = true;
    g.step(5);
    const save = JSON.parse(serialize(g.toSave()));
    // ancienne sauvegarde : le joueur et un monstre à des positions devenues murs (forme différente)
    const w = g.world;
    let wall: { x: number; y: number } | null = null;
    for (let y = 1; y < w.zone.height && !wall; y += 2) for (let x = 1; x < w.zone.width && !wall; x += 2) if (w.grid.isBlockedAt(x, y) && w.grid.nearestFree(x, y, 6)) wall = { x, y };
    expect(wall).toBeTruthy();
    save.run.world.player.x = wall!.x;
    save.run.world.player.y = wall!.y;
    if (save.run.world.monsters[0]) ((save.run.world.monsters[0].x = wall!.x), (save.run.world.monsters[0].y = wall!.y));
    Game.resumeOnLoad = true;
    try {
      const g2 = new Game(deserialize(JSON.stringify(save)));
      expect(g2.mode).toBe('run');
      const p = g2.world.player;
      expect(g2.world.grid.isBlockedAt(p.x, p.y)).toBe(false);
      for (const m of g2.world.monsters) expect(g2.world.grid.isBlockedAt(m.x, m.y)).toBe(false);
      g2.step(10);
    } finally {
      Game.resumeOnLoad = false;
    }
  });
});
