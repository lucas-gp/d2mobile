/**
 * Export des animations (personnages et monstres) : une feuille PNG par animation (une ligne par direction
 * en ordre horaire, une colonne par trame), cadre commun, ancrage fixe aux pieds, métadonnées JSON.
 */
import { join } from 'node:path';
import type { GameData } from './data';
import { slug } from './data';
import { parseCof } from './formats/cof';
import type { Dcc } from './formats/dcc';
import { gearOptions, loadLayer } from './layers';
import { compose } from './compose';
import { directionOrder } from './directions';
import { encodePng } from './png';
import { writeFileEnsured, writeJson, updateManifest } from './manifest';
import type { AnimSpec, CharSpec, MonsterSpec } from './scope';
import { CHARS, MONSTERS } from './scope';

export interface AnimEntry {
  name: string;
  png: string;
  json: string;
  frame: { w: number; h: number };
  directions: number;
  frames: number;
  anchor: { x: number; y: number };
  fps: number;
  loop: boolean;
  /** libellé de chaque ligne (direction) de la feuille */
  dirLabels: string[];
}
export interface EntityEntry {
  kind: 'chars' | 'monsters';
  id: string;
  name: string;
  variant?: string;
  dir: string;
  anims: AnimEntry[];
}

interface Job {
  kind: 'chars' | 'monsters';
  id: string;
  entityName: string;
  variant?: string;
  /** dossier de sortie relatif */
  dir: string;
  /** racine des DCC/COF dans l'archive */
  root: string;
  code: string;
  /** classes d'arme à essayer dans l'ordre (la mort et quelques modes n'existent qu'en « hth ») */
  wclasses: string[];
  act: number;
  anim: AnimSpec;
  gearFor: (layerDir: string) => string | null | undefined;
}

function buildAnim(data: GameData, outDir: string, job: Job): AnimEntry | { skipped: string } {
  const { vfs } = data;
  let wclass = job.wclasses[0];
  let cofBytes = null as Uint8Array | null;
  for (const wc of job.wclasses) {
    cofBytes = vfs.get(`${job.root}\\cof\\${job.code}${job.anim.mode}${wc}.cof`);
    if (cofBytes) {
      wclass = wc;
      break;
    }
  }
  const cofName = `${job.code}${job.anim.mode}${wclass}`;
  if (!cofBytes) return { skipped: `COF absent : ${job.code}${job.anim.mode}${job.wclasses[0]}` };
  const cof = parseCof(cofBytes);
  const layers = new Map<number, Dcc>();
  const used: { layer: string; gear: string; weaponClass: string; file: string }[] = [];
  for (const l of cof.layers) {
    const gear = job.gearFor(l.dir);
    if (!gear) continue;
    const base = `${job.root}\\${l.dir}\\${job.code}${l.dir}${gear}${job.anim.mode}${l.weaponClass}`;
    const got = loadLayer(vfs, base);
    if (!got) return { skipped: `calque absent : ${base}` };
    layers.set(l.composit, got.dcc);
    used.push({ layer: l.dir, gear, weaponClass: l.weaponClass, file: got.file.replace(/\\/g, '/') });
  }
  const c = compose(cof, layers, data.palette(job.act));
  const order = directionOrder(c.directions);
  const sheetW = c.w * c.frames;
  const sheetH = c.h * c.directions;
  const sheet = new Uint8Array(sheetW * sheetH * 4);
  for (const row of order.rows) {
    for (let f = 0; f < c.frames; f++) {
      const src = c.rgba[row.source][f];
      for (let y = 0; y < c.h; y++) {
        sheet.set(src.subarray(y * c.w * 4, (y + 1) * c.w * 4), ((row.row * c.h + y) * sheetW + f * c.w) * 4);
      }
    }
  }
  const base = join(job.kind, job.dir, job.anim.name);
  writeFileEnsured(join(outDir, `${base}.png`), encodePng(sheetW, sheetH, sheet));
  const rec = data.animdata.get(cofName.toUpperCase());
  const fps = rec?.fps ?? 25;
  const meta = {
    entity: job.id,
    kind: job.kind,
    animation: job.anim.name,
    sheet: `${job.anim.name}.png`,
    source: { cof: cofName.toUpperCase(), mode: job.anim.mode.toUpperCase(), weaponClass: wclass, requestedWeaponClass: job.wclasses[0], palette: `act${job.act}`, layers: used },
    frame: { w: c.w, h: c.h },
    directions: c.directions,
    framesPerDirection: c.frames,
    layout: 'ligne = direction (ordre logique ci-dessous), colonne = trame',
    directionOrder: order,
    anchor: { x: c.ax, y: c.ay, note: 'position des pieds (origine) dans chaque cadre, identique pour toutes les trames et directions' },
    timing: {
      loop: job.anim.loop,
      fps,
      speedRaw: rec?.speed ?? null,
      frameDurationMs: Math.round(1000 / fps),
      triggers: (rec?.flags ?? []).map((code, frame) => ({ frame, code })).filter((t) => t.code),
      cofFrameFlags: cof.frameFlags.map((code, frame) => ({ frame, code })).filter((t) => t.code),
      note: 'cadence de base d’animdata.d2 (25 i/s × vitesse/256) ; en jeu, les vitesses d’attaque/sort/marche dépendent des statistiques',
    },
  };
  writeJson(join(outDir, `${base}.json`), meta);
  return {
    name: job.anim.name,
    png: `${base}.png`.replace(/\\/g, '/'),
    json: `${base}.json`.replace(/\\/g, '/'),
    frame: meta.frame,
    directions: c.directions,
    frames: c.frames,
    anchor: { x: c.ax, y: c.ay },
    fps,
    loop: job.anim.loop,
    dirLabels: order.rows.map((r) => r.label),
  };
}

export function exportChars(data: GameData, outDir: string, log: (s: string) => void, specs: CharSpec[] = CHARS): EntityEntry[] {
  const out: EntityEntry[] = [];
  const classNames: Record<string, string> = { am: 'Amazon', ba: 'Barbarian', ne: 'Necromancer', pa: 'Paladin', so: 'Sorceress', dz: 'Druid', ai: 'Assassin' };
  for (const s of specs) {
    const entry: EntityEntry = { kind: 'chars', id: s.id, name: classNames[s.code] ?? s.id, variant: s.variant, dir: `${s.id}/${s.variant}`, anims: [] };
    for (const a of s.anims) {
      const r = buildAnim(data, outDir, {
        kind: 'chars',
        id: s.id,
        entityName: entry.name,
        variant: s.variant,
        dir: entry.dir,
        root: `data\\global\\chars\\${s.code}`,
        code: s.code,
        wclasses: [s.weaponClass, 'hth'],
        act: s.act,
        anim: a,
        gearFor: (l) => s.gear[l],
      });
      if ('skipped' in r) log(`  ! ${s.id}/${a.name} ignorée : ${r.skipped}`);
      else {
        entry.anims.push(r);
        log(`  ${s.id}/${s.variant}/${a.name} : ${r.directions} dir × ${r.frames} tr, cadre ${r.frame.w}×${r.frame.h}`);
      }
    }
    out.push(entry);
  }
  updateManifest(outDir, 'chars', out);
  return out;
}

export function exportMonsters(data: GameData, outDir: string, log: (s: string) => void, specs: MonsterSpec[] = MONSTERS): EntityEntry[] {
  const out: EntityEntry[] = [];
  const stats = data.needTable('monstats');
  for (const s of specs) {
    const row = stats.rows.find((r) => r.Class.toLowerCase() === s.cls.toLowerCase());
    if (!row) {
      log(`  ! monstre inconnu dans monstats.txt : ${s.cls}`);
      continue;
    }
    const code = row.Code.toLowerCase();
    const root = `data\\global\\monsters\\${code}`;
    const id = slug(row.Class);
    const entry: EntityEntry = { kind: 'monsters', id, name: data.str(row.namco), dir: id, anims: [] };
    // équipement : le premier code disponible pour chaque calque (préférence « lit »), sauf forçage
    const pick = (layer: string, mode: string, wc: string): string | null => {
      if (s.gear?.[layer]) return s.gear[layer];
      const found = gearOptions(data.vfs, root, code, layer, mode, wc);
      return found.includes('lit') ? 'lit' : (found.sort()[0] ?? null);
    };
    for (const a of s.anims) {
      const r = buildAnim(data, outDir, { kind: 'monsters', id, entityName: entry.name, dir: entry.dir, root, code, wclasses: ['hth'], act: s.act, anim: a, gearFor: (l) => pick(l, a.mode, 'hth') });
      if ('skipped' in r) log(`  ! ${id}/${a.name} ignorée : ${r.skipped}`);
      else {
        entry.anims.push(r);
        log(`  ${id}/${a.name} : ${r.directions} dir × ${r.frames} tr, cadre ${r.frame.w}×${r.frame.h}`);
      }
    }
    out.push(entry);
  }
  updateManifest(outDir, 'monsters', out);
  return out;
}
