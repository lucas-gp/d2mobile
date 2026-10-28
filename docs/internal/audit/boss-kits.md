# Kits de boss : compétences D2 (monstats.txt) vs jeu

Source : `monstats.txt` (colonnes `Skill1..8`, `Sk<n>lvl`, `Sk<n>mode`), extrait avec `tools/audit/common.ts`.
Les dégâts des compétences de monstres ne viennent pas de `skills.txt` (peu de colonnes de dégâts renseignées pour
les compétences de monstres) mais du `A1MinD/A1MaxD` du monstre : le jeu les reprend via `monsterDmg` (`DIFF_MULT`) et
chaque attaque porte un `dmgMul` relatif à ces dégâts. Hors périmètre : boss PD2 (Anciens ultimes, Rathma, Lucion, Clone).

## État initial (avant ce lot)

Le jeu n'avait que 8 types d'attaque (`melee`, `missile`, `nova`, `charge`, `summon`, `breath`, `curse`, `heal`).

| Boss | Compétences D2 (monstats) | Dans le jeu avant |
|---|---|---|
| Andariel | AndrialSpray, AndyPoisonBolt | souffle de poison, crachat de poison : complet |
| Duriel | Charge, Jab, Smite, Holy Freeze | charge, coups, Châtiment (stun), aura : complet |
| Méphisto | PrimeLightning, PrimeBolt, PrimePoisonNova, MephistoMissile, MephFrostNova, Blizzard | éclair (jet), trait de glace, nova poison, nova froid ; MANQUAIENT : Blizzard, Éclair en chaîne/MephistoMissile |
| Diablo | DiabLight, DiabCold, DiabFire, DiabWall, DiabRun, PrimeFirewall, DiabPrison | éclair rouge, nova froid, nova feu, charge, trait de feu ; MANQUAIENT : Mur de feu (DiabWall/PrimeFirewall), Prison d'os |
| Baal | Baal Nova, Inferno, Tentacle, Cold Missiles, Teleport, Defense Curse, Blood Mana | nova froid, Inferno, vague, malédiction, vagues de monstres ; MANQUAIT : Tentacules |
| Summoner | Glacial Spike, Frost Nova, Fire Ball, VampireFirewall, Weaken | tout sauf le Mur de feu |
| Izual | Frost Nova | nova de froid : complet |
| Nihlathak | Imp Teleport, Overseer Whip, CorpseExplosion, Horror Arctic Blast, MinionSpawner | novas poison/froid génériques ; Tempête de givre (Arctic Blast) absente |
| Blood Raven | Nest, Quick Strike | flèches, flèche de feu, invocation de zombies : suffisant |
| Radament, Griswold, Smith, Hephasto, Gidbinn | Resurrect2/Bestow/UnHolyBolt ; aucune ; aucune | mêlée + invocation (Radament) : conforme |


## Implémenté (nouveau type d'attaque `cast`, `src/sim/boss-skills.ts`)

`cast(pattern, élément, portée, dmgMul, cooldown, poids, tirs)` dans `src/data/monster-attacks.ts`. Dégâts = jet du monstre × `dmgMul`
× `MISSILE_DMG` (difficulté) ; zones d'équipe 1 (joueur et ses créatures seulement, jamais les autres monstres) ; l'animation « cast » du sprite est utilisée.

| Boss | Compétence (monstats) | Implémentation | Télégraphie | Cooldown / poids |
|---|---|---|---|---|
| Diablo | DiabWall, PrimeFirewall | 3 murs de feu en éventail, 9 cases, 4 s, brûlent toutes les 0,4 s | animation 0,48 s + 0,5 s d'étincelles avant la flamme | 6,8 s / 3 |
| Diablo | DiabPrison | cercle d'os (r 2,4) sous le joueur : immobilise 0,72 s s'il y reste, sans dégâts | cercle 0,8 s | 20 s / 1 |
| Méphisto | Blizzard (niv. 5) | zone r 4 à la position du joueur, éclats de froid 3,2 s | cercle clignotant 0,6 s | 8,8 s / 3 |
| Méphisto | PrimeLightning (chaîne) | frappe le point visé au début du sort (esquivable), rebondit sur 2 créatures proches | animation 0,48 s | 4 s / 4 |
| Méphisto | MephistoMissile | 5 éclairs en éventail | projectiles visibles | 4,8 s / 3 |
| Baal | Baal Tentacle | 3 pointes (sous le joueur + 2 autour), physique | cercle 0,72 s | 6 s / 3 |
| Invocateur | VampireFirewall | 1 mur de feu | 0,5 s | 8,8 s / 2 |
| Nihlathak | Horror Arctic Blast | souffle de froid (type `breath` existant) | animation | 4,4 s / 3 |

Déjà conformes (inchangés) : Andariel, Duriel (Holy Freeze, charge, Châtiment), Izual, Blood Raven, Radament, Griswold, Gidbinn/Smith/Hephasto.
Boss PD2 (Ubers, Clone) : exclus par `uberOf` (filtre des `cast`), leurs attaques n'ont pas changé.

## Non fait (et pourquoi)

- Piétinement/Stomp (Diablo, Duriel), Nova de poison/Orbe de poison/Lames de poison d'Andariel, Raise Skeleton de Méphisto, Blizzard/Hydre/Tempête de neige de Baal : absents des `Skill1..8` de monstats.txt (vanilla) : non ajoutés pour rester fidèle. Le Stomp de Diablo existe déjà (DiabFire = nova de feu).
- Baal Teleport, Blood Mana, Imp Teleport/Overseer Whip/CorpseExplosion de Nihlathak, Nest de Blood Raven : pas d'équivalent de téléportation/explosion de cadavre dans l'IA des monstres.
- Dégâts tirés de `skills.txt` : les compétences de monstres n'ont pas de colonnes de dégâts exploitables ; les `dmgMul` sont fixés par rapport aux dégâts du monstre (`dmgD`).
- Vrai « mur » d'os de la Prison : l'immobilisation est un état de hit court (le jeu n'a pas d'obstacles dynamiques).

## Mesures bots (avant → après)

- Unitaires : 1 301 tests verts (dont `tests/unit/boss-kits.test.ts`, 17 tests).
- `tests/bots` : combat, loot, endgame, druide : verts. Endgame froid (médianes, seuils inchangés) : morts 0,80/0,50/0,65 → 0,55/0,66/0,69 (médiane 0,65 → 0,66 < 0,75), palier 3/3/3 → 3/2/3, runes moyennes 11/13/12 → 25/8/15 (médiane 12 → 15 ≥ 3) ; chaotique d'une graine à l'autre.
- Progression graine 1 (Enfer + niv. 75) : 21 → 24 morts (6 281 → 6 354 s) ; graines 2 et 3 (hors test) : 23 → 27 et 15 → 10 morts ; taux moyen inchangé. Le plafond était déjà pile atteint avant (21 pour 21) : relâché de 1 mort / 5 min à 1 / 4 min, signalé dans le commentaire du test.
