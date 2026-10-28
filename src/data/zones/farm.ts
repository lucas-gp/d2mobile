// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Zones de farm de boss PD2 : Tour oubliée (la Comtesse, Acte I), Catacombes (Andariel, Acte I) et
 * Durance de la haine (Méphisto, Acte III). Chacune est un labyrinthe de salles à graine (même
 * générateur que les Tombeaux de Tal Rasha) dont la salle la plus éloignée du départ abrite le boss
 * et son escorte. Compositions de monstres d'après Levels.txt (Tower Cellar Level 5, Catacombs Level 4,
 * Durance of Hate Level 3) avec les modèles dont le jeu dispose ; la mort du boss termine la run.
 */
import { Rng } from '../../core/rng';
import type { Difficulty } from '../types';
import type { SpawnDef, ZoneDef } from '../zone-types';
import type { GroundKind } from '../zone-types';
import { ZoneBuilder } from './builder';
import { withD2Farm } from './d2farm';
import { LEVEL_PLANS } from '../levels';

interface FarmSpec {
  id: string;
  name: string;
  /** Sol des salles et de la salle du boss */
  ground: GroundKind;
  bossGround: GroundKind;
  theme: string;
  mood: string;
  ambient: { color: number; level: number };
  /** Murs de fond (pleine hauteur) et murs bas : bases de décor `<base>_a` / `<base>_b` */
  wall: string;
  lowWall: string;
  /** Monstres de salle : [espèce, poids] */
  monsters: [string, number][];
  boss: string;
  /** Escorte du boss : [espèce, nombre] */
  escort: [string, number];
  props: string[];
  /** Lumière de la salle du boss */
  glow: number;
  /** Colonnes des salles (décor) ; par défaut les colonnes de tombeau */
  column?: string;
  /** Boss supplémentaires de la salle finale (la run se termine quand tous les boss de run sont morts) */
  coBosses?: string[];
  /** Groupe de boss intermédiaire (Eldritch avant Shenk) : [espèce, nombre d'escorte], posé dans la salle la plus éloignée du départ avant le boss */
  midBoss?: [string, number];
}

const NX = 4;
const NY = 3;
const C = 20;
const M = 4;

type Cell = [number, number];

function build(spec: FarmSpec, seed: number, difficulty: Difficulty): ZoneDef {
  const rng = new Rng(`${spec.id}:${seed}`);
  const W = NX * C + 2 * M;
  const H = NY * C + 2 * M;
  const b = new ZoneBuilder(spec.id, spec.name, W, H, spec.ground, { theme: spec.theme, mood: spec.mood, ambient: spec.ambient });

  const key = (c: Cell) => `${c[0]},${c[1]}`;
  const links = new Set<string>();
  const link = (a: Cell, c: Cell) => {
    links.add(`${key(a)}|${key(c)}`);
    links.add(`${key(c)}|${key(a)}`);
  };
  const linked = (a: Cell, c: Cell) => links.has(`${key(a)}|${key(c)}`);
  const nbrs = (c: Cell): Cell[] =>
    (
      [
        [c[0] + 1, c[1]],
        [c[0] - 1, c[1]],
        [c[0], c[1] + 1],
        [c[0], c[1] - 1],
      ] as Cell[]
    ).filter(([x, y]) => x >= 0 && y >= 0 && x < NX && y < NY);
  const start: Cell = [0, rng.int(NY)];
  const seen = new Set([key(start)]);
  const stack: Cell[] = [start];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const free = nbrs(cur).filter((n) => !seen.has(key(n)));
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
    link(a, rng.pick(nbrs(a)));
  }
  // salle du boss : la plus éloignée du départ
  const dist = new Map<string, number>([[key(start), 0]]);
  const q: Cell[] = [start];
  let far = start;
  while (q.length) {
    const c = q.shift()!;
    for (const n of nbrs(c)) {
      if (!linked(c, n) || dist.has(key(n))) continue;
      dist.set(key(n), dist.get(key(c))! + 1);
      q.push(n);
      if (dist.get(key(n))! > dist.get(key(far))!) far = n;
    }
  }

  // murs : segments de 4 unités, passage au segment central ; bords nord et ouest en pleine hauteur
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i < NX; i++) {
      const y = M + j * C;
      const open = j > 0 && j < NY && linked([i, j - 1], [i, j]);
      for (let k = 0; k < C / 4; k++) {
        if (open && k === 2) continue;
        b.prop(`${j === 0 ? spec.wall : spec.lowWall}_a`, M + i * C + 2 + 4 * k, y);
      }
    }
  }
  for (let i = 0; i <= NX; i++) {
    for (let j = 0; j < NY; j++) {
      const x = M + i * C;
      const open = i > 0 && i < NX && linked([i - 1, j], [i, j]);
      for (let k = 0; k < C / 4; k++) {
        if (open && k === 2) continue;
        b.prop(`${i === 0 ? spec.wall : spec.lowWall}_b`, x, M + j * C + 2 + 4 * k);
      }
    }
  }
  b.block(0, 0, W, M - 0.5);
  b.block(0, H - M + 0.5, W, H);
  b.block(0, 0, M - 0.5, H);
  b.block(W - M + 0.5, 0, W, H);

  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const x0 = M + i * C;
      const y0 = M + j * C;
      const cx = x0 + C / 2;
      const cy = y0 + C / 2;
      const isStart = i === start[0] && j === start[1];
      const isBoss = i === far[0] && j === far[1];
      b.rect(spec.ground, x0 + 3, y0 + 3, x0 + C - 3, y0 + C - 3);
      b.prop('torch_wall', x0 + 5, y0 + 0.9);
      b.prop('torch_wall', x0 + 15, y0 + 0.9);
      b.prop('torch_wall', x0 + 0.9, y0 + 15);
      if (isBoss || rng.chance(0.4))
        for (const [px, py] of [
          [5, 5],
          [15, 5],
          [5, 15],
          [15, 15],
        ])
          b.prop(spec.column ?? 'tomb_column', x0 + px, y0 + py);
      if (rng.chance(0.5)) b.prop(rng.pick(spec.props), x0 + 2.4, y0 + 4.5);
      if (rng.chance(0.5)) b.prop(rng.pick(spec.props), x0 + C - 2.4, y0 + C - 4.5);
      if (rng.chance(0.5)) b.prop(rng.pick(['bones', 'skull']), cx + rng.float(-4, 4), cy + rng.float(-4, 4));
      if (isStart) {
        b.start(cx, cy);
        if (rng.chance(0.5)) b.object({ kind: 'shrine', x: x0 + 4, y: y0 + C - 4 });
        continue;
      }
      if (isBoss) continue;
      const packs = (dist.get(key([i, j])) ?? 1) >= 3 && rng.chance(0.5) ? 2 : 1;
      for (let p = 0; p < packs; p++) {
        const mon = rng.weighted(spec.monsters, (m) => m[1])![0];
        const roll = rng.next();
        const rank: SpawnDef['rank'] = roll < 0.08 ? 'unique' : roll < 0.22 ? 'champion' : 'normal';
        const count = rank === 'unique' ? 4 : rank === 'champion' ? 3 : rng.range(4, 6);
        b.spawn({ monster: mon, x: cx + rng.float(-3, 3), y: cy + rng.float(-3, 3), count, r: 2.5, rank, trigger: 11 });
      }
    }
  }

  // salle du boss
  const bx = M + far[0] * C + C / 2;
  const by = M + far[1] * C + C / 2;
  b.rect(spec.bossGround, bx - 6, by - 6, bx + 6, by + 6);
  b.spawn({ monster: spec.boss, x: bx, y: by, count: 1, r: 0, rank: 'boss', trigger: 9, runBoss: true });
  (spec.coBosses ?? []).forEach((id, k) => b.spawn({ monster: id, x: bx + (k % 2 ? 4 : -4), y: by - 3 - 2 * k, count: 1, r: 0, rank: 'boss', trigger: 9, runBoss: true }));
  if (spec.midBoss) {
    // le boss intermédiaire garde l'avant-dernière salle du chemin (la plus éloignée après celle du boss)
    let mid = start;
    for (const [k, d] of dist) if (k !== key(far) && d >= (dist.get(key(mid)) ?? 0)) mid = k.split(',').map(Number) as Cell;
    const mx = M + mid[0] * C + C / 2;
    const my = M + mid[1] * C + C / 2;
    b.spawn({ monster: spec.midBoss[0], x: mx, y: my, count: 1, r: 0, rank: 'boss', trigger: 11 });
    b.spawn({ monster: spec.monsters[0][0], x: mx - 3, y: my + 2, count: spec.midBoss[1], r: 3, rank: 'normal', trigger: 11 });
  }
  b.spawn({ monster: spec.escort[0], x: bx - 3, y: by + 2, count: spec.escort[1] + (difficulty > 0 ? 2 : 0), r: 3, rank: 'normal', trigger: 9 });
  b.light({ x: bx, y: by, radius: 9, color: spec.glow, intensity: 0.8, z: 3 });
  b.object({ kind: 'chest', x: bx - 5, y: by - 7 });
  b.object({ kind: 'chest', x: bx + 5, y: by - 7 });
  return b.build();
}

/** Zone de farm : le labyrinthe généré, ou la salle de Diablo II quand sa carte est chargée */
function farm(spec: FarmSpec, seed: number, difficulty: Difficulty): ZoneDef {
  return withD2Farm(build(spec, seed, difficulty), seed, difficulty);
}

/** Tour oubliée (niveau des caves 5) : la Comtesse et ses Traqueurs sombres */
/** Fleuve de flammes (Levels 107) : Héphasto le Forgeron au bout du labyrinthe de lave (carte D2 seulement) */
export function buildRiver(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'river',
      name: 'Fleuve de flammes',
      ground: 'hellstone',
      bossGround: 'hellstone',
      theme: 'keep',
      mood: 'chaos',
      ambient: { color: 0x40201a, level: 0.24 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      monsters: LEVEL_PLANS.river.mons[0],
      boss: 'hephasto',
      escort: ['oblivion_knight', 4],
      props: ['bones', 'skull'],
      glow: 0xff5020,
    },
    seed,
    difficulty,
  );
}

export function buildCountess(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'countess',
      name: 'Caves de la Tour oubliée',
      ground: 'flagstone',
      bossGround: 'crypt',
      theme: 'tomb',
      mood: 'tombs',
      ambient: { color: 0x2c3230, level: 0.22 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      // Levels.txt : Devilkin (Déchu) et fantômes ; le jeu n'a pas de modèle de fantôme, les Chamans déchus les remplacent
      monsters: LEVEL_PLANS.countess.mons[0],
      boss: 'countess',
      escort: ['dark_stalker', 5],
      props: ['candles', 'coffin', 'banner_red'],
      glow: 0xe8a860,
    },
    seed,
    difficulty,
  );
}

/** Catacombes (niveau 4) : Andariel */
export function buildAndariel(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'andariel',
      name: 'Catacombes',
      ground: 'crypt',
      bossGround: 'flagstone',
      theme: 'tomb',
      mood: 'tombs',
      ambient: { color: 0x2a2c34, level: 0.2 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      // Levels.txt : Goules (zombie3) ; les Affligés (bighead1) n'ont pas de modèle — Zombies à la place
      monsters: LEVEL_PLANS.andariel.mons[0],
      boss: 'andariel',
      escort: ['ghoul', 6],
      props: ['coffin', 'candles', 'shrine_candles'],
      glow: 0x8ad070,
    },
    seed,
    difficulty,
  );
}

/** Durance de la haine (niveau 3) : Méphisto */
export function buildMephisto(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'mephisto',
      name: 'Durance de la haine',
      ground: 'hellstone',
      bossGround: 'flagstone',
      theme: 'keep',
      mood: 'chaos',
      ambient: { color: 0x24303a, level: 0.2 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      // Levels.txt : vampires de la Durance (vampire4, famille du Seigneur goule) ; le blood_lord du jeu est celui de l'Acte V
      monsters: LEVEL_PLANS.mephisto.mons[0],
      boss: 'mephisto',
      escort: ['ghoul_lord', 4],
      props: ['banner_red', 'shrine_candles', 'candles'],
      glow: 0x88b8ff,
    },
    seed,
    difficulty,
  );
}

/** Temple de Nihlathak (entrée) : Pindleskin et sa garde de Guerriers souillés */
export function buildPindleskin(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'pindleskin',
      name: 'Temple de Nihlathak',
      ground: 'flagstone',
      bossGround: 'sandstone',
      theme: 'keep',
      mood: 'pindle',
      ambient: { color: 0x30384a, level: 0.24 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      column: 'throne_pillar',
      monsters: LEVEL_PLANS.pindleskin.mons[0],
      boss: 'pindleskin',
      escort: ['prowling_dead', 5],
      props: ['brazier', 'candles', 'banner_red'],
      glow: 0x88a8ff,
    },
    seed,
    difficulty,
  );
}

/** Hauts plateaux glacés et Contreforts sanglants : Eldritch puis Shenk le Contremaître */
export function buildEldritch(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'eldritch',
      name: 'Hauts plateaux glacés',
      ground: 'snow',
      bossGround: 'snow',
      theme: 'keep',
      mood: 'frozen',
      ambient: { color: 0x40485a, level: 0.32 },
      wall: 'stonewall',
      lowWall: 'stonewall',
      column: 'rock_b',
      monsters: LEVEL_PLANS.eldritch.mons[0],
      boss: 'shenk',
      escort: ['overseer', 5],
      midBoss: ['eldritch', 5],
      props: ['tree_pine', 'rock_a', 'bones'],
      glow: 0xff9a60,
    },
    seed,
    difficulty,
  );
}

/** Salles de Vaught : Nihlathak */
export function buildNihlathak(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'nihlathak',
      name: 'Salles de la douleur',
      ground: 'crypt',
      bossGround: 'flagstone',
      theme: 'tomb',
      mood: 'vaught',
      ambient: { color: 0x283244, level: 0.2 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      column: 'throne_pillar',
      monsters: LEVEL_PLANS.nihlathak.mons[0],
      boss: 'nihlathak',
      escort: ['minion', 6],
      props: ['coffin', 'candles', 'shrine_candles'],
      glow: 0x78c0ff,
    },
    seed,
    difficulty,
  );
}

/** Sommet du Mont Arreat : les trois Anciens (Talic, Madawc, Korlic) */
export function buildAncients(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'ancients',
      name: 'Sommet du mont Arreat',
      ground: 'snow',
      bossGround: 'flagstone',
      theme: 'keep',
      mood: 'arreat',
      ambient: { color: 0x48506a, level: 0.34 },
      wall: 'stonewall',
      lowWall: 'stonewall',
      column: 'rock_b',
      monsters: [
        ['oblivion_knight', 4],
        ['minion_destruction', 4],
        ['venom_lord', 2],
      ],
      boss: 'ancient_talic',
      coBosses: ['ancient_madawc', 'ancient_korlic'],
      escort: ['oblivion_knight', 4],
      props: ['rock_a', 'rock_c', 'tree_pine'],
      glow: 0xd8e0ff,
    },
    seed,
    difficulty,
  );
}

/* ---------- Pandémonium (PD2) : mini-ubers et Tristram ---------- */
/**
 * Monstres des trois mini-ubers d'après Levels.txt (Pandemonium 1 à 3 : nmon/umon), rapportés aux espèces
 * du jeu comme tools/audit/gen-levels-a5.ts. Tristram pandémoniaque n'a aucun monstre de zone dans
 * Levels.txt (ses ubers viennent du code de D2) : on garde des démons d'Acte V en attendant leurs sbires.
 */
const UBER_MONSTERS: [string, number][] = [
  ['blood_lord', 4],
  ['venom_lord', 3],
  ['oblivion_knight', 3],
  ['minion_destruction', 2],
];
/** Antre de la Matrone (Pandemonium 1) : succubus8, succubuswitch9, corruptrogue6, cr_archer8, cr_lancer8 */
const MATRON_MONSTERS: [string, number][] = [
  ['succubus', 3],
  ['succubus_witch', 3],
  ['dark_stalker', 4],
];
/** Sables oubliés (Pandemonium 2) : swarm5, sandmaggot7, arach7, scarab8 */
const SANDS_MONSTERS: [string, number][] = [
  ['locust', 2],
  ['sand_maggot', 3],
  ['arach', 3],
  ['scarab', 3],
];
/** Fournaise de la douleur (Pandemonium 3) : overseer6, dkmag3, megademon6, imp8 */
const FURNACE_MONSTERS: [string, number][] = [
  ['overseer', 3],
  ['oblivion_knight', 3],
  ['venom_lord', 3],
  ['imp', 2],
];

/** Antre de la Matrone : Lilith */
export function buildUberLilith(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_lilith',
      name: 'Antre de la Matrone',
      ground: 'hellstone',
      bossGround: 'flagstone',
      theme: 'keep',
      mood: 'chaos',
      ambient: { color: 0x3a2428, level: 0.2 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      monsters: MATRON_MONSTERS,
      boss: 'lilith',
      escort: ['succubus_witch', 5],
      props: ['brazier', 'banner_red', 'bones'],
      glow: 0xff5a70,
    },
    seed,
    difficulty,
  );
}

/** Sables oubliés : Duriel ultime */
export function buildUberDuriel(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_duriel',
      name: 'Sables oubliés',
      ground: 'sandstone',
      bossGround: 'sandstone',
      theme: 'tomb',
      mood: 'tombs',
      ambient: { color: 0x40382a, level: 0.24 },
      wall: 'tombwall',
      lowWall: 'tombwall_half',
      monsters: SANDS_MONSTERS,
      boss: 'uber_duriel',
      escort: ['sand_maggot', 5],
      props: ['tomb_urn', 'bones', 'tomb_rubble'],
      glow: 0x8ab0ff,
    },
    seed,
    difficulty,
  );
}

/** Fournaise de la douleur : Izual ultime */
export function buildUberIzual(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_izual',
      name: 'Fournaise de la douleur',
      ground: 'hellstone',
      bossGround: 'hellstone',
      theme: 'keep',
      mood: 'chaos',
      ambient: { color: 0x302a40, level: 0.22 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      monsters: FURNACE_MONSTERS,
      boss: 'uber_izual',
      escort: ['oblivion_knight', 6],
      props: ['brazier', 'bones', 'banner_red'],
      glow: 0x80c8ff,
    },
    seed,
    difficulty,
  );
}

/** Tristram pandémoniaque : Diablo, Méphisto et Baal ultimes ; la run se termine à la mort du dernier */
export function buildUberTristram(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_tristram',
      name: 'Tristram pandémoniaque',
      ground: 'deadgrass',
      bossGround: 'hellstone',
      theme: 'village',
      mood: 'tristram',
      ambient: { color: 0x3a2020, level: 0.22 },
      wall: 'stonewall',
      lowWall: 'stonewall',
      column: 'tree_dead_l',
      monsters: UBER_MONSTERS,
      boss: 'uber_diablo',
      coBosses: ['uber_mephisto', 'uber_baal'],
      escort: ['blood_lord', 6],
      props: ['tree_dead_m', 'grave_a', 'bones', 'skull'],
      glow: 0xff3020,
    },
    seed,
    difficulty,
  );
}

/** Arène du Clone de Diablo (Vision de la terreur) : Diablo cloné et ses squelettes (Guerriers d'os, Archers, Mages de l'horreur) */
export function buildUberDclone(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_dclone',
      name: 'Arène du Clone',
      ground: 'hellstone',
      bossGround: 'hellstone',
      theme: 'keep',
      mood: 'chaos',
      ambient: { color: 0x401a14, level: 0.2 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      monsters: [
        ['blood_lord', 3],
        ['oblivion_knight', 3],
        ['minion_destruction', 3],
      ],
      boss: 'dclone',
      escort: ['oblivion_knight', 6],
      props: ['brazier', 'skull', 'bones'],
      glow: 0xff3010,
    },
    seed,
    difficulty,
  );
}

/** Anciens ultimes : Talic, Madawc et Korlic, la run se termine à la mort du dernier */
export function buildUberAncients(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_ancients',
      name: 'Sommet ultime du mont Arreat',
      ground: 'snow',
      bossGround: 'flagstone',
      theme: 'keep',
      mood: 'arreat',
      ambient: { color: 0x403a58, level: 0.3 },
      wall: 'stonewall',
      lowWall: 'stonewall',
      column: 'rock_b',
      monsters: [
        ['oblivion_knight', 4],
        ['minion_destruction', 4],
        ['venom_lord', 2],
      ],
      boss: 'uber_talic',
      coBosses: ['uber_madawc', 'uber_korlic'],
      escort: ['oblivion_knight', 5],
      props: ['rock_a', 'rock_c', 'tree_pine'],
      glow: 0xe8c0ff,
    },
    seed,
    difficulty,
  );
}

/** Arène de Rathma et Mendeln (Pierre du Vide) : morts-vivants puis les deux maîtres, ensemble ; la run se termine à la mort du dernier */
export function buildUberRathma(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_rathma',
      name: 'Arène de Rathma',
      ground: 'crypt',
      bossGround: 'flagstone',
      theme: 'tomb',
      mood: 'tombs',
      ambient: { color: 0x202c38, level: 0.18 },
      wall: 'tombwall',
      lowWall: 'tombwall_half',
      monsters: [
        ['ghoul', 4],
        ['prowling_dead', 3],
        ['dark_stalker', 3],
      ],
      boss: 'rathma',
      coBosses: ['mendeln'],
      escort: ['ghoul', 6],
      props: ['tomb_urn', 'bones', 'skull'],
      glow: 0x70e0a0,
    },
    seed,
    difficulty,
  );
}

/** Antre de Lucion (Ombre de la haine) : mal primordial niveau 110 et ses démons */
export function buildUberLucion(seed: number, difficulty: Difficulty): ZoneDef {
  return farm(
    {
      id: 'uber_lucion',
      name: 'Antre de Lucion',
      ground: 'hellstone',
      bossGround: 'hellstone',
      theme: 'keep',
      mood: 'chaos',
      ambient: { color: 0x301020, level: 0.18 },
      wall: 'throne_wall',
      lowWall: 'throne_wall_half',
      monsters: [
        ['succubus', 3],
        ['succubus_witch', 3],
        ['blood_lord', 3],
        ['minion_destruction', 2],
      ],
      boss: 'lucion',
      escort: ['succubus_witch', 6],
      props: ['brazier', 'banner_red', 'skull'],
      glow: 0xc040ff,
    },
    seed,
    difficulty,
  );
}
