# Audit 04 : MONDE ET CONTENU (zones, villes, PNJ, quêtes, objets, niveaux secrets, endgame PD2)

Méthode : Levels.txt / objects / shrines / hireling / superuniques / cubemain lus par `tools/audit/common` (patch 1.13) ; wiki PD2 (Maps, Zones, Corruptions, Recipes, Mercenaries, Monsters-Ubers, Seasons) converti en texte ; code lu (`src/data/zones`, `levels*.ts`, `quests.ts`, `waypoints.ts`, `runs.ts`, `cube.ts`, `maps.ts`, `app.ts` bloc PNJ, `sim/objects.ts`, `sim/game.ts`). Lecture seule. Légende : ABSENT / INCOMPLET / ÉCART / OK.

## 1. Résumé chiffré

| Domaine | D2 | PD2 | Nous | Couverture |
|---|---|---|---|---|
| Zones Levels.txt (actes I-V, hors Null) | 136 | 136 + 37 cartes + 5 arènes uber | 133 (129 cartes DS1 importées) | 98 % (manque Hell1-3 = Abaddon, Pit of Acheron, Infernal Pit) |
| Villes | 5 | 5 | 5 (Camp, Lut Gholein, Kurast, Forteresse, Harrogath) | 100 % |
| PNJ de ville (npc.txt + secondaires) | ~36 | ~36 | 33 (manquent Cain A1/A5, Nihlathak de ville) | 92 % |
| Services de PNJ (soin, marchand, forge, jeu, ID, réparation, mercenaires, imprégnation, personnalisation, sockets, voyage, coffre, Cube) | 13 | 13 | 8 (soin, marchand unique, mercenaires, imprégnation, voyage, coffre, Cube, cartes d'Anya) | 62 % |
| Quêtes (6/6/6/3/6) | 27 | 27 | 15 (5/3/1/3/3) | 56 % |
| Récompenses de quête fidèles | ~10 | ~10 | 4 (Antre +1, Radament +1, Izual +2, Imprégnation partielle) | ~40 % |
| Points de passage | 39 | 39 | 39 (1 mal placé : A5 Anguish au lieu de Death's Calling) | 97 % |
| Sanctuaires (shrines.txt : effets) | 22 | 22 | 4 (refill, XP, armure, +2 compétences) | 18 % |
| Objets sélectionnables (objects.txt) | 380 types | idem | 7 genres (coffre, tonneau, sarcophage, râtelier, sanctuaire, sceau, herse) | ~2 % des variétés ; placement D2 d'origine : 0 |
| Niveaux secrets (Vaches, Tristram, Pandémonium 1-3) | 5 | + Ancients, DClone, Rathma, Lucion/Triune | 5 + Uber Tristram jouable | 100 % D2 ; 4/8 PD2 (Ancients, DClone-arène, Rathma, Lucion absents) |
| Super-uniques (SuperUniques.txt) | 66 | 66 | 47 en table + 6 Conseil + Griswold, Radament, Invocateur, Héphasto, Nihlathak via boss dédiés (~62) | ~94 % (mais modèles génériques) |
| Cartes PD2 (T1-T4 + uniques) | - | 37 | 24 (16 + 8 uniques) | 65 % |
| Affixes de carte | - | 48 | 16 | 33 % |
| Événements de carte | - | 8 | 6 (dont 2 seulement communs : Déchu au trésor, Horazon-coffre) | 25 % fidèle |
| Outils de modification de carte (orbes, infusés, cartographe, éclat, scarabée, catalyseur, étendard, 8 oreilles) | - | ~22 | 9 recettes (6 orbes, cartographe, 3→1, scarabée) + corruption | ~41 % |
| Mercenaires (variantes) | 9 (A1 2, A2 3, A3 3, A5 1) | 13 | 15 (A1 2, A2 6, A3 3, A4 2, A5 2) | OK en nombre, auras écartées |
| Corruption (équipement / carte / zone / Annihilus / Desecration) | - | 5 | 3 (équipement, carte, zone par bascule) | 60 % |
| Niveaux de zone Enfer alignés PD2 | - | 112 comparables | 69 alignés, 43 vanilla (écart 1 à 12) | 62 % |
| Ladder / saisons / Hardcore | - | 10 saisons + ladder | 0 | 0 % (solo hors ligne, voulu) |

## 2. Manquants par priorité

### P0 : cœur du monde, bloque la fidélité

| # | Élément | Pourquoi | Effort | Dépendances |
|---|---|---|---|---|
| P0-1 | **12 quêtes absentes sur 27** : Tools of the Trade (Malus, A1), Horadric Staff (Viper Amulet + Staff of Kings + Cube), Tainted Sun, Arcane Sanctuary (Horazon's Journal), Lam Esen's Tome, Khalim's Will (Flail, Œil, Cerveau, Cœur), Blade of the Old Religion (Gidbinn), Golden Bird (Jade Figurine), Siege on Harrogath (Shenk), Rescue on Mount Arreat (3 barbares), Prison of Ice (Anya) ; Terror's End/Hellforge incomplets | Le brief demande 6 quêtes par acte : le jeu en a 5/3/1/3/3. Aucun objet de quête (Staff, Amulette, Khalim, Gidbinn, Jarre) n'existe, donc ni Horadric Staff ni Amulette ni accès à Tal Rasha par la quête. Le Cube est offert d'office | L | `quests.ts` (QuestDef 'item'/'interact'), objets de quête dans `misc.ts`, objets interactifs (orifice, Jarre, autel) |
| P0-2 | **Récompenses de quête mal attribuées ou inventées** : l'imprégnation est donnée par « Cain/Tristram » (D2/PD2 : Tools of the Trade) ; Larzuk ne perce pas (Siege on Harrogath) ; Anya ne donne pas +10 % résistances (Prison of Ice) ; +5 caractéristiques donnés par les Vaches (D2 : Lam Esen A3) ; +1 compétence donnée par Tristram et Tombeaux, +1 comp +5 car par le Chaos et +2 comp +respec par Baal (inventés ; `runs.ts` firstClear lignes 70, 82, 233, 245, 365) ; quête « Forge » : rune r12/r18/r24 inventée (D2 : marteau de forge) | Points de compétence et résistance totaux faux, boucle de récompense non D2 | S | P0-1 pour les quêtes, sinon réattribuer les 3 à 4 firstClear |
| P0-3 | **Sanctuaires : 4 effets sur 22** (`sim/objects.ts` : refill, expérience, armure, compétence, 96 s). Absents : résistances feu/froid/foudre/poison (+75 %), combat (+200 % toucher/dégâts), mana (+400 % récupération), endurance illimitée, portail de ville, gemme, explosion/feu, monstre unique, potions explosives et poison, recharge ½ vie→mana et inverse, vie/mana doublées, caché ; durées, recharge à X min (`shrines.txt` : Duration, reset time, rarity, LevelMin) ignorées ; aucun puits (well, 6+ variantes) | Les sanctuaires sont le principal buff d'exploration D2 ; sans variété le monde est plat | M (table `shrines.txt` + 16 effets, la plupart sont des buffs existants) | stats de buff déjà présentes |
| P0-4 | **Objets interactifs placés comme D2** : les DS1 portent les objets mais `obj.txt` manque, donc le décor est semé au hasard (`d2decor.ts`) ; les 129 cartes ont seulement 1 autel près du départ + 2 coffres près du boss (`d2farm.ts` l.266-269) | D2 : dizaines de coffres/zone (coffres de zone, tonneaux, urnes, caisses, cadavres, râteliers), 2-4 sanctuaires, puits, coffres de boss ; ici le butin de conteneurs est ~0, le butin vient presque entièrement des monstres | M (placement par zone sur `objgroup`/`objects.txt` Mode/Class et densités, sans obj.txt) à L (reconstituer obj.txt) | `ObjectDef` à étendre (well, urn, jar, corpse), P0-3 |
| P0-5 | **Niveaux de zone Enfer PD2 non appliqués aux 112 zones de campagne** : 43 zones restent aux valeurs vanilla (Burial Grounds 80 / PD2 85 ; Tower Cellar 1-5 75-79 / 82-85 ; Catacombs 1-4 72-73 / 80-85 ; Sewers A3 74 / 85 ; Stony Tomb 78-79 / 85 ; Swampy Pit 80-82 / 85 ; Tristram campagne 76 / 82...). Les runs de farm : **Comtesse 79 (PD2 85), Andariel 73 (PD2 85)** | Les objets lâchés dépendent du niveau de zone (TC 87 à partir de 85) : Andariel/Comtesse en Enfer sont sous-dotés de 6 à 12 niveaux | S (table) | comparaison `tmp-cmp.ts` ; `levels-a*.ts`, `runs.ts` |

### P1 : important

| # | Élément | Pourquoi | Effort | Dépendances |
|---|---|---|---|---|
| P1-1 | **Durabilité et réparation absentes** (aucun champ durabilité ; seul « indestructible » existe comme stat). PD2 répare par le Cube (Ort/Ral/Zod) et chez le forgeron | Forge, Larzuk, Charsi, Fara, Hratli, Halbu ne servent plus à rien : tous vendent le même stock | M | `Item.durability`, `sell`/Cube, éthéré : aucune perte |
| P1-2 | **Identification (Cain) et parchemins/tomes** : tout est identifié, portail de ville gratuit et illimité (`openPortal`), pas de Tome de Portail/Identification, Cain n'est qu'un conseil | Cain ne sert à rien ; Gheed vend des « objets non identifiés » à 1 M en PD2 | M (S si on garde tout identifié et on retire Cain) | UI inventaire |
| P1-3 | **Jeu de hasard (Gheed, Alkor, Elzix, Anya…)** absent | Service D2 central de l'argent de fin de partie | M | `Game.refreshVendor` |
| P1-4 | **Un seul stock pour tous les marchands** (`refreshVendor`, 25 bases en dur, 8 magiques/rares + 4 armes + 10 bases à châsses ; Malah/Akara/Atma/Drognan/Lysander/Ormus/Alkor/Jamella ouvrent le même panneau « malah ») ; D2 : stock par PNJ, par acte, niveau d'objet par difficulté, potions par tier, parchemins, flèches, clés | Perte de l'identité des PNJ : seule la boutique de Larzuk change de titre | M | P1-1/P1-2 |
| P1-5 | **Abaddon, Pit of Acheron, Infernal Pit** (Levels 125-127, portails rouges d'A5, densité +40-50 % PD2, source de Demonic Insignia) | 3 zones sur 136 manquantes, pilier de l'accès Lucion | M | zones DS1 (hell1-3.ds1), portails rouges sur Frigid Highlands/Plateau/Crystalline |
| P1-6 | **Uber Ancients** (Sigils Madawc/Talic/Korlic des cartes T1-T3 → Relic of the Ancients → Standard of Heroes) | Boss de fin PD2 + 3e ingrédient des cartes héroïques | L | monstres anciens existent (zone `ancients`), arène à répliquer, 3 sigils |
| P1-7 | **Rathma et Mendeln** (Voidstone = Trang-Oul's Jawbone + Splinter of the Void + Hellfire Ashes/Torche) : 3 pré-phases + 3 phases, Tainted Worldstone Shard (corruption d'Annihilus), 3 uniques exclusifs | Plus grand combat d'endgame PD2 après Uber Tristram | L | zone dédiée, 2 boss, Mendeln via événement de carte (P1-12) |
| P1-8 | **Lucion + Temple of the Triune + Desecration** (Shadow of Hatred = Demonic Insignia + Talisman of Transgression + Flesh of Malic ; double corruption d'amulette 50-60 %) | Contenu de la saison 10, plus haut niveau (mlvl 110) | L | P1-5, zones corrompues (Talisman) |
| P1-9 | **Clone de Diablo à la PD2** : ici 1 chance sur 40 à chaque run d'Enfer (`maybeDiabloClone`), cible fixe ; PD2 : Vision of Terror = Prime Evil Soul + Black Soulstone + Pure Demonic Essence, 3 difficultés (uniques exclusifs 1/200 : Overlord's Helm, Dark Abyss, Itherael's Path, Hadriel's Hand, Aidan's Scar), arène sans retour, 4 phases | La source d'Annihilus et des uniques exclusifs est aléatoire au lieu d'être planifiée | M | P0-1 pour Black Soulstone, arène DS1 ; Annihilus déjà présent |
| P1-10 | **Chaîne Pandémonium non PD2** : (a) les clés (terreur/haine/destruction) tombent d'Andariel/Duriel/Méphisto à 30 % ; PD2 : Terror = Comtesse 1/14 + Blood Raven 1/9, Hate = Invocateur 1/8 + Bloodwitch 1/9, Destruction = Nihlathak 1/8 + Izual 1/9 ; (b) les essences (tordue, chargée, ardente, purulente) tombent des ubers à 100 % et ouvrent Tristram ; PD2 : essences = Andariel/Duriel 16-21 %, Méphisto/Diablo/Baal 8 % dès Cauchemar, elles font un **Token of Absolution (réinitialise stats/compétences)**, et l'accès à Uber Tristram se fait par le **Pandemonium Talisman** (cerveau + corne + œil des 3 mini-ubers) ; (c) le portail de clés ne garantit pas la non-répétition de la zone ; (d) Mephisto's Brain tombe d'« uber_mephisto » dans Tristram au lieu d'Uber Izual (Fournaise), Diablo's Horn de Lilith, Baal's Eye d'Uber Duriel | Les 4 dépendances (Torch, Annihilus, Black Soulstone, essence) sont inversées ; pas de Token (respec) | M | `cube.ts` l.298-322, `runs.ts` `pandemoniumDrops` |
| P1-11 | **Cartes PD2 manquantes (13)** : T1 Ancestral Trial ; T2 Sanatorium, Ruined Cistern, Pandemonium Citadel, Horazon's Memory, Halls of Torture ; T3 Kehjistan Marketplace, Arreat Battlefield, Bastion Keep, Demon Road, Skovos Stronghold ; T4 Steppes of Daken-Shar ; unique Outer Void. Ruins of Viz-Jun est classée unique chez nous, T1 en PD2 ; T2/T3 n'ont que 4 cartes (PD2 9/9) | Variété des farms d'endgame et des immunités par carte | L (zones procédurales : M par lot de 4) | `maps.ts` `MAP_ZONES`, `mapzone.ts` |
| P1-12 | **Événements de carte : 6 sur 8 PD2 absents** : Dark Wanderer (boss + Worldstone Shards), Shadow of Mendeln (vagues de morts-vivants, Splinter of the Void), Horazon (portail vers carte T+1, ici simple coffre à 6 cartes), Spire of Darkness (clés ubers), Gheed (5 uniques non identifiés à 1 M), Altar of the Catalyst (Catalyst Shard), Invasion (personnages invasifs, oreilles corrompues). Nos 4 autres (horde, autels, rival, embuscade) sont inventés | Les sources des matériaux d'endgame PD2 manquent | L (1 j chacun, M pour Wanderer/Altar/Spire) | P1-7 pour Mendeln |
| P1-13 | **Affixes de carte : 32 absents sur 48** : Fumbling (−blocage), Imbalance (−FHR), Unhealthy (−vol de vie), Warding, Leech, Fast, Resilience, Silver, Crushing, Bloody, Sturdiness, Regeneration, Hibernal, Static, Toxic, Smoking, Chilling, Sparking, Poisonous, Runic, Tangerine, Splashing, Lustful, Vampiric, Bovine, Reanimated, Ghastly, Souless, Shamanic, Shrieking, Smith, Armorer. Plus les modificateurs de corruption de carte (Deadly Strike, Cannot Be Frozen, −vitesse, −max res, +1 niveau de zone…) : 1 seul traité (mod unique tiré dans `corruptMap`) | Diversité des cartes : 16 affixes seulement, 0 immunité par affixe | M | `mapmods.ts` (58 lignes, modificateurs de monde) |
| P1-14 | **Outils de carte absents** : Catalyst Shard (événement aléatoire), Standard of Heroes (+10 % XP, +20 % densité, +20 % MF/GF), 8 oreilles corrompues (Amazone…Sorcière : +200 % vie, +25 % rareté), Infused Orbs (conformes ici sans ingrédients, mais PD2 exige Jewel/Perfect Gem/Rune), Anya ne vend pas les orbes (PD2 : achetables à Anya en Enfer) | Boucle d'amélioration PD2 réduite à 9 recettes | M | P1-12 (catalyseur), P1-6 (étendard) |
| P1-15 | **Cow Level : accès par menu** (aucune recette Wirt's Leg + Tome de Portail ; PD2 : seulement au Camp avec Baal tué dans la difficulté) ; Wirt's Leg et la jambe n'existent pas | Fidélité de l'événement le plus connu de D2 | S | Cube, P1-2 (tome) |
| P1-16 | **Hellforge / Soulstone** : Héphasto existe (quête « Forge ») mais pas l'objet Hellforge, le Marteau de forge, ni la destruction de la Mephisto's Soulstone / Diablo's Soulstone | Fin d'Acte IV (Terror's End) et brique de Pandémonium | M | P0-1 |
| P1-17 | **Zone à 85 / zone corrompue** : bascule manuelle en Enfer (+30 % vie, +20 % dégâts, +40 % XP) ; PD2 : 28 groupes de zones corrompues, rotation globale toutes les 15 min, drops de Worldstone Shard/T1, Talisman of Transgression, densité accrue | Écart de règle assumé en solo, mais la valeur de farm des zones n'est pas hiérarchisée | S | P1-8 pour Talisman |
| P1-18 | **Points de passage** : A5 a Halls of Anguish (Levels 122, wp 255) au lieu de Halls of Death's Calling (123, wp 35) | Erreur de données | S | `waypoints.ts` : remplacer `a5_anguish` par `a5_death` |

### P2 : confort / rare

| # | Élément | Pourquoi | Effort |
|---|---|---|---|
| P2-1 | Mercenaires PD2 : A1 « physique » (Magic Arrow, Strafe, Slow Movement), auras Vigor/Meditation (A1), Cleansing/Prayer/Holy Shock (A3), Sanctuary (A4), Defiance/Blessed Aim/Thorns seulement en A2 (nous avons aussi Prière, Gel sacré, Puissance de D2 vanilla), MF hérité du joueur, armes doublées à une main (Desert/Barbare) ; stats linéaires `life [45,18]` au lieu des paliers de `hireling.txt` (Rogue lvl 49 : D2 533 PV, nous 927 ; lvl 67 : D2 900, nous 1 251 ; Desert lvl 75 : 1 430 / 1 860) | S-M |
| P2-2 | Cain d'Acte I après sauvetage, Cain A5 (prison), Nihlathak de ville, Flavie | S |
| P2-3 | Coffres PD2 : coffres d'or du Temple de la Triune (+1 objet/tier), « super chests » (retirés de Lower Kurast, mais présents ailleurs) ; chests normaux/exceptionnels/élites du wiki Chests sont des uniques déjà couverts | M |
| P2-4 | Hardcore, échange entre joueurs, ladder : 0 (solo local) ; mode Hardcore absent même hors ligne | M (hardcore) / L (ladder) |
| P2-5 | Densité PD2 : Abaddon/Pit/Infernal +40-50 %, Mausoleum/Crypt +9 %, Maggot Lair et Arcane plus larges, Lower Kurast sans super coffres : seuls les chiffres vanilla de Levels.txt sont repris (`den`) | S |
| P2-6 | Zones corrompues : 15 min de rotation et planning global (pd2.tools) : sans objet en solo | S |
| P2-7 | `Horadric Almanac`, `Skeleton Key`, `Horadric Navigator` (drops Rathma 1/50) | S (après P1-7) |

### P3 : cosmétique

| # | Élément | Effort |
|---|---|---|
| P3-1 | Super-uniques sur modèles génériques (47 mappés sur 20 familles : « Bishibosh » = Chaman déchu, « Corpsefire » = Zombie, Cow King = bovin, De Seis = Chevalier de l'oubli) ; mapping des noms (`superuniques.ts`) | S |
| P3-2 | Musique d'Acte V (`d2xmusic.mpq` vide), polices bitmap D2, pop-pads des toits | M |
| P3-3 | Nom FR de zones secondaires (Cave Level 1 → « Antre » vs « Grottes ») | S |

## 3. Écarts de fidélité les plus graves (chiffrés)

1. **Quêtes** : 15 sur 27, et toutes les quêtes de ramassage/livraison absentes (aucune entrée « objet de quête »). Les actes sont joués dans le désordre (niveau seulement, pas de verrou Andariel → Acte II, Duriel → III…) : `runOptions` ne regarde que `c.level >= run.recLevel`. D2 : un acte se débloque à la mort de son boss.
2. **Récompenses** : totaux de points de compétence D2 (4 : Antre 1, Radament 1, Izual 2) contre 9 ici (Antre 1, Tristram 1, Radament 1, Tombeaux 1, Chaos 1, Izual 2, Baal 2) ; points de caractéristiques : D2 5 (Lam Esen), nous 10 (Vaches 5, Chaos 5) ; +10 % toutes résistances (Prison of Ice, D2) placé sur Baal ; respec donné par Baal (PD2 : Token of Absolution à 4 essences).
3. **Sanctuaires** : 4/22 effets, durée fixe 96 s (D2 : 1 à 4,8 min suivant l'effet, 1 minute de recharge ou jamais), aucune résistance +75 %, aucun puits.
4. **Niveaux de zone Enfer** : 43 zones sur 112 comparables diffèrent de PD2. Exemples : Comtesse 79 / 85, Andariel 73 / 85, Catacombs 3-4 73 / 85, Stony Tomb 78 / 85, Sewers A3 74 / 85, Tristram (campagne) 76 / 82, Plains of Despair 83 / 85, Burial Grounds 80 / 85. Normal/Cauchemar sont corrects à 10 écarts près (< 2 niveaux).
5. **Butin des conteneurs** : 3 objets par zone D2 (1 autel + 2 coffres) contre ~20-40 conteneurs/zone d'origine ; le jeu repose donc sur les seuls drops de monstres. Non mesuré en simulation (bots sans chiffres sur les conteneurs).
6. **Pandémonium** : sources de clés et d'essences inversées par rapport à PD2 (voir P1-10) ; pas de Token of Absolution ; Black Soulstone absent (la Torche se fabrique avec 3 organes, pas par drop d'Uber Tristram).
7. **Clone de Diablo** : tirage 1/40 par run d'Enfer (PD2 : jamais aléatoire, Vision of Terror) ; Annihilus aussi à 25 % sur Uber Diablo (inventé).
8. **Mercenaires** : formules linéaires au lieu des tables par paliers de `hireling.txt` (jusqu'à +30 à +75 % de PV selon niveau) ; nombre de variantes A2 de 6 (3 PD2).
9. **Corruption de carte** : un seul mod par corruption (PD2 : mod de la liste de ~12 lignes avec 3 plages par palier, 1 % de carte unique) ; pas de Tainted Worldstone Shard.
10. **Points de passage** : 38/39 corrects ; A5 « Anguish » à la place de « Death's Calling ».
11. **Vaches** : accès direct par menu (niveau de zone 28/64/81 correct) ; aucun test Wirt's Leg.
12. **Cube de monde** : pas de recette Horadric Staff, Khalim's Will, jambe de Wirt, réparation/recharge, Vial of Lightsong (éthérer), Lilith's Mirror (dupliquer), Hellfire Ashes, Jewel Fragments, potions (Antidote, Rejuv, Full Rejuv), Token, Relic, Talisman, Vision, Voidstone, Shadow (cube.ts : 97 recettes, 66 % runes/gemmes/châsses, 0 de ces 14).

## 4. Déjà au niveau (bref)

- **Zones** : 133 des 136 zones de Levels.txt existent, 129 cartes DS1 d'origine importées (collision DT1, escaliers, points de passage, pièces spéciales, entrées/boss placés par `monpreset`), monstres, densité `MonDen` et uniques `MonU` lus de Levels.txt par difficulté (`levels-a1..a5.ts`), niveaux Normal/Cauchemar fidèles. 5 villes avec PNJ à leur emplacement DS1.
- **Points de passage** : 39/39, activation au contact, déplacement entre points de passage d'un même acte.
- **PNJ** : 33 PNJ avec voix et dialogues D2 d'origine ; soin, marchand, mercenaires (5 actes), voyage (Warriv, Meshif), imprégnation (une fois par difficulté), Anya (cartes), coffre 10×8 + onglets D2R, Cube 3×4.
- **Boss et runs de farm** : Comtesse, Andariel, Méphisto, Tristram, Tombeaux (7 tombeaux, Duriel), Vaches, Pindleskin, Eldritch/Shenk, Nihlathak, Anciens (3 sceaux), Chaos (5 sceaux, Diablo), Trône + Chambre de Baal, Fleuve de flammes (Héphasto).
- **Secrets D2** : Vache, Tristram ultime, Pandémonium 1-3 (cartes DS1) + Uber Tristram, Hellfire Torch par Cube, Annihilus.
- **PD2 endgame** : 24 cartes (16 + 8 uniques), 16 affixes à 3 plages, bonus XP/densité/MF, orbes (arcane, Zakarum, angélique, horadrique, destruction, fortification, cartographe), scarabée, fortification, corruption d'équipement (tables par type) et de carte, Worldstone Shard, Treasure Fallen, Horazon, Cow King, super-uniques de ~62 des 66.
- **Mort et difficulté** : déblocage par la mort de Baal, pénalités, niveaux de zone Normal/Cauchemar, bonus de zone corrompue.

---
Décompte : P0 = 5, P1 = 18.
