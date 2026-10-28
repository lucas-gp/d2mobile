# d2import — importeur « le joueur fournit ses propres fichiers du jeu »

Outil autonome (TypeScript, aucune dépendance) qui lit les archives MPQ d'une installation de Diablo II
du joueur et produit des assets exploitables par n'importe quel moteur : feuilles de sprites PNG,
tuiles isométriques, icônes d'inventaire, métadonnées JSON et une page d'aperçu.

**Règle absolue : aucun fichier Blizzard n'est jamais commité** (archives, fichiers extraits, PNG générés).
Les dossiers d'entrée et de sortie sont configurables et se trouvent hors du dépôt par défaut ; `*.mpq`,
`d2-input/`, `d2-output/` et `d2-private/` sont ignorés par git. Usage strictement privé.

## Utilisation

```bash
export D2_PRIVATE_DIR=~/d2-files            # dossier de votre choix, hors dépôt
export D2_INPUT_DIR=$D2_PRIVATE_DIR/in     # d2data.mpq, d2char.mpq, d2exp.mpq (+ patch éventuel)
export D2_OUTPUT_DIR=$D2_PRIVATE_DIR/out
npx tsx tools/d2import/cli.ts all       # ou : inventory | chars | monsters | tiles | icons | preview
```

Options : `--in`, `--out`, `--patch <archive.mpq>` (répétable), `--lang eng`, `--icon-palette act1`.
Chaque commande est rejouable seule et de façon déterministe (chaque étape réécrit sa section de
`manifest.json`). `npx tsc -p tools/d2import/tsconfig.json` vérifie les types.

## Remplacer les sprites du jeu (commande `game`)

```bash
npx tsx tools/d2import/cli.ts game            # 52 planches au format du jeu → <sortie>/game/{hi,lo}/ + manifest.json
npx tsx tools/d2import/cli.ts game paladin fallen   # ou seulement certaines planches
npm run dev                                   # le serveur local sert <sortie>/game sous /d2/
```

`game-map.ts` associe chaque planche du jeu (classes, monstres, invocations, mercenaires, PNJ : 52 planches) à une unité de
Diablo II et à un équipement par défaut. Les images sont rognées (ancre aux pieds), les directions converties
dans la convention du jeu (0 = +x monde, bas-droite à l'écran), l'ombre est synthétisée, et deux paliers sont
produits (hi = pixels d'origine, lo = moitié). **Repli automatique** : au démarrage le jeu lit `/d2/manifest.json` ;
seules les planches présentes remplacent celles d'origine (`SpriteBank`, `src/render/assets.ts`). Sans dossier
importé (ou avec `D2_SPRITES=0`), sans les fichiers, ou si une planche importée est illisible, le sprite actuel
du jeu est utilisé. Les planches non couvertes (décor, sols, `merc_ascendant`, effets…) gardent aussi leur sprite.

Réglages de `game-map.ts` et règles de l'export (contrôlés sur captures le 2026-09-30) :

- **Modes** : les classes utilisent la course de D2 (`rn`) pour se déplacer (le joueur va à 10,4 sous-tuiles/s, la
  course de D2 à 9, la marche à 6) ; `modes` choisit un autre mode par animation (`cast: 's1'`…), `false` l'omet.
- **Cadence de marche** : chaque planche donne sa **foulée** (`anims.walk.stride`, px par image), mesurée sur le pied
  d'appui d'une marche vers la droite, ou déduite de la vitesse de monstats et d'animdata si la mesure n'est pas
  plausible. Le jeu en tire la cadence d'après la vitesse réelle de l'unité (bornée entre ×0,6 et ×1,5 de la cadence
  d'animdata) : plus de pieds qui glissent quand l'unité est ralentie ou accélérée.
- **`thin: 2`** (boss) : une image sur deux pour les animations à 17 i/s et plus et pour la mort — Andariel, Duriel,
  Méphisto, Diablo et Baal passent de 61-78 Mo à 37-46 Mo de textures en qualité haute.
- **Planche au nom d'un monstre** : quand le jeu partage une planche entre plusieurs monstres qui ont chacun leur
  modèle dans D2 (Mage des tempêtes `fr` et Membre du Conseil `hp` sur la planche `soul_killer`), une entrée dont
  l'`id` est celui du monstre fournit une planche propre, utilisée tant que l'import est présent.
- **Transparences du COF** : calques à 25/50/75 % et calques additifs (lueurs, flammes : l'opacité suit la
  luminosité, le noir est invisible). Les lueurs ne projettent pas d'ombre.
- **Mort** : si la dernière image est vide, le cadavre (mode `dd`) sert de pose finale ; pour les personnages sans
  cadavre, le corps reste sur sa dernière image dessinée. Les invocations qui s'évanouissent restent telles quelles.
- **Non couvert** : `merc_ascendant` (mercenaire d'Acte IV de PD2, sans modèle dans les archives d'origine) garde son
  sprite ; Dame des ténèbres et Comtesse, Bovin et Roi des Vaches partagent leur modèle comme dans D2.

### Sols et murs de D2 (avec repli sur le décor du jeu)

La commande `game` produit aussi, dans le même dossier :

- **Sols** (`ground-map.ts` → `ground.ts`) : pour chaque type de sol du jeu, des tuiles de sol d'un DT1 (groupes
  « indice principal, sous-indice » : les tuiles d'un groupe sont des variantes interchangeables) assemblées en
  tuiles de 5 unités (2 × 2 tuiles D2, `tileSize: 5` dans la planche) et en taches au bord tramé pour les chemins.
  `ground_<type>.<zone>` ne vaut que pour une zone (Harrogath, Tombeaux, Trône de Baal, Catacombes, Durance…).
- **Murs** (`prop-map.ts` → `props.ts`) : tuiles de mur (orientation 2 le long de x, 1 le long de y) assemblées et
  coupées à la longueur de l'empreinte du décor (4 unités), ancre au centre de l'empreinte, ombre synthétique ;
  `maxHeight` fait un muret quand D2 n'a pas de mur bas. `prop_<décor>.<zone>` ne vaut que pour une zone.
- Le jeu charge la planche de zone en plus de la planche commune, qui reste le **repli** si l'import est absent ou
  illisible. Le sol de lave, les colonnes, torches, maisons, arbres et objets gardent pour l'instant leur sprite.
- Choisir les tuiles : `npx tsx tools/d2import/cli.ts floors 2:Act2/Tomb/Tomb.dt1` (sols) ou
  `floors 2:Act2/Tomb/Tomb.dt1:1,2` (murs, orientations) écrit une planche de contrôle dans `<sortie>/control/` et
  la légende des indices ; `node tools/e2e/d2-shots.mjs <dossier>` capture la ville et chaque run en jeu.
- Pas encore fait : lecture des cartes DS1 (bâtiments entiers de Harrogath et de Tristram, agencements de salles).

Contrôle visuel : `node tools/e2e/d2-control.mjs <dossier hors dépôt> [--only=a,b]` (serveur vite local lancé avec
`D2_OUTPUT_DIR`) écrit des planches de contrôle — 8 directions, marche, attaque, mort, ombre, losange d'une unité,
flèche de la direction attendue, toise de 72 px.

Les fichiers importés ne sont **jamais** dans `dist/` : le dossier `game/` est servi uniquement par les serveurs
locaux vite (dev et preview, variable `D2_GAME_DIR` ou `D2_OUTPUT_DIR`), et `npm run deploy` désactive la
fonction (`D2_SPRITES=0`) : la version publique reste sur les sprites d'origine. Vérification :
`node tools/e2e/d2-sprites.mjs imported|fallback|revert`.

## Ressources chiffrées (chargeur optionnel)

Le jeu sait lire un dossier de ressources chiffrées (AES-256-GCM, clé dérivée d'un mot de passe par PBKDF2-SHA256 ;
format décrit dans `src/render/d2crypto.ts`) servi sous `d2/` : c'est un chargeur générique, activé seulement par la
variable de build `D2_REMOTE=1`, et le dépôt ne contient ni outil pour produire un tel dossier, ni adresse (le script de déploiement peut seulement relayer
`d2/` vers une origine que vous fournissez, `D2_REMOTE_ORIGIN`).
Ne mettez en ligne que des fichiers issus de **votre propre copie** du jeu, pour votre seul usage ; ne les publiez pas
pour d'autres joueurs. Le mode normal (génération dans le navigateur à partir de vos archives, rien n'est envoyé) ne
nécessite aucun hébergement.

Solidité : le nombre d'itérations PBKDF2 est lu dans le `index.json` du dossier (aucun minimum imposé par le jeu), et ce
fichier comme le fichier témoin sont publics. Quiconque les télécharge peut essayer des mots de passe hors ligne : chiffrez
avec **au moins 600 000 itérations** (comme la synchronisation) et une phrase de passe d'au moins 5 mots tirés au hasard.
Un dossier chiffré avec moins d'itérations reste lisible par le jeu ; pour le renforcer, il faut le chiffrer de nouveau,
puis ressaisir le mot de passe dans le jeu.

## Système de fichiers virtuel

Les archives forment un seul système de fichiers. Priorité croissante : `d2char` < `d2data` < `d2exp` <
toute autre `*.mpq` du dossier d'entrée (par ordre alphabétique, donc `patch_d2.mpq` prime sur tout) <
archives données par `--patch`. Ajouter un patch ne demande aucune modification de l'outil.

## Arborescence des sorties

```
inventory/inventory.md|json        étape 1 : inventaire lisible
chars/<classe>/<variante>/<anim>.png|json
monsters/<monstre>/<anim>.png|json
tiles/act<N>/<niveau>/{floor,wall,other}/*.png, atlas-<n>.png, tiles.json
items/icons/<code>-<nom>.png (+ .<teinte>.png), icons.json
preview/index.html, data.js        étape 5 : page de contrôle (ouvrir en file://)
manifest.json
```

## Format des feuilles d'animation

Une feuille PNG RGBA par animation : **une ligne par direction en sens horaire à l'écran** (ligne 0 = face
au joueur, bas de l'écran), une colonne par trame, cadre commun à toute l'animation. L'ordre interne des DCC
n'est pas séquentiel ; la correspondance (`directions.ts`, vérifiée visuellement) est rappelée dans le JSON
(`directionOrder.rows[].source`). `anchor` = position des pieds dans chaque cadre (identique partout,
décalages internes préservés). `timing` = cadence d'`animdata.d2` (25 i/s × vitesse / 256) et déclencheurs.

## Ce qui est approximatif

- Ombres non exportées (le calque d'ombre du COF est ignoré ; la commande `game` synthétise une ombre couchée).
- Variantes de couleur des icônes : correspondance `InvTrans` → `invgrey/invgrey2/invgreybrown` conventionnelle.
- Tuiles : origine des murs déterminée à l'œil (`+40 px` par rapport au sol dans l'aperçu) ; orientations
  de murs 1 à 12 non classées finement ; pas de carte de niveau (DS1) ni d'assemblage de tuiles.
- Monstres : équipement choisi automatiquement (première variante, `lit` si présente) ; pas de
  décalages de palette (`palshift.dat`) ni de variantes d'élite/unique.
- Directions à 4 angles : ordre non contrôlé (aucun cas dans le premier lot).
- Sons et animations audio (ADPCM) non décodés.

## Étendre

Tout est déclaratif dans `scope.ts` : ajouter une classe, un monstre (colonne `Class` de monstats.txt),
un niveau (nom affiché de levels.txt) ou un code d'objet (`weapons/armor/misc.txt`). Autres équipements :
changer `gear` (codes de calques : `lit/med/hvy`, armes `ssd`, `lsd`…, boucliers `buc`…). Autres actes : la
palette vient de `Act` dans levels.txt. Cartes complètes : décoder les DS1 (`tiles/*/*.ds1`, non traités).

## Mode « navigateur » (sans dossier chiffré)

Les exporteurs écrivent dans un récepteur (`sink.ts`) : le CLI vers `<sortie>/game/`, le Worker de `src/platform/d2local.worker.ts` vers
l'API Cache. Contrôle d'identité avec le CLI : `npx tsx tools/d2import/check-browser.ts <dossier game> <id|groupe>…`
(groupes : `all`, `units`, `parts`, `props`, `fx`, `grounds`, `extras`). Détails, mesures et limites : `BROWSER.md`.

Génération paresseuse (phase 3) et persistance des MPQ (phase 4) : `src/platform/d2local.ts` (service), `d2local-core.ts` (logique pure).
Contrôle d'un palier seul contre les deux paliers : `npx tsx tools/d2import/check-tiers.ts <id|groupe>…`. Tests de bout en bout avec de vrais
MPQ : `tools/e2e/d2-lazy.mjs` (parcours complet, `--mobile`, `--all`, `--profile=1`) et `tools/e2e/d2-lazy-edge.mjs` (cas limites).
