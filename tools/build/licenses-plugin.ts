/**
 * Avis de licence des paquets npm embarqués dans le build (pixi.js et ses dépendances : MIT, ISC, BSD…) : ces licences demandent de
 * garder l'avis de copyright dans toute copie. Le plugin lit la liste des modules réellement présents dans les morceaux du bundle,
 * remonte au paquet de chacun (`node_modules/<nom>` ou `node_modules/@scope/<nom>`) et écrit `THIRD_PARTY_LICENSES.txt` à la racine du
 * build : nom, version, licence déclarée et texte du fichier de licence du paquet. Les paquets de développement n'y sont pas (ils ne
 * sont pas dans le bundle). Sortie triée et stable (même build = même fichier).
 * Le code tiers porté dans le dépôt (blast.c, tiny-inflate, StormLib : tools/d2import, aussi dans le bundle) a ses avis dans
 * THIRD_PARTY_NOTICES.md §4 : chaque sous-section dont un fichier cité dans le titre est dans le bundle y est recopiée.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

export const LICENSES_FILE = 'THIRD_PARTY_LICENSES.txt';

export interface BundledPackage {
  name: string;
  version: string;
  license: string;
  /** texte du fichier de licence du paquet, ou null s'il n'en livre pas */
  text: string | null;
  /** auteur déclaré (package.json), pour l'avis de copyright d'un paquet sans fichier de licence */
  author: string | null;
}

/** Texte de la licence MIT (pour un paquet MIT qui ne livre pas son fichier : l'avis de copyright est reconstitué depuis `author`) */
const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** Dossier du paquet npm d'un identifiant de module (null : module du projet ou virtuel) */
export function packageDirOf(id: string): string | null {
  const p = id.replace(/^\0/, '').split('?')[0].split('\\').join('/');
  const i = p.lastIndexOf('/node_modules/');
  if (i < 0) return null;
  const rest = p.slice(i + '/node_modules/'.length).split('/');
  const n = rest[0]?.startsWith('@') ? 2 : 1;
  if (rest.length <= n || !rest[0]) return null;
  return p.slice(0, i + '/node_modules/'.length) + rest.slice(0, n).join('/');
}

const LICENSE_RE = /^(licen[cs]e|copying)([-.](md|txt|mit|bsd))?$/i;

/** Paquets (dédoublonnés, triés par nom puis version) des modules donnés */
export function collectPackages(moduleIds: Iterable<string>): BundledPackage[] {
  const dirs = new Set<string>();
  for (const id of moduleIds) {
    const d = packageDirOf(id);
    if (d) dirs.add(d);
  }
  const out = new Map<string, BundledPackage>();
  for (const dir of dirs) {
    const pj = join(dir, 'package.json');
    if (!existsSync(pj)) continue;
    const pkg = JSON.parse(readFileSync(pj, 'utf8')) as { name?: string; version?: string; license?: unknown; author?: unknown };
    const name = pkg.name ?? dir.slice(dir.lastIndexOf('node_modules/') + 13);
    const version = pkg.version ?? '?';
    const key = `${name}@${version}`;
    if (out.has(key)) continue;
    const lf = readdirSync(dir)
      .filter((f) => LICENSE_RE.test(f))
      .sort()[0];
    out.set(key, {
      name,
      version,
      license: typeof pkg.license === 'string' ? pkg.license : 'voir le paquet',
      text: lf ? readFileSync(join(dir, lf), 'utf8').trim() : null,
      author: typeof pkg.author === 'string' ? pkg.author : pkg.author && typeof (pkg.author as { name?: unknown }).name === 'string' ? (pkg.author as { name: string }).name : null,
    });
  }
  return [...out.values()].sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
}

/** Avis d'un code tiers porté dans le dépôt (sous-section « ### » de THIRD_PARTY_NOTICES.md §4) */
export interface PortedNotice {
  /** titre de la sous-section, sans « ### » */
  title: string;
  /** fichiers du dépôt cités dans le titre (`tools/d2import/blast.ts`…) */
  files: string[];
  text: string;
}

/** Sous-sections de la partie 4 de THIRD_PARTY_NOTICES.md (code tiers porté) */
export function portedNotices(notices: string): PortedNotice[] {
  const start = notices.search(/^## 4\./m);
  if (start < 0) return [];
  const rest = notices.slice(start);
  const end = rest.slice(1).search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end + 1))
    .split(/^### /m)
    .slice(1)
    .map((sec) => {
      const [title, ...body] = sec.split('\n');
      return { title: title.trim(), files: [...title.matchAll(/`([^`]+)`/g)].map((m) => m[1]), text: body.join('\n').trim() };
    })
    .filter((n) => n.files.length > 0);
}

/** Avis du code porté dont un fichier est parmi les modules du bundle */
export function bundledPorted(moduleIds: Iterable<string>, notices: PortedNotice[]): PortedNotice[] {
  const ids = [...moduleIds].map((id) => id.replace(/^\0/, '').split('?')[0].split('\\').join('/'));
  return notices.filter((n) => n.files.some((f) => ids.some((id) => id.endsWith(`/${f}`))));
}

/** Texte du fichier d'avis */
export function renderLicenses(pkgs: BundledPackage[], ported: PortedNotice[] = []): string {
  const head = [
    'D2 Mobile: licenses of the third-party packages bundled in this build.',
    'The game code is MIT-licensed (LICENSE file of the repository); third-party assets and data are listed in THIRD_PARTY_NOTICES.md and LICENSE-DATA.md.',
    '',
    ...pkgs.map((p) => `- ${p.name} ${p.version} (${p.license})`),
  ];
  const fallback = (p: BundledPackage): string =>
    p.license === 'MIT' && p.author
      ? `(texte reconstitué : le paquet ne livre pas de fichier de licence)\n\nMIT License\n\nCopyright (c) ${p.author}\n\n${MIT_TEXT}`
      : `(le paquet ne livre pas de fichier de licence ; licence déclarée : ${p.license}${p.author ? `, auteur : ${p.author}` : ''})`;
  const body = pkgs.map((p) => [`${'='.repeat(78)}`, `${p.name} ${p.version} — ${p.license}`, '', p.text ?? fallback(p)].join('\n'));
  const code = ported.map((n) => [`${'='.repeat(78)}`, `${n.title} (code porté dans le dépôt)`, '', n.text].join('\n'));
  return [...head, '', ...body, ...code, ''].join('\n');
}

export function licensesPlugin(): Plugin {
  return {
    name: 'd2m-licenses',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const ids: string[] = [];
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        const c = item as { moduleIds?: string[]; modules?: Record<string, unknown> };
        ids.push(...(c.moduleIds ?? Object.keys(c.modules ?? {})));
      }
      const notices = portedNotices(readFileSync(fileURLToPath(new URL('../../THIRD_PARTY_NOTICES.md', import.meta.url)), 'utf8'));
      // les Workers de l'importeur (inflate.ts…) sont construits à part : leurs modules ne sont pas listés ici. Dès qu'un fichier de
      // l'importeur est dans le bundle, tous les avis du code porté y vont.
      const ported = bundledPorted(ids, notices).length ? notices : [];
      this.emitFile({ type: 'asset', fileName: LICENSES_FILE, source: renderLicenses(collectPackages(ids), ported) });
    },
  };
}
