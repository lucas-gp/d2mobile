/** Exécute UNE section d'empreinte dans son propre processus (état des modules neuf) : `tsx section.ts <nom> <sortie.json>` */
import { existsSync, writeFileSync } from 'node:fs';

const [name, file] = process.argv.slice(2);
// jeu de règles activé et registres gelés (tables comprises) avant la section, comme au démarrage du jeu (src/main.ts) ; `FP_RULESET` pour
// un autre jeu de règles. Le module n'existe qu'à partir du lot 201 : une référence plus ancienne se calcule sans activation.
// À partir du lot 202 (M4), les mods de mods/ sont découverts comme au build (variable MODS) : tools/mods/node.ts.
const activate = new URL('../../src/mods/activate.ts', import.meta.url);
const nodeMods = new URL('../mods/node.ts', import.meta.url);
if (name !== 'bundle' && existsSync(nodeMods)) await (await import(nodeMods.href)).activateForTools(process.env.FP_RULESET ?? 'pd2', { freezeTables: true });
else if (name !== 'bundle' && existsSync(activate)) await (await import(activate.href)).activateRuleset(process.env.FP_RULESET ?? 'pd2', { freezeTables: true });
const mod = (await import(`./sections/${name}.ts`)) as { run: () => Promise<Record<string, string>> };
const res = await mod.run();
const sorted = Object.fromEntries(
  Object.keys(res)
    .sort()
    .map((k) => [k, res[k]]),
);
writeFileSync(file, JSON.stringify(sorted));
