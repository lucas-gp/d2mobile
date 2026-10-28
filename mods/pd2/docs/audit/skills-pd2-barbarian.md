# Compétences du Barbare : comportement PD2 (wiki S13) vs jeu

Source : wiki PD2 (`x_All_Skills`, pages de compétence, journaux de saisons, `Patch_Notes`) et `mods/pd2/tools/skilldata/pd2-wiki.json` (tables à 60 niveaux). Convention du jeu : 1 unité = 2 yards. Les chiffres par niveau viennent de `mods/pd2/data/skills.ts` (généré par `mods/pd2/tools/skilldata/apply-pd2-wiki.py`).
Tests : `mods/pd2/tests/unit/skills-pd2-barbarian.test.ts` (lancement headless de chaque compétence corrigée).
Légende « conforme ? » : oui / corrigé / supposé (non vérifiable ou choix assumé, laissé tel quel) / non corrigé (raison donnée).

Les 29 compétences de l'arbre sont vérifiées. La refonte du lot compétences (dégâts, mana, synergies, Frénésie à 5 charges, Concentration à conversion magique, Berserk physique, cris de 300 s, Ordres de bataille à vie et mana fixes, Cri de bataille sur la résistance physique) colle déjà au wiki. Les écarts trouvés sont des tables jamais branchées (rayons, distance, vitesse, efficacité, perforation) et des comportements (armes exigées, recul, deuxième cible, retour du lancer).

## Combat

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Coup violent | Coup puissant, dégâts fixes + % + précision ; 75 % de chances de recul (sinon aucun) ; synergies Étourdissement/Concentration 20 % | corrigé : repoussait toujours la cible |
| Double coup | Avec deux armes : frappe DEUX cibles si possible, sinon une cible deux fois ; synergies Frénésie/Étourdissement 20 % | corrigé : la seconde arme frappait toujours la même cible |
| Étourdissement | Dégâts physiques propres + 25 % de l'arme, étourdit dans 3,33 yards autour de la cible, durée de la table, synergie Concentration en précision | oui |
| Bond | Saute jusqu'à 15,3 yards (niveau 1) à 26,7 yards (table « Leap Distance »), repousse dans le rayon des points investis (4,7 à 10 yards), 5 de mana | corrigé : distance 4,6 yards au niveau 1 (valeur de D2) au lieu de 15,3 ; la table n'était pas branchée |
| Attaque du bond | Bondit et frappe tout dans 5,33 yards, dégâts tirés par monstre, peut voler de la vie, synergies Bond/Coup violent 10 % | oui. Supposé : distance minimale de 4 yards non modélisée (la compétence bondit dès 3,2 yards) |
| Concentration | Ininterrompable, défense, conversion physique→magique 30 % +2 %/point investi, zone de mêlée +20 % ; la part magique n'est pas ajoutée à la zone (limite connue du jeu PD2) ; synergies Coup violent/Commandement 25 % | oui |
| Frénésie | Deux armes exigées ; 5 charges au plus à tous les niveaux (vitesse d'attaque, de déplacement, zone de mêlée de la Frénésie elle-même) ; durée 15 s + 2 s/point investi ; mana 1 + 0,25/niveau | corrigé : jouable avec une seule arme. Reste conforme : charges, durées, zone par charge, rythme à deux armes |
| Tourbillon | Un coup toutes les 5 images (10 images, deux frappes espacées de 5), deux armes : deux coups toutes les 6 images ; ne profite pas de la vitesse d'attaque ; vitesse du tourbillon (table « Whirlwind Velocity », 0 à 65 %) ; cible la plus proche | corrigé : la vitesse de la table n'était pas appliquée (balayage de longueur fixe). Rythme déjà conforme. Supposé : cible choisie à la main par le joueur, pas de « plus proche » automatique |
| Berserk | Deux armes exigées ; dégâts PHYSIQUES +150 %…, perce la résistance physique (table, 45 % au plus) SANS briser l'immunité ; défense −25 % et réduction physique −10 % pendant 0,52 s ; zone +20 % ; synergies Provocation/Réflexes 12 % | corrigé : jouable avec une seule arme ; le perçage brisait les immunités physiques (comme le Cri de bataille). Description FR parlait encore de « dégâts magiques » |
| Double lancer | Deux armes de jet, rebonds de 10 yards (3 à 8 selon le niveau), pas affecté par la perforation, synergies 6 % | oui. Supposé : la chance de perforer de la Maîtrise du lancer s'applique aussi aux deux projectiles de départ (le rebond simulé, lui, ne perfore pas) |
| Lancer fractionné | Divise l'arme principale de jet en 3 à 7 projectiles qui reviennent vers le Barbare à bout de portée (toujours perforants, 30 % des dégâts, peuvent toucher plusieurs fois) ; à l'aller, pas de « fusil à pompe » (une cible ne reçoit qu'un projectile) ; synergies Concentration/Vitesse accrue 12 % | corrigé : les projectiles ne revenaient pas et pouvaient tous toucher la même cible |

## Maîtrises

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Maîtrise à une main | Toute arme de mêlée tenue à une main : dégâts, précision, critique (×2), zone de mêlée +1 %/niveau jusqu'à 20 % | oui |
| Maîtrise à deux mains | Arme tenue à deux mains : dégâts, précision, coup dévastateur (chance ET efficacité 10 à 25 %), zone de mêlée +20 % au niveau 1 puis +1 %/niveau (40 % au plus), plus de critique | corrigé : l'efficacité du coup dévastateur n'était pas appliquée. Supposé : le jeu distingue 1 main / 2 mains par le type de l'arme (le Barbare PD2 peut tenir une arme à deux mains d'une seule main : non modélisé) |
| Maîtrise du lancer | Dégâts, précision, critique (×2), chance de perforer (15 à 81 %) | corrigé : la chance de perforer de la table n'était pas appliquée |
| Réflexes de combat | Vie par niveau, endurance, récupération après un coup par point investi (2 %/point, 40 % au plus) | oui |
| Peau de fer | Défense % + réduction des dégâts physiques par point investi (10 % au plus) | oui |
| Vitesse accrue | Vitesse de marche (13 à 50 %) + vitesse d'attaque par point investi (2 %/point, 40 % au plus), cette dernière étant de la vitesse d'attaque d'OBJET | corrigé : comptée comme vitesse de compétence (pas de rendements décroissants) |
| Blessures profondes | Passif : chance d'ouvrir une blessure + dégâts de saignement par seconde (table), synergie Fétiche sinistre 4 % | oui. La description FR disait « ne récupère plus de vie » (non indiqué par le wiki) : texte corrigé |
| Résistance naturelle | Toutes les résistances (11 à 75 %) | oui |

## Cris de guerre

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Hurlement | Les monstres fuient 3 s ; rayon 4 yards au niveau 1 (table « Howl Radius ») ; sans effet sur champions, uniques, boss | corrigé : rayon de 16 yards au niveau 1 (valeur de D2 prise pour des unités) ; les champions fuyaient |
| Trouver une potion | Sur un cadavre : chance de la table, 60 % soin / 30 % mana / 10 % rajeunissement | oui |
| Clameur | Défense du groupe, 300 s, rayon 12,5 yards | oui pour le Barbare. Non corrigé : le mercenaire ne reçoit pas le bonus (aucune notion de groupe pour les cris, hors périmètre) |
| Cri de guerre | Dégâts physiques de zone (rayon 5,33 yards au niveau 1, 10 au plus), plus d'étourdissement mais une réaction de récupération ; synergies 13 à 17 % | corrigé : rayon de 12 yards constant ; étourdissement de 1 à 5 s au lieu d'une brève réaction (désormais 0,24 s comme les ondes de choc de la Druide) |
| Provocation | Zone de 10,66 yards ; les ennemis attaquent le Barbare (même archers et lanceurs), perdent dégâts et précision (table), durée de la table (2 à 7 s) | corrigé : la table dépassant 100 % aux niveaux élevés pouvait donner des dégâts négatifs ; plafonnée à 100 %. Reste conforme pour le reste |
| Trouver un objet | Sur un cadavre : chance de la table (6 à 40 %) ; objet 5 % magique, 15 % supérieur | oui. Supposé : l'objet supplémentaire est tiré comme un butin normal (les qualités magique/supérieur ne sont pas forcées) |
| Cri de bataille | 12 s, 8,5 yards ; défense −15 à −30 %, résistance physique de la table ; peut briser l'immunité physique ; plus de peur | oui. Description FR fausse (« effraie ») : corrigée |
| Ordres de bataille | Vie et mana maximums fixes (15 vie et 7,5 mana par niveau), 300 s, 12,5 yards, plus d'endurance | oui pour le Barbare (le mercenaire ne profite pas du cri) ; description FR parlait encore d'endurance : corrigée |
| Fétiche sinistre | Fétiche de 40 s sur un cadavre, aura alliée (dégâts et score d'attaque) de rayon 10,66 yards +0,66/niveau ; lançable à distance ; ne fait plus fuir | oui. Description FR parlait encore de peur : corrigée |
| Commandement de bataille | +1 niveau à toutes les compétences (+1 tous les 10 points investis), dégâts de la table, 300 s, 12,5 yards | oui |

## Chaînes à traduire (FR → EN)

Voir le rapport de lot (descriptions modifiées de `src/data/skills-barbarian.ts`).
