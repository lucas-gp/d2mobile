/**
 * Revision of each exported map (lot 317): raised when the importer's output for that map changes (its rooms, anchors), so that a map
 * generated on the device by an earlier version is generated again — that map alone, the rest of the graphics kept (`MapEntry.rev`,
 * src/platform/d2local.ts). A map not listed is at revision 0. An encrypted pack (`D2_REMOTE`) needs no revision: its `index.json` `ver` changes with
 * its content and every file is asked for with it.
 * 1 (lot 317): Diablo II's waypoint rooms — Jail 1, Halls of the Dead 2, the Arcane Sanctuary, Lower and Upper Kurast, Durance 2, the City
 * of the Damned, the River of Flame, the Halls of Pain and Worldstone Keep 2 get theirs; the Blood Moor, the Tamoe Highland, the Rocky
 * Waste and Worldstone Keep 1 lose the one Diablo II does not give them.
 * 2 (lot 320, Diablo II's ways between zones): the Underground Passage's level 1 (the Dark Wood's way up at its far end, level 2's way
 * down in a room of its own), the Spider Forest and the Flayer Jungle (the second clearing's entrance, `cave2`), Kurast's gates (Lower
 * Kurast, the Bazaar, Upper Kurast: `gateN` / `gateS`), Act IV's open cliffs (the Outer Steppes with the Fortress's mesa, the Plains of
 * Despair, the City of the Damned), the River of Flame (its bridge north to the Chaos Sanctuary, its way up to the City), the ice caves'
 * third way (the Crystalline Passage, the Glacial Trail, the Ancients' Way: `down`) and the Frozen Tundra's second cave. `a4_chaos` is new.
 */
export const MAP_REVISIONS: Readonly<Record<string, number>> = {
  a1_jail1: 1,
  a2_halls2: 1,
  a2_arcane: 1,
  a3_lower: 2,
  a3_upper: 2,
  a3_durance2: 1,
  a4_city: 2,
  a4_river: 2,
  a5_death: 1,
  a5_keep1: 1,
  a5_keep2: 1,
  a1_bloodmoor: 1,
  a1_tamoe: 1,
  a2_rocky: 1,
  a1_underpass1: 2,
  a3_spider: 2,
  a3_jungle: 2,
  a3_bazaar: 2,
  a4_steppes: 2,
  a4_plains: 2,
  a5_crystal1: 2,
  a5_crystal2: 2,
  a5_glacial1: 2,
  a5_tundra: 2,
};

export const mapRevision = (id: string): number => MAP_REVISIONS[id] ?? 0;
