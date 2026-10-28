/**
 * Documentation publique : chaque chemin du dépôt cité entre accents graves (`src/…`, `tools/…`, `mods/…`…) existe encore. Hors champ :
 * le JOURNAL et docs/internal (historiques et études datées), les motifs (`*`, `{a,b}`, `<classe>`). Un chemin peut omettre l'extension
 * `.ts` (spécificateur de module) ; dans un README de mod, il peut être relatif au dossier du mod. Sans dossier `mods/` (test de
 * suppression), les chemins des mods sont ignorés.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOTS = ['src/', 'tools/', 'docs/', 'mods/', 'tests/', 'api/', 'server/', 'public/', 'assets-src/', '.github/'];
/** Fichiers retirés du dépôt et cités comme tels (docs/DERIVED-DATA.md, « Fichiers retirés du dépôt » ; ancien nom d'un fichier déplacé) */
const REMOVED = new Set(['src/data/skills-pd2.ts', 'tools/skilldata/pd2-skills.json', 'tools/itemdata/names-fr.py', 'tools/itemdata/affixes-fr.json']);

const walk = (d: string, keep: (f: string) => boolean): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (f === 'node_modules' || f.startsWith('.')) return [];
    // séparateurs `/` (sous Windows, join rend des `\`) : les chemins des README de mods commencent par `mods/`
    return statSync(p).isDirectory() ? walk(p, keep) : keep(p) ? [p.replaceAll('\\', '/')] : [];
  });

const docs = [
  'README.md',
  'CONTRIBUTING.md',
  ...readdirSync('docs')
    .filter((f) => f.endsWith('.md') && f !== 'JOURNAL.md')
    .map((f) => `docs/${f}`),
  ...['src', 'tools', 'mods'].filter((d) => existsSync(d)).flatMap((d) => walk(d, (f) => f.endsWith('README.md'))),
];

const exists = (p: string, from: string): boolean =>
  [p, `${p}.ts`, `${p}.mjs`].some((c) => existsSync(c)) || (from.startsWith('mods/') && [join(dirname(from), p), join(dirname(from), `${p}.ts`)].some((c) => existsSync(c)));

describe('documentation : chemins cités', () => {
  it('chaque chemin du dépôt cité dans la documentation publique existe', () => {
    const bad: string[] = [];
    for (const f of docs)
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const [, m] of line.matchAll(/`([^`\s]+)`/g)) {
            if (!ROOTS.some((r) => m.startsWith(r)) || /[*{}<>…|$]/.test(m)) continue;
            // copie sans mods/ (test de suppression, tools/ci/suppression.mjs) : les chemins des mods ne peuvent pas y exister
            if (m.startsWith('mods/') && !existsSync('mods')) continue;
            const p = m.split(/[:#]/)[0].replace(/[/.,]+$/, '');
            if (!REMOVED.has(p) && !exists(p, f)) bad.push(`${f}:${i + 1} ${m}`);
          }
        });
    expect(bad, bad.join('\n')).toEqual([]);
    expect(docs.length).toBeGreaterThan(10);
  });
});
