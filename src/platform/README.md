# src/platform — intégration navigateur

Tout ce qui dépend du navigateur ou d'un service extérieur, hors rendu et interface : stockage, cycle de vie mobile, service worker,
audio, synchronisation, guilde, graphismes Diablo II générés sur l'appareil. Vue d'ensemble : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Points d'entrée

| Fichier | Rôle |
|---|---|
| `platform.ts` | **`SaveStore`** (emplacements `d2m.save.<uuid>`, copie de secours, coffre partagé par jeu de règles : `sharedKeyOf`, `sharedSyncIdOf`, export / import de fichier), écran maintenu allumé, plein écran, gestes du navigateur, `registerServiceWorker` + `appUpdate` (état de mise à jour), fenêtre de progression d'installation. |
| `sw-template.js` | Gabarit du service worker, rempli au build par le plugin `d2m-sw` de `vite.config.ts` (version, listes de fichiers). ; téléchargement d'une version suivi (`INSTALL_PROGRESS`), sa version donnée à la page (`VERSION`), `version.json` jamais servi par lui. |
| `update-check.ts` | Vérification de mise à jour (lot 297) : `version.json` sans cache, 8 s et un nouvel essai, causes d'échec (`offline`, `unreachable`, `server`, `download`, `install`), suivi borné du téléchargement. |
| `storage-migrate.ts`, `storage-migrate-boot.ts`, `idb-migrate.ts`, `storage-names.ts`, `legacy-names.ts` | Storage names and the one-time migration from the names of earlier versions ([docs/STORAGE.md](../../docs/STORAGE.md)). |
| `build-flags.ts` | `PUBLIC_BUILD` (`D2_PUBLIC=1` au build). |
| `errorlog.ts` | Journal d'erreurs local (`reportError`, gestionnaires globaux) et alertes discrètes. |
| `audio.ts`, `music.ts`, `d2sounds.ts`, `d2sound-map.ts`, `d2local-audio.ts` | Sons procéduraux (Web Audio), musique, sons importés de Diablo II et leur correspondance avec les événements. |
| `sync.ts`, `sync-crypto.ts`, `sync-merge.ts` | Synchronisation chiffrée de bout en bout (moteur, Web Crypto, fusion pure). Serveur : `api/`. |
| `guild.ts` | Client du coffre de guilde (`/guild-api`, serveur `server/guild`). |
| `stats.ts` | Compteur de joueurs anonyme (`/stats-api`, serveur `server/stats`) : identifiant aléatoire, ping chaque minute onglet visible, réglage désactivable, « Ne pas suivre » respecté. Voir [PRIVACY.md](../../PRIVACY.md). |
| `install.ts`, `packs.ts` | Installation PWA ; packs de contenu préchargeables. |
| `d2local.ts` (+ `d2local-core.ts`, `d2local-prep.ts`, `d2local.worker.ts`, `d2audio.worker.ts`, `d2plan.ts`, `d2planlive.ts`, `d2pregen.ts`, `d2requires.ts`, `d2check-core.ts`) | Graphismes générés sur l'appareil depuis les archives du joueur : copie OPFS, contrôle, génération paresseuse en workers, préparation des zones suivantes. Les fichiers `*-core.ts` sont purs et testés en unitaire. |
| `d2cache.ts`, `d2files.ts` | Cache des fichiers D2 du dossier chiffré (mode `enc`, chargeur optionnel `D2_REMOTE`) ; lecture des sauvegardes `.d2s` choisies par le joueur. |

## Invariants

- Rien ne quitte l'appareil sans action du joueur (hors le ping anonyme décrit plus bas) : la synchronisation ne voit que des blobs chiffrés (mot de passe et clé jamais envoyés),
  les graphismes locaux restent dans le stockage du navigateur.
- Seul envoi par défaut : le ping anonyme de `stats.ts` (id aléatoire, en jeu / menu, version, site), désactivable ; aucun contenu de jeu, aucune donnée personnelle.
- Un échec d'écriture de sauvegarde (stockage plein ou refusé) est signalé au joueur (alerte « save ») ; `App.saveNow` ne laisse remonter
  aucune exception (journal d'erreurs).
- La logique testable sans navigateur est isolée autant que possible dans des modules purs (`*-core.ts`, `sync-merge.ts`, `sync-crypto.ts`).

## Pièges

- Les clés `localStorage` commencent toutes par `d2m.` ; les préférences locales (langue, état D2 local…) ne sont pas synchronisées.
- `registerServiceWorker` reçoit `canUpdateNow` : l'application passe `() => false`, une mise à jour ne s'applique qu'au lancement ou à la
  demande du joueur.
- Les workers sont créés avec `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })` : garder cette forme littérale,
  Vite s'en sert pour produire le fichier du worker.
