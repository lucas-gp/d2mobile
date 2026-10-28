# Tests de bout en bout (Playwright)

Scripts Node lancés à la main (pas en CI : ils demandent Chromium et un serveur). Chacun est autonome.

```bash
npm run build && npx vite preview --port 5233 --strictPort &      # ou : npm run dev -- --port 5233
E2E_URL=http://127.0.0.1:5233/ node tools/e2e/<script>.mjs
```

- `E2E_URL` : URL du serveur testé (défaut `http://127.0.0.1:5233/`) ; l'option `--url=...` de chaque script reste prioritaire.
- Navigateur : `PLAYWRIGHT_BROWSERS_PATH=<dossier>` ou `D2_CHROME=<chemin de chrome>` si Playwright ne trouve pas le sien.
- Les captures vont dans `test-results/` (ignoré par git). Rendu logiciel (SwiftShader) : les temps sont relatifs.
- `npm run e2e` lance `mobile.mjs` ; `npm run validate` enchaîne `mobile`, `offline`, `tristram`, `charselect`, `merc` et `runs`.

## Sans fichiers de jeu (utilisables par tout contributeur)

| Script | Rôle |
|---|---|
| `mobile.mjs`, `pc.mjs` | matrice d'appareils, tactile, clavier/souris, performance de base |
| `fold.mjs` | Galaxy Z Fold plié et déplié, portrait et paysage : écran « tournez l'appareil », cibles tactiles de la barre des panneaux et de l'écran de sélection des personnages (≥ 44 px, `elementFromPoint`, grille 2 × 4), captures du menu, de la sélection et du jeu ; tailles à confirmer sur l'appareil |
| `survivals.mjs` | Survivals mode (full build with the mod): mode at launch, portrait allowed, wider camera, a round from the waypoint, HUD and level-up cards on the phone and Galaxy Z Fold sizes (portrait and landscape, ≥ 44 px), turning the device mid-round, end of round, death, cost with ~90 monsters (`--perf=0` to skip); lot 285: every hero chosen by a tap at creation, monsters drawn, controls of a round, cards with icons taken by a real tap, loot walked over and worn, no potion, the hub between rounds (vendor, next round), drawing caps; lot 286: the mode's settings on one flat page (every size and PC), the main menu (title under the logo, modes then links, Discord, no D2 import); lot 287: the floating joystick (a touch in the centre of a phone held upright moves the hero, the setting, left-handed), the arena's trees thinned, the wider camera, the cards' figures and keys, no orientation lock on the menus; lot 288: no attack button in semi-automatic, strikes while walking, cards' counters and banish, the round lost names its killer |
| `offline.mjs`, `sync.mjs`, `guild.mjs` | relance hors ligne (service worker), synchronisation de comptes, coffre de guilde (service local lancé par le script) |
| `tristram.mjs`, `runs.mjs`, `charselect.mjs`, `classes.mjs`, `merc.mjs`, `merc-aura.mjs`, `skilltree.mjs`, `summon-bar.mjs`, `socket-menu.mjs`, `throw-potion.mjs`, `auto-pickup.mjs`, `actions-visibles.mjs`, `corrupt-bouton.mjs`, `corrupt-dot.mjs` | parcours de jeu et interface (création, classes, runs, mercenaires, compétences, objets, corruption) |
| `stash-*.mjs`, `big-inventory.mjs`, `panel-fit.mjs`, `panel-scroll.mjs`, `settings-layout.mjs`, `sync-form-scroll.mjs`, `highlight*.mjs`, `tier-edit.mjs`, `map-stash.mjs`, `map-upgrade.mjs`, `map-merge.mjs` | mise en page et défilement des panneaux, coffre, filtre de butin, cartes d'endgame (captures à relire) |
| `fullscreen-legs.mjs`, `ground-seams.mjs`, `map-black-zones.mjs`, `lightning-fx.mjs`, `dynamic-light.mjs`, `image-filter.mjs`, `image-filter-bench.mjs` (+ `image-filter-lib.mjs`), `render-engine.mjs`, `music-webaudio.mjs`, `map-boss-shots.mjs` | rendu : couches de sprites, coutures du sol, éclairs, lumière dynamique, filtre « qualité d'image », moteur de rendu, musique Web Audio, boss de carte |
| `load-perf.mjs`, `runtime-perf.mjs`, `map-load-time.mjs` | mesures de chargement et de performance (valeurs relatives) |
| `storage-migrate.mjs` | rename to D2 Mobile: a build of an earlier version creates the profile, the current build updates it at the same origin (service worker update); character, preferences, stats id, sync session and caches found again (`--old-dist=`, `--new-dist=`; starts its own servers) |
| `public-build.mjs`, `public-no-testchar.mjs` | vérifient la version publique (`D2_PUBLIC=1`) : aucun appel de guilde/synchro, pas de personnage d'essai |

## Avec vos propres fichiers Diablo II (`D2_PRIVATE_DIR`, jamais versionnés)

`d2-*.mjs`, `d2import.mjs` et `mpq-locate.ts` exigent vos archives `.mpq`
(`$D2_PRIVATE_DIR/in`, `patch/`, `audio-in/`, `out/`). Ils vérifient l'import local : génération paresseuse, révision de l'interface (`d2-ui-revision.mjs` : interface d'une version antérieure refaite seule, logo ancré),
intégrité de la copie, cartes, sons, effets, interface, PWA, récupération d'erreurs. Sans archives ils ne peuvent pas aboutir
(ils ne font pas partie de la CI). Aucun fichier produit n'est versionné.
