# Audit de fidélité aux tables Diablo II (MPQ de l'utilisateur)

Audit en LECTURE SEULE : aucun fichier de jeu modifié. Scripts rejouables : `tools/audit/*.ts`
(`npx tsx tools/audit/run-all.ts` écrit les sorties brutes complètes dans `tools/audit/out/`, ignoré par git).

## 0. Méthode et mise en garde importante

- Sources : `$D2_PRIVATE_DIR/in/{d2data,d2exp,d2char}.mpq` **+ `$D2_PRIVATE_DIR/patch/Patch_D2.mpq`** (ajouté en dernier : sans lui,
  les tables sont celles de la 1.00 — niveaux requis, runewords « ladder », etc. différents). Le script d'import
  `Vfs.open(dir, [])` fourni en exemple ne charge PAS ce patch ; `tools/audit/common.ts` le charge (variable `D2_NOPATCH=1` pour s'en passer).
  Avec le patch, les tables correspondent à la 1.13/1.14 vanilla (Shako 58/43, Archon Plate 84/63, 78 runewords « complete »).
- Rappel : ce sont des tables **vanilla**. Nos données viennent de PD2 S13 (Armor.txt PD2, MonStats PD2, `rw.txt`) ou de D2 1.13
  (Weapons.txt, UniqueItems, SetItems) via `tools/itemdata/*.py` et `tools/skilldata/`. Verdicts :
  **conforme** ; **écart PD2 connu** (justifié par mods/pd2/docs/AUDIT-PD2.md, mods/pd2/docs/ETUDE-PD2.md ou `tools/skilldata/pd2-skills.json`) ;
  **écart à vérifier** (rien ne le justifie : erreur probable ou choix à confirmer) ; **absent**.
- Les comparaisons de propriétés d'uniques/runewords sont numériques (valeurs D2 retrouvées parmi les nôtres) car notre vocabulaire
  de stats est plus pauvre que `properties.txt` ; les écarts signalés sont des indices, pas des preuves.

## 1. Bases d'objets (`tools/audit/bases.ts`)

Appariement par nom (id = slug du nom anglais) : **488 bases armor+weapons appariées**. D2 « absentes » : 11, dont 0 réelle —
`Cap/hat`, `Demon Head`, `Hunter's Guise`, `Blood Spirt` [sic], `Hunter's Bow` existent sous un autre id (`cap`, `demon_head_bone`,
`hunters_guise`, `blood_spirit`, `hunters_bow`) ; les 6 potions de lancer (Rancid Gas, Oil, Choking Gas, Exploding, Strangling Gas,
Fulminating) sont exclues volontairement par `gen-bases.py` (SKIP). `misc.txt` : potions, livres, parchemins, clés, objets de quête,
carquois, herbes, torche, oreille de joueur non représentés comme bases D2 (remplacés par `hp_potion`, `key`, etc.) ; les 33 runes et
35 gemmes existent (ids `rNN`, `gem_*`).

| Champ | Écarts / 488 | Verdict |
|---|---|---|
| qlvl | 2 (`mesh_belt` 58 vs 43 ; `ancient_shield` 56 vs 74 : collision de nom avec `ancient_shield_sacred`) | écart à vérifier (mesh_belt) |
| reqStr / reqDex | 1 / 1 (`ancient_shield` 110 vs 124 ; `gothic_bow` dex 95 vs 118) | écart à vérifier |
| reqLvl | 160 : **132 = 1 chez nous, 0 en D2** (bases normales) ; 28 autres | cosmétique (132) ; voir ci-dessous |
| dmg | 18, **tous des épées à deux mains** | **écart à vérifier — erreur probable (voir §1.1)** |
| twoHanded | 18 (les mêmes) | idem |
| defense | 10 | 3 écarts PD2 connus, 7 à vérifier |
| block | 6 | écart à vérifier (voir ci-dessous) |
| maxSockets | 7 | PD2 connu (Grim Shield 2 → 3) ; reste à vérifier |
| taille (cases) | **107** | **écart à vérifier : `baseSize()` est une heuristique par type, pas la table** |
| durabilité, vitesse d'arme (`speed`), StrBonus/DexBonus | non modélisées | absent |

### 1.1 Épées à deux mains traitées comme à une main (erreur probable, 18 bases)
`two_handed_sword`, `claymore`, `giant_sword`, `bastard_sword`, `flamberge`, `great_sword`, `espadon`, `dacian_falx`, `tusk_sword`,
`gothic_sword`, `zweihander`, `executioner_sword`, `legend_sword`, `highland_blade`, `balrog_blade`, `champion_sword`,
`colossal_sword`, `colossus_blade` : `twoHanded: false` et dégâts **1 main** (colonnes `mindam/maxdam`, réservées au Barbare qui les
brandit à une main) au lieu des dégâts `2handmindam/2handmaxdam`.

| Base | nous | D2 (2 mains) | | Base | nous | D2 (2 mains) |
|---|---|---|---|---|---|---|
| two_handed_sword | 2-9 | 8-17 | | gothic_sword | 14-40 | 39-60 |
| claymore | 5-12 | 13-30 | | executioner_sword | 24-40 | 47-80 |
| giant_sword | 3-16 | 9-28 | | legend_sword | 22-56 | 50-94 |
| bastard_sword | 7-19 | 20-28 | | highland_blade | 22-62 | 67-96 |
| flamberge | 9-15 | 13-26 | | balrog_blade | 15-75 | 55-118 |
| great_sword | 12-20 | 25-42 | | colossal_sword | 26-70 | 61-121 |
| espadon | 8-26 | 18-40 | | colossus_blade | 25-65 | 58-115 |
| dacian_falx | 13-30 | 26-61 | | champion_sword | 24-54 | 71-83 |
| zweihander | 19-35 | 29-54 | | | | |
Même cause côté `size` : 1×3 chez nous, 1×4 ou 2×4 en D2.

### 1.2 Autres écarts de bases
- **Défense** (nous / D2) : Quilted 9-11 / 8-11 ; Leather 15-17 / 14-17 ; Studded 35-37 / 32-35 ; Light Plate 93-99 / 90-107 ;
  Wire Fleece 343-391 / 375-481 ; Archon Plate 364-407 / 410-524 → **à vérifier** ; Breast Plate 56-58 / 65-68 ; Mage Plate 178-187 /
  225-261 ; Dusk Shroud 270-302 / 361-467 → **écart PD2 connu** (AUDIT-PD2 n°15).
- **Blocage** : Buckler 25 / 0 ; Small Shield 30 / 5 ; Large Shield 37 / 12 ; Kite Shield 32 / 8 ; Grim Shield 30 / 20 ; Ancient Shield 16 / 25.
  La colonne D2 `block` ne contient que 0/5/12/8…, notre valeur ressemble à du « % de blocage » PD2/total : **à vérifier** (interprétation).
- **Châsses** : Serpentskin, Tigulated, Mesh Armor (en palier 0), Cuirass, Russet, Sharktooth 3 / 2 ; Grim Shield 3 / 2 ; Wand 2 / 1 ;
  Swirling Crystal, Eldritch Orb, Dimensional Shard 3 / 4 → PD2 documenté pour Mesh Armor/Grim Shield (n°15), le reste **à vérifier**.
- **Niveau requis** (hors « 1 vs 0 ») : `mesh_armor` 1 / 25 ; `death_mask` 32 / 25 ; `sharkskin_boots` 29 / 25 ; `battle_boots` 34 / 25 ;
  `mesh_belt` 43 / 25 ; `grim_shield` 27 / 25 ; `hawk_helm` 12 / 6 ; `antlers` 16 / 12 ; `falcon_mask` 20 / 15 ; `spirit_mask` 24 / 18 ;
  `tiara` 54 / 52 ; `wyrmhide_boots` 60 / 45 ; `lance` 33 / 25 ; `bill` 26 / 25 ; `rune_staff` 24 / 25 ; `rune_bow` 36 / 25 ; `gothic_bow` 39 / 25 ;
  `archon_staff` 63 / 66 ; `sacred_globe` 8 / 0 ; `smoked_sphere` 12 / 8 ; `swirling_crystal` 36 / 37 ; `dimensional_shard` 71 / 66 ;
  `tomb_wand` 26 / 25 ; `vampirefang_belt` 50 / 51 ; `vampirebone_gloves` 48 / 47 ; `totemic_mask` 42 / 41 ; `sacred_feathers` 38 / 32 :
  la plupart viennent d'Armor.txt PD2 (source déclarée) → **PD2 probable, non démontré** ; `lance`, `bill`, `rune_bow`, `gothic_bow`,
  `rune_staff`, `tomb_wand` (armes, source Weapons.txt 1.13) sont **à vérifier** (valeur 25 = plancher inexpliqué du MPQ).

## 2. Runes, gemmes, mots runiques (`tools/audit/runes.ts`)

- **Niveaux de runes** : 33/33 conformes (misc.txt `levelreq`).
- **Effets de runes (13 écarts rune×emplacement sur 99)** :
  | Rune | nous | D2 | verdict |
  |---|---|---|---|
  | Eld arme | +75 % vs morts-vivants | +75 % dmg et +50 AR vs morts-vivants | écart à vérifier (AR non simulé) |
  | Eld armure / Nef armure+bouclier / Shael bouclier / Mal arme / Sur arme | aucun effet | endurance, défense vs projectiles, bloc rapide, anti-soin, aveuglement | non simulé, déclaré dans runes.ts |
  | Tal arme | 45 poison | 75 poison (154×125/256) | **écart à vérifier** |
  | Dol arme | +20 % ED | Howl 32 | écart PD2 connu |
  | Pul arme / armure | 75 % dmg démons ; +50 % déf. | +100 AR et +75 % démons ; +30 % déf. | armure : PD2 connu ; arme : AR non simulé |
  | Um arme | 10 % blessures ouvertes | 25 % | écart PD2 connu |
  | Hel | `reqPct` +20/+15 | −20/−15 % (signe) | conforme (convention de signe) |
- **Gemmes (35)** : conformes sauf **Rubis sur arme** (nous 3-4 / 4-6 / 5-8 / 6-10 / 10-16 ; D2 3-4 / 5-8 / 8-12 / 10-16 / 15-20) ;
  **Diamant sur arme** (nous +AR 40…150 ; D2 +28/34/44/54/68 % dégâts contre les morts-vivants — déjà noté AUDIT-PD2 n°14, non corrigé) ;
  **Crâne sur bouclier** (nous réduction de dégâts 2/3/4/5/6 ; D2 *dégâts d'épines* 4/8/12/16/20). Tous **à vérifier / erreurs probables**.
- **Mots runiques** : D2 `runes.txt` = 169 lignes dont **78 « complete »** (vanilla 1.13) ; **les 78 sont présents** avec la bonne recette
  (77 identiques d'emblée, 0 absent) ; nous en avons 85 (7 en plus issus de PD2 : lignes non « complete » du fichier). Un seul niveau
  suspect : **Myth** requis 25 chez nous alors que ses runes (Hel…) imposent 33 → à vérifier. Les propriétés diffèrent (19 mots
  < 50 % de valeurs communes : Enigma, Chaos, Death, Destruction, Dragon, The Beast, Famine, Eternity, Last Wish, Phoenix, Rift,
  Wind, Stone, Peace, Malice, Venom, Crescent Moon, Doomsayer, Gloom…) : **écart PD2 connu** (propriétés lues de `rw.txt` PD2,
  AUDIT-PD2 n°6), non vérifiable avec les MPQ vanilla.

## 3. Uniques et sets (`tools/audit/uniques.ts`, échantillon = totalité)

- **Uniques** : D2 385 lignes `enabled=1` ; nous 374 (370 D2 + 4 charmes de brisure PD2 `u_sunder_*`) ; **377 appariées**.
  Absents (8, tous des objets de quête/placeholders) : War Bonnet, Amulet of the Viper, Staff of Kings, Horadric Staff, Hell Forge
  Hammer, KhalimFlail, SuperKhalimFlail, Cerebus (Blood Spirt). **lvl, lvl req, rarity, base : 377/377 conformes** (5 « écarts » de
  base sont des noms de slug : Witherstring, Radimant's Sphere, Annihilus, Gheed's Fortune, Hellfire Torch = mêmes objets).
  Propriétés : 358/377 avec ≥ 60 % des valeurs D2 retrouvées ; 19 en dessous (Wisp, Blacktongue, Warpspear, Steelgoad, Eye of
  Etlich, Spellsteel, Earthshaker, Black Hades, Veil of Steel, Blackoak Shield, Nature's Peace, Gargoyle's Bite, Lacerator, Carrion
  Wind, Rainbow Facet ×4, Hellfire Torch) : cause = propriétés non simulées (poison, anti-soin, procs) omises par le générateur.
- Les valeurs sont **D2 1.13 pures** : les modifs PD2 (Mang Song, Shako, Oculus…) ne sont **pas** appliquées (nous : Mang Song +5
  compétences, FCR 30 ; PD2 +6, FCR 85) → écart PD2 **non implémenté** (AUDIT-PD2 n°4). Les uniques PD2 additionnels sont absents.
- **Sets** : D2 33 lignes (32 sets + « Expansion » vide) / 128 pièces ; nous 32 sets / 125 pièces. Pièces absentes : Infernal Cranium,
  McAuley's Paragon (anciens), « Expansion » (ligne vide) → conforme. lvl/reqLvl/rarity/base : tous conformes. Valeurs à < 60 % :
  M'avina's Caster, Rite of Passage, Spiritual Custodian, Haemosu's Adament ; bonus de set : Berserker's Garb (2/4) →
  à vérifier (vraisemblablement propriétés non simulées). Tal Rasha = PD2 (écart PD2 connu).

## 4. Monstres et zones (`tools/audit/monsters.ts`)

- **Architecture** : PV/dégâts/XP des monstres = courbes abstraites (`curves.ts`, multiplicateurs `hp/dmg/xp`) et non `MinHP/A1MinD/Exp`
  de monstats.txt → pas de comparaison numérique directe possible ; **écart de conception**. 45 monstres chez nous (33 appariés à monstats.txt) contre ~92 familles D2 actives.
- **Résistances** (33 monstres appariés × 6 éléments × 3 difficultés = 594 valeurs) : 122 écarts. Nos valeurs viennent de MonStats **PD2 S13**
  (`gen-monres.py`) : la plupart relèvent donc du PD2 (AUDIT-PD2 n°11) et ne sont pas des erreurs vs vanilla. Placeholders à vérifier :
  **Anciens** (`ancient_*`, génériques 0/25/50 ou 25/50/75 ; D2 phys 70/70/40, feu 70/70/110 pour Talic, froid 150 en Enfer pour Korlic…),
  **Council Member** (Enfer : nous 0 partout ; D2 phys 50, feu 120, autres 33), **Squelette archer** (Enfer 0 feu/froid, D2 33),
  **Nihlathak** (nous 50/75/75 uniformes ; D2 feu/foudre 0/0/33, froid/poison 70).
- **Niveaux de boss** : 36 valeurs, 16 écarts. Andariel Enfer 85 vs 75 (PD2 : 85, **écart PD2 connu** ETUDE-PD2 §8.3) ; Nihlathak
  44/67/86 vs D2 65/70/92 ; Anciens 45/67/87 vs 37/68/87 (probablement erreur sur N et C) ; Lilith/Uber Izual 90/95/99 vs 110 (modèle
  « Pandemonium » différent, choix de conception) → les Anciens et Nihlathak sont à vérifier.
- **Niveaux de zone (levels.txt MonLvlNEx)** : Comtesse 7/42/79, Andariel 12/43/73, Cows 28/64/81, Méphisto 25/55/83, Chaos 28/58/85,
  Baal 43/66/85 : **conformes**. Tristram 16(adaptatif)/39/82 vs 6/39/76 et Tombeaux 17/49/82 vs 17/49/80 : **écart PD2 connu**
  (ETUDE-PD2 §8.3). Eldritch 37/60/81 vs Rigid Highlands 25/59/81 ; Pindleskin 38/62/82 vs 32/63/83 ; Nihlathak 44/67/86 vs
  Halls of Vaught 36/64/84 ; Anciens 45/67/87 vs Rocky Summit 37/68/87 : **écart à vérifier** (zones de farm A5 : niveaux de
  boss de superuniques non comparables à ceux de la zone sans `superuniques.txt`).

## 5. Trésors (`tools/audit/treasure.ts`)

- **Conformes au poids près** : `normal` (21/16/21/2, NoDrop 100), `caster` (18/15/18/2/7), `citem`, `uitem`, `unique`, `boss` (= Baal :
  picks 7, NoDrop 15, 983/983/983/1024), **Andariel, Méphisto, Comtesse (item+rune ×3 difficultés)**, récursion `Runes 2…17`
  (RUNE_TC_RECURSION, 15/15 valeurs ; Zod 1/5170), `Jewelry` (8/4/2/2/2/2), formule NoDrop.
- **Écarts** :
  | Sujet | nous | D2 | verdict |
  |---|---|---|---|
  | `champion` : potions | poids 1 | `Cpot A` : 3 (Act 5) | à vérifier (mineur) |
  | **Cow King** | aucun TC dédié (TC `boss` : 7 tirages, NoDrop 15) | `Cow King` : picks 5, NoDrop 0, 850/983/983/1024, `Uitem C`:1 + `Melee B`:2 | **absent** |
  | **Nihlathak** | picks 7, NoDrop 15, 983, équip 48 + runes | picks 5, NoDrop 19, 900/900/900/1024, équip 19, or 14 | écart à vérifier |
  | Pindleskin / Eldritch / Shenk | picks 6, NoDrop 15 (« approximations », commentaire du code) | `Act 5 Super Cx` : picks −4 (3 `Uitem C` + `Cpot C`), 512/654/972/1024 | écart à vérifier |
  | Anciens | picks 4, NoDrop 19 | TC propres (non extraits ici) | non vérifié |
  | `GOOD_GEMS` Enfer | [0,4,10,28,6] | A5 H : [4,10,14,28,0] (jamais de gemme parfaite dans « Good ») | écart à vérifier |
  | `GOOD_GEMS` Cauchemar | [4,12,14,8,0] | A1 NM : [6,8,28,14,0] ; A5 NM : [4,10,14,28,0] | écart à vérifier |
  | `GOOD_GEMS` Normal | [14,8,2,0,0] | A1 : chipped 5 seule ; A2 [12,4] ; A3 [8,8] ; A4 [14,28,42] ; A5 [6,8,24,4] | écart à vérifier |
  | `ZONE_RUNE_TC` Enfer (Cows 15, Anciens 16, Nihlathak 15, Pindleskin 13, Eldritch 14) | | Act 5 H = Runes 17, Act 3 H = 15, Act 1 H = 13 | à vérifier |
  | RATES (runes ×10, good ×2, gems ×1,5, noDrop ×0,55, qualité ×3/3/1,6, highRuneBias 0,15) | | | **choix de conception délibéré** |

## 6. Compétences (`tools/audit/skills.ts`, 183 compétences appariées sur 219)

- 36 compétences sans équivalent skills.txt (PD2 : Lesser Hydra, Combustion, Cold Enchant, Gust, Spirit Wolf… formes du Druide, etc.).
- **Niveau requis** : 51 écarts, **51/51 confirmés par `pd2-skills.json`** → écart PD2 connu (Inferno/Arctic Blast/Static Field/
  Telekinesis niveau 1, Fire Wall 12, Chain Lightning 24, Zeal 1, Holy Bolt 1, Frenzy 6, War Cry 6…).
- **Prérequis** : 62 écarts, 60 confirmés PD2 ; **2 à vérifier** : `oak_sage` (nous : prérequis Spirit of Barbs ; D2 aucun) et `summon_fenris` (nous : Spirit Wolf ; D2 Oak Sage + Summon Spirit Wolf) : ni D2 ni `pd2-skills.json` ne confirment nos valeurs.
- **Mana** : 70/146 conformes ; 76 écarts dont 63 confirmés PD2 ; **13 à vérifier** (probablement des unités par seconde/frame pour les
  canalisations Inferno, Arctic Blast, ou une pente absente) : inferno, arctic_blast, molten_boulder, twister, volcano, tornado,
  hurricane, armageddon, rabies, fire_claws, fury, plague_poppy, vines. Ex. `volcano` nous 25→44 au niveau 20, D2 25 constant ;
  `teleport` nous 24→14,5, D2 24→5.
- **Recharges (`delay`)** : 21 compétences D2 ont une recharge que nous n'avons pas : Meteor 1,2 s (nous 0,52), Blizzard 1,8 s (0,92),
  Fire Wall 1,4 s (1,52), Hydra 1,6, Frozen Orb 1, Firestorm 0,6, Molten Boulder 2, Eruption 2, Volcano 4, Hurricane 6, Armageddon 6,
  Fist of the Heavens 1, Immolation Arrow 1, Valkyrie 6, Poison/Plague Javelin 0,6/4, Dragon Flight 1, Shadow Warrior/Master 6,
  Blade Sentinel 2 : **écart à vérifier** (PD2 ne modifie pas ces délais d'après ETUDE-PD2 ; le mobile peut en avoir décidé autrement).

## 7. Formules (`tools/audit/formulas.ts`)

- **Classes** (charstats.txt) : For/Dex/Vit/Éne de départ, vie/mana par niveau, par Vit et par Éne : **7/7 conformes**.
- **XP** : table `XP_TABLE` : **0 écart sur 98 niveaux** ; `ExpRatio` 70-99 : **0 écart**.
- **Pénalité de résistance** : 0/−40/−100 conformes (difficultylevels.txt). Pénalité de mort XP 0/5/10 % conforme.
- **Divisions par difficulté** non modélisées (absent) : vol de vie/mana ÷2 (NM) ÷3 (Enfer), gel ÷2/÷4, malédictions ÷2…, bonus de
  compétences des monstres +3/+7, dégâts des uniques/champions 90/75/66 %.
- **FCR** : tables conformes à la formule D2 `ceil(256·B / floor(256·(100+Eff)/100)) − 1` (Eff = 120·x/(120+x)) pour Sorcière,
  Barbare, Paladin, Amazone, Nécromancien (B = 14/14/16/20/16) ; Druide et Assassin non reproduits avec la formule simple (vitesse
  d'animation ≠ 256), donc à comparer à animdata. **FHR** : formule non reproduite par la même méthode (le calcul D2 est différent) ;
  nos tables coïncident avec les paliers publiés vanilla connus (Sorcière 0/5/9/14/20/30/42/60/86/142/280 ; Amazone 6/13/20/32/52/86/174/600…)
  mais **cette concordance n'a pas été extraite des MPQ** : **à vérifier** avec animdata.
- **Vitesse d'attaque (IAS)** : `attackFrames = max(6, base − floor(IAS/15))` est une **approximation** (D2 : formule à rendements
  décroissants et dépendant de la vitesse de l'arme `speed` — non modélisée, donc absente) : **écart à vérifier**.

## Corrections recommandées (valeur / effort décroissants)

| # | Correction | Fichiers | Effort |
|---|---|---|---|
| 1 | **Épées à deux mains** : `twoHanded: true`, `dmg` = `2handmindam/2handmaxdam`, taille 1×4/2×4, pour les 18 bases (§1.1) | `tools/itemdata/gen-bases.py` → `src/data/items/bases-classes.ts` ; revoir `weaponreq.ts` (Barbare) | faible |
| 2 | **Tailles d'inventaire** depuis `invwidth/invheight` (107 écarts) au lieu de `baseSize()` | `src/data/items/sizes.ts` (table générée) | faible |
| 3 | **Gemmes** : Rubis arme (valeurs du §2), Diamant arme (+% dégâts morts-vivants), Crâne bouclier (épines 4-20) | `src/data/items/runes.ts` | faible |
| 4 | **Tal arme** 45 → 75 poison ; Eld/Pul arme (+AR) si le modèle l'accepte | `runes.ts` | faible |
| 5 | **Cow King** : TC dédié (picks 5, NoDrop 0, 850/983/983) ; revoir Nihlathak et les TC `Super Cx` (Pindleskin/Eldritch/Shenk) | `src/data/treasure.ts`, `src/sim/loot/drops.ts` | faible-moyen |
| 6 | **Poids de gemmes « Good »** par acte et difficulté (retirer les gemmes parfaites en Enfer ou le justifier) ; niveaux de TC de runes par zone (Act 5 = Runes 17) | `src/data/treasure.ts` | moyen |
| 7 | **Recharges** des compétences à `delay` (Meteor, Blizzard, Frozen Orb, Hydra, Volcano, Hurricane, Armageddon…) | `src/data/skills*.ts` (champ `n.cooldown`) + sim | moyen |
| 8 | **Résistances des Anciens, Council Member, Nihlathak, Squelette archer** ; niveaux de boss Anciens/Nihlathak | `src/data/monsters.ts` (+ `gen-monres.py`) | moyen |
| 9 | **Défense/blocage/châsses** : confirmer Wire Fleece 375-481, Archon Plate 410-524, Quilted/Leather/Studded, Light Plate, `mesh_belt` qlvl, `gothic_bow` dex, `lance/bill/rune_bow/gothic_bow` reqLvl 25, châsses Orbes 4 ; `reqLvl` 1→0 des bases normales | `tools/itemdata/gen-bases.py`, `src/data/items/uniques.ts` (EXTRA_BASES), `bases-classes.ts` | moyen |
| 10 | **Myth** reqLvl 33 (runes) ; vérifier les 2 prérequis du Druide (`oak_sage`, `summon_fenris`) et les 13 mana à vérifier | `runewords-pd2.ts` (généré), `skills-druid.ts` | faible |
| 11 | **Mécaniques absentes** : durabilité, vitesse d'arme (IAS réel), diviseurs de vol de vie/gel par difficulté, bonus de compétences des monstres | `src/sim/*` | élevé |
| 12 | **Uniques PD2** (Mang Song, Shako, Oculus…) et ~65 runewords PD2 « NEW » non publiés | `tools/itemdata/gen-uniques.py`, `uniques-d2.ts` | élevé (source PD2 manquante) |
| 13 | Vérifier **FHR/Druide/Assassin FCR** contre `animdata.d2` (`tools/audit/formulas.ts` à étendre) | `src/data/classes.ts` | moyen |

## Non couvert
`cubemain.txt` vs `src/data/cube.ts` (recettes) ; `magicprefix/suffix.txt` vs `affixes.ts` ; objets de quête ; `superuniques.txt` complet ;
HP/dégâts réels des monstres (modèle abstrait). Pistes pour un second passage.
