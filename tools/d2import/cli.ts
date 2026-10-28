#!/usr/bin/env -S npx tsx
/**
 * Importeur Diablo II : lit les archives MPQ du joueur (d2data, d2char, d2exp, patchs éventuels) comme un seul
 * système de fichiers et produit des assets exploitables par n'importe quel moteur.
 *   npx tsx tools/d2import/cli.ts <commande> [--in <dossier>] [--out <dossier>] [--patch <archive.mpq>]
 * Commandes : inventory | chars | monsters | tiles | icons | preview | all
 */
import { parseArgs } from './config';
import { Vfs } from './vfs';
import { GameData } from './data';
import { runInventory } from './inventory';
import { exportChars, exportMonsters } from './export-anims';
import { exportTiles } from './export-tiles';
import { exportIcons } from './export-icons';
import { buildPreview } from './preview';
import { exportGame } from './export-game';
import { runFloors } from './ground-control';

const HELP = `Importeur Diablo II
Usage : cli.ts <commande> [options]
Commandes :
  inventory   inventaire lisible des archives (inventory/inventory.md + .json)
  chars       animations des personnages (feuilles PNG + JSON)
  monsters    animations des monstres
  tiles       tuiles de niveau (PNG individuels + atlas + métadonnées)
  icons       icônes d'inventaire (PNG)
  preview     page HTML locale de contrôle
  game        planches au format du jeu (remplacent les sprites actuels, voir README)
  floors      planche de contrôle des sols d'un DT1 : floors <acte>:<chemin.dt1>… (sortie control/)
  all         toutes les étapes dans l'ordre
Options :
  --in <dossier>      dossier des .mpq (défaut : $D2_INPUT_DIR ou $D2_PRIVATE_DIR/in)
  --out <dossier>     dossier de sortie (défaut : $D2_OUTPUT_DIR ou $D2_PRIVATE_DIR/out)
  --patch <fichier>   archive supplémentaire, prioritaire sur les autres (répétable)
  --lang <code>       langue des chaînes (défaut eng)
  --icon-palette <n>  palette des icônes (défaut act1)
`;

const { command, cfg } = parseArgs(process.argv.slice(2));
if (command === 'help' || command === '--help') {
  console.log(HELP);
  process.exit(0);
}
const t0 = Date.now();
const vfs = Vfs.open(cfg.inDir, cfg.patches);
const data = new GameData(vfs, cfg.lang, cfg.inDir);
const log = (s: string) => console.log(s);
log(
  `Archives (priorité croissante) : ${vfs
    .info()
    .map((a) => a.name)
    .join(' < ')}`,
);
log(`Sortie : ${cfg.outDir}`);
const steps: Record<string, () => void | Promise<void>> = {
  inventory: () => runInventory(data, cfg.outDir, log),
  chars: () => void exportChars(data, cfg.outDir, log),
  monsters: () => void exportMonsters(data, cfg.outDir, log),
  tiles: () => void exportTiles(data, cfg.outDir, log),
  icons: () => void exportIcons(data, cfg.outDir, log, cfg.iconPalette),
  preview: () => buildPreview(cfg.outDir, log),
  game: async () => void (await exportGame(data, cfg.outDir, log, cfg.args)),
  floors: () => runFloors(data, cfg.outDir, log, cfg.args),
};
const order = command === 'all' ? Object.keys(steps).filter((k) => !['game', 'floors'].includes(k)) : [command];
for (const name of order) {
  const step = steps[name];
  if (!step) {
    console.error(`Commande inconnue : ${name}\n\n${HELP}`);
    process.exit(2);
  }
  log(`\n== ${name}`);
  await step();
}
vfs.close();
log(`\nTerminé en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
