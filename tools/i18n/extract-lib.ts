/**
 * Extrait des sources toutes les chaînes affichables en français (littéraux et gabarits) : catalogue de clés avec « {0} » à la place des expressions.
 * Bibliothèque partagée par `extract.ts` (CLI) et `tests/unit/i18n-coverage.test.ts`.
 */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Reconnaît un texte français (lettres accentuées ou mots courants) */
export const FR =
  /[àâäçéèêëîïôöùûüœÀÂÇÉÈÊÎÔÙÛŒ]|\b(le|la|les|des|du|de|un|une|et|ou|pour|dans|sur|avec|sans|par|est|vous|votre|vos|aux|au|ce|cet|cette|ces|que|qui|pas|plus|aucun|aucune|tout|toute|tous|déjà|requis|requise|niveau|force|dextérité|vie|mana|or|sort|sorts|objet|objets|zone|run|Choisissez|Touchez|Impossible|Inventaire|Retirer|Équiper)\b/i;
/**
 * Chaînes affichables des sources `<root>/src/**` (ou des dossiers `dirs`, ex. `mods/pd2` : ses tests et outils sont écartés) : clé (avec
 * « {0} » pour les expressions) → emplacements
 */
export function extractStrings(root = '.', dirs: string[] = ['src']): Map<string, Set<string>> {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) {
        if (!/^mods[\\/][^\\/]+[\\/](tests|tools)$/.test(relative(root, p))) walk(p);
      } else if (/\.ts$/.test(f)) files.push(p);
    }
  };
  for (const d of dirs) walk(join(root, d));
  const out = new Map<string, Set<string>>();
  for (const f of files) {
    if (/\.test\.ts$/.test(f) || /src[\\/]debug/.test(f)) continue;
    const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
    const add = (key: string, node: ts.Node) => {
      const k = key.replace(/\s+/g, ' ').trim();
      if (k.length < 2 || !/[A-Za-zÀ-ÿ]/.test(k)) return;
      if (/^[a-z0-9_:.\-/#%]+$/.test(k)) return;
      // texte affiché probable : français reconnu, ou phrase/étiquette (espace, majuscule initiale ou ponctuation) — les identifiants, classes CSS et chemins sont écartés
      const looksText = FR.test(k) || (/\s/.test(k) && (/^[A-ZÀ-Ý{]/.test(k) || /[:.,;!?()]/.test(k))) || /^[A-ZÀ-Ý][a-zà-ÿ]{3,}$/.test(k);
      if (!looksText) return;
      if (/^(https?:|\.|#|[a-z-]+\s*:\s*[#\d.])/.test(k) || /\b(px|rgba?|translate|scale|calc)\(/.test(k)) return;
      const line = src.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (!out.has(key)) out.set(key, new Set());
      out.get(key)!.add(`${f}:${line}`);
    };
    const visit = (n: ts.Node) => {
      if (ts.isImportDeclaration(n)) return;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) add(n.text, n);
      else if (ts.isTemplateExpression(n)) {
        let k = n.head.text;
        n.templateSpans.forEach((s, i) => {
          k += `{${i}}` + s.literal.text;
        });
        add(k, n);
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return out;
}
