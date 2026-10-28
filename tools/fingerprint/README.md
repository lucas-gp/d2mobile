# Empreintes de comportement (`tools/fingerprint`)

Preuve qu'un lot « sans changement de comportement » l'est vraiment : on calcule des empreintes avant le lot (référence), puis après, et
on compare. Chaque section rejoue une partie du jeu à graine fixe et hache ce qu'elle produit ; aucune horloge, aucun aléa non semé.

```sh
npm run fingerprint -- --out ref.json                    # toutes les sections (≈ 9 min), référence
npm run fingerprint -- --out cur.json --compare ref.json # après le lot : écarts listés, code de sortie 1 s'il y en a
npm run fingerprint -- --only registries,saves --out a.json   # sections choisies
npm run fingerprint -- --compare ref.json --with cur.json     # comparer deux fichiers déjà calculés
npm run fingerprint -- --bundle --out ref.json           # en plus : tailles du bundle (informatif)
```

Déterminisme : deux exécutions de suite sur le même code donnent le même fichier (hors `meta`, qui n'est jamais comparé). Chaque section
tourne dans son propre processus, l'une après l'autre (une seule charge lourde à la fois sur la machine), avec `TZ=UTC`.
Avant chaque section (sauf `bundle`), les mods de `mods/` sont découverts (variable `MODS`, comme le build : tools/mods/node.ts), le jeu de règles `pd2` est activé et les registres gelés, comme au démarrage du jeu (`src/mods`, à
partir du lot 201 ; `FP_RULESET` pour un autre jeu de règles).

## Sections

| Section      | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Durée      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `registries` | toutes les valeurs exportées par `src/data/**` puis par `mods/<id>/data/**` des mods actifs (clés `<id>:fichier`) (bases, affixes, uniques, sets, runes, mots runiques, Cube, runs, compétences, mercenaires, monstres, niveaux de zone, TC, cartes…) sérialisées entièrement, une empreinte par élément et une par ordre de table                                                                                                                                       | 1 s        |
| `chars`      | 1 500 personnages pseudo-aléatoires (`chargen.ts`) : `computeDerived` (3 difficultés), `itemFinal` / nom / niveau requis de chaque objet porté, `mercDerived`, textes de compétences ; textes de toutes les compétences pour 84 personnages                                                                                                                                                                                                                              | 5 s        |
| `mercs`      | 13 sous-types de mercenaires × niveaux 1 à 99 × 3 difficultés, nus puis équipés                                                                                                                                                                                                                                                                                                                                                                                          | 1 s        |
| `loot`       | génération d'objets (chaque base × 7 niveaux × 7 qualités × 2 options, chaque unique et objet de set) ; tirages des classes de trésor                                                                                                                                                                                                                                                                                                                                    | 5 s        |
| `saves`      | chargement / réécriture de 300 sauvegardes par le chemin de l'application, mêmes sauvegardes en versions 1 à 6, sauvegardes invalides (base inconnue), coffre partagé, conversion de 3 000 `.d2s` pseudo-aléatoires                                                                                                                                                                                                                                                      | 5 s        |
| `zones`      | chaque run × 3 difficultés × 3 graines, sans puis avec les cartes D2 privées ; chaque carte d'endgame × 3 graines                                                                                                                                                                                                                                                                                                                                                        |            |
| `endgame`    | cartes d'endgame (lot M5) : objets de carte de chaque zone × qualité (effet sur le monde, nom), cartes tirées par palier, butin propre aux cartes, recettes de cartes du Cube, corruption, opérations du coffre de cartes (`Game`), bots dans chaque carte (4 builds, 40 s, état haché à chaque tick), duels contre le boss de carte et son butin ; les fonctions des cartes sont cherchées dans `mods/pd2/…` puis `src/…` (clés indépendantes de l'emplacement du code) | ≈ 2 min 10 |
| `skills`     | chaque compétence de chaque classe lancée dans une arène vivante (niveaux 1, 8, 20 ; 1 à 3 équipements), état haché à chaque tick                                                                                                                                                                                                                                                                                                                                        |            |
| `bots`       | 18 builds × 15 runs de bots (50 s de jeu), état du monde haché à chaque tick                                                                                                                                                                                                                                                                                                                                                                                             | ≈ 3 min 30 |
| `bundle`     | informatif, sur demande : `vite build` complet et public (`D2_SPRITES=0`) dans un dossier temporaire, taille par fichier et empreinte de l'ensemble ; un écart y est affiché mais jamais compté                                                                                                                                                                                                                                                                     | ≈ 1 min         |

Le rendu (graphe de scène Pixi) n'a pas de section : ses empreintes passent par un navigateur (lots 195-196) ; à ajouter le jour où un lot
touche `src/render`.

## Ce qui dépend de la machine

- **Cartes D2 privées** (`~/d2-private/out/game/maps`, ou `$D2_PRIVATE_DIR/out/game/maps`, comme les tests) : la section `zones` les ajoute quand elles sont
  présentes (`meta.d2Maps`). Une référence calculée avec elles ne se compare qu'à une exécution avec elles ; c'est pourquoi **les fichiers
  de référence ne sont pas versionnés** : on les calcule au début d'un lot, sur la même machine, et on les garde hors du dépôt.
- `FP_D2S=chemin1.d2s:chemin2.d2s` ajoute des vrais fichiers `.d2s` (privés) à la section `saves`.
- `FP_BOTS=cold,fire` restreint la section `bots` (diagnostic d'un écart).
- `FP_TMP` : dossier des fichiers temporaires (défaut : dossier temporaire du système).

## Lire un écart

La clé désigne ce qui a changé (`registries` : `fichier:EXPORT[id]` ; `chars` : `charN/classe/niveau` ; `bots` : `build/run/difficulté`).
La clé `saves:format` résume le numéro de version et l'étiquette de ruleset des sauvegardes réécrites : elle change, voulu, quand le format
de sauvegarde change (le contenu, lui, est comparé sans ces deux champs). Les clés `saves:invalid/*` changent quand le traitement des
sauvegardes invalides change.

**Contenu déplacé vers un mod** (lots M4 et suivants) : dans `registries`, un élément retiré d'une table de la base et présent à l'identique
dans `mods/<id>/data` (clé `<id>:fichier:EXPORT[…]`), les entrées des données du mod, l'ordre d'une table de la base qui n'a fait que
perdre ces éléments, et une constante retirée de la base et présente à l'identique sous le même nom d'export dans les données d'un mod
sont listés à part (« déplacement vers un mod, non comptés »). Les tables du jeu où le mod enregistre son contenu
(`items/bases:BASES`, `items/uniques:UNIQUES`, `cube:CUBE_RECIPES`…) restent comparées normalement : elles prouvent que le jeu est inchangé.
