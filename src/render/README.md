# src/render — rendu Pixi.js

Dessine le monde : lit l'état de la simulation (`World`) et ses événements (`SimEvent`), **n'écrit jamais dedans** (vérifié par
`tests/unit/architecture.test.ts`). Projection, budget de textures, chaîne de pré-rendu : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Points d'entrée

| Fichier | Rôle |
|---|---|
| `renderer.ts` | **`GameRenderer`** : `init(stage, qualité, moteur)`, `setZone(zone)`, `render(world, alpha, dt, events, opts)`, qualité, filtre d'image, lumière dynamique, mémoire de textures. Le travail est réparti dans des modules liés à l'instance : `renderer-actors.ts` (joueur, monstres, équipement porté), `renderer-world.ts` (objets au sol, décor, projectiles, zones d'effet, occlusion, lumières), `renderer-fx.ts` (particules, nombres, éclairs, réaction aux événements), `renderer-assets.ts` (planification et préchargement des planches d'une zone), `renderer-seams.ts` (lot 312 : les zones jointes bord à bord habillées comme la zone — décor, accessoires, lumières au-delà du bord —, l'ordre fixe de leurs sols, la traversée faite sur la scène gardée, `swapAtSeam`). `renderer-shared.ts` : constantes et fonctions pures communes. |
| `assets.ts` | **`SpriteBank`** : planches pré-rendues chargées zone par zone, libération, mesure (`gpuBytes`) ; `d2Info` (mode des graphismes Diablo II : `off`, `plain` ou `enc`, et `local` pour les graphismes générés sur l’appareil) et écran de mot de passe du mode `enc`. |
| `iso.ts` | Projection isométrique 2:1, identique à la caméra de la chaîne de pré-rendu (la simulation l'ignore). |
| `ground.ts`, `groundcover.ts`, `d2ground.ts`, `d2map.ts` | Sol (tuiles, taches), objets posés au sol, cartes de ville D2 importées. |
| `engine.ts`, `image-quality.ts`, `dynamic-light.ts` | Logique **pure** (sans Pixi ni DOM, testée) : choix WebGL / WebGPU, paramètres du filtre d'image, couche de lumière. `image-filter.ts` : le shader correspondant. |
| `fx.ts`, `roster.ts`, `gear-look.ts`, `weapon-look.ts`, `armor-tier.ts` | Effets D2 importés, distribution d'une zone (mode local), apparence des pièces d'équipement portées. |
| `d2crypto.ts` | Chargeur optionnel de ressources chiffrées (mode `enc`). |

## Invariants

- Rendu interpolé : `alpha` (fraction du pas en cours) sert seulement à l'affichage ; aucune décision n'en dépend.
- Une qualité (`QUALITY_PRESETS`) change résolution, lumière et particules, jamais la simulation.
- Les planches sont désignées par identifiant (`<classe>_<pièce>`, `fx_<nom>`…) : un identifiant absent ne bloque pas le jeu (repli sur les
  sprites libres, sauf en mode local sans repli).

## Pièges

- Les modules `renderer-*.ts` reçoivent `this: GameRenderer` : les membres qu'ils lisent sont publics pour cette raison ; ne pas les
  utiliser depuis l'extérieur du dossier.
- La perte du contexte WebGL est gérée par l'application (`App`) : sauvegarde, puis rechargement des textures à la restauration.
- Les tests unitaires couvrent surtout la logique pure (`renderer-pure.test.ts`, `render-engine.test.ts`, `dynamic-light.test.ts`,
  `image-quality.test.ts`) ; le rendu lui-même se vérifie par captures (`tools/e2e`, voir son README).
