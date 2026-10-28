/**
 * Configuration : dossiers d'entrée/sortie configurables (option, variable d'environnement, valeur par défaut).
 * Aucun fichier du jeu ni aucune sortie générée ne doit se trouver dans le dépôt : les valeurs par défaut
 * pointent hors du dépôt ($D2_PRIVATE_DIR) et le .gitignore du dossier protège les chemins locaux courants.
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Config {
  /** dossier contenant d2data.mpq, d2char.mpq, d2exp.mpq (et un éventuel patch_d2.mpq) */
  inDir: string;
  /** racine des sorties (inventory/, chars/, monsters/, tiles/, items/, preview/) */
  outDir: string;
  /** archives supplémentaires (les plus prioritaires), dans l'ordre */
  patches: string[];
  /** langue des tables de chaînes (data\local\lng\<lang>) */
  lang: string;
  /** palette utilisée pour les icônes d'objets (par défaut : palette standard de l'acte 1) */
  iconPalette: string;
  /** commandes ou options supplémentaires */
  args: string[];
  flags: Map<string, string>;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): { command: string; cfg: Config } {
  const flags = new Map<string, string>();
  const args: string[] = [];
  const patches: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      const val = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true');
      if (k === 'patch') patches.push(resolve(val));
      else flags.set(k, val);
    } else args.push(a);
  }
  const def = env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private');
  return {
    command: args[0] ?? 'help',
    cfg: {
      inDir: resolve(flags.get('in') ?? env.D2_INPUT_DIR ?? join(def, 'in')),
      outDir: resolve(flags.get('out') ?? env.D2_OUTPUT_DIR ?? join(def, 'out')),
      patches: [...patches, ...(env.D2_PATCH ? env.D2_PATCH.split(':').map((p) => resolve(p)) : [])],
      lang: flags.get('lang') ?? env.D2_LANG ?? 'eng',
      iconPalette: flags.get('icon-palette') ?? env.D2_ICON_PALETTE ?? 'act1',
      args: args.slice(1),
      flags,
    },
  };
}
