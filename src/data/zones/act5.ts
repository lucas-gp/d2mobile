/**
 * Campagne de l'Acte V : Harrogath, Bloody Foothills, Rigid Highlands, Arreat Plateau, cavernes de glace (Crystalline Passage → Frozen River → Glacial Trail → Drifter Cavern ;
 * Frozen Tundra → Ancient's Way → Icy Cellar), Arreat Summit (les Anciens), temple de Nihlathak et ses Halls, Donjon de la Pierre-Monde et Trône de la Destruction (Baal).
 * Zones de farm d'origine (Pindleskin, Nihlathak, Anciens, Baal) reprises telles quelles dans la chaîne ; mêmes règles que les autres campagnes.
 */
import { superUniqueHere } from '../superunique-zones';
import { addQuestObjectsSteps } from './d2objects';
import { runSteps, type Steps } from './steps';
import { d2Map, nearestOpen } from '../d2map';
import type { Difficulty } from '../types';
import type { SpawnDef, ZoneDef } from '../zone-types';
import { SUPER_UNIQUES } from '../superuniques';
import { ZoneBuilder } from './builder';
import { withD2Farm } from './d2farm';
import { addExitsTo, addWaypoint, joinedFarm, S, type A1Step } from './act1';
import { buildHarrogath } from './harrogath';
import { buildPindleskin, buildNihlathak, buildAncients } from './farm';
import { buildBaal } from './baal';

export type A5Step = A1Step;

export const ACT5_STEPS: A5Step[] = [
  S('a5_town', 'Harrogath', [{ to: 'a5_foothills', at: 'next' }], false),
  S('a5_foothills', 'Bloody Foothills', [
    { to: 'a5_town', at: 'prev' },
    { to: 'a5_highlands', at: 'next' },
  ]),
  // lot 320: Nihlathak's Temple is no longer an exit of the Frigid Highlands: Anya's red portal in Harrogath leads there once she is free
  // (src/sim/game.ts, `QUEST_PORTALS`); Abaddon's red portal stands on the highlands' hell warp (the map's `temple` piece, Siege/HellWrpW)
  S('a5_highlands', 'Hautes terres rigides', [
    { to: 'a5_foothills', at: 'prev' },
    { to: 'a5_plateau', at: 'next' },
    { to: 'a5_abaddon', at: 'temple', label: 'Abaddon' },
  ]),
  // lot 320 (Diablo II): the way up the mountain goes under it, the Arreat Plateau → the Crystalline Passage → the Glacial Trail → the
  // Frozen Tundra → the Ancients' Way → the Arreat Summit; the Frozen River, the Drifter Cavern and the Icy Cellar are dead ends below
  S('a5_plateau', "Plateau d'Arreat", [
    { to: 'a5_highlands', at: 'prev' },
    { to: 'a5_crystal1', at: 'cave', label: 'Passage cristallin' },
    { to: 'a5_acheron', at: 'redportal', label: "Fosse d'Achéron" },
  ]),
  S('a5_crystal1', 'Passage cristallin', [
    { to: 'a5_plateau', at: 'prev' },
    { to: 'a5_river', at: 'down' },
    { to: 'a5_crystal2', at: 'ahead' },
  ]),
  S('a5_river', 'Rivière gelée', [{ to: 'a5_crystal1', at: 'prev' }]),
  S('a5_crystal2', 'Piste glaciaire', [
    { to: 'a5_crystal1', at: 'prev' },
    { to: 'a5_echo', at: 'down' },
    { to: 'a5_tundra', at: 'ahead', up: true },
  ]),
  S('a5_echo', 'Caverne des Vagabonds', [{ to: 'a5_crystal2', at: 'prev' }]),
  S('a5_tundra', 'Toundra gelée', [
    { to: 'a5_crystal2', at: 'cave2', label: 'Piste glaciaire' },
    { to: 'a5_glacial1', at: 'cave', label: 'Voie des Anciens' },
    { to: 'a5_infernal', at: 'redportal', label: 'Fosse infernale' },
  ]),
  // portails rouges des hautes terres (Levels 125-127, « Hell1-3 ») : labyrinthes de lave ; leurs DS1 ne sont pas importés, ils reprennent la carte du Fleuve de flammes
  S('a5_abaddon', 'Abaddon', [{ to: 'a5_highlands', at: 'prev' }]),
  S('a5_acheron', "Fosse d'Achéron", [{ to: 'a5_plateau', at: 'prev' }]),
  S('a5_infernal', 'Fosse infernale', [{ to: 'a5_tundra', at: 'prev' }]),
  S('a5_glacial1', 'Voie des Anciens', [
    { to: 'a5_tundra', at: 'prev' },
    { to: 'a5_glacial2', at: 'down', label: 'Cave glacée' },
    { to: 'a5_summit', at: 'ahead', label: "Sommet d'Arreat", up: true },
  ]),
  S('a5_glacial2', 'Cave glacée', [{ to: 'a5_glacial1', at: 'prev' }]),
  S(
    'a5_summit',
    "Sommet d'Arreat",
    [
      { to: 'a5_glacial1', at: 'prev' },
      { to: 'a5_keep1', at: 'next', label: 'Donjon de la Pierre-Monde' },
    ],
    false,
  ),
  // lot 320: left by its red portal back to Harrogath (Diablo II), not by the highlands
  S(
    'a5_temple',
    'Temple de Nihlathak',
    [
      { to: 'a5_town', at: 'prev', label: 'Harrogath' },
      { to: 'a5_anguish', at: 'next' },
    ],
    false,
  ),
  S('a5_anguish', "Halls de l'Angoisse", [
    { to: 'a5_temple', at: 'prev' },
    { to: 'a5_death', at: 'next' },
  ]),
  S('a5_death', 'Halls de la Douleur', [
    { to: 'a5_anguish', at: 'prev' },
    { to: 'a5_vaught', at: 'next' },
  ]),
  S('a5_vaught', 'Halls de Vaught', [{ to: 'a5_death', at: 'prev' }], false),
  S('a5_keep1', 'Donjon de la Pierre-Monde, niveau 1', [
    { to: 'a5_summit', at: 'prev' },
    { to: 'a5_keep2', at: 'next' },
  ]),
  S('a5_keep2', 'Donjon de la Pierre-Monde, niveau 2', [
    { to: 'a5_keep1', at: 'prev' },
    { to: 'a5_keep3', at: 'next' },
  ]),
  S('a5_keep3', 'Donjon de la Pierre-Monde, niveau 3', [
    { to: 'a5_keep2', at: 'prev' },
    { to: 'a5_throne', at: 'next', label: 'Trône de la Destruction' },
  ]),
  S('a5_throne', 'Trône de la Destruction', [{ to: 'a5_keep3', at: 'prev' }], false),
];
export const A5_BY_ID: Record<string, A5Step> = Object.fromEntries(ACT5_STEPS.map((s) => [s.id, s]));
const OUTDOORS = new Set(['a5_town', 'a5_foothills', 'a5_highlands', 'a5_plateau', 'a5_tundra']);
/**
 * Lot 312: Act V's slopes joined edge to edge as in Diablo II (src/data/zones/seams.ts): the Bloody Foothills, the Frigid Highlands, the
 * Arreat Plateau (planned from Harrogath's gate; Harrogath itself stays joined by its portal: its town is the Rush menu's Harrogath, a
 * zone of its own; the Crystalline Passage beyond the plateau is a cave's entrance in the game)
 */
export const A5_CHAIN = ['harrogath', 'a5_foothills', 'a5_highlands', 'a5_plateau'];
const A5_PORTAL = new Set(['harrogath']);

/** La campagne a besoin de toutes les cartes importées */
export const act5Available = (): boolean =>
  ACT5_STEPS.every((s) => ['a5_town', 'a5_summit', 'a5_temple', 'a5_vaught', 'a5_throne'].includes(s.id) || !!d2Map(RED_PITS.has(s.id) ? 'river' : s.id)) && !!d2Map('harrogath') && !!d2Map('baal');

/** Fosses rouges de l'Acte V : zones sans carte propre, sur la carte du Fleuve de flammes (même jeu de tuiles de lave) */
const RED_PITS = new Set(['a5_abaddon', 'a5_acheron', 'a5_infernal']);

/** Zones reprises des runs d'origine : constructeur et identifiant de zone (pour le plan de peuplement) */
const REUSED: Record<string, (seed: number, d: Difficulty) => ZoneDef> = {
  a5_summit: buildAncients,
  a5_temple: buildPindleskin,
  a5_vaught: buildNihlathak,
  a5_throne: buildBaal,
};

/** Zone de l'Acte V avec ses objets de quête */
export function buildA5(id: string, seed: number, difficulty: Difficulty): ZoneDef {
  return runSteps(buildA5Steps(id, seed, difficulty));
}

/** `buildA5` in steps (lot 312: a neighbour joined edge to edge built behind the play, src/data/zones/steps.ts) */
export function* buildA5Steps(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const z = yield* buildA5Zone(id, seed, difficulty);
  yield;
  return yield* addQuestObjectsSteps(z, id);
}

function* buildA5Zone(id: string, seed: number, difficulty: Difficulty): Steps<ZoneDef> {
  const step = A5_BY_ID[id];
  if (id === 'a5_town') {
    const z = buildHarrogath(seed);
    z.exits.push(...addExitsTo({ ...z, exits: [] }, step, A5_BY_ID, OUTDOORS).exits);
    return z;
  }
  if (REUSED[id]) {
    const z = REUSED[id](seed, difficulty);
    z.exits.push(...addExitsTo({ ...z, exits: [] }, step, A5_BY_ID, OUTDOORS).exits);
    // lot 320: Nihlathak's Temple's red portal back to Harrogath, the act's town (as the waypoint's), not the Harrogath of the campaign's run
    if (id === 'a5_temple') for (const e of z.exits) if (e.to === 'zone:a5_town') Object.assign(e, { to: 'town', variant: 'red', label: 'Retour : Harrogath' });
    return z;
  }
  const pit = RED_PITS.has(id);
  const b = new ZoneBuilder(id, step.name, 72, 72, pit ? 'hellstone' : 'snow', {
    theme: 'village',
    mood: pit ? 'chaos' : 'tristram',
    ambient: pit ? { color: 0x402020, level: 0.3 } : { color: 0x2a3040, level: 0.32 },
  });
  b.start(10, 10);
  const z = A5_CHAIN.includes(id) ? yield* joinedFarm(b.build(), id, step, A5_CHAIN, seed, difficulty, undefined, A5_PORTAL) : withD2Farm(b.build(), seed, difficulty, pit ? 'river' : undefined);
  z.id = id;
  const m = d2Map(id);
  const presets = ((m?.raw as { presets?: [string, number, number][] } | undefined)?.presets ?? []).filter(([n]) => !!n);
  const seen = new Set<string>();
  for (const [n, x, y] of presets) {
    const s = SUPER_UNIQUES[n];
    if (!s || !m || seen.has(n) || !superUniqueHere(n, id)) continue;
    seen.add(n);
    const p = nearestOpen(m, x, y);
    const sp: SpawnDef = { monster: s[0], x: p.x, y: p.y, count: 4, r: 2, rank: 'unique', uniqueName: s[1], trigger: 11 };
    z.spawns.push(sp);
  }
  // « siege boss » de monpreset (Bloody Foothills) : Shenk le Contremaître (Siège d'Harrogath)
  for (const sp of z.spawns) if (sp.uniqueName === 'Siege Boss') Object.assign(sp, { monster: 'shenk', uniqueName: undefined, rank: 'boss', count: 1, r: 0 });
  addWaypoint(z);
  return addExitsTo(z, step, A5_BY_ID, OUTDOORS);
}
