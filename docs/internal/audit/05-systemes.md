# Audit 05 : systèmes de combat et statistiques (D2 Mobile vs D2 LoD 1.13 / PD2)

Méthode : lecture de `src/sim/{combat,melee,character,breakpoints,progression,world,missiles,necromancer,derived}.ts`, exécution de `tools/audit/formulas.ts` (comparaison aux tables charstats / difficultylevels / experience), grep de consommation des stats dérivées. Le wiki PD2 n'a pas été re-sondé : les règles PD2 viennent de mods/pd2/docs/AUDIT-PD2.md / mods/pd2/docs/ETUDE-PD2.md et de la connaissance de D2 1.13 (confiance indiquée M quand incertaine).

## 1. Résumé chiffré

| Domaine | D2 | PD2 | Nous | Couverture |
|---|---|---|---|---|
| Classes : For/Dex/Vit/Ene de départ, vie/mana par niveau et par point (7 classes) | 7 | 7 | 7 conformes (formulas.ts : 0 écart) | 100 % |
| Table XP niveaux 1-99 + ExpRatio | 99 | 99 | 98 identiques (niv. 99 : cible `undefined`, sans effet car cap) ; ExpRatio 0 écart | ~99 % |
| Tables FCR (7 classes + foudre/chaîne) / FHR (7) | 15 | 15 | 15 jeux de paliers, tous identiques aux valeurs D2 connues | 100 % (tables) |
| Tables FBR (blocage), FCR/FHR formes animales, FHR mercenaire | 7+4 | idem | 0 (FBR = 8 images / (1+fbr) approximé) | ~10 % |
| Vitesse d'attaque (IAS, WSM d'arme, animation par classe/arme/compétence) | ~170 combinaisons | idem | 1 formule : `max(6, base − floor(IAS/15))`, base par classe seulement | ~10 % |
| Pénalités de difficulté de résistance | 3 | 3 | 3 conformes (0/−40/−100) | 100 % |
| Diviseurs de difficulté (vol de vie/mana 1/2/3, gel 1/2/4, froid 1/2/4) | 4 valeurs ×3 | idem | 0 appliqué | 0 % |
| Formules de base (toucher, blocage, défense dex/4, AR dex×5−35, plafonds rés. 75/95, DR 50) | 7 | 7 | 7 correctes | 100 % |
| Évitement (Esquive, Évitement, Dérobade, parade Assassin/Paladin) | 5 | 5 | 5 calculés dans `derived`, **0 consommé en combat** | 0 % effectif |
| Pénétration / immunités / brisure PD2 | 4 règles | 4 | 4 (effectiveMonsterRes + Conviction ½ + Sunder 95) | ~95 % |
| Malédictions du Nécromancien | 10 | 10 | 10 | 100 % |
| Dégâts de statut (poison, brûlure, gel, étourdissement, blessures ouvertes) | 5 | 5 | 5 présents, 3 écarts de détail | ~70 % |
| Absorption (% et plat) | 2 | 2 | % présent (comportement faux), plat absent | ~30 % |
| MF/GF (rendement décroissant 250/500/600, formule de rareté) | 1 | 1 | formule D2 exacte ; GF stocké, usage non vérifié | ~90 % |
| Mort / niveau / points | 6 règles | 6 | 4 conformes, 2 écarts | ~70 % |

## 2. Manquants classés

### P0 (cœur du jeu, bloquant la fidélité)

1. **Évitement/esquive/parade jamais appliqués** (Amazone : Esquive, Dérobade, Évitement ; Assassin : Parade d'arme ; Paladin : Épée sacrée). `character.ts` calcule `dodgeMelee/dodgeMissile/dodgeAny/weaponBlock` ; `grep` : AUCUN consommateur hors UI (`damagePlayer` n'utilise que `d.block`). Les compétences sont donc inertes en défense : le build Amazone passif est un faux. Effort S. Dépend de : `damagePlayer` (après test de toucher, avant blocage ; dodgeAny seulement si `pl.mode==='walk'`, dodgeMelee/Missile seulement à l'arrêt/attaque).
2. **Vitesse d'attaque non fidèle** : pas de WSM/vitesse d'arme (`ItemBase` sans champ speed ; `grep wsm` : 0), pas de rendement décroissant (D2 : Eff = 120·IAS/(120+IAS), frames = ceil(256·B/floor(256·(100+Eff+WSM)/100)) − 1), pas de table animation par classe × arme (`animdata`), pas de frames par compétence (Zèle, Furie, Frénésie, Tourbillon, Strafe, Fendre : seulement `zeal: 0.6`, `fury ×1,5`). Exemple chiffré : 60 % IAS donne 12 images chez nous pour toutes les armes ; D2 sorcière main nue : B=16, Eff=40 → floor(256×1,40)=358 → ceil(4096/358)−1 = 11 ; épée longue (WSM 0) paladin ≈ 12 ; hache à deux mains (WSM +10) 14 base. À 150 % IAS : nous 6 (plancher) contre D2 ~8-9 pour la plupart des classes (palier de 8 images à 175 % chez Amazone Strafe). Effort L. Dépend de : champ `wsm` dans les bases (monstats/weapons.txt disponibles), tables d'animation (animdata) pour 7 classes × ~14 types d'arme.
3. **Diviseurs de difficulté absents** : en D2 le vol de vie/mana est divisé par 2 (Cauchemar) et 3 (Enfer), la durée de gel et de refroidissement par 2 / 4 (`difficultylevels.txt` LifeStealDivisor 1/2/3, MonsterFreezeDivisor 1/2/4, MonsterColdDivisor 1/2/4). `damageMonster` applique `lifeLeech` brut quelle que soit la difficulté et `freezeMul` par rang seulement. Un build à 10 % de vol de vie soigne 3× trop en Enfer, et le Froid gèle 4× trop longtemps. Effort S.
4. **Absorption erronée et incomplète** (`damagePlayer`, branche élémentaire) : le code SOIGNE le joueur de `dmg×abs%` ET réduit les dégâts du même montant (double effet). En D2 l'absorption réduit seulement les dégâts (ordre : résistance puis % puis plat) ; l'absorption plate (Arkaine's, Pierre de Jordan.. : « +X absorbe feu/froid/foudre/magie ») n'existe pas (`absorb: poison/magic/phys = 0`, aucune stat `absorbFlat`, `absorbMagic`). Plafond 40 % du code non D2. Effort S-M. (confiance M sur « sans soin » : D2 vanilla, vérifier le comportement PD2).
5. **Montée de niveau : soin partiel de 30 %** (progression.ts : « D2 : la montée de niveau ne soigne pas »). Faux : en D2/PD2 la montée de niveau restaure vie, mana et endurance à 100 %. Effort S.

### P1 (important)

6. **Bonus de dégâts d'arme par attribut** : `weaponDmg × (1 + str/100)` pour TOUTES les armes. D2 : StrBonus/DexBonus par arme (arcs/arbalètes : 100 % Dex ; dagues, griffes, javelots, armes de jet : 75 % For + 75 % Dex ; reste : 100 % For ; Barbare/Amazone sans bonus spécial). Un archer Amazone à 100 Dex gagne +0 % chez nous. Effort S (champs `strBonus/dexBonus` dans weapons.txt).
7. **Tables FBR et formes** : pas de table FBR par classe (blocage : 8 images fixes × 100/(100+fbr), D2 : tables propres, ex. Paladin avec bouclier 3-4 images), pas de FCR/FHR des formes animales (loup-garou/ours : Druide utilise la table humaine pour la récupération). Effort M.
8. **Récupération après coup** : joueur interrompu seulement si coup ≥ 1/12 PV max (`damagePlayer`), D2 : tout coup subi déclenche la récupération (sauf « ininterrompable »). Plus indulgent que D2 : FHR devient quasi inutile à haute vie. Effort S (confiance M pour PD2).
9. **Dégâts de coup critique / mortelle** : frappe mortelle et critique de maîtrise additionnés puis plafonnés à 75 % ; D2 résout séparément (Deadly Strike → Critical Strike → Weapon Mastery, chance combinée 1−Π(1−p)), et Mortelle double aussi les ajouts élémentaires ? (non : phys seul, correct). Effort S.
10. **Poison cumulatif** : sur le joueur, « le plus fort remplace » (code) ; en D2 le poison de sources distinctes s'ajoute (durée moyenne pondérée, un seul dps additionné) sur monstres ET joueur ; chez nous les monstres prennent `max()` du dps (pas de cumul : Nécromancien/Assassin poison fortement sous-évalué). Effort M. (confiance M).
11. **Régénération et endurance** : aucune endurance/course (D2 : barre d'endurance, Vigueur, Endurance), pas de régénération naturelle de vie lente (D2 : 0 sauf Régénération/Replenish : OK) ; régénération de mana = manaMax/25 s (jeu) au lieu de ~1 point/seconde × niveau selon classe (D2 : ~10 % toutes les 10 s selon énergie et `ManaRegen` charstats). Effort M.
12. **Pénalité de mort** : `deathPenalty` retire 0/5/10 % de la largeur du niveau (OK avec DeathExpPenalty) mais D2 prend ce % de l'XP **totale** accumulée... (confiance faible) ; aucun cadavre à récupérer (équipement gardé : acceptable pour mobile), aucune perte d'or (D2 : 0 aussi) ; rien pour le rejet de la pénalité niveau 99. Effort S.
13. **Pénalité d'XP par écart de niveau** : table `[1,.81,.62,.43,.24,.05]` plausible mais pas vérifiée contre `experience.txt` (colonne ExpRatio utilisée, pas la table de pénalité de niveau de monstre) ; D2 réduit aussi XP si clvl > 25 pour mlvl bas selon `clvl−mlvl` ; pas de bonus de groupe (jeu solo). Effort S.
14. **Frames d'animation** : 25 i/s partout (TICK_HZ=25, cohérent D2) mais animations des monstres (hit recovery `modeLen = 5` fixe, recul, frames d'attaque) génériques ; D2 : par monstre (monstats `A1`/`HR`). Effort L.
15. **Armes de jet/double maniement** : double maniement limité (Barbare, griffes Assassin : alternance non vérifiée, `off:` frappe l'arme gauche à chaque coup) ; pas de gestion de l'IAS « arme gauche » ni de dégâts moyens alternés ; armes de jet : pas de quantité/ramassage (carquois PD2 absents, cf. AUDIT-PD2). Effort M.

### P2 (confort / rare)

16. **Résistance magique en %** et réduction de dégâts magiques en % absentes (`res.magic` toujours 0 ; seul `mdr` plat). Rare mais présente sur objets PD2. Effort S.
17. **Classes : plafond de blocage par classe** (charstats `BlockFactor`) : `blockChance` ne tient compte que du bloc de l'objet, pas du modificateur de classe ; plafond 75 % identique pour tous (D2 : plafond effectif 75 % aussi mais Paladin +, Sorcière/Nécro −). Effort S.
18. **Sorts : test de toucher et « sort ignore la défense »** non modélisé pour les sorts physiques d'Assassin (Pièges) ; Écrasement et « ignore la défense » partiels (`ignoreDef` présent). Effort S.
19. **GF (Gold Find)** : stat `gf` stockée ; usage à confirmer dans drops.ts (non vérifié ici). Effort S.
20. **Immunités à l'étourdissement/gel des monstres** : seulement `noFreeze` + rang boss ; D2 : colonnes `NoFreeze`/`NoStun`, boss gelés ×1/4 (ok) mais pas de « cold-immune = jamais gelé » détaillé. Effort S.
21. **Rendement décroissant FRW 150** présent, mais pas pour FCR/FHR/IAS hors paliers (par design D2 : OK). Rien.

### P3 (cosmétique)

22. Indicateur « prochain palier » : présent pour FCR/FHR (`nextFcrBreakpoint`), absent pour IAS (une fois la formule corrigée) et pour FBR.
23. Texte de pénétration/immunité dans l'infobulle (`immune` event OK) : pas de couleur distincte pour « pénétration négative divisée par 2 ».

## 3. Écarts de fidélité les plus graves (valeurs, formules)

1. **Évitement mort** (voir P0-1) : Esquive niv. 20 devrait donner ~50 % d'esquive en mêlée à l'arrêt ; chez nous 0 %.
2. **IAS** : voir P0-2. Pas de WSM : une dague (−20 WSM) et une hache à deux mains (+10) attaquent à la même cadence. Sans rendement décroissant, 150 % IAS atteint le plancher à 6 images (D2 : bien plus lent), donc Frénésie/Tourbillon/Zèle sont trop rapides à haut IAS et trop lents à bas IAS.
3. **Absorption** : 20 % d'absorption foudre sur un coup de 1 000 : D2 → 800 dégâts ; chez nous → 800 dégâts ET +200 PV soignés (net −600).
4. **Diviseurs de vol de vie** : Enfer, 9 % de vol de vie : D2 → 3 % effectif ; chez nous 9 %. Dans le bot d'endgame cela masque des morts.
5. **Montée de niveau** : 30 % de soin au lieu de 100 % (changement de comportement visible à chaque niveau).
6. **Bonus de force/dextérité des armes** : arc/arbalète/griffes/dagues/javelots mal calculés (voir P1-6). Dague 5-15 dmg à For 50 / Dex 150 : D2 → ×(1+ (0,75×50+0,75×150)/100)=×2,5 ; nous ×1,5.
7. **Récupération après coup** à 1/12 PV (P1-8) ; **poison monstres sans cumul** (P1-10).
8. **Monstres** : AR/défense/dégâts viennent de courbes génériques (`curves.ts` : `monsterAr = 20+14L+0,18L²`, `monsterDef = 10+9L+0,1L²`) au lieu de monstats (AR/Def par monstre et difficulté) ; les monstres « ajoutés » via `monsters-d2.ts` ont seulement leurs attaques et résistances monstats. Dégâts globaux : multiplicateur unique/champion D2 (UniqueDamageBonus 90/75/66 %) non repris : rang unique = ×1,5 dégâts, ×4 PV (RANK_MULT).
9. **Bonus d'XP** : multiplicateur RATES.xp = 3,0 et courbe ×1,1→×6,2 (accélération volontaire pour sessions courtes, documentée) : à ne pas confondre avec D2 ; mais pénalité de niveau/ExpRatio D2 restent appliquées.

## 4. Déjà au niveau

- Formules de base D2 : toucher `2·alvl/(alvl+dlvl)·AR/(AR+DEF)` borné 5-95 %, blocage `bloc·(dex−15)/(2·clvl)` plafonné 75 %, défense `dex/4`, AR `dex×5−35`, plafonds 75 % (95 % avec max-res), DR 50 % (tests `combat.test.ts`).
- Pénétration/immunités PD2 : immunité ≥ 100, réduction (Conviction, Inferno, Champ statique) cassant à ½, Sunder 95, négatif /2 plancher −100 (`effectiveMonsterRes`).
- Pénalités de difficulté de résistance 0/−40/−100, tables charstats (7 classes), table XP/ExpRatio, paliers FCR/FHR de toutes les classes, foudre et chaîne à 19 images (tests + `formulas.ts`).
- Frappe écrasante (¼ des PV, ⅛ boss), frappe mortelle ×2, blessures ouvertes, dégâts de zone PD2 (¼), perforation/pénétration de projectile, mêlée contre morts-vivants/démons, ralentissement des coups, bouclier d'énergie PD2 (15+2(n−1) % max 90, coût 34−points)/16).
- Malédictions (10/10), auras du Paladin avec passif PD2 (moitié de valeur en aura), cris du Barbare, formes du Druide, brûlure/poison/gel/étourdissement présents, MF D2 (250/500/600, ratios de rareté, alvl), FRW avec rendement 150.
