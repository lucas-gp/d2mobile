/**
 * Affiche l'état d'un personnage sauvegardé par les bots (équipement, statistiques, matériaux) :
 *   npx tsx tools/bots/inspect-save.ts test-results/bots/premaps-cold-1.json
 */
import '../mods/auto';
import { readFileSync } from 'node:fs';
import { computeDerived } from '../../src/sim/character';
import { Game } from '../../src/sim/game';
import { migrate } from '../../src/sim/save';

const raw = JSON.parse(readFileSync(process.argv[2] ?? 'test-results/bots/premaps-cold-1.json', 'utf8'));
const g = new Game(migrate(raw.save ?? raw));
const c = g.character;
const d = computeDerived(c, 2);
console.log(`niveau ${c.level} vie ${Math.round(d.lifeMax)} mana ${Math.round(d.manaMax)} FCR ${d.fcr} FHR ${d.fhr} déf ${Math.round(d.defense)} MF ${d.mf}`);
console.log('résistances', JSON.stringify(d.res), 'base', JSON.stringify(c.base));
console.log('compétences', JSON.stringify(c.skills));
for (const [s, it] of Object.entries(c.equipment)) console.log(`  ${s.padEnd(8)} ${it!.base} ${it!.runeword ?? it!.quality} châsses ${it!.sockets} [${it!.socketed.map((x) => x.base).join(' ')}]`);
console.log('matériaux', JSON.stringify(c.materials));
console.log(
  'coffre',
  c.stash
    .flat()
    .filter(Boolean)
    .map((x) => `${x!.base}:${x!.quality}:${x!.sockets}`)
    .join(' '),
);
console.log(
  'inventaire',
  c.inventory
    .filter(Boolean)
    .map((x) => `${x!.base}:${x!.quality}:${x!.sockets}`)
    .join(' '),
);
