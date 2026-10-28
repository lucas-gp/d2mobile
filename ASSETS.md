# Assets sources (pré-rendu de sprites)

Inventaire des modèles 3D, textures, polices et éléments d'UI libres de droits rangés dans
`assets-src/`. Ils alimentent la chaîne de pré-rendu Three.js (Chromium headless).

- **Total : 68,0 Mio** (316 fichiers glTF/GLB, 9 textures, 7 polices, 368 PNG d'UI).
- **Licences : CC0 (modèles, textures, UI Kenney), SIL OFL 1.1 (polices) et CC BY 3.0
  (icônes game-icons.net, attribution obligatoire : faite ici et dans l'écran « Crédits »
  du jeu, Réglages → Crédits).**
- **Aucun asset binaire (image, modèle, son, police) extrait de Diablo 2, de PD2 ou d'un autre jeu commercial.** Les noms Diablo
  ci-dessous servent seulement à associer une famille de monstres à un modèle libre.
- Formats : uniquement `.glb` / `.gltf` (+ `.bin` et atlas `.png`). Aucun `.blend`, `.fbx`,
  `.obj`, aperçu PNG ni dossier `.git` n'a été conservé.

## Exception : importeur « le joueur fournit ses propres fichiers » (`tools/d2import/`)

Pour un usage **strictement privé**, l'importeur lit les archives MPQ de l'installation Diablo II de
l'utilisateur et génère des sprites, tuiles et icônes **hors du dépôt** (`D2_OUTPUT_DIR`, par défaut
`$D2_PRIVATE_DIR/out`). La règle « aucun asset extrait de Diablo II » vaut donc pour ce qui est commité :
**ni archive, ni fichier extrait, ni PNG généré n'entre jamais dans git** (`*.mpq`, `d2-private/`,
`d2-input/`, `d2-output/` sont ignorés). Voir `tools/d2import/README.md`.
Le jeu peut afficher ces sprites importés **en local seulement** (dossier servi sous `/d2/` par le serveur de développement,
ou générés dans le navigateur du joueur à partir de ses propres archives), jamais dans `dist/` ni dans le dépôt, avec repli sur les sprites d'origine seulement dans une version de développement.

## 0. Règle d'origine des assets (s'applique à TOUT asset généré)

**Aucun asset de Diablo II, de Project Diablo 2 ou de tout autre jeu commercial n'est distribué
dans ce dépôt.** Tout ce qui est livré (sprites, sons, polices, icônes, icône d'application)
vient de modèles et d'icônes sous licence libre (CC0, CC BY 3.0, OFL) ou de créations originales,
listés ci-dessous et dans `THIRD_PARTY_NOTICES.md`.

Procédure, avant de créer ou de modifier un asset :
1. **Décrire l'intention** dans `docs/internal/DIRECTION-ARTISTIQUE.md` : silhouette, couleurs dominantes,
   tenue, arme, proportions, animation marquante.
2. **Générer** depuis un modèle libre (recolorer les matériaux, `boneScale`, accessoires).
3. **Contrôler** sur planche-contact (`tools/prerender/contact-sheet.ts`) : lisibilité en jeu,
   silhouette, palette.
4. **Jamais** d'asset extrait d'un jeu, de capture recopiée ni de texture issue d'un jeu commercial.
   Les références visuelles personnelles restent hors dépôt (dossier `references/`, ignoré par git).
5. Le comportement s'appuie sur des faits de gameplay publiquement documentés (voir
   `docs/DERIVED-DATA.md`), recodés dans des structures propres au projet.

---

## 1. Vérifications effectuées

1. **Parsing et résolution des buffers** avec `@gltf-transform/core` 4.5.0 (NodeIO) : les
   311 fichiers se chargent sans erreur (squelettes, animations et textures résolus).
2. **Chargement réel avec Three.js 0.186 `GLTFLoader`** dans Chromium headless (Playwright,
   WebGL SwiftShader) : 311 chargés sur 311, 0 échec.
3. **Rendu de planches-contact** avec une animation jouée à mi-clip (attaque, sort, mort…)
   pour chaque modèle animé : squelettes, skinning et matériaux sont corrects.

Les scripts de vérification (`inspect.mjs` sans dépendance, qui lit le chunk JSON d'un GLB,
et `verify.mjs` basé sur gltf-transform) sont restés dans un dossier local
(outils locaux). Ils ne sont pas versionnés.

### Transformations appliquées (sans perte)

| Transformation | Packs concernés | Outil |
|---|---|---|
| `.gltf` embarqué (base64) → `.glb` : changement de conteneur seulement, données identiques, environ −25 % de taille | Quaternius Ultimate Animated Character, Ultimate Monsters, Ultimate Animated Animals | `@gltf-transform/core` 4.5.0 (`io.read` → `io.write`) |
| `.fbx` → `.glb` (ces packs n'existent qu'en FBX/OBJ/Blend) | Quaternius Easy Enemy (Spider), Animated Monster (Bat), Medieval Village, Survival, Ultimate RPG | FBX2glTF (npm `fbx2gltf` 0.9.7p1, outil open source de Facebook) |
| Renommage `xxx.gltf.glb` → `xxx.glb` | KayKit Dungeon Remastered | — |
| Bâton de la Sorcière : `sorceress_staff_texture.png` (depuis `mage_texture.png`, cases recolorées en gardant leur dégradé) et `sorceress_staff.gltf` = `staff.gltf` pointant sur cet atlas (même `staff.bin`). Œuvre dérivée d'une ressource CC0 ; la palette s'inspire d'une image de référence fournie, dont rien n'est copié | KayKit Adventurers | `tools/prerender/paint-sorceress.py` (Pillow) |
| Bâton du Druide : `druid_staff_texture.png` (même atlas KayKit, bois clair et orbe vert) et `druid_staff.gltf` = `staff.gltf` pointant sur cet atlas | KayKit Adventurers | `tools/prerender/paint-sorceress.py` (Pillow) |

Les clips issus de FBX gardent le préfixe de l'armature (ex. `SpiderArmature|Spider_Walk`).
Les modèles Quaternius « low poly » sans texture utilisent des couleurs de matériau
(`baseColorFactor`), ce qui facilite la reteinte par nom de matériau.

## 2. Tableau par pack

| Pack | Auteur | URL source | Licence vérifiée (où) | Fichiers retenus | Taille |
|---|---|---|---|---|---|
| KayKit Character Pack : Adventurers 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (commit 672074b) | **CC0** : `LICENSE.txt` du pack | `Rogue.glb`, `Rogue_Hooded.glb`, `Mage.glb` + `accessories/` (staff, wand, spellbook_open/closed, dagger, axe_2handed + 3 atlas PNG) | 10,45 Mio |
| KayKit Character Pack : Skeletons 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 (15b62b9) | **CC0** : `LICENSE.txt` | `Skeleton_Warrior/Rogue/Mage/Minion.glb` + `accessories/` (Blade, Axe, Staff, Crossbow, Quiver, Arrow, 3 boucliers + atlas) | 18,64 Mio |
| KayKit Dungeon Remastered 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 (b0ca9bd) | **CC0** : `LICENSE.txt` | 126 GLB : murs (18 variantes), sols tuiles/terre/fondations/grilles/pics, piliers, colonnes, escaliers, torches, bougies, bannières rouges/brunes/blanches, tonneaux, caisses, coffres (`chest`, `chest_gold`, couvercle séparé), malles (`trunk_*`), gravats, barrières, `sword_shield*` | 5,34 Mio |
| KayKit Halloween Bits 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 (6dc69bf) | **CC0** : `LICENSE.txt` | 54 glTF : tombes, stèles, crypte, cercueils, sanctuaires, grilles de cimetière, arbres morts, lanternes, poteaux à crâne, os, cage thoracique, arche, chemins (citrouilles exclues) | 1,16 Mio |
| KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 (84fa4e9) | **CC0** : `LICENSE.txt` | `buildings/` (maisons A/B, église, taverne, forge, puits, tours, moulin, caserne, marché, mine en variante rouge, `building_destroyed`, murs d'enceinte en pierre + portes, clôtures bois/pierre, échafaudage, pont) ; `nature/` (5 rochers, arbres) ; `props/` (tonneau, caisses, sac, tente, râtelier d'armes, brouette, drapeau rouge, seaux, bois, pierre, échelle, cible) | 2,21 Mio |
| Kenney : RPG Audio, Impact Sounds, Interface Sounds, Sci-Fi Sounds | Kenney Vleugels | https://kenney.nl/assets (pages des packs) | **CC0** : `assets-src/audio/kenney/License.txt` | 45 sons choisis (pièces, chutes d'objets, verre, cloche, pas neige/pierre/herbe, coups, explosions, champ de force, clics) → MP3 mono 48 kb/s par `tools/audio/build-audio.py` | 0,58 Mio (sources) / 0,13 Mio (jeu) |
| Quaternius Ultimate Animated Character Pack | Quaternius | https://quaternius.com/packs/ultimatedanimatedcharacter.html (Google Drive officiel) | **CC0** : `License.txt` + page officielle | `Zombie_Male.glb`, `Zombie_Female.glb`, `Cow.glb` (vache humanoïde debout), `Goblin_Male.glb`, `Witch.glb` (la Sorcière jouable, chapeau masqué ; Malah), `Viking_Male.glb` (Larzuk ; repeint en cuir vert et fourrure, c'est aussi le Druide jouable) ; `Zombie_Female.glb` repeinte sert aussi pour Anya | 6,83 Mio |
| Quaternius Ultimate Monsters | Quaternius | https://quaternius.com/packs/ultimatemonsters.html | **CC0** : `License.txt` (l'en-tête dit par erreur « Ultimate Platformer Pack », mais le texte est bien CC0 1.0) + page « License CC0 » | `Demon.glb`, `Tribal.glb`, `Orc_Skull.glb`, `Yeti.glb` (Duriel ; brun, l'ours-garou du Druide et son grizzly), `BlueDemon.glb`, `Ghost_Skull_Flying.glb`, `Birb.glb` (corbeaux du Druide, assombris) (texture atlas embarquée) | 3,24 Mio |
| Quaternius Ultimate Animated Animals | Quaternius | https://quaternius.com/packs/ultimateanimatedanimals.html | **CC0** : `License.txt` + page | `Wolf.glb` (loup-garou du Druide, loups spirituels et redoutables), `Cow.glb`, `Bull.glb` | 5,33 Mio |
| Quaternius Easy Enemy Pack | Quaternius | https://quaternius.com/packs/easyenemy.html | **CC0** : `License.txt` | `Spider.glb` (converti depuis le FBX) | 0,43 Mio |
| Quaternius Animated Monster Pack | Quaternius | https://quaternius.com/packs/animatedmonster.html | **CC0** : `License.txt` (« Animated Monsters by Quaternius ») | `Bat.glb` (converti depuis le FBX) | 0,22 Mio |
| Quaternius Medieval Village Pack | Quaternius | https://quaternius.com/packs/medievalvillage.html | **CC0** : `License.txt` | 16 GLB : `House_1..4`, `Inn`, `Blacksmith`, `Bell_Tower`, `Stable`, `Well`, `Cart`, `MarketStand_1`, `Bonfire_Lit`, `Cauldron`, `Hay`, `Fence`, `Rock_1` | 3,95 Mio |
| Quaternius Survival Pack | Quaternius | https://quaternius.com/packs/survival.html | **CC0** : `License.txt` | `Tent.glb`, `Bonfire_Fire.glb`, `WoodenTorch_Fire.glb` | 0,11 Mio |
| Quaternius Ultimate RPG Pack | Quaternius | https://quaternius.com/packs/ultimaterpg.html | **CC0** : `License.txt` | 24 GLB : `Crown`, `Crown2`, `Crystal1..5` (+ variantes `_Damaged`), `Chest_Closed/Open`, `Potion1..3_Filled`, `Ring1/2`, `Necklace1`, `Coin`, `Skull`, `Bone`, `Scroll`, `Book1_Closed` | 0,63 Mio |
| Poly Haven, textures 1K (diffuse JPG) | Rob Tuytel, Amal Kumar | https://polyhaven.com/textures | **CC0** : https://polyhaven.com/license (pas de fichier de licence dans le téléchargement : texte reproduit dans `textures/polyhaven/LICENSE.txt`) | burned_ground_01, brown_mud_leaves_01, forrest_ground_01, cobblestone_floor_04, snow_02, castle_brick_07, monastery_stone_floor, large_sandstone_blocks_01, dark_wooden_planks | 6,40 Mio |
| Kenney UI Pack : RPG Expansion | Kenney | https://kenney.nl/assets/ui-pack-rpg-expansion | **CC0** : `License.txt` du zip + page | 87 PNG + spritesheet PNG/XML + SVG | 0,16 Mio |
| Kenney Fantasy UI Borders | Kenney | https://kenney.nl/assets/fantasy-ui-borders | **CC0** : `License.txt` du zip + page | 280 PNG (bordures, panneaux, séparateurs ; styles Default et Double) + SVG | 0,18 Mio |
| Cinzel (variable wght) | Natanael Gama / The Cinzel Project Authors | https://github.com/google/fonts/tree/main/ofl/cinzel | **SIL OFL 1.1** : `OFL.txt` | `Cinzel[wght].ttf` | 0,12 Mio |
| Cinzel Decorative (non utilisée : ni dans `public/` ni dans le build) | Natanael Gama | …/ofl/cinzeldecorative | **SIL OFL 1.1** : `OFL.txt` | Regular, Bold | 0,12 Mio |
| IM FELL English (non utilisée : ni dans `public/` ni dans le build) | Igino Marini | …/ofl/imfellenglish | **SIL OFL 1.1** : `OFL.txt` | Roman, Italic | 0,38 Mio |
| Alegreya SC | Juan Pablo del Peral (Huerta Tipográfica) | …/ofl/alegreyasc | **SIL OFL 1.1** : `OFL.txt` | Regular, Bold | 0,72 Mio |

Chaque sous-dossier contient le fichier de licence d'origine du pack (`LICENSE.txt`,
`License.txt` ou `OFL.txt`).

Packs examinés puis **écartés** :

- Quaternius *Bestiary – Dungeon Monsters Kit* : licence « QAL », pas CC0, et animations
  non incluses.
- Quaternius *Cute Monsters* : rig de 7 os, style « bonbon ».
- Quaternius *Animated Zombie* : FBX sans clips de mort ni de coup reçu.
- Quaternius *Fantasy Props / Medieval Village MegaKit* : zips de 143 à 153 Mo, bâtiments
  modulaires à assembler. Le pack Medieval Village « classique » suffit.
- Tout ce qui est généré par IA (Meshy…) ou de provenance douteuse.

## 3. Personnage jouable : la Sorcière

| Choix | Modèle | Adaptation prévue |
|---|---|---|
| **Principal** | `characters/kaykit-adventurers/Rogue_Hooded.glb` (femme encapuchonnée) | Reteinte gothique : capuche et cape violet nuit / noir, liserés or. Masquer les meshes `Knife`, `Knife_Offhand`, `1H_Crossbow`, `2H_Crossbow`, `Throwable`. Attacher `accessories/staff.gltf` (ou `wand.gltf`, `spellbook_open.gltf`) à l'os `handslot.r` (et `handslot.l` pour le grimoire). |
| Variante tête nue | `Rogue.glb` (mêmes meshes, `Rogue_Head` sans capuche) | Mêmes adaptations (cheveux assombris). |
| Alternative | `Mage.glb` (chapeau pointu, bâton et grimoire intégrés : meshes `2H_Staff`, `1H_Wand`, `Spellbook*`) | Accepté par le cahier des charges, mais le visage est plutôt masculin. |

Correspondance des animations (rig KayKit, 41 os, 76 clips) :

| Notre anim | Clip KayKit |
|---|---|
| idle | `Idle` (1,07 s) ; combat : `2H_Melee_Idle` |
| walk / run | `Walking_A` (1,07 s) / `Running_A` (0,8 s) |
| attack | `1H_Melee_Attack_Stab` (coup de bâton) ou `Spellcast_Shoot` (projectile, 0,93 s) |
| cast | `Spellcast_Shoot` (0,93 s), `Spellcast_Raise` (2,1 s, nova / sort de zone), `Spellcast_Long` (2,53 s, canalisé), `Spellcasting` (boucle 0,67 s) |
| hit | `Hit_A` (0,67 s), `Hit_B` (0,87 s) |
| death | `Death_A` (0,8 s) / `Death_B` (2,63 s) (+ poses finales `Death_*_Pose`) |
| bonus | `Dodge_*`, `PickUp`, `Use_Item`, `Interact`, `Cheer`, `Throw` |

## 4. Familles de monstres Diablo → modèles libres

Échelle de référence : un humanoïde KayKit mesure environ 2,6 unités. Les tailles sont à
normaliser par la chaîne avec la bounding box de l'Idle.

| Famille (zone) | Modèle | Adaptation prévue (teinte / échelle / accessoire) |
|---|---|---|
| **Squelette guerrier** (Tristram, Tombeaux) | `kaykit-skeletons/Skeleton_Warrior.glb` | Os ivoire sali. Casque à cornes d'origine. `Skeleton_Blade` ou `Skeleton_Axe` en `handslot.r`, `Skeleton_Shield_Small_A` en `handslot.l`. Échelle 1,0. |
| **Squelette archer** | `Skeleton_Rogue.glb` (capuche) | Cape rouge sang. `Skeleton_Crossbow` en `handslot.r` (+ `Skeleton_Quiver`). Clips `1H_Ranged_Aiming/Shoot/Reload`. |
| **Squelette mage** (Mage d'os) | `Skeleton_Mage.glb` | Variantes feu / froid / poison par teinte du chapeau et du matériau `Glow` (yeux). `Skeleton_Staff`. |
| **Squelette de base / sbire de résurrection** | `Skeleton_Minion.glb` | Nu ou avec `Skeleton_Blade`. Clips `Skeletons_Awaken_Floor`, `Spawn_Ground_Skeletons`, `Death_C_Skeletons_Resurrect` pour les nécromanciens. |
| **Mort-vivant / zombie** (Tristram) | `quaternius-ultimate-animated-character/Zombie_Male.glb`, `Zombie_Female.glb` | Peau verdâtre d'origine, ou matériau `Skin` gris-vert pour les goules. Échelle 0,95. |
| **Momie** (Tombeaux) | `Zombie_Male.glb` reteint | Tous les matériaux (`Clothes`, `Pants`, `DarkClothes`, `Skin`) en lin jauni #C9B98F (y compris `Brain` et `Guts`, recolorés comme `Skin`). Émissif vert pâle sur les yeux (`Face`). Échelle 1,1. Pour les momies « Unraveler » : `Zombie_Female` reteint, échelle 1,25. |
| **Déchu / petit démon** (Fallen) | `quaternius-ultimate-animated-character/Goblin_Male.glb` | `Skin` rouge sombre #7A1E1E, échelle 0,7. Arme : `Skeleton_Blade` (ou `dagger`) sur l'os `Fist.R`. |
| **Démon ailé** (Seigneurs du sang / Venom Lords) | `quaternius-ultimate-monsters/Demon.glb` (ailes, cornes, trident) | Assombrir l'atlas (multiplier par #5A2030), cornes noires. Échelle 1,3. Garder le mesh `Trident`. |
| **Diablotin / démon mineur** | `BlueDemon.glb` (gourdin) | Teinte pourpre ou brun cendre, échelle 0,8. |
| **Brute démoniaque** (Minions of Destruction, vague 5 de Baal) | `Orc_Skull.glb` (masse cloutée) | Peau rouge-noir, crâne gardé en os, échelle 1,5 à 1,6. |
| **Bêtes : loups / chiens de l'enfer** | `quaternius-ultimate-animated-animals/Wolf.glb` | Gris-noir, yeux émissifs rouges (`Eyes_Black`). Échelle 1,0 ; ×1,3 pour un chef de meute. |
| **Bêtes : araignées** | `quaternius-easy-enemy/Spider.glb` | Noir / violet. Échelle ×0,5 à ×1 selon la variante. |
| **Chauves-souris** (Tombeaux) | `quaternius-animated-monster/Bat.glb` | Teinte brune ou noire, échelle petite. |
| **Yéti** (Harrogath, acte 5) | `quaternius-ultimate-monsters/Yeti.glb` | Pelage gris-blanc sale, échelle 1,3. |
| **Spectre / fantôme** (Worldstone, sbires de Baal) | `Ghost_Skull_Flying.glb` | Rendu semi-transparent et additif, teinte bleu-vert. |
| **Hell Bovine** (Niveau des vaches) | `quaternius-ultimate-animated-character/Cow.glb` : **vache humanoïde debout** | Masquer ou retinter le costume (`Shirt`, `Black`, `Belt`, `Details`) en cuir brun et fourrure. Hallebarde / hache `accessories/axe_2handed.gltf` (KayKit) sur `Fist.R`. Échelle 1,15. Clips `SwordSlash`, `Punch`, `Walk`, `Run`, `RecieveHit`, `Death`. |
| **Roi des Vaches** | Même `Cow.glb` (humanoïde) | Échelle 1,5, `props/quaternius-ultimate-rpg/Crown.glb` sur l'os `Head`, teinte plus sombre, halo rouge. |
| Vaches de décor / charge enragée | `quaternius-ultimate-animated-animals/Cow.glb` et `Bull.glb` (quadrupèdes) | Ambiance à Tristram (vache). Le taureau sert de variante « chargeur » au Niveau des vaches (`Gallop`, `Attack_Headbutt`). |
| **Baal (boss)** | `quaternius-ultimate-monsters/Tribal.glb` : grand corps élancé masqué, griffes | Échelle ×2,4. Atlas remplacé ou multiplié par un violet sombre / noir. Masque retinté os et chair. Émissif rouge sur les yeux. Aura et particules ajoutées par la chaîne. Alternative : `Demon.glb` à ×2,5. |
| **Vagues de Baal** | V1 (Colenzo + conseil) : `Skeleton_Mage` teinte rouge / or ; V2 (Achmel, momies) : `Zombie_Male` momie ; V3 (Bartuc, démons) : `Demon` ; V4 (Ventar, Venom Lords) : `Demon` teinte verte ; V5 (Lister, Minions of Destruction) : `Orc_Skull` ×1,6 | Les chefs d'élite : même modèle, échelle ×1,2 et aura colorée. |
| Gros démon de secours pour le Roi des Vaches | Sans objet : la vache humanoïde existe | Si besoin : `Orc_Skull` ×1,6 avec `Crown`. |

## 5. Animations disponibles par modèle et correspondance

Durées en secondes. « — » veut dire que le clip n'existe pas (voir la section « Manques »).

| Modèle | idle | walk | run | attack | cast | hit | death | Autres clips utiles |
|---|---|---|---|---|---|---|---|---|
| KayKit `Rogue`, `Rogue_Hooded`, `Mage` (76 clips, 41 os) | `Idle` 1,07 | `Walking_A` 1,07 | `Running_A` 0,8 | `1H_Melee_Attack_Stab` 1,6 | `Spellcast_Shoot` 0,93 / `Spellcast_Raise` 2,1 / `Spellcast_Long` 2,53 | `Hit_A` 0,67 | `Death_A` 0,8 / `Death_B` 2,63 | Dodge_*, Block*, PickUp, Throw, Cheer |
| KayKit `Skeleton_Warrior` (95 clips, 41 os) | `Idle_Combat` 4,27 / `Idle` | `Walking_D_Skeletons` 1,6 | `Running_C` 0,8 | `1H_Melee_Attack_Chop` 1,07, `2H_Melee_Attack_Chop` 1,63 | `Taunt` 1,03 | `Hit_A` / `Block_Hit` | `Death_C_Skeletons` 2,0 (effondrement en os) | `Skeletons_Awaken_Floor(_Long)`, `Spawn_Ground_Skeletons` 3,57, `Death_C_Skeletons_Resurrect` 2,7 |
| KayKit `Skeleton_Rogue` (archer) | `Idle_Combat` | `Walking_D_Skeletons` | `Running_C` | `1H_Ranged_Shoot` 1,07 (+ `Aiming`, `Reload`) | `Throw` 1,37 | `Hit_B` 0,87 | `Death_C_Skeletons` | idem |
| KayKit `Skeleton_Mage` | `Idle_B` 2,13 | `Walking_D_Skeletons` | `Running_C` | `Spellcast_Shoot` 0,93 | `Spellcast_Summon` 4,3 / `Spellcast_Raise` 2,1 | `Hit_A` | `Death_C_Skeletons` | idem |
| KayKit `Skeleton_Minion` | `Idle` | `Walking_D_Skeletons` | `Running_C` | `Unarmed_Melee_Attack_Punch_A` 1,47 / `1H_Melee_Attack_Chop` | — | `Hit_A` | `Death_C_Skeletons` | Spawn/Awaken |
| Quaternius UAC `Zombie_Male`, `Zombie_Female`, `Cow`, `Goblin_Male` (17 clips, 23 os) | `Idle` 4,17 | `Walk` 1,25 | `Run` 0,88 | `Punch` 0,75 / `SwordSlash` 1,04 | `Shoot_OneHanded` 0,54 (lancer ou sort bref) | `RecieveHit` 0,63 | `Death` 2,29 | `Defeat`, `Victory`, `Roll`, `Jump` |
| Quaternius Ultimate Monsters `Demon`, `Tribal`, `Orc_Skull`, `Yeti`, `BlueDemon` (14 clips, 43 os) | `Idle` 1,0 | `Walk` 1,0 | `Run` 0,57 | `Punch` 0,87 / `Weapon` 0,87 | `Wave` 1,67 (bras levé, sert de cast pour Baal) / `Yes` | `HitReact` 0,6 | `Death` 0,77 | `Duck`, `Jump*`, `No` |
| Quaternius `Ghost_Skull_Flying` (8 clips) | `Flying_Idle` 1,17 | `Flying_Idle` (déplacement en glissé) | `Fast_Flying` 0,83 | `Punch` 1,17 / `Headbutt` 1,17 | `Yes` 1,17 | `HitReact` 0,47 | `Death` 0,67 | — |
| Quaternius `Wolf` (12 clips, 51 os) | `Idle` 3,33 | `Walk` 1,07 | `Gallop` 0,57 | `Attack` 1,33 | — | `Idle_HitReact1` 0,67 | `Death` 1,07 | `Gallop_Jump` (bond), `Eating` |
| Quaternius `Cow`, `Bull` quadrupèdes (13 clips, 42 os) | `Idle` 3,33 | `Walk` 1,17 | `Gallop` 0,6 | `Attack_Headbutt` 1,03 / `Attack_Kick` 1,0 | — | `Idle_HitReact1` 0,67 | `Death` 1,0 | `Eating`, `Idle_Headlow` |
| Quaternius `Spider` (5 clips, 39 os) | `Spider_Idle` 4,17 | `Spider_Walk` 0,83 | `Spider_Walk` accéléré ×1,5 | `Spider_Attack` 0,75 | `Spider_Jump` 0,71 (bond, projection de venin) | — | `Spider_Death` 1,04 | — |
| Quaternius `Bat` (5 clips, 23 os) | `Bat_Flying` 1,25 | `Bat_Flying` | `Bat_Flying` accéléré | `Bat_Attack` 0,88 / `Bat_Attack2` 1,25 | — | `Bat_Hit` 1,25 | `Bat_Death` 1,21 | — |

Les clips des modèles convertis depuis FBX portent le préfixe de l'armature
(`SpiderArmature|Spider_Attack`, `BatArmature|Bat_Hit`). La chaîne doit les résoudre par
suffixe.

## 6. Décor par zone

| Zone | Éléments | Sources |
|---|---|---|
| **Tristram** (village) | Maisons à colombages (`House_1`, `House_2`, `Inn`, `Blacksmith`, `Stable`, `Bell_Tower`), puits (`Well`), charrette (`Cart`), étal (`MarketStand_1`), foin, chaudron, clôtures (`Fence` Quaternius, `fence_wood_straight` KayKit), ruines (`building_destroyed`, `building_scaffolding`), église (`building_church_red`), arbres morts (`tree_dead_*`), rochers (`rock_single_A..E`, `Rock_1`), cimetière (`grave_*`, `gravestone`, `gravemarker_*`, `crypt`, `fence*` grilles, `lantern_*`, `post_skull`), vache de décor | quaternius-medieval-village, kaykit-medieval-hexagon, kaykit-halloween-bits ; sols `brown_mud_leaves_01`, `burned_ground_01`, `forrest_ground_01`, `cobblestone_floor_04` |
| **Tombeaux** (Tal Rasha) | Murs et sols modulaires, arches (`wall_arched`, `wall_doorway*`), piliers et colonnes, escaliers, torches murales, sarcophages (`coffin_decorated`, `coffin`, `crypt`, `shrine(_candles)`, `plaque_candles` Halloween), os et crânes, gravats, coffres | kaykit-dungeon-remastered, kaykit-halloween-bits ; sol et murs `large_sandstone_blocks_01` (teinte sable) |
| **Trône de Baal / Worldstone** | Mêmes murs de donjon reteintés pierre sombre, `pillar_decorated`, bannières rouges, grilles et pics (`floor_tile_big_spikes`, `floor_tile_*grate*`), cristaux (`Crystal1..5` + `_Damaged`, violet ou rouge émissif), candélabres | kaykit-dungeon-remastered, quaternius-ultimate-rpg ; `monastery_stone_floor`, `castle_brick_07` |
| **Harrogath** | Murs de pierre (`wall_straight`, `wall_corner_*`, `wall_straight_gate`, `fence_stone_*`), maisons en pierre à toit plat (`House_3`, `House_4`), tours (`building_tower_A/B_red`), caserne, tentes (`Tent` Quaternius, `tent` KayKit), feu de camp (`Bonfire_Lit`, `Bonfire_Fire`), torches (`WoodenTorch_Fire`), râtelier d'armes, drapeaux | kaykit-medieval-hexagon, quaternius-medieval-village, quaternius-survival ; `snow_02`, `cobblestone_floor_04` |
| **Props communs** | Coffres (`chest`, `chest_gold`, `Chest_Closed/Open`, `trunk_*`), tonneaux, caisses, tonnelets, bannières, cristaux, butin (`Coin`, `Ring1/2`, `Necklace1`, `Potion1..3_Filled`, `Scroll`, `Book1_Closed`, `Crown`) | dungeon-remastered, medieval-hexagon/props, ultimate-rpg |
| **UI** | Cadres, panneaux et séparateurs (Fantasy UI Borders), barres, boutons et slots (UI Pack RPG Expansion) ; polices Cinzel (titres), Alegreya SC (UI, stats) ; Cinzel Decorative et IM FELL English, prévues au départ, ne sont pas utilisées | kenney, google/fonts |

Pour les bâtiments du pack hexagonal, le socle est intégré au mesh (marches, fondations). À
l'orthographique isométrique, le rendu ne gêne pas ; la chaîne peut au besoin rogner sous
y = 0. Les packs KayKit partagent un atlas de couleurs par pack (`dungeon_texture.png`,
`halloweenbits_texture.png`, `hexagons_medieval.png`). Une reteinte globale (désaturation +
multiplication) suffit pour obtenir l'ambiance gothique.

## 7. Manques identifiés et solution retenue

Aucun placeholder : chaque manque est couvert par un modèle réel adapté.

| Manque | Solution retenue |
|---|---|
| Pas de modèle de **sorcière gothique** dédié | KayKit `Rogue_Hooded` (femme) reteint, avec bâton ou grimoire KayKit sur `handslot.r/l`. Ce rig KayKit a le jeu de sorts le plus complet (4 clips de cast). |
| Pas de **momie** libre animée trouvée (CC0) | `Zombie_Male` et `Zombie_Female` (Quaternius) reteints en lin par nom de matériau, yeux émissifs, silhouette agrandie. |
| Pas de **grand démon** libre animé de qualité boss | `Tribal` (Ultimate Monsters) à l'échelle ×2,4, reteint et avec aura. Alternative : `Demon` ×2,5. Le style reste « cartoon » : la teinte sombre, l'éclairage rasant et la pixellisation du pré-rendu atténuent ce décalage. |
| Pas de **Hell Bovine armé** tout fait | Vache humanoïde `Cow.glb` (UAC), costume retinté, hache à 2 mains KayKit attachée à `Fist.R`, clip `SwordSlash`. Roi des Vaches : même modèle ×1,5 + `Crown.glb`. |
| **Hit** absent sur `Spider` | Recul et flash blanc procéduraux sur 2 à 3 frames rendus par la chaîne, dérivés de la frame 0 de `Spider_Walk`. |
| **Cast** absent sur les bêtes et les zombies | Pas nécessaire : ces monstres sont de mêlée. Pour les zombies ou momies lanceurs : `Shoot_OneHanded`. |
| **Run** absent sur `Spider` et `Bat` | `Walk` ou `Flying` rendu avec `timeScale` 1,5. |
| Clips à **racine immobile** (in-place) | Vérifié sur les pistes de translation de `hips`/`Body` : walk et run sont in-place partout (seul un rebond vertical de 0,05 à 0,3 est présent), ce qui convient au pré-rendu. Seuls les `Dodge_*` KayKit déplacent `root` (0,25) : la chaîne doit neutraliser `root.position` pour ces clips. |
| **Styles hétérogènes** (KayKit chibi texturé en atlas / Quaternius low poly à couleurs unies) | Unifiés par la chaîne : même éclairage, palette gothique appliquée par matériau, contour sombre, réduction de palette. |
| Pas d'**HDRI** conservé | Éclairage directionnel et ambiant dans Three.js (plus contrôlable pour des sprites). Un HDRI sombre Poly Haven peut être ajouté plus tard si besoin (environ 1,5 Mo en 1K). |
| Pas de **PNJ** pour Harrogath et Tristram | Hors périmètre demandé. `Mage.glb` et les packs UAC (Viking, Knight, Wizard, disponibles au besoin) peuvent servir de PNJ reteints. |

## 8. Crédits (texte prêt à afficher dans le jeu)

```
CRÉDITS — RESSOURCES LIBRES

Modèles 3D
  KayKit — Adventurers, Skeletons, Dungeon Remastered, Halloween Bits,
  Medieval Hexagon — par Kay Lousberg (www.kaylousberg.com) — CC0
  Ultimate Animated Character, Ultimate Monsters, Ultimate Animated Animals,
  Easy Enemy, Animated Monsters, Medieval Village, Survival, Ultimate RPG —
  par Quaternius (quaternius.com) — CC0

Textures
  Poly Haven (polyhaven.com) — Rob Tuytel, Amal Kumar — CC0

Interface
  UI Pack RPG Expansion, Fantasy UI Borders — par Kenney (www.kenney.nl) — CC0

Icônes
  game-icons.net — Lorc, Delapouite, sbed, Felbrigg, Carl Olsen et contributeurs — CC BY 3.0

Sons
  RPG Audio, Impact Sounds, Interface Sounds, Sci-Fi Sounds — par Kenney (www.kenney.nl) — CC0

Polices
  Cinzel & Cinzel Decorative — Natanael Gama — SIL Open Font License 1.1
  IM FELL English — Igino Marini — SIL Open Font License 1.1
  Alegreya SC — Juan Pablo del Peral / Huerta Tipográfica — SIL Open Font License 1.1

Merci à ces auteurs de partager leur travail librement.
```


## 9. Icônes d'interface — game-icons.net (CC BY 3.0)

| Élément | Auteurs | Source | Licence vérifiée | Fichiers |
|---|---|---|---|---|
| 267 icônes SVG (compétences des sept classes, boutons, objets) | **Lorc** (242 icônes), **Delapouite** (22 icônes), **sbed** (1 icônes), **Felbrigg** (1 icônes), **Carl Olsen** (1 icônes) | https://game-icons.net (dépôt GitHub `game-icons/icons`) | **CC BY 3.0** : `assets-src/ui/game-icons/LICENSE.txt` (texte du dépôt) + https://game-icons.net/about.html#license | `assets-src/ui/game-icons/<auteur>/<icône>.svg`, correspondance id → fichier dans `icons.txt` |

Transformation : `tools/build-icons.ts` retire le fond noir carré des SVG (le glyphe blanc
reste) et les copie dans `public/icons/` ; le jeu les teinte par masque CSS. Aucune autre
modification du dessin. Attribution affichée dans l'écran « Crédits » (Lorc, Delapouite,
game-icons.net, CC BY 3.0, lien vers la licence).

`public/icons/` contient 288 SVG : 261 viennent directement de `icons.txt`, **24** sont la même forme qu'une icône de `icons.txt` réutilisée
sous l'identifiant d'une autre compétence (alias, même auteur Lorc/Delapouite, même licence), et **3** (`bow`, `polearm`, `type_quiver`) ne
correspondent à aucune icône de game-icons.net (comparaison du tracé avec tout le dépôt `game-icons/icons`) : tracés vectoriels propres au projet,
MIT comme le code. Origine retrouvée dans l'historique du dépôt d'origine `arpg-work` : `bow` et `polearm` créés au commit 4d97a99 (2026-09-29),
`type_quiver` créé en 1a23db2 puis redessiné en 9f2ebc4 (2026-10-06) ; les fichiers actuels sont identiques octet pour octet à ceux de ce dépôt. Le détail icône par icône est dans
`assets-src/ui/game-icons/icons-extra.txt`.

## Note : métadonnées des modèles KayKit

Quatre modèles du pack *Dungeon Remastered* (`chest.glb`, `chest_gold.glb`, `floor_tile_big_spikes.glb`, `wall_doorway.glb`) portent des métadonnées
d'export « BlenderKit » dans leurs `extras` glTF (les modèles ont transité par cet outil avant publication par l'auteur). Le pack est publié par
son auteur sous CC0 ; ces fichiers ne sont pas modifiés ici.
