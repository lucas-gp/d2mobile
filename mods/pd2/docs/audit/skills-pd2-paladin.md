# Compétences du Paladin : comportement PD2 (wiki S13) vs jeu

Source : wiki PD2 (`x_All_Skills`, pages de compétence, journaux de saisons, `Patch_Notes`) et `mods/pd2/tools/skilldata/pd2-wiki.json` (tables à 60 niveaux). Convention du jeu : 1 unité = 2 yards. Les chiffres par niveau viennent de `mods/pd2/data/skills.ts` (généré par `mods/pd2/tools/skilldata/apply-pd2-wiki.py`).
Tests : `mods/pd2/tests/unit/skills-pd2-paladin.test.ts` (lancement headless de chaque compétence corrigée).
Légende « conforme ? » : oui / corrigé / supposé (non vérifiable ou choix assumé, laissé tel quel) / non corrigé (raison donnée).

Les 33 compétences de l'arbre sont vérifiées. Les chiffres (dégâts, mana, durées, synergies, tables) étaient déjà ceux du wiki ; les écarts trouvés sont des comportements ou des champs de table jamais branchés.

## Combat

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Zèle | 3 coups, zone de mêlée +20/40/60 % par coup, synergie Sacrifice 20 % | oui (3 coups échelonnés, zone par coup) |
| Éclair sacré | Perce ennemis ET alliés, soigne les alliés, +1 projectile aux niveaux 15 et 25, aucun bonus aux morts-vivants | corrigé : le projectile s'arrêtait sur le premier allié soigné et ne perçait pas. Le jeu ne l'arrête plus et le marque « perçant ». |
| Châtiment | Coup de bouclier, touche toujours, étourdit ; pas de recul en PvE ; coup écrasant 5 % au niveau 1 + 1 %/point investi, efficacité (15 % + 2 %/niv.) ; dégâts de zone | corrigé : repoussait la cible ; aucun coup écrasant ni efficacité. La zone de mêlée était déjà appliquée. |
| Sacrifice | Coût en vie ÷ réduit par la réduction physique ; la cible tuée explose (125 % du surplus + 5 % de sa vie, rayon de la table) ; synergies Rédemption/Fanatisme 25 % | oui (explosion déjà ajoutée) ; supposé : la réduction de dégâts physiques ne diminue pas le coût en vie |
| Lumière sacrée | Rayon 4 yards autour de la cible (ciblée, allié ou ennemi) ; sur un allié : soin entier, dégâts ÷ 2 ; sur un ennemi : dégâts entiers, soin ÷ 2 | corrigé : gerbe de 9 yards autour du Paladin, soin toujours ÷ 2, dégâts toujours entiers |
| Charge | Se rue sur la cible ; zone de mêlée +20 % à 2,66 yards, +40 % à 5,33, +60 % à 8 de distance parcourue ; synergies Vigueur/Puissance 15 % | corrigé : aucune zone selon la distance |
| Vengeance | Coup d'arme + explosion de feu, froid et foudre de 4,66 yards sur la cible ; 100 % de la part physique de l'arme + éléments des objets + table, × (« Elemental Damage +% » + synergies) ; chaque ennemi touché propage l'explosion (chance 22 % + 2 %/niv., plafond 95 %, saut de 4,66 yards, 16 yards au plus), sans délai entre deux touches ; froid 3,2 s | corrigé : un seul ennemi touché, table plate ajoutée aux dégâts physiques, pas de conversion ni de propagation |
| Marteau béni | Marteau spirituel en spirale, perçant ; Concentration +% (porteur seul) ; synergies Visée bénie/Vigueur 12 % | oui (spirale, perçant, Concentration). Supposé : +150 % aux morts-vivants conservé (le wiki dit seulement que l'infobulle ne l'affiche plus à tort) |
| Bouclier sacré | Dégâts de Châtiment ajoutés, défense, chances de blocage, durée ; synergies Châtiment/Défi 5 % | oui |
| Joute | Téléportation sur l'ennemi ; recharge de la table (4,08 s au niveau 1, 1,52 s dès le niveau 25) ; +vitesse de déplacement pendant 2 s ; chance de critique de la table | corrigé : pas de recharge, pas de bonus de vitesse. Téléportation et critique déjà présents. |
| Épée sacrée | Parade avec une épée à deux mains, dégâts aux morts-vivants/démons, 4 images entre deux parades, plafond 75 %, parade + 1/5 du blocage | supposé : le jeu n'a aucune épée à deux mains, la parade s'applique avec toute arme (non modifié) ; le 1/5 du blocage n'est pas ajouté |
| Poing des cieux | Foudre sur la cible + 4 Éclairs sacrés qui ne soignent pas ; synergies 11 % | supposé : jusqu'à 4 éclairs sur d'AUTRES ennemis + 1 sur la cible (soit 5), le nombre exact par cible n'est pas décrit par le wiki |
| Nova sacrée | Anneau qui blesse les ennemis et soigne les alliés ; recharge 4 s ; soin de la table | oui (recharge 4 s, soin ; le rayon de 10 yards n'est pas donné par le wiki : supposé) |

## Auras défensives

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Prière | Soigne le groupe toutes les 2 s (coût de mana) ; vie rendue à chaque coup porté (table) ; régénération passive par points durs | corrigé : « Life After Each Hit » absent (nouvelle statistique `lifeAfterHit`, appliquée à chaque coup de mêlée du Paladin) |
| Résistances au feu / froid / foudre | Résistance du groupe, dégâts élémentaires du porteur, résistance maximale passive pour le porteur seul | oui |
| Défi | Défense, réduction des dégâts physiques (% et fixe) | oui |
| Purification | Réduit poison et malédictions | supposé : réduction continue à l'application et non par « pulsation » toutes les 2 s |
| Vigueur | Vitesse de déplacement (active) + passive par points durs | oui |
| Méditation | Récupération de mana + mana par mort passive | oui |
| Rédemption | Rayon 10,6 yards, seul le porteur récupère vie/mana, pas sur cadavres profanés | oui |
| Salut | Résistances + dégâts élémentaires | oui |

## Auras offensives

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Puissance | « Your Damage » au porteur, « Ally Damage » (≈ moitié) aux alliés | oui |
| Feu sacré | Dégâts de feu de l'aura chaque seconde (rayon de la table 4 → 9,33 yards), feu ajouté aux coups, score d'attaque | corrigé : rayon de 8,3 unités au niveau 20 (D2) au lieu de 4,66 ; score d'attaque de la table jamais appliqué |
| Épines | Dégâts renvoyés + blessures ouvertes | oui. Supposé : les dégâts de blessures ouvertes de l'aura ne sont pas modélisés en table distincte |
| Visée bénie | Score d'attaque, frappe mortelle, défense ennemie passive | oui |
| Concentration | Dégâts du porteur/alliés, Marteau béni, 20 % d'attaque ininterrompable, score d'attaque | corrigé : score d'attaque de la table jamais appliqué |
| Gel sacré | Rayon 8 yards, froid chaque seconde, ralentit les ennemis, froid ajouté, score d'attaque | corrigé : rayon 2 + 0,33/niv. au lieu de 4 ; score d'attaque absent |
| Choc sacré | Rayon 10,66 yards, foudre chaque seconde, foudre ajoutée, score d'attaque | corrigé : rayon, score d'attaque |
| Sanctuaire | Rayon 12 yards ; magie chaque seconde à tous les ennemis ; réduit leur résistance magique ; le porteur ignore la résistance/immunité physique des morts-vivants (sauf Maux suprêmes) | corrigé : rayon ; ignore-physique des morts-vivants absent ; score d'attaque absent |
| Fanatisme | Dégâts, vitesse d'attaque, score d'attaque (porteur + alliés) | oui |
| Conviction | Réduit défense et résistances des ennemis DANS SON RAYON (14,67 yards au niveau 1) ; casse les immunités à ½ | corrigé : agissait sur tous les monstres de la zone, quelle que soit la distance |

## Chaînes à traduire (FR → EN)

Voir le rapport de lot (mêmes textes que `src/data/skills-paladin.ts`).
