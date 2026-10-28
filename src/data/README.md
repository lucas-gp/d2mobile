# src/data — contenu du jeu

Données pures (tables TypeScript et JSON) lues par la simulation, le rendu et l'interface : aucune logique d'exécution, aucun accès au
DOM, au hasard ni à l'horloge (vérifié par `tests/unit/architecture.test.ts`). Origine et licence des tables dérivées des jeux et des
wikis : en-têtes SPDX des fichiers, [LICENSE-DATA.md](LICENSE-DATA.md), [docs/DERIVED-DATA.md](../../docs/DERIVED-DATA.md).

## Où trouver quoi

| Sujet | Fichiers | Registre |
|---|---|---|
| Schémas | `types.ts` (objets, monstres, compétences), `skill-types.ts` (nombres des compétences), `zone-types.ts` (zones, options des cartes), `stats.ts` (éléments, statistiques) | — |
| Classes, arbres | `classes.ts` | `CLASSES`, `CLASS_IDS`, `TREES`, `TREE_CLASS` |
| Compétences | `skills.ts` (Sorcière, rassemblement, `skillHard`), `skills-<classe>.ts` ; chiffres, synergies et tables par points durs PD2 : `mods/pd2/data/skills.ts` (patch à l'activation) | `SKILLS`, `SKILL_BY_ID`, `classSkills` |
| Objets | `items/bases.ts` (+ `bases-classes.ts`, `misc.ts`, `quest.ts`), `uniques*.ts`, `sets*.ts`, `runewords*.ts`, `runes.ts`, `affixes*.ts`, `index.ts` (enregistrement des bases annexes) | `BASES`, `BASE_BY_ID`, `UNIQUE_BY_ID`, `SET_ITEM_BY_ID`, `RUNEWORD_BY_ID` |
| Contenu Project Diablo 2 déplacé dans le mod | `mods/pd2/data/` (objets divers PD2, carquois, uniques PD2 et charmes de brisure, recettes du Cube PD2, tables de corruption), enregistré par `mods/pd2/index.ts` | mêmes registres (`src/mods`) |
| Monstres | `monsters.ts`, `monsters-d2.ts`, `monsters-fidelity.ts`, `monster-attacks.ts`, `monster-anim.gen.ts`, `superuniques.ts` | — |
| Zones, runs | `zones/*.ts` (constructeurs, `ZoneBuilder` dans `zones/builder.ts` ; jointures bord à bord et chaînes de plein air des actes I, II, III et V dans `zones/seams.ts` ; construction par étapes `zones/steps.ts`, lot 312), `runs.ts`, `levels*.ts` (peuplement), `campaigns.ts`, `waypoints.ts`, `maps.ts` (types et registres des cartes d'endgame, vides : contenu et génération dans `mods/pd2`) | `RUNS`, `RUN_BY_ID`, `CAMPAIGNS`, `MAP_ZONES` |
| Équilibrage | `curves.ts` (vie, dégâts, XP des monstres par niveau), `rates.ts` (taux de butin, préréglages), `xp.ts`, `treasure.ts` | `RATES`, `LOOT_PRESETS` |
| Décor | `props.ts` (modèles, empreintes), `worldobjects.ts`, `shrines.ts` | — |

## Invariants

- Un identifiant (`id`) est stable : il est écrit dans les sauvegardes. Le renommer impose une migration (`src/sim/save.ts`, `MIGRATIONS`,
  ou les tables de correspondance comme `remapLegacyBases`).
- Les bases sont enregistrées une seule fois (`registerBases` lève une erreur sur un doublon).
- Les textes sont en français ; leur traduction anglaise est dans `src/i18n/en.json` (voir le guide de contenu).
- Fichiers `*.gen.ts` / `*.gen.json` : générés par un outil de `tools/` (indiqué en tête), ne pas les éditer à la main.

## Exception connue

`zones/d2passable.ts` importe la grille de collision de `src/sim` (`grid.ts`, `buildgrid.ts`, `constants.ts`) pour vérifier la praticabilité
des cartes Diablo II : c'est le seul import de valeur `data → sim`. Les autres références à `sim` sont des imports de types.

## Tests qui énumèrent ce dossier

`integrity.test.ts` (nombre de compétences, prérequis, synergies, bases des uniques/sets/mots runiques, runes et gemmes, construction de
chaque run dans les trois difficultés), `skills.test.ts` (nombre de compétences par classe, un effet observable par compétence),
`classes-data.test.ts`, `zones.test.ts` (accessibilité), `i18n-coverage.test.ts` (aucun texte français sans traduction).
