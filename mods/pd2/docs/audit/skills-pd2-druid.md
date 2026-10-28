# Compétences du Druide : comportement PD2 (wiki S13) vs jeu

Source : wiki PD2 (`x_All_Skills`, pages de compétence, journaux de saisons) et `mods/pd2/tools/skilldata/pd2-wiki.json` (tables à 60 niveaux, notes, synergies).
Convention d'échelle du jeu : 1 unité = 2 yards. Les rayons et distances du wiki sont repris tels quels (yards ÷ 2) ; les chiffres par niveau viennent de `mods/pd2/data/skills.ts` (généré par `mods/pd2/tools/skilldata/apply-pd2-wiki.py`).
Les statistiques de base des invocations (vie, défense, score d'attaque) suivent le modèle propre au jeu (échelle du niveau du personnage) : seuls les comportements, tables du wiki (nombres, plafonds, synergies) et effets spéciaux sont alignés.
Tests : `mods/pd2/tests/unit/skills-pd2-druid.test.ts` (lancement headless de chaque compétence corrigée).

Légende « conforme ? » : oui / corrigé (écart trouvé et corrigé dans ce lot) / supposé (non vérifiable ou choix d'équilibrage assumé, laissé tel quel).

Constat général : les attaques animales (Rage sauvage, Mutilation, Rage, Griffes de feu, Furie, attaque normale en forme) contournaient `strike()` : ni dégâts de zone de mêlée, ni frappe mortelle, ni blessures ouvertes (la Faim et l'Esprit des ronces n'avaient donc aucun effet réel). Elles passent maintenant par `strike()`.

## Éléments

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Tempête de feu | Langues de feu : 3 (0 point) à 7 (20 points) selon les points durs ; dégâts brûlants | corrigé : toujours 3 langues avant (table « Number of Tendrils » inutilisée). Brûlure au sol par image (×3) : modèle impact unique conservé (supposé) |
| Souffle arctique | Jet canalisé de 8 yards (niv. 1) à 16 yards (niv. 13), résistance au froid de l'ennemi −6 % −1 %/niv. pendant le jet et 0,4 s après, brise les ennemis tués en nova de givre (4,89 yards, dégâts de la table), froid 6 s | corrigé : portée 5-6 u (10-12 yards) remplacée par la table (4 à 8 u), réduction de résistance (absente), nova de givre (absente), ralentissement 6 s (2 avant) |
| Rocher en fusion | 50 % de chances de repousser (en chaîne), explose en fin de course (4,66 yards), sol brûlant 1,48 s, vitesse 6,25 à 7,8 yards/s, distance 21 yards | corrigé : recul systématique, pas d'explosion finale, brûlure en dot de 2 s ; vitesse (7 u/s soit 14 yards/s) et portée (12 u) remplacées par la table. Il traverse toujours les ennemis (supposé) |
| Armure du cyclone | Absorbe feu/froid/foudre (table + 3 par énergie + 10/niv. de Trombe et Tornade), recharge 2 s | corrigé : recharge 2 s (absente). Synergies et absorption conformes |
| Fissure (« Éruption ») | Recharge 0,52 s, évents au hasard dans 4,66 yards pendant 2,2 s à la fréquence de la table (0,24 s → 0,16 s selon les points durs) ; chaque évent dure 3,36 s, frappe toutes les 0,2 s, rayon 2 yards | corrigé : recharge 2 s, rayon 3,5 u, 3,2 s, explosions uniques toutes les 0,16 s ; évents persistants, fréquence par points durs, rayon 2,33 u. Hausse nette des dégâts réels |
| Trombe | Plusieurs trombes (2 à 14), étourdissement, raccourcit de 0,52 s la recharge de la Rafale, mana 2 +0,125/niv. | corrigé : n'agissait pas sur la Rafale. Table de nombre, éventail et mana déjà conformes. Délai entre deux coups de 0,4 s : non modélisé (une trombe frappe une fois par cible : supposé) |
| Rafale | Nouvelle compétence PD2 : déplacement instantané vers la destination, refroidit les ennemis proches 0,48 s à l'arrivée (rayon 2,66 yards), recharge 6,32 s −0,2 s/niv. (plancher 0,52 s) | corrigé : c'était une onde de froid + recul + étourdissement autour du Druide. Portée du saut : celle de la Téléportation (supposé, non donnée par le wiki) |
| Volcan | Recharge 0,52 s, mana 12, 6 s ; cône (2 yards) qui frappe toutes les 0,24 s, débris toutes les 0,08 s pendant 5 s jusqu'à 8 yards (rayon 1,33 yard) | corrigé : recharge 4 s, mana 25+1/niv., 4 s ; impact central toutes les 0,48 s et 2 rochers. Un seul volcan à la fois : supposé (non précisé par le wiki) |
| Tornade | 3 s, 16 yards au plus, trajectoire sinueuse, dégâts au contact PUIS toutes les 0,6 s dans 2,66 yards, mana 2 +0,125/niv., raccourcit la recharge de la Rafale | corrigé : 12 u à 8 u/s (contact seul), plus de dégâts périodiques, pas de lien avec la Rafale |
| Ouragan | Rayon 6 yards, dégâts toutes les 0,8 s à TOUS les ennemis dedans, froid 8 s, mana 30 | corrigé : rayon 6 u (12 yards), 3 cibles au hasard toutes les 0,32 s, froid 1 s, mana 30+1/niv. Recharge de 6 s non mentionnée par le wiki : conservée (supposé) |
| Armageddon | Rayon 6 yards, un météore toutes les 0,36 s à un point AU HASARD, explosion 4 yards, sol brûlant 1,48 s, mana 35 | corrigé : rayon 6 u, un météore toutes les 0,4 s visant un monstre, explosion 1,4 u, pas de sol brûlant, mana 35+1/niv. |

## Métamorphoses

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Loup-garou | Dégâts +%, vitesse d'attaque +%, réduction FIXE des dégâts physiques et magiques (1 à 8) | corrigé : réduction fixe absente. Dégâts et vitesse conformes |
| Ours-garou | Dégâts +%, défense +%, vie +10 %, ininterruptible 10-30 % en frappant, zone de mêlée +20 % | corrigé : ininterruptible et zone de mêlée absents (vie, dégâts et défense conformes) |
| Lycanthropie (« Maîtrise des formes ») | Vie +% et score d'attaque +% en forme | oui |
| Rage sauvage | Dégâts +%, score d'attaque +%, charges (3 à 13), 30 s, vol de vie et vitesse par charge, zone de mêlée +2 %/charge (20 % au plus) | corrigé : zone de mêlée absente (et zone de mêlée générale des attaques animales). Vol de vie et vitesse par charge : valeurs non données par le wiki (supposé) |
| Mutilation | Charges (3 à 13), 20 s, +40 % de dégâts par charge, étourdissement 1,4 s décroissant avec les points durs jusqu'à 0,2 s | corrigé : étourdissement CROISSANT avec le niveau (0,2 à 0,6 s : à l'envers) |
| Rage | Poison 5 s, propagation 4,66 yards, score d'attaque +%, synergies 10 % (dont Lycanthropie) | corrigé : la morsure n'empruntait pas `strike()` (pas de zone de mêlée) ; propagation 2,5 u ramenée à 4,66 yards (2,33 u) |
| Griffes de feu | Chaque attaque lance une tempête de feu rapide : 4 langues, +1 par 5 points durs (8 au plus), dégâts brûlants de la table | corrigé : un coup + dégâts de feu fixes, sans tempête de feu |
| Faim | Dévore un cadavre : vitesse, vie volée (3-8 % selon points durs), blessures ouvertes (chances 24-50 %, dégâts 40-358/s), +20 % par niveau de Mutilation | corrigé : les blessures ouvertes ne se déclenchaient jamais (attaques animales hors `strike()`), dégâts des blessures et synergie absents |
| Onde de choc | 4 à 8 ondes en étoile (12 yards, 2 yards de large), étourdissement 0,24 s | corrigé : explosion de 4 u autour du Druide, étourdissement 1 à 3,3 s. Part de l'arme (50 %) : ajout du jeu conservé (supposé) |
| Furie | 3 coups, zone de mêlée +20 % / +40 % / +60 % | corrigé : +0 / +20 / +40 % (valeurs de l'ancienne version) |

## Invocations

| Compétence | Description PD2 | Conforme ? |
|---|---|---|
| Corbeaux | 2 à 12 corbeaux (+1 tous les 2 niveaux), +1 par lancer à 10 et 20 points durs, 5 coups chacun, froid pur, intouchables | corrigé : intouchables aussi pour les projectiles de zone. Nombre, coups et dégâts de froid conformes. Cadence d'attaque de 2 à 3,5 s : supposé |
| Liane empoisonnée | N'attaque pas : surgit sous la cible, plaques de poison de 2 yards (4 s) qui s'étendent (3 à 8 pousses de 2 plaques, toutes les 0,36 s), résistance au poison −5 % −1 %/niv., recharge 1 s, 1 à 3 lianes, intouchable, coexiste avec les autres lianes | corrigé : elle attaquait au corps à corps, pouvait être tuée, ne réduisait pas la résistance, et la Liane charognarde ou solaire la remplaçait. Pas d'exclusion de la pénétration du poison (supposé) |
| Liane charognarde (« Cycle de la vie ») | Recharge 1 s, rend une quantité FIXE de vie (20-40 +4/12 par niveau), +2 à +6 par niveau de Liane solaire | corrigé : pourcentage de la vie maximale remplacé par la table fixe + synergie, recharge, coexistence, intouchable |
| Liane solaire (« Lianes ») | Recharge 1 s, rend une quantité FIXE de mana, +4 à +12 par niveau de Sage du chêne | corrigé : idem (mana) |
| Cœur du glouton | Dégâts +% et score d'attaque +% (25 % +10 %/niv.), un seul esprit partagé, intouchable | corrigé : intouchable (les monstres le visaient). Rayon d'aura (20 à 47 yards) : le jeu applique au Druide et à ses créatures (supposé) |
| Esprit des ronces | Dégâts fixes renvoyés (table), frappe mortelle 8 % +1 %/niv. avec plafond +1 % par 4 points durs, +5 % de dégâts renvoyés par niveau de Liane charognarde, intouchable | corrigé : frappe mortelle (table et plafond) et synergie absentes ; la frappe mortelle n'agissait pas sur les attaques animales |
| Sage du chêne | Vie maximale fixe (table), régénération (5/256 de la valeur par seconde, +12 par niveau de chaque liane), intouchable | corrigé : régénération absente. Synergies lianes : ajoutées |
| Loup spirituel | 1 à 6 loups, +25 % de dégâts au niveau 1 de Grizzly puis +10 %/niv., synergies 8 % | corrigé : synergie du Grizzly absente. Vie, défense et score d'attaque des loups : modèle du jeu (supposé). Téléportation vers le Druide quand il est trop loin : conforme |
| Loup redoutable (« Fenris ») | 1 à 3 loups, dévore les cadavres : +100 % de dégâts 20 s | corrigé : la description promettait de la vie mais le code ne les faisait pas manger ; enragement ajouté. Synergie du Grizzly ajoutée |
| Grizzly | Recharge 2 s, 1 ours (2 à 20 points durs), étourdit | corrigé : recharge 2 s (absente) |

## Mesures d'équilibrage (arène `tools/bots/class-arena.ts`, 702 combats par build)

Morts avant → après : vent 35 → 29, feu (Fissure) 62 → 26, ours 97 → 68, invocateur 13 → 11 ; aucun build ne régresse (progression du bot et `tests/bots` verts avant et après, aucun seuil modifié).
Risque d'équilibrage résiduel : la Fissure et le Volcan frappent désormais à répétition comme le wiki le décrit (évent : un coup toutes les 0,2 s pendant 3,36 s) ; l'Onde de choc ne couvre plus qu'une étoile d'ondes (4 à 8) au lieu d'un disque ; les attaques animales gagnent la zone de mêlée et la frappe mortelle.
