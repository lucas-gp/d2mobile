/**
 * Empreintes de comportement (voir README.md) : prouve qu'un lot « sans changement de comportement » l'est vraiment.
 *
 *   npm run fingerprint -- --out ref.json                     toutes les sections (sauf bundle)
 *   npm run fingerprint -- --only registries,saves --out a.json
 *   npm run fingerprint -- --out b.json --compare ref.json    puis comparaison (code de sortie 1 si un écart)
 *   npm run fingerprint -- --compare ref.json --with b.json   comparaison seule de deux fichiers
 *   npm run fingerprint -- --jobs 3 …                          trois sections à la fois (lot 299 ; FP_JOBS)
 *
 * Chaque section tourne dans son propre processus, l'une après l'autre par défaut (une seule charge lourde à la fois), ou N à la fois (`--jobs`).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { D2_MAPS_DIR } from './lib';
import { fileURLToPath } from 'node:url';

/** Sections dans l'ordre d'exécution ; `bundle` est informatif et seulement sur demande (`--only bundle` ou `--bundle`) */
export const SECTIONS = ['registries', 'chars', 'mercs', 'loot', 'saves', 'zones', 'endgame', 'skills', 'bots'];
const INFO = new Set(['bundle']);

interface FingerprintFile {
  meta: { head: string; d2Maps: boolean; sections: string[]; seconds: Record<string, number> };
  sections: Record<string, Record<string, string>>;
}

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const HERE = fileURLToPath(new URL('.', import.meta.url));

function head(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '?';
  }
}

/**
 * Each section in its own process. Lot 299: `--jobs N` (or FP_JOBS) runs N sections at once (each is single-threaded; 3 cut the pd2 run
 * from about 10 to about 4 minutes on a 16-core machine); 1 by default (one heavy load at a time). The results do not depend on the order.
 */
async function compute(list: string[], jobs: number): Promise<FingerprintFile> {
  const tmp = mkdtempSync(join(process.env.FP_TMP ?? tmpdir(), 'fp-'));
  const out: FingerprintFile = { meta: { head: head(), d2Maps: existsSync(D2_MAPS_DIR), sections: list, seconds: {} }, sections: {} };
  try {
    // the longest first (measured on a 16-core machine: bots ≈ 210 s, endgame ≈ 150, zones ≈ 105, skills ≈ 95, the others ≤ 11)
    const WEIGHT: Record<string, number> = { bots: 5, endgame: 4, zones: 3, skills: 2 };
    const queue = [...list].sort((x, y) => (WEIGHT[y] ?? 0) - (WEIGHT[x] ?? 0));
    const one = async (s: string) => {
      const t0 = Date.now();
      const f = join(tmp, `${s}.json`);
      await new Promise<void>((res, rej) => {
        const p = spawn(process.execPath, ['--import', 'tsx', join(HERE, 'section.ts'), s, f], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, TZ: 'UTC' } });
        p.on('error', rej);
        p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`section ${s} : code ${code}`))));
      });
      out.sections[s] = JSON.parse(readFileSync(f, 'utf8'));
      out.meta.seconds[s] = Math.round((Date.now() - t0) / 1000);
      const n = Object.keys(out.sections[s]).length;
      process.stderr.write(`${s} : ${n} empreintes, ${out.meta.seconds[s]} s\n`);
    };
    const worker = async () => {
      for (let s = queue.shift(); s !== undefined; s = queue.shift()) await one(s);
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, list.length)) }, worker));
    // the sections in their usual order in the file
    out.sections = Object.fromEntries(list.map((s) => [s, out.sections[s]]));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}

/** Table d'une clé de la section `registries` (`fichier:EXPORT`, ou `<mod>:fichier:EXPORT` pour les données d'un mod) */
const tableOf = (k: string): string => /^[^#[.]+/.exec(k)![0];
const isModKey = (k: string): boolean => /^[a-z0-9-]+:[^:]+:/.test(k);
const isElem = (k: string): boolean => !k.includes('#') && tableOf(k) !== k;

/**
 * Section `registries` : écarts dus à un contenu DÉPLACÉ de la base vers un mod (lots M4 et suivants), non comptés :
 * - élément retiré d'une table de la base et présent, à l'identique, dans les données d'un mod ;
 * - entrée des données d'un mod (`<mod>:…`), ou d'une table du jeu dont chaque élément est identique à un élément d'un mod ;
 * - ordre (`#order`, `#keys`) d'une table de la base qui n'a fait que perdre des éléments déplacés ;
 * - valeur simple exportée (constante) retirée de la base et présente, à l'identique et sous le même nom d'export, dans les données d'un mod.
 * Les tables du jeu où le mod enregistre son contenu (BASES, UNIQUES, CUBE_RECIPES…) restent comparées normalement.
 */
function movedToMods(a: Record<string, string>, b: Record<string, string>, diff: string[]): Set<string> {
  const modHashes = new Set(diff.filter((k) => isModKey(k) && isElem(k) && b[k] !== undefined).map((k) => b[k]));
  const ok = new Set<string>();
  for (const k of diff) {
    if (isModKey(k) && a[k] === undefined) ok.add(k);
    else if (isElem(k) && b[k] === undefined && modHashes.has(a[k])) ok.add(k);
    else if (isElem(k) && a[k] === undefined && modHashes.has(b[k])) ok.add(k);
  }
  // constantes déplacées : même nom d'export (dernier segment de la clé), même empreinte, dans les données d'un mod
  const exportOf = (k: string) => k.slice(k.lastIndexOf(':') + 1);
  const modScalars = new Set(diff.filter((k) => isModKey(k) && !isElem(k) && !k.includes('#') && a[k] === undefined).map((k) => `${exportOf(k)}=${b[k]}`));
  for (const k of diff) if (!isModKey(k) && !isElem(k) && !k.includes('#') && b[k] === undefined && modScalars.has(`${exportOf(k)}=${a[k]}`)) ok.add(k);
  const elemsOf = (t: string, side: Record<string, string>) => Object.keys(side).filter((k) => isElem(k) && tableOf(k) === t);
  for (const k of diff) {
    if (ok.has(k) || isElem(k)) continue;
    const t = tableOf(k);
    const touched = diff.filter((x) => isElem(x) && tableOf(x) === t);
    if (touched.length && touched.every((x) => ok.has(x)) && (a[k] !== undefined || elemsOf(t, a).length === 0)) ok.add(k);
  }
  return ok;
}

/** Écarts entre deux fichiers, sur les sections présentes des deux côtés ; renvoie le nombre d'écarts comptés */
function compare(ref: FingerprintFile, cur: FingerprintFile): number {
  let total = 0;
  if (ref.meta.d2Maps !== cur.meta.d2Maps)
    console.log(`attention : cartes D2 privées ${ref.meta.d2Maps ? 'présentes' : 'absentes'} pour la référence, ${cur.meta.d2Maps ? 'présentes' : 'absentes'} ici`);
  for (const s of Object.keys(cur.sections)) {
    const a = ref.sections[s];
    const b = cur.sections[s];
    if (!a) {
      console.log(`${s} : absente de la référence`);
      continue;
    }
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    let diff = keys.filter((k) => a[k] !== b[k]);
    let movedN = 0;
    if (s === 'registries') {
      const moved = movedToMods(a, b, diff);
      if (moved.size) {
        const tables = [...new Set([...moved].filter((k) => !isModKey(k)).map(tableOf))];
        console.log(`${s} : ${moved.size} écart(s) dus à un déplacement vers un mod, non comptés (tables de la base touchées : ${tables.join(', ') || 'aucune'})`);
        diff = diff.filter((k) => !moved.has(k));
        movedN = moved.size;
      }
    }
    if (INFO.has(s)) {
      for (const k of diff) console.log(`${s} (info) ${k} : ${a[k] ?? '—'} → ${b[k] ?? '—'}`);
      continue;
    }
    if (!diff.length) console.log(`${s} : ${keys.length - movedN} empreintes identiques`);
    else {
      total += diff.length;
      console.log(`${s} : ${diff.length} écart(s) sur ${keys.length}`);
      for (const k of diff.slice(0, 40)) console.log(`  ${k} : ${a[k] === undefined ? 'ajoutée' : b[k] === undefined ? 'retirée' : `${a[k].slice(0, 24)} → ${b[k].slice(0, 24)}`}`);
      if (diff.length > 40) console.log(`  … ${diff.length - 40} de plus`);
    }
  }
  return total;
}

const only = opt('--only');
const outFile = opt('--out');
const refFile = opt('--compare');
const withFile = opt('--with');
const read = (f: string): FingerprintFile => JSON.parse(readFileSync(f, 'utf8'));

let cur: FingerprintFile;
if (withFile) cur = read(withFile);
else {
  const list = only ? only.split(',') : [...SECTIONS, ...(args.includes('--bundle') ? ['bundle'] : [])];
  for (const s of list) if (!SECTIONS.includes(s) && !INFO.has(s)) throw new Error(`section inconnue : ${s} (${[...SECTIONS, ...INFO].join(', ')})`);
  const jobs = Number(opt('--jobs') ?? process.env.FP_JOBS ?? 1) || 1;
  cur = await compute(list, jobs);
  if (outFile) writeFileSync(outFile, JSON.stringify(cur, null, 1));
}
if (refFile) {
  const n = compare(read(refFile), cur);
  console.log(n ? `${n} écart(s)` : 'aucun écart');
  process.exitCode = n ? 1 : 0;
}
