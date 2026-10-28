# TEST-MOBILE — comment le jeu est vérifié sur mobile

## Ce que la machine vérifie seule (`npm run e2e`, dans `npm run validate`)

Chromium headless, rendu WebGL logiciel (SwiftShader), vrais événements tactiles CDP.
Serveur requis : `npm run dev` (ou `--url=` vers un build servi par `npm run preview`).

| Appareil émulé | Paysage (px CSS) | Densité | Encoche simulée |
|---|---|---|---|
| `android-petit` | 740 × 360 | 3 | — |
| `iphone` | 844 × 390 | 3 | 47 px à gauche |
| `grand-ecran` | 932 × 430 | 3 | 59 px à gauche |
| `pliable-ouvert` | 841 × 673 | 2,6 | — |
| `tablette` | 1180 × 820 | 2 | — |

Pour chacun :
1. **HUD** : tous les contrôles dans l'écran et hors encoche, cibles ≥ 40 px CSS, bouton
   d'attaque ≥ 70 px, aucun chevauchement.
2. **Bot tactile** : glissé sur le joystick flottant (le personnage bouge), taps sur
   l'attaque principale (le sort part), compétence maintenue + glissé (visée manuelle, lancée
   au relâcher), inventaire ouvert puis fermé au tap.
3. **Captures** (`test-results/e2e/<appareil>/`) : ville, visée manuelle, inventaire,
   deux vues de combat avec le bot de jeu actif.
4. **Mesures** : intervalle d'images (médiane, p95, pire) et mémoire de textures pendant 20 s
   de combat ; sur `iphone`, second passage **processeur ralenti ×4** (milieu de gamme ancien).
5. Aucune erreur JavaScript, et le bot de jeu tue des monstres dans le vrai client.

**Limite connue** : SwiftShader rend sur le processeur. Les millisecondes mesurées servent à
comparer deux versions entre elles (régressions), **pas** à prédire les FPS d'un téléphone :
un GPU mobile réel est bien plus rapide pour le remplissage de pixels. Les budgets absolus
(60 i/s haut de gamme, ≥ 30 i/s milieu de gamme ancien sur 20 min) se vérifient sur appareil.

## Mode benchmark (sur un téléphone)

Ouvrir le jeu avec `?bench=1` à la fin de l'adresse : une scène fixe (Tristram, bot de jeu,
qualité automatique) tourne 60 s puis affiche médiane/p95 des images, qualité choisie et
mémoire de textures. Ces chiffres sont à reporter dans des notes locales, non versionnées.
L'overlay de performance (Réglages → « Affichage des performances ») montre en continu :
i/s, ms de rendu, palier de qualité, Mo de textures.

## Où jouer

Lancer `npm run dev` (ou `npm run build && npm run preview`) et ouvrir l'adresse affichée depuis le téléphone
(même réseau local, ou hébergement statique de votre choix : voir `.env.example` pour le déploiement facultatif).

## À vérifier sur un vrai téléphone (lot par lot)

À chaque lot, le résumé en tête de `docs/JOURNAL.md` liste « à tester en priorité ». En général :
- installer la PWA (Partager → « Sur l'écran d'accueil ») et lancer hors ligne ;
- jouer 20 minutes d'affilée : fluidité, chauffe, batterie ;
- passer en arrière-plan en pleine run, revenir (la run doit reprendre à l'identique) ;
- fermer l'onglet, rouvrir (reprise de la sauvegarde) ;
- confort des pouces : joystick, visée, bouton d'attaque, lisibilité des étiquettes de butin ;
- noter les retours (notes locales, non versionnées), à reprendre en priorité au lot suivant.
