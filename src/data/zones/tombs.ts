/**
 * Tombeaux de Tal Rasha : un des sept tombeaux, labyrinthe de salles de grès reliées par des
 * passages (générateur à graine). Comme dans D2, un seul des sept est le vrai tombeau : il
 * mène à la chambre de Tal Rasha où attend Duriel. Les six autres se terminent par la salle
 * d'un gardien (unique) et ses coffres. Dans les deux cas, la mort du boss termine la run.
 */
import { Rng } from '../../core/rng';
import type { Difficulty } from '../types';
import type { SpawnDef, ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { d2Map, nearestOpen } from '../d2map';
import { LEVEL_PLANS } from '../levels';
import { withD2Farm } from './d2farm';

export const TOMB_SYMBOLS = ['du Croissant', 'du Triangle', 'du Cercle', "de l'Étoile", 'du Carré', "de l'Œil", 'du Serpent'];

/** Paramètres du labyrinthe */
const NX = 4;
const NY = 3;
const C = 20;
const M = 4;

type Cell = [number, number];

export interface TombInfo {
  symbol: number;
  trueTomb: boolean;
}

/** Le symbole du tombeau est tiré avec la graine de la run ; Duriel attend toujours au fond (jouer six tombeaux de gardiens pour un vrai n'avait pas de sens sur mobile, et sa porte restait introuvable) */
export function tombInfo(seed: number): TombInfo {
  const rng = new Rng(`tombs-info:${seed}`);
  return { symbol: rng.int(7), trueTomb: true };
}

/** Labyrinthe des salles : liaisons entre cases voisines, case de départ, case du boss (la plus éloignée) et distances en salles */
interface TombMaze {
  start: Cell;
  far: Cell;
  dist: Map<string, number>;
  linked: (a: Cell, c: Cell) => boolean;
}

const cellKey = (c: Cell) => `${c[0]},${c[1]}`;

export function buildTombs(seed: number, difficulty: Difficulty): ZoneDef {
  const rng = new Rng(`tombs:${seed}`);
  const info = tombInfo(seed);
  const W = NX * C + 2 * M;
  const H = NY * C + 2 * M;
  const b = new ZoneBuilder('tombs', `Tombeau ${TOMB_SYMBOLS[info.symbol]}`, W, H, 'sandstone', {
    theme: 'tomb',
    mood: 'tombs',
    ambient: { color: 0x3a3028, level: 0.22 },
  });
  const maze = tombMaze(rng);
  tombWalls(b, rng, maze);
  // hors du labyrinthe : roc plein
  b.block(0, 0, W, M - 0.5);
  b.block(0, H - M + 0.5, W, H);
  b.block(0, 0, M - 0.5, H);
  b.block(W - M + 0.5, 0, W, H);
  tombRooms(b, rng, maze);
  const lair = tombFinalRoom(b, info, maze.far);
  // la chambre de Tal Rasha de Diablo II remplace le labyrinthe quand sa carte est chargée
  const z = withD2Farm(b.build(), seed, difficulty);
  if (lair && z.d2Map) durielLairDoor(z);
  return z;
}

/** Arbre couvrant aléatoire des NX × NY salles plus deux boucles ; salle du boss : la plus éloignée du départ (parcours en largeur) */
function tombMaze(rng: Rng): TombMaze {
  const key = cellKey;
  const links = new Set<string>();
  const link = (a: Cell, c: Cell) => {
    links.add(`${key(a)}|${key(c)}`);
    links.add(`${key(c)}|${key(a)}`);
  };
  const linked = (a: Cell, c: Cell) => links.has(`${key(a)}|${key(c)}`);
  const start: Cell = [0, rng.int(NY)];
  const seen = new Set([key(start)]);
  const stack: Cell[] = [start];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const free = neighbours(cur).filter((n) => !seen.has(key(n)));
    if (!free.length) {
      stack.pop();
      continue;
    }
    const nx = rng.pick(free);
    link(cur, nx);
    seen.add(key(nx));
    stack.push(nx);
  }
  for (let k = 0; k < 2; k++) {
    const a: Cell = [rng.int(NX), rng.int(NY)];
    const n = rng.pick(neighbours(a));
    link(a, n);
  }
  const dist = new Map<string, number>([[key(start), 0]]);
  const q: Cell[] = [start];
  let far = start;
  while (q.length) {
    const c = q.shift()!;
    for (const n of neighbours(c)) {
      if (!linked(c, n) || dist.has(key(n))) continue;
      dist.set(key(n), dist.get(key(c))! + 1);
      q.push(n);
      if (dist.get(key(n))! > dist.get(key(far))!) far = n;
    }
  }
  return { start, far, dist, linked };
}

function neighbours(c: Cell): Cell[] {
  return (
    [
      [c[0] + 1, c[1]],
      [c[0] - 1, c[1]],
      [c[0], c[1] + 1],
      [c[0], c[1] - 1],
    ] as Cell[]
  ).filter(([x, y]) => x >= 0 && y >= 0 && x < NX && y < NY);
}

/** Murs en segments de 4 unités, passage au segment central ; murs du fond (bords nord et ouest) pleine hauteur, tous les autres bas (D2) */
function tombWalls(b: ZoneBuilder, rng: Rng, { linked }: TombMaze): void {
  const wallProp = () => (rng.chance(0.2) ? 'tombwall_cracked' : 'tombwall');
  const lowWall = () => 'tombwall_half';
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i < NX; i++) {
      const y = M + j * C;
      const open = j > 0 && j < NY && linked([i, j - 1], [i, j]);
      for (let k = 0; k < C / 4; k++) {
        if (open && k === 2) continue;
        b.prop(`${j === 0 ? wallProp() : lowWall()}_a`, M + i * C + 2 + 4 * k, y);
      }
    }
  }
  for (let i = 0; i <= NX; i++) {
    for (let j = 0; j < NY; j++) {
      const x = M + i * C;
      const open = i > 0 && i < NX && linked([i - 1, j], [i, j]);
      for (let k = 0; k < C / 4; k++) {
        if (open && k === 2) continue;
        b.prop(`${i === 0 ? wallProp() : lowWall()}_b`, x, M + j * C + 2 + 4 * k);
      }
    }
  }
}

/** Salles : sol, torches, piliers, décor le long des murs, sarcophages ; départ (autel possible) ; un ou deux groupes des monstres de Levels.txt */
function tombRooms(b: ZoneBuilder, rng: Rng, { start, far, dist }: TombMaze): void {
  const monsters = LEVEL_PLANS.tombs.mons[0];
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const x0 = M + i * C;
      const y0 = M + j * C;
      const cx = x0 + C / 2;
      const cy = y0 + C / 2;
      const isStart = i === start[0] && j === start[1];
      const isBoss = i === far[0] && j === far[1];
      b.rect('crypt', x0 + 3, y0 + 3, x0 + C - 3, y0 + C - 3);
      // torches murales au nord et à l'ouest (intérieur de la salle), hors des passages
      b.prop('torch_wall', x0 + 5, y0 + 0.9);
      b.prop('torch_wall', x0 + 15, y0 + 0.9);
      b.prop('torch_wall', x0 + 0.9, y0 + 15);
      if (isBoss || rng.chance(0.45)) {
        for (const [px, py] of [
          [5, 5],
          [15, 5],
          [5, 15],
          [15, 15],
        ])
          b.prop(isBoss ? 'tomb_pillar' : 'tomb_column', x0 + px, y0 + py);
      }
      // décor le long des murs, en laissant libres les passages (milieu de chaque côté)
      if (rng.chance(0.6)) b.prop('coffin', x0 + 2.2, y0 + 4.5);
      if (rng.chance(0.5)) b.prop('coffin', x0 + C - 2.2, y0 + C - 4.5);
      if (rng.chance(0.5)) b.prop('tomb_urn', x0 + C - 2, y0 + 2);
      if (rng.chance(0.4)) b.prop('tomb_rubble', x0 + 3, y0 + C - 3);
      if (rng.chance(0.3)) b.prop('tomb_banner', x0 + 10, y0 + 0.8);
      if (rng.chance(0.5)) b.prop(rng.pick(['bones', 'skull']), cx + rng.float(-4, 4), cy + rng.float(-4, 4));
      if (!isStart && !isBoss && rng.chance(0.3)) b.object({ kind: 'sarcophagus', x: x0 + C - 4, y: y0 + 3.2 });
      if (isStart) {
        b.start(cx, cy);
        if (rng.chance(0.5)) b.object({ kind: 'shrine', x: x0 + 4, y: y0 + C - 4 });
        continue;
      }
      if (isBoss) continue;
      // un groupe par salle (deux dans les salles éloignées)
      const packs = (dist.get(cellKey([i, j])) ?? 1) >= 3 && rng.chance(0.5) ? 2 : 1;
      for (let p = 0; p < packs; p++) {
        const mon = rng.weighted(monsters, (m) => m[1])![0];
        const roll = rng.next();
        const rank: SpawnDef['rank'] = roll < 0.08 ? 'unique' : roll < 0.22 ? 'champion' : 'normal';
        const count = rank === 'unique' ? 4 : rank === 'champion' ? 3 : rng.range(4, 6);
        b.spawn({ monster: mon, x: cx + rng.float(-3, 3), y: cy + rng.float(-3, 3), count, r: 2.5, rank, trigger: 11 });
      }
    }
  }
}

/** Salle finale : Duriel (vrai tombeau, sans carte de son repaire) ou le gardien et son escorte ; deux coffres. Rend vrai si le repaire de Duriel est chargé */
function tombFinalRoom(b: ZoneBuilder, info: TombInfo, far: Cell): boolean {
  const bx = M + far[0] * C + C / 2;
  const by = M + far[1] * C + C / 2;
  b.rect('sandstone', bx - 6, by - 6, bx + 6, by + 6);
  // avec les cartes importées, Duriel est dans son repaire (carte à part, derrière la dalle de rocaille de la salle de Tal Rasha) ; sans elles, il attend au fond
  const lair = !!d2Map('duriel_lair');
  if (info.trueTomb && !lair) {
    // la chambre de Tal Rasha : Duriel seul, sans escorte
    b.spawn({ monster: 'duriel', x: bx, y: by, count: 1, r: 0, rank: 'boss', trigger: 9, runBoss: true });
    b.light({ x: bx, y: by, radius: 9, color: 0x8ab0ff, intensity: 0.8, z: 3 });
  } else {
    b.spawn({ monster: 'mummy', x: bx, y: by, count: 5, r: 3, rank: 'unique', uniqueName: `Gardien du tombeau ${TOMB_SYMBOLS[info.symbol]}`, trigger: 9, runBoss: true });
  }
  b.object({ kind: 'chest', x: bx - 5, y: by - 7 });
  b.object({ kind: 'chest', x: bx + 5, y: by - 7 });
  return lair;
}

/** Avec la carte du repaire : le gardien de la salle ne termine plus la run ; la porte (dalle de rocaille) derrière lui mène à Duriel */
function durielLairDoor(z: ZoneDef): void {
  const guard = z.spawns.find((sp) => sp.runBoss);
  if (guard) {
    guard.runBoss = false;
    const m = d2Map('tombs');
    const p = m ? nearestOpen(m, guard.x, guard.y + 4) : { x: guard.x, y: guard.y + 4 };
    z.exits.push({ x: p.x, y: p.y, kind: 'portal', to: 'chamber', label: 'Porte vers le repaire de Duriel', variant: 'lair' });
    z.chamberAt = { x: p.x, y: p.y };
    z.chamberKind = 'lair';
  }
}
