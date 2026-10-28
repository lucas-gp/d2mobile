# Étude documentaire — Systèmes de Project Diablo 2 (PD2) pour l'ARPG mobile

> Objet : spécification des **systèmes** (pas du catalogue exhaustif) de Project Diablo 2, mod de Diablo II : Lord of Destruction, afin de les implémenter dans des fichiers de données TypeScript.
> Version de référence : **PD2 Saison 13** (fichiers de données `Skills.txt`, `MonStats.txt`, `ItemStatCost.txt` S13) + **wiki PD2** (instantanés 2025-2026) + **fichiers vanilla D2 LoD 1.13** pour tout ce que PD2 n'a pas modifié.
> Convention : « **Choix retenu :** » signale une décision tranchée ; « *(D2 vanilla)* » = mécanique non modifiée par PD2 ; « *(connaissance, non vérifié en ligne)* » = point non recoupé avec une source.

## 0. Sources et fiabilité

| Source | Accès | Utilisation |
|---|---|---|
| `github.com/coleestrin/pd2-tools` → `api/src/game-data/pd2/season-13/*.txt` | cloné | **Source primaire** : compétences Sorcière (Skills.txt / SkillDesc.txt S13), monstres (MonStats.txt S13) |
| `pd2-tools/web/public/items.json` (dump du wiki PD2) | cloné | 98 runewords PD2 (runes, bases, stats) |
| Wiki PD2 (`wiki.projectdiablo2.com`, pages consultées, dont leurs copies publiques sur web.archive.org) | OK | Corruptions, Maps, Recipes, Crafting, Runes, Item Affixes, Zones, Game Mechanics, General Changes, Monsters, pages de sorts |
| `github.com/fabd/diablo2` → `code/d2_113_data/*.txt` (vanilla 1.13) | cloné | ItemRatio, TreasureClassEx, Experience, MonLvl, CharStats, ItemTypes, MonUMod |
| classic.battle.net (table d'XP) , purediablo (guide MF) | OK | Table d'XP, formule de rareté (recoupement) |

**Constat important :** plusieurs noms parfois associés à PD2 **n'existent pas dans PD2** :
- « Orb of Corruption / Assemblage / Conversion / Infusion / Shadows / Socketing / Jeweler's » : ce sont des objets d'autres mods ou de PoE. Dans PD2 la corruption se fait avec la **Worldstone Shard**, les sockets avec **Larzuk's Puzzlebox / Puzzlepiece / Malus**, la relance d'unique/set avec le **Demonic Cube**, la duplication avec **Lilith's Mirror**, l'éthéréalité avec **Vial of Lightsong**. Les « orbes » PD2 sont **réservés aux maps** (Horadrim, Angelic, Zakarum, Arcane, Destruction, Fortification, Cartographer's).
- Runewords **Coven** et **Vigilance** : absents de la liste officielle des 98 runewords PD2 (comparaison nom à nom wiki ↔ dump). Non retenus.
- **Enigma PD2** : armure (Jah Ith Ber), **pas de Téléportation** mais « Blink » à charges.
- La Sorcière PD2 a **33** compétences (30 vanilla − Frozen Armor + Cold Enchant + Lesser Hydra + Combustion + Ice Barrage).

---

## 1. Génération d'objets

### 1.1 Qualités (raretés)

| Qualité | Couleur | Affixes | Particularités |
|---|---|---|---|
| Low quality (Crude/Cracked/Damaged/Low Quality) | gris | 0 | dégâts/défense −25 % *(D2)*, durabilité réduite ; issue d'un échec de tous les tests de qualité |
| Normal | blanc | 0 | peut porter des sockets (→ base de runeword) |
| Superior | blanc « Superior » | 0 | voir 1.8 ; base de runeword valide |
| Magic | bleu | 1-2 (max 1 préfixe + 1 suffixe) | |
| Rare | jaune | 3-6 (max 3 P + 3 S) ; **PD2 : min 4 si ilvl ≥ 45, min 5 si ≥ 65, 6 si ≥ 85** | bijou rare : toujours 4 |
| Set | vert | stats fixes + bonus de set | PD2 : peut être éthéré ; si aucun set dispo → **magic** (durabilité ×2 en D2) |
| Unique | or | stats fixes à plages | si aucun unique dispo (qlvl) → **rare** |
| Crafted | orange | 3 affixes prédéterminés + 1-4 affixes aléatoires (max 3 P ou 3 S) | voir §4.6 |

### 1.2 Niveaux : ilvl, qlvl, mlvl, alvl, rlvl

- **mlvl** (niveau du monstre) : monstre normal = niveau de zone (Cauchemar/Enfer ; en Normal D2 utilise `MonStats.Level`) ; **champion = +2**, **unique = +3** ; super-uniques et boss : niveau propre (ex. Baal Enfer 99, Diablo 94, Mephisto 87, Duriel PD2 88, Andariel PD2 85).
- **ilvl** (niveau d'objet) = **mlvl** du monstre qui l'a lâché (coffre : niveau de zone ; vendeur : clvl ; craft : ⌊clvl/2⌋ + ⌊ilvl/2⌋ ; Charsi imbue : clvl+4 ; reroll 6 Perfect Skulls : ⌊0,4·clvl⌋ + ⌊0,4·ilvl⌋).
- **qlvl** : niveau de qualité fixe de la base (ex. Hand Axe 3, Hatchet 31, Tomahawk 54 ; bague/amulette/bijou/carquois = 1). Un objet ne peut tomber que si `qlvl ≤ niveau du TC` (cf. §2).
- **maglvl** : 0 sauf baguettes/bâtons/orbes non élites (1) et diadèmes : Circlet 3, Coronet 8, Tiara 13, Diadem 18.
- **alvl** (niveau d'affixe — formule exacte, wiki PD2 = D2) :

```
si qlvl > ilvl : ilvl = qlvl
si maglvl > 0 : alvl = ilvl + maglvl
sinon si ilvl < 99 - ⌊qlvl/2⌋ : alvl = ilvl - ⌊qlvl/2⌋
sinon : alvl = 2*ilvl - 99
alvl = min(alvl, 99)
```
Un affixe est éligible si `affixe.alvl ≤ alvl` **et** (PD2) `alvl ≤ affixe.maxAlvl` quand un max est défini (ex. « Sturdy 1-41 »). Tout objet ilvl ≥ 85 a alvl ≥ 71 ; ilvl ≥ 92 → alvl ≥ 85.
- **rlvl** (niveau requis) = max(rlvl de la base, rlvl de chaque affixe) ; rlvl d'affixe ≈ 75 % de l'alvl (valeur par affixe dans la table). Uniques/sets : rlvl fixe. Runeword : max(rlvl base, niveau de chaque rune). PD2 : les crafts **n'ont plus** de malus de niveau (+10+3/affixe en vanilla) et l'upgrade exceptionnel/élite ne rajoute plus +5/+7.

### 1.3 Formule de rareté (D2, inchangée par PD2)

Les tests sont effectués **dans l'ordre** : Unique → Set → Rare → Magic → Superior (HiQuality) → Normal ; si tout échoue → Low quality. Chaque test (sauf les deux derniers qui n'ont pas de minimum) :

```
chance = (ratio - (mlvl - qlvl) / divisor) * 128        // divisions entières
emf    = MF                                  (magic)
       = MF * 250 / (MF + 250)               (unique)
       = MF * 500 / (MF + 500)               (set)
       = MF * 600 / (MF + 600)               (rare)
chance = chance * 100 / (100 + emf)
chance = max(chance, min)
chance = chance - chance * tcMod / 1024      // tcMod du TC (§2.4)
réussite si rand(0 .. chance-1) < 128        // P = 128 / chance
```

**ItemRatio.txt LoD (Version 1)** — ratio / divisor / min :

| Ligne | Unique | Rare | Set | Magic | HiQuality | Normal |
|---|---|---|---|---|---|---|
| Base normale | 400 / 1 / 6400 | 100 / 2 / 3200 | 160 / 2 / 5600 | 34 / 3 / 192 | 12 / 8 / – | 2 / 2 / – |
| Exceptionnel/élite (« Uber ») | 400 / 1 / 6400 | 100 / 2 / 3200 | 160 / 2 / 5600 | 34 / 3 / 192 | 12 / 8 / – | 1 / 1 / – |
| Objet de classe (orbes Sorcière…) | 240 / 3 / 6400 | 80 / 3 / 3200 | 120 / 3 / 5600 | 17 / 6 / 192 | 9 / 8 / – | 2 / 2 / – |
| Objet de classe « Uber » | 240 / 3 / 6400 | 80 / 3 / 3200 | 120 / 3 / 5600 | 17 / 6 / 192 | 9 / 8 / – | 1 / 1 / – |

Plafonds implicites : unique ≤ 128/6400 = **1/50**, set ≤ 1/43,75, rare ≤ 1/25, magic ≤ 1/1,5 (avant modificateur de TC).

**Exemple chiffré** (qlvl 60, mlvl 85, MF 300, base non-classe) :
- Unique : (400−25)·128 = 48 000 ; emf = 136 → 20 338 ; ≥ 6400. Monstre normal (tcMod 0) : P = **0,63 %** ; champion (tcMod 800) : 20 338 − 15 889 = 4 449 → **2,88 %**.
- Set : (160−12)·128 = 18 944 ; emf = 187 → 6 600 → **1,94 %** (monstre normal).
- Rare : (100−12)·128 = 11 264 ; emf = 200 → 3 754 → **3,41 %**.
- Magic : (34−8)·128 = 3 328 ; emf = 300 → 832 → **15,4 %**.
(probabilités conditionnelles : chaque test n'a lieu que si les précédents ont échoué).

**Choix retenu :** formule exacte ci-dessus, entiers tronqués à chaque étape, table Version 1. MF affiché = somme des « Better Chance of Getting Magic Items ».

### 1.4 Affixes : préfixes, suffixes, groupes

- Tirage pondéré par `freq` parmi les affixes éligibles (type d'objet, alvl, rareté : certains affixes sont « magic only »).
- **Groupe d'exclusion** (`group`) : un objet ne peut avoir qu'un affixe par groupe (ex. groupe 125 = tous les +compétences de classe/arbre ; 9 = FCR ; 18 = FHR ; 22 = MF suffixe ; 114 = MF préfixe ; 26 = +Vie ; 115 = +Mana ; 116 = All Res ; 117/118/119/120 = res Froid/Feu/Foudre/Poison ; 23 = Énergie ; 35 = FRW ; 101 = %ED défense ; 105 = %ED dégâts).
- Magic : 1 P et/ou 1 S (tirage D2 : 1 ou 2 affixes au total, au moins 1). **Choix retenu :** 50 % P+S, 25 % P seul, 25 % S seul.
- Rare : nombre total d'affixes selon ilvl (PD2) :

| ilvl | Nb d'affixes | Choix retenu (répartition) |
|---|---|---|
| 1-44 | 3-6 | 3:25 %, 4:25 %, 5:25 %, 6:25 % |
| 45-64 | 4-6 | 4:34 %, 5:33 %, 6:33 % |
| 65-84 | 5-6 | 5:50 %, 6:50 % |
| 85+ | 6 | 6 |
| bijou rare | 4 | toujours 4 |
Contraintes : max 3 préfixes et 3 suffixes, tirage alterné P/S aléatoire.
- Nom rare : préfixe + suffixe tirés de listes (cosmétique).
- **Staffmods (pointmods)** PD2 : orbes/bâtons/baguettes/… peuvent recevoir des +compétences individuelles : 10 % aucun, 40 % 1, 30 % 2, 20 % 3 ; valeur +1 : 40 %, +2 : 35 %, +3 : 25 %. Une compétence de rlvl R n'est éligible qu'à partir d'ilvl ≥ R+7 (R=1 : dès ilvl 1).

### 1.5 Liste représentative d'affixes (utile Sorcière) — wiki PD2 « Item Affixes »

Format : Nom — attribut — types — alvl — rlvl — freq — groupe.

**Compétences (préfixes, groupe 125)**
| Affixe | Attribut | Types | alvl | rlvl | freq |
|---|---|---|---|---|---|
| Angel's | +1 compétences Sorcière | Amulette, Circlet | 36 | 27 | 4 |
| Angel's | +1 compétences Sorcière | Bâton, Orbe | 30 | 22 | 4 |
| Angel's | +1 compétences Sorcière | Chest, Bouclier, Casque (non-classe) | 36 | 27 | 1 |
| Arch-Angel's | +2 compétences Sorcière | Bâton, Orbe | 50 | 42 | 2 |
| Arch-Angel's | +2 compétences Sorcière | Amulette, Circlet | 90 | 67 | 2 |
| Burning / Sparking / Chilling | +1 arbre Feu / Foudre / Froid | Bâton, Orbe, Amulette, Circlet | 20 | 15 | 1 |
| Blazing / Charged / Freezing | +2 arbre | idem | 40 | 30 | 1 |
| Volcanic / Powered / Glacial | +3 arbre | idem | 60 | 45 | 1 |

**Vitesse (suffixes)**
| Affixe | Attribut | Types | alvl | rlvl |
|---|---|---|---|---|
| Apprentice | +10 % FCR | Rod, Bague, Amulette, Orbe, Circlet | 5 | 3 |
| Apprentice | +10 % FCR | Chest, Bouclier | 17 | 20 |
| Apprentice | +10 % FCR | Gants, Ceinture | 25 | 29 |
| Magus | +20 % FCR | Rod, Orbe, Circlet | 29 | 21 |
| Magus | +20 % FCR | Chest, Bouclier | 25 | 29 |
| Balance | +10 % FHR | Armures sauf gants | 5 | 3 |
| Equilibrium | +17 % FHR | Chest, Ceinture, Bouclier | 9 | 6 |
| Stability | +24 % FHR | Chest, Ceinture | 18 | 13 |
| Pacing / Haste / Speed | +10 / 20 / 30 % FRW | Bottes, Circlet | 12 / 22 / 37 | 8 / 16 / 29 |
| Acceleration | +40 % FRW | Bottes | 51 | 43 |

**Résistances (préfixes)**
| Affixe | Attribut | Types | alvl | rlvl |
|---|---|---|---|---|
| Azure/Crimson/Tangerine/Beryl | Res Froid/Feu/Foudre/Poison +5-10 % | Armure, Arme, Bague, Amulette, Circlet | 5-45 | 3 |
| Lapis/Russet/Ocher/Viridian | +11-20 % | Armure, Bague, Amulette, Orbe, Circlet | 12 | 9 |
| Cobalt/Garnet/Coral/Jade | +21-30 % | idem | 18 | 13 |
| Sapphire/Ruby/Amber/Emerald | +31-40 % | Rod, Bottes, Amulette, Orbe, Circlet | 25 | 18 |
| Shimmering | All Res +3-7 | Bouclier / Amulette, Circlet / Bague | 6 / 8 / 45 | 4 / 6 / 37 |
| Rainbow | All Res +8-11 | Bouclier / Amu, Circlet / Bague | 18 / 21 / 56 | 13 / 15 / 48 |
| Scintillating | All Res +12-15 | Bouclier / Amu, Circlet / Bague | 28 / 34 / 67 | 21 / 25 / 59 |
| Prismatic | All Res +16-20 | Bouclier / Amu, Circlet | 39 / 42 | 31 |
| Chromatic | All Res +21-30 | Bouclier / Amu, Circlet | 50 / 55 | 42 / 41 |

**Vie / Mana / Énergie / MF**
| Affixe | Attribut | Types | alvl | rlvl |
|---|---|---|---|---|
| Jackal / Fox / Wolf / Tiger | +1-5 / +6-10 / +11-20 / +21-30 Vie | Chest, Ceinture, Amulette, Circlet | 1 / 7 / 15 / 20 | 1 / 5 / 11 / 15 |
| Mammoth / Colossus | +31-40 / +41-60 Vie | Chest, Ceinture, Amulette, Circlet | 25 / 30 | 18 / 22 |
| Squid / Whale | +61-80 / +81-100 Vie | Chest, Ceinture, Circlet, Bouclier, Amulette | 40 / 50 | 30 / 37 |
| Tiger (bague) / Mammoth (bague) | +21-30 / +31-40 Vie | Bague, Casque | 51 / 68 | 43 / 60 |
| Lizard's / Snake's / Serpent's | +3-5 / +5-10 / +11-20 Mana | divers | 3 / 6 / 14 | 2 / 4 / 10 |
| Drake's / Dragon's / Wyrm's | +21-30 / +31-40 / +41-60 Mana | Rod, Bague, Amu, Orbe, Circlet | 20 / 24 / 30 | 15 / 18 / 22 |
| Great Wyrm's / Bahamut's | +61-90 / +91-120 Mana | Rod, Bague, Amu, Orbe, Circlet | 37 / 45 | 29 / 37 |
| Mind / Brilliance / Sorcery / Wizardry / Enlightenment | +4-6 / 7-10 / 11-15 / 16-20 / 21-30 Énergie | Amu, Orbe, Circlet, Bâton | 7 / 13 / 21 / 31 / 41 | 3 / 9 / 16 / 23 / 33 |
| Felicitous / Fortuitous (P) | 5-10 % / 11-15 % MF | Bague, Amu, Circlet, Casque | 5 / 12 | 3 / 8 |
| Chance / Fortune / Luck (S) | 5-15 / 16-25 / 26-35 % MF | Bottes, Gants, Amu, Circlet, Casque (Luck : Bottes, Amu, Circlet) | 12 / 16 / 26 | 9 / 12 / 19 |
| Regrowth / Revivification | Replenish Life +6-10 / +11-15 | Amu, Circlet, Sceptre | 17 / 38 | 12 / 30 |

Ajouts propres PD2 (rares) : « 3 sockets » sur chest/bouclier/arme rare, 5-20 % PDR sur chest/bouclier, +10-20 % FCR sur chest/bouclier, +1 compétences de classe sur chest/bouclier/casque, +2-3 % dégâts élémentaires sur grand charme.

**Choix retenu (mobile) :** implémenter ~60 affixes (tableaux ci-dessus + %ED arme/armure, +défense, +For/Dex/Vit, leech, AR) avec les champs `{id, kind:'prefix'|'suffix', stat, min, max, alvl, maxAlvl?, rlvl, freq, group, itemTypes[], magicOnly?}`.

### 1.6 Sockets

```
maxSockets = min(base.gemsockets, itemType.MaxSock[tranche(ilvl)])
tranche : ilvl 1-25 → MaxSock1 ; 26-40 → MaxSock25 ; 41+ → MaxSock40
```
ItemTypes.txt (vanilla ; PD2 a augmenté quelques bases et les boucliers Nécro) :

| Type | MaxSock1 / 25 / 40 | Type | MaxSock1 / 25 / 40 |
|---|---|---|---|
| Helm | 2 / 2 / 3 | Circlet | 1 / 2 / 3 |
| Armor (chest) | 3 / 4 / 6 (base ≤ 4) | Shield | 3 / 3 / 4 |
| Auric Shields | 3 / 4 / 4 | Orb | 2 / 3 / 3 |
| Staff | 5 / 6 / 6 | Wand | 2 / 2 / 2 |
| Sword, Mace, Club, Hammer, Spear, Polearm, Bow, Crossbow | 3 / 4 / 6 | Axe | 4 / 5 / 6 |
| Scepter | 3 / 5 / 6 | Knife | 2 / 3 / 3 |

Sources de sockets :
- Drop blanc/superior socketé *(D2)*. **Choix retenu :** 1 objet normal/superior sur 8 tombe socketé, nombre uniforme 1..maxSockets.
- Larzuk (quête A5) : normal → max ; magic → 1-2 ; autres → 1.
- Recettes Cube (§4.1), corruption (§5), Puzzlebox/Puzzlepiece/Malus.

### 1.7 Types de base

- 3 grades : **normal / exceptionnel / élite**, qlvl croissants (ex. haches : Hand Axe 3 → Hatchet 31 → Tomahawk 54). PD2 : dégâts de base normal/exc/élite relevés de ~4 % / ~42 % / ~24 % ; éthéré +25 % (au lieu de +50 %) sans demi-durabilité ; bâtons : FCR automod 10/30/50 % (normal/exc/élite) ; dagues : 20 % Deadly Strike automod.
- Bases Sorcière : orbes (classe, rlvl-dépendants, peuvent avoir +compétences Sorcière en automod), bâtons (FCR automod, jusqu'à 6 sockets), circlets (maglvl), Archon Plate/Dusk Shroud/Mage Plate (runewords chest), Monarch (bouclier 4 sockets).
**Choix retenu :** 3 grades par famille, qlvl ×(1, ≈1,9, ≈3,0) de la base normale, stats exc = normal×1,4, élite = normal×1,8 (arrondi) ; circlet/diadem gardés pour le maglvl.

### 1.8 Superior et Low quality *(D2)*

- **Superior** : 1-2 bonus parmi {+5-15 % ED (arme : dégâts ; armure : défense), +1-3 AR (armes, choix : +10-30 AR plat), +10-15 % durabilité max}. Réparation moins chère en PD2. Compatible runeword.
- **Low quality** : dégâts/défense ×0,75, durabilité ×0,6 (choix), aucun socket via recette. Upgrade possible en normal : Low Quality Armor + El + gemme chipped / Weapon + Eld + gemme chipped (ilvl = 1).

### 1.9 Choix de sélection unique/set
Parmi les uniques/sets de la base tirée, retenir ceux avec `qlvl ≤ ilvl`, tirage pondéré par `rarity` ; aucun → rare (unique raté) / magic (set raté).

---

## 2. Tables de drop (Treasure Classes)

### 2.1 Principe récursif *(D2, structure conservée par PD2)*

Un **TC** = `{picks, noDrop, tcMods{unique,set,rare,magic}, entries[(item|TC, poids)]}`.
1. On résout `picks` :
   - `picks > 0` : `picks` tirages indépendants, chacun parmi `entries + NoDrop` (poids NoDrop ajusté au nombre de joueurs).
   - `picks < 0` : liste **garantie** : on parcourt les entrées dans l'ordre et chaque entrée est tirée `poids` fois, jusqu'à |picks| drops (NoDrop ignoré).
2. Si le résultat est un TC → récursion (le TC enfant hérite du **max** des `tcMods` rencontrés).
3. Si c'est un objet de base → génération (qualité §1.3 avec les `tcMods`, affixes §1.4).
4. **Maximum 6 objets** par événement de drop (hors or/potions supplémentaires en D2).

**TC auto-générés** `weapN` / `armoN` (N = 3, 6, …, 87) : toutes les bases d'armes/armures dont `qlvl ∈ ]N−3, N]`, pondérées par la colonne `rarity` de la base. Idem `bowN`, `meleN`.

**TC « Equip »** (ex. `Act 5 (H) Equip C`, groupe 1, niveau 85) : `weap81:2, armo81:1, weap84:6, armo84:3, weap87:14, armo87:7, weap87:1, armo87:1, Act 5 (H) Equip B:1530` (somme items 36, total 1566). Chaque maillon renvoie ~97,7 % du temps vers le maillon inférieur → **distribution ≈ uniforme sur toutes les bases de qlvl ≤ niveau du TC**, légèrement favorable aux bases récentes. Armes : armures ≈ 2:1.

**Promotion de TC** : chaque monstre a un TC de base par acte/difficulté ; si `mlvl > TC.level`, le TC est remplacé par le TC du **même groupe** au niveau le plus élevé ≤ mlvl. C'est ainsi que mlvl 85+2 (champion) accède à `weap87/armo87` (bases de qlvl ≤ 87 → toutes les élites).

### 2.2 TC-types (valeurs 1.13, Enfer)

| TC | Picks | NoDrop | Entrées (poids) | tcMods U/S/R/M |
|---|---|---|---|---|
| `Act 5 (H) H2H C` (mêlée) | 1 | 100 | Or 21, Equip C 16, Junk 21, Good 2 | 0 |
| `Act 5 (H) Cast C` (lanceurs) | 1 | 100 | Or 18, Equip C 15, Junk 18, Good 2, Magic B 7 | 0 |
| `Act 5 (H) Champ C` | −2 | 0 | Citem C ×1, Cpot C ×1 | – |
| `Act 5 (H) Citem C` | 1 | 0 | Or×1,25 60, Equip C 37, Good 3 | 800/800/800/1024 |
| `Act 5 (H) Unique C` | −3 | 0 | Uitem C ×1, Cpot C ×2 | – |
| `Act 5 (H) Uitem C` | 1 | 0 | Equip C 58, Good 4 | 800/800/800/1024 |
| `Baal (H)` / `Diablo (H)` | 7 | 15 | Or×2 5, Equip 52, Junk 5, Good 3, + trophée | 983/983/983/1024 |
| `Cow (H)` | 1 | 100 | Or 19, Equip B 19, Junk 19, Good 3 | 0 |
| `Countess Rune (H)` | 3 | 5 | Runes 12 (15) | – |
| `Act 5 (H) Good` | 1 | – | Jewelry C 60, Chipped 4, Flawed 10, Normal 14, Flawless 28, **Runes 17 : 14** | – |
| `Jewelry C` | 1 | – | Bague 8, Amulette 4, Bijou 2, Petit/Grand/Large charme 2/2/2 | – |
| `Act 5 (H) Junk` | 1 | – | Junk 2, Potion 6 : 8, Misc 2 : 4, Munitions 4 | – |

Remarques :
- **tcMod 1024 en Magic** ⇒ tout équipement issu d'un champion/unique/boss est **au moins magique**.
- Super-uniques : 800/800/972/1024 (guide purediablo). Boss d'acte : 983/983/983/1024 → unique = chance ×41/1024 ≈ ÷25.
- **Good par acte (Enfer)** : Runes 13 (A1), 14 (A2), 15 (A3), 16 (A4), 17 (A5). Cauchemar : Runes 8 → 12. Normal : A2 Runes 1-2, A3 Runes 3-4, A4 Runes 5-6, A5 Runes 7. PD2 : gemmes Flawless dès l'Acte 4 Normal, Perfect en Enfer.

### 2.3 NoDrop et nombre de joueurs

```
n = 1 + ⌊(joueursDansLaPartie − 1 + membresDuGroupeProches − 1) / 2⌋     // D2
S = somme des poids non-NoDrop
NoDrop' = ⌊ S / ( ((NoDrop + S) / NoDrop)^n − 1 ) ⌋
```
Vérif. : `Act 2 (H) H2H A` (NoDrop 100, S 60) → p1 : 62,5 % ; n = 3 : 19/79 = 24,05 % ; n = 5 : 6/66 = 9,09 % (identique aux tables du wiki PD2).
**PD2** : en solo le NoDrop équivaut à vanilla ≈ p5/5 (**n = 5**) et monte jusqu'à un peu plus que p8/8 à 8 joueurs. Exemples PD2 solo : `Act 2 (H) H2H A` 9,52 % de NoDrop (vanilla 62,5 %), `Swarm 2 (H)` 40,85 % (vanilla 83,33 %).
PD2 : les monstres gagnent **+70 % de vie par joueur** (vanilla +50 %).
**Choix retenu (solo mobile) :** `n = 5` fixe ; formule appliquée à la volée.

### 2.4 Chances par type de monstre (synthèse)

| Type de monstre | Objets | Qualité | mlvl / ilvl |
|---|---|---|---|
| Normal | 1 pick (NoDrop réduit) | tcMods 0 | niveau de zone |
| Minion d'unique | comme normal | 0 | zone +3 *(D2)* |
| Champion (pack 2-4) | 1 objet garanti (or/équip/good) + 1 potion par champion | ≥ magic, unique/set/rare ×(1−800/1024) → ≈ ×4,5 | zone +2 |
| Unique (boss de pack) | 1 objet garanti + 2 potions | ≥ magic, ×4,5 | zone +3 |
| Super-unique | TC propre | 800/800/972/1024 | niveau propre |
| Boss d'acte | 7 picks, NoDrop 15 (≈ 0 en PD2 solo) | 983/983/983/1024 | niveau propre (Baal 99) |

PD2 : Andariel Enfer (niv. 85) et Duriel Enfer (niv. 88) utilisent les mêmes pools que Mephisto et Baal ; les boss de maps sont « prime evils » ; les boss de donjons lâchent ~3× plus que les boss de maps.

---

## 3. Runes et runewords

### 3.1 Les 33 runes (effets PD2, wiki « Runes », 12/2025)

Colonne P : probabilité d'obtenir la rune **sachant qu'un tirage `Runes 17`** a lieu ; « 1/x Good » = pour un pick du TC `Act 5 (H) Good` (14/130 vers Runes 17). En *italique* les valeurs modifiées par PD2 (valeur vanilla entre parenthèses).

| # | Rune | Niv. | Arme | Casque / Armure | Bouclier / Carquois | P \| Runes17 | 1/x Good |
|---|---|---|---|---|---|---|---|
| 1 | El | 11 | +50 AR, +1 lumière | +15 Déf, +1 lumière | +15 Déf, +1 lumière | 2,31 % | 403 |
| 2 | Eld | 11 | +75 % dmg Morts-vivants, +50 AR vs MV | 15 % endurance ralentie | 7 % chance de bloquer | 1,54 % | 604 |
| 3 | Tir | 13 | +2 Mana/kill | +2 Mana/kill | +2 Mana/kill | 5,76 % | 161 |
| 4 | Nef | 13 | Knockback | +30 Déf vs projectiles | *+50* (30) Déf vs projectiles | 3,84 % | 242 |
| 5 | Eth | 15 | −25 % Déf cible | Regen Mana 15 % | Regen Mana 15 % | 8,07 % | 115 |
| 6 | Ith | 15 | +9 dmg max | 15 % dmg subis → mana | 15 % dmg subis → mana | 5,38 % | 173 |
| 7 | Tal | 17 | +75 poison / 5 s | Res Poison +30 % | Res Poison +35 % | 11,5 % | 81 |
| 8 | Ral | 19 | +5-30 Feu | Res Feu +30 % | Res Feu +35 % | 7,69 % | 121 |
| 9 | Ort | 21 | +1-50 Foudre | Res Foudre +30 % | Res Foudre +35 % | 11,5 % | 81 |
| 10 | Thul | 23 | +3-14 Froid | Res Froid +30 % | Res Froid +35 % | 7,69 % | 121 |
| 11 | Amn | 25 | 7 % vol de vie | Attaquant subit *20* (14) | Attaquant subit *24* (14) | 8,91 % | 104 |
| 12 | Sol | 27 | +9 dmg min | Dmg phys −7 | Dmg phys *−9* (−7) | 5,94 % | 156 |
| 13 | Shael | 29 | +20 % IAS | +20 % FHR | +20 % FBR | 5,35 % | 174 |
| 14 | Dol | 31 | *+20 % ED* (fuite 25 %) | Replenish Life *+20* (+7) | Replenish Life *+30* (+7) | 3,56 % | 261 |
| 15 | Hel | – | Prérequis −20 % | Prérequis −15 % | Prérequis −15 % | 2,97 % | 313 |
| 16 | Io | 35 | +10 Vit | +10 Vit | +10 Vit | 1,98 % | 469 |
| 17 | Lum | 37 | +10 Éner | +10 Éner | +10 Éner | 1,57 % | 593 |
| 18 | Ko | 39 | +10 Dex | +10 Dex | +10 Dex | 1,05 % | 889 |
| 19 | Fal | 41 | +10 For | +10 For | +10 For | 0,81 % | 1 153 |
| 20 | Lem | 43 | 75 % or | 50 % or | 50 % or | 0,54 % | 1 729 |
| 21 | Pul | 45 | +75 % dmg Démons, +100 AR vs Démons | *+50 %* (30) ED | *+50 %* (30) ED | 0,41 % | 2 274 |
| 22 | Um | 47 | *10 % Open Wounds +120 OW/s* (25 % OW) | All Res +15 | All Res +22 | 0,27 % | 3 412 |
| 23 | Mal | 49 | Empêche la régénération | Dmg magique −7 | Dmg magique *−9* (−7) | 0,28 % | 3 344 |
| 24 | Ist | 51 | 30 % MF | *30 %* (25) MF | *30 %* (25) MF | 0,19 % | 5 016 |
| 25 | Gul | 53 | *50 %* (20) bonus AR | *+4 %* (5) Res Poison max | *+4 %* (5) Res Poison max | 0,20 % | 4 743 |
| 26 | Vex | 55 | 7 % vol de mana | *+4 %* Res Feu max | *+4 %* Res Feu max | 0,13 % | 7 114 |
| 27 | Ohm | 57 | *+45 %* (50) ED | *+4 %* Res Froid max | *+4 %* Res Froid max | 0,14 % | 6 753 |
| 28 | Lo | 59 | 20 % Deadly Strike | *+4 %* Res Foudre max | *+4 %* Res Foudre max | 0,092 % | 10 130 |
| 29 | Sur | 61 | *+4 Vie/kill* (cécité) | Mana max +5 % | *+75* (50) Mana | 0,10 % | 9 132 |
| 30 | Ber | 63 | 20 % Crushing Blow | Dmg phys *−6 %* (8 %) | Dmg phys *−6 %* (8 %) | 0,068 % | 13 698 |
| 31 | Jah | 65 | Ignore Déf cible | Vie max +5 % | *+75* (50) Vie | 0,076 % | 12 266 |
| 32 | Cham | 67 | Gèle la cible +3 | Ne peut être gelé | Ne peut être gelé | 0,050 % | 18 399 |
| 33 | Zod | 69 | Indestructible | Indestructible | Indestructible | 0,019 % | 48 016 |

Structure des TC de runes (1.13, identique PD2) : `Runes N = { rune(2N−1):3, rune(2N):2, Runes(N−1):w }` avec w = 0, 2, 5, 7, 12, 22, 45, 90, 180, 360, 720, 1066, 1519, 2170, 2941, 3957 pour N = 1…16 ; `Runes 17 = { Zod:1, Runes 16:5170 }`. Rune « haute » = Vex et au-dessus (hors Hellforge).
Gemmes : inchangées (ex. Perfect Topaz arme +1-40 Foudre, casque/armure 24 % MF, bouclier Res Foudre +40 % ; Perfect Skull armure : Regen Mana 19 %, Replenish Life +5 ; Perfect Diamond bouclier All Res +19).

### 3.2 Recettes d'amélioration (PD2)

PD2 **supprime les gemmes** des recettes de runes et exige une **Key** (clé), runes en **forme empilée** :
- **3 runes + Key → rune suivante** de El (#1) jusqu'à Lem → Pul (#20 → #21).
- **2 runes + Key → rune suivante** de Pul → Um (#21 → #22) jusqu'à Cham → Zod (#32 → #33).
(vanilla : 3 El→Eld … 3 Thul + Chipped Topaz → Amn ; au-delà gemmes de plus en plus hautes ; 2 runes à partir de Pul + Flawed Diamond.)
- Gemmes : 3 chipped → flawed → normal → flawless ; **3+ flawless + Key → perfect** (jusqu'à 48 flawless → 16 perfect en une fois).
- **Pas de recette de conversion vers le bas** (ni rune→rune inférieure) dans PD2. **Choix retenu :** idem.

### 3.3 Règles des runewords

1. Base **normale ou superior** (pas low quality, pas magic/rare/set/unique ; éthéré autorisé), du **type autorisé** (casque, chest, bouclier, carquois, familles d'armes…).
2. Nombre de sockets **exactement** égal au nombre de runes, **tous vides**.
3. Runes insérées **dans l'ordre** ; à la dernière rune, l'objet devient le runeword (nom doré). Une gemme/bijou intercalé casse la recette.
4. L'objet garde : stats de base + bonus superior + effets de chaque rune (déjà inclus dans les listes ci-dessous) + stats du runeword (plages tirées à la création).
5. rlvl = max(rlvl base, niveau des runes). Hel réduit les prérequis de stats.
6. Runeword **corrompu** possible seulement si la base a été corrompue (sockets) **avant** l'insertion.

### 3.4 Runewords (sélection de 58 sur 98 — données PD2)

Légende : « / » = alternatives de base ; stats condensées. Tous les noms/runes/bases viennent du dump PD2.

| Runeword | Runes (ordre) | Soc. | Bases | Niv. | Stats principales |
|---|---|---|---|---|---|
| Steel | Tir El | 2 | Épées/Haches/Masses/Griffes | 13 | +25 % IAS, +20 % ED, +3/+3 dmg, +50 AR, 50 % OW |
| Nadir | Nef Tir | 2 | Casques | 13 | +50 % ED def, +5 For, +4-6 Mana/kill, −3 lumière, Cloak of Shadows (charges) |
| Malice | Ith El Eth | 3 | Mêlée | 15 | +33 % ED, +9 max, 100 % OW, empêche regen |
| Stealth | Tal Eth | 2 | Chests | 17 | +10 % FRW, **+20 % FCR, +20 % FHR**, +6 Dex, Regen Mana 15 %, Res Poison +30 % |
| Leaf | Tir Ral | 2 | Bâtons | 19 | **+3 compétences Feu**, +1-2 Inferno, +3 Warmth, +3 Fire Bolt, +2 Déf/niveau, Res Froid +33 % |
| Ancient's Pledge | Ral Ort Tal | 3 | Boucliers | 21 | +50 % ED, Res Froid +43, Feu/Foudre/Poison +48 %, 10 % dmg → mana |
| Zephyr | Ort Eth | 2 | Arcs/Arbalètes/Lancer | 21 | +25 % FRW, +25 % IAS, +33-66 % ED, 7 % Twister quand frappé |
| Pattern | Tal Ort Tir | 3 | Griffes | 21 | +80-120 % ED, +6 For/Dex, All Res +15 |
| Holy Thunder | Eth Ral Ort Tal | 4 | Sceptres | 21 | +21-110 Foudre, +5 % Res Foudre max, Chain Lightning (charges) |
| **Neophyte** (PD2) | Thul Tir | 2 | Orbes/Griffes/Sceptres/Massues/Bâtons | 23 | **+30 % FCR (40 % bâton)**, Dmg phys −2-4, Half Freeze Duration |
| **Spirit** (arme) | Tal Thul Ort Amn | 4 | Épées/Bâtons | 25 | +1 skills (**+2 bâton**), **+25-35 % FCR**, FHR 25 (55 bâton), +11-22 Vit, +59-82 Mana, 3-8 absorbe magie, prérequis −15 % |
| **Spirit** (bouclier) | Tal Thul Ort Amn | 4 | Boucliers | 25 | +1 skills, +25-35 % FCR, +25 % FHR, +11-22 Vit, +59-82 Mana, Res Froid/Foudre/Poison +35 % |
| Strength | Amn Tir | 2 | Mêlée | 25 | +65-95 % ED, 25 % CB, +20 For, +10 Vit |
| King's Grace | Amn Ral Thul | 3 | Sceptres/Épées/Griffes | 25 | +100 % ED, +100 % vs Démons, +50-80 Feu |
| Edge | Tir Tal Amn | 3 | Arcs | 25 | Aura Thorns 15, +35 % IAS, +5-10 attributs |
| **Purity** (PD2) | Amn Eth Thul | 3 | Hast/Lances/Bâtons/Arcs | 25 | Aura Prayer 10-12, +45 % IAS, +110-145 % ED |
| Myth | Hel Amn Nef | 3 | Chests | 25 | +1-2 Barbare, Replenish +10, Taunt/Howl |
| **Insight** | Ral Tir Tal Sol | 4 | Bâtons/Hast/Lances | 27 | **Aura Meditation 12-17**, **+35 % FCR**, +180-240 % ED, +1-6 Critical Strike, +10-20 attributs, 23 % MF |
| Lore | Ort Sol | 2 | Casques | 27 | **+1 skills**, +5-10 Éner, Res Foudre +30 %, dmg phys −7 |
| Radiance | Nef Sol Ith | 3 | Casques | 27 | +75 % ED def, +10 Vit/Éner, +33 Mana, 15 % dmg → mana |
| Honor | Amn El Ith Tir Sol | 5 | Mêlée | 27 | +1 skills, +160-200 % ED, 25 % DS, Replenish +10 |
| **Rhyme** | Shael Eth | 2 | Boucliers | 29 | +40 % FBR, +20 % blocage, Regen Mana 15 %, **All Res +25**, Cannot be Frozen, 25 % MF |
| Peace | Shael Thul Amn | 3 | Chests | 29 | +1 Amazone, +20 % FHR, Res Froid +30 % |
| **Rampage** (PD2) | Shael El Ith Eth | 4 | Hast/Lances/Bâtons | 29 | +65 % IAS, +20 % FHR, +120-145 % ED |
| White | Dol Io | 2 | Baguettes | 35 | +2 Poison&Os Nécro, +20 % FCR, +4 Skeleton Mastery |
| Black | Thul Io Nef | 3 | Massues/Marteaux/Masses | 35 | +15 % IAS, +100 % ED, 40 % CB |
| **Memory** | Lum Io Sol Eth | 4 | Bâtons | 37 | **+4 skills**, +33 % FCR, +2 Energy Shield, +2 Static Field, +50 % ED def, +10 Vit/Éner, Mana max +25-40 %, dmg magique −7 |
| **Smoke** | Nef Lum | 2 | Chests | 37 | +20 % FHR, +75 % ED def, +280 Déf vs projectiles, **All Res +30-50**, +10 Éner |
| Splendor | Eth Lum | 2 | Boucliers | 37 | +1 skills, +20-35 % FCR, +20 % FBR, +60-100 % ED, Regen 15 %, 20-30 % MF |
| **Hustle** (PD2, chest) | Shael Ko Eld | 3 | Chests | 39 | Burst of Speed 6, +20 % IAS, +20 % FHR, +10 Dex, All Res +10, Half Freeze |
| Harmony | Tir Ith Sol Ko | 4 | Arcs | 39 | Aura Vigor 10, +200-275 % ED, +55-160 Feu/Foudre/Froid |
| Melody | Shael Ko Nef | 3 | Arcs | 39 | +3 Arc&Arbalète Amazone, +20 % IAS |
| Lionheart | Hel Lum Fal | 3 | Chests | 41 | +10-25 For, +10-15 Dex, +10-20 Vit, +50 Vie, All Res +20-30 |
| **Unbending Will** (PD2) | Fal Io Ith Eld El Hel | 6 | Épées | 41 | +3 Combat Barbare, +20-30 % IAS, +300-350 % ED, 8-10 % LL, dmg phys −8 |
| Obedience | Hel Ko Thul Eth Fal | 5 | Hast/Lances/Marteaux | 41 | +280-320 % ED, −25 % res Feu ennemie, 40 % CB, All Res +20-30 |
| **Treachery** | Shael Thul Lem | 3 | Chests | 43 | +2 Assassin, +45 % IAS, +20 % FHR, Res Froid +30 %, Venom/Mind Blast CTC |
| Wealth | Lem Ko Tir | 3 | Chests | 43 | 300 % or, **100 % MF**, +10 Dex |
| Lawbringer | Amn Lem Ko | 3 | Marteaux/Sceptres/Épées | 43 | Decrepify 20 %, +150-200 % ED, 75 % or |
| Voice of Reason | Lem Ko El Eld | 4 | Épées/Masses/Sceptres/Arcs | 43 | Frozen Orb/Ice Blast CTC, +200-320 Froid, −24 % res Froid |
| Passion | Dol Ort Eld Lem | 4 | Armes | 43 | +25 % IAS, +180-230 % ED, +10 Zeal/Concentrate |
| **Wisdom** (PD2) | Pul Ith Eld | 3 | Casques | 45 | +33 % pierce, 4-8 % vol de mana, +50 % ED def, Cannot be Frozen, +5 Mana/kill |
| **Enlightenment** | Pul Ral Sol | 3 | Chests | 45 | **+2 Sorcière**, **+20 % FCR**, +5-8 Warmth, Fire Ball 28 CTC, Blaze 25 CTC, Res Feu +30 % |
| Loyalty (PD2) | Pul Tir Dol | 3 | Hast/Lances/Arcs | 45 | +2 Amazone passifs, +60 % FCR, +200-245 % ED |
| **Duress** | Shael Um Thul | 3 | Chests | 47 | **+40 % FHR**, +37-133 Froid, 15 % CB, 33 % OW, +150-200 % ED def, Res Froid +45 % |
| Stone | Shael Um Pul Lum | 4 | Chests | 47 | Indestructible, +1 skills, +60 % FHR, +250-340 % ED def, All Res +15 |
| Gloom | Fal Um Pul | 3 | Chests | 47 | +20-40 % FHR, +220-280 % ED def, **All Res +45**, +20 % res malédictions |
| Crescent Moon | Shael Um Tir | 3 | Haches/Épées/Hast/… | 47 | Lightning 27 & Static 13 CTC, +180-220 % ED, −10-15 % res Foudre |
| **Prudence** (PD2) | Mal Tir | 2 | Chests | 49 | **+40 % FCR, +25 % FHR**, +140-170 % ED def, All Res +25-35, dmg phys −5-13, dmg magique −13-17 |
| Rain | Ort Mal Ith | 3 | Chests | 49 | +2 Druide, +100-150 Mana, Res Foudre +30 % |
| Sanctuary | Ko Ko Mal | 3 | Boucliers | 49 | +20 % FHR/FBR, +20 % blocage, All Res +40-50 |
| Venom | Tal Dol Mal | 3 | Armes | 49 | Poison Nova 28 CTC, +400 poison, −20-30 % res Poison |
| Oath | Shael Pul Mal Lum | 4 | Épées/Haches/Masses | 49 | Indestructible, +50 % IAS, +210-340 % ED, Bone Spirit CTC |
| Rift | Hel Ko Lem Gul | 4 | Sceptres/Hast/Lances/Épées | 53 | Tornado/Frozen Orb CTC, +160-250 magie, +60-180 Feu, +15-30 attributs |
| Principle | Ral Gul Eld | 3 | Chests | 53 | +2 Paladin, +50-100 Vie, Holy Bolt CTC |
| **Flickering Flame** (PD2) | Nef Pul Vex | 3 | Casques | 55 | Aura Resist Fire 1-6, **+2 compétences Feu**, **−5-10 % res Feu ennemie**, +65-75 Mana, +4 % Res Feu max |
| **Heart of the Oak** | Ko Vex Pul Thul | 4 | Bâtons/Masses | 55 | **+3 skills, +30 % FCR**, Replenish +20, Mana max +15 %, All Res +20-30, Oak Sage/Raven charges |
| Death | Hel El Vex Ort Gul | 5 | Épées/Haches | 55 | Indestructible, +275-320 % ED, 50 % CB, Glacial Spike CTC |
| Silence | Dol Eld Hel Ist Tir Vex | 6 | Armes | 55 | Aura Thorns 23-25, +2 skills, +20 % IAS/FHR, All Res +50, 30 % MF |
| Chaos | Fal Ohm Um | 3 | Griffes | 57 | Frozen Orb 30 & Charged Bolt 40 CTC, +245-295 % ED |
| **Call to Arms** | Amn Ral Mal Ist Ohm | 5 | Armes | 57 | +1 skills, +2-6 Battle Orders, +2-6 Battle Command, +1-3 Battle Cry, +245-285 % ED, 30 % MF |
| Exile | Vex Ohm Ist Dol | 4 | Boucliers | 57 | Aura Defiance 13-16, +2 auras offensives Paladin, +220-260 % ED def |
| **Fortitude** (armure) | El Sol Dol Lo | 4 | Chests | 59 | +25 % FCR, +250-300 % ED, +200 % ED def, +1-1,5 Vie/niveau, All Res +25-30, +4 % Res Foudre max, 12 % dmg → mana |
| **Fortitude** (arme) | El Sol Dol Lo | 4 | Armes | 59 | +25 % FCR, +325-375 % ED, 20 % DS, +1-1,5 Vie/niveau, All Res +25-30 |
| **Grief** | Eth Tir Lo Mal Ral | 5 | Épées/Haches/Hast/Lances | 59 | +30-40 % IAS, **+280 à 320-360 dmg**, Venom 15 CTC, +1,875 %/niv vs Démons, +10-15 Vie/kill |
| **Epiphany** (PD2) | Lo Ith Lo Ist | 4 | Boucliers | 59 | Energy Shield 16 équipé, Static Field 27 CTC, **+20 % FCR**, +1-750 Foudre, +10-15 attributs, Mana max +28-35 %, +8 % Res Foudre max, 30 % MF |
| Bramble | Ral Ohm Sur Eth | 4 | Chests | 61 | Aura Thorns 18-21, +50 % FHR, +40-50 % poison |
| **Dragon** (chest/bouclier) | Sur Lo Sol | 3 | Chests/Boucliers | 61 | **+1 Hydre supplémentaire, +4-5 Hydra**, Hydra 40 CTC, aura Holy Fire 12, +400-550 Déf, +4 % Res Foudre max |
| Wind | Sur El | 2 | Mêlée | 61 | Tornado/Twister 35 CTC, +40 % IAS, +320-380 % ED |
| **Chains of Honor** | Dol Um Ber Ist | 4 | Chests | 63 | **+2 skills**, +200 % vs Démons/MV, 8 % LL, +20 For, Replenish +20, **All Res +50-60**, −5 % dmg phys, 30 % MF |
| **Infinity** | Ber Mal Ber Ist | 4 | Hast/Lances/Bâtons | 63 | **Aura Conviction 12**, Chain Lightning CTC, +35 % FRW, +35 % FCR (bâton), **−45-55 % res Foudre**, 30 % MF |
| Beast | Ber Tir Um Mal Lum | 5 | Haches/Sceptres/Marteaux/Bâtons | 63 | Aura Fanaticism 8-10, +40 % IAS, +260-290 % ED, +6 Werebear/Maul |
| Wrath | Pul Lum Ber Mal | 4 | Arcs | 63 | Amplify Damage 31 CTC, +375 % vs Démons |
| Eternity | Amn Ber Ist Sol Sur | 5 | Mêlée | 63 | Indestructible, +260-310 % ED, +4 Revive, +6 Revives |
| **Enigma** (PD2) | Jah Ith Ber | 3 | Chests | 65 | **+2 skills**, +25 % FRW, **Blink niv. 1 (5 charges, +1/3 s)**, +500-775 Déf, +0,5-0,75 For/niv, Vie max +5 %, −5 % dmg phys, 15 % dmg → mana, MF +0,5-0,75/niv |
| **Dream** (casque/bouclier) | Io Jah Pul | 3 | Casques/Boucliers | 65 | Aura Holy Shock 14, +20-30 % FHR, +150-220 Déf, All Res +10-20, +0,625 Mana/niv, 20-30 % MF |
| **Phoenix** (bouclier/arme) | Vex Vex Lo Jah | 4 | Boucliers/Armes | 65 | Aura Redemption 10-12, Firestorm 40 CTC, **−28 % res Feu ennemie**, +8 % Res Feu max (bouclier) |
| Faith | Ohm Jah Lem Eld | 4 | Arcs | 65 | Aura Fanaticism 12-15, +325-345 % ED |
| Famine | Fal Ohm Ort Jah | 4 | Haches/Marteaux/Épées | 65 | +325-375 % ED, −10-15 % res Feu/Foudre/Froid |
| **Last Wish** | Jah Mal Jah Sur Jah Ber | 6 | Haches/Marteaux/Épées/Bâtons | 65 | Aura Might 19, +350-400 % ED, 60-70 % CB, Charged Bolt 40 CTC, MF +0,5/niv |
| Destruction | Vex Lo Ber Jah Ko | 5 | Épées/Hast/Lances/Bâtons | 65 | Meteor 45 / Nova 40 / Frost Nova 35 / Molten Boulder 35 CTC |
| **Doom** | Hel Ohm Um Lo Cham | 5 | Haches/Marteaux/Hast/…/Bâtons | 67 | Aura Holy Freeze 16, +2 skills, **−30-50 % res Froid**, +30 % FCR (bâton) |
| **Mist** (PD2) | Cham Shael Gul Thul Ith | 5 | Arcs/Arbalètes | 67 | Aura Concentration 12-14, +2 skills, 100 % pierce, +325-375 % ED, All Res +40 |
| **Plague** | Cham Fal Um | 3 | Armes | 67 | Aura Cleansing 15-17, +1-2 skills, +20 % FCR, −20 % res Poison, Lower Resist 35 quand frappé |
| Hand of Justice | Sur Cham Amn Lo | 4 | Armes | 67 | Aura Holy Fire 12, −10-20 % res Feu, Meteor 48 à la mort |
| Pride | Cham Sur Io Lo | 4 | Hast/Lances/Bâtons | 67 | Aura Concentration 18-20, +4 %/niv dmg max |
| **Obsession** (PD2) | Zod Ist Lem Lum Io Nef | 6 | Bâtons | 69 | Indestructible, **+4 skills**, +15 % FCR, +60 % FHR, Vie max +15-25 %, Regen Mana 15-30 %, **All Res +60-70**, 30 % MF |
| Breath of the Dying | Vex Hel El Eld Zod Eth | 6 | Armes | 69 | Indestructible, +60 % IAS, +350-400 % ED, +30 attributs |
| **Innocence** (PD2) | Gul Lem Zod Hel | 4 | Chests | 69 | Indestructible, Blade Shield 8-12, +2 skills, +200-275 % ED def, prérequis −25 % |
| **Ferocity** (PD2) | Zod Cham Shael | 3 | Casques | 69 | Indestructible, +20 % FHR, 10-12 % LL, +18 Zeal, +150-200 % ED def |
| **Zenith** (PD2) | Jah Zod Ort Thul Ral | 5 | Hast/Lances/Bâtons/Arcs/Épées 2M | 69 | Aura Salvation 10-12, +2 skills, +20 % FRW, +40 % IAS, gros dmg élémentaires |
| **Asylum** (PD2) | Gul Cham Hel Jah Dol Um | 6 | Armes 2M sauf haches | 67 | Aura Sanctuary 17-20, +2 skills, Fist of the Heavens 40 CTC |
| **Shattered Wall** (PD2) | Zod Jah Ral Cham | 4 | Boucliers Paladin | 69 | Aura Holy Freeze 16, +60 % FBR, +125-175 Vie |

**Runewords « cœur » pour une Sorcière mobile** : Stealth, Lore, Ancient's Pledge, Spirit, Leaf, Neophyte, Insight (mercenaire), Rhyme, Smoke, Memory, Enlightenment, Prudence, Duress, Flickering Flame, Heart of the Oak, Epiphany, Chains of Honor, Enigma, Infinity (merc), Dream, Phoenix, Doom, Plague, Obsession.
**Choix retenu :** implémenter ces 24 + ~16 génériques ci-dessus (≈ 40), stats en plages tirées à la création.

---

## 4. Recettes du Cube Horadrique (PD2)

Règles générales PD2 : gemmes Flawless/Perfect et runes **empilables** ; les recettes n'acceptent que la **forme empilée** (sauf mention). Cube 4×4. Les recettes de **modification** conservent les affixes ; les recettes de **création** les remplacent.

### 4.1 Sockets

| Ingrédients | Résultat | Conditions |
|---|---|---|
| Ral + Amn + Perfect Amethyst + arme normale « standard » | +1-6 sockets (équiprobable, plafonné par la base/ilvl) | 0 socket, pas superior/inferior (PD2 : superior accepté) |
| Tal + Amn + Perfect Ruby + bouclier normal | +1-4 sockets | idem |
| Tal + Thul + Perfect Topaz + chest normal | +1-4 sockets | idem |
| Ral + Thul + Perfect Sapphire + casque normal | +1-3 sockets | idem (ex. Grim Helm : 1 socket 1/6, 2 sockets 5/6) |
| **Larzuk's Puzzlebox** + objet | 2M : +2-4 ; autres : +1-2 (équiprobable) | tout objet sans socket (y c. unique/set) ; drop ≈ Vex |
| **Larzuk's Puzzlepiece** + objet non unique/set | 2M : +2-4 ; autres : +1-2 | drop ≈ Mal |
| **Larzuk's Malus** + objet | +1 socket | acheté chez Larzuk |
| Hel + Parchemin de TP + objet serti | détruit le contenu des sockets | |
| *(legacy)* 3 Perfect Skull + SoJ + rare | +1 socket | |

Seuls casques, chests, boucliers (et carquois) et armes non-jet peuvent gagner des sockets, uniquement s'ils en ont 0.

### 4.2 Amélioration normal → exceptionnel → élite

| Ingrédients | Résultat |
|---|---|
| Ral + Sol + Perfect Emerald + arme **unique/set** normale | version exceptionnelle |
| Tal + Shael + Perfect Diamond + armure unique/set normale | version exceptionnelle |
| Lum + Pul + Perfect Emerald + arme unique/set exceptionnelle | version élite |
| Ko + Lem + Perfect Diamond + armure unique/set exceptionnelle | version élite |
| Ort + Amn + Perfect Sapphire + arme **rare/craftée** normale | exceptionnelle |
| Ral + Thul + Perfect Amethyst + armure rare/craftée normale | exceptionnelle |
| Fal + Um + Perfect Sapphire + arme rare/craftée exceptionnelle | élite |
| Ko + Pul + Perfect Amethyst + armure rare/craftée exceptionnelle | élite |

Les affixes sont conservés ; prérequis = ceux de la nouvelle base (PD2 : pas de +5/+7 niveaux). Circlet → Coronet. Armure avec %ED : défense de base re-tirée.

### 4.3 Relances (« reroll »)

| Ingrédients | Résultat | Restrictions |
|---|---|---|
| Objet **magique** + 3 gemmes Perfect (quelconques) | nouvel objet magique même base, même ilvl | pas corrompu, pas map |
| Objet **rare** + 6 Perfect Skulls | nouveau rare, ilvl = ⌊0,4·clvl⌋ + ⌊0,4·ilvl⌋ | pas corrompu, pas map |
| Rare + Perfect Skull + SoJ *(legacy)* | ilvl = ⌊0,66·clvl⌋ + ⌊0,66·ilvl⌋ | |
| **Demonic Cube** + unique/set (arme, armure, accessoire) | relance des plages de stats, sockets conservés | pas corrompu/miroir/runeword ; drop Lucion 1/75 (T1), 1/50 (T2) |
| 3 amulettes magiques | bague magique, ilvl = ⌊0,75·clvl⌋ | |
| 3 bagues magiques | amulette magique, ilvl = ⌊0,75·clvl⌋ | |
| Arme magique + 3 chipped gems | arme magique socketée 1-2 (ilvl 25) | |
| Bague magique + Perfect Ruby/Sapphire/Topaz/Emerald + potion ad hoc | bague Garnet/Cobalt/Coral/Jade (res +21-30 %, ilvl 30) | |
| Amulette magique + 6 Perfect (1 de chaque, sauf crâne) | amulette Prismatic (All Res +16-20, ilvl 50) | |

### 4.4 Autres modifications

| Ingrédients | Résultat |
|---|---|
| Ort + arme non-éthérée | réparation + recharge (vanilla : + chipped gem) |
| Ral + armure non-éthérée | réparation + recharge |
| Zod + Perfect Skull + objet | réparation/recharge, y compris éthéré |
| **Vial of Lightsong** + objet | devient éthéré (drop 1/7,5 M) |
| **Lilith's Mirror** + objet magic/rare/craft | dupliqué, marqué « mirrored » (plus aucune recette) (drop 1/25 M) |
| **Worldstone Shard** + objet/map | corruption (§5) |
| Tainted Worldstone Shard + Annihilus | corruption d'Annihilus |
| Low quality armure + El + chipped gem / arme + Eld + chipped gem | version normale (ilvl 1) |
| 1-15 bijoux + Key | 1-15 Jewel Fragments (ingrédient empilable) |
| 4 Essences (Suffering/Hatred/Terror/Destruction) | Token of Absolution (reset stats/compétences) |

### 4.5 Promotions de gemmes/runes
Voir §3.2 (3 chipped→flawed→normal→flawless sans clé ; 3 flawless + Key → perfect ; runes + Key, 3:1 jusqu'à Pul, 2:1 ensuite).

### 4.6 Craft (PD2)

Recette : **objet magique ou rare** de la catégorie + **bijou quelconque** + **rune** + **gemme Perfect** (ou « Craft Infusion » + base seule). ilvl = ⌊clvl/2⌋ + ⌊ilvl_base/2⌋ ; affixes aléatoires supplémentaires : ilvl 1-30 : 1 (40 %) / 2 (20 %) / 3 (20 %) / 4 (20 %) ; 31-50 : 2 (60 %) / 3 / 4 (20 % chacun) ; 51-70 : 3 (80 %) / 4 (20 %) ; 71+ : 4. Toute base sauf circlet ; base éthérée → craft éthéré ; craft améliorable comme un rare.

Grille des ingrédients (rune + gemme Perfect) :

| Slot | Blood (P.Ruby) | Caster (P.Amethyst) | Hitpower (P.Sapphire) | Safety (P.Emerald) | Vampiric (P.Skull) | Bountiful (P.Topaz) | Brilliant (P.Diamond) |
|---|---|---|---|---|---|---|---|
| Amulette | Amn | Ral | Thul | Thul | Dol | Ko | Tal |
| Bague | Sol | Amn | Amn | Amn | Hel | Lum | Hel |
| Ceinture | Tal | Ith | Tal | Tal | Eld | El | Io |
| Gants | Nef | Ort | Ort | Ral | Io | Hel | Shael |
| Bottes | Eth | Thul | Ral | Ort | El | Io | Ko |
| Casque | Ral | Nef | Ith | Ith | Lum | Tir | Eld |
| Chest | Thul | Tal | Nef | Eth | Tir | Eld | El |
| Bouclier | Ith | Eth | Eth | Nef | Sol | Dol | Ort |
| Arme | Ort | Tir | Tir | Sol | Shael | Shael | Sol |

**Caster (affixes fixes PD2)** — Amulette : +5-10 % FCR, Regen Mana 4-10 %, +10-20 Mana ; Bague : +5-10 Éner, +1-2 Mana/kill, +10-20 Mana ; Ceinture : +10 % FCR, Regen 4-10 %, +10-20 Mana ; Gants : +1-3 Mana/kill, +5-10 % FCR, +10-20 Mana ; Bottes : Mana max +10-15 %, Regen 4-10 %, +10-20 Mana ; Casque : +10 % FCR, Regen 5-10 %, +10-20 Éner ; Chest : +3-6 Mana/kill, +10-15 % FCR, +15-25 Éner ; Bouclier : +10-20 % blocage, +10 % FCR, +20-30 % Mana max ; Arme : **+1 skills**, +10-20 % FCR, +10-20 Mana.
Blood (ex.) — Amulette : +10 % FRW, +3-6 Vie/kill, +10-20 Vie ; Chest : +4-6 Vie/kill, +30-50 % ED, Vie max +5-8 %.

**Choix retenu (mobile) :** implémenter Blood, Caster, Safety (déf/res) et Brilliant ; même grille d'ingrédients.

### 4.7 Maps (Cube) — voir §6.4

### 4.8 Accès aux boss (résumé)
Key of Terror + Hate + Destruction → mini-ubers (Harrogath, Enfer) ; Mephisto's Brain + Diablo's Horn + Baal's Eye → Pandemonium Talisman (Uber Tristram) ; 3 Sigils (Madawc T1 / Talic T2 / Korlic T3, 1/6400 en maps) → Relic of the Ancients ; Prime Evil Soul + Black Soulstone + Pure Demonic Essence → Vision of Terror (DClone) ; Trang-Oul's Jawbone + Splinter of the Void + Hellfire Ashes → Voidstone (Rathma) ; Demonic Insignia + Talisman of Transgression + Flesh of Malic → Shadow of Hatred (Lucion). Voidstone/Vision/Shadow + Cube → cycle de difficulté 0/1/2.

---

## 5. Corruptions (PD2)

### 5.1 Mécanique
- Objet : **Worldstone Shard** (drop partout ; plus fréquent en zones corrompues, par les Dark Wanderers en map). Cube : Shard + objet.
- **Une seule corruption par objet** ; état « **Corrupted** » (texte rouge) : **ne peut plus être corrompu** mais **reste modifiable par presque toutes les autres recettes** (sockets par Puzzlebox, upgrade, runeword si c'était une base normale, Demonic Cube interdit). Exception : **Desecration** (S10) au Temple of the Triune après Lucion : 2e modificateur de corruption **sur amulette uniquement** (50/55/60 % de réussite selon difficulté T0/T1/T2).
- **Choix retenu (mobile) :** l'état Corrupted bloque **toute** modification ultérieure (plus simple, conforme à la commande) sauf l'insertion de runes/gemmes dans des sockets existants.

### 5.2 Probabilités d'issues

| Catégorie d'objet | Sockets | Modificateur | Devient rare aléatoire (« brick ») | Rien |
|---|---|---|---|---|
| **Normal/superior/low quality** sans socket (base) | 50 % → **nombre max** de sockets de la base | – | 50 % | – |
| Normal qui ne peut pas avoir de sockets | – | – | 50 % | 50 % |
| Autre (magic/rare/set/unique/craft) **pouvant** avoir des sockets (0 socket) | 25 % | 50 % (24 % faible, 16 % moyen, 10 % fort) | 25 % | – |
| Autre **ne pouvant pas** avoir de sockets (bijoux, gants, bottes, ceintures, objets déjà sertis) | – | 75 % (36 / 24 / 15 %) | 25 % | – |
| Map magic/rare/donjon | – | 100 % (1 % → map unique aléatoire) | – | – |

- Rareté du modificateur : **faible 48 %, moyenne 32 %, forte 20 %** (armes : 50/30/20) ; chaque ligne de la table est équiprobable dans sa colonne.
- Nombre de sockets (objet non normal) : **armures** (casque/chest/bouclier) 1-3 : 48 / 28 / 24 % ; **arme 1M** 2-4 : 48 / 28 / 24 % ; **arme 2M** 3-6 : 30 / 28 / 24 / 18 % — plafonné par la base et l'ilvl.
- « Brick » : l'objet est remplacé par un **rare aléatoire de même base**, conserve l'éthéré, et reçoit **en plus** une corruption (sockets ou modificateur).
- Runeword : impossible (déjà serti) ; un runeword « corrompu » a été fait sur une base corrompue.
- Stratégie documentée : corrompre **avant** Puzzlebox (sinon 75 % mod mais 25 % brick quand même).

### 5.3 Tables de modificateurs par type d'objet (wiki PD2, 06/2026)

**Armes** (faible 50 % / moyenne 30 % / forte 20 %)
| Faible | Moyenne | Forte |
|---|---|---|
| +40-80 % ED | +20 % FCR | +1 à toutes les compétences |
| +150-250 AR | +30-40 % IAS | +30 % IAS, 20-30 % CB |
| +100-150 % dmg Démons, +200 AR Démons | +40-60 % ED, 5 % LL | +80-120 % ED, +20 % IAS |
| +100-150 % dmg MV, +200 AR MV | −40-60 déf cible/coup | +80-120 % ED, +250 AR |
| +10 % FCR | 20-30 % CB | +50-70 % ED, 25 % DS |
| +3-6 Vie/coup | 20-30 % DS | +60-80 % ED, ignore déf |
| +3-6 Vie/kill | −7-10 % res Feu ennemie | +10 % FCR, +5 % dmg Feu |
| +3-5 Mana/kill | −7-10 % res Froid ennemie | +10 % FCR, +5 % dmg Froid |
| 20-30 % MF | −7-10 % res Foudre ennemie | +10 % FCR, +5 % dmg Foudre |
| Prérequis −25-50 % | −7-10 % res Poison ennemie | +10 % FCR, +5 % dmg Poison |

**Boucliers** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +20-30 % FHR | Indestructible, +50-80 % ED | +1 skills |
| +20 % FBR | +10 % FCR | +10 % res malédictions |
| 20-30 % MF | +10 % FBR, 10-20 % blocage | All Res +20-25 |
| +30-40 Vie | Vie max +4-6 % | dmg phys −6-8 % |
| Res Feu/Froid/Foudre/Poison +35-40 % (4 lignes) | dmg phys −6-10 ; dmg magique −6-10 ; Attaquant subit 4-6/niv ; Cannot be Frozen | +4-5 % Res max (Feu/Froid/Foudre/Poison) + res +15-20 % (4 lignes) |

**Chests** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +20-30 % FHR | Indestructible, +50-80 % ED | +1 skills |
| +50-80 % ED | +10 % FCR | +10 % res malédictions |
| 20-30 % MF | +20 % FRW | All Res +20-25 |
| +30-40 Mana | Vie max +4-6 % | dmg phys −6-8 % |
| Res élémentaire +30-35 % (4 lignes) | dmg phys −6-10 ; dmg magique −6-10 ; Attaquant subit 4-6/niv ; Cannot be Frozen | +4-5 % Res max + res +15 % (4 lignes) |

**Casques** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +20-30 % FHR | Indestructible, +50-80 % ED | +1 skills |
| +50-80 % ED | +150-250 AR, +2-4 lumière | +10 % res malédictions |
| 20-30 % MF | 3-5 % LL | All Res +15-20 |
| Replenish +20-30 | 3-5 % ML | dmg phys −4-6 % |
| Res élémentaire +30-35 % (4 lignes) | Vie max +4-6 % ; +3-4 Vie/kill ; +3-4 Mana/kill ; Cannot be Frozen | +4-5 % Res max + res +15 % (4 lignes) |

**Bottes** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +50-80 % ED | Indestructible, +50-80 % ED | +15 % FRW |
| Regen Mana 10-15 % | +10 % FBR | 20 % durée malédictions réduite |
| 50-100 % or | +10 % FHR | dmg phys −3-4 % |
| 10-25 % MF | +20-40 Vie | 10 % blocage |
| Res élémentaire +15-20 % (4 lignes) | All Res +5-8 ; +2-3 Vie/kill ; +2-3 Mana/kill ; Replenish +15-25 | +2-3 % Res max + res +10 % (4 lignes) |

**Gants** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +50-80 % ED | +10-15 % pierce | +10 % FCR |
| Regen Mana 20-30 % | +10-20 % FBR | +10 % IAS |
| 50-100 % or | +100-150 AR | 10 % blocage |
| 10-25 % MF | 2-3 % LL | +30-40 % ED (dmg) |
| Res Feu/Froid/Foudre/Poison +10-15 % (4 lignes) | 2-3 % ML ; +3-6 attributs ; +20-40 Vie ; Replenish +15-20 | −15-25 % déf cible ; 10 % DS ; +3-4 Mana/kill ; All Res +5-8 |

**Ceintures** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +7-10 For / Dex / Vit / Éner (4 lignes) | +10-15 % pierce ; +10 % FHR ; +3-6 attributs ; Replenish +15-20 | +10 % FCR ; +10 % IAS ; +10 % FRW ; 20 % durée malédictions |
| Res Feu/Froid/Foudre/Poison +10-15 % (4 lignes) | +100-150 AR ; Attaquant subit 2-4/niv ; 60-100 % or ; 20-30 % MF | 10 % blocage ; +2 % à toutes les Res max ; All Res +5-8 ; dmg phys −3-4 % |

**Bagues** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +7-10 For / Dex / Vit / Éner | +100-150 AR ; +2-3 Vie/kill ; +2-3 Mana/kill ; dmg phys −4-6 | +10 % FCR ; +10 % FRW ; 10 % durée malédictions ; 3-4 % ML |
| Res Feu/Froid/Foudre/Poison +10-15 % | dmg magique −4-6 ; +30-40 Vie ; 40-80 % or ; 15-20 % MF | 3-4 % LL ; +4-6 attributs ; All Res +4-6 ; dmg phys −3 % |

**Amulettes** (48/32/20)
| Faible | Moyenne | Forte |
|---|---|---|
| +6-12 For / Dex / Vit / Éner | +10-20 % pierce ; +10 % FHR ; 10 % blocage ; +2-3 Vie/kill | +1 skills ; +10 % FCR ; +10 % FRW ; +10 % res malédictions |
| Res Feu/Froid/Foudre/Poison +15-20 % | +2-3 Mana/kill ; +6-8 attributs ; 60-100 % or ; 20-30 % MF | +30-40 % ED ; Cannot be Frozen ; +2 % à toutes les Res max ; All Res +7-10 |

**Carquois** : faible FHR/Vie/or/MF/res ; moyenne FRW/pierce/−res ennemie/AR/leech ; forte +1 skills, +10 % IAS, +10 % res malédictions, +30-40 % ED, +10-15 min/max, ignore déf, All Res +5-10.

**Bijoux / charmes** : **non corruptibles** dans PD2 (seul Annihilus via Tainted Shard : +1 skills / +20-25 Vit & +10-15 Éner / All Res +5-10 / +3-5 % XP, 20 % chacun, ou 20 % → petit charme magique aléatoire).
**Choix retenu (mobile) :** bijoux corruptibles avec la table « Bague » (75 % mod / 25 % brick) pour donner un puits à Worldstone Shards — **écart assumé** vis-à-vis de PD2.

### 5.4 Corruption de maps

Toujours un modificateur (3 paliers = T1/T2/T3), 1 % → map unique aléatoire :

| Modificateur | Valeur T1 / T2 / T3 | Bonus XP | Densité | Rareté monstres | MF/GF |
|---|---|---|---|---|---|
| Monstres X % Deadly Strike | 5-10 / 10-15 / 15-20 | 4-6 / 6-8 / 8-10 | 30-40 / 40-50 / 50-60 | – | – |
| Monstres +X % Vie + Cannot be Frozen | 5-15 / 15-25 / 25-35 | 6-8 / 8-10 / 10-12 | 30-40 / 40-50 / 50-60 | – | – |
| Joueurs −X % vitesse attaque/incantation | 5-15 / 15-25 / 25-35 | – | 30-60 | 10-25 | – |
| Joueurs −X % PDR | 5-10 / 10-15 / 15-20 | – | 30-60 | 10-25 | – |
| Joueurs −X % Res max | 2-3 / 3-4 / 4-5 | – | 30-60 | 10-25 | – |
| Joueurs +X % vitesse & vélocité | 20-30 / 30-40 / 40-50 | – | – | 10-25 | – |
| MF & GF de zone | – | – | – | 10-25 | 50 / 75 / 100 |
| Densité | – | – | 60-80 / 80-100 / 100-120 | – | – |
| +1 niveau de zone | – | – | 15-30 | – | – |
| Rareté des monstres | – | – | – | 30-60 | – |
| 1 % bijoux & charmes en plus | – | – | – | – | – |

**Zones corrompues** (Enfer, Baal tué) : une zone vanilla tirée toutes les 15 min passe niveau 85, densité ↑, drop de Worldstone Shards et de maps T1 ↑.

---

## 6. Maps (PD2)

### 6.1 Accès et règles
- Ouvrir une map : clic droit à Harrogath en **Enfer**, personnage **niv. 80+** ayant tué les Anciens (Enfer). **1 map (ou zone uber) par partie**.
- Sources : T1 rares en Enfer et Acte 5 Cauchemar ; surtout **depuis les maps** (chaque palier peut lâcher le palier supérieur) ; Anya : 3 maps T1 normales en Enfer (General Changes ; la page Maps dit 1 → **Choix retenu : 3**) ; événements (Horazon : 6 maps, 10 % unique ; Treasure Fallen).
- 28 nouvelles zones au total.

### 6.2 Paliers et niveaux de zone

| Palier | Niveau de zone | Maps |
|---|---|---|
| **Tier 1** | 87 | Torajan Jungle, Tomb of Zoltun Kulle, Shadows of Westmarch, Phlegethon, Lost Temple, Ancestral Trial, Fall of Caldeum, Ruins of Viz-Jun |
| **Tier 2** | 88 | Throne of Insanity, Sewers of Harrogath, Sanatorium, Ruined Cistern, Pandemonium Citadel, Horazon's Memory, Halls of Torture, Canyon of Sescheron, Ashen Plains |
| **Tier 3** | 89 | Blood Moon, Kehjistan Marketplace, Kyovashad, Arreat Battlefield, Bastion Keep, Demon Road, River of Blood, Royal Crypts, Skovos Stronghold |
| **Tier 4 = Donjons** | 90 | Plains of Torment, Sanctuary of Sin, Steppes of Daken-Shar (difficiles, groupe) |
| **Uniques** | 87-90 (palier propre) | City of Ureh (T3), Djinn's Domain (T2), Fallen Gardens (T2), Imperial Palace (T3 +1 → 90), Na-Krul's Abyss (T1), Outer Void, Warlord of Blood, Zhar's Sanctum (T1 +2 → 89) |

Champions/uniques = zone +2/+3 → **ilvl 89-93** en T3 ; donjons : **+200 % XP**, 75 % réduction de durée des malédictions, monstres « prime evil », au moins un type à **140 % de résistance** dans chaque élément ; boss de donjon : 1/20 Horadrim Scarab, ~3× le butin d'un boss de map ; 2e boss accessible après le 1er.
**Monstres « prime evil »** (boss de maps, donjons, ubers, boss d'acte) : 90 % de réduction de dégâts et 90 % de PV (neutre en solo), dégâts ×2 aux sbires/mercenaires, immunisés aux ralentissements (froid, Decrepify…), à Dim Vision/Terror/Confuse/Attract et à la suppression de res physique de Sanctuary.
Immunités de maps standard : chaque map a 1-3 types d'immunités à 105-120 % (ex. T1 Phlegethon : Feu 120, Poison 120 ; T3 Blood Moon et Kyovashad : aucune immunité). Les maps uniques n'ont **aucun** monstre immunisé.

### 6.3 Raretés et affixes de map

| Rareté | Affixes | Événement aléatoire | Améliorable par |
|---|---|---|---|
| Normale (blanche) | 0 | 11 % | Arcane (→ magic), Zakarum (→ rare) |
| Magique | 1-2 (1 P + 1 S) | 22 % | Angelic (→ rare), Worldstone Shard, Catalyst |
| Rare | 3-6 (3 P + 3 S) — **Choix retenu : 4-6** | 33 % | Horadrim (reroll), Shard, Catalyst, Scarab (T3 → donjon) |
| Unique | fixes | – | seulement Standard of Heroes et Orb of Fortification |

- Chaque affixe a 3 plages : T1 tire la plage 1, T2 plages 1-2, T3 plages 2-3 ; donjons : plage 3.
- Valeurs moyennes d'une map rare : T1 +71 % densité, +14 % XP, +50 % MF/GF ; T2 +78 / +16 / +75 ; T3 +85 / +18 / +100. Maxima (hors modifs) : T1 130 / 38 / 170 ; T2 155 / 46 / 240 ; T3 180 / 54 / 320.

**Liste des affixes de map** (P/S ; valeur X T1/T2/T3 ; bonus XP % ; densité % ; MF/GF %) :

| Affixe | P/S | Effet | X | XP | Densité | MF/GF |
|---|---|---|---|---|---|---|
| Cracking | S | Joueurs −X % défense | 20-30 / 30-40 / 40-50 | – | 13-18 / 15-18 / 18-20 | 15-20 / 30-35 / 45-50 |
| Fumbling | S | Joueurs −X % blocage | 10-20 / 20-30 / 30-40 | – | 13-25 | 15-50 |
| Imbalance | S | Joueurs −X % FHR | 10-20 / 20-30 / 30-40 | 3-6 | 15-30 | – |
| Hindrance | S | Joueurs −X % toutes Res | 10-15 / 15-20 / 20-25 | 4-7 | – | 15-20 / 30-35 / 50-55 |
| Unhealthy | P | Joueurs −X Drain Life | 30-40 / 50-60 / 70-80 | 3-6 | – | 5-10 / 20-25 / 35-40 |
| Warding | S | Monstres −X % durée malédictions | 20-40 / 40-60 / 60-80 | 5-8 | – | 20-55 |
| Leech | S | Monstres +X % Vie et X % LL | 10-15 / 15-20 / 20-25 | 5-8 | 13-20 | – |
| Health / Large | S / P | Monstres +X % Vie | 5-15 / 15-25 / 25-35 | 6-12 | 15-30 | – |
| Fast | P | Monstres +X % vitesse attaque/incantation | 40-60 / 60-80 / 80-100 | 3-6 | 15-30 | – |
| Swiftness | S | Monstres +X % vélocité | 20-30 / 30-40 / 40-50 | 3-6 | 15-30 | – |
| Protection | S | Monstres −X dmg phys | 100-200 / 300-400 / 500-600 | – | 13-23 | 15-50 |
| Resilience | S | Monstres +X % FHR | 40-60 / 60-80 / 80-100 | – | 15-30 | 10-45 |
| Silver | P | Monstres +X % AR et pierce | 30-50 / 50-70 / 70-90 | – | 8-20 | 15-50 |
| Crushing | P | Monstres X % CB | 15-25 / 25-35 / 35-45 | – | 8-20 | 5-40 |
| Bloody | P | Monstres X % Open Wounds | 5-10 / 10-15 / 15-20 | 4-7 | – | 5-40 |
| Strong | P | Monstres +X % dmg phys | 10-15 / 15-20 / 20-25 | 4-7 | – | 10-45 |
| Sturdiness | S | Monstres +X % défense | 50-100 / 100-150 / 150-200 | 3-6 | – | 10-45 |
| Regeneration | S | Monstres +X Replenish | 1024-1560 / 1560-2048 / 2048-2560 | 3-6 | – | 20-55 |
| Flaming / Hibernal / Static / Toxic | P | Monstres +X % dmg Feu/Froid/Foudre/Poison | 5-10 / 10-15 / 15-20 | 3-6 (sauf Hibernal/Toxic) | 13-30 | Hibernal/Toxic : 5-40 |
| Smoking / Chilling / Sparking | P | +X % dmg phys en Feu/Froid/Foudre | 60-80 / 70-90 / 80-100 | – | 13-20 | 5-40 |
| Poisonous / Runic | P | +X % phys en Poison / Magie | 123-205 / 8-14 | – | 13-20 | 5-40 |
| Crimson / Azure / Opal / Tangerine | S | Monstres X % absorbe Feu/Froid/Foudre/Magie | 4-6 / 6-8 / 8-10 | 3-6 | 13-25 | – |
| Splashing | P | mêlée des monstres en zone | – | – | 8-25 | 5-40 |
| Stygian / Lustful / Vampiric / Bovine / Reanimated / Ghastly / Souless / Shamanic / Shrieking | P | ajoute une famille de monstres (½ fréquence, T1-T3) | – | – | 18-30 | 15-50 |
| Smith / Armorer / Crafter | S | +X % drop armes / armures / bijoux-charmes | 1 / 2 / 3 | – | – | – |
| Champion's | P | Rareté des monstres +X % | 30-40 / 40-50 / 50-60 | – | – | – |
| Duplicated | P | Boss supplémentaire (½ fréq.) | – | – | – | – |
| Adventurer | S | +1 niveau de zone (½ fréq.) | – | – | – | – |

### 6.4 Objets et recettes de maps

| Objet | + ingrédients | Effet |
|---|---|---|
| Horadrim Orb | map rare + gemme Perfect + rune | relance la map rare |
| Angelic Orb | map magique + gemme Perfect + rune | magique → rare |
| Zakarum Orb | map normale + bijou + rune | normale → rare |
| Arcane Orb | map normale/magique + bijou | normale → magique (reroll magique) |
| Infused X Orb | map seule | même effet sans ingrédients (Infused = Orb + ingrédients, fabriqué au Cube) |
| Orb of Destruction | map magique/rare | → normale |
| Orb of Fortification | map magique/rare/unique | ½ monstres, ×2 butin/XP par monstre, monstres ×2 vie, +20 % dmg ; joueurs +30 % vélocité |
| Cartographer's Orb | 3 maps T1 ou T2 même palier | 1 map du palier supérieur |
| (sans orbe) | 3 maps même palier | 1 map normale aléatoire même palier |
| (sans orbe) | 3 donjons | 1 donjon rare |
| Worldstone Shard | map magique/rare/donjon | corruption (§5.4) |
| Horadrim Scarab | map T3 | donjon rare aléatoire (boss de map : drop peu commun) |
| Catalyst Shard | map magique/rare | + « Area contains a random event » |
| Standard of Heroes | map magique/rare/unique/donjon | +10 % XP, +20 % densité, +20 % MF/GF (drop Uber Ancients) |
| Oreilles corrompues (7 classes) | map magique/rare/donjon | +25 % rareté, +75 % drops, +200 % vie monstres + malus de classe (ex. Sorcière : joueurs −25 % toutes Res, +50 % phys en Foudre) |

Orbes achetables chez Anya (Enfer).

### 6.5 Événements de map (11 / 22 / 33 % selon rareté)
Dark Wanderer (boss renforcé, Shards en plus) ; Shadow of Mendeln (vagues de morts-vivants, Splinter of the Void) ; Horazon (portail vers une map du même palier ou +1, résistances des monstres à 0, 6 maps lâchées) ; Treasure Fallen (runes jusqu'à Zod, maps, orbes, infusions) ; Spire of Darkness (clés uber, max 6) ; Gheed (5 uniques non identifiés à 1 M) ; Altar of the Catalyst (boss → 3 Catalyst Shards) ; Invasion (joueurs corrompus : set de rares + oreille).

### 6.6 Boss de map
Chaque map a un boss (traité « prime evil »). Maps uniques : butin spécial (ex. City of Ureh : 3 uniques socketés ; Djinn's Domain : explosion de trésor ; Fallen Gardens : Rainbow Facet ; Imperial Palace : Puzzlebox garanti + Puzzlepiece par le mini-boss ; Na-Krul's Abyss : 3 uniques éthérés ; Warlord of Blood : 1-3 uniques corrompus ; Zhar's Sanctum : Skill Charm).
**Choix retenu (mobile) :** boss de map = unique « boss » (TC 7 picks façon boss d'acte, tcMods 983/983/983/1024), 1/20 Scarab en T3, pas de mécanique 90 % DR.

---

## 7. La Sorcière dans PD2

### 7.1 Statistiques de départ et progression (CharStats.txt, inchangé par PD2 pour la Sorcière)

| Donnée | Valeur |
|---|---|
| Force / Dextérité / Vitalité / Énergie | **10 / 25 / 10 / 35** (total 80) |
| Vie de départ | **40** (30 + Vit) |
| Mana de départ | **35** (= Énergie) |
| Endurance de départ | 74 (PD2 : ≈ +100 % d'endurance de départ pour tous) |
| Par niveau | **+1 Vie, +2 Mana, +1 Endurance** |
| Par point de Vitalité | **+2 Vie**, +1 Endurance |
| Par point d'Énergie | **+2 Mana** |
| Points de stats / compétences | 5 / 1 par niveau (+5 stats ×3 Lam Esen ; +1 compétence ×3 pour Den of Evil, Radament, Izual) → 110 points de compétence au niveau 99 |
| Regen de mana de base | pool complet en 120 s (ManaRegen 120) |
| Vitesse | marche 6, course 9 ; BlockFactor 20 ; ToHitFactor −15 |
| Équipement de départ | Short Staff (PD2 : objets de départ low quality), Fire Bolt appris |

Formules : `Vie = 40 + (niv−1)·1 + 2·(Vit−10)` ; `Mana = 35 + (niv−1)·2 + 2·(Éner−35)`.
Résistances max des joueurs : 75 % de base, **plafond absolu 90 %** en PD2 (95 % vanilla).
Seuils FCR Sorcière (D2/PD2, *connaissance*) : 0/9/20/37/63/105/200 % → 13/12/11/10/9/8/7 frames ; Lightning & Chain Lightning : 0/7/15/23/35/52/78/117/194 % → 19…11 frames. FHR : 0/5/9/14/20/30/42/60/86/142/280 % → 15…5 frames.

### 7.2 Mécanique de calcul des compétences (Skills.txt)

```
brut(niv) = EMin + Σ_{L=2..niv} EMinLev[k(L)]      k : L≤8→1, ≤16→2, ≤22→3, ≤28→4, sinon 5
dégât    = brut · 2^HitShift / 256                  (HitShift 8 = ×1, 7 = ×0,5, 5 = ×1/8 par frame…)
mana     = max(minmana, (mana + lvlmana·(niv−1)) · 2^manashift / 256)
final    = dégât · (1 + Σ synergies%/100 · niveauxDeBase) · (1 + %dmgÉlément/100 [maîtrise + objets])
```
- `niv` = niveau effectif (points investis + bonus « +compétences ») ; les **synergies ne comptent que les points investis** (niveau de base, « hard points »).
- Dégâts continus (Inferno, Blaze, Fire Wall) : valeur par frame, affichée ici en **dégâts/seconde = par frame × 25**.
- Cooldowns (colonne `delay`, frames à 25/s) : Blaze 2 s, Fire Wall 1,52 s, Meteor 0,52 s, Blizzard 0,92 s, Combustion 2,52 s (PD2 : pas de cooldown en ville, cooldowns non partagés).

### 7.3 Les 33 compétences (valeurs PD2 Saison 13, calculées depuis Skills.txt)

Arbre PD2 : la Sorcière a **33** compétences. Frozen Armor est remplacé par **Cold Enchant** ; **Lesser Hydra**, **Combustion** et **Ice Barrage** sont ajoutées.

#### Arbre Feu

| Compétence | Niv. req. | Prérequis | Mana niv.1 (+/niv) | Dégâts niv.1 | +/niv (2-8 / 9-16 / 17-22 / 23-28 / 29+) | Niv.20 | Niv.30 | Synergies (par niveau de base) |
|---|---|---|---|---|---|---|---|---|
| Fire Bolt | 1 | — | 2,25 (+0,25) | 3-6 | 2-3 / 8-9 / 15-16 / 23-24 / 23-24 | 141-163 | 355-387 | Fire Ball, Combustion : +18 % |
| Warmth | 1 | — | — (passif) | — | — | — | — | — |
| Inferno (dmg/s) | 1 | — | 0,12 (+0,03) /frame | 6,25-9,38 | 6,25-9,38 / 9,38-15,62 / 40,62-46,88 / 71,88-78,12 / 71,88-78,12 | 287,5-387,5 | 943,75-1106,25 | Fire Wall, Blaze : +20 % |
| Blaze (dmg/s) | 6 | Inferno | 11 (+0,5) | 0,39-0,78 | 0,39-0,39 / 0,39-0,78 / 1,95-2,34 / 3,12-3,52 / 3,12-3,52 | 14,06-19,14 | 42,97-51,95 | Fire Wall : +6 % |
| Fire Ball | 12 | Fire Bolt | 5 (+0,25) | 6-14 | 6,5-7,5 / 11,5-12,5 / 14-15 / 16,5-17,5 / 19-20 | 199,5-226,5 | 364,5-401,5 | Fire Bolt, Combustion : +15 % |
| Fire Wall (dmg/s) | 12 | Blaze | 15 (+0,75) | 4,69-7,81 | 1,56-2,34 / 4,69-6,25 / 19,53-21,88 / 39,06-41,41 / 39,06-41,41 | 131,25-161,72 | 482,81-536,72 | Blaze : +5 % |
| Lesser Hydra | 12 | Warmth | 10 (+0,5) | 3,5-6,5 | 3-4 / 7-8 / 12-13 / 17-18 / 17-18 | 128,5-150,5 | 288,5-320,5 | Fire Bolt, Hydra : +12 % |
| Enchant | 18 | Lesser Hydra, Fire Ball | 25 (+1) | 12,5-17,5 | 4-5 / 7-8 / 12-13 / 18-19 / 23-24 | 144,5-168,5 | 322,5-356,5 | Warmth : +20 % |
| Meteor | 24 | Fire Ball, Fire Wall | 10 (+0,5) | 25-30 | 7-9 / 10-12 / 13-15 / 15-18 / 17-21 | 206-249 | 356-429 | Fire Ball, Blaze, Inferno : +6 % |
| Combustion | 24 | Fire Ball | 10 (+1) | 12-28 | 6-7 / 8-9 / 10-11 / 12-13 / 14-15 | 158-193 | 278-323 | Fire Bolt, Fire Ball : +12 % |
| Fire Mastery | 30 | — | — (passif) | — | — | — | — | — |
| Hydra | 30 | Enchant | 20 (+0,5) | 42-58,5 | 8-10 / 11,5-12,5 / 15,5-17,5 / 19-20,5 / 22-23,5 | 252-298,5 | 441-503,5 | Fire Bolt, Lesser Hydra : +6 % |

#### Arbre Froid

| Compétence | Niv. req. | Prérequis | Mana niv.1 (+/niv) | Dégâts niv.1 | +/niv (2-8 / 9-16 / 17-22 / 23-28 / 29+) | Niv.20 | Niv.30 | Synergies (par niveau de base) |
|---|---|---|---|---|---|---|---|---|
| Ice Bolt | 1 | — | 2 (+0,25) | 3-5 | 2-3 / 5,5-7 / 13-17,5 / 20,5-28 / 28-38,5 | 113-152 | 318-432 | Ice Blast, Glacial Spike : +20 % |
| Cold Enchant | 1 | — | 25 (+1) | 3-4 | 1,5-2,5 / 6-7 / 11,5-13 / 19,5-21,5 / 26,5-29,5 | 107,5-129,5 | 300,5-343,5 | Chilling Armor : +26 % |
| Frost Nova | 6 | — | 5 (+0,25) | 4-5 | 2-2,5 / 7-7,5 / 12-12,5 / 15-15,5 / 17,5-18 | 122-132,5 | 271-286,5 | Ice Bolt, Shiver Armor : +7 % |
| Ice Blast | 6 | Ice Bolt | 6 (+0,5) | 5-8 | 6-7 / 12-14 / 21-21,5 / 28-28,5 / 35-35,5 | 227-255 | 507-540 | Ice Bolt, Glacial Spike : +6 % |
| Shiver Armor | 12 | Cold Enchant | 11 (+0) | 8-10 | 2,5-3 / 4-4,5 / 5,5-6 / 7-7,5 / 8,5-9 | 79,5-91 | 149,5-166 | Cold Enchant : +20 % |
| Glacial Spike | 18 | Ice Blast | 10 (+0,5) | 20-28 | 7-7,5 / 13-13,5 / 14-14,5 / 15-15,5 / 16-16,5 | 229-246,5 | 379-401,5 | Ice Bolt, Ice Blast : +8 % ; Blizzard : +5 % durée de gel |
| Blizzard | 24 | Frost Nova, Glacial Spike | 13 (+0,5) | 17-24 | 5-7 / 6-8 / 8-11 / 10-14 / 14-19 | 132-181 | 236-325 | Ice Bolt, Ice Blast : +12 % |
| Ice Barrage | 24 | Glacial Spike | 8 (+0,25) | 16-23 | 2,5-3 / 4,5-5 / 6,5-7 / 8,5-9 / 10,5-11 | 95,5-112 | 180,5-202 | Ice Bolt, Glacial Spike : +8 % |
| Chilling Armor | 24 | Shiver Armor | 17 (+0) | 5-7 | 1,5-2 / 3-3,5 / 4,5-5 / 6-6,5 / 7,5-8 | 57,5-69 | 117,5-134 | Cold Enchant : +20 % |
| Frozen Orb | 30 | Blizzard | 14 (+0,5) | 40-45 | 1,5-2,5 / 4,5-5,5 / 7,5-8,5 / 10,5-11,5 / 14-15 | 116,5-140,5 | 222,5-256,5 | Ice Bolt, Frost Nova : +4 % |
| Cold Mastery | 30 | — | — (passif) | — | — | — | — | — |

#### Arbre Foudre

| Compétence | Niv. req. | Prérequis | Mana niv.1 (+/niv) | Dégâts niv.1 | +/niv (2-8 / 9-16 / 17-22 / 23-28 / 29+) | Niv.20 | Niv.30 | Synergies (par niveau de base) |
|---|---|---|---|---|---|---|---|---|
| Charged Bolt | 1 | — | 3 (+0,25) | 2-4 | 0,5-0,5 / 0,5-0,5 / 0,5-1 / 1-1,5 / 1-2 | 11,5-15,5 | 20,5-30,5 | Lightning, Telekinesis : +7 % |
| Static Field | 1 | — | 9 (+0) | — | — | — | — | — |
| Telekinesis | 1 | — | 7 (+0) | 2-7 | 1-3 / 1-6 / 2-12 / 2-12 / 2-12 | 25-124 | 45-244 | Charged Bolt, Nova : +15 % |
| Nova | 12 | Charged Bolt | 8 (+0,5) | 1-22 | 4-8 / 5-10 / 6-11 / 6-11 / 4-9 | 93-202 | 149-308 | Charged Bolt, Telekinesis : +4 % |
| Lightning | 12 | Charged Bolt | 4 (+0,25) | 8-30 | 3-10 / 3-13 / 4-16 / 5-19 / 6-22 | 69-268 | 119-458 | Chain Lightning, Charged Bolt : +8 % |
| Teleport | 18 | Telekinesis | 24 (−0,5) | — | — | — | — | — |
| Chain Lightning | 24 | Lightning | 4 (+0,5) | 8-40 | 2-13 / 3-16 / 4-19 / 4-22 / 5-25 | 62-335 | 104-555 | Charged Bolt, Lightning : +8 % |
| Thunder Storm | 24 | Nova, Lightning | 19 (+0) | 1-100 | 2-4 / 3-5 / 4-6 / 5-7 / 6-8 | 55-192 | 105-262 | Charged Bolt, Nova : +8 % |
| Energy Shield | 30 | Teleport, Chain Lightning | 5 (+0) | — | — | — | — | — |
| Lightning Mastery | 30 | — | — (passif) | — | — | — | — | — |

### 7.4 Compétences utilitaires et paramètres clés (S13)

| Compétence | Effet chiffré (niv. = niveau effectif, blvl = niveau de base) |
|---|---|
| **Warmth** (passif) | Regen mana **+30 % +12 %/niv** ; AR +20 % +10 %/niv |
| **Inferno** | cône de feu canalisé, mana 3,1/s (+0,8/s par niv) ; **réduit la res Feu ennemie de −(4 + niv)** jusqu'au niv. 22, puis +½ par niveau (max −100) ; portée 2 yards +… (plafonnée) |
| **Blaze** | traînée de feu 3 s (+0,2 s/niv), **Cannot be Frozen** pendant l'effet, +vélocité à rendements décroissants (≈ +33 % niv.1), cooldown 2 s |
| **Enchant** (Fire) | +dmg Feu arme (tableau) pour soi, ½ pour les alliés, +AR 20 % +5 %/niv, durée longue ; bénéficie de Fire Mastery |
| **Lesser Hydra / Hydra** | invocation fixe tirant Fire Bolt / Fire Ball ; profitent de Fire Mastery et du +% dmg Feu des objets (PD2) ; **Choix retenu : 3 hydres max au total** (+1 avec Dragon) |
| **Fire Mastery** (passif) | **+20 % +4 %/niv** dmg Feu ; **pierce Feu = min(niv, 30) %** |
| **Cold Enchant** | +dmg Froid arme soi/½ alliés, AR +20 % +10 %/niv, 300 s, bénéficie de Cold Mastery |
| **Frost Nova** | anneau de froid, froid 8 s +0,2 s/niv |
| **Ice Bolt** | froid 6 s +0,4 s/niv |
| **Ice Blast** | gel 2 s (+ ~0,08 s/niv) |
| **Glacial Spike** | gel de zone ; durée de gel +5 %/niv de base de Blizzard |
| **Ice Barrage** | salve de lances de glace : **3 + min(blvl/3, 2) lances** (3 → 5) |
| **Blizzard / Frozen Orb** | pluie de glace (cooldown 0,92 s) / orbe projetant des Ice Bolts, froid 8 s +0,2 s/niv |
| **Shiver Armor** | +Déf **45 % +6 %/niv**, +FBR 10 + 2·blvl, gèle/dmg les attaquants mêlée, 180 s +3 s/niv |
| **Chilling Armor** | +Déf **45 % +5 %/niv**, +blocage 5 + blvl %, riposte (Blizzard spike) contre projectiles, 240 s +3 s/niv |
| **Cold Mastery** (passif) | **+10 % +2 %/niv** dmg Froid ; **pierce Froid = min(4 + niv, 45) %** |
| **Charged Bolt** | **2 + niv** éclairs (max 28), perforants (S11), portée réduite |
| **Static Field** | −25 % de la vie actuelle des ennemis dans le rayon (min(7+niv, 28)/2 yards, max 14) ; **réduit la res Foudre −(4 + niv)** jusqu'au niv. 22 puis +½/niv, **sans plafond** (S13). *(D2 : plancher de PV 0/33/50 % N/NM/H — Choix retenu : plancher 50 % en Enfer, inopérant sur boss « prime evil »)* |
| **Telekinesis** | dégâts Foudre + knockback, ramasse objets |
| **Nova / Chain Lightning** | CL : **min((25 + niv)/4, 14) rebonds** (14 au niv. 31) |
| **Teleport** | mana 24 −0,5/niv (min 1) ; **après téléportation : −(50 − (niv−1)) % de dégâts des sorts pendant 1 s** (0 % au niv. 51) |
| **Thunder Storm** | éclair toutes les 2 s − 0,05 s·blvl, durée 32 s + 8 s/niv |
| **Energy Shield** | absorbe **min(15 + 2·(niv−1), 90) %** des dégâts via le mana ; coût : **max(34 − blvl − bonus, 14)/16 mana par point de dégât** (212 % → 87,5 % mini) ; durée 144 s + 60 s/niv ; persiste à 0 mana (S10) |
| **Lightning Mastery** (passif) | **+50 % +10 %/niv** dmg Foudre ; **aucun pierce** (la réduction vient de Static Field) |

### 7.5 Maîtrises et résistances : règle retenue
- **Pierce** (Fire Mastery, Cold Mastery, « −X % to Enemy [élément] Resistance » des objets/corruptions) : soustrait à la résistance **seulement si le monstre n'est pas immunisé** (< 100 %) ; aucune réduction de l'efficacité.
- **Réduction** (Inferno → Feu, Static Field → Foudre, Conviction, Lower Resist, potions de lancer) : **casse les immunités**, mais efficacité **½** si la res est ≥ 100 % et ½ sur la **partie négative** (plancher −100 %).
- Conséquence : une Sorcière Froid pure **ne peut pas** casser une immunité Froid seule (Cold Mastery est un pierce) → besoin d'un mercenaire Infinity (Conviction), d'un second élément ou de Lower Resist via objets (Plague). Une Sorcière Feu (Inferno) ou Foudre (Static Field) peut casser seule les immunités ≤ ~110-115 % en Enfer.

### 7.6 Changements PD2 notables (vs vanilla)
- Cold Enchant remplace Frozen Armor (S1), utilisable avec Enchant Fire ; Shiver/Chilling Armor tirent leurs synergies de Cold Enchant.
- Nouvelles compétences : Lesser Hydra (niv. 12), Combustion (niv. 24), Ice Barrage (niv. 24).
- Maîtrises Feu/Froid avec **pierce** ; Lightning Mastery réduite à +10 %/niv (S8) ; Static Field : −5 % de base et plus de plafond (S13) ; Inferno refondu en cône (S9) avec réduction de res.
- Frost Nova : synergies Ice Bolt & Shiver Armor (au lieu de Blizzard/Frozen Orb) ; Frozen Orb : synergies Ice Bolt & Frost Nova ; Ice Bolt n'est plus synergisé par FN/Blizzard/FO.
- Teleport : malus de dégâts temporaire ; Energy Shield : efficacité liée aux points de base, cap 90 %.
- Lightning/Chain Lightning : minimum de dégâts relevé (S13) ; CL 14 rebonds au niv. 31 (S12).
- Hydras/sentinelles bénéficient du +% dmg élémentaire ; Blaze accorde Cannot be Frozen.
**Choix retenu :** valeurs S13 de `Skills.txt` (tableaux 7.3) pour les dégâts, mana et synergies ; en cas de désaccord avec les tableaux du wiki (Frost Nova, Blizzard, Frozen Orb, Inferno, Fire Wall, Cold Enchant 24→26 %, Blizzard 10→12 %), **les données S13 font foi** (elles correspondent aux changelogs S7-S13).

---

## 8. Monstres

### 8.1 Résistances, immunités, pénalités
- **Immunité** = résistance ≥ **100 %** à un type (Phys, Magie, Feu, Froid, Foudre, Poison). Les résistances monstres sont fixées **par difficulté** dans MonStats (colonnes Res*, Res*(N), Res*(H)) — il n'y a pas de pénalité générique côté monstre.
- **Pénalité de résistance du joueur** : Normal **0**, Cauchemar **−40**, Enfer **−100** (*D2 ; PD2 ne la modifie pas — Choix retenu*). Plafond 75 % (90 % avec « +% Res max »).
- **Casser une immunité (PD2)** : seules les **réductions** (Conviction, Lower Resist, Inferno, Static Field, Amplify/Decrepify/Battle Cry pour le physique, Sanctuary pour la magie…) ; chaque source est **divisée par 2 et arrondie à l'inférieur individuellement** contre une cible ≥ 100 % (vanilla : 1/5). Si le résultat ≤ 99 % : les **pierces** s'appliquent ensuite à 100 %. Sous 0 : la partie négative est divisée par 2 (plancher −100). Les réductions infligées **par les monstres** aux joueurs sont à pleine efficacité.
- Exemple : Feu 110 %, Lower Resist −21 → −10 → 100 % (immun) ; + une 2e source −31 → −15 → 85 % (cassé).
- Exemple Sorcière Foudre (Enfer, Foudre 120 %) : Static Field niv. 20 (−24 → −12) + Conviction merc niv. 12 (−85 → −42) → 66 % ; puis pierce Infinity/objets −50 → 16 % ; Lightning Mastery ne réduit rien.

### 8.2 Types de monstres et modificateurs
- **Champions** (packs de 2-4, bleus) : mlvl +2 ; variantes Champion, Berserker, Fanatic, Possessed, Ghostly (MonUMod « champion/ghostly/fanatic/possessed/berserk »).
- **Uniques** (dorés) + **minions** : mlvl +3 ; 1 modificateur aléatoire en Normal, 2 en Cauchemar, 3 en Enfer (+ bonus fixes). Super-uniques : modificateurs fixes.
- *(Valeurs D2 de mémoire, non vérifiées → Choix retenu pour le mobile)* : Champion PV ×3, dégâts ×1,5, XP ×3 ; Unique PV ×4, dégâts ×1,5, XP ×5 ; minions 3-5 par unique.

| Modificateur (MonUMod) | Effet retenu (mobile) |
|---|---|
| Extra Strong (strong) | +50 % dégâts physiques |
| Extra Fast (fast) | +33 % vélocité, +33 % vitesse d'attaque |
| Cursed (curse) | 10 % par coup de lancer Amplify Damage (−100 % res phys joueur, 10 s) |
| Magic Resistant (resist) | +40 res Feu/Froid/Foudre |
| Fire Enchanted (fire) | +dmg Feu = dmg phys, +50 res Feu, explosion de feu à la mort |
| Cold Enchanted (cold) | +dmg Froid, +50 res Froid, Frost Nova à la mort |
| Lightning Enchanted (lightning) | Charged Bolts quand touché, +50 res Foudre |
| Mana Burn (manahit) | coups drainent le mana (dmg magique), +20 res Magie |
| Multiple Shots (multishot) | ×2-3 projectiles |
| Spectral Hit (spectralhit) | +dmg élémentaire aléatoire par coup |
| Stone Skin (stoneskin) | +100 % défense, +30 % res Phys |
| Teleportation (teleport) | se téléporte en sécurité quand blessé |
| Aura Enchanted (aura) | aura aléatoire niv. = ⌊mlvl/7⌋ : Might, Holy Fire, Holy Freeze, Holy Shock, Conviction, Fanaticism, **Concentration** (remplace Blessed Aim), **Vigor** (PD2) |

Auras de monstres PD2 (niveau d'aura = mlvl/7) : niv. 12 (mlvl 84) → Might +158 % dmg, Concentration +85 %, Fanaticism +237 % dmg monstre, **Conviction −85 % res joueurs** et −83 % défense, Vigor +58 % vitesse.
PD2 : durée des malédictions lancées par les monstres limitée à 20 s ; bug Mana Burn corrigé ; +70 % PV par joueur.

### 8.3 Niveaux de zone (PD2, wiki « Zones »)

| Zone | Normal | Cauchemar | Enfer (PD2) | Enfer vanilla |
|---|---|---|---|---|
| Tristram | 6 | 39 | **82** | 76 |
| Tal Rasha's Tomb (7 tombeaux) | 17 | 49 | **82** | 80 |
| Tal Rasha's Chamber (Duriel) | 17 | 49 | **85** | 80 |
| Secret Cow Level | 28 | 64 | 81 | 81 |
| Worldstone Keep 1 / 2 / 3 | 39 / 40 / 42 | 65 / 65 / 66 | 85 | 85 |
| Throne of Destruction | 43 | 66 | 85 | 85 |
| Worldstone Chamber (Baal) | 43 | 66 | 85 | 85 |
| Chaos Sanctuary | 28 | 58 | 85 | 85 |
| Zones corrompues (Enfer post-Baal) | – | – | 85 | – |
| Maps T1 / T2 / T3 / Donjons | – | – | 87 / 88 / 89 / 90 | – |

Niveaux de boss (MonStats S13, N / NM / H) : Griswold 5/39/84 ; Andariel 12/49/85 ; Duriel 22/55/88 ; Mephisto 26/59/87 ; Diablo 40/62/94 ; **Baal 60/75/99** ; Minions de Baal 55-60/68/92.

### 8.4 Familles de monstres des zones cibles (résistances Enfer, MonStats S13 : Phys/Magie/Feu/Foudre/Froid/Poison)

**Tristram** — Zombies (Zombie : 50/0/0/0/**120**/75 → immun Froid), Fallen & Fallen Shaman (Feu **100**, immun Feu), Squelettes (Foudre **100**, Poison 75) ; super-unique **Griswold** (Poison 120). Immunités de zone (pd2-tools) : Froid, Feu, Poison. *(composition de familles : connaissance D2)*

**Tal Rasha's Tombs** — Momies (Dried Corpse/Decayed/Embalmed : Poison 100-105, Froid/Foudre 33), Unravelers (Hollow One : Foudre 100 ; Guardian : Magie & Feu 100 ; Unraveler : Magie & Froid 100), Scarabées (Dung Soldier/Sand Warrior/Steel Weevil : Foudre 100-115), + fantômes et squelettes mages *(connaissance)*. Immunités de zone : Froid, Feu, Poison (+ Foudre via scarabées).

**Secret Cow Level** — Hell Bovine (50/33/50/50/50/33, PV ×2,2-2,7 base, XP 80 %), **The Cow King** (super-unique). Immunité de zone signalée : Foudre (packs uniques).

**Worldstone Keep / Throne** — Minions of Destruction (Feu **120**, Poison 95), Blood Lords (Feu 110-120 ou Foudre 100 ou Phys 100 ou Froid 135 selon variante), Succubus/Witches (Blood Temptress Poison 120 ; Hell Witch Froid 160 ; Hell Temptress Phys 100), Oblivion/Doom Knights (Froid 180 / Feu 110 / Foudre 100), Putrid Defilers (Poison 100-120), Overseers (Froid 120-160). Vagues de Baal (Throne) : 1 Colenzo + Fallen corrompus ; 2 Achmel + momies (Baal Subject Mummy : Magie 100) ; 3 Bartuc + Council-like ; 4 Ventar + Venom Lords ; 5 Lister + Minions of Destruction *(composition : connaissance D2)*. PD2 : délai entre vagues −50 %.

### 8.5 PV des monstres
`PV = MonLvl.L-HP[diff][mlvl] × rand(minHP, maxHP)/100` (× modificateurs champion/unique, × (1 + 0,7·(joueurs−1)) en PD2). Exemples L-HP Enfer (base 100 %) : mlvl 60 : 3 307 ; 70 : 4 457 ; 80 : 5 607 ; 85 : 6 182 ; 87 : 6 412 ; 89 : 6 642 ; 90 : 6 757 ; 99 : 7 792. Cauchemar mlvl 65 : 1 515. Normal mlvl 30 : 134.
**Choix retenu (mobile) :** PV Enfer divisés par 4 (combat plus court au doigt), rapport entre familles conservé.

---

## 9. Expérience

### 9.1 Table officielle D2 (XP totale pour atteindre le niveau)

| Niv. | XP | Niv. | XP | Niv. | XP | Niv. | XP |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 26 | 2 050 449 | 51 | 51 767 302 | 76 | 481 128 591 |
| 2 | 500 | 27 | 2 563 061 | 52 | 56 836 449 | 77 | 524 840 254 |
| 3 | 1 500 | 28 | 3 203 826 | 53 | 62 361 819 | 78 | 572 485 967 |
| 4 | 3 750 | 29 | 3 902 260 | 54 | 68 384 473 | 79 | 624 419 793 |
| 5 | 7 875 | 30 | 4 663 553 | 55 | 74 949 165 | 80 | 681 027 665 |
| 6 | 14 175 | 31 | 5 493 363 | 56 | 82 104 680 | 81 | 742 730 244 |
| 7 | 22 680 | 32 | 6 397 855 | 57 | 89 904 191 | 82 | 809 986 056 |
| 8 | 32 886 | 33 | 7 383 752 | 58 | 98 405 658 | 83 | 883 294 891 |
| 9 | 44 396 | 34 | 8 458 379 | 59 | 107 672 256 | 84 | 963 201 521 |
| 10 | 57 715 | 35 | 9 629 723 | 60 | 117 772 849 | 85 | 1 050 299 747 |
| 11 | 72 144 | 36 | 10 906 488 | 61 | 128 782 495 | 86 | 1 145 236 814 |
| 12 | 90 180 | 37 | 12 298 162 | 62 | 140 783 010 | 87 | 1 248 718 217 |
| 13 | 112 725 | 38 | 13 815 086 | 63 | 153 863 570 | 88 | 1 361 512 946 |
| 14 | 140 906 | 39 | 15 468 534 | 64 | 168 121 381 | 89 | 1 484 459 201 |
| 15 | 176 132 | 40 | 17 270 791 | 65 | 183 662 396 | 90 | 1 618 470 619 |
| 16 | 220 165 | 41 | 19 235 252 | 66 | 200 602 101 | 91 | 1 764 543 065 |
| 17 | 275 207 | 42 | 21 376 515 | 67 | 219 066 380 | 92 | 1 923 762 030 |
| 18 | 344 008 | 43 | 23 710 491 | 68 | 239 192 444 | 93 | 2 097 310 703 |
| 19 | 430 010 | 44 | 26 254 525 | 69 | 261 129 853 | 94 | 2 286 478 756 |
| 20 | 537 513 | 45 | 29 027 522 | 70 | 285 041 630 | 95 | 2 492 671 933 |
| 21 | 671 891 | 46 | 32 050 088 | 71 | 311 105 466 | 96 | 2 717 422 497 |
| 22 | 839 864 | 47 | 35 344 686 | 72 | 339 515 048 | 97 | 2 962 400 612 |
| 23 | 1 049 830 | 48 | 38 935 798 | 73 | 370 481 492 | 98 | 3 229 426 756 |
| 24 | 1 312 287 | 49 | 42 850 109 | 74 | 404 234 916 | 99 | 3 520 485 254 |
| 25 | 1 640 359 | 50 | 47 116 709 | 75 | 441 026 148 | (cap) | 3 837 739 017 |

(source : classic.battle.net, identique à Experience.txt 1.13.)

### 9.2 XP par monstre et pénalités

```
xpBase    = MonLvl.L-XP[difficulté][mlvl] × MonStats.Exp[difficulté] / 100
xpType    = xpBase × (champion 3 | unique 5 | normal 1)                  // choix (D2 de mémoire)
écart     = clvl − mlvl
facteurNiv = écart ≤ 5 : 1
             écart 6 : 0,81 ; 7 : 0,62 ; 8 : 0,43 ; 9 : 0,24 ; ≥ 10 : 0,05
             mlvl > clvl + 5 : clvl / mlvl
xp        = xpType × facteurNiv × ExpRatio[clvl] / 1024 × (1 + bonusXP%/100)
```
- `ExpRatio` (Experience.txt) : 1024 jusqu'au niv. 69, puis 976, 928, 880, 832, 784, 736, 688, 640, 592, 544, 496, 448, 400, 352, 304 (niv. 70 → 84), 256 (85), 192, 144, 108, 81, 61, 46, 35, 26, 20, 15, 11, 8, 6 (niv. 98), 5 (99).
- L-XP par mlvl (base 100 %) — Normal / Cauchemar / Enfer : mlvl 1 : 30 / 78 / 117 ; 10 : 120 / 312 / 468 ; 20 : 300 / 779 / 1 169 ; 30 : 659 / 1 709 / 2 564 ; 40 : 1 297 / 3 365 / 5 048 ; 50 : 2 317 / 6 618 / 9 927 ; 60 : 3 357 / 11 964 / 17 946 ; 70 : 4 397 / 20 540 / 30 810 ; 80 : 5 437 / 29 600 / 44 400 ; 85 : 5 957 / 34 130 / 51 195 ; 87 : 53 913 (H) ; 89 : 56 631 (H) ; 90 : 57 990 (H) ; 99 : 7 413 / 46 814 / 70 221.
- `MonStats.Exp` exemples (Enfer) : Zombie 105 %, Fallen 65 %, Hell Bovine 80 %, Minion of Destruction 247 %, Blood Lord 210 %, Baal 6 460 %.
- Bonus PD2 : affixes de map (+3 à +12 % par affixe, jusqu'à +54 % en T3), donjons +200 %, Standard of Heroes +10 %, Annihilus corrompu +3-5 %.
- PD2 : pénalité d'écart de niveau **adoucie entre les niveaux 20 et 24** (valeurs exactes non publiées) → **Choix retenu :** la table D2 ci-dessus sans adoucissement.
- Multijoueur (D2) : XP × (joueurs+1)/2 puis partage par niveau — **ignoré** (solo).

### 9.3 Pénalité de mort
*(D2, connaissance — non retrouvée en ligne)* : perte d'XP = 0 % en Normal, **5 % (Cauchemar) / 10 % (Enfer) de l'XP nécessaire au niveau suivant**, sans jamais perdre de niveau ; or perdu. **Choix retenu (mobile) :** 0 / 5 / 10 %, pas de corps à récupérer, or non perdu.

---

## 10. Choix retenus pour le jeu mobile (synthèse)

### 10.1 Décisions tranchées (fidélité)
1. **Version de référence : PD2 Saison 13** ; les données machine (`Skills.txt`, `MonStats.txt` S13) priment sur les tableaux du wiki quand ils divergent.
2. **Rareté** : formule D2 exacte (§1.3) avec ItemRatio v1, MF à rendements décroissants 250/500/600, tcMods 800 (champion/unique), 983 (boss), 1024 magic garanti hors monstres normaux.
3. **Affixes** : alvl exact (§1.2), groupes d'exclusion, magic 1P+1S, rare 3-6 avec minimums PD2 (4 à ilvl 45, 5 à 65, 6 à 85), bijou rare = 4 ; staffmods PD2 (10/40/30/20 %, +1/+2/+3 = 40/35/25 %).
4. **Sockets** : `min(base, MaxSock[ilvl])`, tranches 25/40 ; recettes Cube vanilla-PD2 + Puzzlebox/Puzzlepiece/Malus.
5. **Drops** : TC récursifs, promotion par mlvl, `weapN/armoN` par pas de 3, NoDrop recalculé avec **n = 5** (équivalent solo PD2), 6 objets max.
6. **Runes** : 33 runes, effets PD2 (§3.1), TC `Runes 1..17` 1.13, upgrades **3:1 jusqu'à Pul, 2:1 ensuite, + Key**, pas de downgrade.
7. **Runewords** : règles strictes (normal/superior, sockets exacts, ordre) ; ~40 runewords issus de la liste PD2 ; Enigma = chest avec Blink à charges ; Coven/Vigilance **non implémentés**.
8. **Corruption** : Worldstone Shard (renommable « Orbe de Corruption » en UI), probabilités 50/50 (base normale) et 25/50/25 (autres), raretés 48/32/20, tables par slot §5.3.
9. **Maps** : T1/T2/T3/Donjon = zone 87/88/89/90, raretés normal/magic/rare/unique, affixes à 3 paliers, orbes PD2 (Horadrim, Angelic, Zakarum, Arcane, Destruction, Fortification, Cartographer's, Scarab, Catalyst, Standard of Heroes), événements 11/22/33 %.
10. **Sorcière** : 33 compétences S13 (tableaux §7.3), synergies sur points de base, pierce Feu min(niv,30) / Froid min(4+niv,45), Lightning Mastery sans pierce, Static Field & Inferno = réductions qui cassent les immunités.
11. **Immunités** : ≥ 100 % ; réductions à **½** contre immunisés et sur la partie négative (PD2) ; pierces seulement après rupture ; pénalité de res joueur 0/−40/−100 ; cap 75 %/90 %.
12. **XP** : table officielle, MonLvl L-XP × Exp%, pénalité d'écart D2, ExpRatio au-delà de 69, bonus de maps additifs.

### 10.2 Simplifications assumées (mobile, solo)
- **Solo uniquement** : pas de partage d'XP ni de scaling joueurs (n = 5 figé, PV monstres sans +70 %/joueur).
- **Pas de durabilité/réparation** (Zod/Ort/Ral inutiles) → on supprime les recettes de réparation, Vial of Lightsong garde l'éthéré (+25 % stats) sans malus.
- **Pas de low quality** en drop (ou 2 % décoratif) ; superior = +5-15 % ED uniquement.
- **Or** : pas de gamble/Gheed ; Lilith's Mirror, Demonic Cube, Desecration, ubers (DClone, Rathma, Lucion, Uber Tristram) **hors périmètre v1**.
- **Corruption** : état Corrupted **bloque toute modification** (sauf remplir des sockets) ; bijoux corruptibles avec la table bague (écart assumé).
- **Monstres** : modificateurs champion/unique aux valeurs choisies §8.2 ; « prime evil » sans la mécanique 90 % DR/90 % PV ; PV Enfer ÷4 ; 5 familles par zone max.
- **Zones de contenu v1** : Tristram, Tal Rasha's Tombs, Cow Level, Worldstone Keep/Throne (Baal), puis maps T1-T3 ; niveaux de zone PD2 (Enfer 82/82/81/85).
- **Craft** : 4 familles (Blood, Caster, Safety, Brilliant) sur la même grille d'ingrédients.
- **Maps** : rare = 4-6 affixes (choix), max 1 corruption, Cartographer 3→1 palier supérieur, Scarab T3 → donjon ; un seul boss par map (TC boss).
- **Hydres** : 3 max ; **Blizzard/Meteor** : cooldowns S13 conservés (0,92 s / 0,52 s).
- **Mort** : 0/5/10 % d'XP du niveau, pas de corps.

### 10.3 Structure de données TypeScript suggérée
```ts
type Quality = 'low'|'normal'|'superior'|'magic'|'rare'|'set'|'unique'|'crafted';
interface ItemRatioRow { ratio: number; divisor: number; min: number }           // §1.3
interface Affix { id: string; kind: 'prefix'|'suffix'; stat: StatId; min: number; max: number;
                  alvl: number; maxAlvl?: number; rlvl: number; freq: number; group: number;
                  itemTypes: ItemTypeId[]; magicOnly?: boolean }                 // §1.4-1.5
interface TreasureClass { id: string; picks: number; noDrop: number;
                  mods?: { unique: number; set: number; rare: number; magic: number };
                  entries: { ref: string; weight: number }[]; group?: number; level?: number } // §2
interface Rune { n: number; id: string; level: number; weapon: Mod[]; armor: Mod[]; shield: Mod[] } // §3.1
interface Runeword { id: string; runes: string[]; bases: ItemTypeId[]; level: number; mods: ModRange[] } // §3.4
interface CorruptionTable { slot: Slot; low: ModRange[][]; mid: ModRange[][]; high: ModRange[][];
                  weights: [number, number, number] }                            // §5.3
interface SkillDef { id: string; tree: 'fire'|'cold'|'lightning'; reqLevel: number; prereq: string[];
                  eMin: number; eMinLev: [number,number,number,number,number];
                  eMax: number; eMaxLev: [number,number,number,number,number]; hitShift: number;
                  mana: number; lvlMana: number; manaShift: number; minMana: number;
                  synergies: { skill: string; pctPerLevel: number }[]; cooldownFrames?: number } // §7
interface MapAffix { id: string; kind: 'prefix'|'suffix'; tiers: [Range, Range, Range];
                  xp?: [Range, Range, Range]; density?: [Range, Range, Range]; mfgf?: [Range, Range, Range] } // §6.3
```

### 10.4 Points où les sources manquaient (à valider en jeu)
- Valeurs exactes des modificateurs de champions/uniques (Extra Strong, Magic Resistant, Stone Skin…) et multiplicateurs PV/XP champion/unique : **de mémoire**.
- Pénalité de mort et adoucissement PD2 de la pénalité d'XP niveaux 20-24 : non publiés.
- Nombre exact d'affixes des maps rares : non documenté (choix 4-6).
- Composition exacte des familles de monstres de Tristram, des Tombeaux et des vagues de Baal : connaissance D2 (MonStats donne les stats, pas les placements ; Levels.txt PD2 non disponible).
- Écart wiki ↔ S13 sur quelques sorts (Frost Nova, Blizzard, Frozen Orb, Inferno, Fire Wall) : tranché en faveur de S13.
- Probabilité qu'un objet blanc tombe socketé : choix (1/8).
