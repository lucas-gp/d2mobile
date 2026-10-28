# Audit 03 : MONSTRES ET BOSS (D2 Mobile vs D2 LoD 1.13 / PD2)

Lecture seule. Mesures : `tools/audit/monsters.ts` (rejoué), scripts jetables (non conservés) (monstats, superuniques, monumod, skills, monlvl du patch 1.13), wiki PD2 (pages Monsters, Corruptions ; les pages Uber_Bosses / Corrupted_Zones / Champions sont vides sur le wiki). Code lu : `src/data/monsters.ts`, `monsters-d2.ts`, `superuniques.ts`, `curves.ts`, `src/sim/spawn.ts`, `ai.ts`, `combat.ts`, `world.ts`, `runs.ts`, `zones/*`.

## 1. Résumé chiffré

| Domaine | D2 | PD2 | Nous | Couverture |
|---|---|---|---|---|
| Espèces de combat (monstats, BaseId hors PNJ/pièges/portes) | 92 (562 variantes à stats propres) | + monstres de cartes | 92 définitions dont ~25 boss/ubers/événements ; 72 des 92 espèces D2 couvertes | 78 % espèces, ~16 % variantes |
| Variantes de résistances (même espèce, immunités différentes) | 562 lignes | idem | 2 monstres sur 92 (`blood_lord` 4, `soul_killer` 1) | ~2 % |
| Résistances N/C/E comparées à monstats (33 monstres appariés) | 594 valeurs | — | 122 écarts | 79 % conformes |
| Niveaux de boss comparés | 36 | Andariel 85, Duriel 88 | 16 écarts | 56 % conformes |
| Super-uniques (SuperUniques.txt) | 66 | — | 47 placés (+ boss de run séparés) ; mods fixes 0/66 appliqués | 71 % placés, 0 % fidèles |
| Modificateurs d'élites (MonUMod aléatoires champion/unique) | 17 (strong, fast, curse, resist, fire, lightning, cold, manahit, teleport, spectralhit, stoneskin, multishot, aura, ghostly, fanatic, possessed, berserk) | + auras Might/Conc./Fanatic/Conviction/Vigor/Holy Shock (niveau = mlvl/7) | 12 déclarés, 11 effectifs (`cursed` inerte) | 65 % |
| Compétences de monstres (skills.txt, 118 utilisées par monstats) | 118 | — | 6 types génériques (melee, missile, nova, charge, breath, summon) + 7 projectiles | ~10 % |
| IA (monai/AI monstats) | 109 | — | 5 (melee, ranged, caster, swarm, charger) + `boss` | ~5 % |
| Ubers | — | 11 (Andariel, Duriel, Izual, Mephisto, Diablo, Baal, Diablo-Clone, Rathma, Mendeln, Lucion, 3 Anciens ubers) | 7 (Lilith, Duriel, Izual, Méphisto, Diablo, Baal, Clone), copies des boss de base ; pas d'Anciens/Rathma/Lucion | 64 % présents, ~0 % kits |
| Auras de monstres | Holy Freeze, Fanatic, Might, Thorns… (Unraveler/Fetish shaman/Duriel) | 8 auras, échelle mlvl/7 | 1 (Holy Freeze Duriel) | ~5 % |
| Zones corrompues | — | oui (non détaillé sur le wiki) | 1 niveau 85 plat + 5 mods + éclats | partiel |

Convention de lecture : ABSENT / INCOMPLET / ÉCART / OK.

## 2. Manquants classés

### P0 (fidélité du cœur de jeu)

| # | Élément | Statut / pourquoi | Effort | Dépendances |
|---|---|---|---|---|
| 1 | Mods d'élites inertes ou absents | `cursed` ne fait rien (déclaré `monsters.ts:974`, aucune branche dans `spawn.ts`/`ai.ts`). ABSENT : Aura Enchanted (le champ `Monster.aura` n'existe que pour les créatures du joueur), Fanatic, Possessed, Berserk, Ghostly (les 4 sont des types de champions D2, MonUMod 36-39). Pas d'effet de mort pour Lightning Enchanted (D2 : mod `lightningdeath` 42). Les sbires d'un unique N'HÉRITENT PAS des mods (`world.ts:195`, `inheritMods` seulement pour les champions) alors que D2 partage les mods de tout le pack. Un des trois piliers du combat D2 | M | missiles, états du joueur (malédiction) |
| 2 | Super-uniques : mods/groupes/TC fixes | SuperUniques.txt donne Mod1-3, MinGrp/MaxGrp, TC par monstre (ex. Bishibosh = mods 8+9, groupe 2 ; Bonebreak 5+8, groupe 5 ; Coldcrow 18, groupe 4). Chez nous : tous traités comme `rank:'unique'` avec `count: 4` et mods tirés au hasard (`act1.ts:253`, `act2.ts:125`, `act3.ts:117`, `act5.ts:79`). Manquent aussi : Coldworm the Burrower, The Smith, The Feature Creep (Hephasto), Baal Subject 3-5, Blood Raven (non SU mais clé PD2) | M | table SU embarquée (gen depuis superuniques) |
| 3 | Kits de boss | `ai:'boss'` n'a que des attaques génériques. Diablo (D2 : DiabLight, DiabCold, DiabFire, DiabWall, DiabRun, PrimeFirewall, DiabPrison, Diablogeddon) n'a ni mur de feu ni prison d'os ; Baal sans Baal Teleport/Tentacle/Corpse Explode/Defense Curse ; Méphisto sans Blizzard ni téléportation ; Duriel sans Smite/stun ; Andariel sans Spray ; Nihlathak sans Corpse Explosion/Impregnate ; Izual sans malédiction. Ubers = `uberOf(boss de base, hp×1,5-1,8, dmg×1,3)` (`monsters.ts:904`) : aucun kit propre | L | 6 nouveaux types d'attaque, missiles |
| 4 | Auras et malédictions de monstres | ABSENT (hors Holy Freeze). PD2 : Might 40-170 %, Concentration, Fanatic (+25-127 % dégâts de groupe, +14-32 % vitesse), Conviction (−27 à −75 % rés.), Vigor, Holy Shock, échelle mlvl/7. D2 : FetishAura sur les Fetish shamans et Unravelers, Defense Curse, Amplify Damage, Decrepify, Weaken, Blood Mana, Lower Resist. Aucune malédiction n'est lancée contre le joueur | L | pipeline d'états du joueur |
| 5 | Échelle PV/dégâts par rang et difficulté | `RANK_MULT` plat (champion ×3, unique ×4) alors que MonUMod donne champion ×3/×2,5/×2 et unique ×4/×3/×2 (N/C/E), minion ×2/×1,75/×1,5 (nous ×1,6). Courbe maison `monsterHp(L)` : cf. §3, écarts 0,4× à 7× | M | recalibrage bot (BACKLOG 2/3) |
| 6 | Résistances et immunités : couverture | 59 monstres sur 92 sans équivalent monstats dans l'outil d'audit ; 122 écarts sur 594 valeurs ; 2 monstres avec variantes d'immunité (D2 : l'immunité dépend de la variante, ex. skmage cold/fire/ltng/pois, 4 Fetish, 5 Fallen). Les immunités structurent le build en Enfer | M | table générée de monstats (déjà `gen-monsters-d2.ts`) |

### P1 (important)

| # | Élément | Statut / pourquoi | Effort |
|---|---|---|---|
| 7 | Espèces D2 absentes (16) : Blood Raven (clé PD2), The Smith, Balrog, Doom Knight, Abyss Knight, Dark Ranger, Dark Spearwoman, Flesh Beast, Maggot Young/Queen, Pain Worm, Water Watcher, Demon Portal (Minion spawner), Flying Scimitar, Night Marauder, Spear Cat | pas de Blood Raven/Cow-level ok ; sprites et IA à créer | L |
| 8 | Sources de clés PD2 | PD2 : Countess (Terror), Blood Raven/Summoner/Bloodwitch (Hate), Nihlathak/Izual (Destruction). Chez nous : Andariel/Duriel/Méphisto (`runs.ts:176-182`). Bloodwitch absente en tant que clé. Blood Raven absente | S |
| 9 | Uber Ancients (Relic of the Ancients, 1-3 Anciens, Standard of Heroes), Rathma/Mendeln (Voidstone, phases, Tainted Shard), Lucion | ABSENT. Fin de jeu PD2 | L chacun |
| 10 | Diablo-Clone : combat | PD2 : phases (4), météores, esprits d'os depuis âmes piégées, immunité > 10 m, Static Field sans effet. Ici : `uberOf(diablo)` errant dans la zone (1/40 en Enfer), mêmes attaques que Diablo. Tire d'Annihilus ok (`runs.ts:199`) | L |
| 11 | Buffs « Prime Evil » PD2 | Immune aux ralentissements, Dim Vision, Terror, Confuse, Attract, Sanctuary (retire rés. phys), +200 % dégâts aux sbires/mercenaires. Nous : seulement `noFreeze`/`holyFreeze`. `grep` : aucun `primeEvil` | M |
| 12 | Régénération de vie des monstres et drain | ABSENT : aucune régénération dans `ai.ts` (D2 : ubers régénèrent ; DamageRegen/Drain par monstre) ; réduction de vol de vie « Drain » (Countess 100, Blood Raven 75, Uber Duriel 100, Meph 0) non modélisée | S |
| 13 | Zones corrompues PD2 | Ici : niveau 85, +30 % vie, +20 % dégâts, +40 % XP, +20 % objets ; PD2 : zones vanilla à niveaux/densités propres (non vérifié, page wiki vide). Pas de rang/mods par zone | M |
| 14 | Compétences de mêlée spéciales | Whirlwind, Leap (Death Mauler/Quill rat), Smite (stun), Imp Teleport, Impregnate (Gorebelly, déjà reconnu dans `docs/internal/AUDIT-MONSTRES.md`), Frenzy, Self-resurrect (Ghoul Lord), Hydra, Bone Spirit, Corpse Explode : absents | L |
| 15 | Ordres de monstres de Levels.txt | `place_group`/`place_unique_pack` des DS1 non lus : groupes tirés au hasard ; uniques nommés (`umon`) = mêmes familles | M |
| 16 | Soul Killer / vagues du Trône | `soul_killer` (Fetish 4) inventé (BACKLOG n°30) encore utilisé comme garde (`baal.ts:~135`) et Colenzo ; D2 : Death Lord/Stygian Fury | S |

### P2 (confort / rare)
- Zones de carte PD2 et leurs monstres spéciaux (Cow King TC, Corpsefire/Hell Bovine ok) ; événements de carte Dark Wanderer, Shadow of Mendeln, Spire of Darkness (non faits).
- Pièges et décors tueurs : Gargoyle Trap, Lightning Spire, Fire Tower, Arcane tower, Catapult, tourelles de désert (monstats `Trap-*`).
- Placement D2 des guerriers nommés (Corpsefire Den, Bishibosh) : seuls les noms présents dans les `presets` DS1 des zones D2 sont placés.
- 14 monstres ajoutés ont une IA simple (un projectile ou mêlée) ; Gorebelly/Ghoul Lord/Defiler sans spécialités.
- Humains « Combatant », Prisonniers barbares, Trapped Soul.

### P3 (cosmétique)
- Sons de monstres (`monsounds` 141 lignes) non reliés ; tailles/teintes des uniques D2 (plaque dorée, nom bleu pour champions) approximatives.
- Aura visuelle des modificateurs (halo Fanatic, Ghostly semi-transparent).

## 3. Écarts de fidélité les plus graves

**3.1 PV par niveau.** Calcul : PV D2 = (minHP+maxHP)/2 × colonne `HP` de MonLvl / 100 (patch 1.13) ; nous = `monsterHp(L)×def.hp×DIFF_MULT`. Ratio nous/D2 (N / Cauchemar / Enfer) :
- Normaux : Déchu 0,75/0,65/0,68 ; Zombie 0,50/0,47/0,49 ; Squelette 0,45/0,44/0,48 ; Seigneur venimeux 0,62/0,45/0,44 ; Bovin 0,67/0,37/0,43.
- Boss de quête : Andariel 0,62/0,34/**1,58** ; Duriel 0,82/0,41/**2,32** ; Méphisto 0,64/0,37/**1,92** ; Diablo 0,86/0,55/**2,87** ; Izual 0,89/1,68/**7,28** ; Baal 1,54/1,08/0,82.
- Résultat : en Cauchemar les boss ont ~40 % de la vie D2, en Enfer 2 à 3× (Izual 7×), ce qui inverse la courbe de difficulté du jeu d'origine. Contre-mesure PD2 : Andariel Enfer +23 % de vie, Countess ×3 (19 770-32 952), Blood Raven ×2 (115 658), Summoner ×8 (49 336-62 792), Nihlathak ×3 (40 035). Chez nous : Nihlathak Enfer 104 377 (×2,6 de PD2), Summoner Enfer 23 470 (**×0,4 de PD2**).
- Ubers (PD2 : 5 695-6 600 Base-HP, niveaux 110/120) : nous = 0,2 à 0,8× du D2 1.13 (Uber Izual Normal ×0,21, Uber Mephisto ×0,35), niveau 90/95/99 au lieu de 110 (D2 `uberandariel` lvl 110) et 120 (Méph/Diablo/Baal PD2).

**3.2 Dégâts.** Dégât moyen par coup d'Enfer (monsterDmg×def.dmg) vs A1 D2 : Duriel 353 vs 165, Andariel 361 vs 170, Diablo 292 vs 214, Baal 325 vs 189 (×1,4-2,1). En Normal/Cauchemar du même ordre mais l'effet est masqué par les PV.

**3.3 Résistances (échantillon de l'outil).** Écarts forts : Nihlathak (nous 50/75/100 froid vs D2 70/70/70 ; niveau N/C/E 44/67/86 vs 65/70/92) ; Anciens (N/C/E : rés. phys 0/25/50 vs D2 70/70/40 ; niveau Normal 45 vs 37, Cauchemar 67 vs 68) ; Conseil Enfer (phys 0 vs 50, feu 0 vs 120) ; Squelette mage (poison 100 vs 50/60/75, froid 50 vs 30) ; Démêleur Enfer (froid 66 vs 100, feu/foudre 66 vs 20) ; Archer cadavérique Enfer (feu/froid 0 vs 33). Andariel Enfer niveau 85 (nous) vs 75 (D2) : PD2 donne 85, donc nous = PD2 (OK pour PD2, écart vs D2).
Les 4 Ubers : Lilith res 90 (feu/foudre/froid/poison) en PD2, ici 75 ; Uber Méph/Diablo/Baal PD2 60/60/60/60, ici héritées du boss de base (non mesuré par monstre).

**3.4 Niveaux de zone.** Tristram 16/39/82 (D2 6/39/76) ; Tombeaux 17/49/82 (D2 80) ; Eldritch 37/60/81 (D2 25/59/81) ; Pindleskin 38/62/82 (D2 32/63/83) ; Nihlathak 44/67/86 (D2 36/64/84) ; Anciens 45/67/87 (D2 37/68/87). Conformes : Comtesse, Andariel, Vaches, Méphisto, Chaos, Baal.

**3.5 Mods.** Champion/unique : unique a 1/2/3 mods N/C/E (ok D2), mais RANK_MULT plat et `lvl +2/+3` ; `extraStrong` ×1,5 dégâts (à vérifier vs MonUMod « strong » : +dmg%), `magicResistant` +40 aux trois (D2 : valeur propre par difficulté), `stoneSkin` +50 phys plafonné 90 (D2 : ×2 défense, rés. phys), `spectralHit` +60 % d'un élément aléatoire (ok forme D2). Pas de plafond de rés. des élites alors que D2 plafonne l'immunité à 100.

**3.6 Pandémonium.** Clés sur Andariel/Duriel/Méphisto 30 %. Uber Tristram : trois ubers sans kit propre ; PD2 : jeton, 3 portails unique-usage, pas de régénération, Uber Mephisto Conviction niv. 20, Baal Lower Resist −75 %, −25 % défense. Rien de tout cela.

## 4. Déjà au niveau

- Peuplement : 14 espèces D2 ajoutées, zones de Levels.txt (`MonDen`, `MonUMin/Max`), tailles de groupes (`docs/internal/AUDIT-MONSTRES.md`), 5 vagues de Baal PD2 (Colenzo/Achmel/Bartuc/Ventar/Lister), Chaos avec 3 sceaux et gardiens, zones des Tombeaux (7 familles), conseil du Travincal (`SU_A3`).
- Mécanique : toucher/blocage monstre↔joueur (`hitChance`, `blockChance`), résurrection du chaman, explosion des Déchus fanatiques, Fire/Cold Enchanted à la mort, Mana Burn, Multishot, Spectral Hit, Teleport, Holy Freeze, Charge, souffle (breath), niveaux de boss PD2 (`bossLevel`), TC de farm (Countess/Andariel/Mephisto), Roi des Vaches, Diablo Clone 1/40 avec Annihilus, zones corrompues avec éclats, 7 ubers.
- Résistances d'Enfer des Déchus, Zombies, Squelettes déjà lues de MonStats PD2 (`gen-monres.py`).

## 5. Recommandations d'ordre

1. P0-2 + P0-1 (SU mods fixes, mods inertes, héritage des sbires) : peu coûteux, gros effet visible.
2. P0-5 + 3.1 : recalibrer RANK_MULT et la courbe de PV sur D2/PD2 (boss d'Enfer ×0,4 à ×0,5 sur Izual/Diablo, Cauchemar boss ×2,5) avec re-mesure bot.
3. P0-4/P0-3 : un type d'attaque « aura/malédiction » et 6 compétences de boss ; démarrer par Baal (Lower Resist), Diablo (mur de feu, prison), Méphisto (Blizzard).
4. P1 : Blood Raven/Bloodwitch/Smith, Uber Ancients, Rathma.

