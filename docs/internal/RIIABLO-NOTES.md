# Notes d'extraction Riiablo pour D2 Mobile

Source : dépôt Java Riiablo (Apache-2.0) cloné en lecture seule dans un clone local. Les chemins `fichier:ligne` ci-dessous sont relatifs à `core/src/main/java/com/riiablo/` sauf indication contraire.

## Règles suivies

- Aucun code Java n'est repris : uniquement des faits (coordonnées, formules, tables d'index, algorithmes décrits).
- Aucune table de données du dépôt Riiablo n'a été copiée dans notre dépôt. Le JSON `docs-data/riiablo-ui-layout.json` ne contient que des coordonnées numériques et des noms de fichiers D2 relevés dans le source.
- Signalement des données de Riiablo (`assets/data/*.txt`) : voir la section 8. `obj.txt` est identique octet pour octet à celui que nous utilisons déjà (`$D2_PRIVATE_DIR/in/obj.txt`, hors dépôt). Tout autre fichier à reprendre doit rester dans `$D2_PRIVATE_DIR/in/`.
- L'aperçu `$D2_PRIVATE_DIR/out/riiablo-create-layout-preview.png` (écran de création rendu avec les positions de Riiablo) contient des images extraites de nos MPQ : il reste hors dépôt.
- Aucun fichier source du jeu n'a été modifié, rien n'est commité. Les scripts de vérification sont restés dans un dossier local temporaire, non versionné.

## Résumé des trouvailles les plus utiles (classées valeur / effort)

| # | Trouvaille | Valeur | Effort |
|---|-----------|--------|--------|
| 1 | Ordre des calques COF : l'index de direction du COF n'est pas celui des DCC. Nous indexons `cof.order[]` avec l'index de fichier DCC, ce qui donne un ordre arme/bouclier/torse alternant (FBFBFB) au lieu d'arcs continus | élevée (rendu des personnages) | faible (une permutation) |
| 2 | Drapeaux de collision DT1 : les 25 octets sont stockés avec l'axe y inversé. Nous les lisons sans inversion | élevée (collision des murs) | faible, à vérifier avec un calque de debug |
| 3 | Écran de création : positions des 7 classes et du feu en repère D2 (origine DC6, pas de table « ancre vers pieds »), plus calques `nu2`, `fws`, `bws`, `nu3s` que nous n'exportons pas | moyenne-élevée | moyenne |
| 4 | Rectangles d'équipement : `inventory.txt` donne les cases exactes (ex. tête 135,8 54x51) ; les nôtres sont agrandis de ~4 px ; icônes de cases vides `inv_*.dc6` non utilisées | moyenne | faible |
| 5 | Couleurs de texte D2 exactes (bleu `#6969FF`, or `#C7B377`, vert `#00FF00`, orange `#FFA800`, gris `#696969`) ; les nôtres sont proches mais pas identiques | moyenne | très faible |
| 6 | Arbre de compétences D2 : fonds `skltree_*_back.dc6`, grille 3x6 d'icônes 48x48, onglets, boutons de fermeture par classe (aucun équivalent chez nous) | moyenne-élevée | moyenne |
| 7 | Barre de contrôle D2 : composition `800ctrlpnl7` (images 1..4 collées), remplissages d'orbes et recouvrements (`hlthmana` à +30,+14 / +8,+14, `overlap`), ceinture 4x4 de 31 px, bouton menu | moyenne | moyenne |
| 8 | Ordre de dessin des cartes : murs inférieurs (orientations 16-19) dessinés avec les sols, murs/objets triés par tuile, toits en dernier avec `roofHeight`, pop-pads (cases spéciales) qui masquent les toits | moyenne-élevée | moyenne |
| 9 | Points d'extension de format non lus par `ds1.ts` : groupes de DS1 (v12+), chemins de patrouille (v14+) ; `MonPreset.txt` pour les objets dynamiques (type 1) ; `LvlWarp.txt` / `Levels.txt` (Vis, Warp) pour les passages | moyenne | moyenne |
| 10 | Formules d'objets : opérateurs `op` 1-13 d'`ItemStatCost` (énergie, vitalité, par niveau), `descfunc` 1-19+ de formatage, résistances colorées par seuil | moyenne | moyenne |

---

## 1. Interface : panneaux

Voir le JSON `docs-data/riiablo-ui-layout.json` pour les valeurs converties en repère haut-gauche (`y_haut = H - y_bas - h`). Tous les panneaux « gauche/droite » font 320 x 432 (confirmé par décodage de nos DC6 : 4 morceaux 256x256, 64x256, 256x176, 64x176).

### Faits communs

- Bouton fermer : `PANEL\buysellbtn.dc6`, 23 images de 32x32, images 10/11 (haut/bas) (`screen/panel/InventoryPanel.java:99-105`). Achat 2/3, vente 4/5, réparer 6/7, tout réparer 18/19, vierge 0 (`VendorPanel.java:117-208`). Nous n'exportons pas ce fichier (voir `tools/d2import/export-ui.ts`).
- Les images de panneau se composent à partir du DC6 : `invchar6.dc6` contient 2 pages de 4 morceaux (page 0 feuille de personnage, page 1 inventaire) (`InventoryPanel.java:80`, `CharacterPanel.java:41`). C'est ce que nous faisons déjà (`export-ui.ts`, `assemble(inv, act1, 2, 0, 4)` et `4, 4`). Palette `act1`.
- Cases de grille : 29 px (`inventory.txt`, `gridBoxWidth/Height = 29`). Surbrillance de glisser-déposer : vert `(0.05,0.33,0.05,0.33)`, rouge `(0.33,0,0,0.40)`, blanc `(0.33,0.33,0.33,0.33)` (échange), bleu `(0.05,0.05,0.33,0.33)`, remplis en mode plein sur la zone de l'objet (`Colors.java:41-44`, `ItemGrid.java:~155-190`).
- Placement d'un objet tenu au curseur : il est centré sur le point de saisie. À 2 cases (largeur ou hauteur) il déborde du côté de la demi-case où se trouve le curseur ; à 3 cases de haut il est centré sur la case ; à 4 cases de haut il déborde de 2 cases du côté du curseur et de 1 de l'autre ; le tout limité aux bords de la grille (`ItemGrid.java:~160-205`). À reprendre pour le tactile.

### Feuille de personnage (`CharacterPanel.java`)

Déjà fait chez nous : `src/ui/panels.ts` place nom, classe, niveau, expérience, caractéristiques, vie, mana, résistances avec des valeurs très proches (écart de 1 à 3 px). Écarts observés :

- Riiablo : nom à (12,11) 168x13 ; classe à (194,11) 114x13 ; cellules niveau/XP/niveau suivant en deux lignes (libellé `ReallyTheLastSucker`, valeur `font16`) à y=32 de hauteur 33 : x=12 (42), 66 (114), 194 (114) (`CharacterPanel.java:62-91`).
- Colonnes : Force (11,84) / (78,84) ; Dextérité y=146 ; Vitalité y=232 ; Énergie y=294 ; défense (165,194) / (272,194) ; endurance, vie, mana à y=232, 256, 294 avec valeur à x=235 et max à x=275 ; résistances libellé x=175 (94 de large), valeur x=273, y = 333, 357, 381, 405 (`CharacterPanel.java:94-238`).
- Règle de police des valeurs : `font16` si <= 3 caractères, `font8` si 4-6, sinon `ReallyTheLastSucker` (`CharacterPanel.java:253-261`).
- Coloration : blanc par défaut, bleu si modifié, or si la valeur atteint le maximum, rouge si négative ; résistances rouge < 0, blanc < 75, or à partir de 75 (`CharacterPanel.java:263-282`, `widget/StatLabel.java:67-90`).
- Action : valeur faible/effort faible : harmoniser nos libellés (x=175 pour les résistances au lieu de 178). Pas de valeur à gagner ailleurs, notre panneau est déjà plus complet (boutons +).

### Inventaire (`InventoryPanel.java`)

- Rectangles d'équipement (x = `Left - invLeft`, y = `Top`, issus de `inventory.txt`, identiques pour toutes les classes) : tête 135,8 54x51 ; amulette 209,35 23x24 ; main droite 20,47 55x112 ; torse 133,77 56x82 ; main gauche 251,47 55x112 ; anneau droit 95,180 23x24 ; ceinture 136,179 52x25 ; anneau gauche 209,180 23x24 ; bottes 252,182 54x52 ; gants 21,181 54x53 (`InventoryPanel.java:136-225`, `inventory.txt` Amazon). Grille du sac : x=19, y=255, 10 colonnes x 4 lignes, pas 29.
- Chez nous : `D2_EQ_RECT` (`src/ui/panels.ts:77-88`) a les mêmes cases avec une marge de 3 à 4 px (par exemple bottes `[249,176,58,59]` contre 252,182,54,52). Écart sans gravité ; recalculer à partir d'`inventory.txt` donne l'alignement exact des zones cliquables avec l'image.
- Icônes de cases vides non utilisées chez nous (seul `slot-armor` est exporté) : `inv_armor` (54x82), `inv_belt` (52x25), `inv_boots` (54x52), `inv_helm_glove` (2 images 54x53 : 0 gants, 1 casque), `inv_ring_amulet` (2 images 23x24 : 0 amulette, 1 anneau), `inv_weapons` (54x109) (`InventoryPanel.java:136-225`). Action : exporter ces 6 DC6 et les poser en fond des cases vides (valeur moyenne, effort faible).
- Décalages d'icône par case : torse (2,2) ; bras (0,2) et (4,4) en jeu d'armes alternatif ; tête (0,1) ; amulette/anneaux (-1,1) ; ceinture (0,2) ; bottes/gants (-1,2) (`InventoryPanel.java:143-224`).
- Onglets de changement d'armes : `invchar6tab.dc6` (2 images 67x141, la largeur stockée 135 est jugée erronée par l'auteur), tracés à `armLeft - invLeft - 5` quand le jeu alternatif est actif ; zone cliquable de 20 px de haut en haut de l'onglet (`InventoryPanel.java:235-247, 316-328`). Nous n'exportons pas `invchar6tab`.
- Or : texte (109,392) 88x16, bouton de dépôt `goldcoinbtn` 20x18 en (84,391) (`InventoryPanel.java:284-297`). Chez nous or à (107,392,88,18).

### Coffre, cube, marchand, mercenaire

- Coffre (`TradeStash.dc6`, classe `Big Bank Page 1`) : grille 6 colonnes x 8 lignes à (74,82), or en haut à (98,23) 150x16 (alignement non précisé), bouton or (74,22) (`StashPanel.java:53-93`). Fermer à (272,385).
- Cube (`supertransmogrifier.dc6`) : grille 3 colonnes x 4 lignes à (118,139), bouton `miniconvert.dc6` (32x32) en (144,261), fermer (275,385) (`CubePanel.java:56-87`).
- Marchand (`buysell.dc6`, classe `Monster`) : grille 10x10 à (16,63) ; onglets `buyselltabs.dc6` (8 images 79x31, actif = i, inactif = i + 4) en (0,0), (80,0), (160,0), (240,0) ; libellés `strBSArmor/Weapons/Weapons/Misc` ; 4 emplacements de boutons en x = 116, 168, 220, 272, y=385 : acheter, vendre, réparer, (quitter ou tout réparer) ; masques de configuration BUY=1, SELL=2, REPAIR=4, REPAIR_ALL=16, EXIT=32, `TRADER`=BUY|SELL|EXIT, `SMITHY`=BUY|SELL|REPAIR|REPAIR_ALL, `GAMBLER`=TRADER ; or du coffre en (20,359) 180x16 aligné à droite (`VendorPanel.java:32-250`). Chez nous : `panel-buysell` et `tabs-buysell` sont déjà exportés (`export-ui.ts`) ; les boutons `buysellbtn` manquent.
- Mercenaire (`npcinv.dc6`, classe `Hireling`, `invLeft = -1`, donc +1 px sur les x) : casque 136,8 ; bras droit 21,47 ; torse 134,77 ; bras gauche 252,47 ; textes (nom 6,200 ; vie 163,200 ; XP/niveau/suivant à y=225 ; force/dex/dégâts/défense à y=267/291/315/339 en colonne gauche ; résistances même y en colonne droite x=165 et x=266) (`HirelingPanel.java:112-282`). Panneau non implémenté chez Riiablo (valeurs à 0), mais les coordonnées sont celles du vrai D2.

### Quêtes, points de passage

- Quêtes (`MENU\questbackground.dc6`) : 5 onglets `expquesttabs.dc6` (10 images 63x31, paires (2i, 2i+1)) en x = 2 + 63i, y=3 ; contenu 315x352 en (3,32) ; icônes en grille de 3 colonnes, cellules 80x95, espacement 4/16 ; fond d'icône `questdone.dc6` (27 images 72x86, images 0 normale, 25 pressée, 26 désactivée) à (5,4) ; surcouche `questsockets.dc6` (image 1 au survol) ; bouton « dernière quête » `questlast.dc6` (30x30) en (227,392) ; fermer (278,390) ; nombre de quêtes par acte `{6,6,6,3,6}` (`QuestsPanel.java:35-331`). Source des libellés : `quests.txt` (voir section 8).
- Points de passage (`MENU\waygatebackground.dc6`) : onglets `expwaygatetabs.dc6` identiques ; liste à (16,58) 290 de large, lignes de 32 px avec 4 px d'espace, icônes `waygateicons.dc6` (30x30 : 0 désactivé, 3 haut, 4 bas) ; triés par la colonne `Waypoint` de Levels.txt ; fermer (272,386) (`WaygatePanel.java:32-187`).
- Action : valeur moyenne, effort moyen : composer ces deux panneaux avec les vrais DC6 (nous n'avons pas de panneau de quêtes D2).

### Arbre de compétences (`SpellsPanel.java`)

- Fonds : `SPELLS\skltree_a|s|n|p|b|d|i_back.dc6` (16 images = 4 pages : 0 fond commun, 1 à 3 fonds des onglets) ; icônes : `AmSkillicon`, `SoSkillicon`, `NeSkillicon`, `PaSkillicon`, `BaSkillicon`, `DrSkillicon`, `AsSkillicon` (`CharacterClass.java:13-100`).
- Grille d'icônes 48x48 : colonnes x = 15, 84, 153 (pas 69) selon `SkillColumn` 1-3 ; lignes y (bas) = 370, 302, 234, 166, 98, 30 (pas 68) selon `SkillRow` 1-6, soit y_haut = 14, 82, 150, 218, 286, 354 (`SpellsPanel.java:147-157`).
- Niveau de la compétence : texte en `font16` (`fontformal10` au-dessus de 9) centré à (52,-5) par rapport à l'icône ; icône image `IconCel` normale, `IconCel + 1` pressée/désactivée (`SpellsPanel.java:277-281, 232-290`).
- Points restants : (256,63) 40x21 centré ; boutons d'onglets 90x108 à x=230 empilés depuis le bas (l'onglet 1 est en bas) ; bouton fermer 32x32 centré en (31|115|187 selon la classe, 401) (`SpellsPanel.java:84-145`).
- Plages d'Id de `skills.txt` par classe : Amazone 6-35, Ensorceleuse 36-65, Nécromancien 66-95, Paladin 96-125, Barbare 126-155, Druide 221-250, Assassin 251-280 (`CharacterClass.java`).
- Info-bulle de compétence : mana = `((1 << manashift) / 256) * mana + lvlmana * niveau` ; lignes de description selon `descline` / `dsc2line` / `dsc3line` (valeurs 1 à 67 : voir `SpellsPanel.java:187-214`) ; formules de calcul `parN` (paramètre N), `lnAB` (`param[A] + niveau * param[B]`), `dmAB` (`((110 * niveau) * (B - A)) / (100 * (niveau + 6)) + A`) (`SpellsPanel.java:215-229`). Les couleurs de `dsc3` (valeur 40) suivent les codes 0 à 9 de la table de couleurs (section 5).
- Chez nous : `skills()` dans `src/ui/panels.ts` utilise `panel-blank` avec un arbre dessiné par nos soins. Aucun usage de `SkillRow`, `SkillColumn`, `IconCel` (pas de `grep` positif dans `src` ni `tools`). Action : valeur moyenne-élevée, effort moyen : exporter `skltree_*_back.dc6` et les `*Skillicon.dc6` (déjà exportés pour les icônes) pour offrir la vue D2 authentique.

### Barre de contrôle (`ControlPanel.java`)

- Disposition de gauche à droite : orbe de vie (image 0, 117x104), bouton de compétence gauche 48x48, barre centrale, bouton de compétence droit 48x48, orbe de mana (image `n-2`, 117x104) (`ControlPanel.java:126-171`). Barre centrale = images 1 à n-3 collées (640 px : `ctrlpnl7` 128+128+54 = 310 ; 800 px : `800ctrlpnl7` 128+128+128+86 = 470). Totaux 117+48+310+48+117 = 640 et 117+48+470+48+117 = 800. L'image finale (128x55) n'est pas utilisée par Riiablo.
- Remplissage de la vie : `hlthmana.dc6` image 0 (80x80) à (+30,+14) du cadre de l'orbe, surcouche `overlap.dc6` image 0 (82x88) à (+28,+6) ; mana : image 1 à (+8,+14), surcouche image 1 à (+8,+10) (`ControlPanel.java:269-270, 304-305`).
- Ceinture : grille 4x4 de cases 31x31 à (177,8) dans la barre ; seule la rangée du bas est visible, le reste se déplie au survol ; arrière-plan `ctrlpnl_popbelt.dc6` (125x32) pour chaque rangée supplémentaire ; n'accepte que les objets de type POTI ; touches de raccourci en or `font16` à +2,+2 de chaque case (`ControlPanel.java:362-370`, `BeltGrid.java:34-125`).
- Mini-panneau : `minipanel.dc6` (176x26) centré au-dessus de la barre ; 8 boutons 20x20 (`minipanelbtn.dc6`, 18 images, paires haut/bas : personnage 0/1, inventaire 2/3, compétences 4/5, groupe 6/7, carte 8/9, messages 10/11, quêtes 12/13, menu 14/15, échange d'armes 16/17) avec marge 3 et espace 1 ; bouton d'affichage `menubutton.dc6` (15x24, 4 images : 0/1 caché, 2/3 affiché) centré à y=15 (`ControlPanel.java:326-350, 497-513`).
- Chez nous : `export-ui.ts` exporte déjà `orb-left/right`, `orb-life/mana/poison/cold`, `orb-overlap`, `minipanel`, `minipanel-btn` mais compose la barre avec les images 2 et 3 sous `bar-belt`/`bar-skill` ; la barre D2 exacte utilise les images 1 à 4 de `800ctrlpnl7`. Action : valeur moyenne, effort moyen.

### Contrôles mobiles (point 7)

- `MobileControls.java:45-120` : widget 256x256 ancré en bas à droite ; boutons 64x64 ; « interagir » (icône `Skillicon.dc6` image 8/9) en bas à droite ; 5 compétences en grille de pas 72 : (0,72), (72,72), (72,0), (144,72), (144,0) mesurés depuis le coin bas droit ; appui long de 0,5 s ouvre le panneau rapide des compétences ; un appui simple lance la compétence vers `position + direction de visée x 12` (sous-cases).
- `SpellsQuickPanel.java:93` : cellules de 64 px sur Android, 48 px sur ordinateur ; 5 rangées selon `ListRow` de `skilldesc.txt` (les compétences à charges en rangée 4) ; clic gauche : seulement les compétences `leftskill` ; jamais les passives.
- `MobilePanel.java:107-130` : barre pleine largeur de boutons 50x50 : groupe gauche (personnage, groupe, quêtes, échange d'armes) puis espaceur puis groupe droit (inventaire, compétences, messages, menu).
- Idées applicables : bouton « échange d'armes » (images 16/17 de `minipanelbtn`) ; appui long pour le choix de compétence ; grille 3x2 de compétences au pouce droit avec « interagir » dans le coin ; cible de tir dérivée de la direction de visée (12 sous-cases). Vérifier avec `docs/internal/ETUDE-MOBILE.md`.

---

## 2. Écrans de démarrage

Déjà fait chez nous : `src/ui/d2charselect.ts` et `export-ui.ts`. Voir aussi l'aperçu `$D2_PRIVATE_DIR/out/riiablo-create-layout-preview.png`.

### Écran de création (`screen/CreateCharacterScreen.java`, `widget/CharacterCreateButton.java`)

- Faits : fond `frontend\CharacterCreate.dc6` (800x600, palette `fechar`) ; positions des 7 personnages en repère haut-gauche 800x600, qui sont les origines des DC6 (les décalages d'image placent le cadre) : Amazone (179,355), Assassin (269,360), Nécromancien (309,335), Barbare (389,330), Ensorceleuse (504,340), Paladin (584,360), Druide (694,385) (`CreateCharacterScreen.java:245-272`, avec `x0 = 400 - 11`, `y0 = 300 - 300 + 265` en repère libGDX bas-gauche) ; feu (`frontend\fire.dc6`, 30 images, mode LUMINOSITY) à l'origine (378,300) (`CreateCharacterScreen.java:100-103`).
- Ordre d'empilement (bas vers haut) : Barbare, Nécromancien, Ensorceleuse, Assassin, Paladin, Amazone, Druide, puis le feu, noms, boutons (`CreateCharacterScreen.java:285-297`) ; le personnage sélectionné passe devant (`toFront()` dans `select()`).
- Animations par classe : `frontend\<classe>\<code>{nu1,nu2,nu3,fw,bw}.dc6` ; `nu2` est l'animation de survol qui reprend la même trame que `nu1` ; la marche vers le feu `fw` joue une fois (mode CLAMP) puis `nu3` boucle ; `bw` joue une fois pour revenir ; cadence 1/16 s par image (`CharacterCreateButton.java:89,108`).
- Calques spéciaux superposés : fichiers `fws`, `bws`, `nu3s` pour l'Ensorceleuse et le Nécromancien (mode LUMINOSITY), seulement `fws` pour le Paladin et le Barbare (mode ID) (`CharacterClass.java:36,52,69,85`, `CharacterCreateButton.java:118-120`).
- Sons : `data\global\sfx\cursor\intro\<classe> select.wav` et `<classe> deselect.wav`, plus `data\global\sfx\cursor\button.wav` (`CharacterCreateButton.java:63-64`, `CreateCharacterScreen.java:~36`).
- Textes : nom de classe en `font42` en haut au centre (y=10), description en `font16`, 300 de large, centrée, sous le nom ; libellé 5125 en or ; champ de nom avec `frontend\textbox.dc6`, marge 4, `fontformal12`, validation du nom à partir de 3 caractères (`CreateCharacterScreen.java:204-232, 315`).
- Chez nous : `CREATE_FEET` (`src/ui/d2charselect.ts:105-112`) : positions « pieds » placées à l'œil (assassin 205,470 ; nécromancien 305,428 ; amazone 405,418 ; paladin 505,428 ; druide 603,470 ; ensorceleuse 300,520 ; barbare 512,520), avec le feu en (384,414) et la table `ANCHOR_TO_FEET`.
- Écart constaté : en rendant nos propres images aux positions de Riiablo (aperçu), les 7 classes forment une ligne cohérente à y≈335-385 avec le feu posé sur la fosse du décor ; nos positions placent Ensorceleuse et Barbare au premier plan et le feu environ 114 px plus bas, hors de la fosse du fond. Les positions de Riiablo viennent des origines DC6, donc la table `ANCHOR_TO_FEET` devient inutile.
- Action : valeur moyenne-élevée, effort moyen : (1) tester les ancres Riiablo dans `d2charselect.ts` ; (2) exporter `nu2` (survol) et les calques `fws`, `bws`, `nu3s` ; (3) régler la cadence à 16 i/s (nous sommes à 12,5 i/s : une image sur deux de 25 i/s) ; (4) les sons de sélection de classe.

### Menu principal, titre, sélection (`MenuScreen.java`, `SplashScreen.java`, `SelectCharacterScreen3.java`)

- Logo : origine (400,150) ; deux calques par côté : `frontend\d2logoblackleft/right.dc6` (30 images 159x122, décalage -169,-74 / +9,-74) puis `d2logofireleft/right.dc6` en mode LUMINOSITY ; musique `data/global/music/Act4/diablo.wav` (`MenuScreen.java:76-97`). Nous n'exportons que les calques de feu (le rendu obtenu inclut visiblement les lettres, donc pas d'écart visuel).
- Boutons du menu : `frontend\3WideButtonBlank.dc6` (256+16 x 35, images 0 haut / 1 bas), centre de la colonne à (400,375), espace 8 ; chaînes 5106 / 5107 / 5109 ; police `fontexocet10` ; version en bas à droite (-20,-20) `font16` ; sons `cursor\button.wav`, `cursor\select.wav` (`MenuScreen.java:60-150`).
- « Appuyer pour continuer » : `fontformal12` centré à (400,450), alpha qui oscille de 0,5 à 1 par segments de 2 s (interpolation pow2) (`SplashScreen.java:93-97`).
- Sélection : boîtes `charselect\charselectbox.dc6` 272x93 en 2 colonnes à partir de (32,32), rangées de 93 ; texte à 4 lignes (progression en or, nom en or ou rouge en hardcore, « niveau + classe » avec la chaîne 5017, extension en vert avec 11077) ; colonne d'aperçu de 72 px ; double toucher = valider ; boutons moyens `MediumButtonBlank.dc6` 128x35 : Quitter en bas à gauche (20,20), OK en bas à droite ; boutons hauts `TallButtonBlank.dc6` 168x60 (supprimer 2744, créer 2743 avec `StringTBL.EXPANSION_OFFSET`) centrés en bas, espace 4 (`SelectCharacterScreen3.java:101-160`, `CharacterSelectButton.java:19-90`).
- Chez nous : `d2charselect.ts:202-233` (cases à x = 112 + col*132, boutons à (28,548), (264,548), (644,548)). Écart esthétique ; Riiablo reproduit la disposition D2 (boîtes de 272 px à gauche, boutons bas aux marges de 20 px). Action : valeur faible, effort faible.

---

## 3. Cartes

### Ce que fait Riiablo (et ce qu'il ne fait pas)

- Les constructeurs de carte sont écrits à la main : `Act1MapBuilder` place la ville (`LvlPrest` def 1 = Rogue Encampment, `ACT_DEF = {1, 301, 529, 797, 863, 1091}`, `map/Map.java:57`), puis la zone 2 (Blood Moor) à `(prev.width - zone.width, -zone.height)` avec des préréglages de bords choisis par numéro de `LvlPrest` (4 sud, 5 est, 6 nord, 7 ouest, 8 sud-ouest, 9 nord-ouest, 12 coin, 26/27 rivière, 48 et 52 sorties), et la zone 8 (Den of Evil) à `(level.OffsetX, level.OffsetY)` (`map/Act1MapBuilder.java:27-125`). `Act2`-`Act5MapBuilder` sont des squelettes de 35 lignes (Acte 2 choisit un fichier d'indice >= 1) (`map/Act2MapBuilder.java:10-35`). `LvlMaze`, `LvlSub` ne sont lus nulle part ; `map2/` (Zone, Chunk, Prefab, MapGenerator) est un chantier inachevé (`map2/MapGenerator.java`). Rien à reprendre pour la génération procédurale.
- Préréglages : les noms de fichiers viennent de `LvlPrest.File[0..5]` (une entrée dont le nom commence par `0` est vide) ; les DT1 chargés viennent du masque `Dt1Mask` : le bit i charge `LvlTypes.File[i]` (`map/Map.java:974-985, 1003-1010`).
- Dimensions d'une zone : `Levels.SizeX/SizeY[difficulté]` ; le préréglage 0,0 occupe la zone entière (`map/Map.java:~520-535, 652-690`).
- Monstres générés dans une zone sans préréglage : par case de grille, probabilité `2 * MonDen[diff] / 100000` ; type tiré avec poids `Rarity` des monstres de `Levels.mon[]` ; taille du groupe entre `MinGrp` et `MaxGrp` ; positions dispersées de +-2 sous-cases (`Act1MapBuilder.java:85-135`).
- Couches de zone : sols (2 max), ombres (1), murs (4 max), étiquettes (1) (`map/Map.java:47-54`, `map/DS1.java:50-58`).

### Passages, objets, monstres des DS1

- Passages : les cases spéciales d'orientation 10/11 (`SPECIAL_10/11`) sont codées `(orientation, mainIndex, subIndex)` ; `VIS_<mainIndex>_<n>` (la valeur `mainIndex` 0 à 7 choisit l'entrée `Vis[]`/`Warp[]` de `Levels.txt` de la zone : niveau de destination et ligne `LvlWarp`) ; cases d'entrée de ville `TOWN_ENTRY_1` (10,30,0), `TOWN_ENTRY_2` (10,31,0), `MAP_ENTRY` (10,30,11), point de corps `CORPSE_LOCATION` (10,32,0), portail `TP_LOCATION` (10,33,0) (`map/Map.java:59-160`). Une case passage dont `subIndex == 1` est ignorée (`map/Map.java:1102`).
- Entité de passage : position = case + `OffsetX/OffsetY` de la ligne `LvlWarp` ; portée d'interaction 3,0 ; boîte de sélection `SelectX/Y/DX/DY` ; nom = chaîne `LevelWarp` du niveau de destination ; version éclairée (`LitVersion`) : substitution des tuiles de sol `(orientation, mainIndex, i)` vers `i + Tiles` pour i = 0, 1 (ou, pour un sous-indice >= 2, de 0..3 vers 4..7) (`engine/server/ServerEntityFactory.java:205-229`, `engine/client/ClientEntityFactory.java:150-185`).
- Objets des DS1 : type 2 (statique) → `obj.txt` (acte, id → ObjectId) → `objects.txt` ; type 1 (dynamique) → `monpreset.txt` (acte, id → nom de `monstats`, `monplace` ou `superuniques`) (`engine/server/ServerEntityFactory.java:106-150`). Objet initialisé via `InitFn` d'`objects.txt` : 8 = torche (mode ON), 17 = point de passage (mode ON) (`engine/server/ObjectInitializer.java:36-44`). Portée d'interaction = `OperateRange` si l'objet est sélectionnable ; boîte de sélection d'un point de passage ±70 x ±30, étiquette « nom du niveau + nom de l'objet » (`ClientEntityFactory.java:88-108`).
- Monstres : points de vie tirés entre `minHP[0]` et `maxHP[0]` (difficulté normale), vitesse `Velocity` (marche) et `Run` (course) de `monstats`, taille `SizeX` de `monstats2`, composants tirés au hasard dans `ComponentV`, mode d'apparition `spawnmode` (`ServerEntityFactory.java:154-200`). Étiquette de nom pour `Align == 1` à la hauteur `pixHeight` ; sélectionnable si `isSel` (`ClientEntityFactory.java:123-135`).
- Chez nous : `tools/d2import/decor.ts` utilise déjà `obj.txt` pour le décor posé (obj.txt identique). Nous ne lisons ni `monpreset.txt` ni `LvlWarp.txt` (aucun `grep` positif) et `ds1.ts` ne lit pas les groupes (v12+) ni les chemins (v14+). Action : valeur moyenne, effort moyen : lire `monpreset.txt` pour placer les PNJ et monstres des villes, `LvlWarp.txt` pour les passages.

### Format DS1/DT1 : différences avec notre décodage

- `map/DS1.java:38-40` : pour une version < 7, les orientations sont converties par une table de 25 entrées ; `ds1.ts` ne convertit pas (aucun cas de version < 7 dans nos cartes ; sans importance).
- `map/DS1.java:393-418` : lecture des groupes (v12+, avec une valeur ignorée en v18+) et des chemins (v14+ ; chaque point `x, y, action` avec `action` absent avant v15) ; non lus chez nous. Les chemins servent de patrouilles aux PNJ (assignés à l'objet situé aux mêmes coordonnées).
- Cellule : bits `mainIndex` (20-25), `subIndex` (8-15), `0x80000000` = masqué, `0x00020000` = infranchissable, `0x000000FF` = masque « sol praticable » (valeur nulle = pas de sol) (`map/DS1.java:422-433`).
- Drapeaux DT1 par sous-case (`map/DT1.java:226-233`) : bit 0 bloque la marche, 1 bloque la vue, 2 bloque le saut, 3 bloque la marche du joueur, 5 bloque la lumière (nous utilisons 1 et 32). Les 25 octets sont stockés avec l'axe y inversé : le premier octet correspond à la rangée du bas, Riiablo corrige en écrivant `ty * 5 + 4 - ligne` (`map/Map.java:1198-1210`).
- **Vérification de l'écart sur nos données** : dans `fence.dt1` de la ville de l'Acte 1, un mur droit (orientation 2) bloque la dernière rangée du tableau (`#####` en rangée 4) et un mur gauche (orientation 1) bloque la colonne 0. Un mur droit longe le bord haut-droit de la tuile (rangée y = 0 après correction), donc la lecture brute place la collision sur le bord opposé. `tools/d2import/export-map.ts:195` lit `subFlags[sy * 5 + sx]` sans inversion. Action : valeur élevée, effort faible : inverser `sy` (utiliser `4 - sy`) et valider avec un calque de collision sur un mur de ville.
- Sélection des variantes de tuiles : tirage pondéré par `rarity` parmi toutes les tuiles ayant le même `(orientation, mainIndex, subIndex)` (`map/DT1s.java:59-70`) ; nous faisons un tirage déterministe pondéré (`pickTile`), équivalent.
- Cas particulier : les coins nord (orientation 3) ont un homologue d'orientation 4 (LEFT_NORTH_CORNER_WALL) qui n'est dessiné que pour la collision et l'image : Riiablo dessine les deux et fusionne les drapeaux (`map/Map.java:1141-1149`, `map/RenderSystem.java:793-797`). Vérifier que nous dessinons l'orientation 4.

### Ordre de dessin (`map/RenderSystem.java`)

Riiablo parcourt les tuiles en diagonales isométriques (tuile 160x80, sous-case 5x5 de 32x16). Quatre passes :

1. Fond (`drawBackground`, l. 520) : pour chaque tuile, d'abord les murs inférieurs (orientations 16-19 : `LOWER_LEFT_WALL`, `LOWER_RIGHT_WALL`, `LOWER_NORTH_CORNER_WALL`, `LOWER_SOUTH_CORNER_WALL`) dessinés à `py + hauteur + 96` (`drawLowerWalls`, l. 700-715), puis les 2 couches de sol (l. 717-733) ; ensuite, dans une seconde boucle, la couche d'ombres des DS1 en SOLID noir à 75 % (`modal75`) puis les ombres des entités (l. 735-765).
2. Plan intermédiaire (`drawMiddleground`, l. 593) : par tuile, dans cet ordre : entités avec `OrderFlag` 1 (au sol), entités `OrderFlag` 2 (murs et portes), les murs de la tuile (orientations 1 à 9, 12 pilier, 14 arbre ; les arbres devraient être triés comme des entités selon un commentaire de l'auteur), puis les entités `OrderFlag` 0 (objets, monstres) ; les entités de chaque tuile sont triées par `y` puis `x` de leur position (l. 99-105, 495-517). L'`OrderFlag` vient d'`objects.txt` (colonne `OrderFlag[mode]`) ; pour les non-objets, 2 si la position est sur un bord de tuile, sinon 0.
3. Avant-plan (`drawForeground`, l. 636) : toits (orientation 15) à `py + roofHeight` (champ de l'en-tête de tuile DT1).
4. Pop-pads : un mur ou un toit dont le `mainIndex` figure dans l'ensemble « popped » n'est pas dessiné (l. 772, 809) ; les ensembles viennent des cases spéciales `_47`.. `_74` (orientation 10, mainIndex 8, 9, 10, 12, 13, 16, 20 selon le groupe, `subIndex` = `mainIndex` des tuiles à masquer) et d'un rectangle défini par `PopPad` du préréglage (`map/Map.java:~140-160, 1220-1250`, `map/RenderSystem.java:393-413`).
- Chez nous : `tools/d2import/ds1-render.ts:158-176` dessine tout ce qui n'est pas sol ni toit en « mur » par ordre `x + y`, puis les toits ; `src/render/d2map.ts:72` trie par `depthKey` avec un biais (+40 toit, +6 arbre). Les écarts : (a) les murs inférieurs 16-19 ne sont pas distingués : ils devraient partir avec les sols, pas dans le tri des murs ; (b) pas d'`OrderFlag` pour les objets ; (c) pas de pop-pads (les toits des bâtiments restent toujours dessinés : voir la remarque « un toit dont le plan est noir » dans `export-map.ts:~228`) ; (d) les ombres sont dessinées à part, ce qui est bien.
- Action : valeur moyenne-élevée, effort moyen : isoler les orientations 16-19 dans la passe de sol ; lire `OrderFlag`. Les pop-pads sont l'astuce D2 pour faire disparaître les toits en entrant dans un bâtiment.

### Éclairage, collision, étiquettes de zone

- Il n'y a aucun système d'éclairage dans Riiablo (pas d'ambiante, ni de rayon lumineux) : rien à reprendre. Le seul traitement global est un gain de couleur x1,2 et une correction gamma dans le shader `indexpalette3.frag` (aucun effet de lumière par zone).
- Collision : un octet par sous-case par zone, OU des drapeaux des sols, murs et objets ; une sous-case est praticable si `flags == 0` (tous bits, pas seulement le bit 0) ; une cellule de sol dont les bits `0x000000FF` sont nuls (pas de sol) bloque la sous-case sur la couche 0 ; `0x00020000` bloque aussi. Hors zone, tout est bloqué (`flags` renvoie `0xFF`) (`map/Map.java:477-495, 1028-1075`, `map/MapGraph.java:85-90`).
- Bannière de zone : image `data\local\ui\eng\<act1|act2|act3|act4|expansion>\<Levels.EntryFile>.dc6` (l'Acte 5 utilise le dossier `expansion`), centrée à 20 % du haut, affichée 4 s puis fondu de 1 s, en mode DARKEN teinté rouge `(1,0.30,0.30)` ; le niveau d'Id 8 utilise `A1Q1` (`engine/client/ZoneEntryDisplayer.java:25-75`). Nous n'avons pas de bannière D2 : action valeur faible-moyenne, effort faible (les DC6 existent dans nos MPQ).
- Pas : `light_run_<matériau>_1` sur les images 4 puis 0 de la boucle de marche (`engine/client/FootstepEmitter.java:35-62`). Le matériau est tiré de `soundIndex` de la tuile (table très incomplète dans Riiablo : 128 = bois, sinon terre) ; nous avons déjà `stepSound` (`src/platform/d2sound-map.ts:289`).
- Pathfinding : A* sur la grille de sous-cases, 8 voisins, praticable si les drapeaux sont nuls, taille d'entité (clearance) calculée par point, lissage par lancer de rayon ; la vitesse est appliquée par déplacement le long du chemin (`map/MapGraph.java:60-91`, `engine/server/Pathfinder.java:32-125`).

---

## 4. Entités et animations

### Faits et vérification

- **Ordre des calques (écart important)** : le COF stocke `layerOrder[direction][trame][calque]`. Riiablo utilise `DC.Direction.toRealDir(direction, nbDir)` pour passer de l'indice de direction du fichier DCC à l'indice de direction du COF (`codec/Animation.java:344, 408, 435, 467`, `codec/DC.java:95-190`). Tables : 4 directions identité ; 8 : `d → {1,3,5,7,0,2,4,6}` ; 16 : `d → {2,6,10,14,0,4,8,12,1,3,5,7,9,11,13,15}` ; 32 : table complète en `codec/DC.java:154-190`. Ces tables sont les inverses de nos `D16` et `D8` (`tools/d2import/directions.ts:6-7`) : le COF est indexé dans l'ordre angulaire (position logique), les DCC dans l'ordre de fichier.
- Nous indexons `cof.order[d * step]` avec l'indice de fichier (`tools/d2import/compose.ts:~63-70`). **Test sur nos données** (COF du Paladin `paa11hs`, `panu1hs`, `pawl1hs`) : le calque `sh` (bouclier) est « avant le torse » ou « après » selon la direction. Avec notre indexation, le motif sur les 16 lignes logiques est `FBFBFBFBFBFBBFFF` (alternance absurde) ; avec l'indexation de Riiablo, `FFFFFFFBBBBBBBFF` (un seul arc continu, cohérent avec une rotation). Idem pour la main droite (`BBBBBBBBBFFFFFFF`). Donc l'ordre de superposition est faux pour environ la moitié des directions. Action : valeur élevée, effort faible : dans `compose.ts`, utiliser comme indice COF la position logique de la ligne (c'est-à-dire l'inverse de la permutation d'ordre de fichier) au lieu de l'indice de fichier ; régénérer les feuilles. Les rubriques `behind` du compositeur (`compose.ts:~58`) en profiteraient.
- Quirk COF : le format a une taille de 42 octets pour 1 calque / 1 direction / 1 trame : les « keyframes » y occupent 4 octets au lieu de 1 (`codec/COF.java:169-173`). Nos COF actuels passent, mais à tester pour les objets à une seule trame.
- Enumération des keyframes COF : 0 aucun, 1 attaque, 2 projectile, 3 son, 4 compétence (`engine/Engine.java:40-44`) ; `animdata.d2` utilise le même codage. Notre commentaire `animdata.ts` dit « 2 pas, 3 saut » : à vérifier (le code `1` = point d'impact reste valable).
- Cadence : 25 i/s de base (`codec/Animation.java:30`), vitesse AnimData `speed / 256` ; en jeu les animations de marche suivent la vitesse : joueur marche `32 * vitesse`, course `16 * vitesse` (unité = 1/256 de tick), soit à 6 sous-cases/s (marche) 192 donc 18,75 i/s et à 9 (course) 144 donc 14,06 i/s ; monstre : `speedAnimData * vitesseCourante / vitesseMarche` ou `/vitesseCourse` (`engine/server/VelocityModeChanger.java:30-70`). Vitesses : joueur marche 6, course 9 (`engine/Engine.java:97-98`) ; modes de ville `TN`, `TW` dans les villes (`ZoneMovementModesChanger.java`).
- Ombres : chaque calque du COF avec `shadow == 1` est redessiné avec cisaillement horizontal de -1 et échelle verticale 0,5, teinte noire 75 % (`codec/Animation.java:483-505`, `SHADOW_TINT = modal75`). Les calques LUMINOSITY n'ont jamais d'ombre (`codec/Animation.java:593`). Nous faisons déjà des ombres (sprite `shadow` dans `renderer.ts`).
- Mode de fusion (shader `assets/shaders/indexpalette3.frag`, fonctions décrites sans copier) : 0 alpha complet de teinte ; 1 (ID) alpha de teinte hors indice 0 ; 2 (LUMINOSITY) alpha = `(0,299 R + 0,587 V + 0,114 B) * 2` ; 3 teinte avec luminosité moyenne ; 4 couleur pleine = teinte ; 5 teinte, alpha = `1 - R` ; 6 teinte, alpha = `R` ; 7 ajoute la teinte ; 8 contraste x1,5 et +0,3 ; 9 rouge fixe ; 10 multiplication par la teinte. Notre `compose.ts` code déjà 25/50/75 % et additif.
- Colormaps (`Colormaps.java:15-62`) : 8 tables `items\palette\*.dat` : indice 1 `grey`, 2 `grey2`, 3 `brown`, 4 `gold` (ces deux jamais utilisées), 5 `greybrown`, 6 `invgrey`, 7 `invgrey2`, 8 `invgreybrown` ; un octet de transformation de COF = `(indice de table << 5) | rangée` (rangée 0 à 21 = teinte de `colors.txt` + 1) (`codec/Animation.java:640-646`, `item/ItemWrapper.java:50-56`). Pour un objet : `invColor` = couleur du préfixe/suffixe magique (`transform` / `transformcolor` de `MagicPrefix/Suffix.txt`), des rares, ou `invtransform` des uniques/sets ; la teinte n'est appliquée que si `InvTrans != 0` (`item/Item.java:316-396`). La table utilisée en inventaire est `colormaps.get(base.InvTrans)` donc pour `InvTrans = 1` c'est `grey` et non `invgrey` ; nous avons fait `1 -> invgrey`, `2 -> invgrey2`, `3 -> invgreybrown` (`tools/d2import/export-icons.ts:24`). Écart possible ; à vérifier visuellement sur une pièce teintée avant de modifier.
- Palettes (`Palettes.java`) : `act1..act5`, `endgame`, `endgame2`, `fechar` (création de personnage), `loading` (boutons et fonds de menu), `menu0..menu4`, `sky` (menu), `static`, `trademark`, `units` (personnages, monstres, fond de sélection). Nous utilisons déjà `act*`, `fechar`, `loading`, `sky`, `trademark` ; Riiablo dessine le fond de sélection `charselectbckg` avec la palette `units` (`SelectCharacterScreen3.java`, `render()`), alors que nous employons `loading` (`export-ui.ts`) : à comparer visuellement.
- Objets animés : `objects.txt` donne les modes (`MODE_NU 0, OP 1, ON 2, S1..S5 3-7`) et `OrderFlag` par mode (`engine/Engine.java:57-75`) ; un objet torche démarre en mode ON ; un point de passage démarre en ON (à relier à la sauvegarde). Notre `export-game.ts:328` lit déjà `FrameCnt0/CycleAnim0/FrameDelta0`.
- Alpha et transparence : `overrideTransLvl` / `newTransLvl` des calques de COF (octets 3 et 4) modifient l'alpha des calques ; Riiablo les range dans des événements d'alpha (`engine/client/CofAlphaHandler.java`). Nos noms `transparent` / `drawEffect` sont les mêmes octets. Alpha d'un objet éthéré : 2/3 (`item/Item.java:38`).
- Modes de personnage joueur : DT 0, NU 1, WL 2, RN 3, GH 4, TN 5, TW 6, A1 7, A2 8, BL 9, SC 10, TH 11, KK 12, S1..S4 13-16, DD 17 ; monstre : DT 0, NU 1, WL 2, GH 3, A1 4, A2 5, BL 6, SC 7, S1..S4 8-11, DD 12, XX 14, RN 15 (`engine/Engine.java:77-135`). Classes d'arme : NIL 0, HTH 1, BOW 2, 1HS 3, 1HT 4, STF 5, 2HS 6, 2HT 7, XBW 8, 1JS 9, 1JT 10, 1SS 11, 1ST 12, HT1 13, HT2 14 (`engine/Engine.java:8-22`). Le COF d'Acte 5 s'appelle `cmncof_a6` (`map/Map.java:395-407`).

---

## 5. Objets et statistiques

Notre sauvegarde est propre au jeu (pas de `.d2s`) : le codec binaire de Riiablo (`save/D2SReader*.java`, `item/ItemReader.java`) n'a d'utilité que comme référence de champs. Faits utiles :

- Qualités : 1 faible, 2 normal, 3 supérieur, 4 magique, 5 set, 6 rare, 7 unique, 8 artisanal (`item/Quality.java`).
- Couleurs de texte D2 (`Colors.java:10-39`), codes `ÿc0`..`ÿcC` : 0 blanc `#FFFFFF`, 1 rouge `#FF4D4D`, 2 vert `#00FF00`, 3 bleu `#6969FF`, 4 or `#C7B377`, 5 gris `#696969`, 6 noir, 7 or clair `#D0C27D`, 8 orange `#FFA800`, 9 jaune `#FFFF64`, 10 vert sombre `#008000`, 11 violet `#AE00FF`, 12 vert vif `#00C800`. Par qualité : magique bleu ; set vert ; rare jaune ; unique or ; artisanal orange ; runes orange ; normal/supérieur blanc, gris si éthéré ou serti ; mot runique et objets de quête en or ; propriétés magiques en bleu ; bonus de set en vert (`item/ItemLabeler.java:70-103, ~310`).
- Nos couleurs (`src/ui/style.css:11-18`, `src/render/renderer.ts:55-65`) : magique `#6a8aff`, set `#30d030`, unique `#c8a050`, artisanal `#ffa040`, gris `#9a9a9a`. Action : valeur moyenne, effort très faible : adopter les valeurs ci-dessus (surtout le vert et le bleu).
- Nom d'un objet (`item/Item.java:515-575`) : faible = nom de qualité faible + base ; supérieur = « Supérieur » (chaîne 1727) + base ; sertis de gemmes = « Gemmed » (chaîne 1728) + base ; mot runique = nom du mot ; magique = préfixe + base + suffixe ; rare/artisanal = nom de préfixe rare + nom de suffixe rare (pas de nom de base) ; set/unique = nom de l'entrée (chaîne `index`), sinon base si identifiant maximal.
- Image d'inventaire : `uniqueinvfile` / `setinvfile` si identifié, sinon `InvGfx[pictureId]` du type, sinon `invfile` de la base ; objet au sol : `flippyfile` (idem unique/set) ; son de dépôt et d'utilisation : `dropsound`, `usesound` avec surcharge unique/set ; image du drop : `dropsfxframe` (`item/Item.java:297-470`).
- Ordre des lignes d'info-bulle (`item/ItemLabeler.java:104-310`) : nom ; type (si > magique ou mot runique) ; devise de mot runique ; texte d'objet à usage ; défense (bleu si modifiée) ; dégâts à une main (`ItemStats1l`), à deux mains (`1m`), de lancer (`1n`) ; chance de blocage (`1r`) ; durabilité (`1d` ... `1j`) ; classe requise ; dextérité requise (`1f`) ; force requise (`1e`) ; niveau requis (`1p`) ; quantité (`1i`) ; type d'arme (`WeaponDesc*`) ; propriétés (bleu) ; éthéré/serti ; bonus de set partiels (2, 3, 4 pièces) et complet (propriétés `PCode2..4` / `FCode` de `sets.txt`). Table `WEAPON_DESC` : mace/club/hamm/scep → Mace ; axe/taxe → Axe ; swor → Sword ; knif/tkni → Dagger ; jave/ajav → Javelin ; spea/aspe → Spear ; bow/abow → Bow ; staf/wand → Staff ; pole → PoleArm ; xbow → CrossBow ; h2h/h2h2 → H2H ; orb → Orb ; tpot → ThrownPotion.
- Formules de propriétés (`attributes/AttributesUpdater.java:128-170`) : `ItemStatCost.op` : 1 et 13 : `valeur * statCible / 100` ; 2, 4 : par niveau `(valeur * niveau) >> op_param` ; 3, 5 : par niveau et pourcentage `(valeur * niveau >> op_param) * statCible / 100` ; 6, 7 : selon l'heure (non implémentées) ; 8 : énergie : `(valeur * ManaPerMagic) >> 2` (quarts) ; 9 : vitalité : `(valeur * (LifePerVitality ou StaminaPerVitality)) >> 2` ; 10, 12 : sans effet ; 11 : pourcentage du maximum (`item_maxhp_percent`, `item_maxmana_percent`). Les valeurs de vie/mana/endurance sont stockées en 1/256.
- Formatage des propriétés (`attributes/StatFormatter.java:52-250`) : `descfunc` 1 à 19 (et au-delà) avec `descval` (0 rien, 1 valeur avant le texte, 2 valeur après) ; `strneg` si valeur < 0 ; 5 et 10 : `valeur * 100 / 128` (7 bits) ; 11 : « répare 1 durabilité en N secondes » avec `100 / valeur` ; 13 : « +N aux compétences de la classe » ; 14 : « +N aux compétences d'onglet (classe seulement) » avec `param >> 3` = classe et `param & 7` = onglet ; 15 : « X % de chance de lancer le niveau N de <compétence> en touchant/frappant » ; 16 : « niveau N aura <compétence> quand équipé » ; 17, 18 : « selon l'heure » (`ModStre9d..g`). Nous avons une couverture partielle en français dans `src/ui/itemtext.ts`.
- Résistances et défense (feuille de personnage) : voir la section 1 (pas de formule de réduction dans Riiablo : le combat n'est pas implémenté).
- Générateur (`item/ItemGenerator.java:20-80`) : chance de sertissage 1/3, d'éthéré 1/20 (valeurs de test, commentées dans le code : non pertinentes pour D2 réel). Rien à reprendre.
- Tri des bases : non traité par Riiablo.

---

## 6. IA et jeu

- IA de monstres : `Zombie`, `Fallen`, `QuillRat`, `Npc`, `Idle` (`ai/*.java`). Cycle `IDLE → WANDER → APPROACH → ATTACK → DEAD` ; réveil toutes les `aidel * 40 ms` (`AI.java:69`, `SLEEP = aidel[0] * 1/25 s`) ; portée de mêlée = `2 + MeleeRng` de `monstats2` (`Zombie.java:86`) ; approche si la distance < `aip2` avec la probabilité `aip1 / 100` (Zombie) ou < 25 (Fallen) ; attaque A1 ou A2 avec la probabilité `aip4 / 100` ; après l'attaque, pause aléatoire de 1 à 2 s ; errance : cible à +-5 sous-cases, pause de 3 à 5 s ; le Rat à Piquants tire un projectile (A2) si la distance < `aip1` avec la probabilité `aip2 / 100` (`QuillRat.java:93-110`). Sons : `<MonSound>_attack_1`, `_hit_1`, `_death_1`, `_shoot_1`. Mort : modes DT puis DD (`engine/Engine.java`). Peu transposable à notre combat en temps réel, mais confirme les colonnes `aip1..aip8`, `aidel`, `MeleeRng` comme paramètres de comportement.
- PNJ (`ai/Npc.java:34-120`) : identifiants `hcIdx` d'Acte 1 : bavards 146, 147, 148, 150, 154, 155 ; marchands 147, 148, 154 ; parieur 147 ; réparateur 154 ; recruteur 150 (association probable : 146 Cain, 147 Gheed, 148 Akara, 150 Kashya, 154 Charsi, 155 Warriv, à confirmer dans `monstats.txt`). Menu : « Parler » = chaîne 3381 ; « Introduction » 3399 ; « Bavarder » 3395 ; « Commerce/réparation » 3334 ; « Commerce » 3396 ; « Annuler » 3400 (`ai/Npc.java:108-170`, `widget/NpcMenu.java:70`). Le menu est une table avec en-tête or `font16`, marge 8, espace 2 (`widget/NpcMenu.java:10-30`).
- Dialogues (`widget/NpcDialogBox.java:26-66`) : boîte 330x128, `fontformal11`, texte défilant ; l'ID de son `<nom>_act1_intro` ou `<nom>_act1_gossip_N` est converti en clé de chaîne par `speech.txt` ; la première ligne de la chaîne contient la vitesse de défilement (lignes par minute), le reste est le texte ; vitesse = `valeur / 60 * hauteurLigne * 0,85` pixels/s. Le son est joué en parallèle, la boîte se ferme à la fin du défilement. Nous avons `export-npc-text.ts` (29 lignes) : action valeur moyenne, effort moyen, exporter la liste son → clé (voir section 8).
- Mouvement : vitesse de marche 6 et de course 9 sous-cases/s ; monstres : `Velocity` / `Run` de `monstats` ; mouvement par chemin avec arrêt à 0,1 sous-case (`engine/server/Pathfinder.java:32-70`).
- Projectiles : vitesse `Vel`, portée `Range` de `missiles.txt`, taille « petite » (`ServerEntityFactory.java:240-250`).
- Dégâts et probabilités : aucune formule de dégâts, d'esquive ou de blocage n'est implémentée (le `DamageHandler` joue un son d'impact `impact_blunt_1`) (`engine/client/DamageHandler.java:15-22`) : rien à reprendre.
- Cvars : réglages techniques (console, langue, gamma, fenêtre) sans valeur de jeu (`Cvars.java`).

---

## 7. Contrôles mobiles

Voir la fin de la section 1 (`MobileControls`, `MobilePanel`, `SpellsQuickPanel`). Points supplémentaires :

- Les contrôles tactiles et les panneaux sont des composants indépendants du bureau : `ControlPanel` ne crée les boutons de compétence et la barre centrale que sur ordinateur (`ControlPanel.java:~105-125`), le mobile remplace tout par `MobileControls` + `MobilePanel`.
- Vibration courte (25 ms) sur l'écran d'accueil (`SplashScreen.java:164`) ; textures `touchBackground.png` / `touchKnob.png` pour un joystick virtuel (nous avons déjà `src/input/controls.ts`).

---

## 8. Autres fichiers de données (`assets/`, `excel/`, `table/`)

| Fichier | Nature | Utilité | Statut |
|---------|--------|---------|--------|
| `assets/data/obj.txt` (751 lignes) | table (Act, Id, Description, ObjectId) : objet statique de DS1 → ligne d'`objects.txt` ; 150 lignes par acte | absente des MPQ ; indispensable pour le décor posé des DS1 | identique à notre `$D2_PRIVATE_DIR/in/obj.txt` (comparaison sans écart), déjà utilisée par `tools/d2import/decor.ts`, reste hors dépôt |
| `assets/data/ds1types.txt` (1093 lignes) | table (Name, Def, LevelType) | correspondance `Def` de LvlPrest → nom, redondant avec `LvlPrest.txt` des MPQ | à ne pas reprendre |
| `assets/data/quests.txt` (32 lignes) | table de quêtes : id, nom, acte, ordre, visible, icône (`a1q1`...), image `questdone`, clés `qsts*` des états du journal | absente des MPQ ; utile pour un journal de quêtes D2 (ordre et icônes du panneau) | non reprise ; si utilisée, à garder hors dépôt |
| `assets/data/speech.txt` (186 lignes) | table (sound, soundstr) : nom de son de dialogue → clé de chaîne | absente des MPQ ; relie les voix des PNJ (`warriv_act1_intro`...) à leur texte | non reprise ; idem |
| `assets/(listfile)` (39 551 noms), `(listfile).0`, `(listfile).1` | listes de noms de fichiers des MPQ | nos MPQ en listent déjà 30 393 (2 noms seulement de plus par recherche de hash) | aucune valeur |
| `assets/ds1edit.dt1` | tuiles de l'éditeur DS1Edit (repères) | tuiles marqueurs ; nous filtrons déjà `collision.dt1` | aucune valeur |
| `assets/shaders/indexpalette*.frag/.vert` | shader d'application de palette | comportement des modes de fusion et gain 1,2 (section 4) | lu, non repris |
| `assets/consolas*.fnt`, `default.fnt`, `profiler/`, `textures/touch*.png`, `lang/Client.properties`, `ic_launcher_*.png` | polices et ressources de l'application | sans lien avec D2 | aucune |
| `excel/`, `table/` (modules Java) | bibliothèques d'annotations et de lecture de TXT (génération de classes) | décrivent comment les colonnes sont typées ; nos `data.ts` / `txt.ts` font déjà ce travail | aucune |
| `core/.../codec/excel/*` | classes de colonnes de `armor.txt`, `monstats.txt`, `levels.txt`, `lvlwarp.txt`, `lvlprest.txt`, `objects.txt`, `inventory.txt`... | utile comme liste de colonnes à lire ; aucune donnée | consultable |
| `tools/` (viewers, `d2s-reader`, `ds1-viewer`, `map-viewer`) | outils de debug Java | rien à reprendre | aucune |

---

## Récapitulatif des actions recommandées

Valeur élevée, effort faible :
1. `tools/d2import/compose.ts` : utiliser l'indice de direction angulaire (inverse de `D8`/`D16`, ou la table `toRealDir`) pour lire `cof.order[...]` ; régénérer les feuilles d'animation (section 4).
2. `tools/d2import/export-map.ts:195` : inverser l'axe y des 25 drapeaux d'une tuile DT1 (`4 - sy`), puis valider par un calque de collision sur un mur de la ville (section 3).

Valeur moyenne, effort très faible ou faible :
3. Couleurs de texte D2 exactes (section 5).
4. Recaler `D2_EQ_RECT` sur `inventory.txt` ; exporter les 6 icônes de cases vides et `invchar6tab` (section 1).
5. Exporter `buysellbtn.dc6` (fermer, acheter, vendre, réparer) pour les panneaux de coffre/marchand/cube (section 1).

Valeur moyenne-élevée, effort moyen :
6. Écran de création : adopter les origines DC6 de Riiablo (la table `ANCHOR_TO_FEET` devient inutile), ajouter `nu2`, `fws`, `bws`, `nu3s`, cadence 16 i/s, sons de sélection de classe (section 2).
7. Passe de sol : murs inférieurs 16-19 avec les sols ; `OrderFlag` des objets ; pop-pads de toits (section 3).
8. Arbre de compétences D2 (`skltree_*_back`, grille d'icônes, onglets) (section 1).
9. `monpreset.txt` et `LvlWarp.txt` pour placer PNJ/monstres et passages dans les cartes DS1 ; lecture des groupes et chemins de DS1 (section 3).

Valeur moyenne, effort moyen :
10. Barre de contrôle D2 exacte (`800ctrlpnl7` images 1 à 4, ceinture 4x4 de 31 px, orbes et recouvrements) ; bannière de zone D2 (section 1 et 3).
