# Audit 06 : fonctionnalités de jeu et expérience (D2 Mobile vs D2 LoD 1.13 / PD2 S13)

Méthode : lecture de `src/ui/*.ts`, `src/app.ts`, `src/sim/game.ts`, `world.ts`, `inventory.ts`, `cube.ts`, `data/cube.ts`, `loot/filter.ts`, `platform/*` ;
comptages D2 par `tools/audit/common` (cubemain, shrines, hireling, levels) ; PD2 : wiki `Recipes`, `Crafting`, `Filter_Info` (la page `Item_Filtering_and_Customization`
est non listée/vide : ce qui concerne la langue de filtre PD2 vient de la connaissance du format `ItemDisplay`, à confirmer). Rien n'a été modifié dans le dépôt.
Légende : ABSENT / INCOMPLET / ÉCART (fidélité) / OK. Efforts : S < 1 j, M 1-3 j, L > 3 j.

## 1. Résumé chiffré

| Domaine | D2 | PD2 | D2 Mobile | Couverture |
|---|---|---|---|---|
| Recettes du Cube (lignes) | 146 actives (151) | ≈ 190 (estimé du wiki : crafts 70, maps ~20, ubers ~10, démolition…) | 97 entrées au livre (≈ 133 combinaisons : 4 crafts × 10 emplacements) ; 106 lignes D2 reproduites | 73 % D2 / ≈ 70 % PD2 |
| Familles d'artisanat (crafts) | 4 (Sang, Lanceur, Hitpower, Sûreté) = 36 recettes | 7 (+ Vampirique, Généreux, Éclatant) ≈ 70 | 4 (Sang, Lanceur, Sûreté, Éclat) | 57 % (Hitpower, Vampirique, Généreux absents) |
| Quêtes | 27 (6/6/6/3/6) | 27 + récompenses PD2 | 15 (toutes « tuer un boss / nettoyer ») | 56 % |
| Points de passage | 39 | 39 | 39 (campagnes) | 100 % |
| Sanctuaires (shrines) | 22 types (hors « None ») | 22+ | 4 (recharge, expérience, armure, compétence) | 18 % |
| Mercenaires | 4 types (120 lignes de variantes) | 4 | 5 (Templier de l'acte IV inventé) | 100 %, niveau suit le joueur |
| Potions (types) | ≈ 21 (soin ×5, mana ×5, rajeunissement ×2, endurance, antidote, dégel, 3 grenades…) | idem | 3 bases (soin, mana, rajeunissement) + paliers 0-4 | ≈ 30 % |
| Uniques à charges | 30 uniques + 205 suffixes magiques « charged » | idem | 0 (propriété non lue) | 0 % |
| Raccourcis clavier (PC) | ≈ 25 (F1-F8, 1-4 ceinture, W, A, Q, P, H, R, Alt…) | + filtre, recharge filtre | 11 touches (1-4, Espace, R, F, E, I/B, K/T, C, P, Tab, Échap) | ≈ 40 % |
| Langues | 11 (1.13) | EN | 2 (EN par défaut, FR), 3 678 clés | n/a |
| Musique (pistes) | ≈ 30 + Acte V | idem | 24 extraites ; 14 ambiances ; une seule piste de ville (`town4`) pour toutes les villes | ≈ 60 % |
| Mode Hardcore / Ladder / Multijoueur / Échange / Chat / PvP | oui | oui (ladder saisonnier) | aucun | 0 % |
| Filtre de butin | aucun | langue `ItemDisplay` illimitée + 14 filtres publics | 7 préréglages + 12 interrupteurs, aperçu | ≈ 15 % de l'expressivité |

## 2. Manquants classés

### P0 : cœur du jeu (5)

| # | Élément | Constat (code) | Pourquoi | Effort | Dépendances |
|---|---|---|---|---|---|
| P0-1 | **Potion de rajeunissement inutilisable pour le joueur** | `Game`/`World.usePotion('rejuv')` existe, mais `controls.ts:364` ne connaît que `'heal'|'mana'`, `hud.ts` n'a que `hpBtn`/`mpBtn` ; seul le bot (`brain.ts:1557`) en boit. Les rejuv ramassées (5 % des tirages `potion`) s'entassent dans `belt[2]` sans bouton ni quantité affichée. | Bug fonctionnel ; la recette Cube « 3 rejuv → full rejuv » de D2/PD2 n'a de sens que si on peut en boire | S | bouton HUD + touche + affichage qté |
| P0-2 | **Durabilité et réparation** | Aucune durabilité sur `Item` ; zéro `repair` hors `repairInventory` (réarrangement de grille). La propriété `indestructible` existe en données mais ne protège de rien ; « Éthéré » n'est que +50 % défense (`itemtext.ts:144`, pas de durabilité réduite). Charsi / Fara / Hratli / Halbu sont de simples marchands. Recettes Cube de réparation (4 en D2, 3 en PD2) absentes. | Boucle économique D2/PD2 (puits d'or, éthérés risqués, Vial of Lightsong, Zod+Skull) | M | marchands (P0-3), tooltips, recettes Cube |
| P0-3 | **Marchands par PNJ + jeu de hasard (Gheed)** | `app.ts` : tous les PNJ « Commercer » mènent à deux étals génériques (`malah`, `larzuk`) ; `refreshVendor` génère le même stock (8 magiques/rares accessoires, 4 armes, ~10 bases blanches à châsses) rafraîchi par `runCounter`, pas par acte/PNJ. Gheed vend comme Larzuk, aucun gamble, aucune option de rachat, aucun stock de potions/clés/tomes par PNJ. | Gamble = puits d'or et source d'ilvl pour le craft PD2 (« clvl-5…clvl+4 ») ; stock dépendant du PNJ = identité de D2 | M | génération d'objets (existante), UI vendeur |
| P0-4 | **Respec / Jeton d'absolution inerte** | `token_absolution` est une base (`misc.ts`), jamais consommée (`grep` : aucune utilisation hors icône et `testchar`). Aucune recette « 4 essences → jeton » (les essences servent à la finale Pandémonium). Respecs : 1 au départ + 1 par premier passage de run listé (`firstClear.respec`). | Sans jeton, reconstruire un build est impossible après 2 respecs ; PD2 en fait la voie normale | S | recette Cube ou drop, bouton « Utiliser » |
| P0-5 | **Artisanat : 3 familles PD2 absentes** | `CraftFamily = caster|blood|safety|brilliant`. Manquent **Hitpower** (saphir, D2 vanilla : 9 recettes), **Vampirique** (crâne), **Généreux/Bountiful** (topaze) ; pas de craft de carquois ; formule d'ilvl du craft PD2 (⌊clvl/2⌋+⌊ilvl/2⌋) non vérifiée. Les valeurs fixes sont « adaptées » (`cube.ts:105`). | PD2 : « les crafts sont la route du meilleur équipement » (Crafting, 7 familles) | M | quelques stats déjà présentes (frostNova on-struck à vérifier) |

### P1 : important (16)

| # | Élément | Constat | Effort | Dépendances |
|---|---|---|---|---|
| P1-1 | Objets à charges (30 uniques D2 : Spellsteel, Hexfire, Bloodmoon, Gargoyle's Bite, Hellrack, Andariel's Visage…, + 205 suffixes « of X (charges) ») | propriété `charged` absente (`uniques-d2.ts` : Spellsteel sans charge) ; backlog n° 26 | M | UI de charges dans HUD, recharge Cube |
| P1-2 | Mode Hardcore (permadeath, ladder séparée) | aucun code ; `playerDeath` → 3 s puis ville | M | marqueur de personnage dans la sauvegarde, écran de sélection |
| P1-3 | Multijoueur / groupe : XP partagée, drops partagés, `/players X`, PvP | jeu strictement mono ; monde `World` mono-joueur | L | serveur d'état (rien dans l'architecture) |
| P1-4 | Échange entre joueurs (trade) | absent ; seulement vente aux PNJ | L | P1-3 |
| P1-5 | Ladder / saisons / classements | absent | L | serveur |
| P1-6 | Quêtes manquantes (12 sur 27) et mécaniques de quête : Staff of Kings→Horadric Staff (Cube), Khalim's Will, Wirt's Leg (portail Vaches par Cube), Lam Esen (stats), Radament (compétence), Larzuk (châsses PD2, `reward` absent), Malus / Charsi (fait pour l'imprégnation) | `quests.ts` : 15 entrées, objectifs kind `clear|kill|run` uniquement | M | Cube (P1-7) |
| P1-7 | ~25 recettes Cube : Horadric Staff, Khalim's Will, portail des Vaches, 3 recettes de rajeunissement, antidote, anneaux gemmés (Jade/Garnet/Coral/Cobalt), Prismatic, Leech/Spikes/Savage, javelots/hache de jet/carquois, 3 variantes « arme magique à châsses », « bas → normal », réparation ×4, `Hitpower` ×9, rare haut niveau/ + châsse, Vial of Lightsong, Lilith's Mirror, Cube démoniaque (reroll uniques/sets), fragments de joyau, cendres de Hellfire, accès aux ubers PD2 (Relic, Talisman, Vision of Terror, Voidstone, Shadow of Hatred) | `data/cube.ts` : 97 entrées | M | P0-2, P1-6 |
| P1-8 | Sanctuaires : 18 types manquants (Santé, Mana, Échange de vie/mana, Combat, 4 résistances, Endurance, Recharge, Enirhs, Portail inconnu, Gemme, Orage, Distorsion, Explosif, Poison) | `objects.ts:42` tire parmi 4 types, durée fixe 96 s, pas de délai de réapparition | M | effets déjà présents (buffs, résistances) |
| P1-9 | Échange d'armes (W) et deux jeux d'armes | aucun slot alternatif (`swap` n'apparaît que dans le bot) | S | slots, UI, touches |
| P1-10 | Carte : mémoire de l'exploration (« brouillard ») | `hud.ts:523` redessine murs/props/objets dans un rayon autour du joueur, sans zones découvertes mémorisées ; grande carte = même rendu ×2,4 (520 px) ; pas de légende (points de passage, PNJ nommés, coffres) | S-M | grille de découverte par zone |
| P1-11 | Raccourcis : rajeunissement, ceinture 1-4, F1-F8, W, A/automap, Q quêtes, H, courir/marcher, Alt (étiquettes), recharge du filtre | `controls.ts:407-455` | S | P0-1, P1-9 |
| P1-12 | Potions/ceinture fidèles (voir §3.1) | modèle à trois compteurs, palier global écrasé par `max()` | S-M | P0-1 |
| P1-13 | Soin à la montée de niveau | `progression.ts` : +30 % ; D2 rend vie et mana au maximum (le commentaire du code « D2 : ne soigne pas » est faux) | S | aucune |
| P1-14 | Filtre de butin PD2 : règles utilisateur (conditions par type/qualité/ilvl/châsses/stat), nom et couleur personnalisés, description, sons, icône de carte, niveaux de filtre, affichage de l'ilvl et des plages d'affixes | `filter.ts` 87 lignes : 7 préréglages (`all, leveling, standard, runewords, endgame, strict, runehunt`) et 12 champs (`minQuality, minBaseTier, showSocketedNormals, showSuperior, showEthereal, beamRuneRank, hideLowRunes, minGemGrade, showPotions, revealHidden, classLock, levelAware, gearOff`) ; aucune règle par affixe (ex. « anneau avec FCR 10 + vol de vie »), rien sur les sets/uniques précis, charmes (toujours `SHOW_GOOD`), cartes (toujours valeur) | M-L | tooltips (ilvl) |
| P1-15 | Coffre : or en banque + plafond d'or | `stashGold` déclaré (`character.ts:135`) mais jamais utilisé ; aucun plafond d'or (D2 : 10 000 × niveau dans le sac) | S | UI coffre |
| P1-16 | Sauvegarde : tout dans `localStorage` (`platform.ts` : slots + `.backup` + coffre partagé), pas de cloud, pas de stockage persistant demandé | risque de quota (~5 Mo) et d'effacement ; export/import fichier existe | M | IndexedDB, `navigator.storage.persist` |

### P2 : confort / rare (11)

| # | Élément | Constat | Effort |
|---|---|---|---|
| P2-1 | Identification (objets non identifiés, Tome/Parchemin d'identification) et Tome de Portail | tout est identifié ; portail de ville illimité (bouton `portalBtn`, un seul portail, `openPortal`) | M |
| P2-2 | Corps et mort : aucun cadavre (D2 softcore : équipement sur le corps, récupération) ; mort → 3 s → ville, run suspendue avec portail de retour | M |
| P2-3 | Carquois/munitions, endurance et course/marche | pas de `quiver`/`stamina` dans le code ; arcs sans munitions | M |
| P2-4 | Potions annexes : endurance, antidote, dégel, grenades ; paliers distincts (noms D2 : Mineure…Suprême) | S-M |
| P2-5 | Mercenaire avec son propre niveau/XP et soins/rachat | `mercDerived` : `lvl = c.level` | M |
| P2-6 | Manette (aucun `Gamepad`) | M |
| P2-7 | Accessibilité : daltonisme (rares/magiques distingués par la seule couleur : `labelClass`), taille de texte, lecteurs d'écran (aucun `aria-*` hors i18n), contrastes ; seuls zoom 0,8-1,25, secousses, gaucher, vibrations | M |
| P2-8 | Autres langues (D2 : 11) ; coût d'ajout faible car `i18n/index.ts` traduit à l'affichage, mais toutes les chaînes sources sont en français dans le code | L |
| P2-9 | Musique par acte : la ville joue toujours `town4` (`app.ts:595` : `w.zone.town ? 'harrogath'`) ; town1/2/3 sont extraites mais inutilisées ; pas d'Acte V (`d2xmusic.mpq` manquant) ; boss stingers 11 | S |
| P2-10 | Voix des PNJ : fenêtre de dialogue pour Harrogath (lot 15) ; acte I-III : lignes `npcLines` existent (`audio.ts:127`) mais les PNJ sans `Gossip` affichent un message court `hud.message` (Geglash, Meshif, Jerhyn, Cain…) | S-M |
| P2-11 | Mode hors ligne : SW précache cœur + planches ; en mode chiffré (chargeur optionnel), les sprites D2 sont chargés à la demande (zone par zone) donc la première visite d'une zone requiert le réseau ; pas d'indicateur hors ligne | S |

### P3 : cosmétique (4)
- Succès : D2 vanilla et PD2 n'en ont pas (rien à combler) ; un panneau « journal de jalons » existerait (`progression.milestones`).
- Chat, émotes, Social : sans objet tant que P1-3 n'existe pas.
- Polices bitmap D2 (backlog n° 36), curseurs D2.
- Tooltips : pas de vitesse d'arme (IAS/WSM), pas de plages `[a-b]` ni d'ilvl (option PD2 « Show Item Level / Show Stat Ranges »), pas de comparaison à l'autre anneau.

## 3. Écarts de fidélité les plus graves

### 3.1 Potions et ceinture
- `world.ts:596-620` : soin = % du max (paliers `[0.25, 0.35, 0.5, 0.7, 1]`) étalé sur 25 ticks ; D2 : montants fixes (mineure 45 → suprême 320 PV) sur 7 s (soin) ou instantané (rejuv 35 % / 100 %). Rajeunissement : palier 0 = 35 %, ≥ 1 = 100 % (D2 : deux objets distincts).
- `inventory.ts:207` : `slot.tier = Math.max(slot.tier, item.ilvl)` ; une seule potion de palier 4 ramassée fait monter **tout le tas** à 100 % (8 potions deviennent 8 suprêmes). Exemple : ceinture 7 potions palier 0 + 1 supérieure ramassée = 8 potions palier 4.
- `character.ts:186` : capacité par type `2 + rangées × 2` (sash/ceinture légère 6, ceintures normales 8, élites 10 ⇒ jusqu'à 30 potions sur trois compteurs ; sans ceinture 4 par type = 12). D2 : 4 colonnes partagées par tous les types (1-4 rangées), 0 sans ceinture. Pas de touches 1-4 par colonne.
- Recharge globale 12 ticks (0,48 s) pour tout, absente en D2.
- Achat : `buyConsumable` prix `max(25, niv × 6)` (au lieu de la table PNJ par acte), palier selon le niveau du joueur (`potionTierForLevel` : 12/24/40/60).

### 3.2 Boutique et économie
- `sellPrice` = `floor(base.price × q / 4 + ilvl × 3)` avec q unique 6 / set 5 / rare 3 : formule inventée (D2 : prix = f(affixes), vente = ¼ ; réparation/recharge en or). Prix d'achat ×5 (magique/rare) ou ×2 (armes blanches) arbitraires.
- Le marchand propose des bases blanches **à châsses 2-4** (`refreshVendor`) vendues ×6 : en D2/PD2 les châsses viennent de Larzuk/recettes/Malus, ici l'étal contourne les recettes de châsses.
- Pas de « Vendre tout » sauf `sellCommon` (équipement ordinaire seulement) ; pas de rachat.

### 3.3 Mort et XP
- Pénalité 0 / 5 / 10 % (`progression.ts:85`) calquée sur PD2, mais aucune perte d'or ni de corps ; retour automatique en ville après 3 s. Montée de niveau : +30 % de PV/mana (D2 : plein).
- XP : formule de différence de niveau et ratios 1.13 corrects (`xp.ts`, `levelDiffMultiplier`) mais multipliée par `RATES.xp × xpCurveAt(clvl)` (accélération propre au jeu) ; pas de partage de groupe (aucun joueur 2).

### 3.4 Cube
- Clé exigée pour les runes et pour sans défaut → parfaite (conforme PD2) ; manque seulement la promotion en lot (jusqu'à 48 sans défaut → 16 parfaites, PD2).
- `Jeton` : voir P0-4 ; `essence_*` alimentent à la place `pandemonium_finale` (PD2 : Talisman pour Uber Tristram).
- Craft `Éclat` (diamant) : famille PD2 « Brilliant » présente, mais valeurs adaptées, pas les valeurs de la table PD2 (ex. Amulette Brilliant : Def vs projectiles 100-150, +4-8 à tous les attributs, toutes résistances 5-10 ; le jeu met pierceAll/ene/mana).

### 3.5 Sanctuaires
- Quatre effets seulement, durée fixe 96 s (le champ `Duration in frames` / `reset time` de `Shrines.txt` n'est pas lu, valeurs non mesurées ici) ; aucun sanctuaire dangereux (orage, explosif, poison, distorsion).

### 3.6 Mercenaires
- Compétences et auras fidèles (lot 9), mais pas de niveau propre : `lvl = c.level` ; D2 : niveau plafonné au joueur et XP propre ; résurrection coûte `mercResurrectCost(level)`, pas de rachat/ré-engagement par difficulté ; équipement par UI dédiée (OK).

### 3.7 Divers
- Respec : `respecs` démarre à 1 (D2 : 0 + quête, PD2 : jeton). Reset conserve l'équipement non requis (OK).
- Aperçu d'objets au sol : nom seul (pas de description PD2 : sockets/ED/ilvl dans le nom).
- Saisie PC : clic = déplacement (comme D2) ; mobile : joystick + auto-visée ; bon, mais pas de remapping de touches.

## 4. Ce qui est déjà au niveau

- Coffre D2R : 4 onglets, partagé entre personnages, onglets runes/gemmes/matériaux auto-rangés (équivalent des stacks PD2), Cube en grille 3 × 4, glisser-déposer, tri.
- Inventaire en grille D2 (tailles `sizes-d2.ts`), comparaison avec l'équipement porté et deltas dans l'infobulle, bonus de set actifs/inactifs, mots runiques possibles listés, préréglages de filtre, aperçu du filtre.
- Mercenaires des 4 actes + 1, équipement, auras, résurrection.
- 39/39 points de passage, difficultés Normal/Cauchemar/Enfer avec pénalités de résistance et déblocage par Baal, Pandémonium, maps, corruption, imprégnation de Charsi.
- Sauvegarde versionnée avec sauvegarde de secours (`.backup`), export/import fichier, mises à jour sans interruption (SW), PWA hors ligne pour le cœur.
- Audio : sons et voix D2 importés, 24 pistes de musique, ambiances par zone, vibrations ; réglages de zoom, gaucher, secousses, chiffres de dégâts.
- Localisation EN/FR commutable à chaud (3 678 clés), journal des nouveautés dans le jeu.

