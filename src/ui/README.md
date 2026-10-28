# src/ui — interface DOM

Couche DOM au-dessus du canvas : écrans d'avant-partie, HUD, panneaux plein écran, info-bulles, dialogues. Elle agit sur le jeu
uniquement par la façade `Game` (`src/sim/game.ts`) et par les rappels que lui donne l'application (`PanelHost`, dans
`panels-shared.ts`) ; elle ne touche ni au rendu ni aux structures internes du monde. Styles : `style.css`.

## Points d'entrée

| Fichier | Rôle |
|---|---|
| `dom.ts` | `el(tag, props, ...enfants)` : seule fabrique d'éléments (classes `cls`, `style`, `data`), `fmt`, `holdButton` (appui maintenu). |
| `hud.ts` | **`Hud`** : barres de vie et de mana, cible, minicarte, grappe de compétences, potions, messages, étiquettes au sol ; `icon()`, `labelClass()`. |
| `panels.ts` | **`Panels`** : état et orchestration des panneaux (affichage, glisser-déposer `DragDrop`, rendu par reconstruction complète). Le contenu est dans des modules dont les fonctions reçoivent l'instance (`this: Panels` ou un paramètre `p`) : `panels-inventory.ts` (inventaire, coffre, marchand), `panels-bag.ts` (onglets du sac et du coffre), `panels-actions.ts` (colonne d'actions d'un objet), `panels-stash.ts` (recherche et barres du coffre), `panels-hero.ts` (personnage, compétences, mercenaire), `panels-world.ts` (cube, cartes, points de passage), `panels-filter.ts` (filtre de butin), `panels-settings.ts` (réglages). `panels-shared.ts` : types (`PanelHost`, `Sel`), constantes de mise en page D2, `STASH_VIEW` ; `panels-state.ts` : état d'interface par panneau (filtre, coffre, Cube, réglages, fusion, point de passage, menus). |
| `settings-catalog.ts` | Catalogue des réglages (catégories, libellés, aide, mots-clés de recherche) : le panneau des réglages le parcourt. |
| `itemtext.ts`, `skilltext.ts` | Textes d'info-bulle des objets (et comparaison avec l'équipement porté) et des compétences. |
| `charselect.ts`, `d2charselect.ts` | Écran de sélection / création (libre ou art Diablo II) ; choix du mode au lancement. `charlist.ts` : liste des personnages disposée comme dans Diablo II (logique pure : `select-core.ts`). `d2-choice.ts`, `d2wait.ts`, `d2local-ui.ts`, `d2recap-ui.ts` : graphismes Diablo II (choix, attente, réglages). |
| `sync-ui.ts`, `guild-ui.ts`, `d2import.ts`, `npcdialog.ts`, `skillpicker.ts`, `tips.ts`, `changelog.ts`, `credits.ts` | Synchronisation, coffre de guilde, import `.d2s`, dialogues des PNJ, choix de compétence, conseils, nouveautés, crédits. |

## Conventions

- **Texte source en français**, traduit à l'affichage par l'observateur de `src/i18n` (aucun appel explicite nécessaire pour un texte du
  DOM). Tout nouveau texte demande une entrée dans `src/i18n/en.json` ; `data-notr` exclut un nœud de la traduction.
- Un panneau se reconstruit entièrement à chaque `render()` (positions de défilement gardées) : un état d'interface (onglet, sélection,
  recherche) vit dans `Panels` (groupes de `panels-state.ts`), jamais dans le DOM.
- Tout se fait au toucher ; le survol et le clic droit ne sont que des raccourcis du mode PC.
- Les changements visibles par le joueur vont dans `changelog.ts` (FR + EN).

## Pièges

- `Panels` expose des membres publics parce que les modules `panels-*.ts` les lisent : ce n'est pas une API pour le reste de l'application
  (qui passe par `show`, `hide`, `refresh`, `open`, `assignHoveredSkill`).
- Deux mises en page coexistent : grilles CSS, et art de Diablo II quand il est disponible (`d2Panel` non nul, coordonnées du panneau
  d'origine). Un changement de mise en page se vérifie dans les deux (`tools/e2e/panel-fit.mjs`, `stash-layout.mjs`).
- La couverture unitaire du dossier est faible : la logique pure est isolée dans des modules `*-core.ts` (`charselect-core.ts`,
  `d2wait-core.ts`) ou `announce-queue.ts`, testés sans navigateur ; le reste se vérifie par les scripts de `tools/e2e`.
