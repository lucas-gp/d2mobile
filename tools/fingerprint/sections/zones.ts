/**
 * Zones et cartes : chaque run × 3 difficultés × 3 graines, sans puis avec les cartes D2 privées (si `~/d2-private/out/game/maps` existe :
 * l'empreinte dépend donc de la machine, voir README), et chaque carte d'endgame × 3 graines (densité, rareté, boss et famille en plus).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import '../../../src/sim/game';
import { RUNS } from '../../../src/data/runs';
import { MAP_ZONES } from '../../../src/data/maps';
import { RULES } from '../../../src/mods/rules';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../../src/data/d2map';
import { D2_MAPS_DIR, json, sha1, type SectionResult } from '../lib';

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  const h = (z: unknown) => sha1(json(z));
  for (const withMaps of [false, true]) {
    clearD2Maps();
    if (withMaps && !existsSync(D2_MAPS_DIR)) continue;
    if (withMaps)
      for (const f of readdirSync(D2_MAPS_DIR).sort())
        if (f.endsWith('.json')) {
          const j = JSON.parse(readFileSync(`${D2_MAPS_DIR}/${f}`, 'utf8'));
          if (j.grid) registerD2Map(parseD2Map(j));
        }
    for (const r of RUNS)
      for (const d of [0, 1, 2] as const)
        for (const seed of [1, 7, 42]) {
          const k = `${withMaps ? 'd2' : 'free'}/${r.id}/${d}/${seed}`;
          try {
            out[k] = h(r.build(seed, d));
          } catch (e) {
            out[k] = 'ERR ' + (e as Error).message;
          }
        }
    for (const def of MAP_ZONES)
      for (const seed of [1, 2, 3])
        out[`${withMaps ? 'd2' : 'free'}/map/${def.id}/${seed}`] = h(
          RULES['maps.buildZone'](def, seed, { density: 60, rarity: 40, extraBoss: seed === 2, extraFamily: seed === 3 ? 'zombie' : undefined }),
        );
  }
  clearD2Maps();
  return out;
}
