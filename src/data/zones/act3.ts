// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Campagne de l'Acte III : Port de Kurast, jungle (Spider Forest → Great Marsh → Flayer Jungle), Kurast (Lower → Bazaar → Upper → Causeway), Travincal, Durance de la Haine
 * (Mephisto) et les donjons de Levels.txt (grottes des araignées, fosses et donjons des Flayers, égouts, temples). Mêmes règles que les autres campagnes.
 */
import { superUniqueHere } from '../superunique-zones';
import { addQuestObjectsSteps } from './d2objects';
import { runSteps, type Steps } from './steps';
import { d2Map, nearestOpen } from '../d2map';
import type { Difficulty } from '../types';
import type { ObjectDef, SpawnDef, ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { withD2Farm } from './d2farm';
import { type A1Step, addExitsTo, addWaypoint, dsObject, pushWaypoint, joinedFarm, S, wide } from './act1';
import { buildMephisto } from './farm';

export type A3Step = A1Step;

export const ACT3_STEPS: A3Step[] = [
  S('a3_town', 'Port de Kurast', [{ to: 'a3_spider', at: 'spider' }], false),
  // lot 320 (Diablo II): the Arachnid Lair and the Spider Cavern are two entrances of the Spider Forest; the Swampy Pit is in the Flayer
  // Jungle, beside the Flayer Dungeon; the Great Marsh has none
  S('a3_spider', 'Forêt des araignées', [
    { to: 'a3_town', at: 'prev' },
    { to: 'a3_marsh', at: 'next' },
    { to: 'a3_cave1', at: 'cave', label: 'Grotte des araignées' },
    { to: 'a3_cave2', at: 'cave2', label: 'Caverne des araignées' },
  ]),
  S('a3_marsh', 'Grand marais', [
    { to: 'a3_spider', at: 'prev' },
    { to: 'a3_jungle', at: 'next' },
  ]),
  S('a3_jungle', 'Jungle des Flayers', [
    { to: 'a3_marsh', at: 'prev' },
    { to: 'a3_lower', at: 'next' },
    { to: 'a3_flayer1', at: 'cave', label: 'Donjon des Flayers' },
    { to: 'a3_pit1', at: 'cave2', label: 'Fosse marécageuse' },
  ]),
  S('a3_lower', 'Kurast inférieure', [
    { to: 'a3_jungle', at: 'prev' },
    { to: 'a3_bazaar', at: 'next' },
  ]),
  S('a3_bazaar', 'Bazar de Kurast', [
    { to: 'a3_lower', at: 'prev' },
    { to: 'a3_upper', at: 'next' },
    { to: 'a3_sewer1', at: 'sewer', label: 'Égouts' },
    { to: 'a3_temple1', at: 'temple', label: 'Temple en ruine' },
    { to: 'a3_temple2', at: 'temple2', label: 'Fane abandonnée' },
  ]),
  S('a3_upper', 'Kurast supérieure', [
    { to: 'a3_bazaar', at: 'prev' },
    { to: 'a3_causeway', at: 'next' },
    { to: 'a3_temple3', at: 'temple', label: 'Reliquaire oublié' },
    { to: 'a3_temple4', at: 'temple2', label: 'Temple oublié' },
  ]),
  S('a3_causeway', 'Chaussée de Kurast', [
    { to: 'a3_upper', at: 'prev' },
    { to: 'a3_travincal', at: 'next' },
    { to: 'a3_temple5', at: 'temple', label: 'Fane en ruine' },
    { to: 'a3_temple6', at: 'temple2', label: 'Reliquaire désaffecté' },
  ]),
  S('a3_travincal', 'Travincal', [
    { to: 'a3_causeway', at: 'prev' },
    { to: 'a3_durance1', at: 'next', label: 'Durance de la Haine' },
  ]),
  S('a3_durance1', 'Durance de la Haine, niveau 1', [
    { to: 'a3_travincal', at: 'prev' },
    { to: 'a3_durance2', at: 'next' },
  ]),
  S('a3_durance2', 'Durance de la Haine, niveau 2', [
    { to: 'a3_durance1', at: 'prev' },
    { to: 'a3_durance3', at: 'next' },
  ]),
  S('a3_durance3', 'Durance de la Haine, niveau 3', [{ to: 'a3_durance2', at: 'prev' }], false),
  S('a3_cave1', 'Grotte des araignées', [{ to: 'a3_spider', at: 'prev' }]),
  S('a3_cave2', 'Caverne des araignées', [{ to: 'a3_spider', at: 'prev' }]),
  S('a3_pit1', 'Fosse marécageuse, niveau 1', [
    { to: 'a3_jungle', at: 'prev' },
    { to: 'a3_pit2', at: 'next' },
  ]),
  S('a3_pit2', 'Fosse marécageuse, niveau 2', [
    { to: 'a3_pit1', at: 'prev' },
    { to: 'a3_pit3', at: 'next' },
  ]),
  S('a3_pit3', 'Fosse marécageuse, niveau 3', [{ to: 'a3_pit2', at: 'prev' }]),
  S('a3_flayer1', 'Donjon des Flayers, niveau 1', [
    { to: 'a3_jungle', at: 'prev' },
    { to: 'a3_flayer2', at: 'next' },
  ]),
  S('a3_flayer2', 'Donjon des Flayers, niveau 2', [
    { to: 'a3_flayer1', at: 'prev' },
    { to: 'a3_flayer3', at: 'next' },
  ]),
  S('a3_flayer3', 'Donjon des Flayers, niveau 3', [{ to: 'a3_flayer2', at: 'prev' }]),
  S('a3_sewer1', 'Égouts, niveau 1', [
    { to: 'a3_bazaar', at: 'prev' },
    { to: 'a3_sewer2', at: 'next' },
  ]),
  S('a3_sewer2', 'Égouts, niveau 2', [{ to: 'a3_sewer1', at: 'prev' }]),
  S('a3_temple1', 'Temple en ruine', [{ to: 'a3_bazaar', at: 'prev' }]),
  S('a3_temple2', 'Fane abandonnée', [{ to: 'a3_bazaar', at: 'prev' }]),
  S('a3_temple3', 'Reliquaire oublié', [{ to: 'a3_upper', at: 'prev' }]),
  S('a3_temple4', 'Temple oublié', [{ to: 'a3_upper', at: 'prev' }]),
  S('a3_temple5', 'Fane en ruine', [{ to: 'a3_causeway', at: 'prev' }]),
  S('a3_temple6', 'Reliquaire désaffecté', [{ to: 'a3_causeway', at: 'prev' }]),
];
const A3_BY_ID: Record<string, A3Step> = Object.fromEntries(ACT3_STEPS.map((s) => [s.id, s]));
const OUTDOORS = new Set(['a3_town', 'a3_spider', 'a3_marsh', 'a3_jungle', 'a3_lower', 'a3_bazaar', 'a3_upper', 'a3_causeway', 'a3_travincal']);
/**
 * Lot 312: Act III's jungle and city joined edge to edge as in Diablo II (src/data/zones/seams.ts), in the order the hero walks them: the
 * Kurast Docks, the Spider Forest, the Great Marsh, the Flayer Jungle, Lower Kurast, the Kurast Bazaar, Upper Kurast, the Kurast Causeway,
 * Travincal. Lot 320: Kurast walked north through Diablo II's gates (the importer puts them in the maps' borders, `gateN` / `gateS`): the
 * Bazaar, Upper Kurast and the Causeway are no longer joined by portals
 */
export const A3_CHAIN = ['a3_town', 'a3_spider', 'a3_marsh', 'a3_jungle', 'a3_lower', 'a3_bazaar', 'a3_upper', 'a3_causeway', 'a3_travincal'];

/** La campagne a besoin de toutes les cartes importées */
export const act3Available = (): boolean => ACT3_STEPS.every((s) => s.id === 'a3_durance3' || !!d2Map(s.id)) && !!d2Map('mephisto');

/** Super-uniques de monpreset.txt (Acte III) : [monstre du jeu, nom] */
const SUPER: Record<string, [string, string]> = {
  stormtree: ['thornhulk', 'Stormtree'],
  'witch doctor endugu': ['fetish_shaman', 'Witch Doctor Endugu'],
  'sarina the battlemaid': ['zealot', 'Battlemaid Sarina'],
  'icehawk riftwing': ['bat_demon', 'Icehawk Riftwing'],
  'web mage the burning': ['arach', 'Web Mage the Burning'],
  'sszark the burning': ['claw_viper', 'Sszark the Burning'],
  'bremm sparkfist': ['council_member', 'Bremm Sparkfist'],
  'maffer dragonhand': ['council_member', 'Maffer Dragonhand'],
  'wyand voidfinger': ['council_member', 'Wyand Voidfinger'],
  'toorc icefist': ['council_member', 'Toorc Icefist'],
  'ismail vilehand': ['council_member', 'Ismail Vilehand'],
  'geleb flamefinger': ['council_member', 'Geleb Flamefinger'],
  gidbinn: ['fetish', 'Gidbinn'],
};

/** Ville : PNJ de monpreset (Ormus, Alkor, Asheara, Natalya, Meshif, Cain, Hratli), coffre, cube et point de passage */
function town(z: ZoneDef): ZoneDef {
  const m = d2Map('a3_town');
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
  for (const [preset, id] of [
    ['ormus', 'ormus'],
    ['alkor', 'alkor'],
    ['asheara', 'asheara'],
    ['natalya', 'natalya'],
    ['meshif2', 'meshif3'],
    ['cain3', 'cain3'],
  ] as const)
    put('npc', at(preset), id);
  put('npc', at('ormus', 2.5, 2.5), 'hratli');
  const bank = dsObject(m, 34);
  const wp = dsObject(m, 1);
  put('stash', bank && m ? wide(m, bank.x, bank.y + 1) : at('ormus', -3, 3));
  put('cube', bank && m ? wide(m, bank.x + 3, bank.y + 2) : at('ormus', 3, 3));
  pushWaypoint(z, m, wp && m ? wide(m, wp.x, wp.y + 1) : at('meshif2', 4, 2), wp ?? undefined);
  const st = wp && m ? wide(m, wp.x + 2, wp.y + 4) : at('ormus', -2, 4);
  if (st) z.start = st;
  return z;
}

/** Zone de l'Acte III avec ses objets de quête */
export function buildA3(id: string, seed: number, difficulty: Difficulty): ZoneDef {
  return runSteps(buildA3Steps(id, seed, difficulty));
}

/** `buildA3` in steps (lot 312: a neighbour joined edge to edge built behind the play, src/data/zones/steps.ts) */
export function* buildA3Steps(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const z = yield* buildA3Zone(id, seed, difficulty);
  yield;
  return yield* addQuestObjectsSteps(z, id);
}

function* buildA3Zone(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const step = A3_BY_ID[id];
  if (id === 'a3_durance3') {
    const z = buildMephisto(seed, difficulty);
    const m = d2Map('mephisto');
    const p = m ? wide(m, z.start.x + 3, z.start.y + 2) : z.start;
    z.exits.push({ x: p.x, y: p.y, kind: 'portal', to: 'zone:a3_durance2', label: 'Retour : Durance de la Haine, niveau 2' });
    return z;
  }
  const b = new ZoneBuilder(id, step.name, 72, 72, 'deadgrass', { theme: 'village', mood: 'tristram', ambient: { color: 0x2c3a28, level: 0.3 } });
  b.start(10, 10);
  const z = A3_CHAIN.includes(id) ? yield* joinedFarm(b.build(), id, step, A3_CHAIN, seed, difficulty) : withD2Farm(b.build(), seed, difficulty);
  z.id = id;
  const m = d2Map(id);
  if (m) z.start = wide(m, z.start.x, z.start.y);
  const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter(([n]) => !!n);
  const seen = new Set<string>();
  for (const [n, x, y] of presets) {
    const s = SUPER[n];
    if (!s || !m || seen.has(n) || !superUniqueHere(n, id)) continue;
    seen.add(n);
    const p = nearestOpen(m, x, y);
    const sp: SpawnDef = { monster: s[0], x: p.x, y: p.y, count: 4, r: 2, rank: 'unique', uniqueName: s[1], trigger: 11 };
    z.spawns.push(sp);
  }
  if (id !== 'a3_town') addWaypoint(z);
  if (id === 'a3_town') return addExitsTo(town(z), step, A3_BY_ID, OUTDOORS);
  return addExitsTo(z, step, A3_BY_ID, OUTDOORS);
}
