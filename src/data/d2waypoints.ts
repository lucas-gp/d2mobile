// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Lot 314 (owner: "remove the totem on the waypoint"): Diablo II's waypoints are objects of their DS1 (type 2), drawn by their own sprite
 * (data\global\objects\<token>: the stone and its glow), not by the map's tiles (but Act V's, whose stone is in the `waypt` tiles). The DS1
 * object's (act, id) gives the line of objects.txt by obj.txt (not in the archives: the table below, read once from it), its token the
 * sprite. The game's waypoint stands where the DS1 put it and is drawn by that sprite, sheet `obj_wp_<token>_a<act>`.
 */
import type { D2MapData } from './d2map';

/** (act, DS1 object id) -> token of objects.txt ("waypoint" lines of obj.txt, LoD 1.13c) */
const TOKEN: Record<number, Record<number, string>> = {
  1: { 37: 'wp', 52: 'wp', 53: 'wn' },
  2: { 10: 'wm', 88: 'w7', 115: 'qm', 134: 'yi' },
  3: { 1: 'wz', 83: 'qm', 84: 'ql' },
  4: { 0: 'wv', 52: 'yg' },
  5: { 23: 'yy', 101: '8y', 102: '5a', 103: '5a', 118: '5a', 119: '5a', 120: '5a', 124: '3p' },
};

/** The sheets exported (tools/d2import/game-map.ts): the tokens of the waypoints our maps hold, by act (palette) */
export const WAYPOINT_SHEETS: readonly { token: string; act: number }[] = [
  { token: 'wp', act: 1 },
  { token: 'wn', act: 1 },
  { token: 'wm', act: 2 },
  { token: 'w7', act: 2 },
  { token: 'qm', act: 2 },
  { token: 'wz', act: 3 },
  { token: 'yg', act: 4 },
  { token: '5a', act: 5 },
  // lot 315: the waypoints of zones whose maps hold no waypoint room (WAYPOINT_AT below): the Arcane Sanctuary's, the Durance's, the
  // Act IV mesa's and lava's, the Worldstone Keep's (tokens of their rooms in lvlprest.txt, by obj.txt)
  { token: 'yi', act: 2 },
  { token: 'ql', act: 3 },
  { token: 'wv', act: 4 },
  { token: '8y', act: 5 },
];

export const waypointSheet = (token: string, act: number): string => `obj_wp_${token}_a${act}`;

/**
 * Lot 315 (owner: "add and activate the waypoints in the zones that must have one, as in the real Diablo"): the zones of Diablo II with a
 * waypoint (Levels.txt `Waypoint`) whose map, assembled from its rooms (tools/d2import), holds no waypoint room: the waypoint that room
 * would bring (its object's token in lvlprest.txt's `… Waypoint` presets, by obj.txt) and where D2 puts that room, as the share of the walk
 * from the zone's entry to its way on (`along`: the Arcane Sanctuary's at its centre where the hero arrives, the City of the Damned's by
 * the way down to the River of Flame, the River's by its bridge from the City, the dungeons' within them)
 */
export const WAYPOINT_ROOM: Readonly<Record<string, { token: string; act: number; along: number }>> = {
  a1_jail1: { token: 'wn', act: 1, along: 0.5 },
  a2_halls2: { token: 'wm', act: 2, along: 0.5 },
  a2_arcane: { token: 'yi', act: 2, along: 0 },
  a3_lower: { token: 'wz', act: 3, along: 0.5 },
  a3_upper: { token: 'wz', act: 3, along: 0.5 },
  a3_durance2: { token: 'ql', act: 3, along: 0.5 },
  a4_city: { token: 'wv', act: 4, along: 0.9 },
  a4_river: { token: 'wv', act: 4, along: 0.15 },
  a5_death: { token: '5a', act: 5, along: 0.5 },
  a5_keep2: { token: '8y', act: 5, along: 0.5 },
};

/** The waypoint of a D2 map: the DS1 object's place (world units) and its sheet; null without one (or without a sheet for it) */
export function d2Waypoint(m: D2MapData | undefined, near?: { x: number; y: number }): { x: number; y: number; sheet: string | null } | null {
  const raw = m?.raw as { act?: number; objects?: [number, number, number, number][] } | undefined;
  const act = raw?.act ?? 0;
  const table = TOKEN[act];
  if (!table) return null;
  let best: { x: number; y: number; sheet: string | null } | null = null;
  let bd = Infinity;
  for (const o of raw?.objects ?? []) {
    if (o[0] !== 2 || !table[o[1]]) continue;
    const p = { x: o[2] * 2.5, y: o[3] * 2.5 };
    const d = near ? Math.hypot(p.x - near.x, p.y - near.y) : 0;
    if (d >= bd) continue;
    bd = d;
    const token = table[o[1]];
    best = { ...p, sheet: WAYPOINT_SHEETS.some((s) => s.token === token && s.act === act) ? waypointSheet(token, act) : null };
  }
  return best;
}
