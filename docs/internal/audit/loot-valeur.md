# Valeur du butin : paliers 3 / 4 / 5

Code : `src/data/items/loot-value.ts` (catalogue), `src/sim/loot/value.ts` (règles), `lootTier()` dans `src/sim/loot/filter.ts`, `recommendedHighlights()` dans `src/sim/loot/highlight.ts`. Test : `tests/unit/loot-value.test.ts`.

## Sources
- Wiki PD2, filtrage d'objets : https://wiki.projectdiablo2.com/wiki/Item_Filtering (syntaxe des filtres)
- Filtre communautaire eqN : https://github.com/eqNj/eqN-PD2-Filter (mise en avant : runes, gemmes parfaites, uniques/sets, bases éthérées élites supérieures, rares de haut niveau d'affixe, « +3 compétences utiles »)
- Liste de valeur uniques/sets (D2R, base commune avec PD2) : https://maxroll.gg/d2/items/valuable-unique-set-items (haut : Annihilus, Arachnid Mesh, Bul-Kathos, Torche, Herald, Highlord's, Griffon's, Death's Web, Harlequin, Mara's, Oculus, Jordan, Tyrael's, Vipermagi, Tal Rasha, War Traveler, Wisp, Crown of Ages, Rainbow Facet…)
- Non consultés faute de temps : pickits Kolbot/NIP et prix du marché PD2 (diablo2.io). Le reste (runes mots runiques, bases à châsses, charmes, score de modificateurs) est dérivé de connaissances générales D2/PD2, non vérifié ligne à ligne.

## Règles
- Runes, monnaies, éclats, cartes : inchangés (runes rang 20-21 -> 3, 22-25 -> 4, 26+ -> 5).
- Uniques : catalogue (7 à 5, 31 à 4, 61 à 3). Non listés : 3 si base élite ET niveau requis >= 60, sinon aucun palier.
- Ensembles : catalogue (9 à 4, 53 à 3). Non listés : même règle que les uniques.
- Mots runiques : table [base ordinaire, base élite ou éthérée] ; non listés : 3.
- Bases sans qualité : bases recherchées (`VALUE_BASES`, châsses minimales) : éthérée avec ce nombre de châsses = 4 ; arme à 6 châsses non éthérée = 3. Toute arme élite à 6 châsses : 4 si éthérée, 3 sinon.
- Magiques, rares, artisanaux : score de modificateurs (`modPoints`) : compétences (+4/niveau de classe, +3/niveau de branche), RC, RA, RFV, vitesse, résistances, vie, MF, ED, etc. Seuils : petit charme 5/8, grand charme 6/10 (ou branche + 3), joyau 4/7, bijoux/gants/bottes/ceinture/diadème 6/9, équipement rare élite 8/12 (paliers 3/4).

## Catalogue
- Palier 5 (7 uniques) : Œil du Griffon (coiffe), Courroux du seigneur suprême, Toile de la Mort, Crête d'Arlequin, Puissance de Tyrael, Annihilus, Torche du feu de l'enfer (objets utilisés par presque tous les builds, ou meilleurs de leur emplacement).
- Palier 4 uniques (31) : Pierre de Jordan, Givre du corbeau, Étoile naine, Alliance de Bul-Kathos, Kaléidoscope de Mara, Maille arachnide, Ire de Skullder, Force du vent, Bouclier-tempête, Oculus, Robes d'Ormus, Voyageur de guerre, Couronne des âges, Héraut de Zakarum, Peau du Vipermage, Brasse (Fathom), Feu follet, Fortune de Gheed, Voile de l'Aile-de-nuit, charmes de brisure (4), facettes arc-en-ciel (8) : meilleurs ou très échangés.
- Palier 4 ensembles : Jugement et Tutelle de Tal Rasha, Cordelière de Trang-Oul, Griffes de Trang-Oul, Cage d'âme du Roi immortel, Honneur et Rédemption de Griswold, Vraie vue de M'avina, Ombre de Natalya.
- Palier 4 mots runiques (toutes bases) : Enigma, Infinity, Call to Arms, Grief, Breath of the Dying, Last Wish, Hand of Justice, Faith, Phoenix, Beast, Doom, Exile (hautes runes) ; sur base élite/éthérée : Fortitude, Chains of Honor, Dream, Bramble, Heart of the Oak et la plupart des mots à runes hautes.
- Palier 3 : le reste des listes (61 uniques, 53 pièces d'ensemble, Spirit/Insight/Lore/Rhyme/Ancient's Pledge sur toute base, bases à 6 châsses, rares/charmes bien lancés).

## Manquants dans notre base
Aucun objet recherché de la liste de départ n'est absent ; les noms PD2 des facettes/briseurs sont portés par `u_sunder_*` (Cold Rupture, Flame Rift, Crack of the Heavens, Bone Break). Non vérifiés (noms exacts PD2 à confirmer) : pièces propres aux 52 uniques PD2 ajoutés (couvertes seulement par la règle générique élite niveau >= 60).

## Limites
- Valeurs d'échange PD2 variables selon la saison : le catalogue est un instantané.
- Les uniques PD2 ajoutés ne sont pas évalués un par un.
- Le score de modificateurs ignore le type de classe du joueur et la synergie (par exemple RC utile aux seuls lanceurs).
- Bases éthérées : seules les bases du tableau `VALUE_BASES` sont reconnues.
