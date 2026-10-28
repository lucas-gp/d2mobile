# Compétences du Nécromancien : comportement PD2 (wiki S13) vs jeu

Source : wiki PD2 (`x_All_Skills`, pages de compétence, journaux de saisons) et `mods/pd2/tools/skilldata/pd2-wiki.json`.
Convention d'échelle du jeu : 1 unité = 2 yards. Les rayons d'effet sont repris du wiki tels quels (yards ÷ 2) pour les malédictions, la Profanation et l'Explosion de cadavre ; les autres gardent leur marge de lisibilité (non traité comme écart).
Les statistiques de base des invocations (vie, dégâts, score d'attaque) suivent un modèle propre au jeu (échelle du niveau du personnage + coefficient d'équilibrage `NEC_BOOST` pour compenser l'absence d'objets d'invocation) : seuls les comportements, les tables du wiki (maîtrises, synergies, plafonds) et les effets spéciaux sont alignés.
Tests : `mods/pd2/tests/unit/skills-pd2-necromancer.test.ts` (lancement headless de chaque compétence corrigée).

Légende « conforme ? » : oui / corrigé (écart trouvé et corrigé dans ce lot) / supposé (non vérifiable ou choix d'équilibrage assumé).

## Invocation

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Squelette (guerrier) | Cadavre requis, jusqu'à 8 (table par niveau), dégâts de zone de mêlée, synergies Maîtrise des squelettes 6 % et Archer 2 % | corrigé : dégâts de zone (absents), synergies de dégâts jamais appliquées aux invocations |
| Maîtrise des squelettes | +15 de vie par niveau, +2 dégâts de base, vitesse guerriers (+1 %/niv.) et mages/archers, dégâts élémentaires des mages ; plus d'effet sur les ressuscités (S1) | corrigé : vie 15/niv. (8 avant), vitesses ajoutées, bonus sur les ressuscités retiré. Dégâts élémentaires des mages : appliqués |
| Mage squelette | Élément au hasard, projectile qui TRAVERSE (S1), nombre selon les points durs, synergie Maîtrise | corrigé : projectile perforant (avant : s'arrêtait au premier) ; synergie appliquée. Niveau du missile « Necromage » : modèle de dégâts propre au jeu (supposé) |
| Squelette archer | Flèche PHYSIQUE, 100 % de perforation, portée 16 yards, nombre selon les points durs | corrigé : tirait des traits de FROID sans perforation ; flèche physique perforante, portée 8 u |
| Golem d'argile | Recharge 1 s, ralentit (3 % au niv. 1, 18 % au niv. 12), 20 % de coup écrasant (S10), dégâts de zone, synergies 40 %/pt | corrigé : ralentissement (11-63 % avant), coup écrasant, dégâts de zone (rayon 1,67 u : supposé), synergies, recharge |
| Maîtrise des golems | Vie +10 %/niv., score d'attaque, vitesse (table), un golem de plus tous les 5 points (tous types confondus) | corrigé : vie +10 %/niv. (20 avant) ; vitesse et plafond conformes |
| Golem de sang | Recharge 1 s, vie par coup (8 +1/niv.) à lui et au Nécromancien, blessures ouvertes (S4/S9), synergies 12 % | corrigé : vol de vie 70/30 % remplacé par la vie par coup ; blessures ouvertes (table lue comme dégâts sur 5 s : supposé) ; synergies, recharge |
| Distorsion de sang | 12 % de la vie ACTUELLE (coût minimal 2/niv., plafond 60), la vie perdue revient en 5 s, recharge 5,8 s −0,2 s/niv. | corrigé : minimum, régénération sur 5 s, recharge (aucune avant) |
| Golem de fer | 1 seul, recharge 1 s, épines 150 %+, immunisé au poison, prend les propriétés d'un objet | corrigé : immunité au poison, synergies, recharge. L'objet source n'existe pas dans le jeu (golem de base : supposé) |
| Golem de feu | Recharge 1 s, attaque de feu, aura de feu sacré de 8 yards à 1,2 s (S13), synergies 9 % | corrigé : aura 4 u (3,2 avant) toutes les 1,2 s sans coefficient réducteur, tables d'attaque et d'aura PD2, synergies appliquées à l'attaque ET à l'aura |
| Ressusciter | Jusqu'à 8 (3 au niv. 1), 5 min, +50 % de vitesse, dégâts physiques +30 %/niv., +20 %/niv. de Profanation, zone de mêlée, pas de Maîtrise des squelettes | corrigé : +50 % de vitesse, dégâts selon la table et la synergie (le bonus de Maîtrise des squelettes, interdit en PD2, retiré), zone de mêlée. Compétences des monstres ressuscités : conservées (conforme) |

## Poison et os

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Dents | 25 yards, nombre de dents par table (3 +1/niv.), synergies 24 % | oui |
| Armure d'os | Absorbe le physique (table + 3/énergie + 15/niv. Mur et Prison), recharge 2 s, +10 % de défense par point (S10) | corrigé : recharge 2 s et défense (absentes) |
| Frappe empoisonnée (Dague) | Dague/faux, poison 2 s, perce la rés. au poison, nuage de 2,66 yards au coup qui porte aussi le poison de l'équipement, nuage à la mort du porteur (S9) | corrigé : nuage au coup et à la mort (absents), poison de l'équipement ajouté (écrasé avant) |
| Explosion de cadavre | Dégâts physiques et de feu de la table + 5-10 % de la vie du cadavre (moitié/moitié), rayon 5 yards +⅓/niv. (10,66 max), synergies 10 % | corrigé : formule vanille (60 % de la vie) remplacée, rayon de la table (2,5 u au niv. 1) |
| Mur d'os | Recharge 1 s, dégâts RENVOYÉS fixes (table), synergies 5 % vie et dégâts, attire les monstres | corrigé : dégâts renvoyés, recharge, synergie de vie |
| Profanation | 5 cadavres (10 au plus, 16 s) du type de la zone, nuage de poison 4 yards/3 s chacun, cadavres utilisables par Explosion de cadavre et Ressusciter | corrigé : un nuage élargi sans cadavres (avant) ; 5 cadavres et 5 nuages indépendants (rayon 2 u, sans le coefficient ×1,5 de compensation) |
| Lance d'os | 1 lance, 2 au niv. 15, 3 au niv. 25 (éventail serré), perforante, portée 30 yards | corrigé : une seule lance quel que soit le niveau |
| Prison d'os | Recharge 5 s, dégâts renvoyés, synergies 5 % | corrigé : recharge, dégâts renvoyés, synergie de vie |
| Nova de poison | Anneau en expansion, 11,25 yards, poison 2 s, synergies 10 % | oui (rayon 6 u contre 5,6 : marge de lisibilité ; anneau instantané : cosmétique, supposé) |
| Esprit d'os | Pourchasse sa cible ou en trouve une, une seule cible, portée 44,68 yards, synergies 15 % | corrigé : portée 22 u (16 avant) |

## Malédictions

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Maîtrise des malédictions | Jusqu'à 3 malédictions par monstre (niv. 10 et 20), +0,66 yard de rayon par 3 niveaux, −1 % par deux niveaux sur les réductions | corrigé : rayon +0,25 u/niv. (≈ 0,5 yard/niv.) remplacé par +0,66 yard/3 niv. ; chaque malédiction a sa propre durée (l'expiration de l'une effaçait les effets de toutes) |
| Amplification des dégâts | Rés. physique −11 % −1 %/niv., 6 s +0,2/niv., rayon 6 yards (table par point dur) | corrigé : rayon 1 u au niveau 1 avant, 3 u maintenant |
| Vision réduite | Score d'attaque −40/niv., aveugle, rayon 4 yards | corrigé : rayon seul |
| Pacte sombre | Lancé sur un ennemi maudit ; dévore UNE malédiction (jamais la dernière) ; explosion de 2 yards +0,66/malédiction supplémentaire, +10 % de dégâts par malédiction supplémentaire ; synergies Maîtrise 16 %, Vierge de fer 16 %, autres 12 % | corrigé : était une onde autour du joueur sans lien avec les malédictions |
| Vierge de fer | Dégâts renvoyés 200 % +25/niv., 10 s, rayon 8 yards | corrigé : rayon seul |
| Drain de vie | Vol de vie 8 % +2 %/pt (+1 % par deux niv. de Maîtrise), rayon 4 yards | corrigé : bonus de Maîtrise et rayon |
| Terreur | Fuite 3 s, rayon 6 yards, déplacement −15 % −2 %/pt (−1 %/niv. de Maîtrise) | corrigé : ralentissement de déplacement (absent) et rayon |
| Affaiblissement | Dégâts −10 % −1 %/niv., DÉFENSE −10 % −2 %/niv., rayon 8 yards | corrigé : réduction de défense (absente) et rayon |
| Confusion | 20 s (÷2 en Cauchemar, ÷4 en Enfer), cadence d'attaque +50 % +10 %/niv., rayon 6 yards | corrigé : durée 20 s (10 +2/niv. avant), cadence d'attaque (absente), réduction de durée par difficulté |
| Attraction | Défense −120 −10/niv., durée plafonnée à 15 s, aucune autre malédiction ne la remplace, ÷2/÷4 de durée en Cauchemar/Enfer | corrigé : non remplaçable, durée par difficulté, rayon. Défense lue comme valeur fixe (supposé) |
| Décrépitude | Rés. physique, déplacement −10 %, cadence d'attaque et de sort −10 % (plafond −60 %, −1 %/niv. de Maîtrise), rayon 8 yards | corrigé : cadence d'attaque séparée du déplacement (une seule valeur jouait avant), plus de réduction de dégâts (retirée en PD2) |
| Résistance réduite | Résistances −11 % −1 %/niv., 8 s +1/niv., rayon 6 yards, lève les immunités | corrigé : rayon seul |
