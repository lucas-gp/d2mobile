# Compétences de l'Amazone : comportement PD2 (wiki S13) vs jeu

Source : wiki PD2 (`x_All_Skills`, pages de compétence, journaux de saisons) et `mods/pd2/tools/skilldata/pd2-wiki.json` (tables à 60 niveaux, notes, synergies).
Convention d'échelle du jeu : 1 unité = 2 yards. Les rayons et distances du wiki sont repris tels quels (yards ÷ 2) ; les chiffres par niveau viennent de `mods/pd2/data/skills.ts` (généré par `mods/pd2/tools/skilldata/apply-pd2-wiki.py`).
Les statistiques de base des invocations (vie, défense, score d'attaque) suivent le modèle propre au jeu (échelle du niveau du personnage) : seuls les comportements, tables du wiki (nombres, plafonds, synergies) et effets spéciaux sont alignés.
Tests : `mods/pd2/tests/unit/skills-pd2-amazon.test.ts` (lancement headless de chaque compétence corrigée).

Légende « conforme ? » : oui / corrigé (écart trouvé et corrigé dans ce lot) / supposé (non vérifiable ou choix d'équilibrage assumé, laissé tel quel).

Les 29 compétences de l'arbre sont vérifiées. Les noms de la demande qui n'existent pas dans PD2 S13 (Tir de la Valkyrie, Esprit de l'Avatar, Évitement, Empaler, Œil de lynx, Cible lente / visée) ne sont pas dans le wiki : Évitement et Empaler ont été retirés en S1 (fusionnés dans Esquive et Maîtrise du javelot et de la lance). Tous les chiffres par niveau (dégâts, mana, nombres, durées, gel, AR) étaient déjà identiques au wiki ; les écarts trouvés sont des comportements et des tables manquantes.

Constat général : Pierce / carquois — la chance de perforation (compétence + objets, `pierceChance` des carquois) s'applique à toutes les flèches et à tous les javelots lancés par `fireWeapon` ; les carreaux (`piercePhys`) et Pénétration agissent par la résistance physique ennemie du joueur (Pénétration n'abaissait pas la résistance physique : corrigé). Les propriétés de carquois non simulées sont celles que `quivers.ts` liste déjà.

## Arc et arbalète

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Flèche magique | 75 % de l'arme dont 50 % convertis en magie + dégâts magiques ajoutés ; **perce toujours** ; 1 flèche de plus tous les 5 points durs ; synergies 20 % (Vue intérieure, Ralentissement, Flèche guidée) | corrigé : 100 % de l'arme, aucune conversion, ne perçait pas (flèche perdue sur la première cible). Nombre de flèches et tables déjà conformes |
| Flèche de feu | 50 % de l'arme dont 50 % convertis en feu ; portée 12 yards ; laisse un **sol en feu** (rayon 1,33 yard, 1,48 s, dégâts par seconde de « Burning Damage ») ; synergie Flèche magique 15 % feu + 18 % brûlure, Flèche immolatrice 15 % feu seulement ; 2 flèches +1 tous les 3 niveaux | corrigé : 100 % de l'arme avec conversion D2 de 3 % +2 %/niveau, brûlure sur la cible (pas de sol), brûlure gonflée par Immolation, portée 13 u. Le sol se cumule d'une flèche à l'autre (supposé : objets indépendants) |
| Flèche de froid | 50 % de l'arme dont 50 % convertis en froid ; portée 13,33 yards ; froid **4 s fixes** ; 2 flèches +1 tous les 4 niveaux | corrigé : 100 % de l'arme, conversion D2, froid de 4 s + 1,2 s/niveau (74 s au niveau 60), portée 13 u |
| Tir multiple | Portée 17,33 yards ; chaque ennemi traversé retire **20 % des dégâts d'origine, plancher 20 %** (100, 80, 60, 40, 20, 20…) ; 3 flèches +1/niveau (24 au plus) | corrigé : perte multiplicative ×0,8 (100, 80, 64, 51…) et portée 13 u. Les 3 flèches centrales qui déclenchent les effets : non modélisé (supposé) |
| Flèche explosive | Explosion principale 2 à 5,33 yards **selon les points durs** ; N explosions secondaires de 2 yards (3 à 8 selon le niveau), une toutes les 2 images, jusqu'à 6,66 yards de l'impact | corrigé : rayon fixe 2 u (4 yards), 3 secondaires fixes en couronne à 1,8 u. Dégâts des secondaires (25 %) : supposé, non donné par le wiki |
| Flèche de glace | Portée 12,66 yards ; gel **1 s fixe**, +1,25 image par point de Flèche de froid et par point de Flèche de gel (3 s au plus) ; touchée par la Perforation | corrigé : gel de 2 s +0,2/niveau (D2), synergies de durée absentes, portée 13 u |
| Flèche guidée | Portée 25,33 yards ; **touche toujours** ; traverse **2 ennemis au plus** ; 50 % de l'arme ; +1 % de dégâts convertis en magie par 2 points de Flèche magique | corrigé : 100 % de l'arme, pouvait rater, perçait sans limite, pas de conversion, portée 16 u. Coût de mana plancher 1 déjà en place |
| Flèche immolatrice | Explosion 2,66 yards ; sol brûlant 2 yards, **2 s** ; **aucune recharge** ; synergies sur explosion ET brûlure | corrigé : recharge de 1 s (ajoutée à la main, absente du wiki), explosion 4,4 yards, sol de 4 yards pendant 4 s |
| Mitraille | Portée 18,66 yards ; 2 à 5 cibles ; 100 % de l'arme (+% de la table), synergie Pénétration 10 %/niveau | corrigé : cibles cherchées à 13 u et flèches de 13 u de portée (désormais 9,33 u). Reste conforme : nombre de cibles, dégâts, AR, synergie |
| Flèche de gel | Gèle **0,48 s** (12 images) ; rayon 2,66 à 6 yards selon les points durs | corrigé : gel de 2 s, rayon fixe 1,65 u (désormais 1,33 à 3 u) |

## Passifs et magie

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Vue intérieure | Rayon 6,66 → 20 yards (+0,66/niveau), défense ennemie −X, **score d'attaque ennemi −10 % −1 %/niveau (40 % au plus)**, durée 8 s +4 s/niveau, mana 5 | corrigé : rayon fixe 13 yards (+3 u de marge), aucune réduction du score d'attaque |
| Coup critique | Chance de table (75 % au plus) ; coup ×2 | oui |
| Esquive (Dodge) | Esquive mêlée et projectiles quand l'Amazone attaque ou reste immobile ; **récupération après un coup +5 à +64 %** ; **0,16 s (4 images) entre deux esquives** | corrigé : ni bonus de récupération ni délai de 4 images (esquives en rafale possibles) |
| Ralentissement | Rayon 12 → 16 yards, ralentit marche (−20 % →) ET **vitesse des projectiles ennemis (−25 % → −75 %)**, 10 s +0,2 s/niveau | corrigé : rayon fixe 13 yards (+3 u de marge), projectiles non ralentis |
| Pénétration | Score d'attaque + **résistance physique ennemie −1 % tous les 2 points durs (−10 % au plus)**, ne casse pas l'immunité physique | corrigé : la résistance physique n'était pas abaissée |
| Leurre (Decoy) | Double **immobile qui tire des flèches** (« Strafe ») à 20,66 yards, 30 s, dégâts physiques fixes de la table, synergies Mitraille et Valkyrie 10 %/niveau, 1 à 3 leurres, **bénéficie de vos points durs de Coup critique, Perforation, Pénétration** ; résistances 5 %/niveau (85 % au plus) | corrigé : portée d'attaque de 1,5 u (il ne tirait jamais), cibles cherchées autour du joueur, aucune synergie, pas de critique ni de perforation, aucune résistance. Cadence (1 volée / 0,48 s sur une cible) et nombre de cibles par volée : supposé |
| Dérobade (Evade) | Esquive tout en marchant (table 6 → 40 %), **vitesse de marche et de course +15 % → 101 % (sans plafond)**, 0,16 s entre deux esquives | corrigé : aucun bonus de vitesse, pas de délai |
| Valkyrie | Cooldown **1 s** ; **attaque avec Frappe puissante** (niveau de table 5 → 35 : éclair + nova de 4,3 yards) ; synergies : Leurre +15 % de dégâts/niveau, Perforation −2 % de résistance à la foudre/niveau, Pénétration +40 AR/niveau, Frappe puissante +20 % à la nova/niveau, Coup critique ; résistances 3 → 20 % ; 1, 2 (niv. 20) puis 3 (niv. 30) | corrigé : recharge de 6 s, simples coups de mêlée sans foudre, aucune synergie, aucune résistance. Vie, défense, dégâts de base : modèle du jeu (inchangé) |
| Perforation (Pierce) | Chance de traverser (20 % → 100 %), s'applique à tous les projectiles | oui (Magic Arrow et Guided Arrow percent en plus : voir plus haut) |

## Javelot et lance

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Estoc | 3 coups sur la même cible, bonus de dégâts de la table pour chaque coup, synergie Parade 15 % | corrigé : coups 2 et 3 réduits de 15 % (non mentionné par le wiki) |
| Maîtrise du javelot et de la lance | Dégâts +40 % +12 %/niveau, **multiplicateur de coup critique +10 % +1 %/niveau** (additif aux ×2, toutes armes) ; synergies poison | corrigé : le multiplicateur de coup critique n'existait pas |
| Frappe puissante | Éclair ajouté + nova de 4,3 yards (table propre), synergies 20 % | oui |
| Javelot empoisonné | Poison sur 1 s, laisse une traînée de nuages toxiques, synergies 24 %, sans recharge | corrigé : recharge de 0,6 s (ajoutée à la main) supprimée. Traînée de nuages (densité et durée inconnues) : non modélisée (supposé) |
| Javelot de foudre | 100 % de l'arme ajoutés, 100 % converti en foudre, dégâts de la table, synergies 15 % | oui |
| Frappe chargée | Éclairs chargés qui **traversent** les ennemis (nombre selon le niveau) | supposé : éclairs instantanés sur les ennemis proches (équivalent au tir en rafale perforant, non vérifiable plus finement) |
| Javelot de peste | Nuage de **6 yards** qui s'étend à l'impact, poison 3 s, **recharge 1 s**, synergies 12 % | corrigé : le nuage ne se déclenchait jamais (le projectile était un Javelot empoisonné), rayon 2,6 u, recharge 4 s (désormais nuage 3 u, 1 s) |
| Parade (Fend) | **3 attaques**, zone de dégâts de mêlée +20 / +40 / +60 %, toutes les cibles adjacentes, synergie Estoc 20 % | corrigé : une seule attaque (5 cibles au plus), sans agrandissement de zone |
| Frappe foudroyante | Chaîne de 10,66 yards, 4 à 10 rebonds, synergies 8 % | corrigé : distance de chaîne de 12 yards (désormais 5,33 u, 10,66 yards) |
| Furie de la foudre | Éclairs à **chaque impact** (y compris les perforations), 1 sur l'ennemi touché + 1 par autre ennemi à moins de 10 yards (10 à 22 au plus), traverse **6 ennemis au plus** | corrigé : éclairs libérés une fois (en fin de vol), rayon de 12 yards, aucune limite de perforation |
