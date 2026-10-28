# Direction artistique — ARPG « rendu Diablo 2 » (sprites pré-rendus)

> Statut : **décisions arrêtées** (v1). Toute valeur ci-dessous est une cible chiffrée, pas une piste.
> Méthode : modèles 3D low-poly libres (KayKit, Quaternius) → rendu hors ligne Three.js (caméra
> orthographique, navigateur headless) → atlas de sprites → affichage isométrique Pixi.js.
> Références visuelles : `references/` (voir `references/SOURCES.md`, usage interne, exclu du build).
> **Règle de fidélité à D2 pour tout asset : `ASSETS.md` § 0** ; fiches par asset : § 13.
> Convention d'écran : **1 px « jeu » = 1 px CSS** (cf. `docs/internal/ETUDE-MOBILE.md`, référence 844 × 390).

---

## 0. Ce que l'on sait de la fabrication de Diablo 2 (constats sourcés)

| Sujet | Constat | Source |
|---|---|---|
| Outils | « Almost all of Diablo II's in-game and cinematic art was constructed and rendered in 3D Studio Max », textures sous Photoshop. Aucun filtre ajouté sur les rendus (fil GameDev.net). | Postmortem Game Developer (E. Schaefer, oct. 2000) |
| Directions | Un outil maison rendait chaque modèle « from many different angles (**eight for all monsters, 16 for player characters**) » et exportait au format du jeu (DCC/DC6). | Postmortem |
| Échelle | Personnages modélisés en haute définition pour la promo mais « only seen in the game as **75 pixels tall** ». | Postmortem |
| Composition | Joueur en « poupée de papier » : tête, torse, jambes, bras, arme, bouclier rendus séparément en trois variantes (léger/moyen/lourd). Monstres : 14 modes d'animation possibles. | Postmortem, fichiers COF |
| Écran | 640 × 480 en 8 bits (D2 classique), 800 × 600 ajouté par LoD. Le mode « Perspective » (D3D plein écran) déformait les sprites selon leur orientation (mur gauche, mur haut, coin…). | Postmortem ; simonschreibt.de |
| Tuiles | DT1 : sol losange **160 × 80**, découpé en **5 × 5 sous-tuiles de 32 × 16** (collision, marche). Murs : mêmes 25 sous-tuiles au pied. Calques DS1 : sol, murs, **ombres pré-calculées** (orientation 13), toits (orientation 15). | Phrozen Keep KB « The DT1 Format » ; P. Siramy |
| Palette | 256 couleurs **par acte** (`data/global/palette/ACTn/pal.dat`, BGR). Le vrai jeu est dans `pal.pl2` : palette + tables de remappage (**32 niveaux de lumière sombre→moyen, 16 moyen→clair**, fondus alpha 25/50/75 %, additif, multiplicatif, **111 variations de teinte**, tons R/G/B, palette de texte à part). Les couleurs 224-254 changent selon l'acte. | OpenDiablo2/pl2 ; Phrozen Keep |
| Ombres | L'ombre est un sprite composé en temps réel comme le personnage (changer de casque change l'ombre). Option vidéo « ombres fondues » (alpha) vs tramées. | GameDev.net ; options vidéo D2 |
| Rayon de lumière | Codé en dur : **13 de base, 18 max**. À 2 le monde n'est plus dessiné, à 1 le personnage disparaît. | Phrozen Keep « Starting Light Radius » |
| Murs | Les murs qui masqueraient le joueur deviennent transparents à son approche (régression signalée dans D2R sur certaines tuiles). | Forums D2R |
| Cadence | Logique à **25 images/s** ; « vitesse d'animation » 256 = 1 image par tick. | AnimData.d2 |
| PD2 | Mêmes assets 8 bits (LoD 1.13c). Les wrappers D2GL/D2DX ajoutent résolutions libres, **upscale par shaders** (xBR, CRT…) et **texte en HD**. Couleur rouge « corrompu » pour les objets corrompus. | github.com/bayaraa/d2gl ; wiki PD2 |

### 0.1 AnimData.d2 — images **par direction** (extrait brut)

Sorcière, sans arme (HTH) / bâton (STF) :

| Mode | NU attente | WL marche | RN course | A1 attaque | SC sort | S1 | GH dégâts | BL blocage | KK coup de pied | DT mort | TN attente ville | TH |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Images | 8 (vitesse 128) | 8 | 8 | 16 / **18 bâton** | **14** | 14 | 8 | 5 | 12 | **24** | 16 (vitesse 80) | 20 |

Monstres (mode HTH, entre parenthèses la vitesse si ≠ 256) :

| Monstre (token) | NU | WL | RN | A1 | A2 | SC/S1 | GH | DT |
|---|---|---|---|---|---|---|---|---|
| Déchu (FA) | 20 | 10 | – | 10 | 15 | S1 24 | 7 | 20 |
| Zombie (ZM) | 8 (80) | 12 (104) | 8 | 16 | 16 | S1 16 | 5 | 19 |
| Squelette (SK) | 8 (128) | 8 (128) | – | 16 | 16 | S1 12 | 4 | 19 |
| Momie (MM) | 14 | 12 | – | 18 | 16 | S1 19 | 6 | 22 |
| Bovin infernal (EC, token présumé) | 10 (72) | 8 (192) | – | 19 | 19 | – | 5 | 14 |
| Andariel (AN) | 16 (160) | 12 | – | 16 | – | SC 18 | 6 | 23 |
| Duriel (DU) | 12 (128) | 16 | – | 10 | 15 | – | 6 | 25 |
| Méphisto (MP) | 13 (160) | 13 | – | 18 | 17 | – | 6 | 25 |
| Diablo (DI) | 12 (96) | 12 (192) | 22 | 16 | 20 | SC 17 / S1 18 | 6 | **142** |

À retenir : attente et marche tiennent en **8 images**, les attaques en **10-19**, la mort en
**19-25** ; les dégâts reçus en **4-8**. D2 n'économise pas sur la mort ni sur l'attaque.

---

## 1. Projection et caméra

### 1.1 Confirmation du 2:1

Un carré au sol tourné de 45° (lacet) a ses deux diagonales égales. Vue par une caméra
orthographique inclinée d'un angle **θ** sous l'horizontale, la diagonale transversale garde sa
longueur, la diagonale dans l'axe de visée est multipliée par **sin θ**. Pour un losange 2:1
(160 × 80, 32 × 16) :

```
sin θ = 80 / 160 = 0,5   →   θ = arcsin(0,5) = 30,000°
```

(L'isométrie « vraie » θ = arctan(1/√2) = 35,264° donnerait un losange 1,732:1 — ce n'est pas D2.)
Une verticale de hauteur h se projette en **h · cos 30° = 0,8660 h**.

### 1.2 Paramètres arrêtés

| Paramètre | Valeur |
|---|---|
| Type | `THREE.OrthographicCamera` (aucune perspective, aucun mode « Perspective » D2) |
| Lacet (yaw) | **45°** : caméra dans la direction (+X, +Z), regarde l'origine |
| Élévation (pitch) | **30°** sous l'horizontale |
| Vecteur caméra→cible | `-(cos30·sin45, sin30, cos30·cos45)` = `-(0,6124 ; 0,5 ; 0,6124)` |
| Axes écran | droite écran = monde (+X −Z)/√2 ; bas écran (vers le joueur) = monde (+X +Z)/√2 |
| Axe monde +X à l'écran | vers le **bas-droite**, pente 2:1 (16 px, 8 px par unité) |
| Axe monde +Z à l'écran | vers le **bas-gauche**, pente 2:1 (−16 px, 8 px par unité) |

### 1.3 Unité monde → pixels

> **Arbitrage de l'intégrateur (après l'étude) :** la simulation utilise **1 unité = 2 sous-tuiles D2
> (≈ 1 m, 2 « yards » D2)** pour garder des grilles et des distances compactes (la grille de marche
> `CELL = 0.5` vaut alors une sous-tuile). **Les pixels ne changent pas** : K = 45,25 px par unité
> (= 2 × 22,627), tuile d'1 unité = losange 64 × 32 px, hauteur 39,2 px par unité, Sorcière de 1,8 unité
> = 72 px à l'échelle 1. Les portées D2 exprimées en yards se divisent par 2. Le tableau ci-dessous
> reste valable en « sous-tuiles ».

**1 unité monde = 1 sous-tuile D2** (losange 32 × 16 px à l'échelle 1). La grille de marche
existante (`CELL = 0.5`, `src/sim/grid.ts`) fait donc 2 × 2 cellules par sous-tuile.

| Grandeur | Formule | Valeur à l'échelle 1 |
|---|---|---|
| Échelle orthographique K | 32 / √2 | **22,627 px par unité** (horizontal écran) |
| Pas d'un axe monde au sol | (±16, 8) px | 17,89 px de long |
| Hauteur verticale | K · cos 30° | **19,596 px par unité de hauteur** |
| Tuile de sol | 5 × 5 unités | **160 × 80 px** |
| Largeur de monde visible, 844 px CSS | 844 / K | 37,3 unités (D2 800 px : 35,4 ; 640 px : 28,3) |
| Profondeur visible, 390 px CSS | 390 / (K · 0,5) | 34,5 unités |

Conséquence : en paysage mobile, la largeur de monde visible est **celle de D2 en 800 × 600** ;
on voit moins en hauteur (390 contre ~550 utiles), ce qui est acceptable en paysage.

### 1.4 Réglage Three.js (par cellule de sprite)

```ts
const K = 32 / Math.SQRT2;          // px par unité à l'échelle 1
const SS = 4;                        // suréchantillonnage (cf. §5)
// cellule W×H px (échelle 1), pied du personnage à (ax, ay) px depuis le coin haut-gauche
const cam = new THREE.OrthographicCamera(-ax / K, (W - ax) / K, ay / K, -(H - ay) / K, 0.1, 400);
const yaw = THREE.MathUtils.degToRad(45), pitch = THREE.MathUtils.degToRad(30);
cam.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(100);
cam.lookAt(0, 0, 0);
renderer.setSize(W * SS, H * SS);   // puis réduction ×4 → échelle 1
```

Le pied (origine monde) tombe exactement sur `(ax, ay)` : c'est l'ancre Pixi du sprite
(stockée dans le JSON d'atlas après rognage).

### 1.5 Directions

| Catégorie | Directions | Pas | Direction 0 |
|---|---|---|---|
| Sorcière (joueur) | **16** | 22,5° **en angle monde** (rotation du modèle, caméra fixe) | face caméra (monde +X+Z, « sud » écran) puis sens horaire vu du dessus |
| Monstres, PNJ, familiers | **8** | 45° monde | idem |
| Décor statique, objets au sol | **1** | – | – |
| Projectiles orientés (éclair de glace, flèches) | 16 | 22,5° | idem |
| Effets radiaux (nova, explosion) | 1 | – | – |

Avec lacet 45°, les 8 directions monde tombent sur les 4 cardinales écran (S, O, N, E) **et** sur
les 4 axes de tuile (SO, NO, NE, SE) — exactement le jeu de directions de D2. Les 16 directions
ne sont pas uniformes à l'écran (tassement 2:1) : c'est voulu et identique à D2. Choix de la
direction : vecteur de déplacement/visée **en monde** → `round(atan2 / 22,5°) mod 16`.
On n'utilise **pas** l'ordre DCC de D2 (0 = SO, 1 = NO…), on garde l'ordre horaire ci-dessus.

---

## 2. Animations et budget

### 2.1 Cadence

Simulation à 25 Hz (`TICK_HZ = 25`, comme D2). Base de lecture : **1 image par tick (25 i/s)**
pour marche/course/attaque/sort/mort ; **12,5 i/s** pour l'attente (vitesse D2 128). La durée
réelle d'une attaque/d'un sort vient de la simulation (`breakpoints.ts`, IAS/FCR) : l'animation
est **rééchantillonnée** sur cette durée, et chaque animation déclare son **image d'action**
(`actionFrame`) où le coup/sort part.

### 2.2 Sorcière (16 directions, une seule configuration visuelle : bâton)

| Mode | Images / dir | Directions | Total | D2 | Image d'action |
|---|---|---|---|---|---|
| Attente (NU) | **8** (boucle, 12,5 i/s) | 16 | 128 | 8 | – |
| Marche (WL) | **8** (boucle) | 16 | 128 | 8 | – |
| Course (RN) | **8** (boucle) | 16 | 128 | 8 | – |
| Attaque bâton (A1) | **12** | 16 | 192 | 18 | 7 |
| Incantation (SC) | **12** | 16 | 192 | 14 | 7 |
| Dégâts reçus (GH) | **6** | 16 | 96 | 8 | – |
| Mort (DT) | **16** (tient sur la dernière) | **8** (16 → 8 le plus proche) | 128 | 24 | – |
| **Total** | | | **992 images** | | |

Non produits en v1 : attente en ville (réutilise NU), blocage (réutilise GH), coup de pied,
poupée de papier (armures visibles) — le personnage est **un seul maillage composite**, seule
l'arme peut être teintée (cf. §8). Cellule : **96 × 112 px**, ancre pied **(48, 96)** ; emprise
utile moyenne après rognage ≈ 50 × 78 px → ≈ 3,9 Mpx → **2 atlas 2048 × 2048** (≈ 32 Mo VRAM
RGBA, en pratique 1,2 atlas). Ombres (§3.4) : ≈ 1 Mpx supplémentaire.

### 2.3 Monstres (8 directions)

| Mode | Petit (Déchu, rat) | Moyen (zombie, squelette) | Grand (bovin, seigneur) | Lanceur (+) | Boss |
|---|---|---|---|---|---|
| Attente | 8 | 8 | 8 | 8 | 12 |
| Marche | 8 | 8 | 8 | 8 | 12 |
| Attaque 1 | 10 | 12 | 12 | 10 | 16 |
| Attaque 2 / spécial | – | – | – | – | 12 |
| Sort (SC) | – | – | – | **10** | 14 |
| Dégâts reçus | 4 | 4 | 5 | 4 | 6 |
| Mort | 12 | 12 | 14 | 12 | **24** (+ effets) |
| **Images / dir** | 42 | 44 | 47 | +10 | 96 |
| **Total (× 8)** | 336 | 352 | 376 | +80 | 768 |
| Cellule (px) | 64 × 64 | 96 × 104 | 160 × 176 | – | 256 × 256 |
| VRAM indicative | ≈ 2 Mo | ≈ 5 Mo | ≈ 16 Mo | – | ≈ 50-70 Mo (chargé à la demande) |

Budget par zone : **≤ 8 familles de monstres + 1 boss**, **≤ 160 Mo** d'atlas de sprites en
VRAM (textures RGBA). Décor animé (torches, braseros, portails, eau) : 1 direction, **8-16
images en boucle**. Décor statique : 1 image + 1 ombre.

---

## 3. Lumière des rendus (cuite dans les sprites) et ombres

Principe D2 : le **modelé** (lumière directionnelle, volume) est **cuit** dans le sprite ; la
**lumière de scène** (rayon du joueur, torches) est appliquée **au runtime** en multipliant
(les tables de lumière de `pal.pl2`). On fait pareil : les sprites sont rendus « au centre du
rayon de lumière », ni sombres ni teintés par la zone.

### 3.1 Rig de rendu (Three.js ≥ r155, `NoToneMapping`, sortie sRGB)

| Lumière | Direction (azimut monde / élévation) | Couleur | Intensité | Rôle |
|---|---|---|---|---|
| **Principale** (Directional) | depuis **+X** (bas-droite écran, 45° à droite de la caméra) / **60°** | `#FFE8C8` (≈ 4 500 K) | **3,0** | modelé, face caméra éclairée côté droit |
| Remplissage (Directional) | depuis **+Z** (bas-gauche écran) / 20° | `#8FA3C8` | 0,6 | déboucher les ombres propres côté gauche, froid |
| **Contre-jour / rim** (Directional) | depuis **−X −Z** (arrière, haut écran) / 35° | `#C9D6FF` | 1,6 | liseré qui détache la silhouette d'un sol sombre |
| Ambiante (Hemisphere) | ciel / sol | `#3A4050` / `#1A140F` | 0,5 | plancher, jamais de noir pur dans le modelé |
| Occlusion ambiante | GTAO (post) | – | 0,7, rayon 0,35 u | coller les volumes, salir le low-poly |

Étalonnage du rig : une sphère d'albédo 0,8 face à la lumière principale doit sortir à
**sRGB 220-235** avant étalonnage (§4) ; sa face opposée à **40-60**.

### 3.2 Ombres portées (sprite séparé)

Mesures sur `d2-niveau-vaches-01.jpg` et `d2-sorciere-mur-de-feu-01.png` : ombres **dures**,
projetées vers le **haut-gauche écran le long de l'axe de tuile** (pente 2:1), longueur
≈ **0,5-0,6 × la hauteur** du personnage, assombrissement du sol ≈ **×0,45**.

| Paramètre | Valeur |
|---|---|
| Direction | monde **−X** (haut-gauche écran, pente 2:1) = opposée à la lumière principale |
| Longueur | h / tan 60° = **0,58 h** (Sorcière 72 px → ombre ≈ 2,1 u ≈ 38 px de long) |
| Forme | vraie projection du maillage (pas un ovale) : sprite **aplati + cisaillé** comme D2 |
| Bords | durs (PCF off au rendu ×4 → ≈ 0,25 px de flou après réduction) |
| Opacité | **50 %** noir `#000000`, calque unique (pas de double assombrissement aux chevauchements) |
| Production | 2ᵉ passe par image : maillage invisible `castShadow`, plan sol `ShadowMaterial` (opacité 1), même caméra, même direction ; sortie = alpha seul (`*_shadow`) |
| Runtime | tous les `*_shadow` dessinés opaques dans une `RenderTexture` « ombres », composée **une fois** à 50 % en multiplication, sous les personnages, au-dessus du sol |
| Décor | ombres de murs/arbres/maisons **pré-calculées** en sprites d'ombre (équivalent calque 13 des DS1) |
| Hors rayon de lumière | l'ombre suit la lumière de scène (multipliée comme le sol) : invisible dans le noir |
| Torches, sorts | **aucune ombre dynamique** (comme D2) |

### 3.3 Émissifs

Feu, magie, éclairs, yeux, cristaux : rendus dans une **passe émissive séparée** (sprite
`*_emit`, mélange **additif**), jamais multipliés par l'obscurité ni désaturés à l'étalonnage.

---

## 4. Palette et étalonnage

### 4.1 Palette maîtresse « Gothique » — 128 entrées

Construite en OKLCH : ombres qui virent au froid/violet, lumières qui virent au chaud, chroma
maximal au milieu de rampe. **Inspirée** de la gamme D2 (terres sourdes, verts olive, rouges
sang) **sans reprise de ses valeurs**. 15 rampes × 8 = 120 couleurs, index 0 = transparent,
7 index d'**accent de zone** (équivalent de nos « couleurs 224-254 par acte »).

```
# rampe      1 (sombre) ............................................. 8 (clair)
pierre   #07090D #1C2327 #333D3F #4D5957 #6B756E #8B9186 #AEADA1 #D1C9BF
terre    #140804 #2C1B12 #443023 #5D4635 #755D49 #8D755D #A48E74 #BCA78C
bois     #120301 #2B1208 #432415 #5A3823 #714D33 #886345 #9D7A5A #B19270
mousse   #060B01 #182009 #2B3516 #404A24 #576035 #6E7647 #868C5A #9FA370
sang     #1C0001 #390004 #57000C #730D15 #8E2221 #A7382F #BF4F40 #D36854
os       #342C24 #50453A #6B5F4F #867966 #A0937E #BBAF97 #D6CBB2 #F0E8CE
peau     #351D16 #523327 #6E4938 #8A604B #A4795F #BE9376 #D7AD8E #EEC9A9
feu      #6C0C00 #8E2E00 #AA4E00 #C36E0C #D79030 #E8B356 #F7D581 #FFF7B0
glace    #07234A #194169 #2D5F86 #467EA0 #639DB8 #85BBCF #ABD9E5 #D5F6FB
foudre   #301172 #423894 #545AB1 #687BCB #809CE1 #9DBDF3 #C0DCFF #EAFBFF
poison   #032707 #194413 #33601F #507B2E #70973F #91B254 #B3CE6E #D7E98B
or       #3E2005 #5E3910 #7C521E #976D2F #B18A45 #C9A85F #E0C67D #F6E59F
magie    #1C0033 #391353 #562C71 #73458C #9060A6 #AD7CBF #C99AD5 #E4BAEA
neige    #434E5B #5B6772 #737E89 #8B959F #A4ADB6 #BDC5CC #D7DDE2 #F2F6F9
neutres  #000000 #0E0E0E #232323 #3D3D3D #5E5E5E #858585 #B4B4B4 #EDEDED
```

Accents de zone (index 121-127, remplacés par zone ; valeurs mesurées puis réinterprétées) :

| Zone | 7 accents |
|---|---|
| Tristram | `#FF7A2A` braise, `#3B2A1E` bois calciné, `#5A6450` herbe cendrée, `#2A2F26`, `#8E8A7A` fumée, `#C24A1A`, `#FFD08A` |
| Tombeaux de Tal Rasha | `#1F4A3C` turquoise sombre, `#2F6F5C` turquoise, `#57A08A`, `#8A7448` sable, `#B39A62` sable clair, `#3A2E1C`, `#E0C27A` hiéroglyphe doré |
| Niveau des Vaches | `#1C2A12` herbe, `#2E4020`, `#E8E4D8` robe blanche, `#141210` robe noire, `#C04030` portail rouge, `#FF6A40`, `#8A5A3A` |
| Trône / Pierre-Monde | `#B6192C` cristal, `#E0303A`, `#FF7A6A`, `#571D12` sol, `#2A0A08`, `#8A6A4A` os de Baal, `#FFD9A0` |
| Harrogath | `#3E4656` nuit, `#C8CED6` neige éclairée, `#FFB060` torche, `#6A4A2A` bois d'œuvre, `#2A3040`, `#9AA6B8`, `#FFE2B0` |
| Cartes (défaut) | 7 couleurs de la teinte signature de la carte (§7.6) |

### 4.2 Étalonnage (unifier KayKit/Quaternius, très saturés et propres)

Ordre imposé, identique pour tous les assets (personnages, monstres, décor, tuiles) :

1. **Matériaux (avant rendu)** : albédo en OKLCH → chroma **× 0,55**, luminance compressée
   `L' = 0,12 + 0,70·L` (pas de blanc ni de noir purs dans les textures), rugosité 0,85,
   métal 0 (armes/armures 0,6, rugosité 0,45). Multiplication par une texture de **crasse**
   triplanaire (bruit + taches, amplitude 0,75-1,0, échelle 0,5 u) pour casser l'aplat low-poly.
2. **Rendu** avec le rig §3.1 + GTAO, en ×4.
3. **Étalonnage (sRGB, sur l'image ×4)** :
   - exposition **−0,3 EV** ;
   - courbe en S : (0 ; 0) (0,25 ; 0,17) (0,50 ; 0,47) (0,75 ; 0,80) (1 ; 0,96) — ombres
     écrasées, blancs plafonnés à 245 ;
   - saturation globale **× 0,75** (hors passe émissive) ;
   - virage partiel : ombres (L < 0,35) vers `#2A2238` à **12 %**, hautes lumières (L > 0,70)
     vers `#F2D9A8` à **8 %**.
4. **Réduction** ×4 → ×1 (§5).
5. **Accentuation** : masque flou 35 %, rayon 0,6 px, seuil 2.
6. **Quantification** vers les 127 couleurs (maîtresse + accents de la zone), plus proche voisin
   en **OKLab** :
   - personnages, monstres, projectiles animés : **sans tramage** (le tramage scintille en
     animation) ;
   - tuiles et décor statique : **Bayer 4 × 4, amplitude 25 %** d'un pas de rampe ;
   - émissifs et ombres : **non quantifiés** (alpha 8 bits, additif/multiplicatif).

Test fait sur les captures D2 (`quant` sans tramage) : la palette restitue Sanctuaire du Chaos,
temple de Nihlathak et Niveau des Vaches sans perte d'ambiance ; les rouges noirs très sombres
glissent vers `terre 1-2`, acceptable.

### 4.3 Cibles de luminance (mesurées sur les références)

| Scène (plein écran, hors HUD) | Luminance médiane (0-255) | 95ᵉ centile | Pixels < 32 |
|---|---|---|---|
| Extérieur de nuit (Campement, Vaches) | **29-34** | 55-75 | 55-60 % |
| Extérieur enneigé (Acte V) | 45 | 200 | 40 % |
| Intérieur/donjon (Vaught, Chaos) | **8-16** | 77-112 | 70-88 % |
| Rendu plein éclairage (Tal Rasha, éditeur) | 20 (fond noir inclus) | 126 | – |

Une capture de notre jeu doit tomber dans ces fourchettes (script d'analyse = même méthode :
luminance Rec.709, médiane, centile 95, part < 32).

---

## 5. Suréchantillonnage et réduction

| Paramètre | Valeur |
|---|---|
| Rendu | **×4** de la cellule (Sorcière 96 × 112 → 384 × 448), MSAA off |
| Réduction | ×4 → ×1, filtre **boîte (moyenne de surface) en lumière linéaire**, alpha prémultiplié |
| Pourquoi pas Lanczos | halos/ringing sur les bords alpha et les silhouettes sombres sur fond sombre |
| Alpha final (sprites opaques) | **binaire, seuil 50 %** (comme D2 : index 0 transparent), pas de frange |
| Alpha (émissifs, ombres, fumée) | 8 bits |
| Stockage | PNG-8 indexé (palette §4.1, index 0 transparent) pour sprites/tuiles ; PNG-32 pour émissifs et ombres (ombres : canal alpha seul, R8 possible) |
| Filtrage runtime | `nearest` sur les atlas |
| Affichage | le monde est rendu dans une `RenderTexture` à la **résolution logique** (px CSS × zoom), puis **agrandi à l'écran par un shader « sharp-bilinear »** (plus proche entier puis bilinéaire, comme D2GL/D2DX sous PD2). Le texte et le HUD sont rendus à la **résolution native** (texte « HD »). |
| Évolution | atlas ×2 « HD » pour tablettes (même pipeline, réduction ×4 → ×2), plus tard |

---

## 6. Lumière de scène (runtime)

### 6.1 Rayon de lumière du joueur

| Paramètre | Valeur |
|---|---|
| Rayon de base R | **13 unités** (valeur D2), bornes **4-18** (objets ±) ; en dessous de 4 : pas de noir total en v1 |
| Forme | cercle en monde → **ellipse 2:1 à l'écran** : 294 × 147 px de demi-axes à R = 13 |
| Vérification | profil radial mesuré sur `d2-salles-vaught-01.jpg` : luminance 43 → 33 → 27 → 17 → 12 à 80/160/240/280/320 px du joueur = extinction vers 290-320 px, soit **13 × 22,6 = 294 px** |
| Dégradé | `I(r) = 1` jusqu'à **0,30 R**, puis `1 − smoothstep(0,30 R ; R ; r)` ; lumière finale = `ambiante + (1 − ambiante) · I` |
| Couleur | `#FFF1DC` (très légèrement chaude) |
| Quantification | 32 paliers (comme les tables de lumière de pal.pl2) pour éviter les bandes lisses « trop modernes » |
| Implémentation | `RenderTexture` lightmap à **½ résolution**, effacée à la couleur ambiante de zone, lumières dessinées en dégradés **additifs** (plafond 1,0), puis multipliée sur le calque monde ; émissifs et étiquettes au-dessus |

### 6.2 Autres sources

| Source | Rayon (u) | Couleur | Particularité |
|---|---|---|---|
| Torche murale / sur pied | 6 | `#FFB060` | scintillement ±8 % à 6-10 Hz, bruit lissé |
| Brasero, feu de camp | 8 | `#FF9A40` | ±10 % |
| Éclair de feu / boule de feu | 4 / 6 | `#FF9A3C` | suit le projectile |
| Mur de feu / Inferno | 3 par segment | `#FF8A30` | |
| Orbe gelé, nova de glace | 5 | `#8FD0FF` | |
| Éclair, chaîne d'éclairs | 8 | `#C8D8FF` | flash 80 ms puis décroissance 150 ms |
| Portail de ville / portail rouge | 6 | `#6FA0FF` / `#FF4030` | pulsation 1,5 s |
| Objet unique/set au sol | 2,5 | couleur de rareté | seulement si filtré « intéressant » + faisceau |
| Cristaux de la Pierre-Monde | 7 | `#E0303A` | fixes |

### 6.3 Ambiante hors rayon, par zone (multiplicateur RVB)

| Zone | Ambiante | Luminance | Commentaire |
|---|---|---|---|
| Tristram | `#4A4F58` | ≈ 0,30 | crépuscule froid, maisons en feu = torches `#FF7A2A` R 7 |
| Tombeaux de Tal Rasha | `#2A2014` | ≈ 0,12 | intérieur ocre, torches murales tous les 3 tuiles |
| Niveau des Vaches | `#9A9A88` | ≈ 0,60 | plein air uniforme : le profil radial mesuré est **plat** (29 ± 3) |
| Trône de Baal | `#1E0C0A` | ≈ 0,07 | braseros rouge-orangé |
| Chambre de la Pierre-Monde | `#3A0A0C` | ≈ 0,12 | + lumière des cristaux |
| Harrogath | `#3E4656` | ≈ 0,28 | nuit neigeuse, torches chaudes, neige qui tombe (additif) |
| Cartes palier 1 / 2 / 3 / donjons | voir §7.6 | 0,25 / 0,18 / 0,12 / 0,08 | |

---

## 7. Échelle et ambiances

### 7.1 Hauteurs cibles (px à l'échelle 1, pied → sommet ; unités = px / 19,6)

| Élément | Hauteur px | Unités | Mesure/écart D2 |
|---|---|---|---|
| **Sorcière** | **72** (bâton levé 86) | 3,67 | D2 : 75 (postmortem) ; mesuré ≈ 70-72 sur `d2-niveau-vaches-01.jpg` |
| Petits monstres (Déchu, rat, lutin) | 36-44 | 1,8-2,2 | moitié du joueur |
| Moyens (zombie, squelette, goule) | 70-80 | 3,6-4,1 | ≈ joueur |
| Grands (bovin infernal, seigneur de sang) | 115-135 | 5,9-6,9 | Bovins mesurés 120-140 |
| Boss (Andariel, Duriel, Méphisto, Baal) | 140-180 | 7,1-9,2 | |
| Boss final (Diablo) | 190-210 | 9,7-10,7 | |
| Maison (Tristram, Harrogath) | 200-280, emprise 2 × 2 tuiles | 10-14 | |
| Arbre | 160-260 | 8-13 | |
| Mur de donjon | 120-150 | 6-7,5 | Vaught ≈ 120-140, piliers Tal Rasha ≈ 150-180 |
| Palissade, muret, clôture | 40-70 | 2-3,5 | |
| Objet au sol (sprite) | 12-28 | – | |

Normalisation des modèles : `échelle = (hauteur_px_cible / 19,596) / hauteur_boîte_englobante`.
Le rapport Sorcière/écran reste à 72/390 = 18 % de la hauteur (D2 : 12,5 % en 800 × 600) :
plus gros, voulu pour un téléphone ; le zoom réglage 2 crans (`docs/internal/ETUDE-MOBILE.md`) propose ×0,85.

### 7.2 Étiquettes

Conformes à `docs/internal/ETUDE-MOBILE.md` : texte **13 px gras** (min 12), fond noir **70 %**, padding 4 × 8,
empilement 2 px. D2 800 × 600 : interligne mesuré ≈ 15 px (Chaos Sanctuary reference screenshot, outside the repository).
Nom de monstre élite : 13 px au-dessus de la tête ; barre de boss en haut au centre, cadre
rouge sombre `#57000C` avec nom en `os 8`.

### 7.3 Tristram
Ruines calcinées au crépuscule : `mousse 2-4` cendrée, `bois 1-3` calciné, `pierre 3-5`,
braises et foyers `feu`. Brume basse grise 10 % en bord d'écran. Cadavres, gibets. Saturation
post **× 0,6**. Réf. : `d2-tristram-plan-01.jpg` (haut).

### 7.4 Tombeaux de Tal Rasha
Grès ocre (`terre 5-7`, accents sable), piliers peints **turquoise** usés (`#1F4A3C`-`#57A08A`),
sol de dalles et sable. Torches murales chaudes, ambiante 0,12. Le « vrai » tombeau porte le
symbole doré. Réf. : `d2-tombeau-tal-rasha-plan-01.png` (plein éclairage : ne pas copier la
luminosité, seulement les teintes et volumes).

### 7.5 Niveau des Vaches / Trône / Pierre-Monde / Harrogath
- **Vaches** : prairie sombre uniforme (`#192413` mesuré → `mousse 2`), aucun décor, lumière
  plate 0,60, bovins noir et blanc très lisibles, portail rouge. Humour par l'échelle et le nombre.
- **Trône de Baal** : pierre noire (`pierre 1-3`), braseros, ambiante 0,07, vagues de monstres
  sur fond presque noir — le rim light (§3.1) est **indispensable** ici.
- **Chambre de la Pierre-Monde** : sol rouge brique (`#571D12`), cristaux rouges émissifs géants
  en fond, dominante rouge ; Baal en os/or pour trancher. Réf. : `d2-chambre-pierre-monde-baal-01.jpg`.
- **Harrogath** : forteresse de pierre sous la neige de nuit ; `neige`, `pierre`, bois d'œuvre ;
  torches et braseros chauds contre ambiante bleue. Réf. : `d2-temple-nihlathak-neige-01.jpg`,
  `d2-lod-ecran-titre-harrogath-01.png`.

### 7.6 Cartes endgame (paliers à la PD2 : P1 niv. 87, P2 88, P3 89, donjons 90)

| Palier | Ambiante | Saturation post | Brume | Signature |
|---|---|---|---|---|
| P1 | 0,25 | × 0,70 | aucune | teinte du thème de la carte (jungle, tombe, ville en ruine…) |
| P2 | 0,18 | × 0,60 | 15 % couleur ambiante | + particules (cendres, spores) |
| P3 | 0,12 | × 0,55 | 20 % | + voile de corruption `magie`/`sang` à 10 % sur l'ambiante |
| Donjons | 0,08 | × 0,50 | 25 % | rayon joueur plafonné à 11 u, lumières de zone rares |
| Cartes uniques | libre | libre | libre | une couleur d'accent saturée par carte (accents §4.1) |

---

## 8. Variantes teintées

| Variante | Méthode | Nom |
|---|---|---|
| **Champion** | `sprite.tint = 0x9CB6FF` (multiplication, **reste batché**) + passe émissive teintée `#8FD0FF` à 40 % | nom en bleu magique |
| **Unique** | filtre « gradient map » : luminance du sprite → une rampe de la palette (`or`, `sang`, `poison`, `magie`, `foudre`, `feu`, `glace`), **choisie par graine = id du monstre**, mélange **60 %** ; ≤ 4 uniques à l'écran (un filtre casse le batch) | nom en or unique |
| **Serviteur d'unique** | même rampe que son chef, mélange 30 % | blanc |
| Fantomatique (champion « ghostly ») | alpha 55 % + tint `0xB8C8FF` | bleu |
| Arme magique/unique de la Sorcière | gradient map sur le calque arme seulement (émissif) | – |

Évolution prévue (fidèle à D2 et économe en VRAM) : atlas **indexés R8 + LUT de palette** dans
le shader ; les variantes deviennent des **lignes de LUT** (comme les 111 variations de teinte
de pal.pl2), sans filtre ni atlas supplémentaire.

---

## 9. Transparence des murs, toits, décor haut

| Règle | Valeur |
|---|---|
| Candidats | murs, piliers, arbres, toits, grands décors **devant** le joueur (profondeur de tri > joueur) |
| Déclencheur | le rectangle du sprite recouvre la boîte du joueur **élargie de 24 px** (et celle de la cible/du monstre élite visé) |
| Opacité | **35 %** (fondu 120 ms entrée, 200 ms sortie) |
| Toits | **0 %** (masqués) quand le joueur est dans l'emprise de la maison |
| Hors règle | murs derrière le joueur : jamais transparents ; pas de silhouette « rayons X » (absente de D2) |

---

## 10. Interface

### 10.1 Polices (Google Fonts, licence OFL)

| Usage | Police | Taille |
|---|---|---|
| Titres, noms de boss, écran titre | **Cinzel Decorative** 700 | 20-32 px |
| Boutons, panneaux, étiquettes au sol, noms de monstres | **Cinzel** 700 (capitales et petites capitales, le plus proche d'Exocet en libre) | 13-16 px |
| Lignes d'affixes, descriptions longues | **Alegreya Sans SC** 500 | 13 px (min 12) |
| Chiffres de dégâts flottants | Cinzel 700, contour 2 px `#000` | 14-18 px |
| Alternative titres plus « Exocet » | **Metamorphous** 400 | 20-28 px |

### 10.2 Couleurs de rareté (texte ; palette texte séparée comme D2)

| Rareté | Hex | Réf. D2 (RVB) |
|---|---|---|
| Normal | `#EDEDED` | 255,255,255 |
| Gris — socketé / éthéré / inférieur | `#8C8C8C` (éclairci pour mobile) | 105,105,105 |
| Magique | `#7878FF` | 105,105,255 |
| Rare | `#F5F064` | 255,255,100 |
| Set | `#3CE63C` | 0,255,0 |
| Unique | `#CDB67A` | 199,179,119 |
| Artisanat / runes | `#FFA800` | 255,168,0 |
| Corrompu (PD2) | `#FF4D4D` | rouge PD2 (≈ 255,77,77) |

### 10.3 Cadres et HUD
Pierre sombre et fer : fond de panneau `#0E0E0E` à 85 %, bord `bois 3` + filet `or 5`
(`#B18A45`) 1 px, coins ornés. Orbe de vie `sang 4-6` sur fond `sang 1`, orbe de mana
`glace 2-4` / `foudre 3`. Aucun dégradé « verre » moderne ; ombre portée 2 px noire 60 %.

---

## 11. Ordre de dessin Pixi (couches)

1. Sol (tuiles quantifiées, tramage Bayer)
2. Calque d'ombres (toutes les `*_shadow` + ombres de décor), composé à 50 % multiply
3. Objets au sol, cadavres
4. Acteurs + murs + décor haut, **triés en profondeur** (x + z monde du pied) ; murs occultants à 35 %
5. Multiplication par la lightmap (§6)
6. Émissifs additifs (sorts, feu, cristaux), faisceaux de butin
7. Upscale sharp-bilinear vers l'écran
8. Texte/HUD en résolution native : étiquettes, noms, barres, dégâts

---

## 12. Checklist de vérification visuelle

Captures à faire à 844 × 390 CSS (et 800 × 600 pour la comparaison directe avec D2) :

- [ ] **Grille** : une tuile vide mesure exactement 160 × 80 px, arêtes à pente 2:1 sans marche d'escalier irrégulière.
- [ ] **Cube de 1 u** rendu dans le pipeline : losange supérieur 32 × 16, arête verticale 19-20 px.
- [ ] **Sorcière** debout, direction 0 : 72 ± 2 px du pied au sommet du crâne ; à côté de `d2-niveau-vaches-01.jpg` à la même échelle, silhouettes de même taille.
- [ ] **16 directions** : planche 4 × 4 de l'attente, aucune direction « sautée », pieds sur l'ancre (écart ≤ 1 px entre directions).
- [ ] **Marche** : pas de glissement des pieds (vitesse d'animation calée sur la vitesse sim), boucle sans à-coup.
- [ ] **Ombre** vers le haut-gauche, pente 2:1, longueur ≈ 0,58 h, noir 50 %, pas de double assombrissement entre deux monstres collés.
- [ ] **Modelé** : face droite (côté +X) plus claire, liseré de contre-jour visible sur le sol le plus sombre de la zone.
- [ ] **Palette** : `quant_check` — 100 % des pixels opaques d'un atlas appartiennent aux 127 couleurs ; pas de tramage sur les sprites animés.
- [ ] **Unification** : un monstre KayKit et un monstre Quaternius côte à côte : même niveau de saturation (écart de chroma moyen OKLCH < 0,02), même contraste.
- [ ] **Luminance** : médiane et part < 32 dans les fourchettes §4.3 pour Tristram, Tal Rasha, Vaches, Pierre-Monde, Harrogath.
- [ ] **Rayon de lumière** : profil radial (même script que §6.1) — extinction à 290-320 px horizontalement pour R = 13 ; ellipse 2:1.
- [ ] **Torches** : scintillement perceptible mais sans pompage (< ±10 %).
- [ ] **Murs** : se déplacer derrière un mur de Tal Rasha : passage à 35 % en ≤ 120 ms, retour sans clignotement ; les murs derrière restent opaques.
- [ ] **Champion** bleu et **unique** gradient-map lisibles à côté d'un monstre normal, à ambiante 0,12.
- [ ] **Étiquettes** : 8 raretés affichées côte à côte sur sol clair (neige) et sol noir (Trône), lisibles sur téléphone à bout de bras.
- [ ] **Upscale** : pixels réguliers à DPR 2, 2,625 et 3 (pas de lignes plus épaisses que d'autres), texte net.
- [ ] **Comparaison directe** : montage « notre capture | capture D2 » pour chaque zone de `references/`, jugé sur angle, taille, noirceur, direction des ombres.

---

## 13. Fiches de fidélité à Diablo II (règle : `ASSETS.md` § 0)

Références : images du wiki Diablo consultées localement (jamais commitées), comparées côte à côte
à nos rendus. Verdicts : ✓ fidèle, ~ approchant (silhouette
limitée par le modèle libre), ✗ à refaire. Audit du 29/09/2026.

| Asset | D2 (référence) | Notre asset (procédural, page/procedural*.js) | Verdict |
|---|---|---|---|
| Sorcière, Druide | images fournies | modèles CC0 recolorés, silhouette fine | ✓ |
| Éclaireuse (I) | armure de cuir rouge cramoisi, crête rouge, bleu au plastron, arc | cuir rouge, crête, carquois, **arc** | ~ |
| Guerrier du désert (II) | casque à cimier rouge, armure gris-vert, lance | heaume acier à cimier rouge, mailles vert-gris, lance | ~ |
| Loup de fer (III) | chevalier en plaques, tabard rouge, épée et bouclier | plaques d'acier, tabard rouge, épée, écu | ✓ |
| Ascendant (IV, PD2) | aucune image D2 | création : robe blanche et or, couronne de lumière, bâton | à valider |
| Barbare (V) | crâne rasé, armure vert sombre, épaulières à pointes dorées | crâne rasé, armure verte, épaulières à pointes dorées, épée | ~ |
| Qual-Kehk, Larzuk, Malah, Anya | Larzuk torse nu à tablier ; Malah robe blanche à ceinture rouge ; Anya tenue orange | idem, proportions humaines | ~ |
| Déchu, Chaman | petits diables rouge vif, crête de pointes ; Chaman : bâton à bannière | rouge vif, crête, cornes, épée ; robe et bâton à bannière | ~ |
| Squelettes | os jaunâtres, côtes, hache et bouclier rond ; archer en haillons rouges | os, côtes, orbites, hache + bouclier ; archer à arc et haillons rouges ; mage à bâton | ✓ |
| Chevalier de l'oubli | grand squelette en armure sombre dorée, sphère bleue | armure sombre à liserés dorés, casque à cornes, sphère bleue | ~ |
| Zombie, Momies | Zombie voûté vert-brun ; momie bandée vert-olive sombre | voûtés, bras tendus ; bandelettes olive | ~ |
| Griswold | chauve rosé en tunique orange | chauve rosé, tunique orange, grande hache | ~ |
| Seigneur venimeux | démon ailé vert, armure, faux | vert, plastrons, cornes, ailes membraneuses, faux | ~ |
| Tueur d'âmes | sombre encapuchonné, pagne bleu, lance | capuche noire, pagne bleu, lance | ~ |
| Sbire de la destruction | brute cornue en armure grise (aucune image) | brute grise à cornes, hache | à valider |
| Scarabée | carapace gris métal, orbe vert | dôme gris, orbe vert, pinces | ~ |
| Bovins, Roi des Vaches | pelage gris pâle, glaive ; Roi bleu-blanc, couronne | tête de taureau à cornes, glaive ; Roi bleu-blanc couronné, hache | ~ |
| Diablo, Baal, Duriel, Seigneur de sang | voir lot 11 | procéduraux | ~ |
| Loup-garou, ours-garou | loup-garou gris à museau long ; ours-garou brun massif musclé | procéduraux, bipèdes à tête de bête, griffes | ~ (têtes et musculature à affiner) |
| Loup, corbeau | loup gris ; corbeau noir | procéduraux : loup quadrupède, corbeau aux ailes déployées | ~ |
| Hydre (Sorcière) | trois têtes de serpent de feu sur un foyer | procédurale : trois cous segmentés à tête de serpent, épines de feu | ✓ |
| Barbare (joueur) | crâne rasé, torse musclé aux sangles de cuir, pagne, épaulières cloutées ; épée / hache | procédural : crâne rasé à cicatrice, sangles croisées, pagne bordeaux, épaulières cloutées, hache | ✓ (fit 81) |
| Paladin (joueur) | plates argentées, casque à panache, tabard à croix, écu, épée | procédural : heaume à visière et panache rouge, plastron bombé, tassettes, tabard blanc à croix dorée, écu, épée longue | ~ (fit 46, mesure défavorable à la silhouette étroite ; à comparer à l'œil) |
| Amazone (joueur) | bandeau, cheveux bruns, cuir et métal, grand bouclier rond, arc | procédural : bandeau rouge, queue de cheval, brassière de cuir, jambières argentées, bouclier rond dans le dos, arc | ~ (fit 61) |
| Assassin (joueur) | tenue de cuir noir échancrée, hautes bottes, épaulière argentée, katars | procédural : cuir noir, bottes hautes à genouillères argentées, épaulière gauche, katars longs | ~ (fit 38 sur la planche complète ; refaire le visage et la coiffe) |
| Nécromancien (joueur) | cheveux blancs, gilet noir, ceinture et épaulières brunes, lame d'os | procédural : cheveux blancs, gilet noir sur torse nu, épaulières brunes, lame d'os lumineuse | ~ (fit 75) |
| Golems (argile, sang, fer, feu), Valkyrie, mur d'os | golem trapu de couleur unie ; Valkyrie casquée à lance et bouclier ailé | procéduraux : blocs massifs teintés, Valkyrie en plates et lance, mur d'os | à valider sur image |

Méthode « procédurale » (`tools/prerender/page/procedural.js`) : quand un modèle libre est trop arrondi, la
créature est construite en géométrie facettée (ombrage plat, cornes courbes, pointes, plaques) avec de
vrais clips d'animation ; c'est la voie pour les autres monstres à refaire.

Limite connue : les modèles à atlas (Demon, Yeti…) gardent une palette brune que la recoloration
ne redresse qu'en partie ; les ✗ demandent un modèle mieux adapté ou une peinture d'atlas dédiée
(comme `paint-sorceress.py`). Envoyer une image du monstre voulu accélère la correction.

## Sources

- Postmortem Diablo II (E. Schaefer, Game Developer, oct. 2000) : https://www.gamedeveloper.com/design/postmortem-blizzard-s-i-diablo-ii-i-
- AnimData.d2 (explication de la vitesse d'animation) : https://www.mannm.org/d2library/faqtoids/animspeed.html
- Format DT1 : https://d2mods.info/forum/kb/viewarticle?a=40 ; http://paul.siramy.free.fr/_divers/dt1_doc/
- Palettes et PL2 : https://github.com/OpenDiablo2/pl2 ; https://d2mods.info/forum/viewtopic.php?t=4653
- Rayon de lumière : https://d2mods.info/forum/viewtopic.php?t=57887 ; https://diablo.fandom.com/wiki/Light_Radius
- Ombres et sprites : https://gamedev.net/forums/topic/487300-question-about-diablo-2s-sprites/
- Mode perspective : https://simonschreibt.de/gat/dont-starve-diablo-parallax-7/
- Murs transparents : https://us.forums.blizzard.com/en/d2r/t/wall-doesnt-become-transparent-when-my-character-is-behind-it/50603
- Couleurs de texte : https://d2mods.info/forum/viewtopic.php?t=16396
- D2GL (PD2, upscale, texte HD) : https://github.com/bayaraa/d2gl
- Cartes PD2 : https://wiki.projectdiablo2.com/wiki/Maps
- Captures : voir `references/SOURCES.md`
