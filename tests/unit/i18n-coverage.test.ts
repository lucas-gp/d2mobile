import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import dict from '../../src/i18n/en.json';
import { activeModIds } from '../../src/mods/activate';
import { discoveredMods } from '../../src/mods/discover';
import { extractStrings } from '../../tools/i18n/extract-lib';

/**
 * Couverture de la traduction anglaise : les chaînes françaises affichables trouvées dans `src/` et dans les mods actifs (`mods/<id>/`, hors tests et
 * outils ; extraction par l'AST, `tools/i18n/extract-lib.ts`) qui n'ont pas d'entrée dans `en.json` (celui de la base ou `mods/<id>/i18n/en.json`). Les marqueurs {0}, {v}… sont comparés sans leur nom.
 * Le nombre de chaînes manquantes ne doit jamais AUGMENTER : ajoutez l'entrée anglaise dans `src/i18n/en.json` quand vous ajoutez un texte français.
 * Quand le nombre baisse, abaissez BASELINE en conséquence (le test le rappelle).
 *
 * Écartés volontairement : le journal des nouveautés (`changelog.ts`, déjà bilingue entrée par entrée), les synonymes de recherche du coffre (`stash-search.ts`),
 * les mots-clés de recherche des réglages (minuscules, jamais affichés) et le code des shaders.
 */
const BASELINE = 0; // mesuré à 99 avant la traduction du lot 179 (746 avec la mesure large de l’audit, qui compte aussi l’anglais déjà présent dans le code)

const norm = (s: string) =>
  s
    .replace(/\{[A-Za-z0-9_]+\}/g, '{}')
    .replace(/\s+/g, ' ')
    .trim();
const ACCENT = /[àâäçéèêëîïôöùûüœÀÂÇÉÈÊÎÔÙÛŒ]/;
const WORDS =
  /\b(le|la|les|des|du|de|une?|et|ou|pour|dans|sur|avec|sans|par|est|vous|votre|vos|aux|ce|cet|cette|ces|que|qui|pas|aucune?|déjà|requise?|tout|toute|tous|choisissez|touchez|impossible|oublier|importer|prendre|déposer|objets?|niveau|inventaire|invalide|inconnue?)\b/i;
const SKIP_FILES = /(changelog|stash-search)\.ts$/;

/** Traductions des mods actifs (ajoutées au dictionnaire à l'activation, src/mods), avec celles de leur manifest (nom, description : écran de création) */
const MOD_DICTS = activeModIds().map((m) => {
  const f = `mods/${m}/i18n/en.json`;
  const manifest = discoveredMods().find((x) => x.id === m)?.i18n ?? {};
  return { mod: m, dict: { ...(existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>) : {}), ...manifest } };
});

/** Gabarits du dictionnaire (« {0} runes {1} donnent… ») : une phrase écrite en entier dans les données (patch d'un mod) est traduite par eux, comme en jeu */
const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const TEMPLATES = [...Object.keys(dict), ...MOD_DICTS.flatMap((d) => Object.keys(d.dict))]
  .filter((k) => /\{[A-Za-z0-9_]+\}/.test(k))
  .map(
    (k) =>
      new RegExp(
        `^${k
          .split(/\{[A-Za-z0-9_]+\}/)
          .map(esc)
          .join('(.+?)')}$`,
      ),
  );

function missing(): string[] {
  const have = new Set([...Object.keys(dict), ...MOD_DICTS.flatMap((d) => Object.keys(d.dict))].map(norm));
  const out: string[] = [];
  for (const [key, locs] of extractStrings('.', ['src', ...activeModIds().map((m) => `mods/${m}`)])) {
    const files = [...locs].map((l) => l.replace(/:\d+$/, ''));
    if (files.every((f) => SKIP_FILES.test(f))) continue;
    if (/\buniform\b/.test(key)) continue;
    if (files.every((f) => /settings-catalog/.test(f)) && /^[a-z0-9àâçéèêëîïôùûü’' ]+$/.test(key) && key.includes(' ')) continue;
    if (have.has(norm(key))) continue;
    if (!key.includes('{') && TEMPLATES.some((re) => re.test(key))) continue;
    if (!ACCENT.test(key) && !WORDS.test(key)) continue;
    out.push(key);
  }
  return out;
}

describe('couverture i18n', () => {
  it('le nombre de chaînes françaises sans entrée dans en.json n’augmente pas', { timeout: 60000 }, () => {
    const m = missing();
    expect(m.length, `Chaînes sans traduction (ajoutez-les à src/i18n/en.json, ou à mods/<id>/i18n/en.json pour un texte de mod) :\n${m.slice(0, 60).join('\n')}`).toBeLessThanOrEqual(BASELINE);
    if (m.length < BASELINE) console.info(`i18n : ${m.length} chaîne(s) sans traduction, abaissez BASELINE à ${m.length}`);
  });

  it('les traductions d’un mod n’écrasent pas celles de la base', () => {
    for (const { mod, dict: d } of MOD_DICTS)
      expect(
        Object.keys(d).filter((k) => Object.hasOwn(dict, k)),
        mod,
      ).toEqual([]);
  });
});
