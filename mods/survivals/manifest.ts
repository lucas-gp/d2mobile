/**
 * Survivals: a game mode for Diablo II in the manner of the "survivors" games. Each round is a closed arena cut from a real zone of the
 * act, with waves of its monsters, champions, a unique and its super-unique as the checkpoint; a skill choice at every level. Manifest
 * only, loaded at startup; the content (index.ts) is a separate chunk loaded when the ruleset `d2+survivals` is activated. See README.md.
 */
import { defineManifest } from '../../src/mods/api';

export default defineManifest({
  id: 'survivals',
  name: 'Survivals',
  version: '0.1.0',
  kind: 'gamemode',
  // Diablo II first (owner's decision, lot 273), Project Diablo 2 from lot 284 (`pd2+survivals`)
  rulesets: ['d2', 'pd2'],
  // lot 289 (owner's decision): the roguelite Run by default, the Campaign of lots 273-288 as a choice
  variants: [
    { id: 'run', name: 'Run', description: 'Un acte par run, niveau 1 à chaque départ : l’équipement, l’or et les actes ouverts restent.' },
    { id: 'campaign', name: 'Campagne', description: 'Le niveau et les compétences restent ; une mort ne coûte que la manche.' },
  ],
  description: 'Survivals : des vagues de monstres dans une arène, un choix de compétence à chaque niveau, la progression de Diablo II.',
  tagline: 'Des runs d’un acte, vague après vague',
  i18n: {
    'Des runs d’un acte, vague après vague': 'One-act runs, wave after wave',
    'Survivals : des vagues de monstres dans une arène, un choix de compétence à chaque niveau, la progression de Diablo II.':
      'Survivals: waves of monsters in an arena, a skill choice at every level, the progression of Diablo II.',
    'Un acte par run, niveau 1 à chaque départ : l’équipement, l’or et les actes ouverts restent.': 'One act a run, level 1 at each start: gear, gold and the acts opened stay.',
    'Le niveau et les compétences restent ; une mort ne coûte que la manche.': 'Level and skills stay; a death only costs the round.',
  },
  license: { data: 'LicenseRef-D2-Derived-Data', code: 'MIT' },
  load: () => import('./index'),
});
