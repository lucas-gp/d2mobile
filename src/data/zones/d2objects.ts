// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Objets interactifs des zones sur carte D2 : ceux que pose le DS1 (coffres, sarcophages, urnes, cadavres, râteliers, sanctuaires, puits, objets
 * de quête) à leur place d'origine, puis les groupes d'objets de Levels.txt (ObjGrp / ObjPrb) semés pièce par pièce comme le fait le jeu :
 * chaque pièce de 8 × 8 cases tire chacun des groupes de la zone (ObjPrb %), un objet du groupe selon ses poids (objgroup.txt), plusieurs
 * si la densité du groupe est forte (DENSITY / 40, adaptation : la formule exacte du jeu n'est pas documentée).
 */
import { Rng } from '../../core/rng';
import { d2Map, nearestOpen, type D2MapData } from '../d2map';
import { QUEST_OBJECTS } from '../quests';
import { reachFixSteps } from './d2passable';
import { runSteps, type Steps } from './steps';
import { DS1_OBJECTS, OBJ_GROUPS, ZONE_OBJ_GROUPS } from '../worldobjects';
import type { ObjectDef, ZoneDef } from '../zone-types';

/** Pièce de Diablo II : 8 cases de 2,5 unités */
const ROOM = 20;
/** Plafond par zone (lisibilité sur mobile, coût du rendu) */
const MAX_OBJECTS = 70;
/**
 * Sanctuaires et puits semés par les groupes (densité 0 dans objgroup.txt) : le jeu en limite le nombre par niveau ; sans la règle exacte,
 * au plus 4 sanctuaires et 3 puits par zone en plus de ceux du DS1 (relevés D2 : 2 à 5 sanctuaires par zone).
 */
const MAX_GROUP_SHRINES = 4;
const MAX_GROUP_WELLS = 3;

/** Genre de worldobjects.ts → objet du jeu (lot 319 : l'Arbre d'Inifuss est un objet de quête comme les autres) ; null pour un genre inconnu */
export function objectFromKind(kind: string, x: number, y: number): ObjectDef | null {
  switch (kind) {
    case 'chest':
    case 'qchest_cube':
    case 'qchest_scroll':
      return { kind: 'chest', x, y };
    case 'sarcophagus':
      return { kind: 'sarcophagus', x, y };
    case 'barrel':
      return { kind: 'barrel', x, y };
    case 'urn':
      return { kind: 'barrel', x, y, variant: 'urn' };
    case 'corpse':
      return { kind: 'barrel', x, y, variant: 'corpse' };
    case 'rack':
      return { kind: 'weaponrack', x, y };
    case 'armor':
      return { kind: 'weaponrack', x, y, variant: 'armor' };
    case 'shrine':
      return { kind: 'shrine', x, y };
    case 'shrine_health':
      return { kind: 'shrine', x, y, variant: 'health' };
    case 'shrine_mana':
      return { kind: 'shrine', x, y, variant: 'mana' };
    case 'well':
      return { kind: 'well', x, y };
    default:
      return kind.startsWith('q_') || kind.startsWith('qchest_') ? { kind: 'quest', x, y, id: kind } : null;
  }
}

/**
 * Pose les objets de la zone `key` sur la carte `m`. `cells` : sous-cases atteignables (indices de la grille), `pos` : leur centre ;
 * rien à moins de 5 unités du départ ; graine propre (le peuplement des monstres n'en dépend pas).
 */
export function placeWorldObjects(out: ZoneDef, m: D2MapData, key: string, seed: number, cells: number[], pos: (i: number) => { x: number; y: number }, start: { x: number; y: number }): void {
  runSteps(placeWorldObjectsSteps(out, m, key, seed, cells, pos, start));
}

/** `placeWorldObjects` in steps (lot 312: built behind the play, src/data/zones/steps.ts) */
export function* placeWorldObjectsSteps(
  out: ZoneDef,
  m: D2MapData,
  key: string,
  seed: number,
  cells: number[],
  pos: (i: number) => { x: number; y: number },
  start: { x: number; y: number },
): Steps<void> {
  const rng = new Rng(`d2obj:${key}:${seed}`);
  const taken: { x: number; y: number }[] = [start, ...out.objects];
  const free = (p: { x: number; y: number }, sep: number) => Math.hypot(p.x - start.x, p.y - start.y) >= 5 && !taken.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < sep);
  const push = (o: ObjectDef | null) => {
    if (!o) return;
    out.objects.push(o);
    taken.push(o);
  };
  // 1. objets du DS1
  const raw = m.raw as { act?: number; objects?: [number, number, number, number][] };
  for (const [type, id, x, y] of raw.objects ?? []) {
    if (type !== 2) continue;
    const kind = DS1_OBJECTS[`${raw.act ?? 0}:${id}`];
    if (!kind) continue;
    // objet de quête : seulement dans la zone de sa quête (la carte du Fleuve de flammes sert aussi aux fosses rouges, sans Forge)
    if (/^q_|^qchest_(staff|eye|brain|heart)/.test(kind) && !QUEST_OBJECTS.some((q) => q.id === kind && q.zone === key)) continue;
    const p = nearestOpen(m, x * 2.5, y * 2.5);
    if (!free(p, 1.2)) continue;
    push(objectFromKind(kind, p.x, p.y));
  }
  // 2. groupes d'objets de Levels.txt, pièce par pièce
  const groups = ZONE_OBJ_GROUPS[key] ?? [];
  if (!groups.length || !cells.length) return;
  const rw = Math.ceil(m.units[0] / ROOM);
  const rooms = new Map<number, number[]>();
  yield;
  let seen = 0;
  for (const i of cells) {
    if (++seen % 30000 === 0) yield;
    const p = pos(i);
    const r = Math.floor(p.x / ROOM) + Math.floor(p.y / ROOM) * rw;
    let list = rooms.get(r);
    if (!list) rooms.set(r, (list = []));
    list.push(i);
  }
  const order = [...rooms.keys()].sort((a, b) => a - b);
  let shrines = 0;
  let wells = 0;
  let done = 0;
  for (const r of order) {
    if (++done % 16 === 0) yield;
    const list = rooms.get(r)!;
    // pièce à peine effleurée par le terrain praticable : pas d'objet
    if (list.length < 60) continue;
    for (const [g, prb] of groups) {
      if (rng.int(100) >= prb) continue;
      const def = OBJ_GROUPS[g];
      if (!def) continue;
      const n = def.density > 0 ? Math.max(1, Math.round(def.density / 40)) : 1;
      for (let k = 0; k < n; k++) {
        if (out.objects.length >= MAX_OBJECTS) return;
        const kind = rng.weighted(def.ids, (e) => e[1])![0];
        if (kind.startsWith('shrine') && shrines++ >= MAX_GROUP_SHRINES) continue;
        if (kind === 'well' && wells++ >= MAX_GROUP_WELLS) continue;
        let p: { x: number; y: number } | null = null;
        for (let t = 0; t < 12 && !p; t++) {
          const q = pos(list[rng.int(list.length)]);
          if (free(q, 3)) p = q;
        }
        if (p) push(objectFromKind(kind, p.x, p.y));
      }
    }
  }
}

/**
 * Objets de quête de la zone `key` (data/quests.ts QUEST_OBJECTS) : ceux du DS1 sont déjà posés par `placeWorldObjects` ; les autres
 * (autel de la Vipère, Gidbinn, Orbe de contrainte, cages des barbares, Anya) se posent à la place que donne la carte d'origine
 * quand le DS1 l'a, sinon vers le bout de la zone, étagés entre le départ et le bout quand il y en a plusieurs.
 */
export function addQuestObjects(z: ZoneDef, key: string): ZoneDef {
  return runSteps(addQuestObjectsSteps(z, key));
}

/** `addQuestObjects` in steps (lot 312: built behind the play, src/data/zones/steps.ts) */
export function* addQuestObjectsSteps(z: ZoneDef, key: string): Steps<ZoneDef> {
  const m = z.d2Map ? d2Map(z.d2Map.id) : undefined;
  const open = (x: number, y: number) => (m ? nearestOpen(m, x, y) : { x, y });
  const far = z.farAt ?? { x: z.start.x + 12, y: z.start.y + 12 };
  const raw = m?.raw as { act?: number; objects?: [number, number, number, number][] } | undefined;
  for (const def of QUEST_OBJECTS.filter((q) => q.zone === key)) {
    yield;
    const want = def.count ?? 1;
    let have = z.objects.filter((o) => o.kind === 'quest' && o.id === def.id).length;
    // emplacement d'origine (DS1) d'un objet de ce genre
    for (const [type, id, x, y] of raw?.objects ?? []) {
      if (have >= want) break;
      if (type !== 2 || DS1_OBJECTS[`${raw?.act ?? 0}:${id}`] !== def.id) continue;
      const p = open(x * 2.5, y * 2.5);
      if (z.objects.some((o) => o.kind === 'quest' && o.id === def.id && Math.hypot(o.x - p.x, o.y - p.y) < 2)) continue;
      z.objects.push({ kind: 'quest', id: def.id, x: p.x, y: p.y });
      have++;
    }
    // emplacement de monstre du DS1 (Orbe de contrainte, Frozenstein, barbares prisonniers)
    const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter((q) => q[0] === def.preset);
    for (const [, x, y] of presets) {
      if (have >= want) break;
      const p = open(x + (def.id === 'q_anya' ? 2 : 0), y);
      z.objects.push({ kind: 'quest', id: def.id, x: p.x, y: p.y });
      have++;
    }
    for (let k = have; k < want; k++) {
      // un seul : près du bout de la zone ; plusieurs : étagés du tiers au bout, en quinconce
      const t = want === 1 ? 0.92 : 0.3 + (0.62 * k) / Math.max(1, want - 1);
      const side = want === 1 ? 0 : k % 2 ? 5 : -5;
      // sans carte (tests, zones générées) : à côté du départ, toujours praticable
      const p = m ? open(z.start.x + (far.x - z.start.x) * t + side, z.start.y + (far.y - z.start.y) * t - side) : { x: z.start.x + 1.5 + k, y: z.start.y + 1.5 };
      z.objects.push({ kind: 'quest', id: def.id, x: p.x, y: p.y });
    }
  }
  yield;
  yield* reachFixSteps(z);
  return z;
}
