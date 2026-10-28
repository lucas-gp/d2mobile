# Audit complet — D2 Mobile vs Diablo II LoD 1.13 vs Project Diablo 2 (S13 « Betrayal »)

Date : 2026-10-06. Huit audits en lecture seule, chacun comparant le dépôt aux tables du jeu (MPQ + patch 1.13) et au wiki PD2 :
[objets](docs/internal/audit/01-objets.md) · [compétences](docs/internal/audit/02-competences.md) · [monstres](docs/internal/audit/03-monstres.md) · [monde et contenu](docs/internal/audit/04-monde.md) ·
[systèmes de combat](docs/internal/audit/05-systemes.md) · [fonctionnalités](docs/internal/audit/06-fonctionnalites.md) · [spécificités PD2](mods/pd2/docs/audit/07-pd2.md) · [technique](docs/internal/audit/08-technique.md).
Limites : S14 « Alliance » (23/10/2026) n'a pas de notes publiées (audit sur S13) ; les pages PD2 « Uber Bosses », « Corrupted Zones », « Item Filtering » sont vides sur le wiki ; les chiffres viennent de scripts de comptage, les points « confiance M » des rapports sont à confirmer avant correction.

## 0. État actuel (mis à jour après les lots 43 à 52, 2026-10-06)

Légende : ✅ fait · 🟡 partiel · ⬜ non fait · ⛔ écarté volontairement. Les sections 1 à 4 ci-dessous gardent le constat initial (avant les lots 43-52) ; leur état actuel est dans les tableaux de cette section.

### Synthèse par domaine

| Domaine | Avant | Maintenant | Ce qui a été fait (lots) | Ce qui manque |
|---|---|---|---|---|
| Objets | ~55 % | ~85 % | Uniques/mots runiques/bases PD2 (44), 1 086 affixes (44), noms des rares, éthéré, bases fusionnées (49), carquois PD2 : 6 bases, 12 uniques, 3 mots runiques, 27 affixes (50), propriétés PD2 restantes (49), durabilité/réparation/jeu d'argent (44) | endurance (⛔), compétences à charges, charmes « Sunder » à trancher (revu au lot 322 : carquois et propriétés d'uniques faits) |
| Compétences | ~70 % | ~85 % | Tables du wiki à 60 niveaux, refontes Barbare/Druide (44), Éclair sacré, Flèche explosive, Tir multiple (49), esquive/dérobade/parade en défense (43) | — (revu au lot 322 : Furie, Sacrifice, rythmes et marche/course faits ; Fendre n'existe pas) |
| Monstres | ~55 % | ~80 % | Rangs, élites, super-uniques, résistances, auras, malédictions, régénération (44) | Variantes d'immunité fines, modificateurs fixes (à vérifier), écarts d'échelle PV/dégâts d'Enfer (kits des boss de carte faits : `mods/pd2/data/map-boss-kits.ts`) |
| Monde | ~65 % | ~88 % | 27 quêtes et vraies récompenses, 22 sanctuaires, objets interactifs, fosses de l'acte V (44), niveaux de zone d'Enfer PD2 (43), lave infranchissable (42), arche des Anciens (52) | placement d'objets D2 partiel (revu au lot 322 : connexité corrigée, `campaign-reach.test.ts` passe) |
| Combat | ~50 % | ~90 % | Critique/frappe mortelle, zone de mêlée, résistances max 90, vol de vie, éthéré (43), IAS/WSM/FBR/FHR par classe (45, 47), absorption, poison, blessures ouvertes (45), mana (48), régén/MF/GF conformes (48) | Réduction de gel par difficulté (écartée : casse le bot), rythmes d'animation de quelques compétences |
| Endgame | ~35 % | ~75 % | Clone par Vision de la terreur, Anciens, Rathma/Mendeln, Lucion, Rôdeur des ténèbres (46), Vaches par recette (50), Autel du Catalyseur, héros corrompus (51) | Spire des ténèbres, Gheed, Oreille corrompue, phases du Clone et mécaniques propres Rathma/Lucion (⛔ voir ci-dessous) |
| Cartes | ~65 % | ~85 % | 29 zones, 46 affixes à effet réel, événements Autel et Invasion, recettes Éclat/Étendard (51) | affixes Avertissement/Éclaboussure, conversions élémentaires et Rapide à moitié des plages du wiki (choix pour le bot) |
| Mercenaires | ~60 % | ~85 % | 13 sous-types, stats par niveau, compétences tirées, MF, set, éthéré (44) | Auras PD2 écartées, gants/bottes/ceinture à vérifier |
| Technique | ~50 % | ~75 % | Hors ligne, quota de sauvegarde, gestionnaire d'erreurs (44), sauvegarde v5 avec migration (49), tests de combat, de connexité, du journal | perfs sur téléphone réel non mesurées, économie (revu au lot 322 : tests présents, bundle découpé en 40 morceaux) |
| UI / tactile | ~55 % | ~75 % | Glisser-déposer (40), Nouveautés (41), cibles 44 px (51), Jeter en un clic, zoom en %, comparaison d'équipement (52) | cases d'inventaire/coffre/Cube petites par défaut (revu au lot 322 : polices ≥ 11 px, « Grandes cases » en option, icône de carquois refaite) |

### Décisions volontaires (⛔)
- Boss PD2 **Anciens, Rathma, Lucion, Clone de Diablo** : laissés tels quels (recettes et apparition faites au lot 46), sans phases ni mécaniques propres, sur décision de l'utilisateur.
- **Endurance** : pas de jauge d'endurance dans le jeu.
- **Gheed, Spire des ténèbres, Oreille corrompue** : écartés au lot 46/51.
- Réduction de la durée de gel en Cauchemar/Enfer : non appliquée (le bot de froid ne passe plus le palier 2).
- Régénération de mana en 40 s au lieu de ~120 s D2 (60 s cassait les bots) ; potions en % de la réserve.
- Pénalité d'XP adoucie avant le niveau 25 : annulée (bot de progression).
- Hors périmètre : ladder, multijoueur, PvP, Hardcore, échanges.

#### Confort mobile gardé volontairement (audit de la campagne du 26/10/2026, lot 321)

Écarts avec Diablo II conservés parce qu'ils servent le jeu au doigt sur téléphone (gravité « C » de l'audit) ; ils ne sont pas à « corriger » :

| Élément | Où | Pourquoi le garder |
|---|---|---|
| Joystick, bouton d'action contextuel, pages de 4 compétences, bouton Téléportation | `hud.ts` | Pas de souris : indispensable sur téléphone |
| Visée automatique (portée + 2, ligne de vue, élites d'abord), approche automatique en mêlée | `targeting.ts`, `controls.ts` | Remplace le clic sur la cible |
| Or ramassé automatiquement (rayon 2,2) | `loot/filter.ts` | Comme D2R ; toucher chaque tas d'or est pénible |
| Étiquettes au sol toujours visibles, un toucher pour ramasser | `controls.ts` | Pas de touche Alt sur téléphone |
| Pause pendant les panneaux plein écran (inventaire, coffre, marchand, dialogue) | `app.ts` | Le panneau couvre tout l'écran |
| Potions en % du maximum, rapides, avec une courte recharge ; boutons de potion tactiles | `world.ts`, `hud.ts` | Décidé avec les bots ; pas de touches 1-4 au doigt |
| Barre de cible en haut (nom, immunités, modificateurs) ; dialogue PNJ Parler / action / Au revoir | `hud.ts`, `npcdialog.ts` | Fidèle à D2 |
| Rachat chez le marchand | `panels-inventory.ts` | Erreur de toucher fréquente sur téléphone |
| Filtre de butin, piles de runes et de gemmes dans le coffre | `panels-filter.ts`, `inventory.ts` | Fidèle à PD2 ; acceptable en base |
| Objets tombés déjà identifiés, pas d'identification chez Cain | `app.ts` | Choix de fait |
| Plan de zone fixe par personnage (`hashSeed(nom:zone)`) | `game.ts` | Pas de régénération de carte en partie courte |
| Pas d'endurance | — | Décidé (voir plus haut) |
| Changement de difficulté depuis le point de passage | `panels-world.ts` | Pas d'écran « créer une partie » sur mobile |
| Pas de cinématiques entre les actes | — | Contenu Blizzard, hors périmètre |
| Comparaison avec l'objet porté, marqueur « amélioration », tri, « Tout au coffre », recherche, « Vendre les ordinaires », livre du Cube | `panels-inventory.ts`, `itemtext.ts` | Aides de lisibilité sur petit écran |
| Recrutement depuis l'onglet Mercenaire en ville (limité aux mercenaires de la ville depuis le lot 321) | `panels-hero.ts` | Pas besoin de marcher jusqu'au capitaine |

Décisions du propriétaire prises avec l'audit (lots 316 à 321) : pas de portail de ville par Tome ni parchemin dans la campagne ; réglages par
défaut inchangés (butin « Abondant », réinitialisation gratuite, sac 10 × 8, potions qui suivent le niveau) ; expérience du jeu pd2 inchangée ;
une mort ne coûte que de l'or (pas de cadavre) ; le Champ de pierres rejoint le Bois sombre par le Passage souterrain.

### Priorités de la section 2, état actuel

| # | Point | État |
|---|---|---|
| 1 | Niveaux de zone d'Enfer PD2 | ✅ lot 43 (35 zones + 4 runs) |
| 2 | Potion de rajeunissement | ✅ lot 43 |
| 3 | Montée de niveau 100 %, palier de potion | ✅ lot 43 |
| 4 | Esquive, dérobade, évitement, parade | ✅ lot 43 (Épée sacrée : à vérifier) |
| 5 | Combat PD2 (zone, frappe mortelle, rés. max 90, vol de vie, blessures, éthéré) | ✅ lots 43, 45 |
| 6 | Diviseurs de difficulté, absorption | 🟡 vol de vie et absorption faits (43, 45) ; gel ⛔ |
| 7 | Dégâts Force/Dextérité par arme | ✅ lot 43 |
| 8 | Mana par niveau | ✅ lots 43, 48 |
| 9 | Valeurs d'uniques et dégâts d'armes PD2 | ✅ lot 44 (nouvelle vérification par échantillon conseillée) |
| 10 | Mots runiques et uniques manquants | ✅ lot 44 ; carquois ✅ lot 50 |
| 11 | Compétences (×2, Barbare, Druide, poison) | ✅ lot 44 ; Furie/Sacrifice et rythmes ✅ (`rhythm.ts`) |
| 12 | Résistances de monstres, échelle par rang | ✅ lot 44 (calibrage des boss d'Enfer à revérifier) |
| 13 | Modèle d'affixes PD2 | ✅ lot 44 (1 086 lignes) |
| 14 | Quêtes, sanctuaires, objets D2 | ✅ lot 44 ; connexité ✅ (`campaign-reach.test.ts`, lot 322) |
| 15 | Chaîne du Pandémonium PD2 | ✅ lots 44, 46 |
| 16 | Mods d'élites, super-uniques, auras/malédictions de monstres | ✅ lot 44 ; kits des boss de carte ✅ (`map-boss-kits.ts`) |
| 17 | Durabilité, réparation, jeu d'argent, identification, charges | ✅ lot 44 sauf ⬜ charges ; marchands et identification à vérifier |
| 18 | Cube (Bâton, Khalim, Vaches, artisanat) | ✅ lots 44, 46, 50 |
| 19 | Endgame PD2 (cartes, affixes, événements, ubers, Clone, carquois) | ✅ lots 46, 50, 51 ; ⛔ mécaniques propres des boss ; ⬜ Spire, Gheed |
| 20 | Mercenaires PD2 | ✅ lot 44 |
| 21 | Technique (hors ligne, quota, erreurs) | ✅ lot 44 ; tests ✅ ; ⬜ perfs sur téléphone réel |
| 22 | Tactile / tailles | 🟡 lot 51 (boutons 44 px) ; polices ≥ 11 px ; cases d'inventaire 🟡 (« Grandes cases » en option, désactivé par défaut) |

## Compétences PD2 : audit comportement (lots 73-79)

Les 7 classes ont été vérifiées compétence par compétence contre le wiki PD2 (comportement, pas seulement les chiffres) : Sorcière 33, Nécromancien 33, Druide 31, Amazone 29, Assassin 31, Paladin 33, Barbare 29 ; détail et colonne « conforme ? » dans `audit/skills-pd2-<classe>.md`, tests `tests/unit/skills-pd2-<classe>.test.ts`. Restent supposés/non faits : IA des ombres de l'Assassin faite (lot 85 ; reste : buffs du Maître, Sentinelle des lames, Envol du dragon), cris de groupe pour le mercenaire, plusieurs rayons/nombres non donnés par le wiki (voir chaque fichier).

## Reste à faire (priorisé, revu au lot 322 le 27/10/2026)

Chaque point a été vérifié contre le code, les tests et un build au lot 322 ; ce qui a été fait depuis l'audit est listé à la fin.

1. **P1, tactile** 🟡 : les polices des panneaux D2 restent ≥ 11 px à l'écran (`font-size: calc(11px / var(--k))`, `style.css`) et
   « Grandes cases » (Réglages, `bigCells`) donne des cases ≥ 37 px, mais ce réglage est désactivé par défaut (« Auto » vaut « Non » : le
   panneau agrandi débordait de l'écran sur mobile). Par défaut, une case de 28 px suit l'échelle du panneau (plancher 0,6, 0,4 en vue
   Coffre / Marchand : `d2Layout`, `src/ui/panels-shared.ts`), soit 11 à 17 px sur petit écran. Reste : des cases utilisables au doigt sans
   réglage. Effort M.
2. **P2, mesure sur téléphone réel** ⬜ : aucune mesure d'images par seconde sur un vrai téléphone (SwiftShader et Chromium sans tête
   seulement). Le bundle n'est plus d'un seul morceau : 40 fichiers JS, 4,5 Mo au total (mod pd2, Survivals, worker D2 local et traduction
   anglaise compris), le plus gros 754 Ko (182 Ko gzip), mesuré le 27/10 avec `D2_SPRITES=0 npx vite build`. Effort M.
3. **P3, objets** ⬜ : compétences à charges (aucune propriété de charge dans les objets) ; endurance ⛔ (pas de jauge). Effort M.
4. **P3, endgame** ⬜ : affixes de carte Avertissement et Éclaboussure (absents de `mods/pd2/data/maps.ts`). Spire des ténèbres, Gheed et
   Oreille corrompue sont ⛔ (lots 46 et 51, voir « Décisions volontaires »). Effort M.
5. **P3, économie** ⬜ : 7 builds sur 18 injouables en cartes d'Enfer (mesure de l'audit, pas refaite) ; charmes « Sunder » (D2R) gardés et
   comptés contre les immunités (Survivals sur pd2, lot 284) sans décision écrite du propriétaire. L'expérience de pd2 reste inchangée par
   décision du propriétaire (lot 321) : l'écart ×3,3 à ×18,6 avec D2 relevé par l'audit est assumé. Effort M.

Fait depuis l'audit (vérifié au lot 322) :

- **Connexité des cartes** ✅ : `tests/unit/campaign-reach.test.ts` passe sur les 130 cartes du lot 322 (objets et sorties de chaque zone
  de campagne atteignables à pied depuis le départ, dont a2_lostcity, a2_tomb4, a3_flayer2, a4_river et a5_river ; `a2_arcane` exclu par
  conception : plateformes reliées par téléportation), ainsi que `d2-passable.test.ts` et `spawn-reach.test.ts`.
- **Tests** ✅ : `ai.test.ts`, `missiles.test.ts`, `targeting.test.ts`, `renderer-pure.test.ts`, `render-engine.test.ts`,
  `audio-engine.test.ts`, `controls-keys.test.ts` (15 à 22 cas chacun), `classes-data.test.ts` ; `panels*` importés par 4 fichiers de test.
- **Compétences** ✅ : le Sacrifice fait exploser les monstres tués, la Furie frappe les voisins ; rythmes Zèle / Furie / Mitraille /
  Frénésie (`rhythm.ts`) ; marche et course distinctes (touche R, bouton du HUD). Fendre n'existe pas dans le jeu.
- **Objets** ✅ : artisanat de carquois au Cube, armes et carquois au jeu d'argent, nouvelle icône de carquois, carquois du mercenaire
  (`src/sim/merc-core.ts`), propriétés d'uniques supplémentaires actives.
- **Kits de boss** ✅ pour les boss de carte (`mods/pd2/data/map-boss-kits.ts`, `mods/pd2/sim/map-boss.ts`).
- **P4, données** ✅ : Myth/Hel corrigé (Hel reqLvl 0) ; sets Expansion / McAuley's = faux positifs (séparateur + id `s_sanders_paragon`) ;
  11 bases = 6 potions de jet ajoutées (sans mécanisme de lancer) + 5 écarts de noms.

---

## 1. Couverture mesurée (constat initial, avant les lots 43-52)

| Domaine | Couverture | Détail |
|---|---|---|
| Zones (Levels.txt) | 98 % (133/136) | manquent Abaddon, Fosse d'Achéron, Fosse infernale (acte V, portails rouges) |
| Points de passage | 100 % (39/39) | 1 mal placé |
| Villes / PNJ | 5/5 · 33/~36 | 8 services sur 13 |
| Quêtes | 56 % (15/27) | 12 absentes, récompenses souvent fausses |
| Sets | 100 % (32/32, 131 pièces) | 53 lignes de bonus PD2 non applicables |
| Uniques | 84 % présents (371/442) | **60 % des valeurs encore en 1.13 (225/374 modifiés par PD2)** ; 71 absents dont 12 carquois |
| Mots runiques | 79 % (80/99 distincts) | 19-21 PD2 absents (valeurs maintenant publiées) |
| Affixes magiques/rares | ~15 % (172 vs ~1140) | pas d'AR, dégâts plats, épines, procs, dégâts contre morts-vivants/démons… |
| Bases d'équipement | 98 % en présence | dégâts d'armes PD2 corrects sur 34 % seulement ; carquois 0 |
| Compétences | 100 % présentes, 94 % D2 | dégâts exacts 36 % (22 compétences à ×2, Barbare/Druide non refondus) |
| Monstres (espèces de combat) | 78 % (72/92) | 122/594 résistances fausses ; 2 variantes d'immunité sur 562 |
| Super-uniques | ~94 % placés | aucun avec ses modificateurs fixes |
| Compétences de monstres | ~10 % (6 types d'attaque génériques vs 118) | aucune malédiction/aura de monstre (hors Holy Freeze) |
| Cube | 73 % (106/146 lignes D2), ~50 % PD2 | 4 familles d'artisanat sur 7 |
| Cartes PD2 | 65 % (24/37), affixes 33 % (16/48), événements 25 % fidèles | |
| Ubers/endgame PD2 | ~35 % | Ancients, Rathma, Lucion, Vision de la Terreur absents ; DClone aléatoire 1/40 |
| Sanctuaires (shrines) | 18 % (4/22) | |
| Mercenaires | présents (5 actes) | variantes D2, auras écartées de PD2 |
| Niveaux de zone Enfer PD2 | 62-65 % alignés | 29-43 zones restées en 1.13 |

## 2. Priorités transversales (ordre conseillé)

Effort : S < 1 j, M 1-3 j, L > 3 j.

### Niveau 1 — correctifs de fidélité à fort effet, peu coûteux
1. **Niveaux de zone Enfer PD2** (29-43 zones) : S — donne le bon TC (champions 87, uniques 88), c'est l'identité du farm PD2.
2. **Potion de rajeunissement inutilisable par le joueur** (HUD et contrôles ne gèrent que soin/mana) : S — bug de jeu.
3. **Montée de niveau : 30 % au lieu de 100 %** vie/mana ; ramassage de potion de palier élevé qui remonte tout le tas (`inventory.ts:207`) : S.
4. **Esquive / Dérobade / Évitement (Amazone), parade (Assassin), Épée sacrée** : calculées mais jamais lues en défense — compétences inertes : S-M.
5. **Combat PD2** : frappe en zone par défaut sur toutes les armes de mêlée (nous 25 %, seulement avec une stat), frappe mortelle ×1,5 séparée du critique ×2, résistances max 90 (nous 95), vol de vie réduit (distance, difficulté ÷2/÷3), blessures ouvertes cumulables, éthéré +25 % (nous +50 %) : M.
6. **Diviseurs de difficulté** (vol de vie/mana, gel) et **absorption** (soigne ET réduit : à confirmer) : S.
7. **Dégâts de force/dextérité par type d'arme** (arcs 50 % dex…) : S.
8. **Mana par niveau des classes** (Amazone/Assassin/Paladin 2, Barbare 1,5) : S.

### Niveau 2 — données PD2 à appliquer (scripts, comme les sets)
9. **Valeurs d'uniques PD2** (225 modifiés) et **dégâts d'armes PD2** (122/186 bases) : L — extraction du wiki « After » comme pour les sets.
10. **19-21 mots runiques PD2 manquants** : M. **68-71 uniques manquants** : M.
11. **Compétences** : corriger le ×2 de 22 sorts (le bot est calibré dessus : à recalibrer), extrapolation > niveau 20 (-12 %), refonte Barbare (0 synergie sur 27/29), Druide (15/17 divergentes), échelle du poison : L.
12. **Résistances de monstres** (122 fausses) et variantes d'immunité (2/562) : M. **Échelle PV/dégâts par rang et difficulté** (boss d'Enfer ×1,6 à ×7 trop forts, Cauchemar ×0,4) : M.
13. **Modèle d'affixes PD2** (172 → ~1140, nombre d'affixes des rares par ilvl, pointmods/staffmods) : L — tout le butin magique/rare en dépend.

### Niveau 3 — contenu manquant
14. **Quêtes** (12) et leurs vraies récompenses (imprégnation = Tools of the Trade, perçage Larzuk, jeton…), **sanctuaires** (18 effets), **placement d'objets D2 d'origine** (obj.txt manquant) : L.
15. **Chaîne du Pandémonium PD2** (clés/organes/essences inversés, Talisman, Jeton d'absolution sans recette), niveaux d'uber 85 : M.
16. **Mods d'élites** (Aura Enchanted, Fanatic, Possessed, Berserk, Ghostly ; `cursed` inerte), **modificateurs fixes des super-uniques**, **kits de boss**, **auras et malédictions de monstres** : L.
17. **Durabilité et réparation, gambling, marchands différenciés, identification, objets à charges** : M-L chacun.
18. **Cube** (40 lignes D2 : Horadric Staff, Khalim, portail des Vaches, rajeunissement, réparation) et **artisanat Hitpower/Vampiric/Bountiful** : M.
19. **Endgame PD2** : 13 cartes, 32 affixes de carte, événements, Uber Ancients, DClone (Vision de la Terreur), Rathma, Lucion, carquois (12 uniques, 3 RW) : L.
20. **Mercenaires PD2** (Éclaireuse Physique, Garde du désert 3 sous-types, Ascendants Horadrim, gants/bottes/ceinture) : M.

### Niveau 4 — robustesse et qualité (voir [technique](docs/internal/audit/08-technique.md))
- Hors ligne **faux** pour les packs de contenu du mode chiffré (le service worker ne met pas `/d2/*.enc` en cache), **sauvegarde sans alerte de quota**, **aucun gestionnaire d'erreurs global** : S-M, P0 technique.
- Pas de tests pour `ai.ts`, `missiles.ts`, `targeting.ts`, les cinq classes (~1 800 lignes), `panels.ts`, `controls.ts`, `renderer.ts`, `audio.ts`.
- Performances jamais mesurées sur téléphone (SwiftShader seulement) ; bundle JS 1,55 Mo en un chunk ; cases d'inventaire ~20 px sur petit écran, polices 7,5-9 px.
- Économie : XP ×3,3 à ×18,6 vs D2, or sans puits (ni durabilité ni réparation), 7 builds sur 18 injouables en cartes d'Enfer.
- Données : Myth/Hel avec niveaux requis incohérents, sets Expansion et McAuley's Paragon, 11 bases dont les potions de jet.

## 3. Points non pertinents ou volontaires
Ladder/saisons, multijoueur, PvP, Hardcore, trading entre joueurs : hors périmètre solo mobile (à décider). Les charmes de brisure (« Sunder ») sont une mécanique D2R, **absente de PD2** mais présente ici : à retirer ou à assumer.

## 4. Déjà au niveau
Charstats des 7 classes (0 écart), table XP, paliers FCR/FHR, formules de toucher/blocage/défense, résistances par difficulté, malédictions, 33 runes/35 gemmes, sets D2+PD2 avec infobulle actif/inactif, corruption (tables et probabilités), cartes T1-T4 et 8 cartes uniques, 39 points de passage, 5 villes, 133/136 zones jouables, mercenaires, filtre de butin, coffre D2R, cube en grille.
