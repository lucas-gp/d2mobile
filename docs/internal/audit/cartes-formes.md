# Formes des cartes d'endgame

Les 37 cartes (src/data/maps.ts) ne sont plus des carrés : chacune reçoit une **forme** générée
procéduralement (src/data/zones/mapshapes.ts, catalogue `MAP_SHAPES`), déterministe par graine, puis
habillée par le bâtisseur (src/data/zones/mapbuild.ts). Inspiration : les cartes de Project Diablo 2,
chacune tirée d'une zone du jeu (le wiki PD2 local ne décrit pas les cartes : les formes sont déduites du
nom et du thème de chaque zone).

## Principe

- **Grille de forme** : cases de 2 unités en extérieur (bords organiques), 4 unités en intérieur (les murs du
  décor mesurent 4 unités). Quatre états : roche/forêt (bordée du décor de bordure de la carte), praticable,
  **danger** (lave, boue, vide : infranchissable mais transparent aux projectiles et sorts) et bâtiment.
- **Rendu** : sol par tuile de 4 unités (`ZoneDef.groundTiles`) — sol de la zone, sol secondaire (rues,
  salles, chemins), lave (lueurs orange), boue, ou rien (noir : le vide, la roche des intérieurs). Extérieur :
  la roche est garnie d'arbres/rochers en trois rangs décroissants ; intérieur : un mur sur chaque bord
  praticable (plein au fond devant une masse épaisse, bas devant et pour les cloisons minces, comme D2).
  Villages : vraies maisons/ruines/tentes/tours du jeu sur les îlots bâtis.
- **Finition** : danger aligné sur les tuiles, aucun passage d'une case (2 unités) en extérieur, pas de
  pincement en diagonale (les coins du `WalkGrid` restent franchissables), toute composante isolée reliée
  à la principale par un couloir creusé (les miettes sont comblées).
- **Placement** : départ et arène du boss aux deux bouts de la forme (boss à ≥ 66 % du diamètre de marche
  sur la grille de forme ; testé ≥ 60 % sur la grille de marche réelle) ; événement de carte et autel dans
  les **poches** (alcôves, culs-de-sac, salles feuilles) classées par détour hors du chemin principal ;
  groupes de monstres répartis sur les cases dégagées, **densité constante : un groupe pour 215 unités²**
  praticables (× densité des affixes, ½ si fortifiée), voir « Densité » ; décor du thème dans les espaces
  larges (extérieur) ou contre les murs (intérieur).
- **Taille (×2, octobre 2026)** : surface praticable visée 19 000 / 20 000 / 21 000 / 22 000 unités² aux
  paliers 1 / 2 / 3 / donjons (avant : 9 500 à 11 000 ; cartes carrées d'origine : ~7 300), boîte englobante
  de 168×168 à 296×264 unités (plafond 300) ; jusqu'à cinq essais recalent l'échelle sur la surface mesurée
  (correction amortie après le premier : les treillis varient par paliers). Les générateurs à éléments
  linéaires suivent l'aire de la boîte (`lin`) : étoiles (moyeu, bras, poches), canyon (largeur, élargissements,
  culs-de-sac), couronne des cratères, palais (nef, trône, chapelles ×L²) en largeur ; route (une traversée par
  ~40 unités), failles (une par ~42 unités, tranchées ~32), catacombes (une galerie par ~13-15 cases),
  égouts (un tunnel par ~16 cases, salles ×aire), gués, rochers, ruines et clairières en nombre. Les autres
  (cavernes, îlots, salles, village, spirale, anneaux, plateaux, croix, haies) comptaient déjà leurs éléments
  à l'aire. Couloirs inchangés (≥ 3 sous-tuiles). Génération : 6 à 80 ms (mesure, 37 cartes × 3 graines).
- **Grille** : grille de marche (sous-cases de 0,5) de 113 000 à 309 000 cases (avant 57 000 à 160 000) ;
  champ de flux borné à 70 cases autour du joueur (coût indépendant de la carte), A* du bot ≤ 150 000 nœuds
  (≤ ~90 000 sous-cases praticables par carte).
- **Minicarte** : contours tirés de la grille de collision, révélés au fil de l'exploration (brouillard par
  tuile de 4 unités autour du joueur), comme les cartes D2 importées.

## Densité (octobre 2026)

« Agrandis ×2, et augmente considérablement la densité » : un groupe pour **215 u²** (avant 330 : densité ×1,5
par unité², groupes ×3,1 par carte) et des groupes plus gros, soit **~650 monstres par carte au lieu de ~185
(×3,5 ; ×1,8 par unité²)**.

| Palier | Surface moyenne (min-max) | Avant | Groupes | Monstres | Parcours à pied |
|---|---|---|---|---|---|
| P1 (et U1) | 18 800 u² (16 300-20 200) | 9 370 | 88 | 607 | 387 s |
| P2 (et U2) | 19 500 u² (18 000-21 000) | 9 630 | 92 | 630 | 492 s |
| P3 (et U3) | 21 300 u² (18 400-23 000) | 10 480 | 100 | 694 | 446 s |
| Donjons | 21 800 u² (21 600-22 300) | 11 250 | 103 | 715 | 520 s |

- **Groupes** : normaux 5 à 9 (une **horde** de 10 à 13 une fois sur quatorze, seulement là où la place libre
  dépasse 6 unités), champions 4-5, uniques 5-6 (une fois sur deux avec une **escorte** de 3-4 monstres ordinaires
  de la même famille, `SpawnDef.escort`). Rayon de dispersion selon la taille (2,7 à 3,9). Rangs : uniques 5 %,
  champions 11 % (avant 7 % et 13 %) : ~15 groupes d'élite par carte au lieu de ~6.
- **Répartition selon la forme** : tirage pondéré sans remise (Efraimidis-Spirakis) par le dégagement de la
  case : une grande salle ou clairière (12 unités libres) reçoit ~2× plus de groupes qu'un couloir étroit ;
  espacement minimal 9, puis 6, puis 3,5 unités.
- **Zones calmes** voulues : une pour ~3 000 u² (6 à 7 par carte), rayon 8 à 12 unités, aucun groupe ; départ
  calme : aucun groupe à moins de 24 unités (avant 16).
- **Affixes** conservés en multiplicateurs : densité `(1 + densité %)`, fortifiée ½.
- **Compromis** : la cible « ×4 groupes » (un groupe pour 160 u², groupes de 6-10, hordes 12-15, ~970 monstres)
  a été mesurée au bot d'endgame (3 graines × 1 h 30) : cartes de 11 min en moyenne (jusqu'à 17), **0,57 mort
  par carte** (avant 0,07) et le bot ne dépasse plus le palier 1-2. Les essais intermédiaires (215 u² avec les
  anciennes parts d'élites : 0,40 mort par carte, 12,6 min en moyenne) ont mené au réglage retenu.

### Performance

- **Plafond de monstres vivants** (`MAX_LIVE_MONSTERS` = 250, hors créatures du joueur) : un groupe atteint par
  l'anneau de la portée de l'écran (`World.viewReach`) attend tant que le plafond est atteint ; un groupe à sa
  propre portée de déclenchement (12 + rayon) et le boss de la run apparaissent toujours (on ne trouve jamais un
  lieu vide là où l'on attend un groupe). Pic mesuré au parcours à pied : 86 à 291 monstres vivants.
- **Repos des monstres lointains** : un monstre non alerté à plus de max(40, portée de l'écran + 8) unités ne
  flâne plus (il attend immobile ; portée d'aggro maximale : 20).
- **`World.step`** (serveur de développement, Node) : pire cas, tous les groupes d'une carte d'un coup
  (840-1 090 monstres au réglage ×5, 590-760 au réglage retenu) **0,4-1,0 ms par tick** (avant la densité :
  0,2-0,4 ms pour ~185) ; parcours normal 0,07-0,25 ms par tick (avant 0,03-0,10), pire tick isolé 5-22 ms
  (avant 4-11). Test : `tests/unit/map-shapes.test.ts` (pire cas < 12 ms par tick, seuil large ; budget d'un tick
  à 25 Hz : 40 ms).
- **Rendu** (Chromium logiciel SwiftShader, 844×390, images par seconde relatives) : départ 10-15, pleine densité
  à l'écran 12-16, carte entière déclenchée (590-750 monstres) 12-21 : aucune chute mesurable, le rendu ne dessine
  que l'écran (`cull`) ; les corps sont retirés 12 s après la mort ; objets au sol plafonnés à 400.
- **Minicarte** : centrée sur le joueur, échelle fixe, fenêtre de cases constante : son coût et sa lisibilité ne
  dépendent pas de la taille de la carte (brouillard par tuile de 4 unités, tableau de 1 800 à 5 600 tuiles).

### Butin

- Les cartes, orbes, éclats de Pierre-Monde (orbes et table « divers ») et sceaux tombent PAR MONSTRE : leurs
  chances (hors boss de carte) sont divisées par `MAP_DENSITY_DROP_DIV` = 3,0 (src/sim/constants.ts), rapport de
  l'espérance pondérée par rang (cartes 1,728 → 5,25 par carte nettoyée, orbes 1,357 → 4,10). Test : espérance
  par carte à ±10 % de l'ancienne. Le boss de carte (3 cartes, orbe, charme de brisure) ne change pas.
- Bot d'endgame (personnage au seuil des cartes, 3 graines × 3 h, avant → après), par carte terminée : cartes
  8,1 → 7,7, orbes 2,2 → 2,5, éclats 3,7 → 2,8 ; runes 8,1 → 22,6 (×2,8), uniques 2,0 → 5,2 (×2,6), rares
  5,3 → 12,2 (×2,3). **Par heure** : runes 84 → 90 (+7 %), uniques 21 → 20 (−5 %), ensembles 21 → 22, rares
  55 → 48 (−12 %), or ≈, expérience −3 %, cartes lâchées 81 → 29. Plus de monstres par carte, mais deux fois
  plus de marche et deux fois moins de boss (et de coffres de boss) par heure : le gain est par carte, pas par heure.

## Attribution par carte

Surface : moyenne de 3 graines, unités² praticables (grille de marche réelle, décor compris).

| Carte | Palier | Style | Forme | Boîte (graine 1) | Surface | Pourquoi |
|---|---|---|---|---|---|---|
| Jungle de Torajan | P1 | ext. | cavernes : clairières organiques | 226×226 | 19 600 | Jungle dense : clairières reliées par des sentiers sinueux, boucles et culs-de-sac |
| Tombe de Zoltun Kulle | P1 | int. | salles en croix sur treillis | 252×252 | 19 500 | Tombe du Kehjistan : chambres cruciformes, sanctuaire final en grande croix |
| Ombres de Westmarch | P1 | ext. | village + cimetière | 182×158 | 19 500 | Bourg en ruine : maisons de Tristram, rues pavées, placettes, cimetière clos de barrières |
| Phlégéthon | P1 | ext. | îlots de pierre dans la lave, ponts | 236×236 | 18 600 | Fleuve de feu : îles reliées par des passerelles, lueurs de lave |
| Temple perdu | P1 | int. | plan symétrique (temple) | 216×268 | 18 100 | Nef à colonnade, chapelles en miroir, sanctuaire au fond |
| Chute de Caldeum | P1 | ext. | ville en ruine | 172×172 | 19 300 | Ruelles entre ruines et église effondrée, pans de décombres infranchissables |
| Épreuve ancestrale | P1 | int. | étoile : arène centrale, 5 bras | 272×272 | 16 300 | Arène des Anciens au centre, épreuves au bout des bras, poches latérales |
| Trône de la Démence | P2 | int. | spirale vers le trône | 196×196 | 18 000 | Escargot de folie vers la salle du trône centrale, deux brèches de raccourci |
| Égouts de Harrogath | P2 | int. | canaux : quais, passerelles, salles | 292×264 | 19 200 | Réseau de tunnels à canal de boue central, passerelles, salles latérales |
| Plaines de cendres | P2 | ext. | failles de lave parallèles | 178×178 | 20 700 | Plaine crevassée, chaque faille franchie à un ou deux passages alternés |
| Canyon de Sescheron | P2 | ext. | canyon sinueux en zigzag | 278×278 | 21 000 | Gorge enneigée d'un coin à l'autre, élargissements, ravines en cul-de-sac |
| Sanatorium | P2 | int. | catacombes (pavillons) | 252×200 | 18 500 | Longs couloirs bordés de chambres de malades, salles aux extrémités |
| Citerne en ruine | P2 | int. | salles à bassins | 248×248 | 20 000 | Bassins de boue au centre des grandes salles, margelles, chaussées |
| Citadelle du Pandémonium | P2 | int. | salles + grande salle, couloirs diagonaux | 228×228 | 18 700 | Forteresse infernale : grande salle à colonnade, galeries obliques |
| Mémoire d’Horazon | P2 | ext. | fragments dans le vide | 240×240 | 18 900 | Souvenir du Sanctuaire des arcanes : grands fragments rocheux flottant dans le noir |
| Salles de torture | P2 | int. | catacombes (cellules) | 288×264 | 20 800 | Galeries de cachots à pointes de part et d'autre |
| Lune de sang | P3 | ext. | cratère à rebord rocheux | 238×238 | 21 400 | Cercle rituel : couronne boisée, bassin central aux tombes, rampes |
| Cryptes royales | P3 | int. | catacombes (niches funéraires) | 296×244 | 20 800 | Galeries à niches et cercueils, chambres royales aux bouts |
| Rivière de sang | P3 | ext. | vallée, rivière et affluent, gués | 196×158 | 22 100 | Rivière de sang (lave) en méandres, trois gués, rochers épars |
| Kyovashad | P3 | ext. | ville (maisons de pierre, tours) | 182×182 | 21 800 | Ville enneigée : maisons de Harrogath, tours, placettes à puits |
| Marché du Kehjistan | P3 | ext. | marché : grande place centrale | 180×180 | 21 900 | Place d'étals et de charrettes au centre, ruines et tentes autour |
| Champ de bataille d’Arreat | P3 | ext. | plateaux et rampes | 260×260 | 21 200 | Hauts plateaux séparés de falaises, rampes droites, sols alternés |
| Donjon du Bastion | P3 | int. | anneaux carrés (enceintes) | 168×168 | 18 400 | Enceintes concentriques, portes alternées, tours d'angle, donjon central |
| Route des démons | P3 | ext. | route en lacets bordée de lave | 224×224 | 22 100 | Quatre traversées reliées par des virages, placettes qui percent la lave |
| Forteresse de Skovos | P3 | int. | salles de tailles variées | 240×240 | 20 200 | Bastion amazone : salles et cour reliées en arbre + boucles |
| Plaines du Tourment | D | ext. | cratère, rebord de lave | 240×240 | 22 300 | Couronne extérieure, fosse de lave, rampes vers le bassin du Reflet de Baal |
| Sanctuaire du Péché | D | int. | cathédrale cruciforme | 228×268 | 21 600 | Nef, transept, abside ronde du gardien, chapelles en miroir |
| Steppes de Daken-Shar | D | ext. | cavernes (grands lobes) | 250×250 | 21 600 | Steppe : quelques immenses étendues reliées par de larges cols |
| Cité d’Ureh | U1 | int. | anneaux concentriques | 196×196 | 17 200 | Cité de lumière en cercles, portes alternées, cloisons radiales |
| Jardins déchus | U1 | ext. | labyrinthe de haies, clairières | 204×204 | 20 200 | Jardin à haies d'arbres, pelouses ouvertes, boucles |
| Palais impérial | U2 | int. | palais symétrique et cour | 208×244 | 19 800 | Nef large, cour d'honneur, ailes en miroir, salle du trône |
| Domaine du Djinn | U2 | ext. | étoile : oasis centrale, 6 bras | 272×272 | 20 200 | Oasis (bassin) au centre, pistes de sable vers six poches |
| Sanctuaire de Zhar | U2 | int. | salles-bibliothèques | 240×240 | 18 400 | Rayonnages (murs bas en rangées) dans les grandes salles |
| Abîme de Na-Krul | U3 | ext. | anneau autour du vide, île centrale | 274×274 | 23 000 | Abîme : deux longs ponts au-dessus du vide jusqu'à l'île du démon |
| Seigneur de guerre du sang | U3 | ext. | tranchées parallèles | 182×182 | 21 400 | Champ de bataille coupé de tranchées, passages alternés |
| Ruines de Viz-Jun | U3 | int. | ville en ruine (intérieur) | 192×192 | 21 700 | Cité des mages : îlots de murs effondrés, rues dallées, décombres |
| Vide extérieur | U1 | int. | éclats dans le vide, ponts droits | 260×260 | 19 700 | Cauchemar : petits éclats flottants reliés par de longues passerelles |

18 générateurs : cavernes, cratère, îlots, rivière, canyon, route, village, salles, spirale, étoile, haies,
anneaux, plateaux, failles, croix, catacombes, canaux, palais. 11 générateurs servent les 19 cartes
extérieures, 10 les 18 intérieures, et chaque carte a sa combinaison générateur + variante + danger :
37 identités de forme, empreintes toutes distinctes (test).

## Durées et bots

Après l'agrandissement ×2 et la densité (octobre 2026) :

- Parcours à pied (même outil, graine 5, 37 cartes) : moyenne 165 s → **451 s** (médiane 163 → 437 s) ; les plus
  longues : Égouts de Harrogath 821 s, Cryptes royales 670 s, Sanctuaire de Zhar 624 s.
- Bot d'endgame (build froid, personnage au seuil des cartes, 3 graines × 3 h, avant → après) : cartes jouées
  102 → 47 ; durée d'une carte terminée médiane 279 → **707 s (11,8 min)**, moyenne 290 → 749 s, maximum
  600 (arrêt) → 1 368 s ; tués par carte 215 → 562 ; morts par carte 0,11 → 0,26 (par heure 1,22 → 1,33) ;
  runs arrêtées 7 → 2 (arrêt d'une run de carte bloquée relevé de 600 à 1 500 s, `progressionSession`).
- Tests des bots (`tests/bots`, 3 h, graines 1-3) : cartes 39/38/33 → 19/18/19, morts par run 0,05/0,13/0,12
  (médiane 0,12) → 0,52/0,22/0,35 (médiane 0,35 ; seuils 0,75 et 0,85 par graine), palier max 3/3/3 → 2/3/3,
  runes moyennes 36/26/19 → 18/29/29 ; aucun seuil relâché.

Avant (formes à ~10 000 u²) :

- Parcours à pied (personnage immortel, tue au contact, sans téléportation ; outil de test `walkClear`,
  cible la plus proche en distance de marche) : moyenne 107 s → 165 s par carte (médiane 93 → 163 s ;
  graine 5, 37 cartes) ; les plus longues : Temple perdu 280 s, Sanctuaire de Zhar 251 s, Cryptes royales 247 s.
- Runs réelles du bot de froid (1 h 30 de cartes, graines 1-2) : 190 / 193 s → 211 / 268 s par carte (la
  graine 2 compte deux runs arrêtées à 600 s face à des élites Peau de pierre / Enchantés du froid que le
  bot ne tue pas : combat, pas navigation) ; le combat domine, l'exploration passe de ~12 s à ~35-50 s.
- Bot d'endgame (tests/bots, 3 h, graines 1-3) : cartes 49/56/46 → 44/54/40, morts (médiane) 0,61 → 0,55
  (chaque graine < 0,69), palier max médian 3 → 3, runes moyennes (médiane) 22 → 15, aucune run bloquée ;
  aucun seuil relâché.

## Limites

- Plafond de monstres vivants : quand il est atteint (course à travers la carte sans combattre), un groupe en
  attente peut apparaître à l'écran dès que des monstres meurent ; un groupe à portée de déclenchement apparaît
  toujours, même au-delà du plafond (dépassement de quelques dizaines).
- La part d'élites par groupe baisse (16 % au lieu de 20 %) mais leur nombre par carte monte (×2,5) : les morts
  du bot par carte doublent (par heure : +9 %). Par heure, le butin ordinaire reste à peu près constant (voir
  « Butin ») : le gain est par carte.

- Une run de carte sauvegardée en cours se régénère depuis sa graine : sa forme change avec cette version.
  La reprise ne plante pas : joueur, monstres et objets au sol restés dans un mur sont replacés sur la case
  libre la plus proche (`World.restore`).
- Les murs courbes (spirale, anneaux) suivent la grille de 4 unités : contours en escalier, comme les murs
  orthogonaux de D2.
- Le bot vise le monstre le plus proche à vol d'oiseau : sur les formes à détours (spirale, canaux), il
  marche plus longtemps qu'un joueur. La spirale est percée une fois par tour (brèches décalées) et les
  canaux ont une passerelle toutes les 4 à 6 cases pour limiter ces détours.
