# Cadence d'attaque des monstres

Généré par `npx tsx tools/bench/monster-rates.ts --write`. Attendu D2 = animation (animdata.d2) + aidel (monstats.txt, Cauchemar). Tolérance ±15 %.

| espèce | attaque | mode D2 | animation mesurée / attendue (ticks) | intervalle mesuré / attendu (ticks) | écart | remarque |
|---|---|---|---|---|---|---|
| Déchu (fallen) | melee#0 (cd 12) | A1 | 10.0 / 10 | 23.0 / 24 | -4 % |  |
| Chaman déchu (fallen_shaman) | missile#0 (cd 40) | A1 | 17.0 / 17 | 58.0 / 31 | +87 % | plus lent (limiteur de conception) |
| Chaman déchu (fallen_shaman) | summon#1 (cd 100) | A1 | 0.0 / 17 | — / 31 | — | résurrection : non mesurée (cadavre requis) |
| Zombie (zombie) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Squelette (skeleton) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 34 | -3 % |  |
| Archer cadavérique (skeleton_archer) | missile#0 (cd 22) | S1 | 24.0 / 24 | 47.0 / 38 | +24 % | TROP LENT |
| Griswold le Maudit (griswold) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 33 | +0 % |  |
| Momie (mummy) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 32 | -3 % |  |
| Momie (mummy) | melee#1 (cd 60) | A1 | 18.0 / 18 | 79.0 / 32 | +147 % | plus lent (limiteur de conception) |
| Démêleur (unraveler) | missile#0 (cd 50) | A1 | 16.0 / 16 | 67.0 / 30 | +123 % | plus lent (limiteur de conception) |
| Démêleur (unraveler) | melee#1 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Démêleur (unraveler) | summon#2 (cd 200) | A1 | 0.0 / 16 | — / 30 | — | résurrection : non mesurée (cadavre requis) |
| Mage revenu (skeleton_mage) | missile#0 (cd 35) | S1 | 24.0 / 24 | 59.0 / 39 | +51 % | plus lent (limiteur de conception) |
| Mage revenu (skeleton_mage) | missile#1 (cd 35) | S1 | 24.0 / 24 | 59.0 / 39 | +51 % | plus lent (limiteur de conception) |
| Chaman déformé (warped_shaman) | missile#0 (cd 40) | A1 | 17.0 / 17 | 58.0 / 31 | +87 % | plus lent (limiteur de conception) |
| Chaman déformé (warped_shaman) | summon#1 (cd 100) | A1 | 0.0 / 17 | — / 31 | — | résurrection : non mesurée (cadavre requis) |
| Mort brûlant (burning_dead) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 34 | -3 % |  |
| Mage des tempêtes (storm_caster) | missile#0 (cd 35) | S1 | 17.0 / 17 | 52.0 / 31 | +68 % | plus lent (limiteur de conception) |
| Mage des tempêtes (storm_caster) | nova#1 (cd 110) | S1 | 17.0 / 17 | 128.0 / 31 | +313 % | plus lent (limiteur de conception) |
| Membre du Conseil (council_member) | missile#0 (cd 40) | S1 | 18.0 / 18 | 59.0 / 31 | +90 % | plus lent (limiteur de conception) |
| Membre du Conseil (council_member) | melee#1 (cd 12) | A1 | 15.0 / 15 | 28.0 / 28 | +0 % |  |
| Membre du Conseil (council_member) | summon#2 (cd 240) | S1 | 18.0 / 18 | — / 31 | — | une seule attaque observée (cooldown long) |
| Membre du Conseil (council_member) | heal#3 (cd 150) | S1 | 18.0 / 18 | 169.0 / 31 | +445 % | plus lent (limiteur de conception) |
| Scarabée-soldat (scarab) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Scarabée-soldat (scarab) | melee#1 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Duriel, seigneur de la Douleur (duriel) | melee#0 (cd 12) | A1 | 10.0 / 10 | 23.0 / 25 | -8 % |  |
| Duriel, seigneur de la Douleur (duriel) | melee#1 (cd 12) | A1 | 10.0 / 10 | 23.0 / 25 | -8 % |  |
| Duriel, seigneur de la Douleur (duriel) | charge#2 (cd 110) | A1 | 10.0 / 10 | 121.0 / 25 | +384 % | plus lent (limiteur de conception) |
| Goule (ghoul) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Traqueur sombre (dark_stalker) | melee#0 (cd 12) | A1 | 13.0 / 13 | 26.0 / 27 | -4 % |  |
| Traqueur sombre (dark_stalker) | missile#1 (cd 45) | S1 | 20.0 / 20 | 65.0 / 34 | +91 % | plus lent (limiteur de conception) |
| La Comtesse (countess) | melee#0 (cd 12) | A1 | 13.0 / 13 | 26.0 / 27 | -4 % |  |
| La Comtesse (countess) | missile#1 (cd 40) | S1 | 20.0 / 20 | 61.0 / 34 | +79 % | plus lent (limiteur de conception) |
| Andariel, Vierge de l'angoisse (andariel) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 27 | +7 % |  |
| Andariel, Vierge de l'angoisse (andariel) | missile#1 (cd 40) | A1 | 16.0 / 16 | 57.0 / 27 | +111 % | plus lent (limiteur de conception) |
| Andariel, Vierge de l'angoisse (andariel) | breath#2 (cd 80) | A1 | 16.0 / 16 | 97.0 / 27 | +259 % | plus lent (limiteur de conception) |
| Méphisto, seigneur de la Haine (mephisto) | melee#0 (cd 12) | A1 | 24.0 / 24 | 37.0 / 34 | +9 % |  |
| Méphisto, seigneur de la Haine (mephisto) | breath#1 (cd 70) | A1 | 24.0 / 24 | 95.0 / 34 | +179 % | plus lent (limiteur de conception) |
| Méphisto, seigneur de la Haine (mephisto) | missile#2 (cd 40) | A1 | 24.0 / 24 | 65.0 / 34 | +91 % | plus lent (limiteur de conception) |
| Méphisto, seigneur de la Haine (mephisto) | nova#3 (cd 150) | A1 | 24.0 / 24 | 175.0 / 34 | +415 % | plus lent (limiteur de conception) |
| Méphisto, seigneur de la Haine (mephisto) | nova#4 (cd 130) | A1 | 24.0 / 24 | 155.0 / 34 | +356 % | plus lent (limiteur de conception) |
| Méphisto, seigneur de la Haine (mephisto) | cast#5 (cd 220) | A1 | 24.0 / 24 | 245.0 / 34 | +621 % | plus lent (limiteur de conception) |
| Méphisto, seigneur de la Haine (mephisto) | cast#6 (cd 100) | A1 | 24.0 / 24 | 125.0 / 34 | +268 % | plus lent (limiteur de conception) |
| Méphisto, seigneur de la Haine (mephisto) | cast#7 (cd 120) | A1 | 24.0 / 24 | 145.0 / 34 | +326 % | plus lent (limiteur de conception) |
| Pindleskin (pindleskin) | melee#0 (cd 12) | A1 | 17.0 / 17 | 30.0 / 31 | -3 % |  |
| Pindleskin (pindleskin) | melee#1 (cd 12) | A1 | 17.0 / 17 | 30.0 / 31 | -3 % |  |
| Eldritch le Redresseur (eldritch) | melee#0 (cd 12) | A1 | 24.0 / 24 | 37.0 / 38 | -3 % |  |
| Eldritch le Redresseur (eldritch) | missile#1 (cd 40) | A1 | 24.0 / 24 | 65.0 / 38 | +71 % | plus lent (limiteur de conception) |
| Shenk le Contremaître (shenk) | melee#0 (cd 12) | A1 | 17.0 / 17 | 30.0 / 31 | -3 % |  |
| Shenk le Contremaître (shenk) | missile#1 (cd 45) | S1 | 21.0 / 21 | 66.0 / 35 | +89 % | plus lent (limiteur de conception) |
| Shenk le Contremaître (shenk) | heal#2 (cd 150) | S2 | 16.0 / 16 | 167.0 / 30 | +457 % | plus lent (limiteur de conception) |
| Nihlathak (nihlathak) | melee#0 (cd 12) | A1 | 30.0 / 30 | 43.0 / 45 | -4 % |  |
| Nihlathak (nihlathak) | missile#1 (cd 40) | A1 | 30.0 / 30 | 71.0 / 45 | +58 % | plus lent (limiteur de conception) |
| Nihlathak (nihlathak) | nova#2 (cd 130) | A1 | 30.0 / 30 | 161.0 / 45 | +258 % | plus lent (limiteur de conception) |
| Nihlathak (nihlathak) | nova#3 (cd 150) | A1 | 30.0 / 30 | 181.0 / 45 | +302 % | plus lent (limiteur de conception) |
| Nihlathak (nihlathak) | breath#4 (cd 110) | A1 | 30.0 / 30 | 141.0 / 45 | +213 % | plus lent (limiteur de conception) |
| Bovin infernal (hell_bovine) | melee#0 (cd 12) | A1 | 19.0 / 19 | 32.0 / 33 | -3 % |  |
| Le Roi des Vaches (cow_king) | melee#0 (cd 12) | A1 | 19.0 / 19 | 32.0 / 33 | -3 % |  |
| Le Roi des Vaches (cow_king) | melee#1 (cd 12) | A1 | 19.0 / 19 | 32.0 / 33 | -3 % |  |
| Sbire de la Destruction (minion_destruction) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Seigneur venimeux (venom_lord) | melee#0 (cd 12) | A1 | 24.0 / 24 | 37.0 / 38 | -3 % |  |
| Seigneur venimeux (venom_lord) | breath#1 (cd 50) | S1 | 12.0 / 12 | 63.0 / 26 | +142 % | plus lent (limiteur de conception) |
| Chevalier de l'oubli (oblivion_knight) | missile#0 (cd 75) | S1 | 16.0 / 16 | 91.0 / 30 | +203 % | plus lent (limiteur de conception) |
| Chevalier de l'oubli (oblivion_knight) | missile#1 (cd 60) | S1 | 16.0 / 16 | 77.0 / 30 | +157 % | plus lent (limiteur de conception) |
| Chevalier de l'oubli (oblivion_knight) | curse#2 (cd 200) | S2 | 16.0 / 16 | 217.0 / 30 | +623 % | plus lent (limiteur de conception) |
| Tueur d'âmes (soul_killer) | missile#0 (cd 40) | A1 | 12.0 / 12 | 53.0 / 26 | +104 % | plus lent (limiteur de conception) |
| Seigneur de sang (blood_lord) | melee#0 (cd 12) | A1 | 22.0 / 22 | 35.0 / 36 | -3 % |  |
| Baal, seigneur de la Destruction (baal) | melee#0 (cd 12) | A1 | 19.0 / 19 | 32.0 / 32 | +0 % |  |
| Baal, seigneur de la Destruction (baal) | missile#1 (cd 60) | S3 | 23.0 / 23 | 84.0 / 36 | +133 % | plus lent (limiteur de conception) |
| Baal, seigneur de la Destruction (baal) | nova#2 (cd 120) | S3 | 23.0 / 23 | 144.0 / 36 | +300 % | plus lent (limiteur de conception) |
| Baal, seigneur de la Destruction (baal) | breath#3 (cd 90) | S3 | 23.0 / 23 | 114.0 / 36 | +217 % | plus lent (limiteur de conception) |
| Baal, seigneur de la Destruction (baal) | curse#4 (cd 200) | S2 | 37.0 / 37 | 238.0 / 50 | +376 % | plus lent (limiteur de conception) |
| Baal, seigneur de la Destruction (baal) | cast#5 (cd 150) | S3 | 23.0 / 23 | 174.0 / 36 | +383 % | plus lent (limiteur de conception) |
| Diablo, seigneur de la Terreur (diablo) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 29 | +0 % |  |
| Diablo, seigneur de la Terreur (diablo) | breath#1 (cd 70) | S2 | 16.0 / 16 | 87.0 / 29 | +200 % | plus lent (limiteur de conception) |
| Diablo, seigneur de la Terreur (diablo) | nova#2 (cd 110) | S2 | 16.0 / 16 | 127.0 / 29 | +338 % | plus lent (limiteur de conception) |
| Diablo, seigneur de la Terreur (diablo) | missile#3 (cd 40) | S2 | 16.0 / 16 | 57.0 / 29 | +97 % | plus lent (limiteur de conception) |
| Diablo, seigneur de la Terreur (diablo) | nova#4 (cd 130) | S2 | 16.0 / 16 | 147.0 / 29 | +407 % | plus lent (limiteur de conception) |
| Diablo, seigneur de la Terreur (diablo) | charge#5 (cd 140) | A1 | 16.0 / 16 | 157.0 / 29 | +441 % | plus lent (limiteur de conception) |
| Diablo, seigneur de la Terreur (diablo) | cast#6 (cd 170) | S2 | 16.0 / 16 | 187.0 / 29 | +545 % | plus lent (limiteur de conception) |
| Diablo, seigneur de la Terreur (diablo) | cast#7 (cd 500) | S2 | 16.0 / 16 | 517.0 / 29 | +1683 % | plus lent (limiteur de conception) |
| Izual (izual) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 30 | +3 % |  |
| Izual (izual) | missile#1 (cd 40) | A1 | 18.0 / 18 | 59.0 / 30 | +97 % | plus lent (limiteur de conception) |
| Izual (izual) | nova#2 (cd 140) | A1 | 18.0 / 18 | 159.0 / 30 | +430 % | plus lent (limiteur de conception) |
| Héphasto le Forgeron (hephasto) | melee#0 (cd 12) | A1 | 14.0 / 14 | 27.0 / 27 | +0 % |  |
| Héphasto le Forgeron (hephasto) | missile#1 (cd 40) | A1 | 14.0 / 14 | 55.0 / 27 | +104 % | plus lent (limiteur de conception) |
| Radament (radament) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Radament (radament) | missile#1 (cd 40) | A1 | 16.0 / 16 | 57.0 / 30 | +90 % | plus lent (limiteur de conception) |
| Radament (radament) | nova#2 (cd 100) | A1 | 16.0 / 16 | 117.0 / 30 | +290 % | plus lent (limiteur de conception) |
| Radament (radament) | summon#3 (cd 260) | A1 | 16.0 / 16 | — / 30 | — | une seule attaque observée (cooldown long) |
| L'Invocateur (summoner) | melee#0 (cd 12) | — | 14.0 / — | 27.0 / — | — |  |
| L'Invocateur (summoner) | missile#1 (cd 40) | S1 | 8.0 / 8 | 49.0 / 21 | +133 % | plus lent (limiteur de conception) |
| L'Invocateur (summoner) | missile#2 (cd 40) | S1 | 8.0 / 8 | 49.0 / 21 | +133 % | plus lent (limiteur de conception) |
| L'Invocateur (summoner) | nova#3 (cd 120) | S1 | 8.0 / 8 | 129.0 / 21 | +514 % | plus lent (limiteur de conception) |
| L'Invocateur (summoner) | curse#4 (cd 200) | S1 | 8.0 / 8 | 209.0 / 21 | +895 % | plus lent (limiteur de conception) |
| L'Invocateur (summoner) | cast#5 (cd 220) | S1 | 8.0 / 8 | 229.0 / 21 | +990 % | plus lent (limiteur de conception) |
| Blood Raven (blood_raven) | melee#0 (cd 12) | A1 | 13.0 / 13 | 26.0 / 26 | +0 % |  |
| Blood Raven (blood_raven) | missile#1 (cd 30) | S1 | 20.0 / 20 | 51.0 / 33 | +55 % | TROP LENT |
| Blood Raven (blood_raven) | missile#2 (cd 70) | S1 | 20.0 / 20 | 91.0 / 33 | +176 % | plus lent (limiteur de conception) |
| Blood Raven (blood_raven) | summon#3 (cd 200) | S1 | 20.0 / 20 | — / 33 | — | une seule attaque observée (cooldown long) |
| Le Forgeron (the_smith) | melee#0 (cd 12) | A1 | 14.0 / 14 | 27.0 / 27 | +0 % |  |
| Homme-bouc (goatman) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 34 | -3 % |  |
| Spectre (wraith) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 32 | -3 % |  |
| Affligé (afflicted) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Seigneur goule (ghoul_lord) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 34 | -3 % |  |
| Seigneur goule (ghoul_lord) | missile#1 (cd 45) | A1 | 20.0 / 20 | 65.0 / 34 | +91 % | plus lent (limiteur de conception) |
| Seigneur goule (ghoul_lord) | missile#2 (cd 40) | A1 | 20.0 / 20 | 61.0 / 34 | +79 % | plus lent (limiteur de conception) |
| Seigneur goule (ghoul_lord) | nova#3 (cd 110) | A1 | 20.0 / 20 | 131.0 / 34 | +285 % | plus lent (limiteur de conception) |
| Panse-sanglante (blunderbore) | melee#0 (cd 12) | A1 | 15.0 / 15 | 28.0 / 29 | -3 % |  |
| Panse-sanglante (blunderbore) | melee#1 (cd 90) | A1 | 15.0 / 15 | 106.0 / 29 | +266 % | plus lent (limiteur de conception) |
| Sbire asservi (minion) | melee#0 (cd 12) | A1 | 24.0 / 24 | 37.0 / 38 | -3 % |  |
| Tentatrice infernale (succubus) | melee#0 (cd 12) | A1 | 21.0 / 21 | 34.0 / 35 | -3 % |  |
| Tentatrice infernale (succubus) | missile#1 (cd 45) | S2 | 8.0 / 8 | 53.0 / 22 | +141 % | plus lent (limiteur de conception) |
| Tentatrice infernale (succubus) | missile#2 (cd 40) | S2 | 8.0 / 8 | 49.0 / 22 | +123 % | plus lent (limiteur de conception) |
| Tentatrice infernale (succubus) | curse#3 (cd 200) | S2 | 8.0 / 8 | 209.0 / 22 | +850 % | plus lent (limiteur de conception) |
| Furie stygienne (succubus_witch) | melee#0 (cd 12) | A1 | 21.0 / 21 | 34.0 / 35 | -3 % |  |
| Furie stygienne (succubus_witch) | missile#1 (cd 45) | S2 | 16.0 / 16 | 61.0 / 30 | +103 % | plus lent (limiteur de conception) |
| Furie stygienne (succubus_witch) | missile#2 (cd 40) | S2 | 16.0 / 16 | 57.0 / 30 | +90 % | plus lent (limiteur de conception) |
| Furie stygienne (succubus_witch) | missile#3 (cd 40) | S2 | 16.0 / 16 | 57.0 / 30 | +90 % | plus lent (limiteur de conception) |
| Furie stygienne (succubus_witch) | curse#4 (cd 200) | S2 | 16.0 / 16 | 217.0 / 30 | +623 % | plus lent (limiteur de conception) |
| Souilleur répugnant (putrid_defiler) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 35 | -6 % |  |
| Souilleur répugnant (putrid_defiler) | missile#1 (cd 45) | S1 | 32.0 / 32 | 77.0 / 47 | +64 % | plus lent (limiteur de conception) |
| Souilleur répugnant (putrid_defiler) | summon#2 (cd 220) | S1 | 32.0 / 32 | — / 47 | — | une seule attaque observée (cooldown long) |
| Diablotin (imp) | melee#0 (cd 12) | A1 | 14.0 / 14 | 27.0 / 28 | -4 % |  |
| Diablotin (imp) | missile#1 (cd 40) | S1 | 16.0 / 16 | 57.0 / 30 | +90 % | plus lent (limiteur de conception) |
| Diablotin (imp) | nova#2 (cd 110) | S1 | 16.0 / 16 | 127.0 / 30 | +323 % | plus lent (limiteur de conception) |
| Bête de siège (siege_beast) | melee#0 (cd 12) | A1 | 14.0 / 14 | 27.0 / 28 | -4 % |  |
| Bête de siège (siege_beast) | charge#1 (cd 120) | A1 | 14.0 / 14 | 135.0 / 28 | +382 % | plus lent (limiteur de conception) |
| Bête de siège (siege_beast) | nova#2 (cd 110) | A1 | 14.0 / 14 | 125.0 / 28 | +346 % | plus lent (limiteur de conception) |
| Mutileur de la mort (death_mauler) | melee#0 (cd 12) | A1 | 13.0 / 13 | 26.0 / 28 | -7 % |  |
| Surveillant (overseer) | melee#0 (cd 12) | A1 | 17.0 / 17 | 30.0 / 31 | -3 % |  |
| Surveillant (overseer) | summon#1 (cd 220) | S2 | 16.0 / 16 | — / 30 | — | une seule attaque observée (cooldown long) |
| Surveillant (overseer) | heal#2 (cd 150) | S2 | 16.0 / 16 | 167.0 / 30 | +457 % | plus lent (limiteur de conception) |
| Surveillant (overseer) | melee#3 (cd 90) | A1 | 17.0 / 17 | 108.0 / 31 | +248 % | plus lent (limiteur de conception) |
| Génitrice de chair (vile_mother) | melee#0 (cd 12) | A1 | 19.0 / 19 | 32.0 / 33 | -3 % |  |
| Génitrice de chair (vile_mother) | summon#1 (cd 220) | S1 | 27.0 / 27 | — / 41 | — | une seule attaque observée (cooldown long) |
| Corpulent (regurgitator) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Corpulent (regurgitator) | missile#1 (cd 45) | S1 | 24.0 / 24 | 69.0 / 38 | +82 % | plus lent (limiteur de conception) |
| Rôdeur des falaises (sand_leaper) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 34 | -3 % |  |
| Rôdeur des falaises (sand_leaper) | charge#1 (cd 120) | A1 | 20.0 / 20 | 141.0 / 34 | +315 % | plus lent (limiteur de conception) |
| Âme brûlante (willowisp) | melee#0 (cd 12) | A1 | 21.0 / 21 | 34.0 / 35 | -3 % |  |
| Âme brûlante (willowisp) | missile#1 (cd 45) | S1 | 9.0 / 9 | 54.0 / 23 | +135 % | plus lent (limiteur de conception) |
| Âme brûlante (willowisp) | missile#2 (cd 40) | S1 | 9.0 / 9 | 50.0 / 23 | +117 % | plus lent (limiteur de conception) |
| Âme brûlante (willowisp) | nova#3 (cd 110) | S1 | 9.0 / 9 | 120.0 / 23 | +422 % | plus lent (limiteur de conception) |
| Familier sombre (bat_demon) | melee#0 (cd 12) | A1 | 10.0 / 10 | 23.0 / 24 | -4 % |  |
| Ver de sang (sand_maggot) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 32 | -3 % |  |
| Ver de sang (sand_maggot) | summon#1 (cd 220) | S1 | 12.0 / 12 | — / 26 | — | une seule attaque observée (cooldown long) |
| Rat à piquants (quill_rat) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Brute (brute) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Corbeau impur (foul_crow) | melee#0 (cd 12) | A1 | 11.0 / 11 | 24.0 / 25 | -4 % |  |
| Arach (arach) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Chasseresse (panther_woman) | melee#0 (cd 12) | A1 | 22.0 / 22 | 35.0 / 36 | -3 % |  |
| Lanceuse (slinger) | melee#0 (cd 12) | A1 | 22.0 / 22 | 35.0 / 36 | -3 % |  |
| Lanceuse (slinger) | missile#1 (cd 45) | A1 | 22.0 / 22 | 67.0 / 36 | +86 % | plus lent (limiteur de conception) |
| Charognard (vulture) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Pillard des sables (sand_raider) | melee#0 (cd 12) | A1 | 19.0 / 19 | 32.0 / 33 | -3 % |  |
| Vipère griffue (claw_viper) | melee#0 (cd 12) | A1 | 14.0 / 14 | 27.0 / 28 | -4 % |  |
| Vipère griffue (claw_viper) | charge#1 (cd 120) | A1 | 14.0 / 14 | 135.0 / 28 | +382 % | plus lent (limiteur de conception) |
| Essaim (locust) | melee#0 (cd 12) | A1 | 20.0 / 20 | 33.0 / 34 | -3 % |  |
| Essaim (locust) | charge#1 (cd 120) | A1 | 20.0 / 20 | 141.0 / 34 | +315 % | plus lent (limiteur de conception) |
| Bête des dunes (baboon) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Fétiche (fetish) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Fétiche sarbacane (fetish_blow) | melee#0 (cd 12) | A1 | 15.0 / 15 | 28.0 / 29 | -3 % |  |
| Fétiche sarbacane (fetish_blow) | missile#1 (cd 45) | A1 | 15.0 / 15 | 60.0 / 29 | +107 % | plus lent (limiteur de conception) |
| Chaman fétiche (fetish_shaman) | melee#0 (cd 12) | A1 | 25.0 / 25 | 38.0 / 39 | -3 % |  |
| Chaman fétiche (fetish_shaman) | missile#1 (cd 45) | A1 | 25.0 / 25 | 70.0 / 39 | +79 % | plus lent (limiteur de conception) |
| Fétiche d'os (bone_fetish) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Moustique géant (mosquito) | melee#0 (cd 12) | A1 | 14.0 / 14 | 27.0 / 28 | -4 % |  |
| Colosse d'épines (thornhulk) | melee#0 (cd 12) | A1 | 13.0 / 13 | 26.0 / 27 | -4 % |  |
| Colosse d'épines (thornhulk) | nova#1 (cd 110) | A1 | 13.0 / 13 | 124.0 / 27 | +359 % | plus lent (limiteur de conception) |
| Démon-grenouille (frog_demon) | melee#0 (cd 12) | A1 | 15.0 / 15 | 28.0 / 29 | -3 % |  |
| Démon-grenouille (frog_demon) | charge#1 (cd 120) | A1 | 15.0 / 15 | 136.0 / 29 | +369 % | plus lent (limiteur de conception) |
| Zélote (zealot) | melee#0 (cd 12) | A1 | 15.0 / 15 | 28.0 / 29 | -3 % |  |
| Chantre (cantor) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 32 | -3 % |  |
| Chantre (cantor) | missile#1 (cd 45) | S1 | 15.0 / 15 | 60.0 / 29 | +107 % | plus lent (limiteur de conception) |
| Chantre (cantor) | missile#2 (cd 40) | S1 | 15.0 / 15 | 56.0 / 29 | +93 % | plus lent (limiteur de conception) |
| Chantre (cantor) | nova#3 (cd 110) | S1 | 15.0 / 15 | 126.0 / 29 | +334 % | plus lent (limiteur de conception) |
| Chantre (cantor) | heal#4 (cd 150) | S1 | 15.0 / 15 | 166.0 / 29 | +472 % | plus lent (limiteur de conception) |
| Yéti des neiges (snowy_yeti) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Horreur gelée (frozen_horror) | melee#0 (cd 12) | A1 | 21.0 / 21 | 34.0 / 35 | -3 % |  |
| Horreur gelée (frozen_horror) | nova#1 (cd 110) | A1 | 21.0 / 21 | 132.0 / 35 | +277 % | plus lent (limiteur de conception) |
| Sbire kamikaze (suicide_minion) | melee#0 (cd 12) | — | 14.0 / — | 27.0 / — | — |  |
| Sbire kamikaze (suicide_minion) | nova#1 (cd 110) | S1 | 42.0 / 42 | 153.0 / 56 | +173 % | plus lent (limiteur de conception) |
| Mort rôdeur (prowling_dead) | melee#0 (cd 12) | A1 | 17.0 / 17 | 30.0 / 31 | -3 % |  |
| Mort rôdeur (prowling_dead) | charge#1 (cd 120) | A1 | 17.0 / 17 | 138.0 / 31 | +345 % | plus lent (limiteur de conception) |
| Archère sombre (dark_ranger) | melee#0 (cd 12) | A1 | 13.0 / 13 | 26.0 / 27 | -4 % |  |
| Archère sombre (dark_ranger) | missile#1 (cd 45) | S1 | 20.0 / 20 | 65.0 / 34 | +91 % | plus lent (limiteur de conception) |
| Lancière sombre (dark_spearwoman) | melee#0 (cd 12) | A1 | 13.0 / 13 | 26.0 / 27 | -4 % |  |
| Lancière sombre (dark_spearwoman) | charge#1 (cd 120) | A1 | 13.0 / 13 | 134.0 / 27 | +396 % | plus lent (limiteur de conception) |
| Chevalier funeste (doom_knight) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Chevalier de l'abîme (abyss_knight) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Chevalier de l'abîme (abyss_knight) | missile#1 (cd 45) | S1 | 16.0 / 16 | 61.0 / 30 | +103 % | plus lent (limiteur de conception) |
| Chevalier de l'abîme (abyss_knight) | missile#2 (cd 40) | S1 | 16.0 / 16 | 57.0 / 30 | +90 % | plus lent (limiteur de conception) |
| Balrog (balrog) | melee#0 (cd 12) | A1 | 24.0 / 24 | 37.0 / 37 | +0 % |  |
| Balrog (balrog) | breath#1 (cd 60) | S1 | 12.0 / 12 | 73.0 / 25 | +192 % | plus lent (limiteur de conception) |
| Bête de chair (flesh_beast) | melee#0 (cd 12) | A1 | 10.0 / 10 | 23.0 / 24 | -4 % |  |
| Jeune ver des sables (maggot_young) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 32 | -3 % |  |
| Reine des vers (maggot_queen) | melee#0 (cd 12) | — | 14.0 / — | 27.0 / — | — |  |
| Reine des vers (maggot_queen) | summon#1 (cd 220) | S1 | 31.0 / 31 | — / 46 | — | une seule attaque observée (cooldown long) |
| Ver de douleur (pain_worm) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 30 | -3 % |  |
| Guetteur des eaux (water_watcher) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 33 | -6 % |  |
| Guetteur des eaux (water_watcher) | missile#1 (cd 45) | S1 | 26.0 / 26 | 71.0 / 41 | +73 % | plus lent (limiteur de conception) |
| Guetteur des eaux (water_watcher) | nova#2 (cd 110) | S1 | 26.0 / 26 | 137.0 / 41 | +234 % | plus lent (limiteur de conception) |
| Maraudeur nocturne (night_marauder) | melee#0 (cd 12) | A1 | 12.0 / 12 | 25.0 / 26 | -4 % |  |
| Chatte-lancière (spear_cat) | melee#0 (cd 12) | A1 | 22.0 / 22 | 35.0 / 36 | -3 % |  |
| Chatte-lancière (spear_cat) | missile#1 (cd 45) | A1 | 22.0 / 22 | 67.0 / 36 | +86 % | plus lent (limiteur de conception) |
| Duriel ultime (uber_duriel) | melee#0 (cd 12) | A1 | 10.0 / 10 | 23.0 / 25 | -8 % |  |
| Duriel ultime (uber_duriel) | melee#1 (cd 12) | A1 | 10.0 / 10 | 23.0 / 25 | -8 % |  |
| Duriel ultime (uber_duriel) | charge#2 (cd 110) | A1 | 10.0 / 10 | 121.0 / 25 | +384 % | plus lent (limiteur de conception) |
| Méphisto ultime (uber_mephisto) | melee#0 (cd 12) | A1 | 24.0 / 24 | 37.0 / 34 | +9 % |  |
| Méphisto ultime (uber_mephisto) | breath#1 (cd 70) | A1 | 24.0 / 24 | 95.0 / 34 | +179 % | plus lent (limiteur de conception) |
| Méphisto ultime (uber_mephisto) | missile#2 (cd 40) | A1 | 24.0 / 24 | 65.0 / 34 | +91 % | plus lent (limiteur de conception) |
| Méphisto ultime (uber_mephisto) | nova#3 (cd 150) | A1 | 24.0 / 24 | 175.0 / 34 | +415 % | plus lent (limiteur de conception) |
| Méphisto ultime (uber_mephisto) | nova#4 (cd 130) | A1 | 24.0 / 24 | 155.0 / 34 | +356 % | plus lent (limiteur de conception) |
| Diablo ultime (uber_diablo) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 29 | +0 % |  |
| Diablo ultime (uber_diablo) | breath#1 (cd 70) | S2 | 16.0 / 16 | 87.0 / 29 | +200 % | plus lent (limiteur de conception) |
| Diablo ultime (uber_diablo) | nova#2 (cd 110) | S2 | 16.0 / 16 | 127.0 / 29 | +338 % | plus lent (limiteur de conception) |
| Diablo ultime (uber_diablo) | missile#3 (cd 40) | S2 | 16.0 / 16 | 57.0 / 29 | +97 % | plus lent (limiteur de conception) |
| Diablo ultime (uber_diablo) | nova#4 (cd 130) | S2 | 16.0 / 16 | 147.0 / 29 | +407 % | plus lent (limiteur de conception) |
| Diablo ultime (uber_diablo) | charge#5 (cd 140) | A1 | 16.0 / 16 | 157.0 / 29 | +441 % | plus lent (limiteur de conception) |
| Baal ultime (uber_baal) | melee#0 (cd 12) | A1 | 19.0 / 19 | 32.0 / 32 | +0 % |  |
| Baal ultime (uber_baal) | missile#1 (cd 60) | S3 | 23.0 / 23 | 84.0 / 36 | +133 % | plus lent (limiteur de conception) |
| Baal ultime (uber_baal) | nova#2 (cd 120) | S3 | 23.0 / 23 | 144.0 / 36 | +300 % | plus lent (limiteur de conception) |
| Baal ultime (uber_baal) | breath#3 (cd 90) | S3 | 23.0 / 23 | 114.0 / 36 | +217 % | plus lent (limiteur de conception) |
| Baal ultime (uber_baal) | curse#4 (cd 300) | S2 | 37.0 / 37 | 338.0 / 50 | +576 % | plus lent (limiteur de conception) |
| Lilith, mère des démons (lilith) | melee#0 (cd 12) | A1 | 16.0 / 16 | 29.0 / 27 | +7 % |  |
| Lilith, mère des démons (lilith) | missile#1 (cd 35) | A1 | 16.0 / 16 | 51.0 / 27 | +89 % | plus lent (limiteur de conception) |
| Lilith, mère des démons (lilith) | nova#2 (cd 110) | A1 | 16.0 / 16 | 127.0 / 27 | +370 % | plus lent (limiteur de conception) |
| Lilith, mère des démons (lilith) | missile#3 (cd 45) | A1 | 16.0 / 16 | 61.0 / 27 | +126 % | plus lent (limiteur de conception) |
| Izual ultime (uber_izual) | melee#0 (cd 12) | A1 | 18.0 / 18 | 31.0 / 30 | +3 % |  |
| Izual ultime (uber_izual) | missile#1 (cd 40) | A1 | 18.0 / 18 | 59.0 / 30 | +97 % | plus lent (limiteur de conception) |
| Izual ultime (uber_izual) | nova#2 (cd 120) | A1 | 18.0 / 18 | 139.0 / 30 | +363 % | plus lent (limiteur de conception) |
| Mendeln (mendeln) | melee#0 (cd 12) | — | 14.0 / — | 27.0 / — | — |  |
| Mendeln (mendeln) | missile#1 (cd 40) | — | 16.0 / — | 57.0 / — | — |  |
| Mendeln (mendeln) | breath#2 (cd 80) | — | 22.0 / — | 103.0 / — | — |  |
