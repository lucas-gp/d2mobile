# src/sim — simulation

Règles du jeu, à pas fixe de 25 Hz (`TICK_HZ`, `DT` dans `constants.ts`), en coordonnées de monde (1 unité ≈ 1 m, plan x/y,
hauteur z). Tourne dans Node sans DOM (tests, bots) comme dans le navigateur. Vue d'ensemble : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Points d'entrée

| Fichier | Rôle |
|---|---|
| `game.ts` | **`Game`**, la façade : personnage (`CharacterState`), ville / run, marchand, coffre (partagé), cube, cartes, sauvegarde (`toSave`), `step(n)` qui avance le monde et traite les événements. L'interface et l'application ne passent que par elle. |
| `world.ts` | **`World`** : une zone en cours (joueur, monstres, projectiles, zones d'effet, objets au sol, objets du décor), `step()`, flux de hasard `w.rng.{combat, ai, loot, spawn, misc}`, file d'événements `w.events`. |
| `seam-worlds.ts` | **`SeamWorlds`** (`game.seams`, lot 312) : les zones jointes bord à bord vivantes ensemble. Les voisines d'une zone de plein air sont construites d'avance (par étapes pendant le temps libre de l'application, `prepareStep`), simulées à côté d'elle au même tick quand le héros approche d'une jointure (leur joueur est un mandataire du héros, leurs coups lui sont transmis), leurs monstres, objets, objets au sol, projectiles et zones d'effet recopiés (`mirror: true`, mêmes identifiants) dans la zone ; la traversée échange les rôles sans rien reconstruire. Voir docs/ARCHITECTURE.md « Zones joined edge to edge ». |
| `events.ts` | `SimEvent` (union des événements lus par le rendu, l'audio, le HUD) et `EventQueue`. |
| `character.ts`, `derive-calc.ts`, `derived.ts` | Personnage, caractéristiques dérivées (`computeDerived` → `DerivedStats`), équipement autorisé. |
| `skill-cast.ts` | Lancement d'une compétence : essaie `castDruid`, `castBarbarian`, `castPaladin`, `castAmazon`, `castNecromancer`, `castAssassin` (chacun rend `false` si l'id n'est pas à lui), sinon `castSorceress` (`skill-cast-sorc.ts`). |
| `ai.ts`, `spawn.ts`, `combat.ts`, `missiles.ts`, `missile-update.ts` | Monstres (IA, apparition), dégâts, projectiles et zones d'effet. |
| `save.ts`, `save-check.ts` | Format de sauvegarde, migrations, validation des sauvegardes importées. |
| `actors.ts`, `character-state.ts`, `map-boss-state.ts`, `derived.ts` | Types feuilles (acteurs, état sauvegardé du personnage, état d'un boss de carte, statistiques dérivées) : à importer de préférence aux modules de logique. |
| `bot/` | Joueurs automatiques : `brain.ts` (décisions), `runner.ts` (`playRun`, sessions de progression), `arena.ts` (`referenceCharacter`, `fightArena`). |
| `loot/` | Génération d'objets (`itemgen.ts`), tables de butin (`drops.ts`), filtre, surbrillance, paliers, valeur. |
| `d2s/` | Lecture (`parse.ts`) et conversion (`convert.ts`) des personnages Diablo II `.d2s`. |

## Invariants

- **Déterminisme** : tout le hasard passe par `Rng` (`src/core/rng.ts`), un flux par usage ; jamais `Math.random()`, `Date.now()` ni
  `performance.now()` (sauf dans `bot/`, pour mesurer). Même graine + mêmes entrées ⇒ même partie (les bots et les empreintes de
  refactorisation en dépendent).
- **Aucune dépendance vers le rendu, le DOM, `ui/`, `input/`, `platform/`** (vérifié par `tests/unit/architecture.test.ts`).
- Les entrées du joueur arrivent uniquement par `world.input` ; la visée automatique est une requête en lecture (`targeting.ts`).
- Les règles ne se lisent jamais dans une image : les tailles, portées, images de coup viennent des données (`src/data`).

## Pièges

- `hooks.ts` : `simHooks.castSkill` et `simHooks.spawnMonster` sont enregistrés au chargement de `skill-cast.ts` et `spawn.ts`
  (importés par `world.ts`) ; appeler l'un avant ce chargement lève une erreur explicite.
- Les identifiants d’objets (`makeUid`) contiennent un compteur global du module : `Game.resetIds()` dans les tests qui comparent des parties.
- Un fichier de classe (`barbarian.ts`, `druid.ts`…) doit rendre `false` pour une compétence qui n'est pas la sienne : sinon la suivante
  de la chaîne n'est jamais essayée.
- Les fonctions du personnage (`Game`) sauvegardent par l'application, pas par la simulation : ne pas écrire dans `localStorage` ici.
