# Audit de fidélité à Diablo II / Project Diablo 2

Audit en lecture seule du contenu du jeu (données vanilla 1.13 : `fabd/diablo2` ; PD2 S13 :
`coleestrin/pd2-tools` ; wiki PD2 consulté, certaines affirmations restent à recouper avec la source). Les corrections sont suivies dans `docs/JOURNAL.md` (case « Audit »). Confiance : H = haute,
M = moyenne.

## Déjà fidèle (vérifié)
Déblocage des difficultés par la mort de Baal et pénalités −40 / −100 ; niveaux de zone (Tristram NM 39,
Tombes 17/49, Vaches 28/64/81, Baal 43/66/85) ; niveaux et ordre des 33 runes ; gemmes 7 × 5 (sauf le
diamant sur arme) ; recettes de châsses du Cube ; tables de corruption ; ~27 des 39 runewords ; noms et
paliers des cartes T1-T3 ; boîte à énigme ; Ascendant d'acte IV ; 170 bases sur 208.

## Écarts par priorité
1. **Sets (H)** — bonus faux pour 8 des 9 sets (Hwanin correct). Un set « Yeux » inventé. Sets D2
   absents : Griswold, Milabrega, Arctic, Immortal King, Natalya, Sazabi, Trang-Oul, M'avina, Bul-Kathos.
   Tal Rasha PD2 : 2p Replenish +10 ; 3p MF 50 ; 4p FHR 25 ; complet Sorc +3, déf 150, vie 150, rés 50.
2. **Uniques inventés (H)** — Eagle Eye, Ember Heart, Kurast's Mist, Horazon's Memory (orbes) ; Faucheuse
   de Sang ; Toge de l'archonte ; Carapace laquée ; Croissant de lune, Plume de tempête, Sylve verte
   (peaux) ; Cercle d'Akara ; Couronne du voyant. Les orbes n'ont que 3 uniques (Oculus, Eschuta,
   Death's Fathom). À supprimer ou étiqueter « original » ; ajouter Epiphany, Hadriel's Hand, Fenris,
   Wildspeaker, Ursa's Nightmare…
3. **Uniques : bases et niveaux (H)** — Lance Guard (D2 : Barbed Shield), Bonehew (Ogre Axe), Tomb Reaver
   (Cryptic Axe), Soul Harvest (Scythe), Suicide Branch (Burnt Wand) ; « Tranchant de cristal » =
   Gleamscythe ; `lvl` divergent pour ~30 des 45 uniques.
4. **Uniques : stats (H)** — lignes vanilla 1.10, pas PD2 : Mang Song PD2 +6 comp., FCR 85 ; Shako DR 4-6 % ;
   Spire of Lazarus / Salamander +2-3 ; Skull Collector +2-3, FCR 60 ; Oculus +2-3 + chance de Téléport ;
   Cerberus Bite Shapeshifting +3-4.
5. **Charmes de brisure (M-H)** — mécanique D2R, non implémentée dans PD2 ; casser les immunités par
   Conviction, Lower Resist, mercenaire (½ contre immunisés).
6. **Runewords (H)** — « Conclave » et « Vigilance » absents des 103 PD2 : à supprimer ; Pattern = Tal Ort
   Tir ; White = Nécro (+2 Poison & Bone) ; Enigma PD2 : Blink niv. 1, def 500-775, +25 % FRW ; Spirit :
   +1 comp., +2 sur bâton, mana 59-82 ; Stealth FRW 10 / FCR 20 / FHR 20 ; Memory +4 toutes comp. ;
   Prudence +40 FCR. Ajouter Delirium, Radiance, Bramble, Innocence, Ferocity, Dragon, Shattered Wall,
   Rapture, Zenith, Dominion, Asylum, Melody, Loyalty… (39 sur 103 présents).
7. **Baal, vagues (H)** — Colenzo + Warped Shamans ; Achmel + Unravelers + Burning Dead ; Bartuc + Council
   Members ; Ventar + Venom Lords ✓ ; Lister + Minions ✓. Baal (MonStats) : nova de froid, Inferno,
   tentacules, missiles froids, téléport, malédiction de défense, mana de sang ; il n'invoque pas de sbires.
8. **Chaos (H)** — zone 28/58/85 (jeu : 34/62/85) ; Vizir = Storm Caster, De Seis = Oblivion Knight ;
   Diablo : DiabLight, DiabCold, DiabFire, DiabWall, DiabRun, PrimeFirewall, DiabPrison ; rés 45/50/50/50/50
   en Enfer.
9. **Duriel et Tombes (H)** — kit : Charge, Jab, Smite + aura Holy Freeze ; rés Enfer : phys 50, magie 33,
   feu/foudre/poison 75, froid 95 ; niveau de boss 22/55/88.
10. **Monstres inventés (H)** — « Momie ancienne » n'existe pas ; « Tueur d'âmes » est d'acte III ; Seigneur
    de sang avec Trait de feu (Blood Lord : Frenzy en mêlée) ; Cow King foudre inventé. Remplacer par
    Warped Shaman, Unraveler, Storm Caster, Balrog…
11. **Résistances Enfer (H)** — Fallen feu 100 (Hell) ; Shaman 25/50/100 ; Zombie froid 120, poison 50/75/75 ;
    Squelette foudre 100 ; Archer poison 100 ; Griswold phys 50, foudre 50, poison 120 ; Bovin tout 50 ;
    Minion of Destruction feu 120, poison 95 ; Venom Lord feu 95, poison 120 ; Oblivion Knight froid 180 ;
    Scarabée foudre 100-115 seulement en Enfer.
12. **Niveaux de boss (H)** — Griswold 5/39/84 ; Duriel 22/55/88 ; Diablo 40/62/94 ; Baal 60/75/99 ;
    sous-boss de Baal 40/55-68/83-93.
13. **Cartes (M)** — uniques mal classés (Ureh T3, Na-Krul T1, Zhar T1+2), Outer Void et Stygian Caverns
    absentes, 6/4/4 cartes contre 8/9/9, affixes Crimson/Azure/Opal = absorption 4-10 % en PD2, accès niveau
    80 + Anciens tués en Enfer, pas de zones corrompues.
14. **Effets des runes (H)** — faux pour Eld, Nef, Ith, Tal, Amn, Dol, Pul, Mal, Gul, Jah, Sur ; PD2 non
    appliqué : Dol +20 % ED, Pul armure +50 %, Um arme 10 % OW +120, Amn 20/24. Diamant sur arme faux.
15. **Bases (M)** — Mesh Armor en palier 0, Coronet en palier 1 ; valeurs vanilla au lieu de PD2 : Dusk
    Shroud 270-302, Lacquered Plate 573-664, Mage Plate 178-187, Breast Plate 56-58 ; Grim Shield 2 châsses.
16. **Mort et récompenses (H/faible)** — pénalité XP Normal = 0, Cauchemar 5 %, Enfer 10 % ; quêtes de
    récompense mal attribuées (Baal/Anya, Vaches/Lam Esen) ; pas de barrière de niveau en D2.
17. **Druide (M)** — chiffres vanilla 1.10 ; S13 : Eruption, Cycle of Life, Gust, Plague Poppy.

## Absent du jeu (par valeur pour la fidélité)
1. Pandemonium Event : clés Terror/Hate/Destruction, mini-ubers (Lilith, Uber Duriel, Uber Izual), Uber
   Tristram, Hellfire Torch, Annihilus.
2. Uber Ancients (sigils → Standard of Heroes), Outer Void, cartes uniques manquantes.
3. Zones corrompues (zones vanilla à 85, éclats de Pierre-Monde).
4. Événements de carte : Dark Wanderer, Shadow of Mendeln, Spire of Darkness, Altar of the Catalyst, Gheed,
   Invasion, Catalyst Shard, Infusions.
5. Boss de farm : Countess, Andariel, Mephisto (Durance), Hellforge, Pindleskin, Eldritch/Shenk,
   Nihlathak, Anciens.
6. Rathma (Voidstone), Lucion, DClone, Demonic Cube, Lilith's Mirror, Vial of Lightsong, Token of
   Absolution, Desecration.
7. Catalogue : items PD2 (Horadric Almanac), carquois, ~65 runewords, ~15 cartes, ~25 affixes de carte,
   cristaux corrompus, boss de carte « prime evil ».


## Suivi des corrections (mis à jour)

- **Sets (n° 1)** : les 32 sets D2 et 125 pièces sont générés depuis SetItems/Sets.txt (`tools/itemdata/gen-uniques.py`
  → `sets-d2.ts`) ; Tal Rasha reprend les bonus PD2. Le set « Yeux » et les autres sets inventés sont supprimés.
- **Uniques (n° 2-4)** : 370 uniques D2 générés depuis UniqueItems.txt (bases, niveaux, propriétés D2 ; procs, auras,
  épines, niveau du personnage, dégâts aux morts-vivants/démons… appliqués). Les uniques inventés sont supprimés ; les
  charmes de brisure PD2 restent. Restent à aligner sur PD2 : lignes que PD2 a modifiées (Mang Song, Shako, Oculus…)
  faute de table PD2 des uniques dans les sources disponibles.
- **Mots runiques (n° 6)** : les 103 de PD2, propriétés lues de `rw.txt` (85 avec propriétés publiées ; 18 « NEW » sans
  valeurs sont omis, rien n'est inventé). Conclave et Vigilance supprimés.
- **Résistances Enfer (n° 11)** et **niveaux de boss (n° 12)** : lus de MonStats.txt PD2 S13 (`gen-monres.py`, `bossLevel`).
- **Runes (n° 14)** : effets D2 (Gems.txt) + écarts PD2 connus ; effets sans équivalent (endurance, défense contre les
  projectiles, aveuglement, anti-soin) non simulés.
- **Bases (n° 15)** : défenses, niveaux, forces requises et châsses alignés sur Armor.txt PD2 / Weapons.txt.
- **Mort (n° 16)** : pénalité d'expérience 0 / 5 / 10 %.
- **Baal (n° 7)** : vagues PD2 (Chaman déformé, Démêleur, Morts brûlants, Membres du Conseil, Seigneurs venimeux,
  Sbires) ; kit : nova de froid, missiles de froid, Inferno, sans sbires invoqués. Sprites réutilisés et teintés
  (« à valider sur image »).
- **Chaos (n° 8)** : zones 28 / 58 / 85 ; De Seis = Chevalier de l'oubli ; gardiens de sceaux plafonnés à 90 % de
  résistance (jamais immunisés). Reste : Vizir = Storm Caster (absent), kit détaillé de Diablo (mur de feu, prison d'os).
- **Duriel (n° 9)** : Charge, Jab, Smite et aura Holy Freeze ; résistances Enfer et niveaux de boss PD2.
- **Monstres (n° 10)** : « Momie ancienne » renommée Démêleur (Unraveler) et retirée des Tombeaux ; Seigneur de sang en
  mêlée seule (Frénésie). Restent : Tueur d'âmes (acte III) à remplacer, Storm Caster.
- **Druide (n° 17)** : arbres et prérequis PD2 S13 (31 compétences) — Éruption, Rafale, Pavot pestilentiel, Cycle de la vie, Lianes,
  Fenris, Maîtrise des formes. Sémantiques approchées : Rafale sans dégâts, Lianes/Cycle de la vie/Maîtrise des formes reprennent les
  effets vanilla.
- **Classes D2 (ajouté)** : Barbare, Paladin, Amazone, Assassin, Nécromancien et Sorcière alignés sur Skills13/SkillDesc13
  (`tools/skilldata/`). Restent : Maîtrise des malédictions multi-malédictions, splash, auras de groupe Dopplezon/Valkyrie.
- **Boss de farm** (Absent du jeu n° 5) : Comtesse, Andariel, Méphisto ajoutés ; restent Pindleskin, Eldritch/Shenk, Nihlathak, Anciens, Hellforge (Durance 3 sans Hellforge).
- Non traités : cartes (n° 13) et le reste du § « Absent du jeu ».
