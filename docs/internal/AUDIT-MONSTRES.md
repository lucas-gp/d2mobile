# Peuplement des zones : jeu contre Diablo II (Levels.txt, patch 1.13)

Source : `Levels.txt` (colonnes `mon`/`nmon`/`umon` = monstres, `MonDen` = densité, `MonUMin/Max` = uniques par difficulté), `monpreset.txt` + DS1 (emplacements d'origine), `monstats.txt` (fiches). Plans dans `src/data/levels.ts`, monstres ajoutés dans `src/data/monsters-d2.ts` (généré par `tools/audit/gen-monsters-d2.ts`).

| Zone du jeu | Zone D2 | Monstres D2 | Avant | Maintenant |
|---|---|---|---|---|
| Tristram | Tristram | Returned, Night Clan, Carver Shaman, Skeleton Archer | Déchus, Zombies, Squelettes | squelette, homme-bouc, chaman déchu, archer |
| Comtesse | Tower Cellar 5 | Devilkin, Ghost, Blood Clan, Dark Archer | Déchus, Traqueurs | déchu, spectre, homme-bouc, traqueur |
| Andariel | Catacombs 4 | Ghoul, Afflicted | Goules, Zombies, Squelettes | goule, affligé |
| Tombeaux | Tal Rasha's Tomb | Apparition, Steel Scarab, Preserved Dead, Unraveler ×2, Ghoul Lord, Gorebelly | Momies, mages squelettes, scarabées | les sept familles |
| Vaches | Moo Moo Farm | Hell Bovine | idem | idem, densité 800 |
| Méphisto | Durance 3 | Blood Lord | Blood Lords, Momies, Chevaliers | blood lords seuls |
| Chaos | Chaos Sanctum | Storm Caster, Oblivion Knight, Venom Lord | Seigneurs de sang, Âmes | les trois, 26 → ~50 groupes selon la surface |
| Pindleskin | Temple (monpreset) | Morts rôdeurs | Chevaliers, Sbires de la destruction | morts rôdeurs |
| Eldritch / Shenk | Rigid Highlands | Imp, Crush Beast, Enslaved, Death Mauler, Overseer… | Sbires de la destruction, Chamans | Diablotins, bêtes de siège, sbires asservis, mutileurs, surveillants |
| Nihlathak | Halls of Vaught | Ice Spawn, Hell Temptress, Wretched Defiler (+ morts rôdeurs, spectres… en NM/Enfer) | Morts-vivants brûlants, Momies | sbires, tentatrices, souilleurs |
| Trône de Baal (gardiens) | Throne of Destruction | Death Lord, Stygian Fury | Chevaliers de l'oubli | seigneurs de sang, furies |
| Anciens | Arreat Summit | aucun (les trois Anciens seuls) | idem | idem |

Densité : nombre de groupes = (cases atteignables × `MonDen` / 100 000) ÷ 4,6 monstres par groupe, plafonné à 420 monstres ; uniques = `MonUMin/Max` de la difficulté ; groupes espacés selon la surface, à 14 unités du départ et 8 du boss.

Limites : 14 monstres ajoutés (planches D2 `gm wr bh va pn xx 0b 0c 45 ip ox m5 os re`) mais leur IA reste simple (mêlée ou un projectile) ; Gorebelly, Ghoul Lord, Defiler, etc. n'ont pas leurs compétences spéciales (Impregnate, Smite, Imp Teleport, Amplify Damage). La vie et les dégâts suivent l'échelle des monstres existants (0,0105 × vie D2, 0,013 × dégâts D2). Non repris : monstres des zones de carte (cartes PD2), uniques nommés de Levels.txt (`umon` = mêmes familles), `SuperUniques` hors boss. Positions : emplacements `monpreset` du DS1 utilisés seulement pour l'entrée et le boss ; les groupes sont tirés au hasard dans le terrain atteignable (les `place_group`, `place_unique_pack`… des DS1 ne sont pas lus).
