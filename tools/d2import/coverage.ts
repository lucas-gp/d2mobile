/**
 * Rapport de couverture du mode local sans repli : ce que les zones du jeu demandent et que le catalogue D2 ne sait PAS produire (sprite
 * du jeu conservé). `npx tsx tools/d2import/coverage.ts` — aucune donnée Blizzard, aucun MPQ : le catalogue est statique (GAME_ACTORS,
 * WALLS, TILE_PROPS, GROUNDS, FX).
 */
import '../mods/auto';
import { Game } from '../../src/sim/game';
import { RUNS } from '../../src/data/runs';
import { MAP_ZONES } from '../../src/data/maps';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import { RULES } from '../../src/mods/rules';
import { buildHarrogath } from '../../src/data/zones/harrogath';
import { objectSheets } from '../../src/render/renderer';
import { zoneMonsterIds } from '../../src/render/roster';
import { FX_BY_CLASS, FX_COMMON } from '../../src/render/fx';
import type { ZoneDef } from '../../src/data/zone-types';
import { SHEET_IDS } from './browser';
import { GROUNDS } from './ground-map';
import { WALLS, TILE_PROPS } from './prop-map';
import { FX } from './fx-map';

const units = new Set(SHEET_IDS);
const props = new Set([...WALLS.map((w) => w.id), ...TILE_PROPS.map((p) => p.id)]);
const grounds = new Set(GROUNDS.map((g) => g.id));
const fx = new Set(FX.map((f) => `fx_${f.id}`));
const d2 = (id: string): boolean => units.has(id) || props.has(id) || grounds.has(id) || fx.has(id);

const zones: { name: string; z: ZoneDef; mapZone?: string; d2map: boolean }[] = [];
const g = new Game(undefined, 'sorceress');
for (const run of RUNS) {
  try {
    if (g.startRun(run.id, 0, 5))
      zones.push({
        name: run.id,
        z: g.world.zone,
        mapZone: g.world.run?.mapZone || undefined,
        d2map:
          !!run.campaign ||
          /tristram|andariel|countess|baal|chaos|mephisto|tombs|cows|river|harrogath|durance|duriel|nilathak|pindle|worldstone|summit|ancient|travincal|izual|diablo|bloodraven|cave/.test(run.id),
      });
  } catch {
    /* zone indisponible sans carte */
  }
}
zones.push({ name: 'harrogath', z: buildHarrogath(), d2map: true });
for (const m of MAP_ZONES) zones.push({ name: `map:${m.id}`, z: RULES['maps.buildZone'](m, 3, { density: 0, rarity: 0 }), mapZone: m.id, d2map: false });

const missing = { monster: new Map<string, Set<string>>(), object: new Map<string, Set<string>>(), prop: new Map<string, Set<string>>(), ground: new Map<string, Set<string>>() };
const note = (k: keyof typeof missing, id: string, z: string): void => {
  if (!missing[k].has(id)) missing[k].set(id, new Set());
  missing[k].get(id)!.add(z);
};
for (const { name, z, mapZone } of zones) {
  for (const id of zoneMonsterIds(z, { mapZone })) {
    const def = MONSTER_BY_ID[id];
    if (def && !units.has(id) && !units.has(def.sprite)) note('monster', `${id} (sprite ${def.sprite}${units.has(def.sprite) ? ', planche D2 sous ce nom' : ''})`, name);
  }
  for (const o of z.objects) for (const id of objectSheets(o.kind, o.id, o.variant)) if (!d2(id)) note('object', id, name);
  for (const p of z.props) if (!props.has(`prop_${p.prop}`)) note('prop', `prop_${p.prop}`, name);
  for (const k of new Set([z.ground, ...z.patches.map((p) => p.kind), ...(z.groundTiles?.kinds ?? [])]))
    if (!grounds.has(`ground_${k}`) && !grounds.has(`ground_${k}.${z.id}`)) note('ground', `ground_${k}`, name);
}
const fxAll = new Set<string>();
for (const c of Object.keys(FX_BY_CLASS)) for (const id of [...FX_COMMON, ...FX_BY_CLASS[c]]) fxAll.add(`fx_${id}`);
console.log(`${zones.length} zones examinées`);
for (const [k, m] of Object.entries(missing)) {
  console.log(`\n== ${k} sans équivalent D2 : ${m.size}`);
  for (const [id, zs] of [...m].sort((a, b) => b[1].size - a[1].size)) console.log(`  ${id} — ${zs.size} zone(s) : ${[...zs].slice(0, 5).join(', ')}${zs.size > 5 ? '…' : ''}`);
}
console.log(`\n== effets de classe absents du catalogue : ${[...fxAll].filter((id) => !fx.has(id)).join(', ') || '(aucun)'}`);
