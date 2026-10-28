# Audit 02 : compétences, classes et mercenaires (D2 Mobile vs D2 LoD 1.13 et PD2 S13)

Date : 2026-10-06. Lecture seule. Références : `skills.txt` (via `tools/audit/common.ts`), wiki PD2 en ligne
(pages `All_<Classe>_Skills`, `Skill_Changes`, `Mercenaries`, `Mercenary_Skills`, `Item_Skills`, `Patch_Notes` ;
tables à 60 niveaux parsées dans scripts jetables (non conservés)), `tools/skilldata/pd2-skills.json`.
Code lu : `src/data/skills*.ts`, `src/data/classes.ts`, `src/data/mercs.ts`, `src/sim/{skills,barbarian,paladin,amazon,assassin,necromancer,druid,minions,merc,melee,procs,progression,character}.ts`.

Contexte : la dernière saison jouable est S13 « Betrayal » (24/04/2026) ; S14 « Alliance » sort le 23/10/2026 (notes de
patch pas encore publiées, seulement trois récapitulatifs de dev streams, non audités). L'audit vise donc S13.

## 1. Résumé chiffré

| Domaine | D2 | PD2 S13 | Nous | Couverture |
|---|---|---|---|---|
| Compétences d'arbre (7 classes) | 210 | 219 | 219 | PD2 100 % ; D2 94 % (197/210 ; les 13 autres sont remplacées par PD2 : Impale, Avoid, Slow Missiles, Frozen Armor, Poison Explosion, Summon Resist, Conversion, 5 maîtrises d'arme, Increased Stamina) |
| Compétences « objet seulement » | 0 | 5 (Blade Dance, Blink, Bone Nova, Lesser Fade, Vampire Form) | 0 | 0 % (l'infrastructure oskill/procs/itemAura existe) |
| Niveau requis | - | 219 | 219 identiques | 100 % |
| Prérequis directs | - | 219 | 219 cohérents (le wiki liste les prérequis transitifs) | 100 % |
| Coût en mana (105 tables du wiki comparées aux niv. 1/10/20) | - | 105 | 94 conformes | 90 % (11 écarts) |
| Dégâts (91 compétences à table min/max) | - | 91 | 33 exactes (±8 %), 22 exactement ×2, 36 autres écarts | 36 % exact ; 60 % si le ×2 est corrigé |
| Liens de synergie | - | 339 | 154 identiques | 45 % (Sorcière 97 %, Barbare 0 %) |
| Passifs/auras/formes : effet référencé dans la simulation | - | 219 | 219 référencés dans `src/sim` | 100 % de présence ; fidélité PD2 partielle (section 3) |
| Statistiques de classe (For/Dex/Vit/Ene de départ, vie/mana par niveau et par point) | 7/7 | 7/7 | 7/7 vanilla ; mana par niveau PD2 faux pour 4 classes ; endurance absente | 70 % |
| Mercenaires : types d'acte | 4 (A1, A2, A3, A5) | 5 (A1-A5) | 5 | 100 % |
| Mercenaires : sous-types PD2 | - | 13 | 15, dont 6 inexacts ou inventés | ~55 % |
| Points de compétence (1/niveau + quêtes Antre 1, Radament 1, Izual 2 ; respec) | OK | OK | OK | 100 % |

Verdict : l'inventaire (noms, arbres, niveaux, prérequis) est complet. Les écarts sont dans les VALEURS (échelle des
dégâts, niveaux au-delà de 20) et dans les MÉCANIQUES PD2. Seule la Sorcière est fidèle à S13 ; Paladin, Nécromancien et
Amazone le sont partiellement ; Barbare, Druide et Assassin portent en grande partie des chiffres vanilla D2 malgré
l'en-tête « PD2 S13 » des fichiers de données.

## 2. Manquants classés

### P0 : cœur de la fidélité

| # | Élément | Pourquoi | Effort | Dépendances |
|---|---|---|---|---|
| P0-1 | **Dégâts ×2 sur 22 compétences** (`HitShift` 7 non appliqué dans `pd2-skills.json` / `gen.py`). Sorcière 16 : Trait de feu L1 6-12 nous / 3-6 D2 et PD2 (L20 282-326 / 141-163), Boule de feu, Hydre, Hydre mineure, Combustion, Enchantement de feu, Pointe de glace, Nova de givre, Explosion glaciale, Pointe glaciale, Orbe gelé, Armure de givre/frisson, Décharge électrique ; Amazone : Flèche de feu, Flèche de froid ; Assassin : Explosion de feu, Sentinelle à éclairs chargés ; Druide : Tempête de feu, Grizzly ; Nécro : Dents. `mods/pd2/docs/ETUDE-PD2.md` (tableau Sorcière) donne bien 3-6. | Tout l'équilibrage (TTK, bot, cartes) a été calibré sur ces ×2 ; la fidélité de tous les builds de sorts est fausse d'un facteur 2 | M (corriger le générateur et recalibrer PV monstres/bot, ou assumer le ×2 comme choix mobile et le documenter) | `tools/skilldata/gen.py`, BACKLOG n° 12 |
| P0-2 | **Extrapolation au-delà du niveau 20** : `P([8 points])` prolonge la pente 17-20 ; les paliers PD2 16-22 / 22-28 / 28+ sont plus raides. Sur les compétences exactes au niveau 20 : -12 % de moyenne au niveau 30 (pire cas -34 %). Ex. Éclair lancé L30 max 1 088 nous / 1 368 PD2 ; Frappe puissante -27 % ; Flèche explosive -22 %. | Les +compétences d'objets (+3 à +10) amènent les builds à 30-40 : l'écart croît avec la puissance du personnage | M (remplacer par les tables 1..60 du wiki, déjà parsées, ou `R()` par palier) | `data/ramp.ts`, `gen.py` |
| P0-3 | **Barbare : refonte PD2 absente.** Chiffres d'Arreat Summit, 0 synergie (27 « synergies: [] » sur 29), durées vanilla. Battle Orders : +35 % +3 %/niv. nous, flat +50 vie/+25 mana +15/+7,5 par niv. PD2 (L20 : +335 vie) ; Clameur/Ordres/Commandement 20-35 s +10/niv. nous, 300 s PD2 ; Cri de bataille réduit défense/dégâts nous, résistance physique PD2 (casse les immunités) ; Provocation monocible nous, AoE centrée PD2 ; Fétiche sinistre fait fuir nous, buff dégâts/AR alliés PD2 ; Commandement de bataille +1 toutes compétences nous, +1 point par 10 niveaux + 20 % dégâts PD2 ; Cri de guerre 20-30 L1 nous / 3-5 PD2 (L20 160 / 76) et étourdit encore ; Berserk magique nous, physique à deux armes et +20 % splash PD2 ; Concentration sans conversion 30-70 % en magie ; Frénésie 6 s et `min(5, niveau)` charges nous, 15 s +2 s/niv. et 5 charges fixes PD2 ; Double lancer sans rebonds (PD2 : jusqu'à 7). | Classe au contrat PD2 seulement sur le papier ; 17 liens de synergie manquants (20-25 %/niv.) | L | splash de compétence (P1-1), conversion de dégâts (P2-4) |
| P0-4 | **Druide : tables et reworks PD2.** 15 compétences sur 17 à dégâts divergents : Souffle arctique L20 225-299 nous / 606-731 PD2, L30 735-863 / 2 043-2 231 (-64 %) ; Ouragan L1 6-12 / 25-50 ; Rage (poison) L30 418-484 / 1 507-1 539 (-72 %) ; Rocher en fusion L1 10 / 1 ; Corbeaux L30 108 / 316 (PD2 : 100 % froid, max 15, nous 50/50) ; Griffes de feu = tempête de feu rapide en PD2 ; Hunger devenu compétence d'ours (vitesse, vol de vie, Blessures ouvertes) ; bonus PD2 des formes (dégâts, splash, réduction de dégâts) absents ; 75 liens de synergie divergents (~35 réels après retrait des alias de noms). | 1 classe sur 7 ; la plus éloignée des chiffres PD2 | L | P0-2, BACKLOG n° 27 |
| P0-5 | **Échelle du poison** : Javelot empoisonné L20 2 659-2 946 nous (sur 46 s) / 131-139 PD2 (sur 1 s) = 7× à 21× ; Javelot de peste 2,3-3,5× ; Poison Strike (Poignard empoisonné) 1,9-3× ; Désécration 0,06× (L1 0,9-1,2 / 14-18 PD2, L20 29 / 459-464 : unité par tick à confirmer) ; Venin -23 % à L1, -43 % à L30. | Le poison est le DPS principal d'Amazone et de Nécromancien ; incohérent avec la durée de 1 s PD2 | M | P0-2 |
| P0-6 | **Statistiques de classe PD2** : mana par niveau PD2 = 2 pour Amazone, Assassin, Paladin (nous 1,5) et 1,5 pour Barbare (nous 1) ; **endurance totalement absente** (PD2 : 184/220/217/159/154/189/149 au niveau 1, +1/niv., +1 à +1,25/point d'énergie ; pas de course limitée, Battle Orders/Vigor ne l'améliorent pas). | Mana : -25 % du terme de niveau pour 4 classes ; endurance : mécanique de base D2 absente | S (mana) + M (endurance, UI) | `data/classes.ts`, `sim/character.ts` |

### P1 : important

| # | Élément | Pourquoi | Effort | Dépendances |
|---|---|---|---|---|
| P1-1 | **Éclaboussure de mêlée par compétence** : +20/40/60 % de rayon aux étapes 2 et 3 (Zèle, Fureur, Fend, Frénésie, Tigre, Concentration, Berserk ; Charge jusqu'à +60 % selon la distance) ; Zèle PD2 = 3 coups, nous 1 coup + 2 voisins ; Fend 3 coups (nous 5 cibles) ; Sacrifice explose le cadavre (overkill + 5 % de la vie) ; seuls `splashDmg`/`splashRadius` d'objet existent (`melee.ts:203`) | Mécanique PD2 majeure du mêlée (S13 corrige encore ces bonus) | M | `melee.ts` |
| P1-2 | **Malédictions** : une seule par monstre (`applyCurse` remplace) ; Curse Mastery ne donne qu'un bonus de rayon/résistance, PD2 autorise 2 puis 3 malédictions (niveaux 10 et 20) et améliore chaque malédiction ; Amplification = -100 % de résistance physique (PD2 : -10 % croissant avec niveau et synergie), Décrépitude fixe -50 % (PD2 -10 % croissant, réduit aussi la cadence de sorts), Terreur 8-27 s (PD2 3 s) ; Life Tap 10 % croissant ; Attraction réduit la défense ; durées vanilla (Lower Resist 20-58 s / PD2 8-27 s) ; 38 liens de synergie divergents (Dark Pact, Curse Mastery, Golems) | Style curse/invocateur PD2 | M | P0-4 pour la méthode |
| P1-3 | **Invocations PD2** : un seul golem (un nouveau tue les autres ; PD2 : +1 golem tous les 5 niveaux de Golem Mastery) ; Valkyrie unique (PD2 : 2e à 20, 3e à 30, Frappe puissante) ; Leurre sans attaque (`dmgMax = 0`, PD2 : il attaque, synergies) ; Poison Creeper +1 tous les 10 niveaux, Grizzly +1 à 20 niveaux ; Revive max 8 (nous plafonné par `count`), durée 300 s (nous 180 s) ; Squelettes/Mages plafonnés à 8 ; splash des invocations ; Sorcière : Hydre/Hydre mineure 5-6 s (nous 10 s), l'Hydre perce | Cœur des builds invocation | M | `minions.ts` |
| P1-4 | **Assassin : charges PD2.** Nous : charges D2 (3 max, libérées par un finisseur). PD2 : cycle en 3 étapes avec effet immédiat à chaque coup, un finisseur ou attaque de base consomme tout ; Poing de feu = explosion/nova/météores, Cobra = flèche de poison/double vol/nuage ; Tigre, Cobra, Phénix limités aux griffes/dagues ; Envol du dragon recharge 2 s, Griffe du dragon ininterruptible ; synergies de pièges croisées (Fire Blast +18 % de chaque piège, Dragon Talon +25 % ×2… : 33 liens divergents) ; Fire Blast +1 bombe par 3 points (max 9) ; Blade Sentinel (trajectoire libre), Death Sentry (cadavres seulement) ; Blade Shield 300 s (nous 20-115 s) | Seconde classe la plus éloignée de PD2 | L | P0-2 |
| P1-5 | **Paladin** : Holy Light (soin d'une cible) et Holy Nova (soin allié) ne font que des dégâts ; Holy Bolt ne soigne pas les alliés et ne perce pas ; Sanctuaire limité aux morts-vivants (PD2 : tous, + magie, - résistance magique) ; Choc sacré : aura 12-162 nous / 1-13 PD2 (×12) mais coup ×0,33 (mauvaise répartition aura/coup) ; Gel sacré aura ×8-10, coup ×0,5 ; bonus PD2 d'auras absents : Résistances (+dégâts élémentaires), Défi (+PDR), Vigueur (+vitesse de course), Méditation (mana par kill), Salut (dégâts élémentaires), Prière (vie par coup) ; Puissance donne la moitié aux alliés | Les auras PD2 sont l'identité de la classe | M | P1-1 |
| P1-6 | **Amazone** : Flèches de feu/froid tirent 1 flèche (PD2 : 2 puis +1 par 3-4 niveaux), Flèche magique 1 (PD2 +1 par 5 niveaux), Tir multiple sans -20 % par perforation, Flèche guidée sans perforation, Flèche de feu sans nappe de feu au sol (rework S13), Flèche d'immolation -53 % à L20 (118-120 / 235-257), Ralentissement : durée 12-126 s (PD2 10-14 s), Vue intérieure : rayon fixe (PD2 6,6 à 20 yd) | Builds arc/javelot | M | `fireWeapon` multi-projectiles |
| P1-7 | **Sorcière (presque au contrat)** : Mur de feu (rework S13 : 28-46/s L1, 787-970 L20, 2 896-3 220 L30 ; nous 4,7-7,8 L1, 131-162 L20, rapport 0,17 : unité à confirmer) ; Blaze explosion 0,09× ; recharges Météore/Blizzard/Hydre/Orbe gelé ; Champ statique 55/70/85 % ; synergies Foudre 14 %/niv. au lieu de 8 % (choix d'équilibrage assumé, BACKLOG 12) | À finir pour la parité complète | S-M | P0-1 |
| P1-8 | **Mercenaires** : A1 Éclaireuse : sous-type « Physique » (Flèche magique, Mitraille, Ralentissement) absent, auras Vigueur (Feu) et Méditation (Froid) absentes ; A2 Guerrier du désert : 6 variantes (Prière, Défi, Visée, Épines, Gel sacré, Puissance = vanilla) vs 3 PD2 (Défi, Visée bénie, Épines) ; A3 Loup de fer : Boule de feu / Pointe glaciale / Éclair + Éclair chargé nous, Météore / Blizzard / Foudre + Champ statique PD2, auras Purification/Prière/Choc sacré absentes ; A4 Ascendant : Sombre (Dents, Lance d'os, Armure d'os, Amplification, Curse Mastery) / Lumière (Éclair sacré, Poing des cieux, Lumière sainte, aura Sanctuaire) : nous un effet par variante ; A5 Barbare : Concentration au lieu d'Étourdissement ; un seul sort par mercenaire (PD2 : tirage aléatoire entre 3-4 compétences, niveaux « durs » > 20, synergies) ; courbe de vie nous 45 + 18/niv. (L50 927) vs PD2 40 + 9/niv. (L50 594, L98 1 830) ; héritage MF/GF du joueur, dégâts ×2 d'une main (Guerrier du désert/Barbare) non vérifiés | Le mercenaire est un second personnage | M-L | |
| P1-9 | **Passifs PD2 reworkés** : Maîtrise une/deux mains (+1 % splash par point, Crushing Blow à deux mains : seulement `value`), Peau de fer (+% PDR), Lycanthropie (+AR), Cyclone Armor (synergies Twister/Tornado +10 absorption/niv.), Bone Armor (+3 absorption par énergie), Energy Shield (15 % +2/niv., plafond 80 %), Chaleur (+AR plat), Deep Wounds PD2, Spirit of Barbs/Heart of Wolverine/Oak Sage « plats » PD2 | Précision des builds | M | |

### P2 : confort / rare

| # | Élément | Effort |
|---|---|---|
| P2-1 | Compétences d'objet absentes : Blade Dance (Chaos, remplace Tourbillon), Blink (Énigme/Naj : remplace Téléportation), Bone Nova, Lesser Fade, Vampire Form ; Énigme sans Blink ; charges d'objet régénérables absentes | M |
| P2-2 | Durées de buffs minimales de 5 min PD2 : Venin, Brûlure de vitesse, Fondu (120-348 s nous, 300-395 s PD2), Bouclier sacré (30-505 s) ; Armures de givre/frisson 180-297 s nous (PD2 4-8 s) | S |
| P2-3 | Compétence « Move Only » PD2 (marche sans attaque) | S |
| P2-4 | Conversion de dégâts par compétence (Concentration 30-70 % magique, Flèche magique 50 %, Berserk physique) ; réductions de résistance non plafonnées (Inferno, Champ statique, Souffle arctique) | M |
| P2-5 | Hydre/golems : compteurs de cap UI (Raven 15, Revive 8, squelettes 8) | S |

### P3 : cosmétique

| # | Élément |
|---|---|
| P3-1 | Visuels des auras, charges, invocations et sons dédiés (BACKLOG n° 28) |
| P3-2 | En-têtes « PD2 S13 » trompeurs dans `skills-barbarian.ts`, `skills-druid.ts`, etc. alors que les tables sont D2 ; commentaire « Templier » de `mercs.ts` obsolète (le type s'appelle Ascendant) |

## 3. Écarts de fidélité les plus graves (exemples chiffrés)

1. **Échelle ×2 des sorts** (P0-1) : Trait de feu 6-12 L1, 66-90 L10, 282-326 L20 ; PD2 3-6, 33-45, 141-163. Même rapport pour Pointe de glace, Orbe gelé, Boule de feu (399-453 L20 nous / 199-226), Hydre (504-597 / 252-298).
2. **Niveaux ≥ 21** (P0-2) : -12 % au niveau 30 en moyenne sur les compétences par ailleurs exactes (Éclair lancé -22 %, Frappe puissante -27 %, Flèche d'immolation 158-160 nous / 505-539 PD2 = -70 %).
3. **Barbare** (P0-3) : Ordres de bataille L20 +92 % de vie nous contre +335 vie / +167 mana PD2 ; Cri de guerre L20 150-160 nous / 74-76 PD2 ; Clameur L20 210 s contre 300 s ; aucune synergie (PD2 : 20 % par niveau sur 6 attaques).
4. **Druide** (P0-4) : Souffle arctique L30 -64 %, Rage -72 %, Corbeaux L30 108 / 316 (-66 %), Armageddon (feu) L10 39-52 nous / 111-152 PD2.
5. **Poison** (P0-5) : Javelot empoisonné L10 565-631 nous / 32-37 PD2 (17×) ; Désécration L20 -94 %.
6. **Aura Paladin** (P1-5) : Choc sacré aura L10 12-804 nous / 1-67 PD2 (×12), coup 134 / 402 (÷3) ; Gel sacré aura L20 328-412 / 41-51 (×8).
7. **Mercenaires** (P1-8) : vie Éclaireuse L50 927 / 594 PD2 (+56 %), L98 1 791 / 1 830 ; Guerrier du désert avec Prière et Gel sacré, inexistants en PD2.
8. **Mana par niveau** (P0-6) : au niveau 80, le terme de niveau vaut 118,5 (Amazone/Assassin/Paladin) nous contre 158 PD2 (-25 %).
9. **Invocations** (P1-3) : golem unique, Valkyrie unique, Leurre inoffensif (PD2 : Leurre 14-18 de base + 17-19 par niveau au-delà de 28).

## 4. Ce qui est déjà au niveau

- Inventaire des arbres : 219/219 compétences PD2 (noms, niveaux requis, prérequis directs), Sorcière 33, Druide 31, Nécromancien 33, Paladin 33, Amazone 29, Barbare 29, Assassin 31 (Blade Dance est un objet seul).
- Charstats vanilla D2 : 7/7 classes (statistiques de départ, vie par niveau et par point, mana par point, paliers FCR/FHR) ; AR = Dex × 5 - 35, défense par Dex.
- Sorcière : valeurs S13 de Foudre/Blizzard/Météore/Inferno/Télékinésie/Tempête (rapport 1,00), coût de mana 15 + 0,75/niv. du Mur de feu, malus de Téléportation, réductions de résistance PD2, Cold Enchant / Lesser Hydra / Combustion / Ice Barrage / Gust présents.
- Mana : 90 % des coûts conformes au wiki ; niveaux requis 100 %.
- Points : 5 stats + 1 compétence par niveau, quêtes Antre/Radament/Izual (1/1/2), respec.
- Mécaniques PD2 déjà portées : critique ×2 plafonné à 75 % (S13), Holy Bolt jusqu'à 3 projectiles, Split Throw, Sacrifice (coût en vie), Blade Fury/Shield, Death Sentry, Dark Pact, Blood Warp, Désécration, Raise Skeleton Archer, Fissure, Gust, Maul/Hunger/Fury, Joust/Holy Sword/Holy Nova (dégâts), procs d'objets (`procHit`, `itemAura`, `oskill`), mercenaires des 5 actes avec équipement et auras, gestion PD2 des immunités (demi-efficacité des réductions).
- L'ancien `tools/audit/skills.ts` reste valable : ses 51 écarts de niveau et 62 de prérequis (vs vanilla) sont tous des écarts PD2 confirmés (les 2 prérequis « à vérifier », `oak_sage` et `summon_fenris`, correspondent au PD2 : Heart of Wolverine/Spirit of Barbs et Heart of Wolverine/Raven/Spirit Wolf).

## 5. Méthode et limites

- 219 pages-compétences du wiki parsées (tables à 60 niveaux) et comparées à `ramp()` aux niveaux 1, 10, 20 (30 pour l'extrapolation) ; tolérance 8 %. Les liens de synergie, niveaux requis, prérequis et durées ont été comparés de la même façon.
- Le wiki note que sa page « Skill Overview » peut dater de S9-S11 ; les pages par classe et les notes de patch S13 ont servi d'arbitre.
- Unités du wiki : Mur de feu et Blaze sont « par seconde » (75× les fichiers de jeu), donc les rapports de ces deux lignes sont indicatifs.
- Non audités : S14 (pas de notes), sons/animations, équilibre des 18 builds du bot, Fenris/Spirit Wolf (alias de noms ambigus entre Spirit Wolf et Dire Wolf).
- Fichiers de travail : scripts jetables (non conservés) (parseur Python, JSON du wiki, sorties de comparaison).
