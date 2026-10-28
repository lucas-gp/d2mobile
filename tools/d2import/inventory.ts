/**
 * Étape 1 — Inventaire lisible des archives : personnages, monstres, tuiles et niveaux, objets, icônes,
 * fichiers de support (palettes, COF, animdata). Écrit inventory/inventory.json (complet) et inventory.md.
 * Les noms lisibles viennent des tables de jeu (playerclass, monstats, objects, levels, weapons/armor/misc)
 * et des chaînes localisées.
 */
import { join } from 'node:path';
import type { GameData } from './data';
import { parseCof } from './formats/cof';
import { dt1TileCount } from './formats/dt1';
import type { Row } from './formats/txt';
import { writeFileEnsured, writeJson, updateManifest } from './manifest';

const CLASS_FOLDERS: Record<string, string> = { am: 'Amazon', ba: 'Barbarian', ne: 'Necromancer', pa: 'Paladin', so: 'Sorceress', dz: 'Druid', ai: 'Assassin' };

interface LayerInfo {
  layer: string;
  gear: string[];
  files: number;
}
interface AnimInfo {
  mode: string;
  modeName: string;
  weaponClass: string;
  cof: string;
  directions: number;
  framesPerDirection: number;
  layers: string[];
  fps: number | null;
}

/** Regroupe les fichiers d'un dossier d'entité (chars\pa, monsters\fa, objects\c5) : COF, calques, équipements */
function scanEntity(data: GameData, root: string, code: string, modeNames: Map<string, string>) {
  const files = data.vfs.list(`${root}\\`);
  const cofs = files.filter((f) => f.startsWith(`${root}\\cof\\`) && f.endsWith('.cof'));
  const anims: AnimInfo[] = [];
  for (const f of cofs) {
    const m = /\\([^\\]+)\.cof$/.exec(f)![1];
    const mode = m.slice(code.length, code.length + 2).toUpperCase();
    const wc = m.slice(code.length + 2);
    try {
      const cof = parseCof(data.vfs.need(f));
      const rec = data.animdata.get(m.toUpperCase());
      anims.push({
        mode,
        modeName: modeNames.get(mode) ?? mode,
        weaponClass: wc,
        cof: m.toUpperCase(),
        directions: cof.directions,
        framesPerDirection: cof.framesPerDir,
        layers: cof.layers.map((l) => l.dir),
        fps: rec ? Math.round(rec.fps * 100) / 100 : null,
      });
    } catch {
      /* COF illisible : ignoré */
    }
  }
  const layerMap = new Map<string, { gear: Set<string>; files: number }>();
  for (const f of files) {
    if (!f.endsWith('.dcc')) continue;
    const parts = f.slice(root.length + 1).split('\\');
    if (parts.length < 2) continue;
    const layer = parts[0];
    const name = parts[1].replace(/\.dcc$/, '');
    const gear = name.slice(code.length + layer.length, code.length + layer.length + 3);
    const e = layerMap.get(layer) ?? { gear: new Set<string>(), files: 0 };
    e.gear.add(gear);
    e.files++;
    layerMap.set(layer, e);
  }
  const layers: LayerInfo[] = [...layerMap].map(([layer, v]) => ({ layer, gear: [...v.gear].sort(), files: v.files })).sort((a, b) => a.layer.localeCompare(b.layer));
  return { anims: anims.sort((a, b) => a.cof.localeCompare(b.cof)), layers, dcc: layers.reduce((s, l) => s + l.files, 0) };
}

export function runInventory(data: GameData, outDir: string, log: (s: string) => void): void {
  const { vfs } = data;
  const all = vfs.list('');
  const inv: Record<string, unknown> = {};

  // -- archives
  const owners = new Map<string, number[]>();
  vfs.archives.forEach((a, i) => a.files.forEach((f) => owners.set(f, [...(owners.get(f) ?? []), i])));
  const overridden = vfs.archives.map((a, i) => ({
    name: a.name,
    priority: i,
    files: a.files.length,
    overriddenByLater: [...owners.values()].filter((o) => o.includes(i) && Math.max(...o) > i).length,
  }));
  inv.archives = { order: 'du moins au plus prioritaire', archives: overridden, uniqueFiles: all.length, listfileNote: 'inventaire basé sur le (listfile) interne de chaque archive' };
  log(`  ${all.length} fichiers uniques dans ${vfs.archives.length} archives`);

  const plrModes = new Map((data.table('plrmode')?.rows ?? []).map((r) => [r.Token, r.Name]));
  const monModes = new Map((data.table('monmode')?.rows ?? []).map((r) => [r.Token, r.Name]));
  const composits = new Map((data.table('composit')?.rows ?? []).map((r) => [r.Token.toLowerCase(), r.Name]));

  // -- personnages
  const chars = Object.entries(CLASS_FOLDERS).map(([code, name]) => {
    const s = scanEntity(data, `data\\global\\chars\\${code}`, code, plrModes);
    return { code, name, ...s, weaponClasses: [...new Set(s.anims.map((a) => a.weaponClass))].sort(), modes: [...new Set(s.anims.map((a) => `${a.mode} ${a.modeName}`))].sort() };
  });
  inv.characters = chars;
  log(`  ${chars.length} classes de personnage`);

  // -- monstres
  const monstats = data.needTable('monstats');
  const monsterFolders = new Set(all.filter((f) => f.startsWith('data\\global\\monsters\\')).map((f) => f.split('\\')[3]));
  const known = new Set<string>();
  const monsters = monstats.rows
    .filter((r) => r.Code && monsterFolders.has(r.Code.toLowerCase()))
    .map((r) => {
      const code = r.Code.toLowerCase();
      known.add(code);
      const s = scanEntity(data, `data\\global\\monsters\\${code}`, code, monModes);
      return { class: r.Class, name: data.str(r.namco), code, level: r.Level, ...s, modes: [...new Set(s.anims.map((a) => `${a.mode} ${a.modeName}`))].sort() };
    });
  const orphanMonsters = [...monsterFolders].filter((c) => !known.has(c)).sort();
  inv.monsters = { count: monsters.length, list: monsters, foldersWithoutMonstatsEntry: orphanMonsters };
  log(`  ${monsters.length} monstres (${orphanMonsters.length} dossiers sans entrée monstats)`);

  // -- objets animés (décor, coffres…)
  const objFolders = new Set(all.filter((f) => f.startsWith('data\\global\\objects\\')).map((f) => f.split('\\')[3]));
  const objects = (data.table('objects')?.rows ?? [])
    .filter((r) => r.Token && objFolders.has(r.Token.toLowerCase()))
    .map((r) => {
      const code = r.Token.toLowerCase();
      const s = scanEntity(data, `data\\global\\objects\\${code}`, code, new Map());
      return { id: Number(r.Id), name: r.Name, token: r.Token, dcc: s.dcc, modes: [...new Set(s.anims.map((a) => a.mode))].sort() };
    });
  inv.objects = { count: objects.length, list: objects };

  // -- tuiles et niveaux
  const tileFiles = all.filter((f) => f.startsWith('data\\global\\tiles\\'));
  const folders = new Map<string, { dt1: { file: string; tiles: number }[]; ds1: number; other: number }>();
  for (const f of tileFiles) {
    const parts = f.split('\\');
    const folder = parts.slice(3, -1).join('/');
    const e = folders.get(folder) ?? { dt1: [], ds1: 0, other: 0 };
    if (f.endsWith('.dt1')) {
      let tiles = -1;
      try {
        tiles = dt1TileCount(vfs.need(f));
      } catch {
        /* illisible */
      }
      e.dt1.push({ file: parts[parts.length - 1], tiles });
    } else if (f.endsWith('.ds1')) e.ds1++;
    else e.other++;
    folders.set(folder, e);
  }
  const lvlTypes = (data.table('lvltypes')?.rows ?? []).map((r) => ({
    id: Number(r.Id),
    name: r.Name,
    files: Object.entries(r)
      .filter(([k, v]) => /^File \d+$/.test(k) && v && v !== '0')
      .map(([, v]) => v),
  }));
  const levels = (data.table('levels')?.rows ?? [])
    .filter((r) => r.Id && r.Name && r.Name !== 'Null')
    .map((r) => ({
      id: Number(r.Id),
      name: r.LevelName ? data.str(r.LevelName) : r.Name,
      internal: r.Name,
      act: Number(r.Act) + 1,
      palette: `act${Number(r.Act) + 1}`,
      levelType: Number(r.LevelType),
    }));
  inv.tiles = { folders: Object.fromEntries([...folders].sort()), levelTypes: lvlTypes, levels };
  log(`  ${folders.size} dossiers de tuiles, ${lvlTypes.length} types de niveau, ${levels.length} niveaux`);

  // -- icônes d'inventaire
  const itemRows: (Row & { __table: string })[] = ['weapons', 'armor', 'misc'].flatMap((t) => (data.table(t)?.rows ?? []).map((r) => ({ ...r, __table: t })));
  const byInv = new Map<string, (typeof itemRows)[number]>();
  for (const r of itemRows) for (const k of [r.invfile, r.uniqueinvfile, r.setinvfile]) if (k) byInv.set(k.toLowerCase(), r);
  const invFiles = all.filter((f) => /^data\\global\\items\\inv[^\\]*\.dc6$/.test(f));
  const icons = invFiles.map((f) => {
    const id = /\\([^\\]+)\.dc6$/.exec(f)![1];
    const r = byInv.get(id);
    const kind = r ? (r.invfile?.toLowerCase() === id ? 'base' : r.uniqueinvfile?.toLowerCase() === id ? 'unique' : 'set') : 'inconnu';
    return {
      file: id,
      name: r ? data.str(r.name) : null,
      code: r?.code ?? null,
      table: r?.__table ?? null,
      type: r?.type ?? null,
      kind,
      cells: r ? `${r.invwidth}×${r.invheight}` : null,
      invTrans: r?.InvTrans || null,
    };
  });
  inv.itemIcons = {
    count: icons.length,
    list: icons,
    colorTables: vfs.list('data\\global\\items\\palette\\').map((f) => f.split('\\').pop()),
    colors: (data.table('colors')?.rows ?? []).map((r) => `${r.Code} (${r['Transform Color']})`),
  };

  // -- fichiers de support
  const pals = all.filter((f) => /^data\\global\\palette\\[^\\]+\\pal\.dat$/.test(f)).map((f) => f.split('\\')[3]);
  const cofCount = all.filter((f) => f.endsWith('.cof')).length;
  inv.support = {
    palettes: pals,
    actPalettes: pals.filter((p) => /^act\d$/.test(p)),
    paletteFormat: '256 entrées BGR (768 octets) ; index 0 = transparent ; .pl2 = tables de transformation (ombre, lumière, teintes)',
    cofFiles: cofCount,
    compositLayers: Object.fromEntries(composits),
    animdata: { file: 'data\\global\\animdata.d2', records: data.animdata.size },
    excelTables: all.filter((f) => f.startsWith('data\\global\\excel\\') && f.endsWith('.txt')).length,
    stringTables: all.filter((f) => f.startsWith(`data\\local\\lng\\${data.lang}\\`) && f.endsWith('.tbl')).map((f) => f.split('\\').pop()),
    strings: data.strings.size,
    otherFolders: Object.fromEntries(
      ['data\\global\\missiles', 'data\\global\\overlays', 'data\\global\\ui', 'data\\global\\sfx', 'data\\local\\ui'].map((p) => [p, all.filter((f) => f.startsWith(`${p}\\`)).length]),
    ),
  };

  writeJson(join(outDir, 'inventory', 'inventory.json'), inv);
  writeFileEnsured(join(outDir, 'inventory', 'inventory.md'), renderMd(inv as never, data));
  updateManifest(outDir, 'inventory', { json: 'inventory/inventory.json', markdown: 'inventory/inventory.md' });
  log(`  écrit : ${join(outDir, 'inventory', 'inventory.md')}`);
}

const table = (head: string[], rows: (string | number | null | undefined)[][]): string =>
  `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')}\n`;

function renderMd(inv: Record<string, any>, data: GameData): string {
  const o: string[] = [];
  o.push('# Inventaire des archives Diablo II\n');
  o.push('Généré par `tools/d2import` à partir des archives fournies (aucun contenu du jeu n’est recopié ici hors noms de fichiers et de tables).\n');
  o.push('## Archives\n');
  o.push(
    table(
      ['Priorité', 'Archive', 'Fichiers', 'Écrasés par une archive plus prioritaire'],
      inv.archives.archives.map((a: any) => [a.priority, a.name, a.files, a.overriddenByLater]),
    ),
  );
  o.push(`${inv.archives.uniqueFiles} chemins uniques. Ordre : du moins au plus prioritaire ; une archive ajoutée (ex. patch_d2.mpq) prime sur les précédentes.\n`);

  o.push('## Personnages\n');
  for (const c of inv.characters) {
    o.push(`### ${c.name} (\`${c.code}\`)\n`);
    o.push(`- ${c.dcc} fichiers DCC, ${c.anims.length} COF ; classes d’arme : ${c.weaponClasses.join(', ')}`);
    o.push(`- Modes : ${c.modes.join(', ')}`);
    o.push('- Calques et variantes d’équipement :\n');
    o.push(
      table(
        ['Calque', 'Nom', 'Variantes', 'Codes', 'Fichiers'],
        c.layers.map((l: any) => [l.layer, data.table('composit')?.rows.find((r) => r.Token.toLowerCase() === l.layer)?.Name ?? '', l.gear.length, l.gear.join(' '), l.files]),
      ),
    );
    const sample = c.anims.filter((a: any) => a.weaponClass === '1hs' || a.weaponClass === c.weaponClasses[0]);
    o.push('- Animations (classe d’arme `1hs`, sinon la première) :\n');
    o.push(
      table(
        ['Mode', 'Nom', 'COF', 'Directions', 'Trames/dir', 'Calques', 'i/s (animdata)'],
        sample.map((a: any) => [a.mode, a.modeName, a.cof, a.directions, a.framesPerDirection, a.layers.join(' '), a.fps ?? '']),
      ),
    );
  }

  o.push(`## Monstres (${inv.monsters.count} avec sprites)\n`);
  o.push(
    table(
      ['Classe', 'Nom', 'Code', 'Niveau', 'Modes', 'Calques (variantes)', 'DCC'],
      inv.monsters.list.map((m: any) => [
        m.class,
        m.name,
        m.code,
        m.level,
        m.modes.map((x: string) => x.split(' ')[0]).join(' '),
        m.layers.map((l: any) => `${l.layer}${l.gear.length > 1 ? `×${l.gear.length}` : ''}`).join(' '),
        m.dcc,
      ]),
    ),
  );
  if (inv.monsters.foldersWithoutMonstatsEntry.length) o.push(`Dossiers de monstres sans entrée dans monstats.txt : ${inv.monsters.foldersWithoutMonstatsEntry.join(', ')}\n`);

  o.push(`## Tuiles (DT1) par dossier\n`);
  o.push(
    table(
      ['Dossier', 'DT1 (tuiles)', 'DS1 (cartes prédéfinies)'],
      Object.entries(inv.tiles.folders).map(([k, v]: [string, any]) => [k, v.dt1.map((d: any) => `${d.file.replace('.dt1', '')}(${d.tiles})`).join(' '), v.ds1]),
    ),
  );
  o.push('## Types de niveau (lvltypes.txt) et fichiers de tuiles\n');
  o.push(
    table(
      ['Id', 'Nom', 'Fichiers DT1'],
      inv.tiles.levelTypes.map((t: any) => [t.id, t.name, t.files.join(', ')]),
    ),
  );
  o.push('## Niveaux (levels.txt)\n');
  o.push(
    table(
      ['Id', 'Nom', 'Acte', 'Palette', 'Type de niveau'],
      inv.tiles.levels.map((l: any) => [l.id, l.name, l.act, l.palette, l.levelType]),
    ),
  );

  o.push(`## Objets animés (${inv.objects.count})\n`);
  o.push(
    table(
      ['Id', 'Nom', 'Token', 'Modes', 'DCC'],
      inv.objects.list.map((x: any) => [x.id, x.name, x.token, x.modes.join(' '), x.dcc]),
    ),
  );

  o.push(`## Icônes d’inventaire (${inv.itemIcons.count})\n`);
  o.push(`Tables de couleurs : ${inv.itemIcons.colorTables.join(', ')} — teintes (colors.txt) : ${inv.itemIcons.colors.join(', ')}\n`);
  o.push(
    table(
      ['Fichier', 'Objet', 'Code', 'Type', 'Sorte', 'Cases', 'InvTrans'],
      inv.itemIcons.list.map((i: any) => [i.file, i.name, i.code, i.type, i.kind, i.cells, i.invTrans]),
    ),
  );

  o.push('## Fichiers de support\n');
  const s = inv.support;
  o.push(`- Palettes : ${s.palettes.join(', ')} (${s.paletteFormat})`);
  o.push(`- COF : ${s.cofFiles} ; animdata : ${s.animdata.records} animations (${s.animdata.file})`);
  o.push(
    `- Calques (composit.txt) : ${Object.entries(s.compositLayers)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  );
  o.push(`- Tables Excel : ${s.excelTables} ; chaînes : ${s.stringTables.join(', ')} (${s.strings} entrées)`);
  o.push(
    `- Autres dossiers : ${Object.entries(s.otherFolders)
      .map(([k, v]) => `${k} (${v})`)
      .join(', ')}\n`,
  );
  return o.join('\n');
}
