import { defineConfig } from 'vitest/config';
import { includedMods, modsPlugin } from './tools/build/mods-plugin.ts';

// mods inclus (variable MODS, comme le build) : leurs tests (mods/<id>/tests) tournent avec ceux de la base ; `MODS=` : la base seule
const MODS = includedMods(process.cwd());

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // le code des mods inclus est du code du jeu (déplacé de src/ lots M4 à M5) : compté comme lui, hors tests et outils des mods
      include: ['src/**/*.ts', 'api/**/*.ts', 'server/**/*.mjs', 'mods/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.gen.ts', 'src/sw-template.js', 'mods/*/tests/**', 'mods/*/tools/**'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      // Seuils fixés juste sous la couverture mesurée SANS fichiers D2 privés, comme en CI (lot 197 : lignes 58,9 %, instructions 57,3 %, branches 53,5 %, fonctions 53,4 % ; avec les fichiers privés : 60,2 / 58,7 / 54,7 / 54,6 ; hors 4 tests de cartes trop lents sous instrumentation) : ne jamais les relever au-dessus du mesuré ni les baisser.
      thresholds: { lines: 58, statements: 57, branches: 53, functions: 53 },
    },
    projects: [
      {
        plugins: [modsPlugin()],
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', ...MODS.map((m) => `mods/${m}/tests/unit/**/*.test.ts`)],
          environment: 'node',
          setupFiles: ['tests/setup-ruleset.ts'],
        },
      },
      {
        // build public complet (vite build) : hors de la suite unitaire, job « suppression » de la CI
        test: {
          name: 'build',
          include: ['tests/build/**/*.test.ts'],
          environment: 'node',
          testTimeout: 200_000,
        },
      },
      {
        plugins: [modsPlugin()],
        test: {
          name: 'bots',
          include: ['tests/bots/**/*.test.ts', ...MODS.map((m) => `mods/${m}/tests/bots/**/*.test.ts`)],
          environment: 'node',
          setupFiles: ['tests/setup-ruleset.ts'],
          testTimeout: 30 * 60 * 1000,
          hookTimeout: 60 * 1000,
        },
      },
    ],
  },
});
