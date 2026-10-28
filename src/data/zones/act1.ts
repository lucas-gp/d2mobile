// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Campagne de l'Acte I : du Camp des Rôdeuses à Andariel, zone par zone comme Levels.txt les enchaîne (plaines, grottes, cimetière et cryptes, Tour oubliée et ses caves,
 * monastère, prisons, cathédrale, catacombes). Chaque zone est une carte D2 (zones à plan fixe ou assemblage de pièces, voir tools/d2import/act1-maps.ts) ; monstres, densité et
 * uniques viennent de Levels.txt (levels-a1.ts), les super-uniques des emplacements de monpreset.txt. Les portails (rouge = suite, bleu = retour) relient les zones.
 */
import { superUniqueHere } from '../superunique-zones';
import { addQuestObjectsSteps } from './d2objects';
import { runSteps, type Steps } from './steps';
import { thinTreesSteps } from './thin';
import { d2Map, nearestOpen } from '../d2map';
import { A1_LEVELS } from '../levels-a1';
import type { Difficulty } from '../types';
import type { ExitDef, ObjectDef, SpawnDef, ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { withD2FarmSteps } from './d2farm';
import { buildAndariel, buildCountess } from './farm';
import { buildTristram } from './tristram';
import { WAYPOINT_ZONES } from '../waypoints';
import { d2Waypoint, WAYPOINT_ROOM, waypointSheet } from '../d2waypoints';
import { chainJoints, chainSeams, CROSS_DEPTH, mergeOverlap, OVERLAP, openingPoint, openings, type Chains, type Joint, type SeamDef } from './seams';

export interface A1Step {
  id: string;
  name: string;
  /** zone D2 de Levels.txt ; sans plan (ville, zones à boss) : aucun peuplement automatique */
  plan: boolean;
  /**
   * portails : zone visée, point (« prev » = arrivée, « next » = sortie, ou nom d'ancre / de repère), libellé ; lot 320 : « ahead » = l'escalier
   * de la salle de sortie du labyrinthe (ancre `next` de la carte, quand une autre salle porte un escalier : `down`) ; `up` : un escalier qui
   * remonte (« Monter ») ; `walk` : un passage à pied, jamais un escalier (le pont du Fleuve de flammes sans sa jointure)
   */
  exits: { to: string; at: string; label?: string; up?: boolean; walk?: boolean }[];
}

export const S = (id: string, name: string, exits: A1Step['exits'], plan = true): A1Step => ({ id, name, plan, exits });

export const ACT1_STEPS: A1Step[] = [
  S('a1_town', 'Camp des Rôdeuses', [{ to: 'a1_bloodmoor', at: 'next' }], false),
  S('a1_bloodmoor', 'Blood Moor', [
    { to: 'a1_town', at: 'prev' },
    { to: 'a1_coldplains', at: 'next' },
    { to: 'a1_den', at: 'den', label: 'Antre du Mal' },
  ]),
  S('a1_den', 'Antre du Mal', [{ to: 'a1_bloodmoor', at: 'prev' }]),
  S('a1_coldplains', 'Plaines glacées', [
    { to: 'a1_bloodmoor', at: 'prev' },
    { to: 'a1_stonyfield', at: 'next' },
    { to: 'a1_cave1', at: 'cave', label: 'Grotte' },
    { to: 'a1_burial', at: 'burial', label: 'Cimetière' },
  ]),
  // lot 320 (owner's choice, as Diablo II): the Stony Field reaches the Dark Wood through the Underground Passage, not by a seam
  S('a1_stonyfield', 'Champ de pierres', [
    { to: 'a1_coldplains', at: 'prev' },
    { to: 'a1_underpass1', at: 'cave', label: 'Passage souterrain' },
    { to: 'a1_tristram', at: 'cairn', label: 'Tristram' },
  ]),
  S('a1_darkwood', 'Bois sombre', [
    { to: 'a1_underpass1', at: 'cave', label: 'Passage souterrain' },
    { to: 'a1_blackmarsh', at: 'next' },
  ]),
  S('a1_blackmarsh', 'Marais noir', [
    { to: 'a1_darkwood', at: 'prev' },
    { to: 'a1_tamoe', at: 'next' },
    { to: 'a1_tower', at: 'tower', label: 'Tour oubliée' },
    { to: 'a1_hole1', at: 'hole', label: 'Trou' },
  ]),
  S('a1_tamoe', 'Hautes-terres de Tamoe', [
    { to: 'a1_blackmarsh', at: 'prev' },
    { to: 'a1_monastery', at: 'next' },
    { to: 'a1_pit1', at: 'pit', label: 'Fosse' },
  ]),
  S('a1_cave1', 'Grotte, niveau 1', [
    { to: 'a1_coldplains', at: 'prev' },
    { to: 'a1_cave2', at: 'next' },
  ]),
  S('a1_cave2', 'Grotte, niveau 2', [{ to: 'a1_cave1', at: 'prev' }]),
  // lot 320: Diablo II's Underground Passage, from the Stony Field (its entry) to the Dark Wood (its far end, a way up); level 2 below it
  S('a1_underpass1', 'Passage souterrain, niveau 1', [
    { to: 'a1_stonyfield', at: 'prev' },
    { to: 'a1_underpass2', at: 'down' },
    { to: 'a1_darkwood', at: 'ahead', up: true },
  ]),
  S('a1_underpass2', 'Passage souterrain, niveau 2', [{ to: 'a1_underpass1', at: 'prev' }]),
  S('a1_hole1', 'Trou, niveau 1', [
    { to: 'a1_blackmarsh', at: 'prev' },
    { to: 'a1_hole2', at: 'next' },
  ]),
  S('a1_hole2', 'Trou, niveau 2', [{ to: 'a1_hole1', at: 'prev' }]),
  S('a1_pit1', 'Fosse, niveau 1', [
    { to: 'a1_tamoe', at: 'prev' },
    { to: 'a1_pit2', at: 'next' },
  ]),
  S('a1_pit2', 'Fosse, niveau 2', [{ to: 'a1_pit1', at: 'prev' }]),
  S('a1_burial', 'Terre des sépultures', [
    { to: 'a1_coldplains', at: 'prev' },
    { to: 'a1_crypt', at: 'special0', label: 'Crypte' },
    { to: 'a1_mausoleum', at: 'special1', label: 'Mausolée' },
  ]),
  S('a1_crypt', 'Crypte', [{ to: 'a1_burial', at: 'prev' }]),
  S('a1_mausoleum', 'Mausolée', [{ to: 'a1_burial', at: 'prev' }]),
  S('a1_tristram', 'Tristram', [{ to: 'a1_stonyfield', at: 'prev' }], false),
  S('a1_tower', 'Tour oubliée', [
    { to: 'a1_blackmarsh', at: 'prev' },
    { to: 'a1_cellar1', at: 'special0', label: 'Caves de la tour' },
  ]),
  S('a1_cellar1', 'Cave de la tour, niveau 1', [
    { to: 'a1_tower', at: 'prev' },
    { to: 'a1_cellar2', at: 'next' },
  ]),
  S('a1_cellar2', 'Cave de la tour, niveau 2', [
    { to: 'a1_cellar1', at: 'prev' },
    { to: 'a1_cellar3', at: 'next' },
  ]),
  S('a1_cellar3', 'Cave de la tour, niveau 3', [
    { to: 'a1_cellar2', at: 'prev' },
    { to: 'a1_cellar4', at: 'next' },
  ]),
  S('a1_cellar4', 'Cave de la tour, niveau 4', [
    { to: 'a1_cellar3', at: 'prev' },
    { to: 'a1_countess', at: 'next' },
  ]),
  S('a1_countess', 'Cave de la tour, niveau 5', [{ to: 'a1_cellar4', at: 'prev' }], false),
  S('a1_monastery', 'Porte du monastère', [
    { to: 'a1_tamoe', at: 'prev' },
    { to: 'a1_cloister', at: 'next' },
  ]),
  S('a1_cloister', 'Cloître extérieur', [
    { to: 'a1_monastery', at: 'prev' },
    { to: 'a1_barracks', at: 'next' },
  ]),
  S('a1_barracks', 'Casernes', [
    { to: 'a1_cloister', at: 'prev' },
    { to: 'a1_jail1', at: 'next' },
  ]),
  S('a1_jail1', 'Prison, niveau 1', [
    { to: 'a1_barracks', at: 'prev' },
    { to: 'a1_jail2', at: 'next' },
  ]),
  S('a1_jail2', 'Prison, niveau 2', [
    { to: 'a1_jail1', at: 'prev' },
    { to: 'a1_jail3', at: 'next' },
  ]),
  S('a1_jail3', 'Prison, niveau 3', [
    { to: 'a1_jail2', at: 'prev' },
    { to: 'a1_inner', at: 'next' },
  ]),
  S('a1_inner', 'Cloître intérieur', [
    { to: 'a1_jail3', at: 'prev' },
    { to: 'a1_cathedral', at: 'next' },
  ]),
  S('a1_cathedral', 'Cathédrale', [
    { to: 'a1_inner', at: 'prev' },
    { to: 'a1_cata1', at: 'next' },
  ]),
  S('a1_cata1', 'Catacombes, niveau 1', [
    { to: 'a1_cathedral', at: 'prev' },
    { to: 'a1_cata2', at: 'next' },
  ]),
  S('a1_cata2', 'Catacombes, niveau 2', [
    { to: 'a1_cata1', at: 'prev' },
    { to: 'a1_cata3', at: 'next' },
  ]),
  S('a1_cata3', 'Catacombes, niveau 3', [
    { to: 'a1_cata2', at: 'prev' },
    { to: 'a1_andariel', at: 'next' },
  ]),
  S('a1_andariel', 'Catacombes, niveau 4', [{ to: 'a1_cata3', at: 'prev' }], false),
];
const A1_BY_ID: Record<string, A1Step> = Object.fromEntries(ACT1_STEPS.map((s) => [s.id, s]));

/** Planche de zone : la campagne a besoin de toutes les cartes importées */
export const act1Available = (): boolean =>
  ACT1_STEPS.every((s) => ['a1_tristram', 'a1_countess', 'a1_andariel'].includes(s.id) || !!d2Map(s.id)) && !!d2Map('tristram') && !!d2Map('countess') && !!d2Map('andariel');

/** Super-uniques de monpreset.txt (Acte I) : [monstre du jeu, nom] */
const SUPER: Record<string, [string, string]> = {
  corpsefire: ['zombie', 'Corpsefire'],
  bishibosh: ['fallen', 'Bishibosh'],
  bonebreak: ['skeleton', 'Bonebreaker'],
  coldcrow: ['dark_stalker', 'Coldcrow'],
  rakanishu: ['fallen_shaman', 'Rakanishu'],
  'treehead woodfist': ['brute', 'Treehead Woodfist'],
  'pitspawn fouldog': ['goatman', 'Pitspawn Fouldog'],
  'flamespike the crawler': ['arach', 'Flamespike le Rampant'],
  boneash: ['skeleton_mage', 'Boneash'],
  'the smith': ['afflicted', 'Le Forgeron'],
  place_bloodraven: ['blood_raven', 'Blood Raven'],
};
/* ---- généré par tools/vanilla/gen.ts (Levels.txt : tools/vanilla/levels.ts) : ne pas modifier à la main ---- */
/** Niveaux des monstres [Normal, Cauchemar, Enfer] des étapes de l'Acte I construites à part (Levels.txt, LoD 1.13c) */
const D2_LVL: Record<string, [number, number, number]> = {
  a1_tristram: [6, 39, 76],
  a1_countess: [7, 42, 79],
  a1_andariel: [12, 43, 73],
};
/* ---- fin du bloc généré ---- */
const FIXED_LVL: Record<string, [number, number, number]> = { a1_town: [1, 1, 1], ...D2_LVL };
/** Niveau des monstres de la zone aux trois difficultés (Levels.txt ; niveaux Project Diablo 2 des étapes : patch du mod sur les runs) */
export const a1Level = (id: string): [number, number, number] => FIXED_LVL[id] ?? A1_LEVELS[id]?.lvl ?? [1, 36, 67];

/** Point dégagé le plus proche (3 × 3 sous-cases libres : un personnage de rayon 0,4 y tient) */
export function wide(m: ReturnType<typeof d2Map>, x: number, y: number): { x: number; y: number } {
  if (!m) return { x, y };
  const { cols, rows, blocked } = m.grid;
  const cx = Math.floor(x / 0.5);
  const cy = Math.floor(y / 0.5);
  const ok = (a: number, b: number) => {
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const u = a + i;
        const v = b + j;
        if (u < 0 || v < 0 || u >= cols || v >= rows || blocked[v * cols + u]) return false;
      }
    return true;
  };
  for (let r = 0; r < 120; r++)
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (Math.max(Math.abs(i), Math.abs(j)) === r && ok(cx + i, cy + j)) return { x: (cx + i + 0.5) * 0.5, y: (cy + j + 0.5) * 0.5 };
  return nearestOpen(m, x, y);
}

/** Case de passage (escalier, entrée) de Diablo II la plus proche d'un point, à moins de `max` unités ; null sinon */
function warpNear(m: ReturnType<typeof d2Map>, x: number, y: number, max = 22): { x: number; y: number } | null {
  if (!m) return null;
  let best: { x: number; y: number } | null = null;
  let bd = max;
  for (const key of ['special10', 'special11'])
    for (const l of m.landmarks[key] ?? []) {
      const px = (l[0] + 0.5) * 2.5;
      const py = (l[1] + 0.5) * 2.5;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = { x: px, y: py };
      }
    }
  return best ? wide(m, best.x, best.y) : null;
}

/**
 * Act I's outdoor zones joined edge to edge, in the order the hero walks them (src/data/zones/seams.ts). Lot 320: two walks, as in Diablo II,
 * the Underground Passage between them (the Stony Field to the Dark Wood), and the Burial Grounds off the Cold Plains
 */
export const A1_CHAINS: readonly (readonly string[])[] = [
  ['a1_town', 'a1_bloodmoor', 'a1_coldplains', 'a1_stonyfield'],
  ['a1_darkwood', 'a1_blackmarsh', 'a1_tamoe', 'a1_monastery'],
  ['a1_coldplains', 'a1_burial'],
];
/** Every zone of Act I's chains, once */
export const A1_CHAIN = [...new Set(A1_CHAINS.flat())];

/** The joints of Act I's chains on the maps registered now (planned again when a map is registered or replaced) */
export function act1Joints(): Joint[] {
  return chainJoints(A1_CHAINS);
}

/** The seams of an Act I zone toward its neighbours (none without both maps) */
export function act1Seams(id: string): SeamDef[] {
  return chainSeams(A1_CHAINS, id);
}

/**
 * Lot 312: a zone of an outdoor chain (any act) laid out on its D2 map and joined to its neighbours: entered from its predecessor, it
 * starts in that opening (its groups kept away), its overlaps' collision made one, its seams listed (its exits toward them stand in the
 * openings, `addExitsTo`). `skip`: neighbours left joined by their portal
 */
export function* joinedFarm(z0: ZoneDef, id: string, step: A1Step, chain: Chains, seed: number, difficulty: Difficulty, mapId?: string, skip?: ReadonlySet<string>, arrival = false): Steps<ZoneDef> {
  const seams = chainSeams(chain, id, skip);
  const m0 = d2Map(id);
  const back = seams.find((s) => step.exits.some((e) => e.at === 'prev' && e.to === s.to));
  // lot 320 (`arrival`): a zone entered by the way its map's `prev` anchor marks (the River of Flame by its way up to the City)
  const prev = arrival ? (m0?.raw as { anchors?: Record<string, [number, number]> } | undefined)?.anchors?.prev : undefined;
  const entry = back && m0 ? openingPoint(m0, back, OVERLAP - CROSS_DEPTH + 2) : prev ? { x: prev[0], y: prev[1] } : undefined;
  const z = yield* withD2FarmSteps(z0, seed, difficulty, mapId, entry);
  yield;
  // lot 314: the trees thinned out inside the border (src/data/zones/thin.ts), the same ones in the neighbours drawn beyond the seams
  const passages = (ss: readonly SeamDef[]) => ss.map((s) => ({ side: s.side, lo: s.lo, hi: s.hi }));
  const own = yield* thinTreesSteps(d2Map(z.d2Map?.id ?? ''), passages(seams));
  if (own && z.d2Map) {
    const blocked = z.d2Map.blocked.slice();
    const opaque = z.d2Map.opaque.slice();
    for (let i = 0; i < blocked.length; i++) {
      if (!own.blocked[i]) blocked[i] = 0;
      if (!own.opaque[i]) opaque[i] = 0;
    }
    z.d2Map = { ...z.d2Map, blocked, opaque, hidden: own.hidden };
  }
  for (const s of seams) {
    const t = yield* thinTreesSteps(d2Map(s.to), passages(chainSeams(chain, s.to, skip)));
    if (t) s.hidden = t.hidden;
  }
  applySeams(z, seams);
  return z;
}

/** The seams applied to a zone: listed, and the overlaps' collision made one with the neighbours' (a copy of the map's grid) */
export function applySeams(z: ZoneDef, seams: SeamDef[]): void {
  const m = d2Map(z.d2Map?.id ?? '');
  if (!m || !z.d2Map || !seams.length) return;
  let blocked = z.d2Map.blocked;
  for (const s of seams) {
    const nb = d2Map(s.to);
    if (nb) blocked = mergeOverlap(m, nb, s, blocked);
  }
  z.d2Map = { ...z.d2Map, blocked };
  z.seams = seams;
}

function anchorPoint(z: ZoneDef, name: string, to?: string): { x: number; y: number } | null {
  const m = d2Map(z.d2Map?.id ?? '');
  if (!m) return null;
  const raw = m.raw as { anchors?: Record<string, [number, number]> };
  // lot 311: an exit joined to its neighbour stands in the opening of the edge (the camp's gate, a gap of the border)
  const seam = to ? z.seams?.find((s) => s.to === to) : undefined;
  if (seam) return wide(m, openingPoint(m, seam, 2.5).x, openingPoint(m, seam, 2.5).y);
  if (name === 'prev') return wide(m, z.start.x + 3, z.start.y + 2);
  // lot 320: the maze's way on is its exit room (the map's `next` anchor), another room holding a way down
  if (name === 'ahead') {
    const n = raw.anchors?.next;
    return n ? wide(m, n[0], n[1]) : z.farAt ? wide(m, z.farAt.x - 3, z.farAt.y - 2) : null;
  }
  // the Rogue Encampment's way out is the gate of its palisade on the map's edge (owner, lot 311: "I cannot leave the camp"; it was the
  // point farthest on foot from the waypoint, a corner by the river the hero never thinks of)
  if (name === 'next' && z.id === 'a1_town') {
    const gate = openings(m).sort((a, b) => b.hi - b.lo - (a.hi - a.lo))[0];
    if (gate) {
      const p = openingPoint(m, gate, 2.5);
      return wide(m, p.x, p.y);
    }
  }
  if (name === 'next') return z.farAt ? wide(m, z.farAt.x - 3, z.farAt.y - 2) : null;
  const sp = name.match(/^special(\d+)$/);
  if (sp) {
    const l = (m.landmarks.special10 ?? [])[Number(sp[1])];
    return l ? wide(m, (l[0] + 0.5) * 2.5, (l[1] + 0.5) * 2.5) : null;
  }
  const a = raw.anchors?.[name];
  return a ? wide(m, a[0], a[1]) : null;
}

/** Zones de plein air : leurs liaisons restent des portails ; sous terre et dans les bâtiments, ce sont les escaliers dessinés par la carte */
const OUTDOORS = new Set(['a1_town', 'a1_bloodmoor', 'a1_coldplains', 'a1_stonyfield', 'a1_darkwood', 'a1_blackmarsh', 'a1_tamoe', 'a1_monastery', 'a1_cloister', 'a1_tristram', 'a1_burial']);

export function addExitsTo(z: ZoneDef, step: A1Step, byId: Record<string, { name: string }>, outdoors: Set<string>): ZoneDef {
  const used: { x: number; y: number }[] = [];
  const m = d2Map(z.d2Map?.id ?? '');
  for (const e of step.exits) {
    const target = byId[e.to];
    const forward = e.at !== 'prev' && !e.up;
    // lot 312: an exit toward a neighbour joined edge to edge is the opening itself, whatever the zones' kinds
    const edge = (outdoors.has(step.id) && outdoors.has(e.to)) || !!z.seams?.some((s) => s.to === e.to) || !!e.walk;
    // escalier : on cherche la case de passage de la carte près du point annoncé (sinon un portail visible)
    let p = anchorPoint(z, e.at, e.to);
    let stairs = false;
    if (!edge && m) {
      const direct = e.at.startsWith('special') && !!p;
      const w = direct ? p : warpNear(m, (p ?? z.start).x, (p ?? z.start).y, 40);
      if (w && (direct || !used.some((u) => Math.hypot(u.x - w.x, u.y - w.y) < 3))) {
        p = w;
        stairs = true;
      }
    }
    p ??= m ? wide(m, z.start.x + 3 + used.length * 3, z.start.y + 4) : { x: z.start.x + 3 + used.length * 3, y: z.start.y + 4 };
    used.push(p);
    const x: ExitDef = {
      x: p.x,
      y: p.y,
      kind: 'portal',
      to: `zone:${e.to}`,
      label: `${stairs ? (forward ? 'Descendre' : 'Monter') : forward ? 'Vers' : 'Retour'} : ${e.label ?? target?.name ?? e.to}`,
    };
    if (stairs) x.variant = 'stairs';
    else if (edge) x.variant = 'edge';
    else if (forward) x.variant = 'red';
    z.exits.push(x);
  }
  return z;
}

function addExits(z: ZoneDef, step: A1Step): ZoneDef {
  return addExitsTo(z, step, A1_BY_ID, OUTDOORS);
}

/** Objet de DS1 (type 2) d'une carte : position en unités du jeu ; ids de l'obj.txt de l'acte (coffre = « bank », point de passage de la ville) */
export function dsObject(m: ReturnType<typeof d2Map>, id: number): { x: number; y: number } | null {
  const objs = (m?.raw as { objects?: [number, number, number, number][] } | undefined)?.objects ?? [];
  const o = objs.find((q) => q[0] === 2 && q[1] === id);
  return o ? { x: o[2] * 2.5, y: o[3] * 2.5 } : null;
}

/**
 * Lot 314: a waypoint where the map's DS1 object stands, drawn by Diablo II's sprite of it (`variant`: its sheet, src/data/d2waypoints.ts;
 * the owner: "remove the totem on the waypoint", the game's pillar stood on the D2 stone); `fallback` on a map without one
 */
export function pushWaypoint(z: ZoneDef, m: ReturnType<typeof d2Map>, fallback: { x: number; y: number } | null, near?: { x: number; y: number }): void {
  const d = d2Waypoint(m, near ?? fallback ?? undefined);
  if (d) z.objects.push({ kind: 'waypoint', x: d.x, y: d.y, ...(d.sheet ? { variant: d.sheet } : {}) });
  else if (fallback) z.objects.push({ kind: 'waypoint', x: fallback.x, y: fallback.y });
}

/** Points de passage : à l'emplacement de l'objet du DS1 (lot 314), sinon sur l'ancre « waypoint » de la carte, sinon près de l'arrivée */
export function addWaypoint(z: ZoneDef, at?: { x: number; y: number } | null): void {
  if (!WAYPOINT_ZONES.has(z.id) || z.objects.some((o) => o.kind === 'waypoint')) return;
  const m = d2Map(z.d2Map?.id ?? '');
  const raw = m?.raw as { anchors?: Record<string, [number, number]> } | undefined;
  // lot 315: a map without its waypoint room (WAYPOINT_ROOM): the waypoint that room brings, on the walk from the entry where D2 puts it
  const room = WAYPOINT_ROOM[z.id];
  if (m && room && !d2Waypoint(m)) {
    const p = waypointOnTheWay(z, m, room.along);
    z.objects.push({ kind: 'waypoint', x: p.x, y: p.y, variant: waypointSheet(room.token, room.act) });
    return;
  }
  const a = raw?.anchors?.waypoint;
  const base = at ?? (a ? { x: a[0], y: a[1] } : { x: z.start.x + 4, y: z.start.y + 3 });
  pushWaypoint(z, m, m ? wide(m, base.x, base.y) : base, base);
}

/**
 * Lot 315: where a waypoint stands on a map without its room: on the shortest walk (sub-tiles, 4-connected) from the zone's entry to its
 * way on (the map's `next` anchor, else the far point `farAt`, else the farthest point reached) at the share `along` of it, kept 6 units
 * from both ends, moved to the nearest place reached on foot with room around it (5 × 5 sub-tiles free, else 3 × 3)
 */
export function waypointOnTheWay(z: ZoneDef, m: NonNullable<ReturnType<typeof d2Map>>, along: number): { x: number; y: number } {
  const { cols, rows, blocked } = m.grid;
  const cellOf = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v / 0.5)));
  const centre = (i: number) => ({ x: ((i % cols) + 0.5) * 0.5, y: (Math.floor(i / cols) + 0.5) * 0.5 });
  const s0 = nearestOpen(m, z.start.x, z.start.y);
  const si = cellOf(s0.y, rows) * cols + cellOf(s0.x, cols);
  const dist = new Int32Array(cols * rows).fill(-1);
  const from = new Int32Array(cols * rows).fill(-1);
  const q = new Int32Array(cols * rows);
  let h = 0;
  let t = 0;
  let far = si;
  if (!blocked[si]) {
    dist[si] = 0;
    q[t++] = si;
  }
  while (h < t) {
    const i = q[h++];
    if (dist[i] > dist[far]) far = i;
    const cx = i % cols;
    for (const j of [i - 1, i + 1, i - cols, i + cols]) {
      if (j < 0 || j >= dist.length || blocked[j] || dist[j] >= 0) continue;
      if ((j === i - 1 && cx === 0) || (j === i + 1 && cx === cols - 1)) continue;
      dist[j] = dist[i] + 1;
      from[j] = i;
      q[t++] = j;
    }
  }
  if (!t) return wide(m, z.start.x + 4, z.start.y + 3);
  // the way on: the cell reached nearest to the map's `next` anchor or the far point
  const raw = m.raw as { anchors?: Record<string, [number, number]> };
  const n = raw.anchors?.next;
  const goal = n ? { x: n[0], y: n[1] } : z.farAt;
  let gi = far;
  if (goal) {
    let bd = Infinity;
    for (let k = 0; k < t; k++) {
      const c = centre(q[k]);
      const d = Math.hypot(c.x - goal.x, c.y - goal.y);
      if (d < bd) {
        bd = d;
        gi = q[k];
      }
    }
  }
  const path: number[] = [];
  for (let i = gi; i >= 0; i = from[i]) path.push(i);
  path.reverse();
  // 6 units (12 sub-tiles) from both ends when the walk is long enough
  const lo = Math.min(12, Math.floor(path.length / 2));
  const hi = Math.max(lo, path.length - 1 - 12);
  const p0 = centre(path[Math.round(lo + (hi - lo) * Math.max(0, Math.min(1, along)))]);
  const free = (i: number, r: number) => {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    for (let v = -r; v <= r; v++)
      for (let u = -r; u <= r; u++) {
        const a = cx + u;
        const b = cy + v;
        if (a < 0 || b < 0 || a >= cols || b >= rows || blocked[b * cols + a]) return false;
      }
    return true;
  };
  for (const r of [2, 1]) {
    let best = -1;
    let bd = 12;
    for (let k = 0; k < t; k++) {
      const c = centre(q[k]);
      const d = Math.hypot(c.x - p0.x, c.y - p0.y);
      if (d < bd && free(q[k], r)) {
        bd = d;
        best = q[k];
      }
    }
    if (best >= 0) return centre(best);
  }
  return p0;
}

/** Ville : PNJ de monpreset (Akara, Charsi, Gheed, Kashya, Warriv), coffre, cube et point de passage */
function town(z: ZoneDef): ZoneDef {
  const m = d2Map('a1_town');
  const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter(([n]) => !!n);
  const at = (n: string, dx = 0, dy = 1.5) => {
    const p = presets.find((q) => q[0] === n);
    return p && m ? nearestOpen(m, p[1] + dx, p[2] + dy) : null;
  };
  z.spawns = [];
  z.objects = [];
  z.lights = [];
  z.town = true;
  const put = (kind: ObjectDef['kind'], p: { x: number; y: number } | null, id?: string) => {
    if (p) z.objects.push({ kind, x: p.x, y: p.y, ...(id ? { id } : {}) });
  };
  put('npc', at('akara'), 'akara');
  put('npc', at('charsi'), 'charsi');
  put('npc', at('gheed'), 'gheed');
  put('npc', at('kashya'), 'kashya');
  put('npc', at('warriv1'), 'warriv');
  // coffre et point de passage à leur place d'origine (objets du DS1) ; on arrive à côté du point de passage
  const bank = dsObject(m, 102);
  const wp = dsObject(m, 52);
  put('stash', bank && m ? wide(m, bank.x, bank.y + 1) : at('akara', -3, 3));
  put('cube', bank && m ? wide(m, bank.x + 3, bank.y + 2) : at('akara', 2, 3));
  pushWaypoint(z, m, wp && m ? wide(m, wp.x, wp.y + 1) : at('warriv1', 4, 2), wp ?? undefined);
  const st = wp && m ? wide(m, wp.x + 2, wp.y + 4) : null;
  if (st) z.start = st;
  return z;
}

/** Zone de l'Acte I avec ses objets de quête */
export function buildA1(id: string, seed: number, difficulty: Difficulty): ZoneDef {
  return runSteps(buildA1Steps(id, seed, difficulty));
}

/** `buildA1` in steps (lot 312: a neighbour joined edge to edge built behind the play, src/data/zones/steps.ts) */
export function* buildA1Steps(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const z = yield* buildA1Zone(id, seed, difficulty);
  yield;
  return yield* addQuestObjectsSteps(z, id);
}

function* buildA1Zone(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const step = A1_BY_ID[id];
  if (id === 'a1_tristram') {
    const z = buildTristram(seed, difficulty);
    // lot 315: Diablo II's Tristram has no waypoint (the Rush run's stays): left by its portal back to the Stony Field
    z.objects = z.objects.filter((o) => o.kind !== 'waypoint');
    z.exits.push(...addExits({ ...z, exits: [] }, step).exits);
    return z;
  }
  if (id === 'a1_countess' || id === 'a1_andariel') {
    const z = id === 'a1_countess' ? buildCountess(seed, difficulty) : buildAndariel(seed, difficulty);
    z.exits.push(...addExits({ ...z, exits: [] }, step).exits);
    return z;
  }
  const b = new ZoneBuilder(id, step.name, 72, 72, 'deadgrass', { theme: 'village', mood: 'tristram', ambient: { color: 0x40382f, level: 0.3 } });
  b.start(10, 10);
  // lot 311: a zone joined to the one before it starts in the opening the hero walks in by (its monsters kept away from it)
  const z = yield* joinedFarm(b.build(), id, step, A1_CHAINS, seed, difficulty);
  z.id = id;
  const m = d2Map(id);
  z.start = wide(m, z.start.x, z.start.y);
  // super-uniques à leur emplacement d'origine
  const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter(([n]) => !!n);
  const seen = new Set<string>();
  for (const [n, x, y] of presets) {
    const s = SUPER[n];
    // un super-unique n'existe qu'une fois : le DS1 du Champ de pierres en répète dix emplacements
    if (!s || !m || seen.has(n) || !superUniqueHere(n, id)) continue;
    seen.add(n);
    const p = nearestOpen(m, x, y);
    const sp: SpawnDef = { monster: s[0], x: p.x, y: p.y, count: 4, r: 2, rank: 'unique', uniqueName: s[1], trigger: 11 };
    z.spawns.push(sp);
  }
  yield;
  if (id === 'a1_town') return addExits(town(z), step);
  addWaypoint(z);
  yield;
  return addExits(z, step);
}

export {};
