# 08 — Qualité technique et équilibrage du jeu tel que livré

Dépôt le dépôt (HEAD 46f27dc). Lecture seule ; scripts jetables dans scripts jetables (non conservés).
Mesuré : `tsc --noEmit` = 0 erreur ; `vitest --project unit` = 39 fichiers, 606 tests verts (27 s) ; les 7 audits de `tools/audit/` (équivalent de run-all.ts, sorties redirigées vers tmp-08 pour ne rien écrire dans le dépôt) ; E2E/bots lus dans `test-results/` (4-5 oct.).

## 1. Résumé chiffré

| Axe | Mesure | Verdict |
|---|---|---|
| Code | 157 fichiers .ts / 40 879 lignes ; 0 TODO, 0 `any`, 0 `@ts-ignore` ; mais `bot/brain.ts` 2425 l., `render/renderer.ts` 2226 l., `ui/panels.ts` 2130 l., `sim/game.ts` 1170 l. | Propre, 4 fichiers monolithiques |
| Tests | 606 unitaires (253 `it(` dans 39 fichiers + paramétrés) + 4 suites bots (minutes) + E2E Chromium 5 appareils | Bonne base sur loot/items/cube/runs ; trous §3 |
| Bundle | `index-*.js` 1,55 Mo (451 Ko gzip), 1 seul chunk applicatif ; `public/sprites` 29 Mo | JS correct |
| Mémoire textures | lo 26,5 Mo mesuré (E2E) ; Baal 55,9 → 81,8 Mo (BACKLOG 9) ; budget 128 Mo hi / 40 Mo lo | OK sur le papier, jamais mesuré sur téléphone |
| FPS | SwiftShader : médiane 33-83 ms, p95 83-167 ms, pire 450 ms — non représentatif (aveu dans docs/internal/TEST-MOBILE.md) | **Inconnu** (BACKLOG 7 ouvert) |
| Sauvegarde | v4, 3 migrations, backup à chaque écriture ; ~9-11 Ko par personnage (testchar niveau 99, ville/run) | Robuste ; 3 trous §4 |
| Données générées | Bases 488/499 appariées ; uniques 377/385 ; sets 128/131 ; runewords 77/78 identiques ; XP : 1 écart sur 99 niveaux (niv. 99 = artefact de borne) ; difficultés 3/3 conformes ; classes 7/7 conformes | Cohérent ; voir §5 |
| Traduction | `en.json` 3 678 entrées, 0 vide ; balayage de 2 341 chaînes FR littérales (hors commentaires) : 16 non traduites, soit 99,3 % | Très bon ; trous §8 |
| Tactile | HUD : 5 appareils sans écart (cibles ≥ 40 px, attaque 78 px) ; panneaux non mesurés | Trou §7 |

## 2. Dette technique (par gravité)

1. **Pas de découpage du bundle** : données (≈ 15 000 lignes de `src/data`, `en.json` 193 Ko, 3 679 lignes JSON) dans l'unique chunk 1,55 Mo. Parsing/évaluation à froid sur mobile moyen de gamme : non mesuré. Effort M (import dynamique des zones, de `en.json`, des tables d'uniques/sets).
2. **Fichiers monolithiques** : `brain.ts` (bot, 2425 l.), `renderer.ts` (2226), `panels.ts` (2130). `panels.ts` n'a aucun test et ne s'exerce qu'en E2E. Effort M chacun.
3. **Traduction par observateur DOM** (`MutationObserver` + regex de gabarits triés ; `tr()` avec cache vidé à 6 000 entrées) : coût CPU à chaque mutation, fragile pour les phrases composées (voir §8). L'anglais est la langue **par défaut** alors que tout le code est en français : les noms de clé sont des phrases françaises, donc toute retouche de texte FR casse silencieusement l'EN.
4. **Pas de gestionnaire d'erreurs global** : aucun `window.onerror` / `unhandledrejection` dans `src` ; 42 `catch {}` muets contre 6 `catch (e)`. Une exception dans la boucle de rendu ou de sim se manifeste par un écran figé, sans trace ni message au joueur. Effort S.
5. **Quasi aucune télémétrie de santé** : l'overlay perf existe (`?bench=1`) mais rien ne remonte au développeur. La validation « téléphone réel » dépend de retours manuels (notes locales, non versionnées).
6. **Graine RNG dérivée de l'état affichable** : `cube`, `cubegrid`, `socket`, `imbue`, `buy` sont seedés par (recette, niveau, runCounter, **or**, uid…) (`game.ts` 864-937, 1071). Déterministe, donc le résultat d'un artisanat peut être modifié en changeant l'or (acheter une potion) avant de transmuter : exploit de prévisualisation/reroll (mineur, pas de rollback requis). Effort S (graine + compteur de sauvegarde non-observable).
7. **Compteur d'uid remis à 0** (`Game.resetIds`, `item.ts` 46-55) : l'uid = graine base36 + compteur. Les collisions exigent la même graine ; risque faible mais `audio.ts` et `bot/runner.ts` retrouvent les objets au sol par `uid ===`. Effort S.
8. **Aucune règle de lint/format imposée** hors `tsc` (pas d'ESLint dans package.json).

## 3. Tests : couverture par domaine

Mesure : pour chaque fichier de `src`, recherche d'un import dans `tests/` — **70+ fichiers sans test dédié**. Les plus gros :

| Domaine | Couvert | Non couvert directement |
|---|---|---|
| Butin / items / affixes / filtre | items, crafting, filter, integrity, set-bonuses, stat-effects (38 cas), procs, materials | `data/items/uniques-d2`, `sets-d2`, `runewords-pd2`, `sizes-d2` (seulement intégrité globale) |
| Cube / sockets / artisanat | crafting, bot-cube, quests-imbue | `sim/socket.ts` |
| Combat / compétences | combat, skills, skill-migration, teleport, druid (797 l.), merc | **`ai.ts` (532 l.), `missiles.ts` (462 l.), `targeting.ts`, `amazon/assassin/barbarian/paladin/necromancer.ts` (≈ 1 800 l. de règles de classe), `mindcontrol.ts`, `breakpoints`, `minions`** |
| Zones / runs / cartes | zones, runs, maps, portals, world, farm-bosses | `data/zones/*` (act1-5, chaos, baal, d2farm…) sauf génération ; `mapmods.ts` |
| Sauvegarde | testchar (aller-retour), skill-migration | **`platform/platform.ts` (SaveStore : backup, quota, import/export), `packs.ts`, `sw-template.js`** : 0 test |
| Interface / rendu / entrées / audio | E2E Chromium (HUD, joystick, inventaire, filtre) ; changelog, i18n (6 cas) | `panels.ts`, `hud.ts`, `controls.ts` (595 l.), `renderer.ts`, `audio.ts` (833 l.), `dragdrop.ts` : 0 test unitaire |
| i18n | 6 cas (gabarit, segments, marqueurs `{x}`) | Aucun test de **couverture** (clés manquantes) |

Bots : progression (4 graines), loot, combat, endgame (3 graines, médiane < 70 %, plafond 85 %). Résultats d'endgame Froid : 35 / 59 / 56 % de morts par run — le seuil de test (70 %) est large ; critère BACKLOG n°13 visé ≤ 15 % uniquement sur zones « jouables ».

**Test manquant le plus rentable** : un test « tous les textes FR d'un panneau ont une clé EN » (script de ce rapport, tmp-08/i18n.ts, 30 lignes) ; un test de SaveStore (quota, JSON corrompu, import).

## 4. Robustesse

OK : sauvegarde au `visibilitychange` (y compris en run), à `pagehide`, toutes les 30 s ; copie `.backup` ; `load()` retombe sur le backup ; migration versionnée qui refuse une version future ; SW qui ne renvoie jamais de HTML pour un JSON ; reprise de run (monstres, objets au sol) ; repli sur le sprite d'origine si une planche D2 est illisible ; reconnexion en ville / déblocage mur (derniers commits).

Trous (tous vérifiés dans le code) :

| # | Constat | Gravité | Effort |
|---|---|---|---|
| R1 | `SaveStore.save()` renvoie `false` sur quota/exception mais `saveNow()` (`app.ts` 616-621) **ignore le résultat** : aucun avertissement au joueur ; pas de `navigator.storage.persist()` ni `estimate()` (iOS peut purger localStorage hors PWA après 7 j d'inactivité) | P0-robustesse | S |
| R2 | Le backup est une **copie de l'écriture précédente sans validation** : si le principal est corrompu puis réécrit, la copie saine est écrasée (2 sauvegardes ratées = perte des deux) | P1 | S |
| R3 | Mot de passe D2 stocké en clair dans localStorage (`D2_PASS_KEY`), pas de rotation | P2 | S |
| R4 | Le SW ne met en cache que `/sprites/` et `/assets/` (`sw-template.js` 56). En mode chiffré (chargeur optionnel `D2_REMOTE`), les fichiers `/d2/*.enc` ne reposent que sur le cache HTTP du navigateur ; les packs de contenu (`packs.ts`) promettent « jouer hors ligne » mais ne font qu'un `fetch` + `arrayBuffer()` jeté. Sur iOS (cache HTTP volatil, quota Cache API ≈ 1 Go) le pack peut être purgé sans que `packState` le sache ; hors ligne : 503 puis repli sur les sprites d'origine | **P0 si hors ligne annoncé** | M-L |
| R5 | `downloadPack` : pas d'annulation, pas de contrôle d'espace, tailles `mb` codées en dur, 4 téléchargements parallèles, `catch(() => 0)` qui compte un échec comme réussi → `markPack` marque le pack « téléchargé » même avec fichiers manquants | P1 | S |
| R6 | Cube : `pay()` et la suppression des ingrédients précèdent `addToCharacter(material)` ; si ce dernier échoue, `return {ok:false}` **après** consommation (`cube.ts` ~315-320) ; `craft` : `findIndex` peut valoir -1 → `inventory[-1] = null` (joyau non consommé) | P2 (rare) | S |
| R7 | Auto-ramassage : or seul (`filter.ts` 85) — pas de boucle d'événements « Inventaire plein ». OK | — | — |
| R8 | Migrations : SAVE_VERSION 4 alors que druide, mercenaire, quêtes, coffre partagé, pandémonium ont été ajoutés ; la compatibilité repose sur des `??=` dispersés plutôt que sur des migrations. Aucune sauvegarde ancienne de référence en test | P1 | M |
| R9 | `heal()` (Malah) : commentaire « payant » mais **gratuit** et sans cooldown — voir §6 | P1 équilibrage | S |

## 5. Cohérence des données générées (tools/audit)

- **Bases** : 488 appariées, 11 absentes : Cap/hat, Demon Head, Hunter's Guise, Blood Spirit (pelt id différents), Hunter's Bow, 6 potions de jet (Oil, Gas, Exploding, Fulminating, Choking, Strangling, Rancid : aucune grenade dans le jeu). Écarts de champs : 160 `reqLvl` (1 chez nous, 0 en D2 — bénin), 10 `defense` (ex. Breast Plate 56-58 vs 65-68 D2, voulu PD2), 7 `maxSockets`, 6 `block`.
- **Runes** : 12 effets rune × emplacement différents de Gems.txt (Eld/Nef/Shael/Mal/Sur sans effet armure/bouclier, Dol, Um, Pul = écarts PD2) ; **Hel : reqLvl 33 chez nous vs 0** ; **Myth** : niveau requis 25 < niveau de sa rune la plus haute (33) → objet équipable avant que sa recette soit possible, incohérent ; 19 runewords < 50 % de valeurs D2 en commun (Enigma 2/6, Stone 1/6, Chaos 1/9, The Beast 1/8, Peace 1/4…) — attendu pour PD2 mais non vérifié contre PD2 (wiki 403).
- **Uniques** : 377 appariés / 385 activés ; absents : War Bonnet, Amulet of the Viper, Staff of Kings, Horadric Staff, Hell Forge Hammer, KhalimFlail, SuperKhalimFlail, Cerebus… (objets de quête : normal). 19 uniques < 60 % de valeurs communes (Blacktongue 2/5, Warpspear 2/5, Wisp 2/9, Rainbow Facet ×4, Hellfire Torch 3/6). Bases d'unique différentes : Witherstring, Radimant's Sphere, Gheed/Annihilus/Torch (charmes PD2 : voulu). 4 uniques « sunder » sans ligne D2 (PD2).
- **Sets** : 128 D2 vs 131 nôtres ; pièces absentes : **Expansion** (bonus de Berserker), **McAuley's Paragon** ; 19 pièces < 60 % de valeurs communes (Arcanna's Head 0/3, Hsarus 1/2, Tancred's Skull 1/2, Isenhart's Parry 1/3…) — l'écart Tal Rasha est volontaire PD2 ; le reste n'est pas expliqué dans mods/pd2/docs/SETS-PD2.md.
- **Monstres** : 92 familles D2 = 92 nôtres ; 594 résistances comparées, **122 écarts** (21 %) ; 16 niveaux de boss sur 36 divergent (Andariel Enfer 85 vs 75 ; Nihlathak 44/67/86 vs 65/70/92 ; Ancien Talic, Uber Izual 99 vs 110). Exemples : Nihlathak Enfer froid 100 vs 70, Squelette-mage poison 100 vs 50-75, Conseil/Council Member Enfer 0 partout vs feu 120. Zones : Tristram 16/39/82 vs 6/39/76 ; Eldritch 37 vs 25 ; Pindleskin 38 vs 32 ; Nihlathak 44 vs 36 ; Anciens 45 vs 37 (niveau normal) — choix de design pour les boss de farm A5 (BACKLOG 37 « niveaux de boss de farm A5 » ouvert).
- **Trésors** : classes de monstres (normal/caster/champion/unique/boss/Andariel/Mephisto/Countess) **identiques à D2** ; récursion des TC de runes 0 écart ; mais Cow King sans TC dédié (TC « boss » générique 7 picks, noDrop 15 vs D2 5 picks noDrop 0, u/s/r/m 850/983/983/1024) ; Pindleskin/Eldritch/Shenk/Nihlathak sans TC propre (TreasureClassEx non lu).
- **Compétences** : 219 vs 183 appariées (36 sans équivalent : Hydre mineure, Combustion, Cold Enchant, Ice Barrage, Gust, formes de druide…) ; 51 écarts de niveau requis (tous « PD2 connus »), 62 de prérequis (2 à vérifier), **76/146 mana différents dont 13 « à vérifier »** (Inferno, Arctic Blast, Volcan…, listés BACKLOG 37) ; 1 recharge. FCR : formule D2 reproduite pour 5 classes sur 7 (Druide/Assassin non) ; **FHR non reproduit pour aucune**, IAS simplifiée `max(6, base − floor(IAS/15))` : pas de rendements décroissants → un joueur très IAS dépasse D2 (6 images = limite quasi illimitée atteinte à 150 % IAS).

## 6. Équilibrage

**Courbe d'XP** : table D2/PD2 exacte (Experience.txt), ExpRatio 70-99 exact, pénalité de mort 0/5/10 % exacte. Mais `RATES.xp = 3.0` × `xpCurve` 1,1 (niv. 1) → 6,2 (niv. 90) : **×3,3 à ×18,6 l'XP D2**. Cible déclarée : cartes en 1 h 30-2 h. Conséquence : le niveau 99 (3,5 milliards d'XP) est atteignable en dizaines d'heures au lieu de centaines ; le contenu 1-60 passe vite (progression bot : niveau 16 en 13-27 min). Cohérent avec « sessions courtes mobiles » mais à valider avec un joueur humain ; aucune mesure de niveaux/h au-delà de 90.

**Butin** : `quality.unique/set ×3`, `rare ×1,6`, `runes ×10`, `good ×2`, `noDrop ×0,55`, `maps ×2,5`, `gold ×1,5`. Runes hautes bornées par `highRuneBias 0,15` : ~1 rune Vex+ par ~27 h (le BACKLOG n° 6 dit « ~12 h », le commentaire de `rates.ts` « ~27 h » : documentation divergente).

**Or (économie) — faiblesse majeure** :
- Sources : or de monstres `ilvl × U(1-4) × mul × 1,5 × early`, vente d'objets `price × q/4 + ilvl×3` — le terme **`ilvl × 3` fixe fait qu'un objet blanc d'ilvl 85 vaut ≥ 255 or même bon marché** ; `sellCommon()` vend en un clic tous les blancs/inférieurs.
- Puits : potions `max(25, niveau×6)` l'unité (niv. 99 : 594 or), clés 50, mercenaire, marchand (stock × 5-6 le prix de vente). **Pas de réparation, pas de durabilité** (aucune occurrence de `durab`), `heal()` gratuit, pas de jeu de hasard (Gheed absent), pas de prix des runewords/gemmes, pas d'imprégnation payante, `c.gold` **sans plafond** (D2 : 10 000/inventaire, 2,5 M coffre). L'or devient inutile au-delà des premières heures ; aucun test d'économie (hors bot butin).
- Vendeur : stock déterministe `vendor:${runCounter}:${level}` (se rafraîchit à chaque run, pas de limite) — pas d'exploit d'achat/vente rentable (achat = vente × 2 à 6), mais **aucun puits d'or** pour l'endgame. Pas de rachat (buy-back) : vente accidentelle irréversible (`sell()` sans confirmation).

**Difficulté par niveau** (bots) :
- Normal : arène « normaux ×1,4 TTK, champions ×1,1 » ; Cauchemar ×0,8/×0,5 ; Enfer uniques ×1,9 (médiane), 2 morts/135 pour le Druide, 0 mort/15 pour le Froid.
- Cartes d'Enfer, 6 h de farm (BACKLOG 32) : feu 8 %, zèle 11 %, marteau 10 %, arc 15 % ; **tourbillon 38 %, javelot 44 %, froid 54 %, arts martiaux 61 %, frénésie 65 %, poison 72 %, pièges 75 %** de morts (objectif ≤ 30 %). Sur 18 builds, **au moins 7 sont dans un état non jouable en endgame** (BACKLOG 24, 29, 31, 32 ouverts).
- Baal Enfer : Feu 0/3 sans mercenaire (« seigneurs venimeux immunisés feu ») ; Chaos Enfer Feu 0/3 → 2/3 avec mercenaire. Les immunités sont donc le goulet : sans charmes de brisure (3-15 % par boss) ni Conviction/Lower Resist « ½ contre immunisés » (non implémenté).
- Écart d'efficacité entre builds : TTK normal Foudre 1,28 s / Froid 1,44 / Feu 0,84 — Feu 1,7× plus rapide que Foudre ; synergies Foudre gonflées à 14 %/niv. (PD2 : 8 %) pour compenser. **Mutilation → Onde de choc 15 → 25 %/niv.** et ours-garou 15 → 13 images : autres compensations non-PD2.
- Le seuil d'endgame test (`deaths < 70 %`) accepte 6 morts sur 10 cartes : trop tolérant pour garantir un équilibre.

## 7. Performances et accessibilité mobile

- **Chargement initial** : 1,55 Mo JS + 29 Mo sprites (pré-cache SW en arrière-plan) + en mode chiffré optionnel, le manifeste D2 puis les planches et cartes au premier usage. Les cartes et planches d’une zone se chargent à la première visite : latence de zone non mesurée sur 4G. Chiffrement par PBKDF2 (itérations lues dans `index.json`) au démarrage : coût CPU mobile non mesuré.
- **Packs** : 6 packs aux tailles `mb` codées en dur dans `packs.ts` ; le pack Acte IV s'écarte nettement des autres — dérive probable de ces chiffres (aucun recalcul à partir du manifeste).
- **Mémoire** : textures 26,5 Mo mesurées (palier lo, simulateur). Fuites : planches libérées pour Baal seulement ; pas de libération générale entre zones documentée (« seules les planches de la zone et de la ville »).
- **Cibles tactiles** : le test E2E ne mesure que les éléments `[data-testid]` du HUD (≥ 40 px). **Les panneaux ne sont pas mesurés** : sur la capture `android-petit/3-inventaire.png` (740×360 CSS), les cases du sac mesurent ≈ 20 px CSS (60 px à ×3), très en dessous de 40-44 px ; les libellés « Amulette », « Anneau » débordent de leur emplacement ; le bouton « Cube » chevauche la barre d'or. Le panneau D2 est un cadre 432 px redimensionné — lisible mais sans zoom ni mode « grandes cases » (le glisser-déposer existe ; le « toucher un objet pour le comparer » compense).
- **Polices** : 7,5 px (1 règle), 8 px (3), 9 px (2), 9,5 px, 10 px (4) dans `style.css` (étiquettes `.cell .slotname`, `.n`, `.upgrade::after`, `.d2lbl`, `.buff .t`) : illisibles en paysage mobile sans zoom. Seul 1 media-query orientation/largeur (`max-width 700/600px`).
- **Débordement** : un seul test (filtre de butin) ; aucun pour Personnage, Compétences, Réglages, coffre 5 onglets, Cube (le commit c320dfd corrige à la main des débordements, signe de régressions récurrentes).
- **Accessibilité** : zoom désactivé (`user-scalable=no`, `maximum-scale=1`), pas de mode daltonien/contraste, pas de réduction de mouvements, pas de sous-titres des sons, vibrations seulement.

## 8. Traduction (anglais par défaut)

Dictionnaire 3 678 clés, 510 identiques FR=EN (noms propres). Balayage code → `tr()` :

- Hors-couverture mesurée (16/2 341) : `app.ts` ligne de performance, `data/cube.ts` (« 3 crânes/gemmes … → », « (clé requise pour la parfaite). »), `data/superuniques.ts` ×2, `data/items` ×7 (noms de runewords en suite de runes : « Sur El » etc.), `ui` ×4 (`TYPE_FR[…]` + « exceptionnel/élite », « plus d2plus », sélecteur « Français »).
- Risques structurels (non captés par le balayage) :
  1. **Texte rendu hors DOM** : seuls `renderer.ts` (BitmapText des dégâts : `tr(text)`) et `panels.ts` importent `tr`. Les étiquettes au sol d'objets, noms de monstres/superuniques, « Inventaire plein », messages `events` (`t:'message'`), titres d'objets en Pixi : à vérifier — le test E2E ne contrôle que le français.
  2. **Messages d'erreur de `sim` en dur** : « Pas assez d'or », « Inventaire plein », « Ceinture pleine », `${cost} pièces d'or requises`, « Libérez de la place… », « Aucun mercenaire » : le gabarit `{0}` doit exister dans `en.json` pour chaque valeur — non testé.
  3. Un `alert()` natif en français (`importFile`, « Fichier de sauvegarde invalide ») : hors DOM, **jamais traduit**.
  4. Pluriels : clés `{n}` sans gestion du pluriel anglais (« 1 monsters »).
  5. Segments `a · b` et `,` traduits indépendamment : une virgule dans un nom (« Seigneur de sang, champion ») peut être mal coupée.
- Mélange FR/EN dans le même écran : les noms D2 sont déjà officiels en EN, donc un joueur EN voit en général un écran propre ; en FR le joueur voit des noms de zones/objets PD2 en anglais (clé = FR → pas de dictionnaire EN→FR).

## 9. Bugs probables relevés en lisant le code

| # | Où | Constat | Gravité |
|---|---|---|---|
| B1 | `sim/ai.ts` 195-243 | Monstres à distance (`keep > 0`) « reculent » (`dirX = m.x−p.x`) **sans test de mur** ; `moveActor` les coince en coin et ils tirent depuis un mur invisible/inaccessible : kite impossible à contourner par le joueur. Flow-field `null` → repli en ligne droite vers le joueur : un monstre sans trajet (lave, clôture) reste bloqué contre l'obstacle | P1 |
| B2 | `sim/ai.ts` | Aucun détecteur de blocage de monstre (`stuck`) : seul le bot du joueur en a un (`stuckRate 0`) ; monstres immobiles hors portée peuvent faire échouer « tuer tous les monstres » si c'est une condition de run | P1 |
| B3 | `game.ts` 761-787 | Mercenaire : l'or est débité après vérification de place ; si `spawnMerc` échoue le mercenaire reste « recruté » sans monde — non traité. Nom aléatoire dérivé de `c.gold` : reroll du nom en changeant l'or | P3 |
| B4 | `cube.ts` ~315 | voir R6 : ingrédients perdus si matériau impossible | P2 |
| B5 | `sell()` (`game.ts` 967) | Vente sans confirmation, sans rachat, prix `ilvl×3` fixe : vente involontaire d'un objet précieux irrécupérable (coffre partagé inclus ? `sell(invIndex)` vend l'inventaire) | P1 |
| B6 | `inventory.ts` `addToCharacter` | Potion : `slot.qty >= cap` → `false`, la potion reste au sol sans message (`pickupGroundItem` ignore le message pour le type potion) ; ceinture sans emplacement de type « rejuv » → impossible de ramasser une rejuvenation (retourne `false` silencieusement) | P1 |
| B7 | `inventory.ts` | Dernier recours : `c.inventory.push(it)` **hors grille** « visible dans le tri » : objets invisibles si la grille UI n'affiche que les 40 cases ; risque de perte perçue | P2 |
| B8 | `save.ts` migrate | Version future → exception ; `load()` essaie ensuite le backup (ancienne version) et **charge silencieusement un état plus ancien** après une rétrogradation d'application (cache SW d'une ancienne version) | P2 |
| B9 | `app.ts` 683 | `visibilitychange` met `paused = true` mais l'audio/le bot continuent selon les cas ; `saveNow` sans `try/catch` : une exception de `toSave()` interrompt la pause et laisse le jeu figé | P2 |
| B10 | Sim | Immunités : un build sans élément de repli peut devenir **infaisable** (Feu Baal Enfer 0/3 ; Pièges, Vent 98 min) ; pas de contournement joueur (brisure absente) — risque de « bloc de progression » | P1 |
| B11 | RATES | `manaRefillSeconds: 25` (D2 ≈ 120 s) : mana presque libre, affaiblit les compétences à coût élevé (équilibrage du coût de mana « à vérifier » : 13 écarts) | P2 |

## 10. Reste non résolu dans docs/internal/BACKLOG.md / mods/pd2/docs/AUDIT-PD2.md

**docs/internal/BACKLOG.md (50 lignes, 37 entrées) ouvertes** : n° 1 (couvrir chaque base par ≥ 1 unique ; `coverageFactor` ≤ 1,5), 5 (emprise pré-rendu ×2 trop grande), 7 (FPS sur vrai téléphone **jamais mesuré**), 8 (Baal Enfer 3/4 graines), 24 (Paladin marteau/Amazone/Assassin ~30-45 % de morts en arène Enfer), 25 (vagues de Baal/Chaos/kit Duriel PD2), 26 (propriétés d'uniques non appliquées : charges, ralentissement, dégâts magiques, endurance ; 18 runewords « NEW » sans valeurs), 27 (Sorcier/Druide S13 ; Hellforge, Rathma), 28 (effets visuels auras/charges/minions), 29, 30 (reliquats de classes), 31, 32 (7 builds > 30 % de morts), 33 reste (musique A5 coquille vide, polices bitmap, décor DS1, dialogues de quêtes), 35 (Pandémonium fidélité, Hellforge/Rathma/Lucion/Desecration absents), 36 (quêtes, Hellforge, jeu de hasard Gheed, imprégnation, Hardcore, charmes de brisure, ladder/échange, manette ; **poids total ≈ poids des sprites à valider sur réseau mobile**), 37 (TC Nihlathak/Pindleskin/Eldritch/Shenk/Anciens, 13 coûts de mana, durabilité et vitesse d'arme, diviseurs de vol de vie, IAS/FHR/FCR exacts, pop-pads, `OrderFlag`, `quests.txt`/`speech.txt`).

**mods/pd2/docs/AUDIT-PD2.md** : les écarts 1-12 sont largement corrigés (sets, uniques, runewords, résistances, Baal). Restent : n° 5 charmes de brisure PD2 (implémentés mais pas Conviction/Lower Resist), n° 13 cartes (Outer Void, Stygian Caverns, 6/4/4 vs 8/9/9, affixes Crimson/Azure/Opal, accès niveau 80 + Anciens), n° 17 Druide (sémantiques « approchées » : Rafale sans dégâts, Lianes/Cycle de la vie/Maîtrise des formes = vanilla), Tueur d'âmes (acte III) à remplacer, Storm Caster absent, Vizir = Storm Caster, kit détaillé de Diablo, § « Absent du jeu » 4 (événements de carte : Dark Wanderer, Shadow of Mendeln, Spire of Darkness, Altar of the Catalyst, Gheed, Invasion, Catalyst Shard, Infusions), 5 (Pindleskin/Eldritch/Shenk/Nihlathak/Anciens/Hellforge), 6 (Rathma, Lucion, Demonic Cube, Lilith's Mirror, Vial of Lightsong, Token of Absolution, Desecration), 7 (carquois, ~65 runewords PD2 manquants selon l'ancien décompte — mais `runes.ts` donne 85 présents sur 103 PD2, dont 18 sans valeurs : à réconcilier). Les données PD2 restent **non vérifiables** (wiki 403) : l'audit de fidélité PD2 s'appuie sur `coleestrin/pd2-tools`.

Note de cohérence documentaire : mods/pd2/docs/AUDIT-PD2.md « Déjà fidèle » indique « ~27 des 39 runewords » alors que la mesure actuelle est 85 présents/103 ; BACKLOG 6 (« ~12 h ») vs `rates.ts` (« ~27 h ») ; l'en-tête d'ARCHITECTURE.md ne mentionne pas le chiffrement D2/`dist/d2`.

## 11. Priorisation (ce que je corrigerais d'abord)

| Prio | Chantier | Effort |
|---|---|---|
| P0 | Mesurer FPS/chargement/mémoire sur 1-2 vrais téléphones (`?bench=1`) ; décider du palier lo par défaut (BACKLOG 7, 36) | S |
| P0 | R1 : avertir si `SaveStore.save` échoue + `navigator.storage.persist()` ; R2 validation avant écrasement du backup | S |
| P0 | R4 : soit stocker les fichiers `d2/*` des packs dans la Cache API (SW ou `caches.open` côté page) et vérifier l'intégrité du pack, soit retirer la promesse « hors ligne » | M |
| P1 | Gestionnaire d'erreurs global + écran de reprise ; tests de `SaveStore`, `ai`, `missiles`, classes ; test de couverture i18n | S-M |
| P1 | Économie : puits d'or (réparation/durabilité ou coût de soin, Gheed/jeu de hasard, imprégnation payante), plafond d'or, rachat/confirmation de vente | M |
| P1 | Builds non jouables (7/18 > 30 % de morts en cartes d'Enfer) : tactique du bot + mécanique de brisure/Conviction ; sinon assouplir les cartes d'Enfer | L |
| P1 | Anti-blocage de monstres (B1/B2), ceinture/rejuvenation (B6) | S |
| P1 | Découpage du bundle (zones, uniques, `en.json` en chargement différé) | M |
| P2 | Mesurer les panneaux mobiles (cases ≥ 40 px, polices ≥ 11 px, débordements) dans l'E2E | M |
| P2 | Réconcilier les écarts de monstres/boss (122 résistances, 16 niveaux), Myth/Hel, sets Expansion/McAuley's | M |
