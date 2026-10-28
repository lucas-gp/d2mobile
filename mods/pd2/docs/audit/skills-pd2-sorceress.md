# Compétences de la Sorcière : comportement PD2 (wiki S13) vs jeu

Source : wiki PD2 (`x_All_Skills`, pages de compétence, journaux de saisons) et `mods/pd2/tools/skilldata/pd2-wiki.json`.
Convention d'échelle du jeu : 1 unité = 2 yards, mais les rayons d'effet du jeu sont volontairement ~1,3 à 1,5 fois plus larges (lisibilité) : non traité comme écart.
Tests : `mods/pd2/tests/unit/skills-pd2-sorceress.test.ts` (lancement headless de chaque sort).

Légende « conforme ? » : oui / corrigé (écart trouvé et corrigé dans ce lot) / supposé (non vérifiable ou choix d'équilibrage assumé).

## Feu

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Trait de feu | Projectile, 18,75 yd, dégâts de zone sur 2 yd à l'impact (S12) | corrigé : explosion de 1 u à l'impact (avant : cible seule) |
| Chaleur | Passif : régén. de mana % + score d'attaque % ET plat (10 + 10/niv) | corrigé : le plat manquait |
| Inferno | Cône canalisé, −(4+niv) % résistance feu (plafond 45), tant que touché + 0,4 s, casse l'immunité | corrigé : réduction plafonnée à 45 (avant : table du Champ statique) ; durée = jet + 0,4 s (avant 2 s fixes) |
| Embrasement | Explosion à la cast (3,33 yd, brûlure 1,4 s), traînée (brûlure 2,4 s), vitesse, recharge 2 s, impossible à geler | corrigé : traînée 2,4 s (avant 3 s) ; « impossible à geler » ajouté |
| Boule de feu | Projectile explosif 3,33 yd | oui (rayon : choix de jeu) |
| Mur de feu | Mur perpendiculaire, 3 s, recharge 1,52 s, brûlure/s | oui |
| Hydre mineure | Tourelle (5 s), traits de feu 15 yd, 3 hydres partagées avec Hydre, pas de pénétration de rés. | corrigé auparavant (durée 5 s) ; vérifié |
| Enchantement du feu | Arme + alliés, 300 s, 1/2 pour alliés | oui (pas de groupe dans le jeu : supposé) |
| Météore | Chute, physique + feu + sol brûlant 1,6 s, recharge 0,52 s | oui |
| Combustion | Anneau de boules de feu dans toutes les directions, recharge 2,52 s | oui (lot précédent) |
| Maîtrise du Feu | +20 % +4 %/niv, pénétration 1 %/niv (plafond 30), ne casse pas l'immunité | oui |
| Hydre | Tourelle (5 s), boules de feu PERFORANTES (S13), zone réduite (2 yd), max 3 | corrigé : boules perforantes qui explosent sur chaque cible (avant : explosion au premier ennemi) |

## Froid

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Trait de glace | Projectile 16,88 yd, ralentit, zone de 2 yd à l'impact (S12) | corrigé : explosion de 1 u |
| Enchantement du froid | Arme + alliés, 300 s | oui |
| Nova de givre | Anneau instantané autour de la Sorcière, ralentit | oui |
| Explosion de glace | Gèle, PERFORE, 19,69 yd | corrigé : perfore (avant : s'arrêtait au premier) |
| Armure de frisson | Défense, gèle/blesse les attaquants de mêlée (froid 4 s +0,2/niv), +10 % récup. au blocage +2 %/point (S12) | corrigé : durée de froid du wiki, récup. au blocage |
| Pointe glaciale | Gel 2 s FIXE, jusqu'à 4 s avec synergie Blizzard (5 %/niv), zone 4 yd | corrigé : gel 2 s fixe (avant 1,6 + 0,05/niv) |
| Blizzard | 2 s, recharge 0,92 s, 1 éclat toutes les 2 images à rayon aléatoire | supposé : durée et recharge conformes ; cadence/dégâts d'éclat (2 éclats / 3 images à 60 %) = étalonnage assumé (le passer à 100 % fait monter la médiane de morts du bot froid de ~0,1) |
| Barrage de glace | 3 à 5 lances (points durs 0-2 : 3, 3-5 : 4, 6+ : 5), pas de perforation, explosion de zone (4,6 yd), froid 0 s +0,12 s/niv | corrigé : explosion à l'impact (avant : aucune zone), durée de froid |
| Armure glaçante | Défense, +5 % blocage +1 %/point (S12), riposte à CHAQUE attaque à distance par une pointe de glace, refroidit les attaquants de mêlée | corrigé : riposte à distance (absente), blocage avec bouclier, durée de froid |
| Orbe gelé | Orbe 1,8 s qui sème des traits, SANS recharge, cadence de sort « lente » (images de la Foudre) | corrigé : recharge 1 s supprimée ; cadence lente (avant : cadence normale + recharge) |
| Maîtrise du Froid | +10 % +2 %/niv, pénétration 5 % +1 %/niv, plafond 45 | corrigé : pénétration 5 % +1 %/niv (avant 4 % +1 %) |

## Foudre

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Charge électrique | Éclairs erratiques perforants, 3 +1/niv (max 28) | oui |
| Champ statique | −25 % PV actuels au-dessus de 55/70/85 %, rés. foudre −(4+niv) (palier ½ après 22), 5 s +0,2 s/point de Maîtrise (max 9 s) | corrigé : durée (avant 4 s) ; palier de la table (arrondi supérieur) |
| Télékinésie | Frappe à distance, 35 % de chances de repousser, ramasse un objet | corrigé : repousse 35 % (avant : toujours) |
| Nova | Anneau instantané | oui |
| Foudre | Perfore tout sur la ligne, cadence de sort NORMALE | corrigé : cadence normale (avant : lente) |
| Téléportation | Saut ; sorts −50 % (+1 %/niv, jusqu'à 0) pendant 1 s | oui |
| Éclair en chaîne | 6 à 14 rebonds (max niv. 31), cadence lente | oui |
| Tempête de foudre | Foudre sur un ennemi proche + nova ; délai 2 s −0,04 s/point (plancher 1 s) | corrigé : délai (avant 0,05 s/point, plancher 0,4 s) ; rayon de la nova d'impact (3,1 u dans le wiki, 1,5 u ici) : supposé |
| Bouclier d'énergie | 15 % +2 %/niv (max 90), mana ×(34−pts)/16, reste actif à 0 mana, pas de poison | oui |
| Maîtrise de la Foudre | +50 % +10 %/niv, aucune pénétration | oui |

## Écarts non traités (supposés / non vérifiables)

- Rayons d'effet (échelle de jeu) ; vitesse croissante des éclairs de la Charge électrique ; « délai de 3 images entre deux touches » des boules d'Hydre.
- Enchantements : bonus aux alliés (1/2) et aux renaissances (1/10) sans objet sans groupe.
- Hydre : le jeu ajoute les dégâts de l'Enchantement du feu aux hydres (non confirmé par le wiki).
- Récupération de 1,6 s de l'Hydre (D2 vanilla), non mentionnée par le wiki PD2.
