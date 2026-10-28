// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Campagne de l'Acte IV : Forteresse du Pandémonium → Marches extérieures → Plaines du désespoir → Cité des damnés → Fleuve de flammes (Héphasto) → Sanctuaire du Chaos.
 * Chaque zone est une carte D2 (assemblée de salles pour les zones de plein air) avec ses monstres de Levels.txt. Sans les cartes importées, la campagne n'est pas
 * jouable (le menu la masque).
 *
 * Lot 320 (audit 2.13, the owner: "the exits are invisible, at the start and at the farthest point"): Act IV walked as in Diablo II. The
 * Fortress's gate, the Outer Steppes, the Plains of Despair and the City of the Damned are joined edge to edge (src/data/zones/seams.ts, the
 * importer's open cliffs `Border<n>o` and the Fortress's mesa); the City's way down to the River of Flame is its warp (stairs, the River's
 * way up its WarpMesa room); the River's bridge runs north into the Chaos Sanctuary's entry, joined edge to edge too.
 */
import { addQuestObjectsSteps } from './d2objects';
import { runSteps, type Steps } from './steps';
import { d2Map, nearestOpen } from '../d2map';
import type { Difficulty } from '../types';
import type { ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { buildChaos } from './chaos';
import { addExitsTo, addWaypoint, applySeams, dsObject, joinedFarm, pushWaypoint, S, type A1Step } from './act1';
import { chainSeams, CROSS_DEPTH, OVERLAP, openingPoint } from './seams';

export type A4Step = A1Step;

export const ACT4_STEPS: A4Step[] = [
  S('a4_fortress', 'Forteresse du Pandémonium', [{ to: 'a4_steppes', at: 'next' }], false),
  S('a4_steppes', 'Marches extérieures', [
    { to: 'a4_fortress', at: 'prev' },
    { to: 'a4_plains', at: 'next' },
  ]),
  S('a4_plains', 'Plaines du désespoir', [
    { to: 'a4_steppes', at: 'prev' },
    { to: 'a4_city', at: 'next' },
  ]),
  S('a4_city', 'Cité des damnés', [
    { to: 'a4_plains', at: 'prev' },
    { to: 'a4_river', at: 'ahead', label: 'Fleuve de flammes' },
  ]),
  S('a4_river', 'Fleuve de flammes', [
    { to: 'a4_city', at: 'prev', label: 'Cité des damnés' },
    { to: 'a4_chaos', at: 'chaos', label: 'Sanctuaire du Chaos', walk: true },
  ]),
  S('a4_chaos', 'Sanctuaire du Chaos', [{ to: 'a4_river', at: 'prev' }], false),
];
const A4_BY_ID: Record<string, A4Step> = Object.fromEntries(ACT4_STEPS.map((s) => [s.id, s]));
/** Zones de plein air : leurs liaisons sans jointure restent des passages invisibles au bord ; la Cité descend au Fleuve par son escalier */
const OUTDOORS = new Set(['a4_fortress', 'a4_steppes', 'a4_plains', 'a4_city']);

/**
 * Lot 320: Act IV's zones joined edge to edge, in the order the hero walks them: the Fortress to the City of the Damned, then (below the
 * City's warp) the River of Flame and the Chaos Sanctuary
 */
export const A4_CHAINS: readonly (readonly string[])[] = [
  ['a4_fortress', 'a4_steppes', 'a4_plains', 'a4_city'],
  ['a4_river', 'a4_chaos'],
];

/** La campagne a besoin des cartes importées */
export const act4Available = (): boolean => ACT4_STEPS.every((s) => s.id === 'a4_chaos' || !!d2Map(s.id)) && !!d2Map('chaos');

/** Lot 320: the Campaign's Chaos Sanctuary is drawn on its own map (`a4_chaos`: its entry reaching the edge the bridge comes to), else on the Rush's */
const chaosMap = (): string => (d2Map('a4_chaos') ? 'a4_chaos' : 'chaos');

/** Ville de l'Acte IV : aucun monstre ; PNJ aux emplacements d'origine (monpreset : Jamella, Halbu, Tyrael, Cain), coffre, cube et point de passage */
function fortress(z: ZoneDef): ZoneDef {
  const m = d2Map('a4_fortress');
  const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter(([n]) => !!n);
  const at = (n: string, dx = 0, dy = 0) => {
    const p = presets.find((q) => q[0] === n);
    return p && m ? nearestOpen(m, p[1] + dx, p[2] + dy) : null;
  };
  z.spawns = [];
  z.objects = [];
  z.lights = [];
  z.town = true;
  const put = (kind: 'npc' | 'stash' | 'cube' | 'waypoint', p: { x: number; y: number } | null, id?: string) => {
    if (p) z.objects.push({ kind, x: p.x, y: p.y, ...(id ? { id } : {}) });
  };
  put('npc', at('jamella', 0, 1.5), 'jamella');
  put('npc', at('halbu', 0, 1.5), 'halbu');
  put('npc', at('tyrael2', 1.5, 1.5), 'tyrael');
  put('npc', at('cain4', 1.5, 1.5), 'cain');
  const bank = dsObject(m, 2);
  const wp = dsObject(m, 52);
  put('stash', bank && m ? nearestOpen(m, bank.x, bank.y + 1) : at('jamella', -3, 1));
  put('cube', bank && m ? nearestOpen(m, bank.x + 2.5, bank.y + 2) : at('jamella', 3, 2));
  pushWaypoint(z, m, wp && m ? nearestOpen(m, wp.x, wp.y + 1) : at('tyrael2', 4, 3), wp ?? undefined);
  const st = wp && m ? nearestOpen(m, wp.x + 2, wp.y + 4) : null;
  if (st) z.start = st;
  return z;
}

/** Zone de l'Acte IV avec ses objets de quête */
export function buildA4(id: string, seed: number, difficulty: Difficulty): ZoneDef {
  return runSteps(buildA4Steps(id, seed, difficulty));
}

/** `buildA4` in steps (lot 320: a neighbour joined edge to edge built behind the play, src/data/zones/steps.ts) */
export function* buildA4Steps(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const z = yield* buildA4Zone(id, seed, difficulty);
  yield;
  return yield* addQuestObjectsSteps(z, id);
}

function* buildA4Zone(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const step = A4_BY_ID[id];
  if (id === 'a4_chaos') {
    // même sanctuaire que la run, sur sa carte de campagne : on y entre en marchant depuis le pont du Fleuve de flammes
    const map = chaosMap();
    const z = buildChaos(seed, difficulty, map);
    z.id = 'a4_chaos';
    const m = d2Map(map);
    const seams = map === 'a4_chaos' ? chainSeams(A4_CHAINS, id) : [];
    const back = seams.find((s) => s.to === 'a4_river');
    if (back && m) z.start = nearestOpen(m, openingPoint(m, back, OVERLAP - CROSS_DEPTH + 2).x, openingPoint(m, back, OVERLAP - CROSS_DEPTH + 2).y);
    applySeams(z, seams);
    yield;
    if (!back) {
      // sans la carte de campagne : le passage du retour au départ, comme avant
      const p = m ? nearestOpen(m, z.start.x + 3, z.start.y - 4) : { x: z.start.x, y: z.start.y };
      z.exits.push({ x: p.x, y: p.y, kind: 'portal', to: 'zone:a4_river', label: `Retour : ${A4_BY_ID.a4_river.name}` });
      return z;
    }
    return addExitsTo(z, step, A4_BY_ID, OUTDOORS);
  }
  const b = new ZoneBuilder(id, step.name, 72, 72, 'hellstone', { theme: 'keep', mood: 'chaos', ambient: { color: 0x40201a, level: 0.26 } });
  b.start(10, 10);
  // Héphasto garde le fond du labyrinthe de lave
  if (id === 'a4_river') b.spawn({ monster: 'hephasto', x: 60, y: 60, count: 1, r: 0, rank: 'boss', trigger: 9 });
  if (id === 'a4_plains') b.spawn({ monster: 'izual', x: 60, y: 60, count: 1, r: 0, rank: 'boss', trigger: 9 });
  // the River of Flame starts at its way up to the City (its map's `prev`), Hephasto at the forge, the walk's far end
  const z = yield* joinedFarm(b.build(), id, step, A4_CHAINS, seed, difficulty, undefined, undefined, id === 'a4_river');
  z.id = id;
  // lot 320: Hephasto at his forge, where monpreset.txt puts him ("the feature creep"), the bridge being as far from the arrival
  const m = d2Map(id);
  const forge = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).find(([n]) => n === 'the feature creep');
  const heph = z.spawns.find((sp) => sp.monster === 'hephasto');
  if (id === 'a4_river' && m && forge && heph) Object.assign(heph, nearestOpen(m, forge[1], forge[2]));
  yield;
  if (id === 'a4_fortress') return addExitsTo(fortress(z), step, A4_BY_ID, OUTDOORS);
  addWaypoint(z);
  return addExitsTo(z, step, A4_BY_ID, OUTDOORS);
}

export {};
