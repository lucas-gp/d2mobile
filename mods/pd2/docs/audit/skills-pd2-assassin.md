# Compétences de l'Assassin : comportement PD2 (wiki S13) vs jeu

Source : wiki PD2 (`x_All_Skills`, pages de compétence, journaux de saisons) et `mods/pd2/tools/skilldata/pd2-wiki.json` (tables à 60 niveaux, notes, synergies).
Convention d'échelle du jeu : 1 unité = 2 yards. Les rayons et distances du wiki sont repris tels quels (yards ÷ 2) ; les chiffres par niveau viennent de `mods/pd2/data/skills.ts` (généré par `mods/pd2/tools/skilldata/apply-pd2-wiki.py`).
Les statistiques de base des invocations (vie, défense, score d'attaque des ombres) suivent le modèle propre au jeu (échelle du niveau du personnage) : seuls les comportements, tables du wiki (nombres, plafonds, synergies) et effets spéciaux sont alignés.
Tests : `mods/pd2/tests/unit/skills-pd2-assassin.test.ts` (lancement headless de chaque compétence corrigée).

Légende « conforme ? » : oui / corrigé (écart trouvé et corrigé dans ce lot) / supposé (non vérifiable, choix assumé, laissé tel quel) / non corrigé (écart connu, voir la raison).

Les 31 compétences de l'arbre sont vérifiées. Tous les chiffres par niveau (dégâts, mana, durées, synergies, score d'attaque, parade, résistances de Fade…) étaient déjà ceux du wiki ; les écarts trouvés sont des comportements (qui consomme les charges, forme des pièges, nombre de tirs, zones, durées fixes).

## Cycle des charges (Arts martiaux)

PD2 (saison 2 puis 5) : une attaque à charges produit AUSSITÔT l'effet de l'étage courant (1, 2, 3), l'étage étant la position dans un cycle PARTAGÉ entre toutes les compétences à charges (une Frappe du tigre puis un Poing de feu = étage 2 pour le Poing, qui pose 2 charges de feu) ; au troisième coup les charges sont réinitialisées. Un coup de finition « lance les trois étages d'un coup » (saison 5 : « Dragon Claw procs all built up charges on both weapon attacks ») et consomme les charges (+50 % de précision par charge, dégâts du Tigre, conversion en feu des Poings de feu).
Écarts corrigés : l'étage était compté par compétence (alterner Tigre et Poing redémarrait à l'étage 1) ; la Frappe du tigre n'ajoutait rien à son propre coup (bonus de dégâts 50/100/150 % de l'étage et zone de mêlée +20 %/+40 %) ; les finitions n'appliquaient que la précision et la conversion, jamais les étages accumulés.
Supposé : la saison 5 dit « garde la troisième charge » ; le jeu garde ce comportement uniquement pour le Tigre (charges conservées 300 s pour la finition) et réinitialise les autres au troisième coup. Non vérifiable sans le moteur de PD2 (le journal de la saison 2 dit l'inverse).

## Arts martiaux

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Frappe du tigre | Charge ; dégâts +50/+100/+150 % (×niveau) selon l'étage ; portée de zone +20 % à l'étage 2, +40 % à l'étage 3 (S13 : seulement pour elle) ; garde ses charges 300 s | corrigé : son coup ne recevait aucun bonus ; étage partagé |
| Serre du dragon | Finition ; 1 à 3 coups de pied (table) ; charges déclenchées ; synergies 25 %/niv. (Queue, Envol) | corrigé : étages des charges déclenchés à chaque coup de pied |
| Griffe du dragon | Finition ; un coup avec chaque griffe qui déclenche les charges des deux attaques ; synergies Maîtrise des griffes et Parade d'arme | corrigé : étages déclenchés à chaque griffe |
| Poings de feu | Étage 1 : explosion de 2,66 yards + sol brûlant 2,56 s ; 2 : nova de 7,33 yards ; 3 : trois météores en ligne (0 / 0,2 / 0,4 s, rayon 2,33 yards, 1 s de brûlure) ; convertit le physique des finitions en feu | oui (étages) ; corrigé : étage partagé, déclenchement par les finitions |
| Frappe du cobra | Étage 1 : 7 traits de poison en arc de 120° (12,25 yards, 1 s) ; 2 : +90 %/+30 % de dégâts de la table et vol de vie/mana ; 3 : nuage de poison de 6 yards de rayon | corrigé : le coup de l'étage 2 n'avait pas le bonus de dégâts ; nuage de 4 yards au lieu de 6 |
| Queue du dragon | Finition ; rayon 4 yards ; le coup de pied convertit 100 % du physique en feu (« Kick Fire Damage +% » : 40 % +13 %/niv.), sans cumul avec les Poings de feu | corrigé : coup physique sans bonus + explosion de feu séparée de 2,4 u (4,8 yards) |
| Griffes de foudre | Étage 1 : foudre ajoutée ; 2 : nova de 7,33 yards ; 3 : éclair + éclairs qui frappent les ennemis touchés, perçants | oui (étages) |
| Lames de glace | Étage 1 : froid ajouté (10 s) ; 2 : onde de froid de 4 yards de large sur 10,66, recul 20 % ; 3 : 10 lames de glace, ~16 yards | corrigé : l'onde était un disque de 5,33 yards de rayon ; l'étage 3 gelait 5 ennemis proches (2 s) au lieu de lancer 10 lames (en éventail frontal de 60° : forme supposée) |
| Envol du dragon | Finition ; téléportation ; recharge de la table (2 s au niveau 1, 1 s dès le niveau 26) | corrigé : recharge fixe de 1 s |
| Frappe du phénix | Étage 1 : météore de 4 yards + sol brûlant 1,48 s ; 2 : chaîne d'éclairs (~12 yards) ; 3 : froid 4 s (~8 yards de portée) ; synergies | corrigé : pas de sol brûlant à l'étage 1 ; froid de 3 s au lieu de 4 s. Supposé : forme de l'étage 3 (nova de 4,4 yards) |

## Disciplines de l'ombre

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Maîtrise des griffes | Dégâts, score d'attaque, critique (plafond 30 %, ×2) | oui |
| Marteau psychique | Rebondit sur les ennemis voisins (5,33 yards), −20 % par rebond, N coups (2 à 6, table) ; synergies 20 % | corrigé : un seul coup, sans rebond |
| Accès de vitesse | Vitesse d'attaque (points investis), de déplacement (table), 300 s +5 s/niv. | oui |
| Cape d'ombre | Portée 20 yards, durée fixe 5 s, recharge 5 s ; aveugle, défense −15 % +1 %/niv., la vôtre +5 %… | corrigé : durée 8 s +1 s/niv., rayon 6,65+3 u, pas de recharge |
| Parade d'arme | 8 % +…, plafond 55 %, recharge 0,16 s, deux griffes ; réduite par 1/5 du blocage objets | oui (table) ; supposé : recharge de 4 images non simulée |
| Évanescence (Fade) | Toutes résistances, réduction de dégâts physiques, durée des malédictions −5 à −30 %, 300 s +5 s/niv. | oui |
| Guerrière de l'ombre | Une ombre (partagée avec le Maître), recharge 2 s, utilise vos deux compétences actives (gauche et droite), vie 600/800/1000 | corrigé : recharge 2 s (6 s). Non corrigé : l'ombre n'imite pas vos compétences (frappe d'arme seulement) : il faut refaire tout le lancement des compétences pour un lanceur autre que le joueur |
| Souffle mental | Dégâts PHYSIQUES (S13), rayon 4 à 6 yards et étourdissement 4 s / 2 s / 0 selon les points investis (aucun au-delà d'un point) ; plus de conversion des ennemis ; synergies 13 % | corrigé : dégâts magiques, étourdissement de 2 s +0,2/niv., rayon de 12 yards, conversion d'ennemis |
| Venin | Poison sur 1 s ajouté aux coups, 300 s +5 s/niv. | oui |
| Maître de l'ombre | Idem Guerrière ; peut utiliser toute compétence d'Assassin, garde Venin et Bouclier de lames actifs, alterne Fade et Accès de vitesse | corrigé : recharge 2 s. Non corrigé : IA des compétences (voir Guerrière) |

## Pièges

Plafond de tourelles : 5 (Sentinelle de lames exclue de ce compte depuis la S6), déjà en place.

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Explosion de feu | N bombes (1 à 9, +1 par 3 niveaux), qui retombent à moins de 3,33 yards de la cible ; explosion de 2,66 yards | corrigé : une seule bombe de 3 yards |
| Toile d'éclairs | N pointes (4 à 24) retombant à moins de 3,33 yards de la cible, 1,33 yard de rayon chacune, 3,6 s, recharge 1 s ; dégâts par seconde de la table, cumul des pointes | corrigé : une zone unique de 4,8 yards, trois fois les dégâts de la table, sans recharge |
| Sentinelle de lames | 100 % des dégâts d'arme ajoutés ; 24 yards/s pendant 2 s ; un coup toutes les 0,2 s ; explosion à chaque extrémité (75 % de l'arme) | corrigé : dégâts de compétence seuls, 4 yards/s, durée 4 à 13 s, un coup par passage. Supposé : recharge de 2 s (ajoutée à la main, absente du wiki), explosions d'extrémité non simulées |
| Tourelle à éclairs | 5 tirs de N éclairs (4 à 9 selon les points investis), perçants | corrigé : durée de 12 s (13 volées), 5 éclairs fixes à 60 % des dégâts. Supposé : 22 images entre deux tirs, portée de détection 4 yards |
| Sillage de feu | 5 vagues de 16 yards de long sur 12 de large | corrigé : impulsion circulaire de 5,6 yards de diamètre pendant 12 s |
| Furie des lames | UNE lame (75 % de l'arme ajoutés, score d'attaque), 29,75 yards, 1,12 s ; se divise en 3 sur un mur et une fois sur deux sur un ennemi (3 divisions au plus) ; ne perce qu'avec la chance de perforation | corrigé : trois lames perçant toujours, sans arme, sans division, coût ×3. Supposé : angles des divisions (±35°) |
| Tourelle foudroyante | 7 tirs, portée 9,375 yards | corrigé : durée de 12 s (jusqu'à 21 tirs), portée de 16 yards |
| Sillage d'enfer | 5 gerbes d'une seconde (6,66 yards), dégâts par seconde de la table | corrigé : 8 s d'impulsions toutes les 0,4 s |
| Tourelle de mort | Explose les cadavres (cible 14 yards), explosion de 14 yards de rayon, dégâts PHYSIQUES + FEU de la table + 3 à 5 % de la vie du cadavre (moitié/moitié) | corrigé : explosion de 1,65 u de rayon, dégâts de foudre seuls |
| Tourelle d'éclairs en chaîne | 7 tirs, 8 sauts, distance de saut 13,33 yards | corrigé : 5 sauts de 10 yards, durée de 12 s. Supposé : −20 % par saut (non mentionné par le wiki) |
| Bouclier de lames | 25 % de l'arme ajoutés, rayon 2,66 yards, fréquence 0,8 s → 0,4 s selon les points investis, test de toucher (40 % +15 %/niv.), 300 s | corrigé : rayon de 1,9 u, 0,25 s fixe à moitié de dégâts, aucune arme, sans test de toucher |

## Écarts non corrigés ou supposés

- **IA des ombres** (Guerrière, Maître) : le wiki décrit un double qui lance vos deux compétences actives (Maître : toute compétence, avec Venin et Bouclier de lames toujours actifs, alternance Fade / Accès de vitesse), équipé d'objets aléatoires, avec les synergies figées à l'invocation. Le jeu invoque un combattant qui frappe avec l'arme. Corriger exige que tout le code de lancement (charges, pièges, buffs) accepte un autre lanceur que le joueur.
- Parade d'arme : recharge de 4 images (0,16 s) après une parade, non simulée (supposé).
- Sentinelle de lames : explosions d'extrémité (75 % de l'arme, 4,66 yards) et score d'attaque non simulés.
- Cadence des tourelles entre deux tirs : le wiki ne la donne pas (valeurs historiques du jeu conservées).
