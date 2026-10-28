# Audit 01 — OBJETS (D2 Mobile vs Diablo II 1.13 vs Project Diablo 2)

Périmètre : bases d'équipement, uniques, sets, runewords, runes/gemmes, affixes magiques/rares, crafts, qualités,
châsses, génération de butin. Méthode : tables D2 lues via `tools/audit/common` (MPQ + Patch_D2), PD2 lu sur le wiki
(All_Items, Runewords, Charms, Crafting, Recipes, Corruptions, Item Bases, Item Affixes, Runes), comptes mesurés par
scripts jetables (scripts jetables (non conservés)), code lu (`src/data/items/*`, `src/sim/loot/*`, `cube.ts`, `socket.ts`).
Les écarts déjà documentés dans docs/internal/AUDIT-D2-TABLES.md (épées 2 mains, tailles, gemmes, Tal, TC Cow King) sont **corrigés**
(vérifié) ; les écarts restants sont listés ci-dessous. Lecture seule : aucun fichier du dépôt modifié.

## 1. Résumé chiffré

| Domaine | D2 1.13 | PD2 | Nous | Couverture / fidélité |
|---|---|---|---|---|
| Bases armes+armures (spawnables) | 499 (202+297) | ≈505 (+6 carquois) | 502 | **présence ≈ 98 %** ; carquois 0/6 ; **valeurs : dégâts d'armes PD2 corrects sur 63/186 bases (34 %)**, défenses d'armures PD2 sur 106/141 (75 %) |
| Types de bases annexes (bijoux, charmes, joyaux) | ring, amu, 3 charmes, jewel | idem | 1+1+3+1 | 100 % (une base chacun) |
| Uniques (hors quête) | 377 utilisables (385 `enabled`) | 442 | 374 (370 D2 + 4 « brisure » non-PD2) | **présence 371/442 = 84 %** ; **valeurs PD2 : 149/374 inchangés vs vanilla donc OK, 225 (60 %) modifiés par PD2 et ici en valeurs vanilla** |
| Sets (sets / pièces) | 32 / 128 | 32 / 128 | 32 / 131 | **100 %** présence ; bonus PD2 repris (colonne « After ») ; ≈53 lignes non applicables (mods/pd2/docs/SETS-PD2.md) |
| Runewords | 78 « complete » | 99 noms (101 recettes, 107 variantes) | 85 (80 recettes distinctes) | **79 % des recettes PD2** (21 absentes) ; valeurs PD2 « After » majoritairement reprises |
| Runes (33) / gemmes (35) | 33 / 35 | idem (empilables) | 33 / 35 | 100 % ; effets de runes : ≈20 emplacements sur 99 en valeur vanilla au lieu de PD2 |
| Affixes magiques (préfixes+suffixes spawnables) | 587 + 575 = 1 162 (73 groupes) | équip. 345+384, joyaux 46+34, charmes 330 ≈ 1 139 | **172** (127 + 45 ; 36 groupes) | **≈ 15 %** |
| Noms de rares (préfixe+suffixe) | 46 + 155 | idem | 20 + ≈55 (par type, pas de table) | ≈ 37 % |
| Automods de bases | 60 bases à `auto prefix` (aura, têtes, orbes, armes Amazone…) | + splash mêlée, bâtons FCR, dagues DS, carquois | pelts uniquement (15 bases) | 25 % |
| Recettes d'artisanat | 4 familles D2 (Blood, Caster, Hit Power, Safety) | **7** (+ Vampiric, Bountiful, Brilliant ; infusions) | 4 (caster, blood, safety, brilliant) | 57 % |
| Recettes Cube (lignes `cubemain`) | 146 actives | ≈ 80 types (stack, upgrades, socket, craft, uber, maps) | 97 (60 runes/gemmes, 8 cartes, 3 Pandémonium…) | familles manquantes listées §2 |
| Qualités | low / normal / supérieur / magique / rare / set / unique / crafted + éthéré | idem (éthéré ×1,25) | `low` jamais généré, éthéré jamais tiré au butin | partiel |
| Châsses (tables MaxSock par type et ilvl) | 26 types × 3 paliers | idem | formule codée en dur (≤25 : 2/3 ; ≤40 : 4 ; sinon max) | écarts (§3) |
| Butin (TC, ItemRatio, MF) | TreasureClassEx complet | structure conservée | `MONSTER_TC` à 7 TC génériques + boss de farm | formules OK ; TC par acte/difficulté et boss A5 approximés |
| Potions / consommables | 5 HP, 5 MP, 2 rejuv, stamina, antidote, thawing, TP/ID, clés | + Full Rejuv, fragments | 3 bases (hp, mp, rejuv) + clé | ≈ 20 % |
| Durabilité, vitesse d'arme, For/Dex bonus par arme | oui | oui (PD2 : 75/75, 110, 50 % dex) | **absents** | 0 % |

## 2. Manquants

Effort : S < 1 j, M 1-3 j, L > 3 j.

### P0 — cœur du jeu, bloque la fidélité (5)

| # | Élément | Pourquoi | Effort | Dépendances |
|---|---|---|---|---|
| P0-1 | **Valeurs PD2 des uniques** : sur les 374 uniques décrits par le wiki avec tableau « Before/After », 225 ont ≥1 ligne modifiée (555 lignes modifiées sur ≈1 430) ; `uniques-d2.ts` est généré des tables 1.13 sans correctif PD2 (confirmé : Harlequin Crest garde DR 10 %, MF 50, vie/niv 1,5 au lieu de DR 4-6 %, MF 25-50, 1/niv ; Mang Song garde FCR 30/pénétration 7-15/regen 10 au lieu de FCR 75/12-20/20-30 + proc Lower Resist ; Windforce IAS 20 / ED 250 au lieu de 40 / 275-350 ; Arachnid Mesh FCR 20 / ralentit 10 % au lieu de 10 / 20 %…) | Les uniques sont la monnaie du jeu ; les chiffres de PD2 sont l'objectif | M (script de lecture de la colonne « After » comme `apply-pd2-sets.py`, + revue manuelle) | nouvelles stats (splash, charges) pour ≈15 % des lignes |
| P0-2 | **71 uniques PD2 absents** : Barbare/Druide (Cyclopean Roar, Raekor's Virtue, Wildspeaker, Quetzalcoatl, Fenris, Denmother, Ursa's Nightmare, Cerebus' Bite, Biggin's Bonnet, Overlord's Helm, Sage's Defiance), boucliers (Kalan's Legacy, Sankekur's Fall, Martyrdom, Sacred Totem, Skywarden, Ephemeral, Twilight's Reflection), armes de classe (True Silver, Mage Slayer, Stalker's Cull, Whispering Mirage, Aidan's Scar, Zerae's Resolve, Ebonbane, Tempest, Skorn, Embersworn, Skyfall, Armageddon's Blade), armes (Hadriel's Hand, Leoric's Mithril Bane, Odium, Shatterblade, Achilles Strike, Uldyssian's Awakening, Giant Maimer, Crackleshot, Heaven's Light, Akarat's Devotion, Brimstone Rain, Nethercrux), armures (Wraithskin, Purgatory, Dark Abyss, Cage of the Unsullied, Titan's Grip, Occultist, Merman's Sprocket, Itherael's Path, Siggard's Staunch, Band of Skulls), bijoux (The Third Eye, Constricting Loop, Kadala's Heirloom), **12 carquois** (Balefire, Swiftwind Needle, Tombsong, Aetherwing, Basilisk's Quill, Doom's Finger, Ramfodder, Anvilguard Strap, Shatterhead, Abyssal Ward, Bannerlord's Call, Frozen Sorrow), **3 des 4 Rainbow Facet** (nous : un seul, foudre, déclencheur « mort » seul) | Variété d'endgame, uniques de classe (les 7 classes sont jouables) | M (60 uniques sur bases existantes) + L si carquois | P0-1 (même source) ; carquois → P1-2 |
| P0-3 | **21 mots runiques PD2 absents** (recettes, 18 « NEW » omis faute de valeurs, résolues sur le wiki) : Wisdom, Flickering Flame, Ferocity (casques) ; Hustle, Innocence (armures) ; Epiphany, Shattered Wall (boucliers) ; Neophyte, Purity, Rampage, Loyalty, Unbending Will, Rapture, Mist, Dominion, Asylum, Obsession, Zenith (armes) ; Ancient's Scripture, Ancient's Foresight, Echo (carquois/jet) | Le chemin de craft de PD2 ; 21/101 manquants | M | Carquois (3) ; sous-types de masse (Rapture = marteaux) |
| P0-4 | **Bases d'armes aux valeurs PD2 + bonus For/Dex par type d'arme** : 122/186 bases comparables gardent les dégâts vanilla (ex. Hatchet 10-21 vs 15-30 PD2 ; Tabar 24-77 vs 35-99 ; Ancient Axe 43-85 vs 62-122 ; Archon Staff 83-99 vs 104-124 ; Hydra Bow 10-68 vs 12-83 ; PD2 +30-45 % sur la plupart des exceptionnelles/élites). Le bonus de force est un `1 + For/100` plaqué sur toutes les armes (`character.ts` l. 613-624), **y compris arcs/arbalètes** qui devraient suivre la Dex à 50 % | Toute la courbe de dégâts physiques ; ED/DPS des builds | M (regénérer `bases-classes.ts` avec la table PD2 + table `strBonus/dexBonus` par type) | À rééquilibrer ensuite (`BACKLOG` n° 2-3) |
| P0-5 | **Réserve d'affixes magiques/rares** : 172 contre ≈1 140 en PD2. Absents entièrement : attack rating (`att`), dégâts min/max plats, dégâts de poison, épines (`thorns`), « % de chances de lancer X au coup/frappé/en charges » (124 lignes D2), dégâts/AR contre morts-vivants et démons, fuite (`howl`), exigences réduites (`ease`), durée de poison, `of the Fox/Leech`… ; une rangée par classe de palier manque (ex. suffixe de vie 1 palier chez nous vs 28 lignes D2) ; pas d'affixes propres aux charmes/joyaux (PD2 : 330 + 80) | La grande majorité du butin (magique/rare/craft) | L | stats non simulées (charges, procs) ; P1-6 (charmes) |

### P1 — important (12)

| # | Élément | Pourquoi | Effort | Dépendances |
|---|---|---|---|---|
| P1-1 | **Éthéré** : `item.ethereal` n'est jamais tiré au butin (seulement carte « etherealUniques », debug, cube) ; effet limité à +50 % de défense (arme : aucun effet ; PD2 : ×1,25 dégâts et défense, −10 For/Dex, durabilité inchangée) | Bases éthérées pour mots runiques (Grief, Infinity, Bramble…), uniques éthérés | S-M | P1-3 (durabilité optionnelle) |
| P1-2 | **Carquois/flèches/carreaux** : type absent (6 bases normal/exceptionnel/élite, automods +2/10/18 dégâts max et −2/−4/−6 % rés. physique, 1-2 châsses, magiques/rares/uniques, craft, table de corruption, 3 mots runiques, 12 uniques) | Amazone et arcs PD2 | M-L | P0-2, P0-3 |
| P1-3 | **Durabilité** : aucune (`durability`, réparation, `rep-dur`, `indestructible`, Zod/Cham n'ont qu'un affichage) ; recettes de réparation du Cube PD2 inexistantes | Le compromis éthéré, l'économie d'or et les affixes de réparation en dépendent | M-L | UI (barres, forge de Charsi) |
| P1-4 | **3 familles d'artisanat manquantes** : Hit Power (Saphir), Vampiric (Crâne), Bountiful (Topaze) ; infusions de craft ; reroll des rares coûte 6 crânes parfaits (PD2 : 3) ; craft des carquois | 43 % des crafts PD2 | M | P0-5 pour les affixes tirés ; `cube.ts` |
| P1-5 | **Charmes PD2** : tables d'affixes distinctes petit/grand/énorme (49+30 / 84+33 / 96+38) absentes (on réutilise les affixes d'équipement) ; Torche (PD2 : +2 compétences de classe aléatoire, +30-60 Vitalité, +10-20 Énergie) et Annihilus (+30-60 Vit, +10-20 Én.) en valeurs 1.13 sans ces lignes | Skillers et charmes de vie/résistance sont l'inventaire de fin de partie | M | P0-5 |
| P1-6 | **Effets de runes PD2** : ≈20 emplacements en valeur vanilla (Amn armure épines 14 vs 20/24 ; Sol bouclier 7 vs 9 ; Dol armure régén. 7 vs 20/30 ; Ist armure 25 vs 30 ; Gul arme AR 20 vs 50, rés. max 5 vs 4 ; Vex/Ohm/Lo rés. max 5 vs 4 ; Ohm arme 50 vs 45 ; Ber 8 vs 6 ; Sur bouclier mana 50 vs 75, arme +4 vie/kill absent ; Jah bouclier vie 50 vs 75 ; Um arme sans « +120 blessures » ; Mal/Eld/Nef/Pul AR/anti-soin/déf. projectiles non simulés) | Toutes les runes sont dans tous les mots runiques et crafts | S | stats `defMissile`, `noHeal` |
| P1-7 | **Recettes de Cube PD2 manquantes** : Cube démoniaque (relance d'unique/set), Miroir de Lilith (duplication), Fiole de Lightsong (éthérer), fragments de joyaux / cendres, recettes magiques (anneaux Jade/Garnet/Coral/Cobalt, Leech, Spikes, Savage, Amulette prismatique), arme magique sertie par gemmes, Circlet → Coronet, quiver↔arrow/bolt, Malus de Larzuk, potions (Full Rejuv, antidote), accès aux ubers étendus (Relique des Anciens, Vision de la Terreur, Voidstone, Ombre de la Haine, cycle de difficulté) | Débouchés d'endgame PD2 | M | objets rares/ubers (§ autres domaines) |
| P1-8 | **TC de boss de farm** : Nihlathak (picks 7, NoDrop 15 vs D2 5 / 19 / 900-900-900), Pindleskin/Eldritch/Shenk (« approximations », D2 `Act 5 Super Cx` picks −4 : 3 `Uitem C` + `Cpot C`), Anciens non vérifiés ; poids `GOOD_GEMS` par acte (Enfer : ours [0,4,10,28,6] contient des parfaites ; D2 A5 H [4,10,14,28,0]) ; TC de runes de zone (Cows 15, Anciens 16, A5 = Runes 17) | Taux de runes/uniques de farm | S-M | — |
| P1-9 | **Propriétés d'uniques non simulées** : 2 206 lignes D2 → 2 022 mods conservés (≈8 % perdus : charges `charged` ×38, `ac-miss`/`ac-hth` (défense vs projectiles/mêlée), `stam`, `stupidity`, `dur`, `rep-dur`, `*enr`, `dmg-ac`…) ; 19 uniques à < 60 % de leurs valeurs (Wisp, Blacktongue, Warpspear, Steelgoad, Eye of Etlich, Spellsteel, Earthshaker, Black Hades…) | Uniques « incomplets » | M | stats : charges d'objet, défense par type |
| P1-10 | **Automods de classe** : 45 bases sans leur bonus (boucliers auriques `All Res`, têtes de nécromancien, orbes `+1-3 compétences Sorcière`, armes Amazone `+1-3 compétences Amazone`) ; PD2 : splash mêlée, bâtons FCR 10/30/50 %, dagues 20 % frappe mortelle, couteaux de jet crit | Orbes/boucliers sans valeur de base | M | P0-5 |
| P1-11 | **Châsses par type/ilvl** : table `MaxSock1/25/40` de 26 types remplacée par une formule (≤25 : 2/3 ; ≤40 : 4 ; > 40 : max) : épée ilvl ≤25 → 2 (D2 3), casque ilvl 26-40 → 3 (D2 2), bâton 3/4/6 (D2 5/6/6), sceptre, bouclier 3/3/4 ; chance de châsse 30 % fixe ; récompense de quête de Larzuk (max / 1-2 / 1) absente | Rythme de forgeage de bases à runes | S | — |
| P1-12 | **Sous-types d'armes de mêlée** : un seul `mace` (club / marteau / masse à pointe) et `scepter`/`wand` restreints ; les mots runiques PD2 par sous-type (Black = clubs/marteaux/masses à pointe/griffes, Rapture/Obedience = marteaux, Heart of the Oak/Beast…) s'appliquent à tout `mace` | Éligibilité exacte des runewords | S | — |

### P2 — confort / rare (8)

| # | Élément | Effort |
|---|---|---|
| P2-1 | Potions : 5 paliers HP/MP séparés, Full Rejuv, endurance, antidote, thawing, jet (poids par palier ; ici un seul palier par pile de ceinture, `slot.tier = max`) | M |
| P2-2 | Vendeurs par PNJ (Akara, Charsi, Fara, Drognan, Anya…), potions de ceinture, jeu de hasard (Gheed/Kadala), réparation | M-L |
| P2-3 | Corruption : lignes omises (malédictions, dégâts vs démons/morts-vivants, vitesse de blocage), table de carquois, Annihilus corrompu (éclat « Tainted »), Désécration | M |
| P2-4 | Sets : ≈53 propriétés sans stat moteur (`mods/pd2/docs/SETS-PD2.md` : saignement, `+1 ombre`, dégâts de zone, vol de vitalité…) | M |
| P2-5 | Restrictions de classe ajoutées par le jeu (arcs/arbalètes/lances/javelots = Amazone + merc ; hast/lancer = Barbare + merc ; sceptres = Paladin) : D2/PD2 laissent toutes les classes porter arcs, lances, hast, sceptres, baguettes ; le butin est filtré par classe (`lootBaseAllowed`) | S (choix de conception, à documenter) |
| P2-6 | Charmes de brisure (4 uniques `u_sunder_*`) : **absents de PD2** (« not implemented ») → à étiqueter « D2R » ou retirer | S |
| P2-7 | Imprégnation de Charsi : seule l'Acte I ; règles PD2 (clvl+4, pointmods) | S |
| P2-8 | `reqLvl` = 1 sur 132 bases normales (D2 0), `mesh_belt`, `gothic_bow` (déjà dans AUDIT-D2-TABLES §1.2) | S |

### P3 — cosmétique (4)

- Rares : 75 noms contre 201 (table `rareprefix/raresuffix` par type d'objet), qualité `low` (Crude/Cracked/Damaged) jamais tirée, objets toujours identifiés, `reqLvl` des bases normales à 1.

Totaux : **P0 = 5, P1 = 12, P2 = 8, P3 = 4**.

## 3. Écarts de fidélité les plus graves (valeurs, formules, comportements)

1. **Uniques en valeurs vanilla (60 % touchés)** — ex. Mang Song's Lesson : FCR 30 / pénétration 7-15 % / regen mana 10 % vs PD2 75 / 12-20 % / 20-30 % + « 12 % de Lower Resist au lancer » ;
   Harlequin Crest : DR 10 % constant, +1,5 vie et mana par niveau vs PD2 DR 4-6 %, +1/niveau, MF 25-50 ; Windforce : IAS 20/ED 250/For 10 vs 40/275-350/20 ; Arachnid Mesh : FCR 20 vs 10, ralentit 10 % vs 20 %, mana 5 % vs 5-10 %. Impact : tous les calculs de DPS/FCR de l'endgame.
2. **Dégâts de base des armes** — 66 % des bases comparées (122/186) en vanilla : Tabar 24-77 (PD2 35-99), Ancient Axe 43-85 (PD2 62-122), Hatchet 10-21 (PD2 15-30) ; Archon Staff 83-99 (104-124) ; Hydra Bow 10-68 (12-83). Armures : Lacquered Plate 433-541 (`uniques.ts` EXTRA_BASES, non régénéré) vs PD2 573-664 ; 32 bases d'armures restent en vanilla (Chain Mail 72-75 vs 70-71, Ancient Armor 218-233 vs 178-185).
3. **Formule de dégâts de For/Dex** — `weaponDmg × (1 + For/100)` pour toutes les armes. PD2 : 100 % For (haches 1 main, masses, sceptres), **110 % For** (bâtons, 2 mains, marteaux), **75 % For + 75 % Dex** (dagues, griffes, épées 1 main, hast, lances hors Amazone), Amazone 80 % For / 50 % Dex, **arcs : 50 % Dex seulement**. Exemple : arc avec 250 For / 100 Dex → ici +250 % de dégâts, PD2 +50 % (50 % de la Dex) ; épée 1 main 100 For / 100 Dex → ici +100 %, PD2 +150 % (75 % + 75 %). Les bottes (coups de pied) : 80 % For.
4. **Qualités** — éthéré : +50 % défense seulement et jamais tiré au butin (PD2 ×1,25 sur dégâts/défense, −10 For/Dex). Supérieur : +5-15 % ED/défense, sans bonus d'AR des armes (D2 : +5-15 % AR). `low` déclaré mais jamais généré.
5. **Châsses** — épée normale à ilvl 20 : max 2 (D2/PD2 max 3) ; chance fixe de 30 % ; Larzuk (quête) sans les règles régulier/magique/autre.
6. **Runewords** — valeurs mêlées vanilla/PD2 : Infinity −45-55 % rés. foudre (PD2 −40-50) ; Enigma `dr 5` vs PD2 6 %, sans Téléportation/Blink ; « Prevent Monster Heal » omis partout (Grief, Infinity, Call to Arms, Breath of the Dying…). 1 seul niveau suspect résiduel : Myth reqLvl 25 vs 33 (runes).
7. **Charmes de brisure** — 4 uniques ajoutés qui n'existent pas dans PD2 ; la Torche perd le proc de Firestorm (PD2 : retiré) mais aussi la compétence de classe et la Vitalité de PD2.
8. **Butin / TC** — formules ItemRatio (400/1/6400, 160/2/5600, 100/2/3200, 34/3/192, 12/8/0), rendements décroissants du MF (250/500/600), alvl, récursion des runes : **conformes**. Multiplicateurs de conception : uniques ×3, sets ×3, rares ×1,6, runes ×10, bons ×2, NoDrop ×0,55, `highRuneBias` 0,15 → p. ex. un unique d'ilvl 85 sur base élite ≈ 1/130 au lieu de 1/390 sans MF. TC de monstres : un seul jeu de TC (valeurs Enfer A5) pour tous actes/difficultés ; équipement tiré 2/3 armes, 1/3 armures, bases pondérées ×1,6 sur le dernier palier (« quasi uniforme ») au lieu de la chaîne `weapN/armoN` ; objets d'une autre classe jamais lâchés.
9. **Affixes** — suffixes de vie : 1 ligne par groupe vs 28 en D2 (niveaux de paliers) ; `cruel` ED 201-300 % réservé non-rare : lignes arbitraires ; classes : 28 affixes de compétences de classe par arbre (D2 : 94 lignes `skilltab`) simplifiés.
10. **Mots runiques de « type »** — `mace` unique : Rapture (marteaux seuls) et Black (clubs/marteaux/masses à pointe) ouverts à toutes les masses.

## 4. Ce qui est déjà au niveau (bref)

- **Sets** : 32/32, 128/128 pièces PD2 (+3), bonus et valeurs PD2 « After » appliqués, bonus actifs/inactifs affichés.
- **Uniques D2** : 377/377 niveaux/rareté/bases conformes ; 370 générés des tables ; couverture de bases par unique/set suffisante (coverageFactor ≈ 1,06-1,10 uniques, 1,4-1,5 sets).
- **Runes/gemmes** : 33 niveaux, 35 gemmes conformes (Rubis, Diamant, Crâne corrigés), recettes 3:1 puis 2:1 avec clé, parfaits avec clé comme PD2.
- **Mots runiques** : règles (base normale/supérieure sans affixe, châsses exactes, ordre) ; 80 recettes dont les 78 vanilla ; valeurs PD2 « After » de la plupart (Spirit, Grief, Call to Arms, Insight, Breath of the Dying vérifiés).
- **Qualité** : ratios ItemRatio, MF avec rendement décroissant, alvl, groupes d'exclusion, jusqu'à 6 affixes (4 pour joyaux), crafted (ilvl = clvl/2 + ilvl/2, 1-4 affixes selon l'ilvl).
- **Cube PD2** : montée de base (unique/set/rare/craft ; 8 recettes aux bonnes runes), châsses (4 recettes), Larzuk (Puzzlebox/Pièce), vider les châsses, 3 amulettes↔3 anneaux, relances, corruption (50/30/20, tables par emplacement, sockets), cartes (orbes), Pandémonium.
- **Armures** : défenses PD2 sur 75 % des bases ; tailles d'inventaire D2 générées ; épées à deux mains corrigées.
- **TC** : `normal`, `caster`, `champion`, `unique`, `boss`, Comtesse/Andariel/Méphisto/Cow King/uber, récursion des runes (15/15) et formule NoDrop pour 5 joueurs.
- **Vérifié inerte à tort** : aucun ; les 163 statistiques du catalogue sont consommées par la simulation (`stat-effects.test.ts`).

## 5. Reliquats à ne pas oublier de BACKLOG

Par rapport à `docs/internal/BACKLOG.md`/`docs/internal/AUDIT-D2-TABLES.md` : ces constats **nouveaux** ne s'y trouvent pas : P0-1 mesure (60 %), P0-4 (dégâts de bases PD2 et formule For/Dex), P0-5 (15 % d'affixes), P1-4 (3 familles de craft), P1-6 (rune values PD2 chiffrées), P1-11 (tables de châsses), P1-12 (sous-types de masse), P2-5, P2-6.

