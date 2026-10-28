/**
 * Guard: the game's former name never comes back. The game is "D2 Mobile" (D2M); every versioned file is scanned (`git ls-files`) for
 * the former name in French or English, in any case, in file contents and in file paths.
 *
 * What is NOT the former name, and therefore allowed (Diablo II content keeps its official names; ids are content and never change):
 * 1. Place and item names: Chaos / Arcane Sanctuary (and their French names), Sanctuary of Sin / of Zhar, Kerke's / Gerke's Sanctuary.
 * 2. French shrine names ("Sanctuaire de santé"…) and the French common noun for a shrine (lowercase, or capitalized plural).
 * 3. Lowercase `sanctuary…` content ids (`sanctuary` aura, `rw_sanctuary`, `u_kerkes_sanctuary`, `sanctuary_sin`, `aurasanctuary`…).
 * 4. The capitalized word alone, i.e. the Paladin aura / the runeword / the generic shrine label: only in the files of ALLOWED, at most
 *    that many times each (one more is a failure: it may be the former project name).
 * 5. src/platform/legacy-names.ts: the only file that spells the former prefix, for the storage migration and for the plaintext of the
 *    verify file of an encrypted folder made before the rename (cryptographic compatibility, see docs/STORAGE.md). This guard is skipped too.
 * A form glued to `.`, `-`, `/`, `_` or a backslash, or a lowercase form in quotes (storage key, package, plugin, cache name…), is
 * never allowed.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The single file allowed to spell the former prefix (rule 5) */
const COMPAT_FILE = 'src/platform/legacy-names.ts';
/** This guard (it has to spell what it looks for) */
const SELF = 'tests/unit/no-legacy-name.test.ts';

/** Rules 1 and 2: Diablo II place, item and shrine names (case-sensitive), masked before the scan */
const LORE = [
  /Sanctuaire du Chaos/g,
  /Sanctuaire des [Aa]rcanes/g,
  /Sanctuaire de (Kerke|Zhar)/g,
  /Sanctuaire du Péché/g,
  /Chaos Sanctuary/g,
  /Arcane Sanctuary/g,
  /Sanctuary of (Sin|Zhar)/g,
  /[KG]erke's Sanctuary/g,
  // French shrine names: « Sanctuaire de santé », « Sanctuaire d’armure », « Sanctuaire explosif », « sanctuaire « magique » »…
  /[Ss]anctuaires? (de |d’|d'|du |des |explosif|« magique »)/g,
];

/**
 * Rule 4: files naming the Paladin aura "Sanctuary" (French "Sanctuaire"), the runeword, or the generic shrine label, with the
 * maximum count of such standalone capitalized words. Lower a count when you remove one; never raise it for the project's name.
 */
const ALLOWED: Record<string, number> = {
  // aura, runeword, shrine label and their English translations; « Le Sanctuaire est libéré de son maître » (Arcane Sanctuary quest)
  'src/i18n/en.json': 6,
  'src/ui/changelog.ts': 6, // aura in past release notes (FR + EN)
  'src/data/skills-paladin.ts': 1, // aura name
  'src/data/items/runewords-d2.ts': 1, // runeword name
  'src/data/d2s-tables.gen.json': 1, // runeword name in the .d2s tables
  'src/data/quests.ts': 1, // Arcane Sanctuary quest line
  'src/sim/world.ts': 1, // generic shrine label
  'src/sim/paladin.ts': 2,
  'src/sim/derive-calc.ts': 2,
  'src/sim/combat.ts': 1,
  'src/sim/merc.ts': 1,
  'src/mods/d2/skills.ts': 2,
  'src/render/renderer-fx.ts': 1,
  'src/ui/merc-auras.ts': 1,
  'tests/unit/shrines.test.ts': 1, // shrine label
  'tests/unit/vanilla-class-rules.test.ts': 2,
  'tools/ci/pd2-residual.ts': 2,
  'tools/skilldata/paladin.py': 1,
  'tools/vanilla/skills-numbers.ts': 1,
  'mods/pd2/README.md': 1,
  'mods/pd2/data/items/runewords.patch.ts': 1,
  'mods/pd2/data/mercs.patch.ts': 1,
  'mods/pd2/tests/unit/skills-pd2-paladin.test.ts': 2,
  'mods/pd2/tools/itemdata/pd2text.py': 1,
  'mods/pd2/tools/skilldata/pd2-wiki.json': 2,
  'mods/pd2/docs/ETUDE-PD2.md': 4,
  'mods/pd2/docs/audit/07-pd2.md': 2,
  'mods/pd2/docs/audit/skills-pd2-paladin.md': 1,
  'docs/JOURNAL.md': 3, // aura in the history of lots M8d; the rename lot naming the content it keeps
  'docs/internal/MODS-RESIDUEL.md': 2,
  'docs/internal/audit/02-competences.md': 2,
  'docs/internal/audit/03-monstres.md': 1,
  'docs/internal/audit/04-monde.md': 1,
};

const WORD = /sanctua[a-z]*/gi;

interface Hit {
  file: string;
  line: number;
  text: string;
}

/** Occurrences of the word that no general rule (1, 2, 3) allows: [standalone capitalized words, forbidden forms] */
export function scan(file: string, content: string): { standalone: Hit[]; forbidden: Hit[] } {
  let t = content;
  for (const re of LORE) t = t.replace(re, (m) => '#'.repeat(m.length));
  const standalone: Hit[] = [];
  const forbidden: Hit[] = [];
  t.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(WORD)) {
      const w = m[0];
      const at = m.index;
      const prev = line[at - 1] ?? ' ';
      const next = line[at + w.length] ?? ' ';
      // glued to an identifier: `x.sanctuaire`, `sanctuaire-d2`, `'sanctuaire'`… (quotes count for the lowercase form only)
      const before = w[0] === 's' ? /[\w.\-_/\\'"`]/ : /[\w.\-_/\\]/;
      const glued = before.test(prev) || (/[.\-_/\\'"`]/.test(next) && /\w/.test(line[at + w.length + 1] ?? ''));
      const hit = { file, line: i + 1, text: line.slice(Math.max(0, at - 40), at + w.length + 40).trim() };
      // rule 3: content ids
      if (w.startsWith('sanctuary')) continue;
      // rule 2: French common noun (lowercase), capitalized plural (« Sanctuaires et puits »)
      if (!glued && (/^sanctuaires?$/.test(w) || w === 'Sanctuaires')) continue;
      // rule 4: capitalized word alone (aura, runeword, shrine label)
      if (!glued && /^Sanctua(ire|ry)$/.test(w)) standalone.push(hit);
      else forbidden.push(hit);
    }
  });
  return { standalone, forbidden };
}

/** Directories never versioned (build outputs, dependencies, caches): skipped when the files are listed without git */
const UNVERSIONED = new Set(['node_modules', 'dist', 'coverage', 'test-results', 'playwright-report', '__pycache__']);
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = d === '.' ? f : join(d, f);
    if (UNVERSIONED.has(f) || (f.startsWith('.') && statSync(p).isDirectory())) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** Versioned files (`git ls-files`); outside a git checkout (copy of the repository, suppression test), every file but outputs */
function versionedFiles(): string[] {
  try {
    return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter((f) => f && existsSync(f));
  } catch {
    return walk('.').map((f) => f.replaceAll('\\', '/')); // séparateurs `/` sous Windows aussi
  }
}

describe('former name of the game', () => {
  const files = versionedFiles();

  it('no versioned file has it in its path', () => {
    expect(files.filter((f) => /sanctuaire/i.test(f))).toEqual([]);
  });

  it('no versioned file contains it (Diablo II content names and the compatibility file excepted)', () => {
    const forbidden: string[] = [];
    const over: string[] = [];
    for (const f of files) {
      if (f === COMPAT_FILE || f === SELF) continue;
      let content: string;
      try {
        content = readFileSync(f, 'utf8');
      } catch {
        continue;
      }
      if (!/sanctua/i.test(content)) continue;
      const r = scan(f, content);
      for (const h of r.forbidden) forbidden.push(`${h.file}:${h.line}: ${h.text}`);
      if (r.standalone.length > (ALLOWED[f] ?? 0)) over.push(`${f}: ${r.standalone.length} > ${ALLOWED[f] ?? 0} — ${r.standalone.map((h) => `${h.line}: ${h.text}`).join(' | ')}`);
    }
    expect(forbidden, 'former name glued to a key, package, path or quote').toEqual([]);
    expect(over, 'capitalized word alone beyond the files and counts of ALLOWED (project name?)').toEqual([]);
    // counts kept exact: one removed → lower it (a stale allowance would hide a project name added later)
    const counted = new Map<string, number>();
    for (const f of Object.keys(ALLOWED)) if (existsSync(f)) counted.set(f, scan(f, readFileSync(f, 'utf8')).standalone.length);
    expect([...counted].filter(([f, n]) => n !== ALLOWED[f]).map(([f, n]) => `${f}: ${n} (ALLOWED ${ALLOWED[f]})`)).toEqual([]);
  });

  it('the compatibility file spells the former prefix exactly once', () => {
    expect(readFileSync(COMPAT_FILE, 'utf8').match(/sanctuaire/gi)).toHaveLength(1);
  });

  it('the scan tells the project name from Diablo II content', () => {
    const s = (t: string) => scan('x', t);
    // project name, keys, packages: caught
    expect(s('localStorage.getItem("sanctuaire.save")').forbidden).toHaveLength(1);
    expect(s('const CACHE = `sanctuaire-${VERSION}`').forbidden).toHaveLength(1);
    expect(s('"name": "sanctuaire",').forbidden).toHaveLength(1);
    expect(s('# Sanctuaire').standalone).toHaveLength(1);
    expect(s('Sanctuary — loading…').standalone).toHaveLength(1);
    expect(s('SANCTUAIRE').forbidden).toHaveLength(1);
    // Diablo II content: allowed
    const lore = "Sanctuaire du Chaos, Arcane Sanctuary, Sanctuaire de santé, les sanctuaires, rw_sanctuary, aura sanctuary, Gerke's Sanctuary";
    expect(s(lore)).toEqual({ standalone: [], forbidden: [] });
  });
});
