/**
 * Planches au format du jeu (public/sprites) générées depuis les fichiers Diablo II du joueur :
 * `<id>.json` + pages PNG en deux paliers (hi = pixels d'origine, lo = moitié), images rognées avec ancre aux
 * pieds, ombres synthétiques, directions dans la convention du jeu (0 = +x monde = bas-droite à l'écran).
 * Sortie : <out>/game/{hi,lo}/… et <out>/game/manifest.json, servis par le jeu sous /d2/ s'ils existent.
 */
import { join } from 'node:path';
import type { GameData } from './data';
import { writeJson } from './manifest';
import { existsSync, readFileSync } from 'node:fs';
import { GAME_ACTORS, type GameActor } from './game-map';
import { exportGrounds } from './ground';
import { exportProps } from './props';
import { exportLoadingArt, exportSkillIcons } from './export-skill-icons';
import { exportUi } from './export-ui';
import { exportNpcText } from './export-npc-text';
import { exportItemIcons } from './export-item-icons';
import { exportFx } from './export-fx';
import { exportMaps } from './export-map';
import { exportGroundItems } from './export-ground-items';

import { NodeSink } from './node-sink';
import { partActors, writeActorSheet } from './sheets';
export { trim, bleed, half, shadow, type Img } from './actor-build';
export { writePages } from './sheets';

export interface GameSheetReport {
  id: string;
  ok: boolean;
  anims: string[];
  warnings: string[];
  hiMB?: number;
  loMB?: number;
}

export async function exportGame(data: GameData, outDir: string, log: (s: string) => void, only?: string[]): Promise<GameSheetReport[]> {
  const gdir = join(outDir, 'game');
  const out = new NodeSink(gdir);
  const reports: GameSheetReport[] = [];
  const manifest: { version: number; source: string; sheets: Record<string, unknown>; tiles: Record<string, unknown> } = { version: 1, source: 'd2import', sheets: {}, tiles: {} };
  // export partiel : on complète le manifeste existant au lieu de l'écraser
  const previous = join(gdir, 'manifest.json');
  if (only?.length && existsSync(previous)) {
    const prev = JSON.parse(readFileSync(previous, 'utf8'));
    Object.assign(manifest.sheets, prev.sheets);
    Object.assign(manifest.tiles, prev.tiles);
  }
  // pièces d'équipement des classes (casques « hd » et boucliers « sh », armes, jambes, bras) : voir sheets.ts
  const actors: GameActor[] = [...GAME_ACTORS, ...partActors(data)];
  for (const a of actors) {
    if (only?.length && !only.includes(a.id) && !(only.includes('parts') && / _(hd|sh|rh|lh|lg|ra|la)_/.test(a.id.replace(/([a-z]+)_(hd|sh|rh|lh|lg|ra|la)_/, '$1 _$2_')))) continue;
    const warnings: string[] = [];
    try {
      const r = await writeActorSheet(data, a, out);
      manifest.sheets[a.id] = r.entry;
      warnings.push(...r.warnings);
      const { hi: th, lo: tl } = r.entry;
      reports.push({ id: a.id, ok: true, anims: r.anims, warnings, hiMB: +(th.gpu / 1048576).toFixed(1), loMB: +(tl.gpu / 1048576).toFixed(1) });
      log(
        `  ${a.id.padEnd(18)} ${a.kind === 'chars' ? 'perso' : 'monstre'} ${a.code.padEnd(3)} ${r.anims.join(',')} — GPU hi ${(th.gpu / 1048576).toFixed(1)} Mo, lo ${(tl.gpu / 1048576).toFixed(1)} Mo${warnings.length ? ` (${warnings.length} avert.)` : ''}`,
      );
      for (const w of warnings) log(`      ! ${w}`);
    } catch (e) {
      reports.push({ id: a.id, ok: false, anims: [], warnings: [...warnings, (e as Error).message] });
      log(`  ${a.id.padEnd(18)} ÉCHEC → sprite actuel conservé : ${(e as Error).message}`);
    }
  }
  // skin optionnel (sources privées hors dépôt, ignoré s'il n'y en a pas)
  // décor (prop-map.ts) : murs assemblés depuis les tuiles de D2
  Object.assign(manifest.sheets, await exportProps(data, out, log, only));
  // cartes de villes (DS1)
  await exportMaps(data, outDir, log, only);
  // effets de sorts (fx-map.ts)
  Object.assign(manifest.sheets, await exportFx(data, out, log, only));
  // icônes de compétences et d'interface
  if (!only?.length || only.includes('icons')) {
    await exportSkillIcons(data, out, log);
    await exportLoadingArt(data, out, log);
    await exportUi(data, out, log);
    await exportNpcText(data, out, log);
    await exportItemIcons(data, out, log);
    await exportGroundItems(data, out, log);
  }
  // sols (ground-map.ts) : entrées « tiles » du manifeste, comme ceux du jeu
  Object.assign(manifest.tiles, await exportGrounds(data, out, log, only));
  writeJson(join(gdir, 'manifest.json'), manifest);
  return reports;
}
