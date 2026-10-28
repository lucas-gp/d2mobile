/**
 * Patch Project Diablo 2 des tables vanilla, généré PAR DIFF (lot M6) : tables du jeu de règles `pd2` (base + mod) − tables de la base
 * (Diablo II LoD 1.13c régénérée depuis les MPQ, tools/vanilla/gen.ts). Écrit `mods/pd2/data/**.patch.ts`, puis vérifie que le jeu `pd2`
 * rechargé avec ce patch reproduit EXACTEMENT les tables d'avant (égalité profonde, ordre des entrées, de l'index et des champs compris).
 *
 *   npx tsx mods/pd2/tools/vanilla-diff.ts                  état pd2 → réécriture vanilla de la base (MPQ) → patch → vérification
 *   npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla     sans réécrire la base (patch recalculé sur la base telle qu'elle est)
 *   npx tsx mods/pd2/tools/vanilla-diff.ts --tables bases,runes
 *   npx tsx mods/pd2/tools/vanilla-diff.ts --ref            enregistre aussi les empreintes de l'état pd2 de départ (test permanent)
 *   npx tsx mods/pd2/tools/vanilla-diff.ts --want f.json    état pd2 de départ lu d'un instantané (`--snap pd2 f.json tables`, pris sur le
 *                                                           commit d'avant un lot qui réécrit la base à la main : Cube, lot M10c)
 *   npx tsx mods/pd2/tools/vanilla-diff.ts --want a.json --check b.json
 *                                           le patch mène la base à `a.json`, et le jeu pd2 rechargé doit donner `b.json` : compétences (lot M9),
 *                                           dont le patch précède les chiffres du wiki (`api.skills.patchNumbers`) ; `a.json` = la base seule
 *                                           (`--snap d2`) et `b.json` = le jeu pd2 (`--snap pd2`), pris sur le commit d'avant les arbres vanilla
 *
 * Chaque étape tourne dans son propre processus (état des modules neuf). Portée d'un registre : les entrées de la base et celles que le
 * patch ajoute ; les autres ajouts du mod (uniques PD2, objets divers…) ne sont pas concernés. Les champs d'une entrée patchée gardent
 * leur place (registre : un champ présent garde sa place, un champ à `undefined` est retiré) ; quand un champ ajouté prend place au
 * milieu de l'objet, le patch donne l'ordre final des champs (`keyOrder`). Une entrée vanilla placée ailleurs dans pd2 est retirée puis
 * ajoutée à sa place pd2.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { TABLES, pack, snapshotTables, tableHash, unpack, type Snap } from './vanilla-snap';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
/** Empreintes des tables pd2 d'avant le lot M6 (test permanent mods/pd2/tests/unit/vanilla-patch.test.ts) */
export const REF_FILE = join(ROOT, 'mods/pd2/tests/unit/vanilla-patch.ref.json');

type Table = (typeof TABLES)[number];

/** Processus enfant : instantané des tables dans un jeu de règles */
async function snapshot(ruleset: string, out: string, names: readonly string[]): Promise<void> {
  const { activateForTools } = await import(pathToFileURL(join(ROOT, 'tools/mods/node.ts')).href);
  await activateForTools(ruleset);
  writeFileSync(out, JSON.stringify(snapshotTables(names)));
}

/* ------------------------------ diff ------------------------------ */

export interface TablePatch {
  patch: Record<string, Record<string, unknown>>;
  keyOrder?: Record<string, string[]>;
  add: { entry: Record<string, unknown>; after?: string; before?: string }[];
  remove: string[];
}

/** Patch qui fait passer `base` (vanilla) à `want` (pd2) sur les entrées de la portée */
function diffTable(reg: string, want: Snap, base: Snap, patchIds: ReadonlySet<string>): TablePatch {
  const scope = want.list.filter((e) => e.owner === 'base' || patchIds.has(e.id));
  const wantIds = new Set(scope.map((e) => e.id));
  const baseById = new Map(base.list.map((e) => [e.id, e]));
  // entrées communes déplacées : hors de la plus longue sous-suite commune dans l'ordre (retirées puis ajoutées à leur place pd2)
  const baseIndex = new Map(base.list.map((e, i) => [e.id, i]));
  const common = scope.filter((e) => baseIndex.has(e.id));
  const kept = new Set(lis(common.map((e) => baseIndex.get(e.id)!)).map((k) => common[k].id));
  const moved = new Set(common.filter((e) => !kept.has(e.id)).map((e) => e.id));
  const out: TablePatch = { patch: {}, add: [], remove: base.list.filter((e) => !wantIds.has(e.id) || moved.has(e.id)).map((e) => e.id) };
  scope.forEach((e, i) => {
    const b = moved.has(e.id) ? undefined : baseById.get(e.id);
    const w = unpack(e.entry) as Record<string, unknown>;
    if (!b) {
      const prev = scope[i - 1]?.id;
      out.add.push(prev !== undefined ? { entry: w, after: prev } : { entry: w, before: scope.find((x) => kept.has(x.id))!.id });
      return;
    }
    if (b.entry === e.entry) return;
    const v = unpack(b.entry) as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    for (const k of Object.keys(w)) if (!Object.hasOwn(v, k) || pack(v[k]) !== pack(w[k])) fields[k] = w[k];
    for (const k of Object.keys(v)) if (!Object.hasOwn(w, k)) fields[k] = undefined;
    // ordre des champs après le patch (comme Registry.patch) : doit être celui de pd2
    const sim: Record<string, unknown> = { ...v };
    for (const [k, x] of Object.entries(fields)) {
      if (x === undefined) delete sim[k];
      else sim[k] = x;
    }
    if (Object.keys(sim).join() !== Object.keys(w).join()) (out.keyOrder ??= {})[e.id] = Object.keys(w);
    out.patch[e.id] = fields;
  });
  return out;
}

/** Indices (dans `xs`) d'une plus longue sous-suite strictement croissante */
function lis(xs: number[]): number[] {
  const tails: number[] = [];
  const prev: number[] = new Array<number>(xs.length).fill(-1);
  for (let i = 0; i < xs.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (xs[tails[m]] < xs[i]) lo = m + 1;
      else hi = m;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out: number[] = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(k);
  return out.reverse();
}

/* ------------------------------ écriture des fichiers de patch ------------------------------ */

const IDENT = /^[A-Za-z_$][\w$]*$/;
const isRoll = (o: Record<string, unknown>): boolean => Object.keys(o).join() === 'stat,min,max,param' && typeof o.stat === 'string';
/** Littéral TypeScript d'une valeur de table ; jets de statistique en `r(stat, min[, max][, param])`, comme les tables du jeu */
function lit(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  const o = v as Record<string, unknown>;
  if (isRoll(o)) {
    const max = o.max !== o.min || o.param !== undefined ? `, ${String(o.max)}` : '';
    return `r(${JSON.stringify(o.stat)}, ${String(o.min)}${max}${o.param !== undefined ? `, ${JSON.stringify(o.param)}` : ''})`;
  }
  return `{ ${Object.entries(o)
    .map(([k, x]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${lit(x)}`)
    .join(', ')} }`;
}

const HEADER = `// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
`;

function patchSource(group: Table[], patches: Record<string, TablePatch>): string {
  const types = [...new Set(group.map((t) => t.type))].sort();
  const parts = group.map((t) => {
    const p = patches[t.reg];
    const body = [
      `  patch: {\n${Object.entries(p.patch)
        .map(([id, f]) => `    ${IDENT.test(id) ? id : JSON.stringify(id)}: ${lit(f)},`)
        .join('\n')}\n  },`,
      p.keyOrder
        ? `  keyOrder: {\n${Object.entries(p.keyOrder)
            .map(([id, ks]) => `    ${IDENT.test(id) ? id : JSON.stringify(id)}: ${lit(ks)},`)
            .join('\n')}\n  },`
        : '',
      p.add.length
        ? `  add: [\n${p.add.map((a) => `    { entry: ${lit(a.entry)}, ${a.after !== undefined ? `after: ${JSON.stringify(a.after)}` : `before: ${JSON.stringify(a.before)}`} },`).join('\n')}\n  ],`
        : '',
      p.remove.length ? `  remove: ${lit(p.remove)},` : '',
    ].filter(Boolean);
    const n = Object.keys(p.patch).length;
    return `/** Registre \`${t.reg}\` : ${n} entrée(s) patchée(s)${p.keyOrder ? ` (dont ${Object.keys(p.keyOrder).length} avec ordre des champs)` : ''}${p.add.length ? `, ${p.add.length} ajoutée(s)` : ''}${p.remove.length ? `, ${p.remove.length} retirée(s)` : ''} */\nexport const ${t.name}: TablePatch<${t.type}> = {\n${body.join('\n')}\n};`;
  });
  const roll = parts.some((p) => /\br\(/.test(p));
  return `${HEADER}/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis \`npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref\` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { ${[...(roll ? ['StatRoll'] : []), 'TablePatch', ...types].sort().join(', ')} } from '${'../'.repeat(group[0].file.split('/').length)}../src/mods/api';
${roll ? '\nconst r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });\n' : ''}
${parts.join('\n\n')}
`;
}

/* ------------------------------ orchestration ------------------------------ */

function child(args: string[]): void {
  execFileSync(process.execPath, ['--import', 'tsx', SELF, ...args], { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT, env: { ...process.env, TZ: 'UTC' } });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--snap') return snapshot(args[1], args[2], args[3].split(','));
  const ti = args.indexOf('--tables');
  const asked = ti >= 0 ? args[ti + 1].split(',') : TABLES.map((t) => t.reg);
  for (const n of asked) if (!TABLES.some((t) => t.reg === n)) throw new Error(`table inconnue : ${n}`);
  // tables d'un même fichier de patch (objets de set et sets) : ensemble
  const files = new Set(TABLES.filter((t) => asked.includes(t.reg) && !('verifyOnly' in t)).map((t) => t.file));
  // tables vérifiées seulement : avec les tables de leur générateur
  const gensAsked = new Set(TABLES.filter((t) => asked.includes(t.reg)).map((t) => t.gen));
  const names: string[] = TABLES.filter((t) => files.has(t.file) || ('verifyOnly' in t && gensAsked.has(t.gen))).map((t) => t.reg);
  const gens = [...new Set(TABLES.filter((t) => names.includes(t.reg)).map((t) => t.gen))];
  const tmp = mkdtempSync(join(process.env.FP_TMP ?? tmpdir(), 'vdiff-'));
  try {
    const read = (f: string): Record<string, Snap> => JSON.parse(readFileSync(join(tmp, f), 'utf8'));
    console.log('1. état pd2 (base + mod)');
    const wi = args.indexOf('--want');
    if (wi >= 0) writeFileSync(join(tmp, 'pd2.json'), readFileSync(args[wi + 1], 'utf8'));
    else child(['--snap', 'pd2', join(tmp, 'pd2.json'), names.join(',')]);
    // l'état de départ doit être celui d'avant le lot M6 (empreintes enregistrées), sauf à les (ré)enregistrer
    const ref: Record<string, { entries: string; index: string }> = existsSync(REF_FILE) ? JSON.parse(readFileSync(REF_FILE, 'utf8')) : {};
    const start = read('pd2.json');
    // état final attendu du jeu pd2 (défaut : l'état de départ ; `--check` : un autre instantané, quand le patch n'est pas la dernière étape)
    const ci = args.indexOf('--check');
    const final: Record<string, Snap> = ci >= 0 ? JSON.parse(readFileSync(args[ci + 1], 'utf8')) : start;
    for (const n of names) {
      const h = tableHash(final[n]);
      if (args.includes('--ref')) ref[n] = h;
      else if (!ref[n] || ref[n].entries !== h.entries || ref[n].index !== h.index)
        throw new Error(`${n} : l'état pd2 de départ n'est pas celui des empreintes de référence (${REF_FILE}) ; --ref pour les enregistrer`);
    }
    if (args.includes('--ref')) writeFileSync(REF_FILE, `${JSON.stringify(Object.fromEntries(TABLES.filter((t) => ref[t.reg]).map((t) => [t.reg, ref[t.reg]])), null, 2)}\n`);
    if (!args.includes('--no-vanilla')) {
      console.log(`2. base réécrite depuis les MPQ (tools/vanilla/gen.ts --write ${gens.join(',')})`);
      execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'tools/vanilla/gen.ts'), '--write', gens.join(',')], { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT });
    }
    console.log('3. base seule (d2)');
    child(['--snap', 'd2', join(tmp, 'd2.json'), names.join(',')]);
    const want = read('pd2.json');
    const base = read('d2.json');
    const expect = ci >= 0 ? final : want;
    // identifiants déjà ajoutés par un patch existant : dans la portée
    const patches: Record<string, TablePatch> = {};
    for (const t of TABLES) {
      if (!names.includes(t.reg) || 'verifyOnly' in t) continue;
      let ids = new Set<string>();
      try {
        const m = await import(pathToFileURL(join(ROOT, 'mods/pd2', t.file)).href);
        ids = new Set(((m[t.name]?.add ?? []) as { entry: { id: string } }[]).map((a) => a.entry.id));
      } catch {
        /* pas encore de patch */
      }
      patches[t.reg] = diffTable(t.reg, want[t.reg], base[t.reg], ids);
      const p = patches[t.reg];
      console.log(`   ${t.reg} : ${Object.keys(p.patch).length} patchée(s), ${p.add.length} ajoutée(s), ${p.remove.length} retirée(s)`);
    }
    console.log('4. fichiers de patch');
    const prettier = await import('prettier');
    for (const file of [...new Set(TABLES.filter((t) => names.includes(t.reg) && !('verifyOnly' in t)).map((t) => t.file))]) {
      const path = join(ROOT, 'mods/pd2', file);
      const group = TABLES.filter((t) => t.file === file);
      const cfg = (await prettier.resolveConfig(path)) ?? {};
      writeFileSync(path, await prettier.format(patchSource(group, patches), { ...cfg, filepath: path }));
      console.log(`   mods/pd2/${file}`);
    }
    console.log('5. vérification : pd2 rechargé avec le patch');
    child(['--snap', 'pd2', join(tmp, 'after.json'), names.join(',')]);
    const after = read('after.json');
    let bad = 0;
    for (const n of names) {
      const a = expect[n];
      const b = after[n];
      const same = JSON.stringify(a.index) === JSON.stringify(b.index) && a.list.length === b.list.length && a.list.every((e, i) => e.id === b.list[i].id && e.entry === b.list[i].entry);
      if (!same) bad++;
      console.log(`   ${n} : ${same ? 'identique' : 'DIFFÉRENT'} (${a.list.length} entrées)`);
    }
    if (bad) process.exit(1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

await main();
