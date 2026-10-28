# Étude — « Diablo au doigt » : contrôles tactiles d'un ARPG mobile

Projet : ARPG expérimental non commercial (projet de fans) inspiré de Diablo 2 / Project Diablo 2, rendu 2D isométrique
(sprites pré-rendus, Pixi.js v8), joué **en paysage au tactile** dans un navigateur mobile /
application web installable. Le clavier/souris PC est un mode secondaire.

Objectif du document : dire comment Diablo Immortal (et, en complément, Diablo 3 console,
Torchlight: Infinite, Path of Exile Mobile, Undecember, Wild Rift pour les conventions de visée)
a résolu le problème, puis **trancher** une spécification directement implémentable.

> Convention de mesure. Toutes les tailles sont en **px CSS** (ce que voit le navigateur).
> Sur téléphone, 1 px CSS ≈ **0,16 mm** (iPhone @3x ≈ 153 px CSS/pouce ; Android ≈ 160 dp/pouce),
> soit **≈ 6,3 px CSS par mm**. Référence d'écran : **844 × 390** (iPhone 12-15 en paysage),
> minimum supporté **667 × 360** (iPhone SE / petits Android), maximum confortable tablette 1366 × 1024.
> Les chiffres de Diablo Immortal ne sont pas publiés par Blizzard : les dimensions données
> ici sont des **choix de conception** calés sur les observations publiques du jeu, les guides
> Apple (cible minimale 44 pt) / Material (48 dp) et la largeur de contact du pouce (≈ 10-14 mm).
> Ce qui est *observé* dans les jeux est signalé comme tel ; le reste est *décidé*.

---

## 1. Ce que font les références (constats)

### 1.1 Diablo Immortal (Blizzard/NetEase, 2022) — la référence directe

Constats documentés (wiki Fextralife, guides de réglages, tests presse) :

- **Disposition « MOBA »** : joystick virtuel à gauche, **gros bouton d'attaque principale en bas
  à droite**, compétences plus petites **en éventail autour** de lui. Les journalistes ont
  directement comparé la disposition à celle de *League of Legends: Wild Rift*.
- **Attaque principale** : maintenir = attaque continue. Elle **auto-cible l'ennemi le plus proche
  ou celui vers lequel on se déplace** (joystick = indication de direction pour le ciblage).
- **Compétences** : tap = lancement auto-visé (vers la cible auto, généralement l'ennemi le plus
  proche). **Maintenir + glisser = visée manuelle** : une forme (flèche, cône, couloir, cercle)
  est projetée depuis les pieds du personnage ; on relâche pour lancer.
- **Charge** : certaines compétences se *chargent* tant que le bouton est maintenu. Blizzard
  explique que, puisqu'on passe du temps à viser au tactile, **charger pendant qu'on vise** rend
  ce temps utile (« resurrected an idea of charging-up attacks »).
- **Ultime** : apparaît **à gauche de l'arc** quand elle est chargée (bouton contextuel).
- **Réglage « Primary Attack Aim »** : permet de viser manuellement l'attaque principale avec un
  réticule (recommandé pour les classes à distance).
- **Annulation** : deux modes — « **Slide to Cancel Icon** » (glisser vers une icône d'annulation,
  défaut) et « **Slide Out of Range** » (glisser au-delà de la portée). Les guides PvP
  recommandent le second car **glisser vers l'icône déclenche souvent une autre compétence** au
  lieu d'annuler, alors que « sortir de la portée » se fait vite et depuis n'importe quel angle.
- **Potion** : bouton dédié ; **3 charges**, **20 s de recharge** entre deux prises, soigne 10 %
  immédiatement + 7,5 %/s pendant 8 s ; charges regagnées en tuant des monstres, pleines en ville
  ou au puits ; les élites/coffres donnent une charge.
- **Ramassage** : l'or est **toujours ramassé automatiquement** ; réglage « Auto Pick Up »
  avec cases Normal / Magique / Rare ; bouton « main » pour ramasser/interagir manuellement
  (jugé inutile par beaucoup de joueurs une fois l'auto-ramassage activé).
- **Minicarte** : réglage petite/grande (les guides recommandent grande).
- **HUD** : le panneau de quêtes à gauche se replie ; menus en haut à droite.
- **Aide au déplacement** : auto-navigation vers l'objectif de quête (réduit la fatigue du pouce).

Critiques récurrentes (presse + forums officiels) :
- « Les contrôles tactiles peinent à suivre le combat » dès qu'il faut **viser librement** ou
  enchaîner des combos ; **Moine et Mage** (compétences à visée précise) sont nettement plus
  pénibles au doigt.
- **Pouce engourdi** à force de maintenir le joystick sur de longues sessions.
- L'icône d'annulation qui déclenche une autre compétence (voir plus haut).
- Bugs de **direction « collée »** (personnage qui part tout seul vers la droite quand on combine
  direction + compétence) → symptôme classique d'un pointeur mal libéré.
- Absence initiale de personnalisation de la disposition ; demande forte de manette.

### 1.2 Diablo 3 console (2013) — la référence du ciblage sans souris

- Ciblage automatique « fort » pour compenser la perte de précision : **on maintient le bouton
  d'une compétence en poussant le stick vers l'ennemi / le groupe visé** → le stick *oriente* le
  choix de la cible (cône directionnel).
- Sans cible, la compétence part **dans la direction où regarde le héros** (jamais « rien »).
- **Verrou de cible** (gâchette gauche) pour tourner autour d'une cible en gardant le focus.
- **Mode électif** : n'importe quelle compétence sur n'importe quel bouton.
- **Inventaire console** : menu radial des emplacements d'équipement ; sélectionner un emplacement
  **filtre l'inventaire** sur les objets compatibles et **compare** avec l'objet porté.
  C'est la meilleure solution connue « sans glisser-déposer ».

### 1.3 Torchlight: Infinite (XD, 2022) — les interrupteurs de lancement

- Réglages de combat : **Auto Guide**, **Auto Aim**, **Instant Cast** (lancement dès l'appui,
  sans phase de visée) activables par compétence/globalement ; roue de fonctions sur le stick.
- Leçon : **laisser le joueur choisir entre « lancer au relâché » et « lancer à l'appui »** — le
  premier permet la visée, le second supprime ~100 ms de latence perçue.

### 1.4 Undecember (LINE Games, 2022)

- Pad virtuel en bas à gauche, compétences en bas à droite, **deux pages de compétences
  alternables** (Skill Slot 1 / 2), potions/objets en « quick slot » près des compétences.
- **Les compétences à cible ou à zone sont visées automatiquement dans la direction du pad.**
- « Smart Control » = auto-combat : très critiqué par les joueurs PC (« Auto-combat is terrible »).
  → **Pas d'auto-combat** dans notre projet.

### 1.5 Path of Exile Mobile (annoncé, jamais sorti) / Grim Soul

- PoE Mobile montrait la même grammaire : pad à gauche, compétences + **potions à droite**,
  accès inventaire/personnage à gauche près de la barre de vie.
- Grim Soul (survie iso) : joystick flottant + bouton d'action contextuel unique qui change
  d'icône (attaquer / ramasser / interagir) — efficace pour le ramassage, trop ambigu en combat.

### 1.6 Conventions MOBA (Wild Rift) réutilisables

- **Priorité de ciblage réglable** : « le plus proche » vs « PV les plus bas (absolus / %) ».
  Les guides recommandent « le plus proche » au corps à corps, pour éviter le **« tir à la
  corde » entre le joueur et l'IA de ciblage** qui saute sur une autre cible.
- Glisser le bouton d'attaque vers un ennemi = **verrouiller** cette cible.
- Zone d'annulation pendant la visée (haut d'écran chez Wild Rift) + annulation « hors portée ».

### 1.7 Joystick virtuel — éléments de littérature

- Zone morte recommandée **10-20 %** de la course ; la **zone morte radiale mise à l'échelle**
  (« scaled radial ») est la meilleure : pas d'aimantation aux axes, pas de saut en sortie de zone.
- Étude comparative fixe vs flottant (Virtual Biotope) : les deux sont bien notés, **le flottant
  légèrement meilleur** en fatigue et en facilité d'apprentissage.

---

## 2. Joystick virtuel

### Décision : **flottant** dans une zone d'activation, avec « fantôme » au repos

| Paramètre | Valeur retenue | Justification |
|---|---|---|
| Type | **Flottant** : la base apparaît sous le doigt au `pointerdown` | Le pouce n'a jamais à « chercher » le stick ; moins de fatigue (étude + usage DI) |
| Zone d'activation | Rectangle **x ∈ [safeL + 12, min(0,45·W, bordGaucheClusterDroit − 32)]**, **y ∈ [bandeauHaut (64), H − safeB − 8]** | Moitié gauche sans le bandeau HUD du haut ni la zone du geste système du bas |
| Position fantôme (repos) | Centre (safeL + 110, H − safeB − 100), opacité 30 % | Montre où poser le pouce aux nouveaux joueurs, sans gêner |
| Rayon de la base R | **60 px** (Ø 120 px ≈ 19 mm) | Course du pouce confortable sans quitter la zone |
| Rayon du bouton (knob) | **26 px** (Ø 52 ≈ 8 mm) | Visible sous le pouce qui déborde |
| Zone morte | **10 px** (≈ 0,17 R), **radiale mise à l'échelle** | Évite les micro-dérives ; `m = clamp((d − 10) / (R − 10), 0, 1)` |
| Vitesse | Pleine vitesse dès `m > 0` (pas de marche analogique) | ARPG : on court toujours ; la marche lente n'apporte rien au doigt |
| Direction | Vecteur continu (déplacement libre) ; **orientation du sprite quantifiée en 16 directions** avec **hystérésis ± 5°** | Évite le clignotement entre deux frames de direction |
| Doigt au-delà de R | Knob bloqué au bord ; **au-delà de 1,5 R (90 px) la base suit le doigt** (translatée pour rester à 1,5 R) | Si le pouce glisse loin, on ne perd pas le contrôle et le retour est immédiat |
| Doigt qui sort de la zone | **Suivi continu** (capture du pointeur) partout sur l'écran | La zone ne sert qu'au `pointerdown` |
| Doigt qui quitte l'écran / `pointercancel` | **Arrêt net** (0 ms, pas d'inertie), la base revient au fantôme en 150 ms | Jamais de « direction collée » (bug DI) |
| Clamp d'apparition | Base toujours entièrement visible : cx ≥ safeL + 68, cy ≤ H − safeB − 68, cy ≥ 64 + 68 | Poser le pouce au bord ne coupe pas la base |
| Tap bref sur la zone (< 200 ms, < 10 px) | **Aucun effet** | Pas de « tap-to-move » : conflit avec les étiquettes et les objets |

Retour visuel :
- Base : disque noir 20 % + anneau blanc 2 px à 35 % ; knob blanc 65 % avec ombre douce.
- **Arc directionnel** de 60° sur l'anneau, orienté comme le knob, qui s'intensifie avec `m`.
- Au bord (m = 1) : anneau à 60 %. Pendant le suivi (> 1,5 R) : légère traînée de la base.
- Au sol (monde) : **petite flèche de direction** aux pieds du héros tant que le joystick est
  actif (utile en iso où la projection trompe l'œil).

Conversion écran → monde (iso) : le vecteur du joystick est **en espace écran** ; on le
convertit en direction monde par l'inverse de la projection isométrique
(`wx = sx/ (tileW/2) + sy/(tileH/2)`, `wy = sy/(tileH/2) − sx/(tileW/2)`, puis normalisation).
« Pousser vers le haut de l'écran » doit faire aller le héros vers le haut de l'écran.

Rejeté :
- **Fixe** : oblige à viser le centre du stick, fatigant, le pouce dérive hors zone.
- **Tap-to-move / clic au sol façon D2** : incompatible avec le pouce droit sur les compétences.
- **Auto-course verrouillée** en combat : option possible hors combat seulement (voir §12).

---

## 3. Bouton d'attaque principale et arc de compétences

### 3.1 Géométrie (référence 844 × 390, facteur d'échelle `s`)

`s = clamp(H_css / 390, 0,85, 1,25)` appliqué à toutes les tailles du HUD de combat.
Toutes les positions sont relatives au coin **bas-droit de la zone sûre**.

| Élément | Diamètre | Position (centre) | ≈ mm |
|---|---|---|---|
| **Attaque principale (A)** | **84 px** | 66 px du bord droit sûr, 66 px du bas sûr | 13,4 mm |
| Compétence S1 | **60 px** | A + polaire(r = 120, 190°) → (−118, +21) | 9,6 mm |
| Compétence S2 | 60 px | A + polaire(120, 155°) → (−109, −51) | 9,6 mm |
| Compétence S3 | 60 px | A + polaire(120, 120°) → (−60, −104) | 9,6 mm |
| Compétence S4 | 60 px | A + polaire(120, 85°) → (+10, −120) | 9,6 mm |
| Bascule de page (2 × 4 compétences) | 40 px | A + (−185, −85) | 6,4 mm |
| Potion de vie | 56 px | A + (−205, +10) | 9 mm |
| Potion de mana | 48 px | A + (−270, +14) | 7,7 mm |
| Bouton contextuel « Ramasser / Interagir » | 56 px | A + (−200, −150) (n'apparaît que si pertinent) | 9 mm |

(Angles en convention mathématique, 0° = droite, 90° = haut ; dans le tableau, dy positif = vers le bas de l'écran.)

Vérifications :
- Écart entre compétences adjacentes : corde = 2·120·sin(17,5°) = 72 px → **12 px de vide** entre Ø 60.
- Écart A ↔ compétences : 120 − 42 − 30 = **48 px de vide** → le pouce posé sur A ne touche jamais
  une compétence, et on peut « rouler » le pouce de A vers une compétence en ~1 cm.
- S1 : bord bas à 15 px au-dessus du bas sûr ; S4 : bord droit à 26 px du bord sûr.
- Le point le plus haut de l'arc (S4) est à ~245 px du bas physique sur 390 : il reste 145 px
  pour la minicarte en haut à droite.
- **Zone d'impact tactile = cercle visuel + 8 px** (hit radius 50 pour A, 38 pour S1-S4), sans
  jamais chevaucher la zone d'un voisin : en cas de recouvrement, attribuer au centre le plus proche.

Placement relatif aux zones sûres : tout le cluster est ancré sur `safe-area-inset-right/bottom`.
En paysage iPhone, l'encoche peut être à droite (paysage gauche) : l'inset droit vaut alors
~47-59 px et le cluster se décale d'autant — **c'est voulu**, le pouce ne doit jamais taper dans
l'encoche. Le rendu du monde, lui, reste **plein écran** (`viewport-fit=cover`).

Règle d'exclusion mutuelle : la zone du joystick s'arrête **32 px avant** l'élément le plus à gauche
du cluster droit (sur iPhone SE 667 px, cela ramène la zone à ~290 px de large — suffisant).

### 3.2 Comportement

**Attaque principale (A)** — lancement **à l'appui** (`pointerdown`), c'est la latence qui prime :
- Appui = premier coup immédiat sur la cible auto (§4) ; **maintien = répétition** à la cadence de
  l'arme (file de 1 action, pas d'accumulation).
- Glisser depuis A (> 12 px) = **visée manuelle de l'attaque principale** (équivalent du réglage
  « Primary Attack Aim » de DI) ; activé par défaut pour les classes à distance, désactivable.
- Au corps à corps, si la cible est hors d'allonge mais à ≤ 4 cases : le héros **va au contact**
  tant que A est maintenu (poursuite plafonnée à 4 cases). Toute entrée joystick **reprend la main**
  immédiatement sur la poursuite.
- Sans cible : l'attaque part **dans la direction du joystick, sinon dans l'orientation du héros**
  (D3 console) — jamais d'appui « mort ».
- Le joystick maintenu + A : le héros **s'arrête pour frapper** (équivalent Maj de D2) et la
  direction du joystick sert de cône de ciblage.

**Compétences S1-S4** — deux familles, portées par un drapeau de la compétence :

| Famille | Exemples D2 | Tap | Maintien sans glisser | Glisser | Relâcher |
|---|---|---|---|---|---|
| **« Spam »** (`repeatOnHold`) | Blizzard, Foudre, Tir multiple, Os | Lance à l'appui (auto-visée) | Répète tant que maintenu (délai 200 ms puis cadence de lancement) | Les lancements suivants partent dans la direction visée | Arrête (pas de lancement supplémentaire) |
| **« Ciblée »** (défaut) | Téléportation, Nova de givre (visée), Météore, Invocations, cris | Lance **au relâché** (auto-visée) | Affiche l'indicateur auto-visé, lance au relâché | Visée manuelle (§4.3) | Lance ; ou annule si en zone d'annulation |
| **« Sur soi »** | Nova, Armure, Tourbillon (sans direction) | Lance à l'appui | — | Ignoré (pas d'indicateur) | — |

Réglage global **« Lancement instantané »** (Torchlight: Infinite) : les compétences « ciblées »
partent à l'appui en auto-visée (visée manuelle désactivée). Défaut : **désactivé**.

Tampon d'entrée : un appui pendant une animation verrouillée est mis en file **200 ms** (1 seul
élément) ; au-delà il est jeté (pas de « lancements fantômes » tardifs).

### 3.3 Retour visuel des boutons

- **Appui** : échelle 0,92 + luminosité +20 % pendant l'appui (transition 60 ms) ; halo orange 3 px.
- **Recharge** : voile noir 60 % en **balayage radial horaire** (conic), + **secondes restantes**
  en blanc 16 px gras avec contour 2 px sombre si > 1 s ; sous 1 s, plus de texte.
- **Prêt** : flash anneau blanc 150 ms + pulsation d'échelle 1,08 (120 ms) + petit son « tick »
  (option).
- **Ressource insuffisante** : icône désaturée, teinte bleu-gris, chiffre de coût en rouge ;
  appui = secousse horizontale ± 3 px sur 120 ms + son « pas assez de mana » (clin d'œil D2),
  pas de lancement.
- **Charges** (compétences à charges) : pastilles en arc sur le bord haut du bouton.
- **Portée** (compétence ciblée sans ennemi à portée) : aucun grisage — elle se lance dans la
  direction du joystick/orientation (D3), sauf si la compétence exige une cible (alors contour rouge).
- Icônes lisibles à 60 px : silhouettes contrastées, pas de texte dans l'icône.

---

## 4. Visée

### 4.1 Principes tranchés

1. **Tap = auto-visée**, toujours. La visée manuelle est un **bonus**, jamais une obligation
   (la critique n° 1 de DI porte sur la visée libre en combat).
2. **Le joystick est un pointeur grossier** : sa direction oriente le choix de cible (cône D3 /
   Undecember).
3. **Collant** (hystérésis) : on ne change pas de cible sans raison — pas de « tir à la corde »
   avec l'IA de ciblage (Wild Rift).
4. **Visible** : la cible courante porte un **anneau rouge au sol** et son nom + barre de vie
   s'affichent **en haut au centre** (comme le survol souris de D2). Le joueur sait toujours ce
   que le tap va viser.
5. **Tap sur un ennemi dans le monde = verrou manuel** de cette cible (3 s ou jusqu'à sa mort /
   sortie de 1,5 × portée d'acquisition). Anneau rouge + réticule.

### 4.2 Auto-visée pondérée (cible unique)

Candidats : ennemis vivants, ciblables, **en ligne de vue** (raycast sur la grille), à distance
`d ≤ R_acq` avec `R_acq = max(portéeCompétence, 3 cases) + 2 cases`.
Les **objets destructibles** (tonneaux, urnes) sont exclus, sauf pour l'attaque principale quand
aucun ennemi n'est à portée et que l'objet est à ≤ 2 cases dans le cône du joystick.

Score (le plus haut gagne) :

```
S = 1.00 · (1 − d / R_acq)                         // proximité
  + 0.80 · cône                                    // direction du joystick
  + 0.35 · type                                    // normal 0 | champion/élite 0.6 | unique/boss 1.0
  + 0.40 · (cible courante ? 1 : 0)                // collant
  + 0.25 · (m'attaque au contact ? 1 : 0)          // menace immédiate (≤ 1,5 case)
  + 0.10 · (1 − pv%)                               // achever les blessés (faible poids)

cône =  cos(θ)  si le joystick est actif (ou relâché depuis < 300 ms) et θ ≤ 60°
        −0.5    si joystick actif et θ > 60°       // on ne se retourne pas contre l'intention
        0.25·cos(θ_orientation) si joystick au repos (léger biais vers l'avant du héros)
```

Surcharges par archétype :
- **Corps à corps** : proximité × 1,3, cône × 1,0, menace × 1,5 (le mêlée frappe ce qui le touche).
- **Distance / lanceur** : type × 1,5 (l'élite passe devant), proximité × 0,8.

Changement de cible (hystérésis) : on ne quitte la cible courante que si un autre candidat la
dépasse de **+0,25** au score, **ou** si elle meurt / sort de 1,2 × R_acq / de la ligne de vue,
**ou** si le joystick pointe à > 60° d'elle pendant **250 ms**.
Recalcul : à chaque lancement + toutes les **100 ms** pour l'anneau de cible (pas à chaque frame).

### 4.3 Auto-visée des compétences de zone et de ligne

- **Zone au sol** (Blizzard, Météore, Nuée) : pour chaque candidat `c` à portée, `grappe(c) =
  Σ poids(e)` des ennemis à ≤ rayonZone de `c` (normal 1, élite 2, boss 3).
  `S = 1,0 · grappe/grappeMax + 0,6 · cône + 0,3 · proximité`. Point visé = **barycentre pondéré**
  des membres de la meilleure grappe, ramené dans la portée. Anticipation facultative :
  + vitesse × délai d'impact pour les cibles en mouvement.
- **Ligne / projectile** (Tir multiple, Lance de foudre) : pour chaque direction vers un candidat,
  compter les ennemis dans le couloir (largeur du projectile) jusqu'à la portée ; garder le
  maximum, départager par le collant puis la proximité.
- **Cône** (Souffle, Tir multiple en éventail) : même principe avec le cône de la compétence.
- **Invocation** : point à 2 cases devant le héros, décalé vers la cible courante s'il y en a une.
- **Sans candidat** : direction du joystick, sinon orientation du héros, à **70 % de la portée**.

### 4.4 Visée manuelle (glisser depuis le bouton)

| Paramètre | Valeur |
|---|---|
| Seuil de glisser (passage en visée) | **12 px** depuis le point d'appui |
| Seuil de tap | relâché < 250 ms et < 12 px |
| Rayon « pleine portée » à l'écran `R_aim` | **100 px** (× s) depuis le **point d'appui** (pas le centre du bouton) |
| Mapping | direction = angle du vecteur doigt ; distance = `clamp(len / R_aim, 0, 1) × portée` (compétences à point) |
| **Retour au centre** (len < 18 px pendant la visée) | Revient à l'**auto-visée** (indicateur jaune) — relâcher lance en auto |
| **Annulation** | len > **170 px** (1,7 × R_aim) **ou** doigt qui sort de l'écran / `pointercancel` |
| Réarmement | revenir sous 150 px (hystérésis 20 px) |

Choix « **glisser hors de portée** » plutôt qu'une icône d'annulation : c'est le réglage que les
joueurs de DI adoptent parce que l'icône déclenche d'autres compétences. Comme le cluster est
collé au bord droit, les directions gauche/haut suffisent pour sortir, et **faire glisser le doigt
hors de l'écran annule aussi**.

Indicateur au sol (couche monde, sous les sprites des monstres, au-dessus du sol) :
- Portée : cercle fin autour du héros, blanc 25 %.
- Forme de la compétence (flèche, couloir de la largeur du projectile, cône, cercle d'impact) :
  **bleu clair 45 %** en visée manuelle, **jaune 45 %** en auto-visée, **gris 30 % + croix** en
  état d'annulation, **rouge** si point invalide (hors ligne de vue, case non marchable pour une
  téléportation).
- Au-dessus du bouton : l'icône de la compétence se décale vers le doigt de 20 % du vecteur (retour
  tactile visuel que « quelque chose suit le doigt »).

---

## 5. Compétences de mouvement (Téléportation, Charge, Bond, Ruée)

- **Tap** : direction = joystick s'il est actif, sinon orientation du héros ; distance = **100 %
  de la portée**, projetée sur la **dernière case marchable et visible** le long du rayon
  (jamais dans un mur, jamais « hors carte »). La Téléportation D2 ignore les obstacles
  intermédiaires : on teste seulement la case d'arrivée (recherche de la case valide la plus
  proche dans un rayon d'1 case si l'arrivée est bloquée).
- **Glisser** : direction + distance (`len / R_aim`), **distance minimale 30 %** de la portée
  (un micro-saut est toujours une erreur). Marqueur d'arrivée : cercle Ø = empreinte du héros +
  silhouette fantôme à 40 %, **rouge** si invalide (relâcher = annulé, pas de coût).
- **Charge / Bond vers une cible** (Barbare, Paladin) : tap = vers la cible auto-visée ; glisser
  = point.
- Spam de téléportation (build D2 classique) : la Téléportation est « ciblée » par défaut mais peut
  passer en « spam » via un réglage par compétence — en maintenant et en glissant, on enchaîne
  les sauts dans la direction visée à la cadence de lancement. C'est la façon tactile de faire le
  « téléport au curseur » de D2.

---

## 6. Potions

Deux modèles existent : DI (3 charges régénérées, 20 s de recharge) et D2 (ceinture d'objets).
**Décision : ceinture D2 simplifiée**, cohérente avec l'économie de butin inspirée de PD2.

- **2 boutons** : Vie (Ø 56, rouge) et Mana (Ø 48, bleu), positions §3.1. Les potions de
  rajeunissement comptent pour les deux (priorité : on consomme d'abord la potion du type exact).
- **Charges** : nombre de potions du type dans la ceinture, pastille chiffrée 14 px gras en bas à
  droite du bouton. Capacité = 4 colonnes × (1 à 4 rangs selon la ceinture), comme D2 ; les
  potions ramassées vont **automatiquement** dans la ceinture s'il reste de la place.
- **Anti-double-tap** : verrou local **1,0 s** par type (voile radial 1 s).
- **Soin sur la durée** (D2) : jauge circulaire autour du bouton pendant l'effet ; reprendre une
  potion relance l'effet (règle D2).
- **Refus à PV pleins** (≥ 100 %) : toast « Vie pleine » 1 s + retour léger, la potion n'est pas
  consommée (économie de potions au doigt, où les appuis accidentels sont fréquents).
- **Appui long 450 ms** sur un bouton de potion (hors combat de préférence) : ouvre la ceinture
  complète (4 colonnes) pour choisir un autre type (antidote, dégel…).
- Vide : bouton grisé, chiffre « 0 » rouge.

---

## 7. Ramassage et étiquettes au sol

**Automatique** (dans un rayon de **1,5 case** autour du héros, sans action) :
- **Or**, **potions** (si place dans la ceinture, sinon inventaire), **runes**, **gemmes**,
  **clés/essences** (objets de progression empilables).

**Manuel** pour le reste (armes, armures, bijoux, charmes, objets de quête) :
1. **Tap sur l'étiquette** au sol → le héros marche jusqu'à l'objet (chemin auto) et le ramasse ;
   un joystick actif annule le trajet.
2. **Bouton contextuel « Ramasser »** (Ø 56, icône main + nom tronqué de l'objet le plus proche)
   qui apparaît quand un objet ramassable est à **≤ 1,5 case** ; il sert aussi pour
   « Interagir » (coffre, porte, PNJ, levier, portail, sanctuaire) avec l'icône correspondante.
3. Option « Auto-ramassage » par rareté (comme DI : Normal / Magique / Rare / Set / Unique),
   défaut : **Magique et au-dessus + tous les objets filtrés « intéressants »**.

Étiquettes (D2) :
- Toujours visibles pour les objets passant le **filtre de butin** (sinon touche « Alt » tactile :
  bouton œil 40 px dans la barre du haut, bascule).
- Texte **13 px gras** (min 12 px), fond noir 70 %, padding 4 × 8 px, couleurs D2 :
  blanc (normal), gris (sockets/éthéré), bleu (magique), jaune (rare), vert (set), or (unique),
  orange (runes/artisanat).
- **Zone d'impact** étendue à **44 px de haut** minimum (padding invisible), largeur ≥ 64 px.
- **Anti-chevauchement** : empilement vertical (pas de 2 px) des étiquettes qui se recouvrent,
  ancré à l'objet par un filet ; **12 étiquettes maximum** à l'écran, triées par valeur.
- Largage notable (unique, set, rune ≥ Lem…) : faisceau lumineux au sol + son dédié + haptique (§10).
- Inventaire plein : l'étiquette tremble, toast « Inventaire plein », l'objet reste au sol.

---

## 8. Inventaire, coffre, marchand

### 8.1 Décisions

- **Grille, cases 1 × 1** (pas de Tetris D2). Le Tetris sans glisser-déposer, au doigt, est un
  enfer ; DI a fait le même choix. On garde la *sensation* D2 par les icônes, les couleurs de
  rareté et les charmes (qui vont dans une **sacoche à charmes** dédiée de 10 emplacements).
- **Pas de glisser-déposer**, **pas de double-tap**, **pas de modale de confirmation** :
  sélection au tap + barre d'actions.
- **Pages (onglets), pas de défilement** : supprime l'ambiguïté tap/scroll.
- **Pause** du jeu solo quand un panneau plein écran est ouvert (le tactile est plus lent que la
  souris ; c'est un jeu solo).

### 8.2 Mise en page paysage (844 × 390, zone sûre déduite)

```
┌──────────────── bandeau 44 px : onglets [Sac 1][Sac 2][Sac 3] · Or · [Trier] · [✕] ────────────────┐
│  Panneau gauche (40 %)                     │  Grille 8 × 5 cases de 48 px (+2 px de gouttière)      │
│  • Poupée d'équipement : 10 emplacements   │  = 400 × 250 px, 40 objets par page                    │
│    de 52 px (tête, amulette, arme I/II,    │                                                         │
│    torse, bouclier, gants, ceinture,       │                                                         │
│    bottes, 2 anneaux)                      │                                                         │
│  • OU, si un objet est sélectionné :       │                                                         │
│    fiche objet + comparaison               │                                                         │
│                                            ├─────────────────────────────────────────────────────────┤
│                                            │ Barre d'actions 56 px : [Équiper] [Jeter] [Vendre/      │
│                                            │ Déposer (contextuel)] [⋯]                               │
└────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘
```

### 8.3 Interactions

- **Tap sur un objet** : sélection (bordure orange 2 px + légère élévation). Le panneau gauche
  affiche **la fiche de l'objet en haut** et **l'objet équipé en dessous**, avec **les écarts
  colorés** (+ vert / − rouge) alignés ligne à ligne ; pour les anneaux/armes, onglets
  « Anneau G / Anneau D », « Arme I / Arme II ». Retap sur le même objet ou tap dans le vide :
  désélection.
- **Tap sur un emplacement de la poupée** (D3 console) : **filtre la grille** — objets compatibles
  à 100 %, les autres à 35 % d'opacité — et affiche la fiche de l'objet porté. Tap sur un objet
  compatible = comparaison directe.
- **Équiper** : action immédiate (échange si l'emplacement est pris). **Annuler** possible via un
  snackbar 5 s (« Équipé : … — Annuler »).
- **Jeter** (et Vendre pour rare+) : **maintenir 600 ms** sur le bouton (anneau de progression),
  pas de modale. Objets **verrouillables** (cadenas dans le menu ⋯) : jamais vendus/jetés en masse.
- **Appui long 450 ms** sur un objet : **mode multi-sélection** (cases à cocher) pour vendre /
  déposer / jeter en lot ; barre d'actions affichant « (n) ».
- **Trier** : catégorie (armes, armures, bijoux, charmes, runes/gemmes, consommables) → rareté
  décroissante → niveau d'objet décroissant. Les empilables (runes, gemmes, potions hors ceinture)
  s'empilent (compteur 12 px en bas à droite de la case).
- Pastille « nouveau » (point orange 8 px) sur les objets ramassés depuis la dernière ouverture.
- Bordure de case colorée selon la rareté ; icône barrée rouge si prérequis non remplis (niveau,
  force, dextérité), comme D2.
- **Doigt qui quitte l'écran / `pointercancel`** : aucune action. Toutes les actions se valident
  au **relâché sur le même élément** (sémantique « clic ») ; les appuis longs s'annulent si le
  doigt bouge de plus de 10 px ou sort de l'élément.

### 8.4 Coffre et marchand

- Vue scindée : **coffre à gauche** (grille 8 × 5, onglets Personnel 1-3 + « Matériaux » pour runes
  et gemmes empilées, à la PD2), **inventaire à droite**.
- Tap sur un objet → bouton principal « **Déposer** » / « **Retirer** » (transfert vers la
  première case libre de l'autre côté). Multi-sélection = transfert en lot.
- Bouton « Tout déposer matériaux » (runes, gemmes, essences).
- Marchand : même vue ; bouton principal « Vendre (prix) » ; onglet « Rachat » (10 derniers objets).
- Réparer tout : bouton unique dans l'en-tête marchand.

---

## 9. Arbre de compétences et assignation

- Panneau plein écran (jeu en pause) : **3 onglets d'arbre** (comme D2), à gauche (55 %) une grille
  **3 colonnes × 6 rangs** de nœuds de **56 px** reliés par les prérequis ; à droite (45 %) la
  fiche : description, niveau actuel / suivant, **synergies**, coût en mana, puis deux gros
  boutons de 56 px de haut : **[+1]** et **[Assigner]**.
- Points non dépensés : pastille sur le bouton « Compétences » du HUD et sur les onglets.
- **+1** immédiat, avec **snackbar « Annuler » 5 s** et annulation possible tant que le panneau reste
  ouvert (confort tactile ; la respécialisation « vraie » reste un système de jeu à part).
- **Assigner** : affiche un schéma du cluster (A + S1-S4, **page 1 / page 2**) ; on tape
  l'emplacement voulu. Si la compétence est déjà ailleurs, **échange** des emplacements.
  L'attaque principale (A) est elle-même assignable (équivalent du « clic gauche » D2 : Attaque,
  Frappe, Trait de feu…).
- **Deux pages de 4 compétences** (Undecember) basculées par le bouton 40 px : indispensable pour
  les builds D2 à buffs/cris/auras sans surcharger l'écran. Bascule instantanée, icônes qui
  pivotent en 150 ms, recharges conservées.
- Raccourci terrain : **appui long 600 ms sur un bouton de compétence, uniquement en ville** (ou
  via « Personnaliser » dans le menu) → sélecteur radial des compétences apprises. En combat,
  l'appui long est réservé au maintien/spam.
- Auras (Paladin) : une aura assignée à un emplacement s'active au tap et reste active (icône
  avec liseré permanent) ; pas besoin de maintenir.

---

## 10. HUD en paysage

### 10.1 Carte du HUD (844 × 390)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│[Portrait 40][PV ███████ 200×14][niv]      Nom de la cible / boss       [👁][⚔][🎒][📜][≡] │
│            [Mana █████ 200×10]            ██████ barre 280×10         ┌────────────┐     │
│            [XP ▔▔▔▔▔ 200×4]                                           │ Minicarte  │     │
│            buffs 24 px avec minuteurs                                 │ 112×112    │     │
│                                                                       └────────────┘     │
│                                                                        [Portail 44]      │
│                                   (monde)                           S4                  │
│                                                                 S3                      │
│   ( joystick flottant )                          [Interagir]  [⇄]  S2                     │
│       fantôme Ø120                                                  S1   ( A Ø84 )      │
│                                          [Mana 48] [Vie 56]                              │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Haut-gauche** (safeL + 12, 8) : portrait Ø 40 (tap = feuille de personnage), barre de **PV
  200 × 14** avec valeur « 812/1040 » 12 px, barre de **mana 200 × 10**, **XP 200 × 4** (pourcentage
  au tap), niveau. Ligne de **buffs/malédictions** en icônes 24 px avec minuteur 10 px.
  Les orbes D2 sont **abandonnés** : les coins bas sont pris par les pouces, et un orbe sous le
  pouce est illisible.
- **Haut-centre** : **cadre de la cible courante** (nom coloré selon type : blanc normal, bleu
  champion, or unique/boss ; barre 280 × 10 ; immunités en texte 11 px, comme D2). Barre de boss
  360 × 12 lors d'un combat de boss. Nom de zone en fondu 3 s à l'entrée.
- **Haut-droite** : rangée de boutons **40 px** espacés de 8 px (œil/étiquettes, personnage,
  inventaire, compétences, menu) ; **minicarte 112 × 112** (opacité 75 %, orientation iso fixe)
  sous la rangée ; **Portail de ville** (44 px, compteur de parchemins du tome) sous la minicarte,
  **maintenir 400 ms** pour lancer (anneau de progression) afin d'éviter de griller un parchemin.
- **Tap sur la minicarte** : **automap D2 plein écran en surimpression** (traits 1,5 px, 60 %
  d'opacité, **transparent aux entrées** : on continue à jouer dessous) ; retap sur le bouton pour
  fermer. Option « marcher vers » sur un point de l'automap **hors combat** uniquement (réponse à la
  fatigue du pouce, cf. auto-navigation DI).
- **Vie basse** : vignette rouge pulsée à 35 % de PV (opacité 20 %), 50 % d'opacité et battement
  de cœur sous 20 %.
- Nombres de dégâts optionnels (min 14 px, contour sombre 2 px). Texte Pixi toujours avec contour
  (lisibilité sur fond chargé).

### 10.2 Lisibilité et zones sûres

- **Texte : 12 px minimum**, 14 px pour tout chiffre de combat, contraste ≥ 4,5:1 (contour).
- Cibles tactiles hors combat : **40 px minimum** (barre du haut), **44 px** partout ailleurs.
- `viewport-fit=cover` : le monde remplit tout, **tout le HUD** respecte
  `env(safe-area-inset-*)`. En paysage iPhone : inset gauche/droit ≈ 47-59 px côté encoche,
  inset bas ≈ 21 px (barre d'accueil). Marge supplémentaire **12 px** sur les bords latéraux et
  **8 px** en bas.
- Les insets sont lus en CSS puis transmis à Pixi (élément sonde `position:fixed` avec
  `padding: env(...)` et `getComputedStyle`), **recalculés à chaque `resize`** et encore **300 ms
  après** (iOS met à jour les insets en retard après une rotation).
- Échelle : facteur `s` (§3.1). Tablette : `s` plafonné à 1,25, le HUD reste dans les coins (on ne
  remplit pas l'écran de boutons géants).
- Caméra : héros centré, **décalé de 6 % vers le haut** de l'écran pour voir le terrain devant les
  pouces ; héros d'environ **52-60 px de haut** sur 390 px de haut (≈ 1/7 de l'écran, proche de DI).
  Pas de zoom par pincement en combat (conflit multi-touch) ; zoom 2 crans dans les réglages.

---

## 11. Retour haptique et audio

### 11.1 Haptique (Android : Vibration API)

Principe : **rare et signifiant**. Jamais sur chaque coup donné (batterie, bruit, lassitude).

| Évènement | Motif `navigator.vibrate` (ms) |
|---|---|
| Entrée en zone d'annulation de visée | `10` |
| Échec de lancement (mana, recharge) | `12` |
| Potion bue | `12` |
| Dégât reçu ≥ 8 % PV max | `18` ; ≥ 25 % : `35` |
| PV passent sous 30 % (front montant) | `[40, 80, 40]` |
| Largage rune haute / unique / set | `[20, 50, 20, 50, 80]` |
| Montée de niveau | `[30, 60, 30, 60, 120]` |
| Changement de phase de boss | `60` |
| Mort | `200` |
| Tap bouton UI (optionnel, désactivé par défaut) | `8` |

- **Limiteur** : 1 vibration / 120 ms, file à priorité (une mort écrase tout).
- Réglage **Haptique : Désactivé / Léger (évènements majeurs seulement) / Complet**. Défaut : Léger.
- Désactiver pendant `visibilitychange: hidden`.

### 11.2 iOS : pas de Vibration API

Safari iOS **n'a jamais implémenté** la Vibration API. L'astuce `<input type="checkbox" switch>`
(clic programmatique sur un label → haptique native) fonctionnait d'iOS 17.4 à 26.4 mais **Apple
l'a bloquée en 26.5** pour les déclenchements programmatiques ; seules des superpositions sous le
doigt de l'utilisateur fonctionnent encore, incompatibles avec notre routage Pointer Events.
**Décision : ne pas compter sur l'haptique iOS.** Compensations systématiques (actives sur toutes
les plateformes, car elles servent aussi Android) :
- **Micro-secousse d'écran** 2-4 px sur 120 ms (gros dégât reçu), **hit-stop** 40-60 ms sur coup
  critique / tueur d'élite, **pulsation** des boutons.
- **Audio** court et à faible latence pour chaque confirmation importante.

### 11.3 Audio

- Web Audio (buffers pré-décodés, pas `<audio>` : latence trop élevée) ; **déverrouillage** du
  `AudioContext` au premier `pointerup`/`touchend` (`resume()`).
- iOS : le commutateur silencieux coupe le son web par défaut ; l'API Audio Session
  (`navigator.audioSession.type = "playback"`, Safari récent) peut changer ce comportement —
  **à tester** sur les versions cibles, avec repli silencieux.
- Signaux : « ding » distinct par rareté de largage (rune = son D2 reconnaissable), battement de
  cœur sous 20 % PV, « tick » de recharge prête (option), phrase « Pas assez de mana », clic doux
  des boutons UI.
- Coupure automatique sur `visibilitychange: hidden` et reprise au retour.

---

## 12. Ce qui ne marche PAS (à éviter)

1. **Visée libre obligatoire** au cœur du combat (DI Moine/Mage) → auto-visée forte par défaut.
2. **Icône d'annulation** fixe qui déclenche une autre compétence → annulation « hors portée » +
   sortie d'écran.
3. **Pouce engourdi** par le maintien du joystick → joystick flottant, zone large, marche vers un
   point de l'automap hors combat, pas de « tap-to-move » en combat.
4. **Direction/entrée « collée »** (bug DI : le personnage part tout seul) → propriété stricte d'un
   pointeur par contrôle, remise à zéro sur `pointercancel`, `lostpointercapture`, `blur`,
   `visibilitychange`, rotation.
5. **Cible qui saute** d'un ennemi à l'autre → hystérésis + collant + cadre de cible visible.
6. **Auto-ciblage des tonneaux** au lieu des monstres → destructibles exclus.
7. **Boutons trop petits / trop serrés** → Ø ≥ 56 px en combat, 12 px de vide entre boutons.
8. **Auto-combat** (Undecember « Smart Control », très critiqué) → aucun.
9. **Bouton « main » de ramassage** superflu (DI) → auto-ramassage + tap sur l'étiquette ; le
   bouton contextuel n'apparaît que s'il sert.
10. **Tetris d'inventaire** et **glisser-déposer** au doigt → grille 1 × 1 + barre d'actions.
11. **Double-tap** (délai de 300 ms sur tous les taps, confusions) et **modales** de confirmation →
    maintien 600 ms pour les actions destructrices, snackbar « Annuler ».
12. **HUD encombré / texte minuscule** (panneau de quêtes DI qu'il faut replier) → HUD minimal,
    12 px min, panneaux repliables.
13. **Contrôles sous l'encoche** ou dans la zone du geste « accueil » → zones sûres + marges.
14. **Menus trop profonds** → 2 niveaux max depuis le HUD.
15. **Latence au tap** (lancer au relâché partout) → attaque et « spam » à l'appui, option
    « Lancement instantané ».

---

## 13. Spécificités navigateur mobile

### 13.1 Entrées : Pointer Events multi-touch

- **Un seul routeur d'entrées** natif sur le `<canvas>` (`pointerdown/move/up/cancel`,
  `lostpointercapture`) — pas de `touchstart` sauf pour les `preventDefault` ci-dessous.
- `canvas.setPointerCapture(e.pointerId)` à chaque `pointerdown` : les mouvements hors du canvas
  restent livrés.
- **Table de propriété** `Map<pointerId, Contrôle>` : au `pointerdown`, hit-test mathématique dans
  cet ordre : HUD de combat (cercles) → barre du haut → zone joystick → étiquettes au sol →
  entités du monde. Un contrôle ne possède **qu'un pointeur** ; un second doigt sur un contrôle
  déjà tenu est ignoré.
- Jusqu'à **3 doigts utiles** simultanés : joystick + attaque/compétence + potion. Compétence
  appuyée pendant que A est tenu : la compétence passe en priorité, A reprend ensuite.
- Échantillonnage de l'état des contrôles **dans la boucle de jeu** (rAF), pas dans les
  gestionnaires ; les gestionnaires ne font que mettre à jour l'état.
- `pointerType` : `"mouse"` → bascule en mode clavier/souris (HUD tactile masqué) ;
  `"touch"`/`"pen"` → mode tactile. Bascule automatique à chaque changement.

### 13.2 Neutraliser le navigateur

```css
html, body { margin:0; height:100%; overflow:hidden; overscroll-behavior:none;
  background:#000; -webkit-text-size-adjust:100%; }
canvas, .hud { touch-action:none; user-select:none; -webkit-user-select:none;
  -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; }
```

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1,
      user-scalable=no, viewport-fit=cover">
```

- `touch-action: none` supprime défilement, pincement et double-tap-zoom **sur l'élément** ;
  en complément sur iOS : `document.addEventListener('gesturestart', e => e.preventDefault())`
  et `touchmove` non passif avec `preventDefault()` sur `document` (effet « élastique » de Safari
  hors mode installé).
- **Pull-to-refresh** (Chrome Android) : `overscroll-behavior: none` sur `html` et `body`.
- **Menu contextuel** de l'appui long (Android) : `contextmenu` → `preventDefault()`.
- **Loupe/sélection** iOS : `user-select: none` + `-webkit-touch-callout: none`.
- **Gestes système** : balayage depuis le bord gauche (retour Safari, hors mode installé) et
  barre d'accueil en bas → aucune zone de glisser ne commence à moins de **12 px** des bords
  latéraux sûrs ni **8 px** du bas sûr. Le web ne peut pas « différer » les gestes système comme
  une app native.
- Menus (inventaire, arbre, réglages) : en **DOM** superposé (texte, accessibilité, mise en page),
  avec `touch-action: manipulation` sur les boutons. Le HUD de combat reste **dans Pixi** avec le
  routeur natif (latence minimale, rendu unifié).

### 13.3 Orientation, plein écran, installation

- **Manifest** : `"display": "fullscreen"`, `"orientation": "landscape"`, icônes 192/512,
  `"background_color": "#000"`. Android installé : paysage et plein écran respectés.
- **Android navigateur** : au premier tap « Jouer », `document.documentElement.requestFullscreen({
  navigationUI: "hide" })` puis `screen.orientation.lock("landscape")` (le verrouillage exige le
  plein écran). Réessayer au retour de `visibilitychange`.
- **iPhone** : **pas d'API Fullscreen** (seulement iPad), **pas de `orientation.lock`**, manifest
  `orientation` ignoré, `display: fullscreen` non fiable → retomber sur `standalone` ; en paysage
  iPhone la barre d'état est masquée de toute façon. Méta
  `apple-mobile-web-app-capable` + `apple-mobile-web-app-status-bar-style: black-translucent`.
  **Écran d'invitation « Ajouter à l'écran d'accueil »** quand on détecte Safari iOS non installé
  (`navigator.standalone === false`).
- **Garde d'orientation** : `matchMedia("(orientation: portrait)")` → surimpression
  « Tournez votre appareil » + **pause** automatique ; reprise manuelle (bouton) au retour en
  paysage, jamais automatique en plein combat.
- **Wake Lock** : `navigator.wakeLock.request("screen")` au lancement d'une partie, relâché en
  pause/menu principal, **redemandé à chaque `visibilitychange: visible`** (le verrou est perdu
  quand l'onglet est masqué). Fonctionne dans les apps installées iOS depuis **iOS 18.4**
  (bug corrigé) ; repli : rien (l'écran s'éteindra selon les réglages).
- **Cycle de vie** : `visibilitychange: hidden` → pause, coupure audio, remise à zéro des entrées,
  sauvegarde ; `pagehide` → sauvegarde synchrone locale.
- Rendu : `resolution = min(devicePixelRatio, 2)` pour Pixi, 60 i/s visés, repli 30 i/s si le
  temps de trame dépasse 20 ms de façon soutenue.

### 13.4 Clavier/souris sur PC (second plan)

Schéma D2 modernisé, basé sur **`event.code`** (position physique : fonctionne en AZERTY), libellés
affichés via `navigator.keyboard.getLayoutMap()` (Chromium) sinon table AZERTY/QWERTY.

| Action | Souris/clavier |
|---|---|
| Déplacement / attaque principale | Clic gauche (maintenu = continu), comme D2 |
| Compétence « droite » sélectionnée | Clic droit au curseur |
| Compétences S1-S4 | `Digit1`-`Digit4` : **lancement direct au curseur** (façon D3) |
| Bascule de page | `KeyR` |
| Potions vie / mana | `KeyQ` / `KeyE` (A / E en AZERTY) ; ceinture D2 1-4 en option |
| Attaquer sur place | `Shift` |
| Étiquettes | `Alt` (maintien) / bascule dans les réglages |
| Automap | `Tab` |
| Inventaire / Personnage / Compétences | `KeyI` / `KeyC` / `KeyT` |
| Portail | `KeyP` |
| Fermer panneaux / menu | `Escape` |

Souris : le curseur **remplace l'auto-visée** (visée exacte), mais l'aimantation douce sur l'ennemi
survolé (rayon 24 px) est conservée. Manette (Gamepad API) : possible plus tard avec le schéma
D3 console (même moteur d'auto-visée, le stick gauche = cône).

---

## 14. Spécification retenue

### 14.1 Constantes (fichier unique, ex. `src/input/constants.ts`)

| Constante | Valeur | Remarque |
|---|---|---|
| `REF_H` | 390 | hauteur de référence |
| `HUD_SCALE` | `clamp(H/390, 0.85, 1.25)` | `s` |
| `JOY_R` | 60 × s | rayon base |
| `JOY_KNOB_R` | 26 × s | |
| `JOY_DEAD` | 10 × s | zone morte radiale mise à l'échelle |
| `JOY_FOLLOW` | 1.5 × JOY_R | la base suit au-delà |
| `JOY_ZONE_MAX_X` | `min(0.45·W, clusterLeft − 32)` | |
| `TOP_BAND` | 64 | pas d'activation joystick au-dessus |
| `EDGE_MARGIN_X` / `EDGE_MARGIN_BOTTOM` | 12 / 8 | en plus des insets |
| `ATK_D` | 84 × s | attaque principale |
| `ATK_OFFSET` | (66, 66) × s | depuis coin bas-droit sûr |
| `SKILL_D` | 60 × s | |
| `SKILL_ARC_R` | 120 × s | |
| `SKILL_ANGLES` | [190°, 155°, 120°, 85°] | S1→S4 |
| `HIT_PAD` | 8 | rayon d'impact = visuel + 8 |
| `POTION_HP_D` / `POTION_MP_D` | 56 / 48 × s | |
| `TAP_MAX_MS` / `TAP_MAX_MOVE` | 250 / 12 | |
| `AIM_R` | 100 × s | pleine portée |
| `AIM_CENTER_RETURN` | 18 | → auto-visée |
| `AIM_CANCEL` / `AIM_REARM` | 170 / 150 | × s |
| `HOLD_REPEAT_DELAY` | 200 ms | compétences « spam » |
| `LONG_PRESS` | 450 ms | menus, multi-sélection |
| `DESTRUCTIVE_HOLD` | 600 ms | jeter/vendre |
| `PORTAL_HOLD` | 400 ms | |
| `INPUT_BUFFER` | 200 ms, 1 élément | |
| `POTION_LOCK` | 1000 ms | |
| `PICKUP_RADIUS` | 1.5 case | auto + bouton contextuel |
| `MELEE_CHASE_MAX` | 4 cases | |
| `ACQ_EXTRA` | 2 cases | `R_acq = max(portée, 3) + 2` |
| `RETARGET_MARGIN` | 0.25 | hystérésis de score |
| `RETARGET_CONE_MS` | 250 ms | joystick > 60° de la cible |
| `TARGET_REFRESH` | 100 ms | |
| `MANUAL_LOCK_MS` | 3000 ms | tap sur un ennemi |
| `LABEL_FONT` / `LABEL_HIT_H` / `LABEL_MAX` | 13 px / 44 px / 12 | |
| `HAPTIC_MIN_GAP` | 120 ms | |

### 14.2 Composants

Entrées / plateforme (`src/input`, `src/platform`) :
- **`InputRouter`** — écoute Pointer Events sur le canvas, capture, table `pointerId → contrôle`,
  hit-test ordonné, remise à zéro globale (`resetAll()` sur cancel/blur/hidden/resize/rotation),
  bascule tactile ↔ souris selon `pointerType`.
- **`LayoutEngine`** — lit les insets (sonde CSS), calcule `s` et les rectangles/cercles de tous les
  contrôles, publie un évènement `layoutChanged` (resize + 300 ms).
- **`VirtualJoystick`** — état `{active, origin, vector, magnitude}` ; expose `dirWorld()` (inverse iso).
- **`ActionButton`** (A) et **`SkillButton`** ×4 — machine d'états §14.3, affichage recharge/coût/charges.
- **`SkillPageToggle`** — 2 pages × 4 emplacements.
- **`PotionButton`** ×2 — compte, verrou 1 s, jauge de soin, appui long → `BeltPopover`.
- **`ContextButton`** — ramasser / interagir, apparaît si cible à ≤ 1,5 case (priorité : objet
  filtré > PNJ/porte/coffre > objet non filtré).
- **`KeyboardMouseAdapter`** — mapping `event.code`, curseur → visée exacte.
- **`OrientationGuard`**, **`FullscreenManager`** (Android), **`WakeLockService`**,
  **`InstallPrompt`** (iOS), **`Lifecycle`** (pause/sauvegarde/audio).
- **`HapticsService`** (Vibration API si présente, file à priorité, réglage 3 niveaux, no-op iOS),
  **`AudioService`** (Web Audio, déverrouillage, Audio Session si dispo).

Simulation (`src/sim`) :
- **`TargetSelector`** — `pickSingle(skill, ctx)`, `pickGround(skill, ctx)`, `pickLine(skill, ctx)`,
  `pickCone(skill, ctx)` ; utilise l'index spatial existant (`src/sim/spatial.ts`) et le LOS de la grille.
- **`MovementSkillResolver`** — projection sur la dernière case valide, distance min 30 %.
- **`PickupSystem`** — auto-ramassage par catégories + filtre de butin, trajet vers étiquette.

Rendu (`src/render`, `src/ui`) :
- **`AimIndicator`** (couche monde) — portée, forme, couleurs d'état (auto jaune / manuel bleu /
  annulation gris / invalide rouge).
- **`TargetRing`** + **`TargetFrame`** (haut-centre).
- **`GroundLabels`** — étiquettes D2, empilement anti-chevauchement, 12 max, hit 44 px.
- **`HudBars`**, **`BuffRow`**, **`Minimap`**, **`AutomapOverlay`**, **`TopBar`**, **`LowHpVignette`**.
- Panneaux DOM : **`InventoryPanel`**, **`StashPanel`**, **`VendorPanel`**, **`SkillTreePanel`**,
  **`SettingsPanel`**, **`Snackbar`**, **`HoldToConfirmButton`**.

### 14.3 Machines d'états

**Joystick**
```
IDLE --pointerdown dans zone--> ACTIVE(origin = clamp(point))
ACTIVE --move, d > JOY_FOLLOW--> ACTIVE (origin translatée)
ACTIVE --pointerup | pointercancel | lostcapture | resetAll--> IDLE (vector = 0 immédiatement,
        base → fantôme en 150 ms)
```

**Bouton de compétence « ciblée »** (et A si visée manuelle activée)
```
IDLE --down--> PRESSED (t0, p0 ; indicateur auto-visé jaune)
PRESSED --move > 12 px--> AIMING_MANUAL
PRESSED --up--> CAST(auto) → IDLE
AIMING_MANUAL --len < 18--> AIMING_AUTO --len ≥ 18--> AIMING_MANUAL
AIMING_* --len > 170 | sortie d'écran--> CANCEL_ARMED (indicateur gris, haptique 10 ms)
CANCEL_ARMED --len < 150--> AIMING_MANUAL
AIMING_MANUAL --up--> CAST(point/direction manuels) → IDLE
AIMING_AUTO  --up--> CAST(auto) → IDLE
CANCEL_ARMED --up--> IDLE (rien, aucun coût)
* --pointercancel | resetAll--> IDLE (rien)
```
Si `instantCast` : `IDLE --down--> CAST(auto) → IDLE`.

**Bouton « spam » / attaque principale**
```
IDLE --down--> CASTING (lancement immédiat auto ; puis répétition après 200 ms à la cadence)
CASTING --move > 12 px--> CASTING_AIMED (lancements suivants dans la direction du doigt)
CASTING_AIMED --len < 18--> CASTING (auto)
CASTING* --up | cancel | resetAll--> IDLE
```

**Disponibilité (surcouche d'affichage de tout bouton)** : `READY | COOLDOWN(t) |
NO_RESOURCE | DISABLED(stun, silence) | EMPTY(potion)`. Un appui en `COOLDOWN`/`NO_RESOURCE`
→ retour d'échec (secousse, son, haptique 12 ms) et **mise en tampon 200 ms** seulement pour
`COOLDOWN` restant < 200 ms.

**Ciblage**
```
AUTO (recalcul 100 ms, hystérésis) --tap sur ennemi--> LOCKED(cible, 3 s)
LOCKED --mort | > 1,5 R_acq | 3 s écoulées--> AUTO
```

### 14.4 Auto-visée — pseudo-code

```ts
function scoreSingle(e: Enemy, c: Ctx, w = weightsFor(c.archetype)): number {
  const d = dist(c.hero, e);
  if (d > c.rAcq || !e.targetable || !los(c.hero, e)) return -Infinity;
  const prox = 1 - d / c.rAcq;
  let cone: number;
  if (c.joyActive || c.msSinceJoyRelease < 300) {
    const th = angleBetween(c.joyDirWorld, dirTo(c.hero, e));
    cone = th <= deg(60) ? Math.cos(th) : -0.5;
  } else {
    cone = 0.25 * Math.cos(angleBetween(c.heroFacing, dirTo(c.hero, e)));
  }
  const type = e.rank === 'boss' || e.rank === 'unique' ? 1 : e.rank === 'champion' ? 0.6 : 0;
  const sticky = e.id === c.currentTargetId ? 1 : 0;
  const threat = e.isAttacking(c.hero) && d <= 1.5 ? 1 : 0;
  const lowHp = 1 - e.hp / e.hpMax;
  return w.prox * prox + w.cone * cone + w.type * type
       + w.sticky * sticky + w.threat * threat + w.lowHp * lowHp;
}
// poids par défaut      : prox 1.00, cone 0.80, type 0.35, sticky 0.40, threat 0.25, lowHp 0.10
// corps à corps         : prox 1.30, cone 0.80, type 0.35, sticky 0.40, threat 0.375, lowHp 0.10
// distance / lanceur    : prox 0.80, cone 0.80, type 0.525, sticky 0.40, threat 0.25, lowHp 0.10
// changement de cible si best.score > current.score + 0.25, ou cible invalide,
// ou joystick > 60° de la cible depuis 250 ms.

function pickGround(skill, c): Vec2 {
  // grappe(e) = Σ poids(x) pour x à ≤ skill.aoeRadius de e ; poids normal 1, élite 2, boss 3
  // score = 1.0 * grappe/grappeMax + 0.6 * cone + 0.3 * prox
  // point = barycentre pondéré des membres de la meilleure grappe, clampé à la portée
  // aucun candidat → direction joystick | orientation, à 70 % de la portée
}
```

### 14.5 Réglages exposés (défauts)

| Réglage | Défaut | Options |
|---|---|---|
| Visée manuelle de l'attaque principale | Classes à distance : oui ; mêlée : non | oui/non |
| Lancement instantané | Non | global + par compétence |
| Priorité de ciblage | Équilibrée (poids §14.4) | Plus proche (cône 0,4 ; type 0) / Élites d'abord (type × 2) |
| Téléportation en mode spam | Non | oui/non |
| Auto-ramassage | Magique+ et objets filtrés | Normal / Magique / Rare / Set / Unique |
| Filtre de butin | Standard | Minimal / Standard / Strict |
| Étiquettes toujours visibles | Oui | bascule (œil) |
| Haptique | Léger | Désactivé / Léger / Complet |
| Taille du HUD | 100 % | 85-125 % |
| Opacité des boutons | 85 % | 40-100 % |
| Côté du joystick | Gauche | Gauche / Droite (gauchers) |
| Nombres de dégâts | Non | oui/non |
| Éditeur de disposition (phase 2) | — | déplacer chaque bouton sur une grille de 8 px, contraintes de chevauchement ; stocké en `localStorage` (try/catch) |

### 14.6 Critères d'acceptation (tests manuels + bots)

1. `pointerdown` sur A → début d'animation d'attaque **≤ 1 frame** de simulation (≤ 50 ms perçus).
2. Joystick + A + potion **simultanés** sans perte d'entrée sur iPhone SE et un Android 6,5".
3. Aucun contrôle ne chevauche l'encoche ni la barre d'accueil, dans les **deux** orientations paysage.
4. Rotation, mise en arrière-plan, appel entrant, notification tirée : **aucune direction collée**
   au retour, jeu en pause.
5. 100 taps de compétence dans une meute de 10 monstres + 1 élite : l'élite est visée en premier
   quand le joystick pointe vers elle ; aucun changement de cible sans cause (hystérésis).
6. Aucune action destructrice possible par un seul tap ; aucun double-tap nécessaire nulle part.
7. Pincement, double-tap, pull-to-refresh, menu contextuel, loupe iOS : **tous inopérants** pendant le jeu.
8. Sur iOS installé ≥ 18.4, l'écran ne s'éteint pas pendant 10 min de jeu sans toucher l'écran
   (Wake Lock) ; sur Android, plein écran + paysage verrouillés après le tap « Jouer ».

---

## Sources

- Diablo Immortal — Controls (Fextralife) : https://diabloimmortal.wiki.fextralife.com/Controls
- Den of Geek — Diablo Immortal: The Best Control Options : https://www.denofgeek.com/games/diablo-immortal-control-options-supported-controllers-mouse-keyboard/
- Gamer Tweak — Best Settings Diablo Immortal : https://gamertweak.com/best-settings-diablo-immortal/
- Gameranx — Diablo Immortal settings for PvP (Slide Out of Range) : https://gameranx.com/features/id/321002/article/diablo-immortal-5-settings-you-need-to-change-for-pvp/
- Game8 — How to Heal (potions : 3 charges, 20 s) : https://game8.co/games/Diablo-Immortal/archives/378456
- Screen Rant / Gamepur — Auto pick up Diablo Immortal : https://screenrant.com/diablo-immortal-automatically-pick-items/ , https://www.gamepur.com/guides/how-to-automatically-pick-up-items-in-diablo-immortal
- Android Police — Diablo Immortal hands-on : https://www.androidpolice.com/diablo-immortal-hands-on-review/
- TechRadar — How Diablo Immortal plays on smartphones : https://www.techradar.com/news/ive-played-diablo-immortal-how-blizzards-dark-action-rpg-plays-on-smartphones
- Red Bull — Blizzard's insights for Diablo mobile (charge pendant la visée) : https://www.redbull.com/nz-en/diablo-immortal-mobile-blizzard-insights
- Forums Blizzard — bug de direction collée : https://us.forums.blizzard.com/en/diablo-immortal/t/character-auto-move-to-certain-direction-when-clicking-movement-key-and-skill-key/2981
- Diablo 3 console (ciblage, mode électif) : https://www.diablowiki.net/Diablo_3_console , https://www.digitaltrends.com/gaming/surviving-in-sanctuary-your-guide-to-getting-started-in-diablo-iii/
- Inventaire radial D3 console : https://medium.com/@superscott597/diablo-inventory-ui-fan-redesign-figma-principle-ue4-part-ii-3ba681e2bdf0
- Torchlight: Infinite — Auto Aim / Instant Cast : http://www.vhpg.com/torchlight-infinite-controller-support/ , https://www.vhpg.com/torchlight-infinite-system-usability-optimizations/
- Undecember — Interface (guide officiel) : https://guide.floor.line.games/UD/en_US/detail/1166866635542600519 ; auto-combat critiqué : https://steamcommunity.com/app/1549250/discussions/0/3388420307305652666/
- Path of Exile Mobile : https://blog.en.uptodown.com/path-of-exile-mobile-all-details/
- Wild Rift — priorité de ciblage : https://hitonegames.com/index.php/2022/01/12/wild-rift-how-to-change-targeting-priority-and-target-lock-filtering/ , https://www.wildrift-boost.com/blog/best-wild-rift-settings-2026
- Zones mortes : https://www.gamedeveloper.com/business/doing-thumbstick-dead-zones-right
- Joystick flottant vs fixe (Virtual Biotope, UPI) : https://repository.upi.edu/101077
- Haptique iOS web (switch, patch 26.5) : https://github.com/tijnjh/ios-haptics , https://haptics.kushagragolash.dev/ , https://github.com/web-platform-tests/interop/issues/718
- PWA iOS 2026 (fullscreen, orientation, Wake Lock) : https://tips.ojapp.app/en/pwa-ios-2026-complete-guide/ , https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- Wake Lock dans les apps installées iOS 18.4 : https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ , https://bugs.webkit.org/show_bug.cgi?id=254545
