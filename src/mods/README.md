# src/mods — registres, mods et jeu de règles

Fondation du système de mods (plan « PD2 en mod débranchable » : lots 201 et suivants, M3, M4 et M14). La base (Diablo II, avec encore une
grande part de Project Diablo 2 fondue dedans) vit dans `src/` ; un mod est un dossier unique `mods/<id>/` (aujourd'hui `mods/pd2/`, voir
son README) qui ajoute, patche ou retire des entrées des registres.

## Pièces

| Fichier         | Rôle                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registry.ts`   | `Registry<T>` : registre posé sur une table existante (tableau + index `*_BY_ID`, modifiés sur place) ; ajout (en fin de table ou à une position), patch, retrait, propriétaire de chaque entrée, conflits, gel. Module feuille.                                                                                                                                                                         |
| `registries.ts` | `REGISTRIES` : les registres de toutes les tables extensibles (bases, affixes, uniques, sets, objets de set, runes, gemmes, mots runiques, recettes du Cube, runs, compétences, mercenaires, monstres, fidélité des monstres, classes de trésor, autels, statistiques, cartes, affixes de carte, niveaux de zone, classes jouables, tables de corruption).                                               |
| `api.ts`        | API publique d'un mod (`ModManifest`, `defineManifest`, `ModContent`, `ModApi`, `ModRegistry`, `RulesetDef`) et types de données qu'un mod manipule : **le seul module du jeu qu'un mod importe**.                                                                                                                                                                                                       |
| `sdk.ts`        | Moteur exposé au code d'un mod (générateurs d'objets, constructeur de zones, projectiles, registres, types de la simulation) : avec l'API, seul module du jeu qu'un mod importe ; jamais importé par le manifest (il tire la simulation).                                                                                                                                                                |
| `discover.ts`   | Découverte des mods : `import.meta.glob('/mods/*/manifest.ts')` (Vite, vitest), manifests fournis par l'outil en ligne de commande (`provideManifests`, tools/mods/node.ts).                                                                                                                                                                                                                             |
| `mods-env.ts`   | Variable `MODS` (feuille, lue aussi par la configuration de Vite).                                                                                                                                                                                                                                                                                                                                       |
| `rules.ts`      | Règles nommées remplaçables (`RuleTypes`, `RULES`) : une implémentation de la base, remplacée par un mod (`api.rules.set(nom, (précédente) => …)`), conflit sans `override`, gel. Module feuille.                                                                                                                                                                                                        |
| `d2/`           | Règles de la base = Diablo II LoD 1.13c (lot M8) : `combat.ts` (règles `combat.*`), `mercs.ts` (`merc.*`), `character.ts` (`char.*`), `progression.ts` (`xp.*`), `cube.ts` (`cube.craft`, lot M10c), `bots.ts` (`bots.profile`, lot M13 : plans de compétences des bots, listes du cerveau, seuils des tests de bots), d'après le code du jeu reconstitué par D2MOO et les tables des MPQ ; `tables.ts` (colonnes de DifficultyLevels.txt, de combat de MonStats.txt et facteurs de CharStats.txt, générées par `npm run vanilla -- rules`). Modules feuilles. |
| `settings.ts`   | Réglages propres à un mod (`Settings.mods.<mod>`) : déclarés par `api.settings.declare` (défaut de l'application, valeurs admises, `legacy` : réglage d'avant les mods repris de la racine), lus par `modSetting`, normalisés par `withDefaultSettings` ; un nouveau personnage ne reçoit que ceux des mods de son jeu de règles. Module feuille.                                                        |
| `ui.ts`         | Points d'insertion d'interface (`UiSlots`, `api.ui.add`, `contributions`) : menu, création, fiche, level-up, HUD, point de passage, artisanat ; guide : docs/MODS.md. Module feuille.                                                                                                                                                                                                                  |
| `derived.ts`    | Tables dérivées recalculées après l'enregistrement des mods (`derivedList`, `afterRegister`).                                                                                                                                                                                                                                                                                                            |
| `base.ts`       | La base du jeu, enregistrée comme un mod (son contenu est celui des tables de `src/data`).                                                                                                                                                                                                                                                                                                               |
| `activate.ts`   | `rulesets()` (jeux de règles de contenu : `d2`, la base seule, et un par refonte présente, `pd2`), `gameModes()` (mods `gamemode`), identifiants complets `<contenu>+<mode>` (`rulesetId`, `parseRuleset`, `contentRuleset`), `rulesetProblem` (personnage grisé : mod absent), `playableRulesets`, `defaultRuleset`, `activateRuleset` (contenu des mods chargé à la demande, base, refonte puis modes de jeu, tables dérivées, vérification, gel), `activeRuleset`, `activeModIds`, `rulesetSwitch`.                                                                                                                                          |

Le registre des bases vit dans `data/items/bases.ts` (`BASE_REGISTRY`) : `registerBases` passe par lui et échoue après l'activation.

## Un mod

```
mods/<id>/
  manifest.ts     defineManifest({ id, name, version, kind: 'overhaul' | 'gamemode' | 'addon', defaultOn, description, i18n, rulesets, license, load: () => import('./index') })
  index.ts        export default { legacyIds, register(api) { api.uniques.add(...); api.cubeRecipes.add(r, { before: 'x' }); api.i18n.add(dict) } }
  data/ i18n/ tests/ tools/ docs/ README.md LICENSE-DATA.md
```

- **Découverte** : tout dossier `mods/<id>/` avec un `manifest.ts` (le dossier porte l'identifiant). Un dossier supprimé n'est plus
  découvert, sans ligne à changer ailleurs.
- **Test de suppression** (`npm run mods:suppression`, tools/ci/suppression.mjs, job CI `suppression`) : une copie du dépôt sans `mods/`
  passe `tsc`, ESLint et les tests de la base, et son build public ne contient ni le chunk ni les textes du mod (témoin : le build avec le
  mod les contient) ; `--e2e` joue en plus un personnage sans mod (création, run, sauvegarde, rechargement). Les tests de la base qui
  utilisent encore du contenu du mod sont sautés sans lui (`it.skipIf(withoutPd2)`, tests/needs-pd2.ts). Ce qui n'est pas encore isolé
  est mesuré par `npm run mods:residual` (docs/internal/MODS-RESIDUEL.md, vérifié à jour par la CI).
- **Chunk paresseux** : seul le manifest est dans le bundle de démarrage ; le contenu (`load`) est un chunk séparé, chargé à l'activation.
- **`MODS`** (build, serveur de développement, vitest, outils) : absente, tous les mods présents ; `MODS=pd2` ; `MODS=` (vide), la base
  seule. Le plugin Vite `tools/build/mods-plugin.ts` restreint le motif de découverte : un mod exclu n'entre pas dans le bundle. Vitest
  ajoute aux suites `unit` et `bots` les tests des mods inclus (`mods/<id>/tests/{unit,bots}`).
  Déploiement : `npm run deploy` embarque par défaut tous les mods présents (version publique comprise, décision du propriétaire) ;
  `npm run deploy -- --no-mods` (combinable avec `--public` ou `--code`) déploie la base seule.
- **Frontière** (règle ESLint `d2m/mod-boundary`, eslint.config.js) : rien hors d'un mod n'importe `mods/` ; le code d'un mod
  n'importe du jeu que `src/mods/api` et le moteur `src/mods/sdk` (son manifest : l'API seule) ; ses tests et ses outils (`mods/<id>/tests`,
  `mods/<id>/tools`) peuvent importer le jeu, jamais un autre mod.

## Cycle de vie

1. Les modules de `src/data` construisent leurs tables au chargement : ce contenu appartient à la base.
2. `src/main.ts` active le jeu de règles du dernier personnage joué (`bootRuleset` ; sans personnage, ou s'il est inconnu de cette version :
   `defaultRuleset()`, `pd2` si le mod est présent, sinon `d2`) **avant** `app.start()`, donc avant le chargement de `game-core`. Le contenu
   des mods du jeu de règles est chargé (chunks), la base puis chaque mod reçoivent l'API (`register`), les tables dérivées sont recalculées
   (`derived.ts`), les registres sont contrôlés (`problems`) puis gelés ; en développement et dans les tests, les tableaux et index
   eux-mêmes sont gelés (`Object.freeze`).
3. Un seul jeu de règles par session de page : jouer un personnage d'un autre jeu de règles recharge la page (`rulesetSwitch`, `App.useSlot`).
   Un nouveau personnage reçoit le jeu de règles de la session (`Game.ruleset`, import `.d2s`) ; un personnage créé pour un autre jeu de
   règles (choix à la création : docs/MODS.md) l'est après le rechargement qui active le sien (`pendingCreate`).
4. Les tests activent `defaultRuleset()` avant chaque fichier (`tests/setup-ruleset.ts`), l'outil d'empreintes avant chaque section ; les
   autres outils en ligne de commande passent par `activateForTools()` (tools/mods/node.ts) quand ils ont besoin du contenu des mods.

## Règles des registres

- `add` sur un identifiant existant, `patch` ou `remove` sur un identifiant absent : erreur.
- `add(entry, { after | before })` insère à une position : la table **et** l'ordre des clés de l'index suivent (un contenu déplacé de la base
  vers un mod garde exactement son ordre de tirage et d'affichage).
- Une entrée ajoutée par un mod s'appelle `<mod>:<id>` ; exception : `legacyIds` du mod (identifiants déjà présents dans les sauvegardes,
  ou clés de table lues par type, comme les tables de corruption).
- `patch` remplace des champs sur place (l'identité de l'objet et l'identifiant ne changent jamais) ; deux mods qui patchent le même champ
  de la même entrée sont en conflit, sauf `override`. Un champ présent garde sa place dans l'objet, un champ nouveau s'ajoute à la fin, un
  champ à `undefined` est retiré ; `keyOrder` impose l'ordre final des champs. Un index secondaire (runes par nom) n'est recalculé que si le
  patch touche ses champs (`indexFields`).
- Patch de table (`TablePatch`, `applyTablePatch`, lot M6) : retraits, champs par entrée puis ajouts à leur position, en un seul objet
  généré par diff. Les tables vanilla de la base (bases, runes, gemmes, uniques, sets, niveaux de zone, classes de trésor, fidélité des monstres, caractéristiques des classes, affixes, mots runiques, recettes du Cube : Diablo II LoD 1.13c) sont régénérées depuis les MPQ du joueur par
  `tools/vanilla/gen.ts` (`npm run vanilla` : contrôle, `-- --write` : réécriture) ; les valeurs d'une refonte sur ces tables sont son
  patch (`mods/pd2/data/items/*.patch.ts`, `mods/pd2/tools/vanilla-diff.ts`).
- Compétences : arbres de la base = les 210 compétences de Diablo II (`src/data/skills-d2.ts`, table `skills` de `npm run vanilla`, lot M9a),
  arbres d'une refonte en patch de table (`mods/pd2/data/skills.patch.ts`, appliqué avant les chiffres) ; renommages des anciennes
  sauvegardes et import .d2s : règles `skills.renames`, `skills.d2sImport` ; chiffres par niveau de D2 (Skills.txt, Missiles.txt :
  `tools/vanilla/skills-numbers.ts`, classes faites) et comportements par classe en règles `skills.<classe>` (base `src/mods/d2/skills.ts`,
  lot M9b : Sorcière), rayons d'explosion des projectiles `missiles.explode`.
  `api.skills.patchNumbers({ id: { min, max… } })` fusionne des champs de chiffres (`n`), `api.skills.patchSynergies`
  remplace les synergies du même type ; ce sont des patchs du registre (champs `n` et `synergies`).
- Règles nommées (`api.rules.set`, rules.ts) : une seule implémentation active par règle ; un mod la remplace en recevant la précédente
  (composition) ; deux mods sur la même règle sont en conflit, sauf `override`. Le jeu l'appelle par une fonction d'accès (`skillHard`) ou
  directement (`RULES['maps.launch'](…)`). Une règle de la base peut être inerte : les règles `maps.*`, `world.*`, `combat.*`, `ai.mapBoss`,
  `runs.mapBossDeath` sont les points où le mod pd2 branche les cartes d'endgame (lot M5b), sans carte dans la base ; `loot.ref`,
  `loot.noDropPlayers`, `loot.monsterDrops`, `runs.extraDrops`, ceux de son butin hors des classes de trésor de D2 (lot M6d).
  Les règles de formules (`combat.monsterRes`, `combat.leech`, `combat.crushingBlow`, `combat.criticalMul`, `combat.weaponSplash`,
  `combat.openWounds`, `combat.bleedTick`, `combat.chillFreeze`, `combat.absorbPctMax` : lot M8a ; `combat.playerHitRecovery` : lot M13 ; `merc.itemWear`, `merc.bossDamagePct` :
  lot M8b ; `char.maxResCap`, `char.toHitFactor`, `char.blockFactor` : lot M8c ; `xp.levelFactor` : lot M8f ; `loot.rates` : lot M8e, taux de `src/data/rates.ts` ; `cube.craft` : lot M10c, artisanat de CubeMain.txt ; `loot.value` : lot M10f, catalogue de valeur du butin de la base, que le mod complète ; `bots.profile` : lot M13, bots par jeu de règles) ont une implémentation vanilla dans la
  base (`src/mods/d2/`), que le mod pd2 remplace par ses formules (`mods/pd2/rules/`).
  Une implémentation de la base qui a besoin de la simulation (créer un objet : Torche du feu de l'enfer de `runs.extraDrops`, lot M10e) est
  fournie au chargement du module de la simulation qui la porte (`provideBaseRule`) ; une règle déjà remplacée par un mod garde la sienne.
- Traductions (`api.i18n.add`) : ajoutées après le dictionnaire de la base ; une clé déjà présente garde la traduction de la base (les tests
  du mod refusent ce cas).
- Après le gel, plus aucune modification.

## Tables lues au chargement des modules

Une table dérivée calculée au niveau module serait figée avec le contenu d'avant l'activation. Inventaire mesuré au lot 201 (parcours de
l'AST : instructions de niveau module qui lisent une table de registre), et traitement (lot 202) :

| Module                | Table dérivée                                            | Traitement                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/cube.ts`        | recettes d'amélioration des runes                        | `afterRegister` : rune ajoutée ou retirée par un mod → chaîne complétée (contenu d'une recette existante jamais réécrit)                                                              |
| `data/items/index.ts` | `RUNE_GEM_BASES` (bases des runes et gemmes)             | `afterRegister` : base créée pour toute rune ou gemme qui n'en a pas                                                                                                                  |
| `data/maps.ts`        | `MAP_RANDOM_ZONES`, `MAP_UNIQUE_ZONES`                   | `derivedList`                                                                                                                                                                         |
| `data/monsters.ts`    | fidélité et calage des animations appliqués aux monstres | `afterRegister` : appliqués une fois par monstre (ceux d'un mod aussi) ; un patch de mod, appliqué avant, prime ; une fidélité patchée par un mod (`monsterFidelity`) est réappliquée |
| `data/treasure.ts`    | classes de trésor de l'or par difficulté                 | rien : contenu littéral de la base écrit dans `MONSTER_TC`, il ne dérive d'aucune autre table                                                                                         |
| `platform/packs.ts`   | `PACKS[].runs` (packs de graphismes par run)             | `derivedList`                                                                                                                                                                         |
| `sim/cube.ts`         | `SOCKET_RECIPES`, `CUBE_BY_ID_LIST`                      | `derivedList`                                                                                                                                                                         |

Les index `*_BY_ID` et les tableaux eux-mêmes ne posent pas ce problème (modifiés sur place par les registres), ni les caches paresseux
calculés au premier usage en jeu (ex. `equipPool` de `sim/loot/drops.ts`), qui viennent après l'activation. Une nouvelle table dérivée de
niveau module se déclare par `derivedList` / `afterRegister` (le test `mods.test.ts` vérifie les cinq mécanismes avec un mod de démonstration).
