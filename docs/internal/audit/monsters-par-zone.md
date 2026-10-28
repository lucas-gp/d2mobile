# Monstres par zone : audit de cohérence

Demande du joueur : « Il y a des incohérences de monstres, notamment à Méphisto. Vérifier toutes les zones. »
Sources : `Levels.txt` / `monstats.txt` (patch 1.13, MPQ du joueur, lus par `tools/audit/`), wiki PD2 (page « Zones » : niveaux, super-uniques par zone).
Outil : `npx tsx tools/audit/zone-monsters.ts` (écrit le tableau ci-dessous) ; garde-fou : `tests/unit/zone-monsters.test.ts`.

## Résumé des incohérences trouvées

| # | zone(s) | constat | correction | source |
|---|---|---|---|---|
| 1 | **Durance de la haine 3 (Méphisto)**, run Méphisto et zone de campagne `a3_durance3` | tous les monstres (98 groupes ordinaires, 17 élites, 4 gardes) étaient des `blood_lord` : c'est le `bloodlord` de l'**Acte V** (Seigneur de la mort, guerrier cornu rouge, niveau 33-43 dans monstats), alors que Levels.txt met `vampire4` (le « Blood Lord » **vampire de l'Acte III**, famille du Seigneur goule). Un monstre d'un autre acte, de la mauvaise apparence | plan `mephisto` : `ghoul_lord` (planche vampire, `vampire1` de la même famille) ; escorte idem | Levels.txt id 102, monstats vampire4 / bloodlord1-5 |
| 2 | Chaos (repli sans carte D2) | gardes `blood_lord` (Acte V) et `soul_killer` (Acte III) dans le Sanctuaire du Chaos (Levels.txt : fingermage, doomknight, megademon) | `oblivion_knight`, `venom_lord`, `storm_caster` | Levels.txt id 108 |
| 3 | Champ de pierres (A1) | Rakanishu **×10** : le DS1 répète dix emplacements du super-unique, la zone en créait dix | un seul exemplaire par super-unique et par zone | SuperUniques.txt (un exemplaire) |
| 4 | Acte II désert (Rocky Waste, Dry Hills, Far Oasis, Canyon des Mages, Vallée des Serpents) | Beetleburst dans **cinq** zones (emplacements répétés dans les DS1) | seulement la Far Oasis | wiki PD2 « Zones » |
| 5 | Acte V : Cavernes glacées 1 / Salle des échos | Snapchip Shatter dans deux zones | seulement l'Icy Cellar (Glacial Caves 2) | wiki PD2 « Zones » |
| 6 | Tombeaux (run) et tombeaux A2 | le Gardien du tombeau (unique de trigger 9 et chef de run) était aussi traité comme escorte : **deux paquets** de 5 momies du même nom | `escorts` exclut le chef de run | lecture du code, relevé des spawns |
| 7 | zones petites en Cauchemar/Enfer (Fleuve de flammes run et A4, Chaussée de Kurast, Égouts A3 2, Repaire des vers 3, Sanctuaire des arcanes…) | les uniques (MonUMin/Max) prenaient la place des groupes : **aucun monstre ordinaire** (0 dans `a4_river` C/E, `a3_causeway` C/E, `a3_sewer2` E, `a2_maggot3` E, `a2_arcane` E ; 6 dans `river` E) | uniques plafonnés à la moitié des groupes (les uniques s'ajoutent aux ordinaires dans D2 ; ici ils partagent un total fixe) | Levels.txt (MonDen, MonUMin/Max) |
| 8 | Hautes-Terres (run Eldritch/Shenk), Normal | Mutileurs, Surveillants et Sbires, qui n'arrivent qu'en Cauchemar (nmon) | Normal = `imp` + `siege_beast` (mon) ; Cauchemar/Enfer + `skeleton_archer`, `slinger` | Levels.txt id 111 |
| 9 | Halls de Vaught (run Nihlathak), Cauchemar/Enfer | `fallen_shaman` (absent de Levels.txt) à la place de arach, fetish_shaman, baboon, claw_viper | pools nmon de Levels.txt | Levels.txt id 124 |
| 10 | Trône de la destruction (run Baal), Cauchemar/Enfer | manquaient sand_raider, unraveler, claw_viper | ajoutés | Levels.txt id 131 |
| 11 | Pandémonium 2 (Sables oubliés, `uber_duriel`) | manquait `swarm` (essaims) | `locust` ajouté | Levels.txt id 134 |
| 12 | Pindleskin / Nihlathak / Anciens / Eldritch, Normal | niveaux de zone 38 / 44 / 45 / 37 pour 32 / 36 / 37 / 25 dans PD2 (Cauchemar et Enfer déjà alignés) | alignés sur le wiki PD2 (Eldritch : Cauchemar 59 au lieu de 60) | wiki PD2 « Zones » |

Contrôlé et conforme : toutes les zones d'Acte I-V de campagne (`levels-a1/a2/a3/a5.ts`, générées d'après Levels.txt) ; Comtesse, Andariel, Tombeaux, Vaches, Chaos, Pindleskin ; niveaux de zone des runs et de la campagne (`mods/pd2/tools/audit/pd2-zones.json`) ; Méphisto lui-même (vie, résistances, six sorts de monstats, trésor, niveau 26/59/87 : voir `docs/internal/audit/boss-kits.md`) ; planches : chaque espèce a sa planche D2 ou un alias voulu (aucun sprite qui ne corresponde pas à son nom).

### Méphisto en détail
- **Pool** : Durance 3 = `vampire4` ×2 (Levels.txt), uniques `vampire4` / `bonefetish5` (Undead Stygian Doll). Avant : `blood_lord` = bloodlord (Acte V). Après : `ghoul_lord` (famille vampire).
- **Boss** : une seule instance (`mephisto`, chef de run), niveau 26/59/87, sorts Éclair en chaîne (PrimeLightning), Éclair/Trait de glace (PrimeBolt), Nova de poison, MephistoMissile (éventail d'éclairs), Nova de givre, Blizzard : conformes à monstats.
- **Escorte** : 4 gardes autour de lui (choix de jeu, absents de D2 où Méphisto est seul dans sa salle) : désormais des vampires.
- **Non fait / supposé** : (a) le Seigneur de sang d'origine (`vampire4`, nom propre) n'existe pas comme espèce : la zone affiche « Seigneur goule » (même planche, mêmes stats de famille) ; il faudrait une espèce dédiée (+ teinte rouge) ; (b) les uniques de la Durance 3 pourraient être des Poupées stygiennes mortes-vivantes (`umon` bonefetish5) : non ajouté ; (c) le wiki PD2 liste « 3 Council Members » à la Durance 3 en plus de Travincal : probablement une erreur du tableau (non implémenté).

## Super-uniques

Placement d'après les emplacements des DS1 (`monpreset`) ; un exemplaire par zone, zones imposées par `src/data/superunique-zones.ts`.
Zones où le wiki PD2 en met mais que nous n'avons pas (pas d'emplacement dans nos cartes) : Bishibosh (Cold Plains), Coldcrow (Cave 2), Pitspawn Fouldog (Jail 2), Creeping Feature, Coldworm, Fangskin, Fire Eye, Sszark, Thresh Socket, Bonesaw Breaker, Sharptooth, Eyeback, Eldritch (Highlands) : non traité (valeur supposée : à placer à la main).
Le tableau du wiki met Witch Doctor Endugu en « Swampy Pit 3 » alors que le DS1 le place en Flayer Dungeon 3 (id 91) : conservé (DS1, supposé exact).

## Tableau zone par zone (état après corrections)

Les chiffres collés aux noms D2 (`vampire4`) sont les variantes de monstats ; « écart » compare les familles, avec les rapprochements voulus du jeu
(megademon ≡ Seigneur venimeux, doomknight / dkmag ≡ Chevalier de l'oubli, cr_archer / cr_lancer ≡ Traqueur sombre, `alts` des Traqueurs).
Voulus et conservés : Tristram Normal (Déchus et Zombies à la place des Hommes-bouc, zone jouable dès le niveau 1), Pindleskin (pas de monstres dans Levels.txt, morts rôdeurs du monpreset), zones Pandémonium PD2 (Anciens, Rathma, Lucion, Clone : laissées telles quelles).
`river` : zone propre au jeu (supposé : mêmes familles que le Fleuve de flammes de l'Acte IV).

| zone | difficulté | espèces actuelles | espèces attendues (Levels.txt) | écart | correction |
|---|---|---|---|---|---|
| tristram (Tristram) | N | fallen×2, fallen_shaman, skeleton, skeleton_archer, zombie | skeleton2, goatman2, fallenshaman2, sk_archer1 | manque goatman ; en plus fallen, zombie | - |
| tristram (Tristram) | C/E | skeleton, goatman, fallen_shaman, skeleton_archer | skeleton2, goatman2, fallenshaman2, sk_archer1 | aucun | - |
| countess (Tower Cellar Level 5) | N/C/E | fallen, wraith, goatman, dark_stalker | fallen3, wraith1, goatman3, cr_archer3 | aucun | - |
| andariel (Catacombs Level 4) | N/C/E | ghoul, afflicted | zombie3, bighead1 | aucun | - |
| tombs (Tal Rasha's Tomb) | N/C/E | wraith, scarab, mummy, unraveler×2, ghoul_lord, blunderbore | wraith4, scarab4, mummy4, unraveler3×2, vampire1, blunderbore2 | aucun | - |
| cows (Moo Moo Farm) | N/C/E | hell_bovine | hellbovine×3 | aucun | - |
| mephisto (Durance of Hate Level 3) | N/C/E | ghoul_lord | vampire4×2 | aucun | corrigé : blood_lord (bloodlord, Acte V) → ghoul_lord (vampire, Acte III) ; escorte idem |
| chaos (Chaos Sanctum) | N/C/E | storm_caster, oblivion_knight, venom_lord | fingermage3, doomknight3, megademon3 | aucun | corrigé (repli sans carte) : blood_lord et soul_killer d'Acte V/III → oblivion_knight, venom_lord, storm_caster |
| pindleskin (Nihlathaks Temple) | N/C/E | prowling_dead |  | en plus reanimatedhorde | - |
| eldritch (Rigid Highlands) | N | imp, siege_beast | imp1, siegebeast2 | aucun | corrigé : Normal = imp + siege_beast (Levels.txt mon) ; Cauchemar/Enfer + skeleton_archer, slinger |
| eldritch (Rigid Highlands) | C | imp×2, siege_beast, minion×2, death_mauler×2, overseer, dark_stalker, blunderbore, skeleton_archer, slinger | imp3, siegebeast1, minion2, deathmauler2, sk_archer6, cr_archer6, cr_lancer6, slinger8, blunderbore5, overseer2 | aucun | corrigé : Normal = imp + siege_beast (Levels.txt mon) ; Cauchemar/Enfer + skeleton_archer, slinger |
| eldritch (Rigid Highlands) | E | imp×2, siege_beast, minion×2, death_mauler×2, overseer×2, dark_stalker, blunderbore, skeleton_archer, slinger | imp3, siegebeast1, minion2, deathmauler2, sk_archer6, cr_archer6, cr_lancer6, slinger8, blunderbore5, overseer2 | aucun | corrigé : Normal = imp + siege_beast (Levels.txt mon) ; Cauchemar/Enfer + skeleton_archer, slinger |
| nihlathak (Halls of Vaught) | N | minion, succubus, putrid_defiler | minion6, succubus4, putriddefiler2 | aucun | corrigé : Cauchemar/Enfer = nmon (arach, fetish_shaman, baboon, claw_viper ; fallen_shaman retiré) |
| nihlathak (Halls of Vaught) | C/E | minion, succubus, putrid_defiler, prowling_dead, wraith, arach, skeleton_archer, fetish_shaman, baboon, claw_viper | minion9, succubus4, putriddefiler2, reanimatedhorde3, wraith6, arach6, sk_archer9, fetishshaman6, baboon6, clawviper9 | aucun | corrigé : Cauchemar/Enfer = nmon (arach, fetish_shaman, baboon, claw_viper ; fallen_shaman retiré) |
| river | N/C/E | blunderbore, storm_caster, oblivion_knight, venom_lord | « Act 4 - Lava 1 » : pas de ligne Levels.txt | zone propre au jeu (supposé) | corrigé : uniques plafonnés à la moitié des groupes (zone vidée de ses monstres ordinaires en Enfer) |
| a4_steppes (Outer Steppes) | N/C/E | sand_leaper, vile_mother, storm_caster, regurgitator, oblivion_knight, venom_lord | sandleaper5, vilemother1, fingermage1, regurgitator1, doomknight1, megademon3 | aucun | - |
| a4_plains (Plains of Despair) | N/C/E | willowisp, vile_mother, storm_caster, regurgitator, oblivion_knight, venom_lord | willowisp3, vilemother1, fingermage1, regurgitator1, doomknight1, megademon3 | aucun | - |
| a4_city (City of the Damned) | N/C/E | afflicted, bat_demon, vile_mother, storm_caster, regurgitator, oblivion_knight, venom_lord | bighead5, batdemon5, vilemother2, fingermage2, regurgitator2, doomknight2, megademon2 | aucun | - |
| a4_river (River of Flame) | N/C/E | sand_maggot, blunderbore, vile_mother, storm_caster, regurgitator, oblivion_knight, venom_lord | sandmaggot5, blunderbore4, vilemother3, fingermage2, regurgitator3, doomknight2, megademon2 | aucun | corrigé : idem |
| baal (Throne of Destruction) | N | blood_lord, succubus_witch | bloodlord5, succubuswitch3 | aucun | corrigé : Cauchemar/Enfer + sand_raider, unraveler, claw_viper (nmon) |
| baal (Throne of Destruction) | C/E | blood_lord×2, succubus_witch×2, soul_killer, willowisp, ghoul_lord, venom_lord, oblivion_knight, sand_raider, unraveler, claw_viper | bloodlord5, succubuswitch5, bonefetish7, sandraider10, willowisp7, vampire8, megademon5, unraveler9, dkmag2, clawviper10 | manque bonefetish ; en plus fetish | corrigé : Cauchemar/Enfer + sand_raider, unraveler, claw_viper (nmon) |
| uber_lilith (Pandemonium Run 1) | N/C/E | succubus, succubus_witch, dark_stalker×3 | succubus8, succubuswitch9, corruptrogue6, cr_archer8, cr_lancer8 | aucun | - |
| uber_duriel (Pandemonium Run 2) | N/C/E | locust, sand_maggot, arach, scarab | swarm5, sandmaggot7, arach7, scarab8 | aucun | corrigé : + locust (swarm) |
| uber_dclone (Pandemonium Run 3) | N/C/E | blood_lord, oblivion_knight, minion_destruction | overseer6, dkmag3, megademon6, imp8 | manque overseer, megademon, imp ; en plus bloodlord, baalminion | - |
| uber_ancients (Pandemonium Run 3) | N/C/E | oblivion_knight, minion_destruction, venom_lord | overseer6, dkmag3, megademon6, imp8 | manque overseer, imp ; en plus baalminion | - |
| uber_rathma (Pandemonium Run 3) | N/C/E | ghoul, prowling_dead, dark_stalker | overseer6, dkmag3, megademon6, imp8 | manque overseer, doomknight, megademon, imp ; en plus zombie, reanimatedhorde, corruptrogue | - |
| uber_lucion (Pandemonium Run 3) | N/C/E | succubus, succubus_witch, blood_lord | overseer6, dkmag3, megademon6, imp8 | manque overseer, doomknight, megademon, imp ; en plus succubus, succubuswitch, bloodlord | - |
| uber_izual (Pandemonium Run 3) | N/C/E | overseer, oblivion_knight, venom_lord, imp | overseer6, dkmag3, megademon6, imp8 | aucun | - |
| a1_bloodmoor (Blood Moor) | N/C/E | zombie, fallen, quill_rat | zombie1, fallen1, quillrat1 | aucun | - |
| a1_coldplains (Cold Plains) | N/C/E | brute, dark_stalker×2, fallen_shaman | brute1, corruptrogue1, fallenshaman1, cr_lancer1 | aucun | - |
| a1_stonyfield (Stony Field) | N/C/E | skeleton, zombie, foul_crow, goatman, dark_stalker | skeleton1, zombie2, crownest1, goatman1, cr_archer1 | aucun | - |
| a1_darkwood (Dark Wood) | N/C/E | fallen, dark_stalker×2, quill_rat, skeleton_archer | fallen2, corruptrogue2, quillrat2, cr_lancer2, sk_archer1 | aucun | - |
| a1_blackmarsh (Black Marsh) | N/C/E | foul_crow, skeleton, brute, goatman, fallen_shaman, dark_stalker | crownest2, skeleton2, brute2, goatman2, fallenshaman2, cr_archer2 | aucun | - |
| a1_tamoe (Tamoe Highland) | N/C/E | dark_stalker×2, quill_rat, skeleton_archer, skeleton_mage | corruptrogue3, quillrat3, cr_lancer3, sk_archer2, skmage_fire1 | aucun | - |
| a1_den (Den of Evil) | N/C/E | zombie, brute, fallen_shaman | zombie1, brute1, fallenshaman1 | aucun | - |
| a1_cave1 (Cave Level 1) | N/C/E | skeleton, zombie, dark_stalker | skeleton1, zombie2, cr_archer1 | aucun | - |
| a1_underpass1 (Underground Passage Level 1) | N/C/E | afflicted, fallen, dark_stalker, skeleton_archer | bighead3, fallen2, corruptrogue2, sk_archer1 | aucun | - |
| a1_hole1 (Hole Level 1) | N/C/E | afflicted, fallen, brute, dark_stalker | bighead3, fallen2, brute2, cr_archer2 | aucun | - |
| a1_pit1 (Pit Level 1) | N/C/E | skeleton, fallen, dark_stalker×2 | skeleton3, fallen3, corruptrogue3, cr_archer3 | aucun | - |
| a1_cave2 (Cave Level 2) | N/C/E | skeleton, zombie, dark_stalker | skeleton1, zombie2, cr_archer1 | aucun | - |
| a1_underpass2 (Underground Passage Level 2) | N/C/E | afflicted, fallen, dark_stalker, skeleton_archer | bighead3, fallen2, corruptrogue2, sk_archer1 | aucun | - |
| a1_hole2 (Hole Level 2) | N/C/E | afflicted, fallen, brute, dark_stalker | bighead3, fallen2, brute2, cr_archer2 | aucun | - |
| a1_pit2 (Pit Level 2) | N/C/E | skeleton, fallen, dark_stalker×2 | skeleton3, fallen3, corruptrogue3, cr_archer3 | aucun | - |
| a1_burial (Burial Grounds) | N/C/E | skeleton, zombie | skeleton1, zombie2 | aucun | - |
| a1_crypt (Crypt) | N/C/E | skeleton, zombie | skeleton1, zombie2 | aucun | - |
| a1_mausoleum (Mausoleum) | N/C/E | skeleton, zombie | skeleton1, zombie2 | aucun | - |
| a1_tower (Forgotten Tower) | N/C/E |  |  | aucun | - |
| a1_cellar1 (Tower Cellar Level 1) | N/C/E | fallen, wraith, goatman, dark_stalker | fallen3, wraith1, goatman3, cr_archer3 | aucun | - |
| a1_cellar2 (Tower Cellar Level 2) | N/C/E | fallen, wraith, goatman, dark_stalker | fallen3, wraith1, goatman3, cr_archer3 | aucun | - |
| a1_cellar3 (Tower Cellar Level 3) | N/C/E | fallen, wraith, goatman, dark_stalker | fallen3, wraith1, goatman3, cr_archer3 | aucun | - |
| a1_cellar4 (Tower Cellar Level 4) | N/C/E | fallen, wraith, goatman, dark_stalker | fallen3, wraith1, goatman3, cr_archer3 | aucun | - |
| a1_monastery (Monastery Gate) | N/C/E | afflicted, dark_stalker, skeleton_archer, skeleton_mage | bighead4, corruptrogue3, sk_archer2, skmage_ltng1 | aucun | - |
| a1_cloister (Outer Cloister) | N/C/E | brute, dark_stalker, fallen_shaman, quill_rat | brute3, corruptrogue4, fallenshaman3, quillrat4 | aucun | - |
| a1_barracks (Barracks) | N/C/E | dark_stalker, goatman, fallen_shaman, skeleton_archer, skeleton_mage | corruptrogue4, goatman5, fallenshaman3, sk_archer3, skmage_fire2 | aucun | - |
| a1_jail1 (Jail Level 1) | N/C/E | fallen, wraith, goatman, skeleton_archer, skeleton_mage | fallen4, wraith2, goatman5, sk_archer3, skmage_fire2 | aucun | - |
| a1_jail2 (Jail Level 2) | N/C/E | fallen, wraith, goatman, skeleton_archer, skeleton_mage | fallen4, wraith2, goatman5, sk_archer3, skmage_fire2 | aucun | - |
| a1_jail3 (Jail Level 3) | N/C/E | fallen, wraith, goatman, skeleton_archer, skeleton_mage | fallen4, wraith2, goatman5, sk_archer3, skmage_ltng2 | aucun | - |
| a1_inner (Inner Cloister) | N/C/E | fallen, dark_stalker, skeleton_mage | fallen4, cr_archer4, skmage_ltng2 | aucun | - |
| a1_cathedral (Cathedral) | N/C/E | afflicted, wraith, fallen_shaman | bighead2, wraith2, fallenshaman4 | aucun | - |
| a1_cata1 (Catacombs Level 1) | N/C/E | afflicted, fallen_shaman, soul_killer | bighead2, fallenshaman4, fetish1 | aucun | - |
| a1_cata2 (Catacombs Level 2) | N/C/E | afflicted, fallen_shaman, arach | bighead2, fallenshaman4, arach1 | aucun | - |
| a1_cata3 (Catacombs Level 3) | N/C/E | zombie, afflicted, ghoul_lord | zombie3, bighead1, vampire5 | aucun | - |
| a2_rocky (Rocky Waste) | N/C/E | sand_leaper, panther_woman, scarab, vulture, slinger | sandleaper1, pantherwoman1, scarab1, vulture1, slinger1 | aucun | - |
| a2_dryhills (Dry Hills) | N/C/E | sand_leaper, panther_woman, vulture, slinger | sandleaper2, pantherwoman2, vulture2, slinger5 | aucun | - |
| a2_oasis (Far Oasis) | N/C/E | foul_crow, sand_maggot, locust, scarab, vulture | crownest3, sandmaggot1, swarm1, scarab2, vulture2 | aucun | - |
| a2_lostcity (Lost City) | N/C/E | zombie, sand_raider, sand_leaper, panther_woman, slinger | zombie5, sandraider2, sandleaper3, pantherwoman3, slinger6 | aucun | - |
| a2_valley (Valley of Snakes) | N/C/E | claw_viper×4, mummy, unraveler | clawviper2×2, clawviper3×2, mummy3, unraveler2 | aucun | - |
| a2_canyon (Canyon of the Magi) | N/C/E | brute, sand_maggot, panther_woman, scarab, slinger | brute4, sandmaggot3, pantherwoman4, scarab4, slinger4 | aucun | - |
| a2_sewer1 (Sewers Level 1) | N/C/E | burning_dead, sand_raider, mummy, skeleton_archer | skeleton4, sandraider1, mummy1, sk_archer4 | aucun | - |
| a2_sewer2 (Sewers Level 2) | N/C/E | burning_dead, sand_raider, mummy, skeleton_archer | skeleton4, sandraider1, mummy1, sk_archer4 | aucun | - |
| a2_sewer3 (Sewers Level 3) | N/C/E | burning_dead, panther_woman, mummy, skeleton_mage | skeleton4, pantherwoman1, mummy1, skmage_fire3 | aucun | - |
| a2_harem2 (Harem Level 2) | N/C/E | sand_raider, baboon, skeleton_archer, blunderbore, skeleton_mage | sandraider3, baboon1, sk_archer5, blunderbore1, skmage_cold4 | aucun | - |
| a2_cellar1 (Palace Cellar Level 1 ) | N/C/E | sand_raider, baboon, skeleton_archer, blunderbore, skeleton_mage | sandraider3, baboon1, sk_archer5, blunderbore1, skmage_fire4 | aucun | - |
| a2_cellar2 (Palace Cellar Level 2) | N/C/E | sand_raider, baboon, skeleton_archer, blunderbore, skeleton_mage | sandraider3, baboon1, sk_archer5, blunderbore1, skmage_pois4 | aucun | - |
| a2_cellar3 (Palace Cellar Level 3) | N/C/E | sand_raider, baboon, skeleton_archer, blunderbore, skeleton_mage | sandraider3, baboon1, sk_archer5, blunderbore1, skmage_ltng4 | aucun | - |
| a2_stony1 (Stony Tomb Level 1) | N/C/E | skeleton, scarab, skeleton_mage | skeleton5, scarab1, skmage_ltng3 | aucun | - |
| a2_halls1 (Halls of the Dead Level 1) | N/C/E | mummy, unraveler×2, bat_demon, slinger | mummy2, unraveler1×2, batdemon1, slinger2 | aucun | - |
| a2_halls2 (Halls of the Dead Level 2) | N/C/E | mummy, unraveler×2, bat_demon, slinger | mummy2, unraveler1×2, batdemon1, slinger2 | aucun | - |
| a2_viper1 (Claw Viper Temple Level 1) | N/C/E | claw_viper×4, mummy, unraveler | clawviper2×2, clawviper3×2, mummy3, unraveler2 | aucun | - |
| a2_stony2 (Stony Tomb Level 2) | N/C/E | skeleton, scarab, skeleton_mage | skeleton5, scarab1, skmage_pois3 | aucun | - |
| a2_halls3 (Halls of the Dead Level 3) | N/C/E | mummy, unraveler×2, bat_demon, slinger | mummy2, unraveler1×2, batdemon1, slinger2 | aucun | - |
| a2_viper2 (Claw Viper Temple Level 2) | N/C/E | claw_viper×4, mummy, unraveler | clawviper2×2, clawviper3×2, mummy3, unraveler2 | aucun | - |
| a2_maggot1 (Maggot Lair Level 1) | N/C/E | sand_maggot×2, locust, scarab×2 | sandmaggot1, sandmaggot2, swarm2, scarab2, scarab3 | aucun | - |
| a2_maggot2 (Maggot Lair Level 2) | N/C/E | sand_maggot×2, locust, scarab×2 | sandmaggot1, sandmaggot2, swarm2, scarab2, scarab3 | aucun | - |
| a2_maggot3 (Maggot Lair Level 3) | N/C/E | sand_maggot×2, locust, scarab×2 | sandmaggot1, sandmaggot2, swarm2, scarab2, scarab3 | aucun | - |
| a2_tunnels (Ancient Tunnels) | N/C/E | zombie, sand_raider, mummy, skeleton_mage | zombie5, sandraider3, mummy3, skmage_ltng4 | aucun | - |
| a2_arcane (Arcane Sanctuary) | N/C/E | wraith, goatman, ghoul_lord | wraith3, goatman4, vampire1 | aucun | - |
| a3_spider (Spider Forest) | N/C/E | baboon, mosquito, thornhulk, fetish, fetish_blow, foul_crow | baboon3, mosquito1, thornhulk1, fetish2, fetishblow2, foulcrow4 | aucun | - |
| a3_marsh (Great Marsh) | N/C/E | frog_demon×2, thornhulk, zombie, fetish_shaman, willowisp | frogdemon1, frogdemon2, thornhulk2, zombie4, fetishshaman2, willowisp1 | aucun | - |
| a3_jungle (Flayer Jungle) | N/C/E | fetish×2, fetish_shaman×2, vulture, frog_demon, fetish_blow | fetish3, fetishshaman3, fetish4, fetishshaman4, vulture4, frogdemon3, fetishblow3 | aucun | - |
| a3_lower (Lower Kurast) | N/C/E | baboon, sand_leaper, vulture, zealot | baboon4, sandleaper4, vulture3, zealot1 | aucun | - |
| a3_bazaar (Kurast Bazaar) | N/C/E | thornhulk, locust, zealot, cantor | thornhulk3, swarm4, zealot2, cantor1 | aucun | - |
| a3_upper (Upper Kurast) | N/C/E | vulture, zealot, cantor, thornhulk | vulture4, zealot3, cantor2, thornhulk3 | aucun | - |
| a3_causeway (Kurast Causeway) | N/C/E | sand_raider, baboon, cantor | sandraider4, baboon5, cantor3 | aucun | corrigé : idem |
| a3_travincal (Travincal) | N/C/E | cantor×2, ghoul_lord | cantor3×2, vampire2 | aucun | - |
| a3_cave1 (Spider Cave) | N/C/E | arach×3, bat_demon, sand_maggot | arach3×2, arach4, batdemon2, sandmaggot4 | aucun | - |
| a3_cave2 (Spider Cavern) | N/C/E | arach×3, bat_demon, sand_maggot | arach3×2, arach4, batdemon2, sandmaggot4 | aucun | - |
| a3_pit1 (Swampy Pit Level 1) | N/C/E | mummy, bone_fetish×2, bat_demon, willowisp | mummy4, bonefetish4, batdemon2, willowisp1, bonefetish5 | aucun | - |
| a3_pit2 (Swampy Pit Level 2) | N/C/E | bone_fetish×2, zombie, bat_demon, willowisp | bonefetish4, zombie4, batdemon2, willowisp1, bonefetish5 | aucun | - |
| a3_flayer1 (Flayer Dungeon Level 1) | N/C/E | fetish×2, fetish_shaman×2, bat_demon, wraith, fetish_blow, bone_fetish | fetish3, fetishshaman3, fetish4, fetishshaman4, batdemon3, wraith5, fetishblow3, bonefetish3 | aucun | - |
| a3_flayer2 (Flayer Dungeon Level 2) | N/C/E | fetish×2, fetish_shaman×2, bat_demon, wraith, fetish_blow, bone_fetish | fetish3, fetishshaman3, fetish4, fetishshaman4, batdemon3, wraith5, fetishblow3, bonefetish3 | aucun | - |
| a3_pit3 (Swampy Pit Level 3) | N/C/E | bone_fetish×2, bat_demon, willowisp | bonefetish4, bonefetish5, batdemon2, willowisp1 | aucun | - |
| a3_flayer3 (Flayer Dungeon Level 3) | N/C/E | fetish×2, fetish_shaman×2, bat_demon, wraith, fetish_blow, bone_fetish | fetish3, fetishshaman3, fetish4, fetishshaman4, batdemon3, wraith5, fetishblow3, bonefetish3 | aucun | - |
| a3_sewer1 (Sewers Level 1) | N/C/E | mummy, mosquito, bat_demon, unraveler, bone_fetish | mummy4, mosquito2, batdemon3, unraveler4, bonefetish4 | aucun | - |
| a3_sewer2 (Sewers Level 2) | N/C/E | mummy, unraveler, mosquito, frog_demon, bone_fetish | mummy4, unraveler4, mosquito4, frogdemon3, bonefetish4 | aucun | corrigé : idem |
| a3_temple1 (Ruined Temple) | N/C/E | brute, dark_stalker, arach, ghoul_lord | brute5, corruptrogue5, arach5, vampire2 | aucun | - |
| a3_temple2 (Disused Fane) | N/C/E | brute, dark_stalker, arach, ghoul_lord | brute5, corruptrogue5, arach5, vampire2 | aucun | - |
| a3_temple3 (Forgotten Reliquary) | N/C/E | brute, dark_stalker, arach, ghoul_lord | brute5, corruptrogue5, arach5, vampire2 | aucun | - |
| a3_temple4 (Forgotten Temple) | N/C/E | claw_viper, scarab, bat_demon, dark_stalker | clawviper5, scarab5, batdemon4, cr_archer5 | aucun | - |
| a3_temple5 (Ruined Fane) | N/C/E | claw_viper, scarab, bat_demon, dark_stalker | clawviper5, scarab5, batdemon4, cr_archer5 | aucun | - |
| a3_temple6 (Disused Reliquary) | N/C/E | claw_viper, scarab, bat_demon, dark_stalker | clawviper5, scarab5, batdemon4, cr_archer5 | aucun | - |
| a3_durance1 (Durance of Hate Level 1) | N/C/E | mummy, ghoul_lord, blunderbore, bone_fetish | mummy5, vampire3, blunderbore3, bonefetish5 | aucun | - |
| a3_durance2 (Durance of Hate Level 2) | N/C/E | mummy, ghoul_lord, blunderbore, bone_fetish | mummy5, vampire3, blunderbore3, bonefetish5 | aucun | - |
| a5_foothills (Bloody Foothills) | N | minion, death_mauler, overseer, imp, skeleton_archer, quill_rat, afflicted | minion1, deathmauler1, overseer1, imp1, sk_archer6, quillrat6, bighead6 | aucun | - |
| a5_foothills (Bloody Foothills) | C/E | minion, death_mauler, overseer, imp, skeleton_archer, quill_rat, foul_crow, vulture, thornhulk, slinger | minion1, deathmauler1, overseer1, imp1, sk_archer6, quillrat6, foulcrow5, vulture5, thornhulk5, slinger7 | aucun | - |
| a5_highlands (Rigid Highlands) | N | imp, siege_beast | imp1, siegebeast2 | aucun | - |
| a5_highlands (Rigid Highlands) | C/E | imp, siege_beast, minion, death_mauler, skeleton_archer, dark_stalker×2, slinger, blunderbore, overseer | imp3, siegebeast1, minion2, deathmauler2, sk_archer6, cr_archer6, cr_lancer6, slinger8, blunderbore5, overseer2 | aucun | - |
| a5_plateau (Arreat Plateau) | N | overseer, minion | overseer2, minion2 | aucun | - |
| a5_plateau (Arreat Plateau) | C/E | death_mauler, minion, siege_beast, overseer, imp, slinger, skeleton_mage×2, goatman, fallen_shaman | deathmauler3, minion4, siegebeast3, overseer5, imp3, slinger9, skmage_ltng5, skmage_fire5, goatman7, fallenshaman6 | aucun | - |
| a5_crystal1 (Crystalized Cavern Level 1) | N | frozen_horror, succubus, blood_lord | frozenhorror1, succubus3, bloodlord1 | aucun | - |
| a5_crystal1 (Crystalized Cavern Level 1) | C/E | snowy_yeti, frozen_horror, succubus, blood_lord, sand_raider, sand_leaper, skeleton_mage, dark_stalker, wraith, claw_viper | snowyeti1, frozenhorror1, succubus1, bloodlord3, sandraider7, sandleaper6, skmage_cold5, cr_archer7, wraith6, clawviper6 | aucun | - |
| a5_river (Cellar of Pity) | N | snowy_yeti, succubus, prowling_dead | snowyeti2, succubus5, reanimatedhorde1 | aucun | - |
| a5_river (Cellar of Pity) | C/E | snowy_yeti, frozen_horror, succubus, prowling_dead, succubus_witch, willowisp, skeleton_mage, dark_stalker, wraith, claw_viper | snowyeti1, frozenhorror1, succubus6, reanimatedhorde1, succubuswitch6, willowisp5, skmage_cold5, cr_lancer7, wraith6, clawviper6 | aucun | - |
| a5_crystal2 (Crystalized Cavern Level 2) | N | death_mauler, prowling_dead, frozen_horror | deathmauler3, reanimatedhorde2, frozenhorror2 | aucun | - |
| a5_crystal2 (Crystalized Cavern Level 2) | C/E | snowy_yeti, frozen_horror, prowling_dead, skeleton×2, wraith, bat_demon, skeleton_mage, blood_lord, claw_viper | snowyeti1, frozenhorror1, reanimatedhorde1, skeleton6×2, wraith7, batdemon6, skmage_cold5, bloodlord6, clawviper7 | aucun | - |
| a5_echo (Echo Chamber) | N | snowy_yeti, succubus | snowyeti1, succubus2 | aucun | - |
| a5_echo (Echo Chamber) | C/E | snowy_yeti, succubus, frozen_horror, afflicted, goatman, dark_stalker, skeleton_mage, wraith, blood_lord, sand_raider | snowyeti2, succubus6, frozenhorror2, bighead6, goatman7, cr_archer7, skmage_cold5, wraith6, bloodlord6, sandraider7 | aucun | - |
| a5_tundra (Tundra Wastelands) | N | siege_beast, imp | siegebeast2, imp4 | aucun | - |
| a5_tundra (Tundra Wastelands) | C/E | siege_beast, imp, death_mauler, minion, succubus, skeleton_archer, vulture, skeleton_mage, goatman, panther_woman | siegebeast2, imp2, deathmauler4, minion5, succubus5, sk_archer7, vulture5, skmage_ltng5, goatman10, pantherwoman6 | aucun | - |
| a5_glacial1 (Glacial Caves Level 1) | N | frozen_horror, death_mauler, blood_lord | frozenhorror3, deathmauler3, bloodlord1 | aucun | - |
| a5_glacial1 (Glacial Caves Level 1) | C/E | frozen_horror, snowy_yeti, blood_lord, fallen_shaman, quill_rat, dark_stalker×2, skeleton_mage, prowling_dead, afflicted | frozenhorror2, snowyeti2, bloodlord7, fallenshaman6, quillrat7, cr_lancer7×2, skmage_cold5, reanimatedhorde2, bighead6 | aucun | - |
| a5_glacial2 (Glacial Caves Level 2) | N | snowy_yeti, succubus, prowling_dead | snowyeti4, succubus3, reanimatedhorde3 | aucun | - |
| a5_glacial2 (Glacial Caves Level 2) | C/E | snowy_yeti, succubus, blood_lord, frozen_horror, claw_viper, bone_fetish, willowisp, bat_demon, wraith, succubus_witch | snowyeti2, succubus4, bloodlord7, frozenhorror2, clawviper7, bonefetish5, willowisp5, batdemon6, wraith6, succubuswitch6 | aucun | - |
| a5_anguish (Halls of Anguish) | N | prowling_dead, blood_lord | reanimatedhorde3, bloodlord2 | aucun | - |
| a5_anguish (Halls of Anguish) | C/E | prowling_dead, blood_lord, death_mauler, skeleton, sand_leaper, fallen_shaman, scarab, fetish, skeleton_mage, baboon | reanimatedhorde3, bloodlord2, deathmauler5, skeleton7, sandleaper7, fallenshaman7, scarab6, fetish6, skmage_pois5, baboon7 | aucun | - |
| a5_death (Halls of Death's Calling) | N | prowling_dead, death_mauler, putrid_defiler | reanimatedhorde4, deathmauler2, putriddefiler1 | aucun | - |
| a5_death (Halls of Death's Calling) | C/E | blood_lord, sand_raider, baboon, goatman, quill_rat, unraveler, fetish_blow, cantor, vile_mother, sand_maggot | bloodlord2, sandraider7, baboon8, goatman9, quillrat8, unraveler6, fetishblow6, cantor5, vilemother4, sandmaggot6 | aucun | - |
| a5_abaddon (Hell1) | N | blood_lord, imp | bloodlord3, imp2 | aucun | - |
| a5_abaddon (Hell1) | C/E | blood_lord, imp, venom_lord, succubus, succubus_witch, fallen_shaman, skeleton_archer, bone_fetish, storm_caster, minion | bloodlord3, imp6, megademon4, succubus7, succubuswitch7, fallenshaman8, sk_archer10, bonefetish6, fingermage4, minion10 | aucun | - |
| a5_acheron (Hell2) | N | blood_lord, overseer | bloodlord2, overseer3 | aucun | - |
| a5_acheron (Hell2) | C/E | blood_lord, imp, venom_lord, succubus, claw_viper, blunderbore, unraveler, skeleton_mage, goatman, regurgitator | bloodlord3, imp6, megademon4, succubus7, clawviper8, blunderbore6, unraveler7, skmage_fire6, goatman8, regurgitator4 | aucun | - |
| a5_infernal (Hell3) | N | imp, overseer | imp4, overseer4 | aucun | - |
| a5_infernal (Hell3) | C/E | imp, overseer, venom_lord, claw_viper, blood_lord, succubus_witch, ghoul_lord, fetish_blow, prowling_dead, oblivion_knight | imp7, overseer4, megademon4, clawviper8, bloodlord2, succubuswitch5, vampire6, fetishblow7, reanimatedhorde6, dkmag1 | aucun | - |
| a5_keep1 (The Worldstone Keep Level 1) | N | prowling_dead, succubus_witch, putrid_defiler | reanimatedhorde5, succubuswitch2, putriddefiler3 | aucun | - |
| a5_keep1 (The Worldstone Keep Level 1) | C/E | prowling_dead, succubus_witch, putrid_defiler, sand_raider, blood_lord, dark_stalker, vile_mother, cantor, ghoul_lord, fetish_shaman | reanimatedhorde6, succubuswitch8, putriddefiler3, sandraider9, bloodlord5, cr_lancer8, vilemother5, cantor6, vampire7, fetishshaman8 | aucun | - |
| a5_keep2 (The Worldstone Keep Level 2) | N | suicide_minion, minion | suicideminion6, minion7 | aucun | - |
| a5_keep2 (The Worldstone Keep Level 2) | C/E | suicide_minion, minion, fetish, bat_demon, claw_viper, mummy, skeleton_mage, unraveler, scarab, willowisp | suicideminion6, minion11, fetish8, batdemon7, clawviper10, mummy6, skmage_pois6, unraveler8, scarab7, willowisp6 | aucun | - |
| a5_keep3 (The Worldstone Keep Level 3) | N | blood_lord, imp, putrid_defiler | bloodlord5, imp5, putriddefiler4 | aucun | - |
| a5_keep3 (The Worldstone Keep Level 3) | C/E | blood_lord, imp, putrid_defiler, storm_caster, oblivion_knight, fetish_blow, skeleton_mage, wraith, succubus, overseer | bloodlord5, imp5, putriddefiler4, fingermage5, dkmag2, fetishblow8, skmage_ltng6, wraith8, succubus4, overseer4 | aucun | - |

