# Dépendances résiduelles de la base à Project Diablo 2

> Généré par `npm run mods:residual` (tools/ci/pd2-residual.ts) : ne pas modifier à la main. La CI (job `suppression`) vérifie qu'il est à
> jour. Plan : lots M0 à M14 (docs/JOURNAL.md, lots 198 et suivants) ; système de mods : src/mods/README.md.

Le **test de suppression** (`node tools/ci/suppression.mjs`, job CI `suppression`) prouve ce qui est déjà isolé : sans `mods/`, le projet
compile, passe le lint et les tests de la base, et le build public ne contient aucun texte propre au mod. Il ne prouve **pas** que la base
soit Diablo II vanilla : tout ce qui suit est encore PD2 dans la base, et un personnage joué sans le mod peut encore rencontrer du contenu
PD2 (règles et interface de la partie 6, cartes) ; un identifiant de la partie 1 est inconnu sans le mod, et le code qui le lit ne fait
rien. Le jeu `d2` est proposé à la création depuis le lot M12b (bots de la base de l'Acte I à Baal, aucune erreur des panneaux ni des menus
d'objets sans le mod : docs/JOURNAL.md, lot 245).

## 1. Identifiants du mod écrits dans le code de la base (66 identifiants, 26 fichiers)

Le contenu a été déplacé dans `mods/pd2` (lot M4), mais ces fichiers de `src/` le désignent encore par son identifiant. Sans le mod,
l'identifiant est inconnu : le code qui le lit ne fait rien. Restent, depuis le lot M10f (butin, Cube, catalogue de valeur, Pandémonium sortis
de la base : règles `loot.value`, `cube.craft`, patchs) et le lot M13 (bots : règle `bots.profile`), la simulation, les textes, sons et
effets des compétences propres à PD2 (l'interface de l'énigme de Larzuk est dans le mod depuis le lot M12b : point d'insertion
`item.socketActions`, règle `cube.socketCap`).
Un identifiant que la base a aussi (entrée de D2 que le patch du mod retire puis remet à sa place) n'est pas compté.

| Fichier | Nombre | Identifiants |
| --- | --- | --- |
| `src/data/cube.ts` | 1 | `desecrate` |
| `src/data/mercs.ts` | 2 | `ascendant`, `holy_light` |
| `src/data/monsters.ts` | 2 | `ascendant`, `raise_skeleton_archer` |
| `src/mods/d2/mercs.ts` | 1 | `ascendant` |
| `src/platform/audio.ts` | 3 | `combustion`, `ice_barrage`, `lesser_hydra` |
| `src/platform/d2sound-map.ts` | 10 | `cold_enchant`, `combustion`, `gust`, `holy_light`, `holy_nova`, `holy_sword`, `ice_barrage`, `joust`, `lesser_hydra`, `raise_skeleton_archer` |
| `src/render/fx.ts` | 2 | `cold_enchant`, `holy_nova` |
| `src/render/roster.ts` | 1 | `holy_nova` |
| `src/sim/assassin.ts` | 1 | `chain_lightning_sentry` |
| `src/sim/barbarian.ts` | 1 | `split_throw` |
| `src/sim/cube.ts` | 1 | `desecrate` |
| `src/sim/derive-calc.ts` | 3 | `combat_reflexes`, `holy_sword`, `joust` |
| `src/sim/druid.ts` | 2 | `gust`, `raise_skeleton_archer` |
| `src/sim/merc-strike.ts` | 1 | `holy_light` |
| `src/sim/minions.ts` | 1 | `raise_skeleton_archer` |
| `src/sim/necromancer.ts` | 5 | `blood_warp`, `curse_mastery`, `dark_pact`, `desecrate`, `raise_skeleton_archer` |
| `src/sim/paladin.ts` | 4 | `holy_light`, `holy_nova`, `holy_sword`, `joust` |
| `src/sim/shadow-cast.ts` | 1 | `chain_lightning_sentry` |
| `src/sim/skill-cast-sorc.ts` | 4 | `cold_enchant`, `combustion`, `ice_barrage`, `lesser_hydra` |
| `src/sim/skill-cast.ts` | 1 | `cold_enchant` |
| `src/sim/skills.ts` | 1 | `cold_enchant` |
| `src/sim/summon-bar.ts` | 1 | `raise_skeleton_archer` |
| `src/sim/testchar.ts` | 2 | `cold_enchant`, `ice_barrage` |
| `src/sim/weaponreq.ts` | 1 | `split_throw` |
| `src/sim/weapons.ts` | 3 | `javelin_mastery`, `one_hand_mastery`, `two_hand_mastery` |
| `src/ui/skilltext.ts` | 11 | `blood_warp`, `combat_reflexes`, `combustion`, `curse_mastery`, `deep_wounds`, `holy_sword`, `ice_barrage`, `javelin_mastery`, `one_hand_mastery`, `split_throw`, `two_hand_mastery` |

## 2. Préfixes d'identifiants du mod construits dans la base

| Fichier | Nombre | Préfixes |
| --- | --- | --- |
| `src/render/renderer-fx.ts` | 1 | `curse_${…}` |
| `src/render/roster.ts` | 1 | `curse_…` |
| `src/sim/necromancer.ts` | 1 | `curse_${…}` |

## 3. Fichiers et identifiants de code PD2 encore dans la base

Fichiers nommés `*pd2*` hors du mod (données PD2 fondues ou remplaçant le vanilla, lots M6, M10) :



Identifiants de code `PD2_…` / `pd2…` (ex. `PD2_AFFIXES`, `PD2_RUNEWORDS`) par fichier de `src/` :



## 4. Mentions « PD2 » / « Project Diablo » dans `src/` (commentaires et textes), par dossier

- `src/app.ts` : 1
- `src/data` : 108
- `src/mods` : 15
- `src/platform` : 4
- `src/sim` : 237
- `src/ui` : 215

## 5. Tests de la base sautés sans le mod (43)

Tests dont le code testé est dans la base mais qui utilisent un objet, une recette ou une table du mod (`it.skipIf(withoutPd2)`,
tests/needs-pd2.ts) :

- `tests/unit/auto-pickup.test.ts` : éclats de Pierre-Monde, orbes et clés sont ramassés ; l’or garde son circuit ; réglage désactivable
- `tests/unit/auto-pickup.test.ts` : neutre par défaut du module (tests, bots)
- `tests/unit/balance-builds.test.ts` : cartes et orbes à Abondant : au plus 4× le palier Normal (plafond de l'économie de cartes)
- `tests/unit/bot-cube.test.ts` : monte une boîte à énigme, ajoute des châsses à son unique porté et y sertit des gemmes
- `tests/unit/charm-value.test.ts` : charmes majeurs : 25 à 40 % portent un +compétences d’arbre (de la classe en jeu)
- `tests/unit/combat-systems.test.ts` : ne dépend pas de la vitesse d’attaque
- `tests/unit/combat-systems.test.ts` : Zèle : trois frappes échelonnées dans un cycle de même durée qu’avant (DPS théorique inchangé)
- `tests/unit/crafting.test.ts` : un objet corrompu ne peut plus passer au Cube ; le sertissage reste possible
- `tests/unit/crafting.test.ts` : amélioration : puis élite (PD2)
- `tests/unit/durability.test.ts` : le marchand propose aussi des armes et des carquois (types tirés au sort)
- `tests/unit/farm-bosses.test.ts` : la Comtesse lâche des runes à chaque mort (Runes 4 / 8 / 12) et plus haut en Enfer qu'en Normal
- `tests/unit/farm-bosses.test.ts` : chaque boss lâche du butin à chaque difficulté (TC propre)
- `tests/unit/farm-bosses.test.ts` : une run d'Enfer corrompue passe au niveau 85 avec ses modificateurs, survit à la sauvegarde et lâche des éclats
- `tests/unit/farm-bosses.test.ts` : n'apparaît plus au hasard (PD2 : accès par la Vision de la terreur) et lâche Annihilus
- `tests/unit/fidelity-lot1.test.ts` : l’esquive de l’Amazone évite des coups de mêlée immobile
- `tests/unit/filter.test.ts` : palier des bases, avec exceptions pour les bases à châsses et éthérées
- `tests/unit/items.test.ts` : châsses PD2 (wiki Item_Bases) : orbe d’aigle 2 au plus
- `tests/unit/loot-tier.test.ts` : monnaies : éclats et essences exceptionnels, or et clé sans palier
- `tests/unit/loot-value.test.ts` : tous les identifiants existent
- `tests/unit/loot-value.test.ts` : runes et monnaies : inchangées
- `tests/unit/merc-auras.test.ts` : référence joueur : la Conviction du joueur donne la même réduction que celle du mercenaire (niveau égal)
- `tests/unit/portal-after-death.test.ts` : carte : boss mort puis retour volontaire en ville : le portail reste, rien ne se rejoue ; une autre run le retire
- `tests/unit/set-bonuses.test.ts` : Civerb (PD2) : le bonus de 2 pièces s’active à 2 pièces, celui de la panoplie complète à 3
- `tests/unit/skills.test.ts` : exploding_arrow (test généré)
- `tests/unit/skills.test.ts` : freezing_arrow (test généré)
- `tests/unit/skills.test.ts` : valkyrie (test généré)
- `tests/unit/skills.test.ts` : combat_reflexes (test généré)
- `tests/unit/skills.test.ts` : stun (test généré)
- `tests/unit/skills.test.ts` : hunger (test généré)
- `tests/unit/skills.test.ts` : molten_boulder (test généré)
- `tests/unit/skills.test.ts` : vengeance (test généré)
- `tests/unit/socket-actions.test.ts` : boîte à énigme : accepte un unique ; pièce d’énigme : refuse un unique
- `tests/unit/stash-all.test.ts` : persistance : coffre partagé et personnage se rechargent sans perte ni doublon
- `tests/unit/stash-search.test.ts` : cartes : trouvées dans le coffre de cartes (onglet -5)
- `tests/unit/stash-sort.test.ts` : tri d’une page : mêmes objets (uid), aucun chevauchement, ordre des catégories
- `tests/unit/stat-effects.test.ts` : auras d’objet et charges
- `tests/unit/stat-effects.test.ts` : Berserker au complet : dégâts maximum améliorés par niveau (edMaxPctPerLvl) ; rayon des dégâts de zone
- `tests/unit/stat-effects.test.ts` : carquois : squelettes archers et flèches de glace supplémentaires
- `tests/unit/stat-effects.test.ts` : Sacrifice : le monstre tué explose et blesse ses voisins
- `tests/unit/summon-bar.test.ts` : compte par type : 3 squelettes, 2 golems, 1 loup
- `tests/unit/ui-panels.test.ts` : inventaire : un objet du sac se sélectionne, s’affiche dans la colonne Objet et s’équipe
- `tests/unit/ui-panels.test.ts` : coffre : onglets Gemmes et Runes, retour au coffre, dépôt d’un objet
- `tests/unit/world-objects.test.ts` : Tunnels antiques, temples de Kurast, égouts : plus de niveaux 1-2 hérités des tables annexes du wiki

## 6. Non isolé par conception à ce stade (relevé du plan, non mesuré par ce script)

- **Tables vanilla de la base** (lots M6a à M6d, M10) : bases d'objets, runes, gemmes, uniques, sets, affixes, mots runiques, recettes du Cube, niveaux de zone (`levels-a*.ts`, et
  niveaux des runs et des étapes construites à part : blocs générés de `runs.ts` et `zones/act1.ts`), classes de trésor (bloc généré
  de `treasure.ts`) et fidélité des monstres (`monsters-fidelity.ts`, `monsters-d2.ts`) régénérés depuis les MPQ
  (`tools/vanilla/gen.ts`, `npm run vanilla`), valeurs PD2 en patch généré par diff (`mods/pd2/data/**.patch.ts`,
  `mods/pd2/tools/vanilla-diff.ts`). Restent propres au jeu dans ces tables (ni D2 ni contrôlées) : noms affichés, icônes, prix,
  poids, `+mana` implicite des orbes, niveau de qualité des gemmes ; propriétés D2 que la simulation n'applique pas (charges,
  aveuglement, endurance…) absentes. Compétences des objets : celles de Diablo II depuis le lot M9a (Empaler, Explosion de poison,
  maîtrises d'armes du Barbare… : identifiants de skills-d2.ts).
  Butin : le modèle du moteur (structure de l'Enfer de l'Acte V pour toutes les zones, `GOOD_GEMS` et `ZONE_RUNE_TC` par zone et non
  par acte, TC d'unique pour les super-uniques ordinaires, ni TC de quête ni objet unique nommé ; or plus généreux en début de
  partie) ; clés `map` et `pandemonium` de `ZONE_RUNE_TC`. Pandémonium (lot M10e) : celui de D2 1.11 dans la base (clés et organes
  des TC, Finale par les organes, Torche du dernier mal primordial : `src/sim/loot/uber-drops.ts`, Annihilus du Clone : TC « ROP »,
  unique nommé `unique:…`) ; l'Étendard des Héros (absent du jeu de base) et l'accès au Clone de Diablo en solo (D2 : vente de
  Pierres de Jordan sur Battle.net seulement ; la run `uber_dclone` n'est ouverte que par le mod) manquent. Monstres : écrits à la main dans `monsters.ts` (kits d'attaques, échelles de
  vie et de dégâts, niveaux des boss `bossLevel`) ;
  monstres propres à PD2 dans la base : Déchu au trésor (événement de carte), ubers PD2 (Anciens ultimes, Rathma, Mendeln, Lucion) et
  leurs zones (`zones/farm.ts`), copies des boss de la base faites au chargement (les boss PD2 ne sont pas touchés).
- **Affixes** (lot M10a) : table de la base = MagicPrefix.txt / MagicSuffix.txt 1.13c (`affixes-d2.ts`, types d'ItemTypes.txt
  `itemtypes-d2.ts`), table PD2 en patch (`mods/pd2/data/items/affixes.patch.ts`). Restent dans la base : les noms de types du wiki
  PD2 (`AFFIX_TYPES`, lus par le patch et par les noms des rares), les anciens affixes du jeu (`LEGACY_AFFIXES`, sauvegardes), et les
  règles PD2 de génération (deux affixes garantis au-delà d'un ilvl, « staffmods » PD2, charmes majeurs « skillers » : `itemgen.ts`) ;
  propriétés D2 non appliquées (charges, endurance, réparation : 130 lignes tirables écartées), affixes propres à une classe
  (`classspecific`) et AutoMagic.txt (non utilisé par le moteur) absents.
- **Mots runiques** (lot M10b) : table de la base = Runes.txt 1.13c (`runewords-d2.ts`, lignes `complete`, types d'ItemTypes.txt),
  table PD2 en patch (`mods/pd2/data/items/runewords.patch.ts` ; variantes PD2 par type, comme Esprit sur bouclier, en entrées à part).
  Propriétés D2 non appliquées absentes (charges, absorption magique, compétences D2 retirées par PD2…).
- **Cube** (lot M10c) : recettes de la base = CubeMain.txt 1.13c d'une partie solo (sans les recettes ladder : runes au-delà de Dol,
  uniques vers élite) ; amélioration des runes et artisanat générés (`cube-d2.ts`, règle `cube.craft` : `src/mods/d2/cube.ts`), autres
  recettes écrites dans `cube.ts` et contrôlées contre la table (`vanilla-cube.test.ts`) ; valeurs PD2 en patch
  (`mods/pd2/data/cube.patch.ts` : runes « avec une clé », familles vampirique, abondance et éclat, Talisman, Zod) et artisanat PD2 en
  règle (`mods/pd2/rules/cube.ts`). Non reprises (objets ou résultats absents du moteur) : potions, flèches, haches de jet et javelots,
  qualité inférieure, objets magiques à affixe imposé, recettes de la Pierre de Jordan, recharge, niveau requis ajouté par
  l'amélioration ; le parchemin de portail de la recette qui vide les châsses. Restent du moteur, communs aux deux jeux de règles :
  le livre de recettes (choix de la recette, puis de l'objet), le portail du Pandémonium sans répétition, l'éthéré conservé à l'artisanat.
- **Tables PD2 sans équivalent vanilla** : aucune depuis le lot M10d (mercenaires : Hireling.txt dans la base, `src/data/mercs-d2.ts` et modèle `merc.model` ; tableaux, paliers et sous-types PD2 dans le mod, `mods/pd2/data/mercs.gen.ts`, `mercs.patch.ts`).
- **Compétences** : arbres de la base = les 210 compétences de Diablo II LoD 1.13c (lot M9a : Skills.txt et SkillDesc.txt,
  `skills-d2.ts` : place dans l'arbre, niveau requis, prérequis, synergies que la simulation applique), arbres PD2 S13 en patch
  (`mods/pd2/data/skills.patch.ts` : 21 compétences PD2 ajoutées, 12 de D2 retirées, déplacements, prérequis, textes et chiffres des
  fichiers de classe d'avant le lot), renommages des anciennes sauvegardes et import .d2s en règles (`skills.renames`,
  `skills.d2sImport`) ; les chiffres, synergies et tables par points durs PD2 sont dans le mod (lot M7 : `api.skills.patchNumbers`,
  `patchSynergies`, règle `skills.hardValue`). Restent dans la base : la simulation des 21 compétences propres à PD2 (partie 1
  ci-dessus : fichiers de classe de `src/sim`, textes, sons, effets), les chiffres « D2 » des fichiers de classe des classes pas
  encore faites (aucune depuis le lot M9h : les sept classes, lots M9b à M9h : chiffres de Skills.txt et Missiles.txt dans
  `skills-d2.ts`, comportements PD2 de leurs compétences dans les règles `skills.sorceress`, `skills.amazon`,
  `skills.barbarian`, `skills.masteryOf`, `skills.paladin`, `skills.necromancer`, `skills.druid`, `skills.assassin` du mod ;
  chiffres des effets des charges 2 et 3 des attaques à charges de l'Assassin : fichier de classe, Arreat Summit), rayons d'explosion PD2 dans `missiles.explode` ; statistiques des créatures invoquées, constantes de
  cadence et de rayon du moteur : modèle du moteur), les noms de tables par points durs lus par la simulation (`skillHard`, tables du wiki PD2), les règles de
  classe de D2 et de PD2 des caractéristiques dérivées étant des règles depuis le lot M8d (Chaleur, Maîtrises, armures de la Sorcière,
  Bouclier d'énergie, cadence des auras, Prière, Sanctuaire, Épines, esquive : `skills.sorceress`, `skills.paladin`,
  `skills.amazon`) ; les
  12 compétences de D2 recréées sont simulées, sauf l'Endurance accrue (le moteur n'a pas d'endurance). Sans
  le mod, une compétence qui lit une table par points durs reçoit 0 (valeur de repli de la simulation quand elle en a une).
- **Règles en dur** : formules de combat dans le mod depuis le lot M8a (règles `combat.monsterRes`, `combat.leech`,
  `combat.crushingBlow`, `combat.criticalMul`, `combat.weaponSplash`, `combat.openWounds`, `combat.bleedTick`, `combat.chillFreeze`,
  `combat.absorbPctMax` : `mods/pd2/rules/combat.ts` ; `combat.playerHitRecovery`, depuis le lot M13 : récupération après coup du joueur
  au seuil de D2, 1/12 de la vie, dans la base et, depuis le lot 321, dans le jeu pd2 aussi : le « tout coup qui touche » du pd2 est retiré), règles des mercenaires depuis le lot M8b (`merc.itemWear`,
  `merc.bossDamagePct`, et le modèle `merc.model` depuis le lot M10d : `mods/pd2/rules/mercs.ts`) et des caractéristiques depuis le lot M8c (`char.maxResCap`,
  `char.toHitFactor`, `char.blockFactor` : `mods/pd2/rules/character.ts` ; caractéristiques des classes de CharStats.txt, mana par
  niveau et endurance PD2 en patch : `mods/pd2/data/classes.patch.ts`) et de l'expérience selon l'écart de niveau depuis le lot M8f
  (`xp.levelFactor` : `mods/pd2/rules/progression.ts`), taux de butin et d'expérience depuis le lot M8e (règle `loot.rates` :
  conforts de D2 Mobile et taux PD2 dans `mods/pd2/data/rates.ts`, base sans multiplicateur ; les paliers de butin du joueur restent
  calibrés sur le jeu pd2) ; base : Diablo II LoD 1.13c, `src/mods/d2/` ; restent dans la base les règles
  PD2 des compétences (Sanctuaire contre les morts-vivants, Prière, Drain de vie, esquive, Bouclier d'énergie : fichiers de classe et
  `derive-calc`), des tableaux de statistiques et compétences des sous-types PD2 de mercenaires (données, M10 ; bonus de set du
  mercenaire et objets de l'ancien mercenaire rendus au joueur : règle de D2 non vérifiée, gardés) ;
  approximations du moteur communes aux deux jeux de règles (récupération après coup des monstres, incantation jamais interrompue par un
  coup, blocage en mouvement, auras des monstres).
- **Cartes et endgame** : zones, affixes, génération, ouverture, butin, recettes, modificateurs de monde et boss de carte sont dans le mod
  (lots M5a à M5c : règles nommées `maps.*`, `world.*`, `combat.*`, `ai.mapBoss`, `runs.mapBossDeath`). Restent dans la base : le
  cadre des runs de carte (`Game.startMap`, `RunState.mapTier`, `Monster.mapBoss` et son état `sim/map-boss-state.ts`, plafond
  des résistances naturelles en carte de `spawn.ts`, butin du boss de carte `MAP_BOSS_LOOT` de `drops.ts`), le coffre de cartes
  (`mapstash*`, rangement et ramassage) et l'interface des cartes (onglet du coffre de cartes, menu et fusion, infobulle : elles lisent
  les registres et les règles `maps.*`, opérations comprises depuis le lot M5c) ; zones corrompues (`Game.startRun`), ubers PD2
  (monstres et zones ; leur butin et les exclusivités DClone/Rathma sont dans le mod depuis le lot M6d : `mods/pd2/sim/pandemonium.ts`).
- **Bots** (lot M13) : plans de compétences, listes de compétences du cerveau, mercenaire voulu, préparation de ville (boîtes à énigme,
  cartes d'endgame), charmes de l'arène et seuils des tests de bots par jeu de règles (règle `bots.profile` : base `src/mods/d2/bots.ts`, mod
  `mods/pd2/bots/`). Restent dans le cerveau de la base, communs aux deux jeux de règles : l'esquive des marqueurs au sol des boss de carte
  (inerte hors carte), le rangement des cartes au coffre (type d'objet `map`). Écart mesuré des bots de la base avec D2 (lot M13, docs/JOURNAL.md) :
  la campagne est jouable (Druide feu : Baal du Normal en 4 h 20 à 4 h 48 de jeu, celui du Cauchemar à 7 h 41, l'Enfer ensuite), mais
  les classes de mêlée et d'arc et la Sorcière meurent presque à chaque run en début de partie : Tristram (zone au niveau du personnage)
  et la Comtesse sont les seules runs ouvertes aux bots avant le niveau 14 (zones de campagne non proposées), l'économie de D2 est
  sans multiplicateur et les courbes de vie et de dégâts des monstres du moteur sont calibrées sur le jeu pd2.
- **Réglages et interface** : les réglages du mod pd2 sont sous `Settings.mods.pd2` (lot M11c, `api.settings.declare`) ; leurs options
  restent décrites dans le catalogue de la base (`settings-catalog.ts`, `mod: true` : affichées seulement avec le mod) : les points
  d'insertion d'interface des mods (lot M12, `src/mods/ui.ts`, docs/MODS.md : menu, création, fiche, level-up, HUD, point de passage,
  artisanat) n'ont pas encore de point pour les réglages, ni pour les infobulles, les onglets du coffre (coffre de cartes) et le menu des
  cartes, qui restent dans la base.
