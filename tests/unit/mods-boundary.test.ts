import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

/** Règle ESLint de frontière des mods (eslint.config.js, `d2m/mod-boundary`) sur des textes d'essai placés à divers endroits du dépôt */
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: ROOT });

async function boundary(file: string, text: string): Promise<string[]> {
  const [r] = await eslint.lintText(text, { filePath: ROOT + file });
  return r.messages.filter((m) => m.ruleId === 'd2m/mod-boundary').map((m) => m.message);
}

describe('frontière des mods (ESLint)', () => {
  it('le jeu, ses tests et ses outils n’importent jamais un mod ; src/mods reste importable', { timeout: 60000 }, async () => {
    expect(await boundary('src/sim/x.ts', "import a from '../../mods/pd2/index';\nexport default a;\n")).toHaveLength(1);
    expect(await boundary('tests/unit/x.test.ts', "export const m = await import('../../mods/pd2/manifest');\n")).toHaveLength(1);
    expect(await boundary('tools/bots/x.ts', "export * from '../../mods/pd2/index';\n")).toHaveLength(1);
    expect(await boundary('src/sim/x.ts', "import { activeRuleset } from '../mods/activate';\nexport default activeRuleset;\n")).toEqual([]);
  });

  it('un mod n’importe du jeu que src/mods/api et src/mods/sdk (son manifest : l’API seule) ; ses tests et outils importent le jeu, pas un autre mod', { timeout: 60000 }, async () => {
    expect(await boundary('mods/pd2/data/x.ts', "import { BASES } from '../../../src/data/items/bases';\nexport default BASES;\n")).toEqual([
      expect.stringMatching(/que l'API src\/mods\/api et le moteur/),
    ]);
    expect(await boundary('mods/pd2/data/x.ts', "import type { ItemBase } from '../../../src/mods/api';\nexport type X = ItemBase;\n")).toEqual([]);
    expect(await boundary('mods/pd2/data/x.ts', "import { y } from './y';\nexport default y;\n")).toEqual([]);
    expect(await boundary('mods/pd2/sim/x.ts', "import { Rng } from '../../../src/mods/sdk';\nexport default Rng;\n")).toEqual([]);
    expect(await boundary('mods/pd2/manifest.ts', "import { Rng } from '../../src/mods/sdk';\nexport default Rng;\n")).toEqual([expect.stringMatching(/manifest/)]);
    expect(await boundary('mods/pd2/tests/unit/x.test.ts', "import { BASES } from '../../../../src/data/items/bases';\nexport default BASES;\n")).toEqual([]);
    expect(await boundary('mods/pd2/tests/unit/x.test.ts', "import a from '../../../autre/index';\nexport default a;\n")).toEqual([expect.stringMatching(/autre mod/)]);
  });
});
