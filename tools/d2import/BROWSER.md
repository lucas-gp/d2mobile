# Génération des sprites dans le navigateur — étude de faisabilité (phase 1)

Objectif produit : rendre le jeu publiable sans assets Blizzard, avec deux modes : (a) mot de passe + dossier chiffré
(chargeur optionnel `D2_REMOTE`) ; (b) **le joueur fournit ses propres MPQ** (`d2data.mpq`, `d2char.mpq`, `d2exp.mpq` + patch PD2
éventuel) et le **navigateur génère les sprites localement** (rien n'est envoyé).

Conclusion courte : **faisable**. Le chemin MPQ → planches tourne dans un Web Worker avec **les mêmes décodeurs** que le CLI,
sortie JSON et pixels identiques. Le coût est dominé par la quantité (3 300 planches, 25 000 images de cartes) et non par un
verrou technique ; il impose une génération **paresseuse, par planche**, avec cache. Le prototype est désactivé par défaut.

## Ce qui a été fait

| Élément | Fichier |
|---|---|
| Lecture MPQ sans API Node (`ByteSource` synchrone + `Inflate` injecté) | `mpq-core.ts` (CLI : `mpq.ts`, fd + `node:zlib`) |
| zlib `inflate` synchrone, sans dépendance (~150 lignes) | `inflate.ts` |
| Système de fichiers virtuel sans Node | `vfs-core.ts` (CLI : `vfs.ts`, ordre des archives dans `orderArchives`) |
| Construction d'une planche d'unité (composition, rognage, ombre, réduction, mise en pages) | `actor-build.ts` (extrait de `export-game.ts`, importé par les deux) |
| Encodeur PNG navigateur (`CompressionStream`, sans canvas : un canvas prémultiplie et perd les couleurs sous alpha 0, dont dépend le `bleed` des lueurs) | `png-web.ts` |
| Génération d'une planche : mêmes noms (`hi/<id>.json`, `hi/<id>-0.png`, `lo/…`, `manifest.json`) | `browser.ts` |
| Worker + client (API Cache `d2m-d2-local`, clés `d2-local/<chemin>`) | `src/platform/d2local.worker.ts`, `d2local.ts` |
| Mode `local` de `SpriteBank` (désactivé : réglage `localStorage['d2m.d2local']='1'`), repli intact | `src/render/assets.ts` |
| Contrôles | `check-browser.ts` (identité avec le CLI), `tests/unit/d2-inflate.test.ts`, `tools/e2e/d2-local.mjs` |

Les décodeurs `formats/*.ts`, `compose.ts`, `layers.ts`, `data.ts`… sont **partagés, non copiés** ; seuls `Buffer` (→ `bytes.ts`),
`readdirSync` (→ `VfsCore.add`) et `node:fs` de `decor.ts` (→ `decor-tokens.ts`) ont été isolés.

### Contrôles d'identité

- CLI avant/après refactor, 3 planches (`paladin`, `fallen`, `andariel`) : **21 fichiers, SHA-1 identiques** (PNG compris).
- Chemin navigateur (inflate maison, lecture par tranches, PNG natif) contre le CLI (`check-browser.ts`) : JSON **octet pour octet**,
  empreinte de manifeste identique, **pixels de chaque page identiques**. Les octets PNG diffèrent seulement par le niveau
  de compression du flux zlib (le CLI utilise le niveau 9, `CompressionStream` le niveau par défaut).
- Dans Chromium (Playwright, vrais MPQ via `setInputFiles`) : **251 planches d'unités générées sans échec** (187 unités, 57 décors `dec_`, 7 `prop_`) ;
  le jeu en mode local ne demande plus à `/sprites/` la planche générée (`fallen`), garde les sprites d'origine pour les 67 autres
  planches, 0 requête `/d2/`, 0 erreur. Sans réglage : comportement inchangé.

## Mesures (Chromium headless, machine de test partagée ; RSS de tout le navigateur)

| Mesure | Valeur |
|---|---|
| Ouverture des 3 MPQ (tables de hachage/blocs + `(listfile)`) | **≈ 0,4 s** |
| 3 planches (paladin 1,5 s, fallen 0,7 s, andariel 2,8 s) | **5,6 s**, 8,1 Mo de sortie |
| 251 planches d'unités (tout `GAME_ACTORS`) | **176 s** (médiane 0,57 s ; pires : Méphisto 4,7 s, Diablo 3,7 s, Duriel 3,4 s, Baal 3,1 s) |
| Sortie de ces 251 planches (hi + lo + ombres, PNG) | **312 Mo** (unités 325 Mo, décors 3 Mo) |
| Même ensemble par le CLI Node (niveau PNG 9, écriture disque) | **287 s** (4 min 47 s) : le navigateur est ≈ 1,6× plus rapide (PNG zlib niveau 9 du CLI) |
| Mémoire : base 99 Mo → pic **430 Mo** (+330 Mo) sur les 251 planches ; ≈ +20 Mo sur 3 planches | pic dû surtout à l'accumulation dans l'API Cache et aux images composées d'un boss (≈ 40 Mo hi) |
| Lecture : fichiers de 250 Mo lus par tranches de secteurs (4 Ko) via `FileReaderSync` | jamais chargés en entier |

Le navigateur n'est donc **pas plus lent** que Node : c'est le même code, et `CompressionStream` est plus rapide que `zlib` niveau 9.

## Phase 2 — couverture graphique complète (hors cartes DS1 et audio)

Le mode `local` produit désormais **tout ce que le mode `enc`/`plain` sert pour le rendu des graphismes**, aux mêmes chemins
(`hi/<id>.json|-<n>.png`, `lo/…`, `icons/{skills,items,ground,loading}.{png,json}`, `ui/*.png` + `ui/ui.json`, `audio/npc-text.json`) ;
le jeu les lit par `SpriteBank.d2Read` / `d2Bytes('<chemin>')` → `localRead` (clé de cache `d2-local/<chemin>`), donc `SpriteBank`,
`ground.ts`, `d2icons.ts`, `d2ui.ts`, `d2ground.ts` n'ont pas changé.

### Méthode : un récepteur injecté, pas de copie

| Élément | Fichier |
|---|---|
| Interface `Sink { write(path, data); png(path, w, h, rgba) → octets }` ; chemins relatifs à `game/` | `sink.ts` |
| Récepteur CLI (disque, `encodePng` niveau 9) / navigateur (`CompressionStream`, rappel `put`) | `node-sink.ts` / `web-sink.ts` |
| Écriture d'une planche d'unité (hi, lo, ombres, JSON, hachage) et liste des pièces d'équipement, communes au CLI et au Worker | `sheets.ts` |
| Exporteurs branchés sur le récepteur, **algorithmes inchangés** (devenus `async` : l'encodage PNG du navigateur l'est) | `props.ts`, `ground.ts`, `export-fx.ts`, `export-skill-icons.ts`, `export-item-icons.ts`, `export-ground-items.ts`, `export-ui.ts`, `export-npc-text.ts` |
| Contrôles de sols/murs (PNG de contrôle, Node seul) sortis de `ground.ts` pour ne pas tirer `node:zlib` dans le Worker | `ground-control.ts` |
| SHA-1 synchrone commun (manifestes `hash`) à la place de `node:crypto` | `sha1.ts` |
| Catalogue (`units`, `parts`, `props`, `fx`, `grounds`, `extras`), `expandIds`, `generateAsset(data, id, sink)` | `browser.ts` |
| Worker : `catalog` / `generate` (ids ou groupes `all`, `units`, `parts`, `props`, `fx`, `grounds`, `extras`), manifeste `sheets` + `tiles` | `src/platform/d2local.worker.ts`, `d2local.ts` (`localCatalog`, `generateLocal`) |

### Contrôles d'identité

- **CLI avant/après refactor** : 901 fichiers de l'échantillon (paladin, fallen, 12 pièces d'équipement de 4 classes dont variantes d'arme,
  `props`, `fx`, `icons`, 3 sols) — **SHA-1 identiques fichier par fichier, manifeste compris**.
- **Navigateur contre CLI** (`check-browser.ts … all`, chemin Worker : inflate maison, PNG natif, récepteur mémoire) sur **le catalogue
  entier (1 126 assets, 6 577 fichiers)** : JSON/texte octet pour octet, `hash` de manifeste identique, pixels de chaque PNG identiques.
  Un seul « écart » : `paladin_w2ht_rh_axe` (animation « idle » absente des archives), qui échoue de la même façon au CLI : le sprite d'origine reste.
- Dans Chromium (vrais MPQ, `tools/e2e/d2-local.mjs --full`) : **1 099 planches + 21 sols** générés, puis partie courte
  (ville, Tristram avec monstres, inventaire ouvert) : **0 requête `/d2/`, 0 erreur**.

### Mesures (Chromium headless, machine de test partagée, `--full`, vrais MPQ de base)

| Catégorie | Assets | Temps | Taille (PNG + JSON) | Fichiers |
|---|---|---|---|---|
| Icônes de compétences, objets, objets au sol, écran de chargement, interface, texte PNJ (`extras`) | 6 | 12,0 s | 8,4 Mo | 92 |
| Sols (`grounds`) | 21 | 8,9 s | 4,9 Mo | 84 |
| Décor / murs (`props`) | 40 | 10,4 s | 1,2 Mo | 240 |
| Effets de sorts (`fx`) | 118 | 9,1 s | 11,4 Mo | 472 |
| Unités et décors d'acteurs (`units`) | 251 | 172 s | 312 Mo | 1 549 |
| Pièces d'équipement (`parts`) | 690 / 691 | 1 034 s | 231 Mo | 4 140 |
| **Total** | **1 126** | **1 249 s (20,8 min)** | **569 Mo** | **6 577** |

- Mémoire : RSS du navigateur 107 Mo → pic **698 Mo** (+592 Mo) sur l'ensemble ; stockage Cache final 570 Mo.
- Le CLI Node produit les mêmes 1 126 assets (hors cartes) en **574 s** : le navigateur est ≈ 2,2× plus lent sur l'ensemble
  (une pièce d'équipement : ≈ 1,8 s dans le Worker contre ≈ 1,45 s en Node ; surcoût de l'API Cache et de l'encodage PNG par flux,
  le calcul de composition domine). Sur les 251 unités seules le navigateur reste plus rapide que le CLI niveau 9, comme en phase 1.
- Partie courte en mode local (planches déjà en cache) : chargement du jeu ≈ 2,0 s, comme le mode `plain` de référence.
- **Pièces d'équipement = 83 % du temps et 41 % de la taille** : c'est le lot à rendre paresseux (phase 3) — une classe n'en
  utilise qu'une poignée à la fois.

### Comparaison visuelle (3 écrans, mode `local` contre `plain` généré par le CLI, sans cartes ni audio)

Ville (Harrogath), Tristram avec monstres, inventaire : mêmes planches demandées (les 37 `prop_*` du décor de ville restent sur
le sprite d'origine dans les deux modes), même mise en page. Différences : uniquement la **phase d'animation** (flammes des
feux, coup d'épée en cours) ; pixels différents > 30/765 : 1,2 % (ville), 1,9 % (zone), 0,03 % (inventaire) — tous dans des
zones animées. Aucun écart de couleur, d'ancre, de taille ni d'ombre observé.

### Fichiers hors MPQ de base, et ce qui reste désactivé en mode local

| Fichier / fonction | Origine | Décision |
|---|---|---|
| `obj.txt` (placement du décor posé des cartes, `decor.ts`) | fourni par l'utilisateur (extrait de D2) : **pas** dans les MPQ | non embarqué (fichier extrait de D2) ; le décor posé des cartes sera désactivé en mode local (phase 5) |
| `monpreset.txt` (monstres placés des cartes) | `Patch_D2.mpq` 1.10+ : dans la pile si le joueur fournit le patch, sinon absent | à lire depuis la pile virtuelle en phase 5 (déjà le cas via `data.vfs` si présent) ; sans lui, cartes sans monstres posés |
| Tables PD2 (`patch_d2.mpq`) | MPQ de patch du joueur | rien à faire : priorité alphabétique de `orderArchives`, comme au CLI |
| `audio/npc-text.json` | `string.tbl` (généré) | produit, mais lu seulement après `audio/index.json` (phase 6) |
| Cartes DS1 (`maps/…`), audio | phases 5 et 6 | absents : `d2Read` renvoie `null`, le jeu garde ses cartes et sa synthèse sonore |

Rien de Blizzard n'est versionné : aucune table dérivée n'a été ajoutée au dépôt.

### Estimation pour la totalité (extrapolée des mesures, ordre de grandeur)

Sortie du CLI pour une installation complète (`$D2_PRIVATE_DIR/out/game`) : `hi/` 341 Mo (3 329 fichiers), `lo/` 234 Mo (3 272), `maps/` **1 918 Mo (25 158 fichiers, ≈ 280 cartes)**,
`audio/` 68 Mo, `ui/` 7 Mo, `icons/` 2 Mo.

| Lot | Quantité | Temps PC (≈) | Temps téléphone ×3–×5 | Sortie |
|---|---|---|---|---|
| Unités + décors (`GAME_ACTORS`) | 251 planches | 3 min (mesuré) | 9–15 min | 312 Mo (hi+lo) ; **≈ 105 Mo en lo seul** |
| Pièces d'équipement (casque, arme, bouclier… par classe : 885 planches) | ~885 | 5–9 min (≈ 0,4–0,6 s, estimé : même chemin, 1 mode) | 15–45 min | ≈ 200 Mo |
| Sols (`ground.ts`), murs (`props.ts`) | ~40 planches | ~1 min (estimé) | 3–5 min | ≈ 40 Mo |
| Icônes de compétences, objets, UI, effets (`export-fx`) | ~600 images, ~40 effets | ~1–2 min (estimé) | 4–10 min | ≈ 10–15 Mo |
| Cartes DS1 (`export-map.ts`) | ≈ 280 cartes / 25 000 images | ≈ 4 s par carte mesurés au CLI (2 petites cartes : 8,7 s, 8 Mo) → 20–40 min au total, navigateur ≈ 0,6× | 1–3 h au total ; 10–25 s par carte à la demande | **1,9 Go** (≈ 40 % en `-lo`) |
| Audio (ADPCM + Huffman + MP3) | 2 800 sons, 10 musiques | non fait | — | 33 Mo MP3 |

**Import complet : ≈ 15–25 min sur PC (hors cartes), 1 h – 2 h sur téléphone, 1,0–2,6 Go de stockage** : inacceptable comme étape
obligatoire au premier lancement. La **génération paresseuse** est la bonne architecture (ci-dessous).

## Architecture proposée

1. **Entrée** : `<input type=file multiple accept=".mpq">` (ou glisser-déposer). Aucune API exclusive à Chrome de bureau
   n'est requise. Le Worker reçoit les `File` (références, pas de copie) et lit par `File.slice` + `FileReaderSync`.
2. **Index léger persistant** : après la première ouverture, ranger dans OPFS/IndexedDB (quelques Mo) la liste des fichiers, les
   tables Excel (`monstats`, `objects`…), `animdata`, palettes. Ouvrir un MPQ coûte 0,4 s, ce n'est pas le problème ;
   le problème est de **retrouver les File** à la session suivante (voir « disque vs OPFS »).
3. **Génération paresseuse par planche**, à la demande de `SpriteBank` : au chargement d'une zone, le jeu connaît la liste des
   planches (`sheetsFor`) ; en mode local il demande au Worker celles qui manquent dans le cache, affiche la barre de chargement
   déjà pondérée par les octets, et retombe sur le sprite d'origine **tant qu'une planche n'est pas prête** (le repli existe déjà :
   `revertToOriginal`). Une zone d'acte : ~15–25 planches ⇒ ≈ 10–15 s sur PC, 30–75 s sur téléphone la première fois, puis
   instantané (cache). Priorité : classe du joueur → monstres de la zone → décor → boss à l'arrivée.
4. **Palier unique sur téléphone** : ne générer que `lo` (moitié de résolution, ≈ 3× moins de pixels, ≈ 2× plus rapide)
   quand `SpriteBank.tier` est `lo` ; `hi` seulement sur machine puissante. Sans `hi`, le coût passe de 312 à ≈ 105 Mo pour les unités.
5. **Stockage** : API Cache (comme le mode chiffré) ou OPFS ; `navigator.storage.persist()` pour éviter l'éviction ;
   empreinte de version (empreinte des MPQ + version de l'outil) pour invalider.
6. **Mode choisi au démarrage** : mot de passe (dossier chiffré) · MPQ fournis (local) · sprites d'origine. Les deux premiers ne
   se cumulent pas ; le local pourrait compléter le dossier chiffré planche par planche (hors périmètre).

## Disque (`showOpenFilePicker` / `<input multiple>`) contre copie dans OPFS

| | `<input multiple>` / glisser-déposer | `showOpenFilePicker` + handle en IndexedDB | Copie dans OPFS |
|---|---|---|---|
| Chrome / Edge bureau | oui | oui (handle persistable, permission redemandée) | oui |
| **Chrome Android** | oui (le `File` est une référence lisible par tranches) | **non** (API absente) | oui |
| Firefox / Safari | oui | non | oui (Safari : quota plus petit) |
| Persistance entre sessions | **non** : l'utilisateur doit re-sélectionner | oui (bureau) | oui |
| Coût | aucun | aucun | **770 Mo d'écriture + 770 Mo de quota** (≈ 1 à 3 min) |

Sur Chrome Android le `File` d'un `<input>` reste lisible tant que la page vit, mais **ne survit pas au rechargement** et la
poignée n'est pas persistable. Deux voies : (i) tout générer une fois pendant que les fichiers sont présents (≥ 1 h sur
téléphone, ≈ 0,3–1 Go) ; (ii) copier les 3 MPQ dans OPFS une fois (770 Mo) et lire ensuite hors ligne sans re-sélection. La seconde
est la plus robuste (sélection unique, génération paresseuse possible ensuite) ; elle double le stockage. À trancher par une
mesure sur appareil réel (copie par flux : `file.stream().pipeTo(fileHandle.createWritable())` ; en Worker :
`createSyncAccessHandle`, plus rapide et supporté sur Android).

## Audio

Fait en phase 6 (voir la section « Phase 6 — audio » plus bas). Rappel du besoin d'origine : les sons de D2 sont en ADPCM + Huffman dans
`d2sfx.mpq` (52 Mo), `d2speech.mpq` (518 Mo), `d2xtalk.mpq` (60 Mo), `d2music.mpq` (345 Mo) ; `tools/d2audio` passe par StormLib (Python/ctypes) puis MP3.

## Risques

- **Durée au premier lancement** : 30–75 s par zone sur téléphone si la génération est paresseuse, sinon des heures ; l'UX
  (barre, repli sur le sprite d'origine, priorités) est le vrai chantier.
- **Pic mémoire** : un boss composé en `hi` ≈ 40 Mo de pixels + copies de travail ; mesuré +330 Mo cumulés sur 251 planches
  (surtout cache). Sur Android (renderer ≈ 1 Go) : traiter une planche à la fois, libérer les tampons, `lo` seul.
- **Quota / éviction** : 1–2,6 Go si tout est généré ; Safari/iOS plafonne bas et évince. Demander `persist()`, borner le palier.
- **Fichiers hors MPQ** : `obj.txt` (placement du décor des cartes, `decor.ts`) **n'est pas dans les MPQ** (fichier fourni à part par l'utilisateur) ;
  `monpreset.txt` vient du patch 1.10+. Le mode local doit soit les embarquer sous forme de table dérivée (non Blizzard : table
  d'indices, à vérifier juridiquement), soit désactiver le décor posé des cartes.
- **Variantes de versions / patchs PD2** : l'ordre de priorité est identique au CLI ; un MPQ de patch plus gros ne change pas
  l'architecture, mais augmente le temps d'ouverture (`(listfile)`).
- **Juridique** : le code d'import reste dans le dépôt, aucune donnée Blizzard n'est versionnée ; le mode local ne
  transmet rien.
- **Workers** : `FileReaderSync` n'existe que dans les Workers dédiés (pas SharedWorker/Service Worker) ; OK ici.
- **bzip2** (masque `0x10`) : toujours absent de `mpq-core.ts` (message « bzip2 non géré ») ; **jamais rencontré** : les quatre archives audio
  et les trois archives de base ont été lues en entier (masques 0x08, 0x40, 0x41, 0x80, 0x81 seulement). À vérifier sur des patchs tiers.

## Découpage en phases suivantes

1. **Phase 2 — couverture graphique (FAIT, voir plus haut)** : pièces d'équipement (`partLayer`), sols/murs (`ground.ts`, `props.ts`), icônes, effets :
   remplacer `writeFileEnsured`/`encodePng` des exporteurs par un récepteur injecté (`{write(path, bytes)}`), sans changer les
   algorithmes ; mesurer chaque lot sur Chromium puis sur un téléphone réel.
2. **Phase 3 — paresse et UX** : demandes par zone (`SpriteBank` → Worker), priorités, annulation, repli planche par planche,
   barre de progression, réglage « Générer maintenant / à la demande », estimation du stockage, invalidation par empreinte.
3. **Phase 4 — persistance** : index de fichiers + copie OPFS optionnelle (`createSyncAccessHandle`), `persist()`, reprise après interruption.
4. **Phase 5 — cartes DS1** : exportateur de cartes en Worker (le plus lourd : 1,9 Go ; à générer par carte et par bande `g<n>`),
   résolution de `obj.txt`/`monpreset.txt`.
5. **Phase 6 — audio** : Huffman + ADPCM dans `mpq-core.ts`, lecture paresseuse depuis `d2sfx/d2speech/d2xtalk/d2music`.
6. **Phase 7 — publication** : écran de choix du mode, textes, e2e sur Android.

## Recommandation

Poursuivre. Faire d'abord la phase 3 sur le périmètre déjà couvert (classes + monstres, `lo` seul), car c'est elle qui
décide de l'acceptabilité de l'UX sur téléphone ; la mesure sur appareil réel doit précéder la phase 5 (cartes) dont le volume
(1,9 Go) est le principal risque de produit : prévoir de ne générer que les cartes réellement visitées.

## Phase 3 — génération paresseuse (FAIT)

Le mode `local` ne génère plus rien à l'avance : `SpriteBank` demande au service (`src/platform/d2local.ts`) les assets dont la zone a
besoin, par priorité, et le jeu démarre avec ses sprites d'origine en repli.

| Élément | Fichier |
|---|---|
| Logique pure (file de priorité dédoublonnée et annulable, entrées de manifeste par palier, contrôle des archives, empreintes, estimations) — testée | `src/platform/d2local-core.ts`, `tests/unit/d2local-core.test.ts` |
| Service : catalogue, Workers (1 à 3 selon l'appareil), file, manifeste incrémental, quota, événements | `src/platform/d2local.ts` |
| Worker : `open` (session persistante), `job` (un asset, un ou deux paliers), `copy` (OPFS) | `src/platform/d2local.worker.ts` |
| Un seul palier : `buildActor / writeActorSheet / exportProps / exportGrounds / exportFx` prennent `tiers` (défaut hi + lo, sortie du CLI inchangée) | `tools/d2import/*.ts`, `check-tiers.ts` |
| Banque : repli planche par planche, remplacement à chaud, blocage du sol et du décor, priorités, préchargement | `src/render/assets.ts`, `renderer.ts` |
| Bandeau « Préparation des graphismes… 12/25 », section des Réglages | `src/ui/d2local-ui.ts`, `panels.ts` (option `d2local`) |

### Règles

- **Priorités** : sol et décor de la zone (0, bloquants) › joueur, mercenaire, pièces portées, interface (1) › monstres et effets
  affichés (2) › reste de la zone (3) › zone suivante : portail / retour en ville (4) › « tout générer » (5, un Worker au plus, un
  Worker toujours libre). Changement de zone : les demandes 2 à 4 de l'ancienne zone sont annulées (le travail en cours finit, il
  reste en cache), la tâche de fond n'est pas touchée.
- **Repli** : une unité dont la planche D2 n'est pas prête garde son sprite d'origine ; une pièce d'équipement, un effet (aucun
  original) apparaissent à leur arrivée. À l'arrivée : la planche est chargée et téléversée sur le GPU (une par image
  d'animation au plus), mise à la place de l'ancienne, qui n'est détruite que 1,5 s plus tard après avoir retiré les sprites qui
  la référencent. Le sol et le décor (construits une fois à l'entrée de zone) sont attendus : c'est le « court écran de chargement ».
- **Palier** : `lo` seul sur appareil modeste (tactile, ≤ 4 Go ou ≤ 4 cœurs) ou réglage « Économe » ; `hi` sinon selon la qualité
  d'image ; la garde de performance qui abaisse la qualité en cours de partie fait aussi tomber la génération sur `lo` (et `hi`
  est complété si la qualité remonte). Un asset déjà prêt à un autre palier sert en attendant.
- **Interface et icônes** (6 lots) : demandés dès que les fichiers sont là ; `d2Read` renvoie `null` tant qu'ils ne sont pas prêts
  et les chargeurs (`loadD2Ui`, `loadD2Icons`…) sont relancés à l'arrivée. La découpe des icônes passe par `toBlob` hors du fil principal
  (`toDataURL` gelait ≈ 18 s au total en mode logiciel ; `willReadFrequently` ramène `toBlob` à ≈ 55 ms au total).

## Phase 4 — persistance (FAIT)

| Besoin | Réalisation |
|---|---|
| Fichiers MPQ sur Chrome Android | `<input type=file multiple>` (`pickMpqFiles`) ; copie dans **OPFS** par le Worker (`createSyncAccessHandle`, morceaux de 8 Mio, progression) ; `navigator.storage.estimate()` avant, `navigator.storage.persist()` après |
| Bureau sans copie | `showOpenFilePicker` → poignées mémorisées dans IndexedDB ; permission relue à chaque lancement (bouton « Autoriser l'accès » si elle est à renouveler) |
| Reprise après interruption | copie : état dans deux fichiers alternés `copy.a/b.json` (séquence, taille, octets écrits, empreinte du fichier) — une écriture coupée net ne perd rien ; génération : le manifeste est écrit au fil de l'eau, un asset n'est « prêt » qu'une fois ses fichiers écrits |
| Invalidation | `GENERATOR_VERSION` + empreinte des MPQ (SHA-1 de 3 × 64 Kio et de la taille de chaque archive) dans `meta.json` du cache ; changement → cache généré purgé (les MPQ copiés restent) |
| Archive manquante / illisible | `archiveReport` : « Fichier manquant : d2char.mpq. », « Fichier illisible : … » ; `Patch_D2.mpq` (monstres posés des cartes) et patch PD2 : facultatifs, signalés |
| Stockage plein | copie : repli « session » avec message ; génération : `QuotaExceededError` → file annulée, message et bandeau, le jeu continue avec les sprites d'origine |
| Sans fichiers au lancement | les graphismes déjà générés sont lus depuis le cache sans Worker ; aucun Worker n'est lancé si tout est en cache |

### Mesures (Chromium headless logiciel, machine de test partagée ; `tools/e2e/d2-lazy.mjs`, vrais MPQ, 900 × 800)

| Étape | Mesure |
|---|---|
| Démarrage à froid, sans fichiers | jeu prêt en ≈ 1,0 s (sprites d'origine) |
| Fichiers choisis → acceptés (empreinte + catalogue : 251 unités, 691 pièces, 40 décors, 118 effets, 21 sols) | 2,0 à 2,6 s |
| Copie OPFS des 3 MPQ (770 Mo), en même temps que la génération | 5 à 11 s |
| Ville enrichie à chaud (47 à 69 assets dont les 6 lots d'interface et d'icônes ≈ 13 s de calcul cumulé), 2 à 3 Workers | file vide après 14 à 24 s |
| Entrée en zone non cachée (Tristram) : sol et décor bloquants (≈ 10 assets) | écran de chargement 2,0 à 2,5 s (hi), 3,3 à 3,8 s (lo, appareil tactile émulé) |
| Monstres de la zone : repli puis remplacement à chaud | 0,6 à 4 s après l'entrée ; 0 monstre sans planche |
| Rechargement de la page, sans re-sélection | jeu prêt en 1,6 à 3,5 s ; 0 requête `/d2/` ; 0 à 1 asset régénéré (aperçu de la classe par défaut de l'écran de sélection) |
| Fil principal pendant la génération | plus long écart entre deux images 217 à 320 ms, contre 370 à 480 ms sans génération (le rendu logiciel de ce banc ne tient qu'≈ 10 images/s) |
| Tout générer en `lo` (1 Worker, appareil tactile émulé) | **1 146 s (19 min)**, +222 Mo, 1 099 planches + 21 sols, 1 échec attendu (`paladin_w2ht_rh_axe`) ; contre 1 249 s et 569 Mo pour hi + lo (phase 2) |
| Coût moyen par asset au palier lo (Mo GPU / Ko PNG) | unité 2,3 / 505 ; pièce 0,66 / 142 ; effet 0,23 / 41 ; sol 0,48 / 80 ; décor 0,03 / 12 |

Non mesuré : un téléphone réel (le facteur ×3 à ×5 de l'estimation reste une hypothèse ; le banc émule seulement le pointeur tactile et
la résolution), WebGPU, Safari/iOS, Firefox, le sélecteur de fichiers natif (`showOpenFilePicker` : le chemin « poignées » est
testé avec des poignées OPFS, pas avec celles du sélecteur), l'éviction du stockage par le navigateur (`persist()` refusé en
headless : le stockage n'y est pas protégé).

## Phase 7 — écran de choix au premier lancement (FAIT)

Le jeu est publiable sans assets Blizzard ; l'écran de départ guide le joueur vers l'une des deux voies. Rien ne change quand un mot de passe
est déjà mémorisé (ou un refus `-` mémorisé : aucun écran).

| Situation | Comportement |
|---|---|
| Développement / e2e (`D2_SPRITES=0`, sans `D2_PUBLIC`) | aucun écran ; le réglage « Graphismes locaux » des Réglages garde son comportement (jeu tout de suite) |
| **Version publique sans dossier chiffré** : `D2_PUBLIC=1 npm run build` | écran à **une carte** (import des MPQ) ; aucune mention de mot de passe |
| Version à dossier chiffré (`D2_REMOTE=1`), sans mot de passe mémorisé | écran à **deux cartes** : « J'ai le mot de passe » et « importer mes fichiers » |
| Réglage local actif mais fichiers à fournir de nouveau (version publique) | l'écran s'ouvre directement sur la carte d'import (message de reprise : copie interrompue, fichiers introuvables…) |
| Fichiers déjà copiés (OPFS) ou graphismes déjà générés | rien : direct dans le jeu (si le réglage avait été perdu, il est réactivé tout seul) |
| Lien « Jouer avec les graphismes de remplacement (limités) » | **absent** des versions publiques et à dossier chiffré (lot 323 : on ne joue pas sans les fichiers Diablo II) ; seulement en développement (`?d2=choose`) et dans les builds de test `D2_ALLOW_SKIP=1` (scripts e2e sans MPQ), valable pour l'onglet (`sessionStorage`) |
| `?d2=choose` | force l'écran (essais) |

- Fichiers : `src/ui/d2-choice.ts` (écran), `onboardAction` / `relevantMpq` dans `src/platform/d2local-core.ts` (logique pure, testée), `SpriteBank.onboard`
  (`src/render/assets.ts`, bascule en mode `local` sans recharger), `.d2c-*` dans `style.css`.
- Sélection : plusieurs fichiers (`<input multiple>`) ou, sur bureau, le dossier d'installation entier (`webkitdirectory`) ; seuls `d2data/d2char/d2exp.mpq`
  et les patchs sont retenus (les `d2music`, `d2speech`, `d2video`… sont ignorés : pas de copie inutile de plusieurs Go).
- Erreurs : fichier(s) manquant(s) nommés avant toute copie, archive illisible, stockage insuffisant (repli « session » avec message), copie interrompue ;
  « Choisir d'autres fichiers » reste proposé.
- Copie : barre de progression ; « Jouer maintenant (la copie continue) » ; le bandeau en jeu prend le relais.
- Test : `tools/e2e/d2-onboard.mjs` (serveur `D2_SPRITES=0 D2_PUBLIC=1`).

## Phase 5 — cartes DS1 générées dans le navigateur (FAIT)

Les 129 cartes (`maps/…`, 1,9 Go au CLI) sont fabriquées **par carte**, à la demande, dans les Workers de la phase 3, avec le même code que le CLI.

### Ce qui a changé dans l'exporteur (CLI inchangé octet pour octet)

| Élément | Fichier |
|---|---|
| Construction d'une carte sans API Node, vers un `Sink` (CLI : disque, navigateur : API Cache) | `map-build.ts` (`buildMap`) ; `export-map.ts` ne garde que l'écriture disque |
| Liste des cartes (données pures, lue aussi par le Worker) | `map-specs.ts` |
| **Sol rejoué morceau par morceau** : liste ordonnée de commandes de peinture, tampon de 512 px (+16 px) au lieu d'un canevas de 20 880 × 10 940 px (913 Mo pour une carte de 128 × 128) | `map-build.ts` |
| Lecture MPQ : tous les secteurs d'un fichier en une seule lecture (au lieu d'une lecture de 4 Ko par secteur : dans le navigateur chaque lecture d'un `File` est un aller-retour entre processus) | `mpq-core.ts` |
| `monpreset.txt` sans API Node | `decor-tokens.ts` (`parseMonPresets`) |
| Données seules (JSON, même calcul, sans encoder les images), un palier à la fois, part k sur n de l'encodage | `MapBuildOptions` (`tiers`, `slice`) |

Contrôles d'identité :
- **CLI avant / après le refactor : les 129 cartes, 23 395 fichiers (PNG et JSON), SHA-1 identiques.**
- **Navigateur contre CLI** (`tools/e2e/d2-maps.mjs`, vrais MPQ + `Patch_D2.mpq`) : 15 cartes de 5 actes (Camp, Lut Gholein, Kurast, Forteresse, Harrogath, Tristram, Vaches…),
  hi et lo, **tous les PNG identiques pixel pour pixel** (les octets diffèrent seulement par le niveau de compression), JSON identique **sauf `decor`** (ci-dessous).

### Architecture

| Besoin | Réalisation |
|---|---|
| Service | `D2LocalService.requestMap / readMap / idleMapPrefetch / cancelMaps` (`d2local.ts`), identifiants `map:<id>` (données + images d'un palier), `mapdata:<id>` (données seules), `map:<id>@k/n` (part k sur n) |
| Lecture par le jeu | `SpriteBank.d2Read('maps/…')` → `readMap` : `index.json` fabriqué depuis le catalogue ; `<id>.json` lu dans le cache (jamais généré par une simple lecture) ; images : **attendues** (écran de chargement de la zone) puis lues dans le cache |
| Données (JSON) des cartes hors campagne | générées **en arrière-plan, une à la fois, quand plus rien d'autre n'est demandé** (`idleMapPrefetch`, toutes les 2,5 s) ; la ville (Harrogath) en tout premier, données + images, puis la ville d'origine est remplacée à chaud (`enterTown`) |
| Campagnes | bouton « Préparer les cartes » du point de passage (progression d/t), données attendues carte par carte |
| Priorités | ville : joueur ; images à l'entrée de zone : bloquantes ; arrière-plan : la plus basse, **interrompu** (annulation entre deux morceaux) dès qu'une demande urgente n'a pas de Worker libre |
| Parallélisme | **2 Workers de carte au plus** ; au-delà de 100 morceaux de sol (PC, non modeste) l'encodage des images est partagé entre deux Workers (`map:<id>@k/n`), le calcul de la carte étant refait par chacun ; un seul Worker sur appareil modeste |
| Annulation | changement de zone : travaux de carte de priorité « zone » annulés (`cancelMaps`), les fichiers déjà écrits restent |
| Cache / invalidation | mêmes clés (`d2-local/maps/…`) et même purge que les planches : `GENERATOR_VERSION` (4), empreinte des MPQ ; `manifest.maps` suit données / paliers / octets ; « Effacer les graphismes générés » efface aussi les cartes |
| Repli | carte impossible (fichiers absents, stockage plein, échec) : la zone garde son sol d'origine, jouable ; palier voulu indisponible mais l'autre en cache : l'autre est utilisé (`mapLow`) |
| Réglage | Réglages › Avancé › « Cartes de Diablo II » (Activées / Désactivées, `localStorage['d2m.d2localMaps']='0'`) |
| Correctif au passage | `renderer.updateObjects` gardait la planche d'un objet (coffre…) ou d'un PNJ détruite par le remplacement à chaud : objet invisible ou erreur pixi `addressModeU` (intermittente depuis la phase 3, systématique avec les zones sur carte). La vue relit désormais sa planche (et l'adopte si elle arrive plus tard) à chaque changement de la banque. |

### Fichiers hors MPQ : ce qui est désactivé en mode local

| Donnée | Effet sans elle |
|---|---|
| `obj.txt` (table acte + identifiant DS1 → objet ; extraite de D2, **pas dans les MPQ**, aucune source dans les archives) | **décor posé absent** : torches, braseros, étendards, bougies… des DS1 (`decor` vide : 3 591 entrées sur les 129 cartes du CLI). Le décor semé par le jeu (`d2decor.ts`) et les murs des cartes restent. **Sanctuaire du Chaos** : sans les repères `seal` / `start`, sceaux et cœur sont placés par le repli géométrique de `withD2Chaos` (positions approchées) |
| `monpreset.txt` (patch 1.10+) | si `Patch_D2.mpq` est fourni : monstres et PNJ posés identiques au CLI ; sinon cartes sans monstres posés (message « Patch_D2.mpq absent… ») |

### Mesures (Chromium headless logiciel, machine de test partagée, jeu ouvert ; hors arrière-plan ; une carte à la fois)

Temps d'une demande jusqu'à l'écriture de tous les fichiers dans l'API Cache ; tailles = PNG + JSON du palier.

| Carte (acte) | cases | morceaux | données seules | lo | hi (2 Workers si ≥ 100 morceaux) | lo / hi (Mo) |
|---|---|---|---|---|---|---|
| a1_den (1) | 24² | 21 | 0,27 s | 0,50 s | 0,93 s | 0,8 / 1,8 |
| a1_cave1 (1) | 72² | 68 | 0,43 s | 1,2 s | 2,6 s | 2,7 / 6,2 |
| a1_bloodmoor (1, plein air) | 96² | 270 | 1,8 s | **3,8 s** | **8,7 s** | 15,1 / 40,8 |
| a2_town (2) | ville | 108 | 1,3 s | 2,2 s | 3,7 s | 6,8 / 14,6 |
| a2_viper1 (2) | 80² | 100 | 0,70 s | 1,0 s | 2,2 s | 2,8 / 8,2 |
| a3_spider (3, 128²) | 128² | 246 | 1,5 s | 3,3 s | 7,7 s | 11,5 / 30,8 |
| a4_fortress (4) | ville | 22 | 0,61 s | 0,83 s | 1,6 s | 1,5 / 2,6 |
| a5_crystal1 (5) | 80² | 82 | 0,42 s | 1,4 s | 2,7 s | 2,8 / 5,3 |
| cows | 49² | 84 | 0,75 s | 1,6 s | 4,5 s | 4,2 / 10,9 |
| andariel | boss | 22 | 0,26 s | 0,39 s | 0,89 s | 0,7 / 2,0 |
| tristram | ville | 75 | 0,62 s | 1,8 s | 4,1 s | 4,2 / 9,7 |

- Décomposition (données seules, a1_bloodmoor) : décodage DT1 0,7 s, drapeaux 0,03 s, peinture + test de sol noir 1,0 s. Le reste est l'**encodage PNG** : au CLI (niveau 9, les deux paliers) 34 s dont 32 s de PNG.
  Gains retenus : **un seul palier** à la fois (37 s au CLI → 3,8 s lo / 8,7 s hi), **données seules** (1,8 s), lecture MPQ par fichier (décodage ÷ 2 à ÷ 10), morceaux vides sautés, **deux Workers** (hi 15 s → 8,7 s).
  Les cartes qui dépassent encore ~5 s au PC sont les 5 grands plein air en hi (a1_bloodmoor, a3_spider, a3_marsh, a3_jungle…) : ≈ 8 s une seule fois par carte.
- Mémoire : tampon de peinture 1,2 Mo + morceau 1 Mo + page d'atlas ≤ 16 Mo ; tuiles décodées 12 à 52 Mo ; mesuré 2 à 12 Mo de pic de tampon par carte (le canevas de l'ancien exporteur : jusqu'à 913 Mo).
- Cartes hors campagne (≈ 20) en arrière-plan : ≈ 25 s de calcul au PC au total, données seules ; une campagne (≈ 40 cartes) : 8 à 9 s (actes 2 et 5) à ≈ 80 s (acte 3, cartes de 128², un Worker, jeu en cours) au PC.
- **Extrapolation téléphone (×3 à ×5, un Worker, palier lo)** : données 1 à 9 s par carte, images lo 1,5 à 20 s selon la taille (grand plein air ≈ 20 s), 10 à 25 s typiquement à la première entrée d'une zone ;
  préparer un acte entier : 1 à 7 min ; tout le stockage lo ≈ 0,5 à 0,75 Go (≈ 3 à 15 Mo par zone visitée). Mesuré en émulation tactile (un Worker, lo, jeu comprenant la génération des planches de la zone) :
  Vaches 5,3 s, a1_bloodmoor 16,6 s, Andariel 4,8 s à l'entrée de la zone. **Non mesuré sur un téléphone réel.**
- En jeu (`tools/e2e/d2-maps-game.mjs`, mode local contre `plain`, même graine, simulation figée) : ville remplacée à chaud sans erreur ; Vaches, Andariel, Blood Moor, Égouts 1, Méphisto, Cristaux 1 : mêmes sols,
  murs, collision ; seuls écarts : le décor posé (torches, étendards, brasero) absent, les animations ; 5 à 15 % de pixels différents (le reste vient du HUD en cours de préparation et des animations).

### Limites

- Une zone dont la carte n'est pas encore préparée garde son sol d'origine à la première visite (la ville est préparée tout de suite, les autres en arrière-plan : en quelques dizaines de secondes à quelques minutes selon l'appareil, quand rien d'autre n'est demandé).
- Le décor posé des cartes n'existe pas en mode local (voir plus haut).
- Une grande carte en hi (≈ 8 s au PC) est le principal coût restant ; le chargement par morceaux visibles (au lieu de toute la carte avant l'affichage) est la piste suivante.
- Pas de mesure sur un téléphone réel, ni Safari / Firefox.


## Phase 6 — audio (FAIT)

Le mode local produit aussi **les sons, voix et musiques**, à la demande, avec les identifiants et chemins de `audio/index.json` du mode `enc` :
le moteur audio (`D2Sounds`, `MusicPlayer`) ne change que pour lire un son par plage d'octets. Les quatre archives sonores sont **facultatives**.

| Élément | Fichier |
|---|---|
| Huffman adaptatif MPQ (masque 0x01) et ADPCM mono / stéréo (0x40 / 0x80), sans dépendance ; tables de poids | `mpq-audio.ts`, `huffman-tables.ts` |
| `MpqCore.size()` (taille décompressée sans lire) et `MpqCore.stream()` (secteurs par lots, déchiffrement, arrêt anticipé) ; CLI inchangé | `mpq-core.ts` |
| Banque audio : index (mêmes `sounds`, `music`, `voices`, `gossip` que `extract.py` / `music.py` / `voices.py`), paquets par propriétaire, musique mélangée en mono par tranches | `audio-build.ts` |
| Worker (lecture par tranches, cache API `d2m-d2-audio`) et client (2 Workers : effets+voix / musique) | `src/platform/d2audio.worker.ts`, `d2local-audio.ts` |
| Service : archives audio suivies à part (empreinte, invalidation, copie OPFS facultative, rechargement sans archives), `readAudio`, `provideAudioFiles`, `clearAudio` | `src/platform/d2local.ts`, `d2local-core.ts` (`AUDIO_*`, `audioReport`) |
| Écran de choix (liste « facultatifs mais recommandés », case « copier aussi les sons ») et Réglages (ajout, effacement) | `src/ui/d2-choice.ts`, `d2local-ui.ts` |
| Moteur : lecture d'un son par plage (`D2Sounds.readRange`), garde mémoire des WAV, préchargement de zone (`warmZone`, rejoué à l'arrivée du contexte audio) | `d2sounds.ts`, `music.ts`, `audio.ts` |

### Contrôles d'identité

- **Contre StormLib** : `tools/d2import/check-audio.ts <archives> <référence>` — 65 fichiers (16 par archive d2sfx / d2speech / d2xtalk, 17 morceaux de
  d2music, 439 Mo) : **octet pour octet identiques**, par `get()` comme par `stream()` en tranches de 64 Ko, et mélange mono des 17 morceaux contre la stéréo de référence. Vecteurs StormLib (secteur mono et stéréo
  générés par `SCompCompress` sur un signal synthétique, donc sans donnée Blizzard) dans `tests/unit/d2-audio.test.ts`.
- **Lecture intégrale** : les 2 195 sons de d2sfx, 1 298 de d2speech, 718 de d2xtalk et les 41 WAV de d2music (1,5 Go décodés, 0 erreur, aucun masque
  bzip2).
- **Index** : identique à celui de la chaîne StormLib (2 840 sons : paquet, volume, boucle ; 33 morceaux ; voix 12 / 12 / 8 / 10 ; 229 phrases de bavardage).

### Sortie : WAV PCM 16 bits

Les effets restent en **WAV d'origine** (22 050 Hz, mono sauf 29 sons stéréo) : le décalage de chaque son dans son paquet est connu sans rien décoder
(taille décompressée du bloc MPQ), donc `index.json` se construit en 120 ms. Les musiques (stéréo 22 050 Hz, 10 à 30 Mo chacune) sont **mélangées en
mono** pendant le décodage (moitié de mémoire et de stockage). Pas d'encodeur : MP3 demanderait une bibliothèque, Opus (WebCodecs `AudioEncoder`) un
muxeur Ogg et du temps de calcul ; le stockage n'est de toute façon payé que pour ce qui est entendu (voir mesures). Le chemin des morceaux reste
`audio/music-<clé>.mp3` (le contenu est du WAV : `decodeAudioData` reconnaît le format).

### Mesures (Chromium headless logiciel, machine de test partagée, vraies archives)

| | Valeur |
|---|---|
| Décodage Huffman + ADPCM (Node) | ≈ 21 à 23 Mo/s de PCM ; Huffman ≈ 65 % du temps |
| Index complet (Sounds.txt, 4 archives, voix) | 120 ms (Node) ; 210 à 225 ms dans le Worker |
| Un effet (46 Ko en moyenne) | 2 ms (Node) ; **7 à 9 ms** dans le Worker, 9 à 11 ms de bout en bout |
| Morceau de zone (Tristram, 10,4 Mo mono) | 1,0 s (Node) ; 1,7 à 2,1 s dans le Worker (le Worker musique est séparé : un coup d'épée n'attend pas) |
| Voix d'un PNJ / ligne de bavardage de 15 s | 9 ms / 55 ms |
| Session courte (Tristram, 135 lectures) | 36 Mo en cache : 6 Mo d'effets, 29 Mo de musique (2 morceaux) ; RSS navigateur 89 → 205 Mo |
| Tout le catalogue d'effets | 131 Mo de WAV en 160 paquets (jamais produit en entier) ; 33 morceaux ≈ 330 Mo en mono |
| Rechargement sans les archives | index + sons déjà entendus servis par le cache : 0 décodage |
| Copie OPFS des quatre archives audio (≈ 1 Go) | faite en tâche de fond avec celle des graphismes : moins d'une minute au total sur le disque de test (non chronométrée à part) |

Extrapolation téléphone (×3 à ×5) : un effet 25 à 45 ms, un morceau 5 à 10 s la première fois (puis en cache). **Non mesuré sur un téléphone réel.**

### Choix de conception

- **Lecture paresseuse à trois niveaux** : un effet = une plage d'octets d'un paquet (`audio/pack-<propriétaire>.bin` + `[offset, longueur]`), jamais le
  paquet ; une voix = un fichier ; une musique = décodée par secteurs et mélangée au vol (jamais le stéréo entier en mémoire).
- **Cache** : API Cache `d2m-d2-audio`, clés `d2-audio/<chemin>[?r=<o>-<l>]`, version du décodeur (`AUDIO_GENERATOR_VERSION`) et empreinte des
  archives audio + d2exp / d2data (d'où vient Sounds.txt) : un changement vide ce cache (sans toucher aux graphismes). Les clés connues sont gardées en
  mémoire dans le Worker (un `match` raté coûte ≈ 5 ms en file).
- **Repli** : archive absente → sons absents de l'index → le moteur garde ses sons d'origine, sans erreur ; une seule archive (par exemple d2music) suffit.
- **Préchargement** : `warmZone` (monstres présents, ambiance, pas) à l'entrée de zone en plus de `warmClass` ; rejoué quand le contexte audio est créé
  (premier geste) ou quand l'index arrive après l'entrée en zone. 56 effets prêts 4 s après l'arrivée en zone, 0 requête.
- **Stockage** : les archives audio ne sont copiées dans OPFS que sur demande (case à cocher, ≈ 1 Go de plus) ; sinon lues telles quelles pendant la
  session, et les sons déjà entendus restent disponibles sans elles.

### Limites

- Huffman en JavaScript pur (≈ 20 Mo/s) : sur téléphone, le premier morceau de zone se fait attendre quelques secondes (silence en attendant).
- La musique du menu (lue avant le démarrage du service) n'est pas jouée en mode local ; elle l'est dans les zones.
- Pas de bzip2 (non rencontré) ; `d2xmusic.mpq` (Acte V) n'est pas utilisé, comme dans la chaîne StormLib.
- Pas de mesure sur un téléphone réel, ni Safari / Firefox.

## Phase 8 — sans repli (FAIT)

En mode `local` le jeu n'affiche plus de sprite d'origine quand un équivalent D2 existe : il ATTEND (écran de chargement bloquant : étape, compteur, temps restant).
Ordre : interface › icônes › carte › sols et murs › joueur et mercenaire › personnages et monstres (distribution COMPLÈTE : `src/render/roster.ts`) › objets › effets › sons.
Code : `src/platform/d2local-prep.ts` (pur), `SpriteBank.prepareLocal` / `strict` / `originalUsed`, `GameRenderer.prepGroups`, `App.localBootGate` / `localTownGate` / `setZoneGated`,
`Game.runGate` (une run attend les données des cartes hors campagne). Imprévu (monstre à la volée, pièce changée) : rien n'est dessiné, génération en priorité haute, bandeau discret.
Reste d'origine (aucun équivalent D2 dans le catalogue) : voir `npx tsx tools/d2import/coverage.ts` — `skeleton_*` non, mais : `prop_chest_prop`, `prop_shrine_candles`,
`prop_pillar_deco` (point de passage hors carte D2), `prop_coffin`, `prop_gate_a` ; décors `prop_*` des zones générées (cartes d'endgame, Tristram d'origine) ; 18 espèces de boss/uber
partagent la planche d'un autre monstre (rien d'original affiché). `obj.txt` : non dérivable des MPQ (table codée en dur dans D2, 150 entrées par acte) : décor posé absent.
Mesures (Chromium headless logiciel, 900×800) : PC — import → ville 17 s, Tristram 12 s (dont 6 s de porte) ; tactile émulé, CPU ×4 — ville ≈ 50 s, Tristram 41 s (dont 30 s de porte),
régénération complète (cache effacé, fichiers présents) 30 s ×4 CPU. Non mesuré : téléphone réel.
