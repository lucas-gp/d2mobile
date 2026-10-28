// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const rel = (p) => relative(ROOT, p).split(sep).join('/');

/**
 * Frontière des mods (src/mods/README.md) : rien hors d'un mod n'importe `mods/<id>/` (le jeu, ses tests et ses outils le découvrent par
 * `import.meta.glob` ou tools/mods/node.ts, jamais par un import) ; le code d'un mod n'importe du jeu que l'API `src/mods/api` (types
 * compris) et le moteur exposé aux mods `src/mods/sdk` (son manifest, chargé au démarrage, seulement l'API) ; ses tests et ses outils
 * (`mods/<id>/tests`, `mods/<id>/tools`) peuvent importer le jeu, mais pas un autre mod.
 */
const modBoundary = {
  meta: { type: 'problem', schema: [] },
  create(ctx) {
    const file = rel(ctx.filename);
    const own = /^mods\/([^/]+)\/(.*)$/.exec(file);
    const check = (node, spec) => {
      if (typeof spec !== 'string' || !spec.startsWith('.')) return;
      const target = rel(resolve(dirname(ctx.filename), spec)).replace(/\.(ts|js|mjs|json)$/, '');
      const inMods = target === 'mods' || target.startsWith('mods/');
      if (!own) {
        if (inMods) ctx.report({ node, message: `« ${spec} » : un mod ne s'importe pas (découverte par import.meta.glob, src/mods/discover.ts)` });
        return;
      }
      const [, id, sub] = own;
      if (target === `mods/${id}` || target.startsWith(`mods/${id}/`)) return;
      if (inMods) ctx.report({ node, message: `« ${spec} » : un mod n'importe pas un autre mod` });
      else if (/^(tests|tools)\//.test(sub) || target === 'src/mods/api') return;
      else if (sub === 'manifest.ts') ctx.report({ node, message: `« ${spec} » : le manifest d'un mod n'importe du jeu que l'API src/mods/api (chargé au démarrage)` });
      else if (target !== 'src/mods/sdk') ctx.report({ node, message: `« ${spec} » : un mod n'importe du jeu que l'API src/mods/api et le moteur src/mods/sdk` });
    };
    return {
      ImportDeclaration: (n) => check(n, n.source.value),
      ExportNamedDeclaration: (n) => n.source && check(n, n.source.value),
      ExportAllDeclaration: (n) => check(n, n.source.value),
      ImportExpression: (n) => n.source.type === 'Literal' && check(n, n.source.value),
    };
  },
};

/** Configuration ESLint minimale (flat config) : règles recommandées, sans typage (rapide), sur le code applicatif et les tests. */
export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'public/', 'assets-src/', 'test-results/', 'playwright-report/', '.cache/', '.vercel/', '**/*.gen.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'api/**/*.ts', 'tests/**/*.ts', 'server/**/*.{ts,mjs}', 'tools/**/*.{ts,mjs,js}', 'mods/**/*.{ts,mjs,js}', '*.ts', '*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { d2m: { rules: { 'mod-boundary': modBoundary } } },
    rules: {
      'd2m/mod-boundary': 'error',
      // Le code existant utilise volontairement `as unknown as` et des blocs vides dans les tests ; ces règles sont gardées en avertissement ou coupées.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'warn',
      // Trop bruyantes sur l'existant (valeurs initiales défensives, erreurs relancées sans cause) : désactivées plutôt que de réécrire le code.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    // Scripts d'outillage (captures, e2e, génération) : code d'exploration jetable, on ne signale que les erreurs réelles (variables non définies, etc.).
    // Le service `server/` et le code applicatif gardent tous les avertissements.
    files: ['tools/**/*.{ts,mjs,js}', 'mods/*/tools/**/*.{ts,mjs,js}'],
    rules: { '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-explicit-any': 'off', 'prefer-const': 'off' },
  },
  { files: ['src/**/*.js'], languageOptions: { globals: { ...globals.serviceworker, ...globals.browser } } },
);
