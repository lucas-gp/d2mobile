# Boss de carte : vrais boss (vie, kits télégraphiés, phases, enrage, butin)

Demande : « Les boss de map sont trop faibles et semblent ne lâcher que des maps. Il faut qu'ils aient pas mal de vie
comme un vrai boss, avec des skills spéciaux et punitifs. » Mise en œuvre : `src/sim/map-boss.ts` (combat),
`src/data/map-boss-kits.ts` (statut, catalogue d'archétypes, kits des 37 cartes), `src/sim/loot/drops.ts`
(`mapBossDrops`), barre de boss (`src/ui/hud.ts`, `.target.boss`), deux aires au rendu (`mb_mark`, `mb_pool`).
Mesures : `tools/bots/map-boss-audit.ts` (combat de boss isolé, 5 builds, 500 butins par boss),
`tools/bots/maps.ts` (bot d'endgame, 3 graines × 4 h), captures `tools/e2e/map-boss-shots.mjs`.

## Audit avant (HEAD ce5189c)

- Le boss d'une carte était un **unique** de l'espèce de la carte (vie ×2 en Enfer, 3 modificateurs aléatoires, kit de
  l'espèce), escorté de 4 sbires. Vie médiane : P1 14 036, P2 16 046, P3 16 510 PV (de 7 018 à 27 370).
- **Donjons** : Baal et Duriel (espèces de boss de campagne) apparaissaient au rang « boss » avec leur fiche de campagne
  (niveau 99/88, vie ×60/×40 : 336 188 PV pour le Reflet de Baal) **et leurs quatre sbires étaient eux aussi des Baal**
  (le rang « boss » de l'espèce l'emportait sur le rang de sbire) : cinq Baal de niveau 99.
- Temps de mise à mort (personnage d'arène du palier : niveaux 85/88/91/94, équipement rare du niveau, +100 % de
  résistances pour compenser l'Enfer ; médiane des 5 builds froid, feu, marteau, tourbillon, invocateur) :
  **P1 4,3 s, P2 6,8 s, P3 5,2 s** (tourbillon : 0 s, l'écrasement prenait ¼ de la vie du rang unique à chaque coup),
  contre 25 s visées pour un boss (`TTK_TARGETS.boss`) et 25-40 / 45-70 / 60-100 s demandées.
- Butin par mort (500 tirages par boss, cartes non uniques) : TC d'unique (1 objet + 2 potions) :
  uniques 0,03-0,04, ensembles 0,03, rares 0,07-0,09, magiques 0,75, runes 0,06, gemmes 0,03 ;
  + 3 cartes, 0,8 orbe, charme de brisure 4-7 %. Seul le butin propre aux cartes ressortait (« ne lâchent que des maps »).

## Statut de boss de carte

- Monstre de rang unique (nom doré, escorte) marqué `mapBoss` (état sérialisable sur le monstre), créé par
  `World.spawnGroup` pour le `runBoss` d'une carte ; **aucun modificateur aléatoire** (le kit les remplace), pas de
  régénération propre, niveau = zone + 3 même pour Baal/Duriel (fiche de campagne ignorée). Donjons : le reflet vient seul,
  escorté de 4 monstres de la carte (`mapzone.ts`).
- **Vie** = `monsterHp(niveau) × DIFF_MULT.hp × clamp(fiche, 1,2-2,4) × MAP_BOSS_HP[palier]`, MAP_BOSS_HP = 7,5 / 11 / 15 / 20
  (P1 / P2 / P3 / donjon), soit ×3,75 à ×10 la vie d’un unique (×2) : P1 35-95 k, P2 57-127 k, P3 74-149 k, donjon 204 k (avant : 7-27 k, 10-23 k, 8-25 k, 34-336 k).
  Réglé sur le temps de mise à mort mesuré (ci-dessous) : le personnage de référence (froid) met 26 / 52 / 56 s.
- **Dégâts** : attaques de l'espèce ×clamp(fiche, 0,9-1,3) × 0,7 (0,72 au donjon) — moins qu'un unique, le combat durant
  5 à 10 fois plus longtemps (sur 40-60 s, les coups ordinaires faisaient l'essentiel des morts du bot) ; compétences
  spéciales : coup de référence `monsterDmg(niveau) × DIFF_MULT × 1,2 / 1,25 / 1,3 / 1,4`, indépendant de l'espèce.
- **Résistances** : plafond `MAP_NATURAL_RES_CAP` (75) **magie comprise** pour le boss (un Défaiseur insensible à la magie
  bloquait le marteau) ; seules les immunités annoncées par la carte (30 % des monstres, pas sur les cartes uniques).
  Écrasement ⅛ (comme un boss), ni recul, ni récupération après coup, ralentissement d'arme ÷2.
- **Contrôles** : gel et étourdissement possibles (Baal/Duriel des donjons ne sont plus insensibles au gel) mais
  **rendements décroissants** : durée ×0,5 par contrôle reçu dans les 10 dernières secondes, au moins ×0,125.
- **Arène et laisse** : le combat commence quand le joueur entre à 15 unités du point d'apparition (ou frappe le boss) :
  bannière `bossSpawn` existante, barre de boss. Joueur mort ou à plus de 32 unités pendant 2 s : le boss rentre,
  regagne **2 %/s** de sa vie, reste vulnérable ; revenu à pleine vie, le combat (et l'enrage) repart de zéro, les phases
  franchies restent franchies (pas de renforts à répétition).
- **Enrage** : après 150 / 180 / 210 / 240 s de combat, +15 % de dégâts toutes les 10 s (attaques et compétences).
- **Mort** : bannière « Boss vaincu : … », explosion, ses renforts s'effondrent, marqueurs éteints, portail de retour
  existant (`RunState.onKill`).
- **Barre de boss** : la barre de cible du HUD (`.target`) prend la classe `boss` (plus large, nom doré, « Phase n / 4 —
  Bouclier — Enragé ») tant qu'un boss de carte est engagé ; 44 vw au plus (téléphone 740×360 : entre le niveau et les
  boutons).

## Compétences spéciales (catalogue, `MAP_BOSS_ARCHETYPES`)

Une compétence toutes les 3,4 / 3,0 / 2,7 / 2,4 s (délai global), chacune avec sa recharge ; le boss s'immobilise
pendant le télégraphe. Toute zone est marquée au sol (aire `mb_mark`, disque à la couleur de l'élément qui se renforce
puis clignote) **au moins 0,7 s avant l'impact** ; l'impact est une action différée résolue par `map-boss.ts`.
Dégâts en coups de référence ; feu/froid/foudre/poison ×1, physique ×0,32 et magie ×0,3 (pas de résistance du joueur) ;
**plafond par impact** en part de la vie max après résistances (`MAP_BOSS_HIT_CAP`) : jamais de mort d'un coup à pleine vie.

| Archétype | Télégraphe | Effet | Dégâts / plafond | Recharge |
|---|---|---|---|---|
| Anneau (nova) | disque sous le boss 0,8 s | 14-20 projectiles en anneau (vitesse 8, portée 12) : rester entre deux ou hors de portée | 2,2 / 15 % | 9 s |
| Balayage (cône) | trois rangées de disques 1,0 s | cône de 7 unités, ±31° | 6 / 40 % | 10 s |
| Pluie | 4-7 disques sur et autour du joueur, échelonnés de 0,22 s, 1,0 s chacun | météores (feu), éclairs, rochers | 3,5 / 22 % | 11 s |
| Mur | ligne à travers le joueur, 0,8 s sans dégâts | feu : mur de feu existant ; autres : chaîne de zones, 5 s | 0,8 / 7 % par 0,4 s | 13 s |
| Charge | disque à la position du joueur 1,0 s | le boss bondit sur le point marqué | 5 / 35 % | 10 s |
| Renforts | — | 2 monstres de la carte (sans butin), plafond 5 | — | 22 s |
| Aura | disque de 7 unités autour du boss 0,9 s | dégâts + malédiction (−résistances, affaiblissement, amplification), brûle-mana (−35 %), drain (soigne le boss) ou gel | 2 / 20 % | 12 s |
| Zone | disque sous le joueur 0,8 s | poison / ténèbres persistantes 6 s | 0,7 / 6 % par 0,48 s | 10 s |
| Pas de l'ombre | disque autour du boss 0,8 s | téléportation derrière le joueur puis frappe | 4,5 / 35 % | 12 s |
| Venin (cumulable) | 3 disques 0,9 s | une charge par impact, 5 au plus, 4 s, poison/saignement sans récupération après coup | 0,4 par charge / 2,5 % par 0,5 s | 10 s |
| Bouclier | — (phase) | 3 gardiens (champions) ; dégâts subis ×0,25 tant qu'un vit, 12 s au plus | — | phase |

**Phases** à 75 / 50 / 25 % : une action par kit (renforts, bouclier, accélération ×1,25 et +20 % de vitesse d'attaque,
frénésie ×1,25 dégâts et recharges ×0,85) et les compétences marquées (1)/(2)/(3) se débloquent.

## Les 37 boss

TTK : médiane des 5 builds (personnage du palier, combat isolé, 240 s au plus) ; † : morts du personnage sur 5.

| Carte | P | Boss (espèce) | PV avant → après | TTK méd. avant → après (5 builds) | Kit (phase d'apparition) | Phases 75/50/25 % | Enrage |
|---|---|---|---|---|---|---|---|
| Jungle de Torajan | 1 | Seigneur de la jungle (venom_lord) | 14 036 → 52 635 | 2.4 s (2†) → 16.4 s (1†) | zone poison, anneau poison, venin poison (1), charge phys. (3) | renforts / accélère / frénésie | 150 s |
| Tombe de Zoltun Kulle | 1 | Zoltun Kulle (skeleton_mage) | 7 018 → 35 090 | 0.6 s → 11.5 s | pluie foudre, anneau froid, mur feu (1), pas de l’ombre magie (2) | renforts / bouclier / frénésie | 150 s |
| Ombres de Westmarch | 1 | Spectre de Westmarch (soul_killer) | 7 798 → 35 090 | 1.9 s → 13.9 s | zone magie, anneau froid, aura magie −rés. (1), pas de l’ombre magie (3) | renforts / accélère / renforts | 150 s |
| Phlégéthon | 1 | Gardien du Phlégéthon (blood_lord) | 15 595 → 58 483 | 13 s → 56 s (1†) | mur feu, pluie feu, balayage feu (1), charge phys. (2) | renforts / accélère / frénésie | 150 s |
| Temple perdu | 1 | Grand prêtre déchu (oblivion_knight) | 14 036 → 52 635 | 12 s (1†) → 24.8 s (1†) | pluie foudre, anneau foudre, aura magie amplif. (1), pas de l’ombre foudre (3) | renforts / bouclier / frénésie | 150 s |
| Chute de Caldeum | 1 | Conquérant de Caldeum (unraveler) | 18 715 → 70 180 | 7.6 s → 49.2 s | charge phys., balayage phys., pluie phys. (1), renforts phys. (2) | renforts / bouclier / frénésie | 150 s |
| Épreuve ancestrale | 1 | Nathkill l’Engourdi (venom_lord) | 14 036 → 52 635 | 11.4 s (1†) → 19.6 s (1†) | anneau froid, balayage froid, aura froid gel (1), charge phys. (2) | renforts / accélère / frénésie | 150 s |
| Trône de la Démence | 2 | Le Roi dément (blood_lord) | 16 046 → 88 255 | 6 s → 42.8 s | pas de l’ombre magie, balayage feu, aura magie affaibl. (1), pluie feu (2), zone magie (3) | renforts / accélère / frénésie | 180 s |
| Égouts de Harrogath | 2 | Rat-roi des égouts (venom_lord) | 14 442 → 79 429 | 6.1 s → 43 s (3†) | zone poison, venin poison, anneau poison (1), charge phys. (2), renforts phys. (3) | renforts / bouclier / frénésie | 180 s |
| Plaines de cendres | 2 | Seigneur des cendres (minion_destruction) | 20 860 → 105 906 | 6.2 s (2†) → 38.4 s (2†) | pluie feu, mur feu, anneau feu (1), charge phys. (3) | renforts / accélère / frénésie | 180 s |
| Canyon de Sescheron | 2 | Chef de guerre de Sescheron (oblivion_knight) | 14 442 → 79 429 | 9.7 s (1†) → 38 s (2†) | charge phys., balayage froid, anneau froid (1), pluie froid (3) | renforts / bouclier / frénésie | 180 s |
| Sanatorium | 2 | Le Gardien du sanatorium (blood_lord) | 16 046 → 88 255 | 16.2 s → 46 s (1†) | zone poison, venin phys., aura magie drain (1), pas de l’ombre magie (2), renforts phys. (3) | renforts / accélère / frénésie | 180 s |
| Citerne en ruine | 2 | Hydre antique de la citerne (water_watcher) | 12 677 → 69 721 | 3.3 s → 36.4 s | anneau froid, zone poison, balayage poison (1), venin poison (3) | renforts / bouclier / frénésie | 180 s |
| Citadelle du Pandémonium | 2 | Commandante sombre Alma (minion_destruction) | 20 860 → 105 906 | 6.8 s (2†) → 48 s (2†) | pluie feu, balayage feu, mur feu (1), charge phys. (3) | renforts / bouclier / frénésie | 180 s |
| Mémoire d’Horazon | 2 | Demoiselle de la mort Madinsane (succubus) | 10 430 → 57 366 | 2.2 s → 22.6 s (1†) | pas de l’ombre foudre, anneau foudre, pluie foudre (1), aura magie brûle-mana (2), zone magie (3) | renforts / accélère / frénésie | 180 s |
| Salles de torture | 2 | Gimli l’Être invoqué (council_member) | 16 046 → 88 255 | 3.9 s → 30.6 s (1†) | mur feu, charge phys., balayage phys. (1), pluie feu (3) | renforts / bouclier / frénésie | 180 s |
| Lune de sang | 3 | Enfant de la Lune de sang (blood_lord) | 16 510 → 123 828 | 3.2 s → 47.8 s | charge phys., venin phys., aura magie drain (1), balayage phys. (2), renforts phys. (3) | renforts / accélère / frénésie | 210 s |
| Cryptes royales | 3 | Roi sans repos (unraveler) | 19 812 → 148 594 | 6.4 s (1†) → 23.4 s (3†) | anneau froid, zone magie, aura magie −rés. (1), pas de l’ombre magie (2), renforts phys. (3) | renforts / bouclier / frénésie | 210 s |
| Rivière de sang | 3 | Seigneur de la rivière (venom_lord) | 14 859 → 111 445 | 9.7 s (1†) → 51.1 s (3†) | mur feu, zone poison, anneau feu (1), pluie feu (2), charge phys. (3) | renforts / accélère / frénésie | 210 s |
| Kyovashad | 3 | Inquisiteur de Kyovashad (soul_killer) | 8 255 → 74 297 | 4 s → 18.8 s (2†) | pluie foudre, anneau foudre, aura magie amplif. (1), pas de l’ombre foudre (2) | renforts / bouclier / frénésie | 210 s |
| Marché du Kehjistan | 3 | La Ruche viciée (maggot_queen) | 18 079 → 135 592 | 8.2 s → 32.2 s | zone poison, venin poison, renforts phys. (1), anneau poison (2), balayage poison (3) | renforts / accélère / frénésie | 210 s |
| Champ de bataille d’Arreat | 3 | Armurier de l’Égalité (the_smith) | 25 261 → 148 594 | 7.7 s (2†) → 5.6 s (4†) | charge phys., balayage phys., pluie phys. (1), renforts phys. (3) | renforts / bouclier / frénésie | 210 s |
| Donjon du Bastion | 3 | Johnathan le Damné (doom_knight) | 13 208 → 99 062 | 8.7 s (1†) → 14.8 s (2†) | pas de l’ombre magie, zone magie, aura magie affaibl. (1), balayage froid (2), renforts phys. (3) | renforts / accélère / frénésie | 210 s |
| Route des démons | 3 | Thonos aux mille membres (vile_mother) | 22 702 → 148 594 | 5.2 s (2†) → 18 s (3†) | anneau feu, zone poison, renforts phys. (1), pluie feu (2), venin poison (3) | renforts / bouclier / frénésie | 210 s |
| Forteresse de Skovos | 3 | Incarnation d’Akarat (abyss_knight) | 13 043 → 97 824 | 2.6 s → 39.3 s (1†) | pluie foudre, anneau foudre, charge phys. (1), aura magie brûle-mana (2) | renforts / bouclier / frénésie | 210 s |
| Plaines du Tourment | D | Reflet de Baal (baal) | 336 188 → 203 857 | 57.1 s (3†) → 100.8 s (3†) | anneau froid, pluie froid, pas de l’ombre magie (1), zone magie (2), aura magie −rés. (3) | renforts / bouclier / frénésie | 240 s |
| Sanctuaire du Péché | D | Gardien du Péché (duriel) | 50 199 → 203 857 | 1.2 s (4†) → 23.4 s (3†) | charge phys., balayage froid, aura froid gel (1), pluie phys. (2), renforts phys. (3) | renforts / accélère / frénésie | 240 s |
| Steppes de Daken-Shar | D | Naz, le Roi maudit (siege_beast) | 33 806 → 203 857 | 8.8 s (4†) → — s (5†) | charge phys., pluie phys., balayage phys. (1), renforts phys. (2), venin phys. (3) | renforts / bouclier / frénésie | 240 s |
| Cité d’Ureh (U) | 1 | Gardien d’Ureh (soul_killer) | 8 968 → 40 354 | 10.6 s → 21.7 s | pluie foudre, anneau foudre, pas de l’ombre foudre (1), aura magie brûle-mana (2) | renforts / accélère / frénésie | 150 s |
| Jardins déchus (U) | 1 | Jardinier des ombres (fallen_shaman) | 7 018 → 35 090 | 1.9 s → 9.8 s (1†) | anneau feu, pluie feu, renforts phys. (1), mur feu (3) | renforts / accélère / frénésie | 150 s |
| Palais impérial (U) | 2 | Empereur momifié (unraveler) | 23 107 → 127 087 | 14.6 s (1†) → 26.3 s | charge phys., zone poison, balayage poison (1), renforts phys. (2) | renforts / bouclier / frénésie | 180 s |
| Domaine du Djinn (U) | 2 | Djinn captif (minion_destruction) | 20 860 → 105 906 | 11.6 s (2†) → 51 s (2†) | pas de l’ombre foudre, pluie foudre, anneau feu (1), balayage feu (3) | renforts / bouclier / frénésie | 180 s |
| Sanctuaire de Zhar (U) | 2 | Zhar le Fou (oblivion_knight) | 14 442 → 79 429 | 11.4 s → 44 s (3†) | pas de l’ombre magie, anneau froid, pluie feu (1), mur feu (2), aura magie brûle-mana (3) | renforts / accélère / frénésie | 180 s |
| Abîme de Na-Krul (U) | 3 | Na-Krul (venom_lord) | 19 317 → 144 879 | 10.9 s (2†) → 23.3 s (3†) | zone magie, aura magie −rés., pas de l’ombre magie (1), venin poison (2), renforts phys. (3) | renforts / bouclier / frénésie | 210 s |
| Seigneur de guerre du sang (U) | 3 | Seigneur de guerre du sang (blood_lord) | 16 510 → 123 828 | 11.6 s → 32.3 s | charge phys., balayage phys., venin phys. (1), renforts phys. (2) | renforts / accélère / frénésie | 210 s |
| Ruines de Viz-Jun (U) | 3 | Dernier mage de Viz-Jun (skeleton_mage) | 9 659 → 96 586 | 3.4 s (1†) → 18.9 s (2†) | pluie foudre, anneau froid, mur feu (1), pas de l’ombre magie (3) | renforts / bouclier / frénésie | 210 s |
| Vide extérieur (U) | 1 | Dévoreur de rêves (regurgitator) | 27 370 → 94 743 | 6.5 s → 31.4 s | zone magie, pas de l’ombre magie, anneau poison (1), aura magie affaibl. (2), renforts phys. (3) | renforts / accélère / frénésie | 150 s |

## Temps de mise à mort (avant → après)

Combat isolé (le reste de la carte nettoyé), personnage d'arène du palier (+100 % de résistances), 240 s au plus.
Médiane des morts du boss par build, (tués / combats, morts du personnage) :

| Build | P1 | P2 | P3 | Donjon |
|---|---|---|---|---|
| Froid (référence) | 7,6 → **26 s** (0 → 0 †) | 12,4 → **52 s** (0 → 3 †/12) | 9,7 → **56 s** (0 → 4 †/12) | — (3 † → 3 †) |
| Marteau | 2,8 → 25 s | 5,5 → 46 s | 4,0 → 48 s (2 → 6 †/12) | 8,8 → 51 s |
| Tourbillon | 0 → 6 s | 0 → 18 s | 0 → 15 s | 5 → 101 s |
| Invocateur | 10,6 → 16 s | 6 → 24 s | 2,6 → 19 s | 57 → 23 s |
| Feu | 21 → 128 s (3 → 5 †/10) | 36 → — (4 → 9 †/12) | 23 → 127 s | — |
| Médiane 5 builds | 4,3 → **19,6 s** | 6,8 → **36,4 s** | 5,2 → **23,4 s** | 8,8 → **51 s** |
| Morts (sur 50/60/60/15) | 4 → 5 | 8 → 17 | 10 → 23 | 11 → 11 |

Bot d'endgame réel (`tools/bots/maps.ts`, froid, 3 graines × 4 h, `ttk.mapboss`) : P1 17-21 s, P2 40-75 s, P3 28-49 s.
Le personnage de référence est dans la cible P1 (25-40 s) et P2 (45-70 s), un peu court en P3 (60-100 s demandés : le
relever faisait mourir le bot d'arène une fois sur deux) ; les builds rapides (tourbillon, invocateur) restent sous la cible.
Le bot ne joue pas comme un humain : il esquive les marqueurs (évitement minimal, ci-dessous) mais reste au contact d'un
boss de mêlée, dans les renforts et sans mercenaire à l'arène : les morts du bot d'arène montent (P2-P3).

## Butin

`mapBossDrops` remplace le TC d'unique : 3 / 3 / 4 / 5 pièces d'équipement (au moins magiques, la première au moins rare),
30 / 35 / 45 / 100 % d'un unique ou d'un ensemble en plus (base au hasard, élites comprises), 60 / 70 / 85 / 100 % d'une
rune (TC des cartes « Runes 17 », biais `highRuneBias`), une gemme taillée (30 % parfaite), deux tas d'or, deux potions,
sans plafond d'objets par événement. Inchangés : cartes (1,2 × RATES.maps), orbes, éclats, charme de brisure
(RATES.sunder), scarabée, récompenses des cartes uniques, sceaux, essence pure.

Par mort (500 tirages par boss, cartes non uniques ; avant → après) :

| | P1 | P2 | P3 | Donjon |
|---|---|---|---|---|
| Objets | 6,9 → 12,7 | 6,9 → 13,0 | 6,9 → 14,2 | 8,9 → 16,0 |
| Uniques | 0,04 → 0,19 | 0,03 → 0,27 | 0,03 → 0,32 | 0,78 → 0,66 |
| Ensembles | 0,03 → 0,14 | 0,03 → 0,15 | 0,04 → 0,18 | 0,58 → 0,43 |
| Rares | 0,09 → 1,01 | 0,07 → 1,01 | 0,08 → 1,05 | 0,49 → 1,10 |
| Magiques | 0,74 → 1,94 | 0,79 → 1,93 | 0,74 → 2,88 | 1,6 → 3,8 |
| Runes (dont Hel+) | 0,06 (0,01) → 0,59 (0,06) | 0,06 (0) → 0,71 (0,08) | 0,07 (0,01) → 0,84 (0,07) | 0,17 → 1,0 (0,12) |
| Gemmes / or | 0,04 / 0 → 1 / 2 | 0,03 / 0 → 1 / 2 | 0,03 / 0 → 1 / 2 | 0,11 / 0,3 → 1 / 2 |
| Cartes / orbes / brisure | 3 / 0,79 / 4 % (inchangés) | 3 / 0,81 / 6 % | 3 / 0,80 / 7 % | 3 / 0,72 / 15 % |

Donjons : avant, le reflet (et chacun de ses quatre clones) tirait le TC de campagne de Baal/Duriel, un peu plus riche en
uniques par mort ; après, un seul boss au butin de boss de donjon (unique ou ensemble garanti).

**Par heure** (bot d'endgame, 3 graines × 4 h de cartes, avant → après) : cartes terminées (boss tués) 4,0 → 2,9 /h
(durée moyenne d'une carte 600 → 763 s : combats de boss plus longs et plus de reprises), morts 17 → 16.
Butin des boss par heure (morts/h × butin par mort, P1-P3) : uniques 0,13 → 0,75, ensembles 0,13 → 0,46,
rares 0,32 → 2,96, runes 0,25 → 2,06 ; avant le doublement des cartes (≈ 8 boss/h) : 0,27 / 0,27 / 0,64 / 0,50.
Le butin des boss dépasse donc le niveau d'avant le doublement (×2,8 en uniques), mais reste une petite part du total :
**total par heure** runes 89,9 → 80,7 (basses 81,3 → 71,7, moyennes 8,43 → 8,83, hautes 0,16 → 0,16), uniques ramassés
2,8 → 2,3, ensembles 4,1 → 3,7 (filtre de ramassage du bot, bruit d'une graine à l'autre) : le total n'explose pas, il
baisse un peu (−10 % de runes) parce qu'une carte dure plus longtemps.

## Bots

- `npx vitest run tests/bots` : 4 fichiers / 13 tests verts avant et après, **aucun seuil modifié**. Combat, butin,
  progression (dont `progression-maps`) : sorties identiques. Endgame froid (graines 1-3) :
  morts/run 0,52 / 0,22 / 0,35 (médiane 0,35) → 0,52 / 0,18 / 0,21 (médiane 0,21) ; palier 2 / 3 / 3 → 3 / 3 / 2 ;
  runes moyennes 18 / 29 / 29 → 24 / 29 / 24 ; cartes 19 / 18 / 19 → 19 / 17 / 14 ; runs bloquées 0 → 0.
- Évitement minimal ajouté au bot (`BotBrain.mapBossDodge`, indispensable : sans lui, le bot restait dans chaque
  marqueur) : s'il est dans un marqueur, une zone ou un mur posés par un boss de carte, il prend la plus courte des
  8 directions praticables qui en sort. Il ne peut pas interrompre un sort ni une récupération après coup (comme un joueur).
- `src/sim/bot/runner.ts` : le temps de mise à mort du boss de carte est compté à part (`ttk.mapboss`).

## Tests

`tests/unit/map-boss.test.ts` (17) : statut des 37 boss (rang, nom, sans modificateur, vie = formule, ≥ ×3 un unique,
kit de 3-5 compétences valides, phases, enrage), aucune immunité non annoncée (3 graines, cartes uniques : aucune),
donjons sans clones ; télégraphes de toutes les compétences des 37 kits (marqueur posé immédiatement, impact ≥ 0,7 s,
aucun projectile avant), premier dégât ≥ 0,7 s sur les événements et aucun dégât si l'on s'écarte, aucun coup ≥ 60 %
de la vie sans résistances ; phases, bouclier, enrage, rendements décroissants des contrôles, laisse, mort, coût par
tick (< 0,05 ms), sérialisation ; butin sur 500 morts par palier (objets garantis, un rare, unique/ensemble, runes, gemme,
cartes et orbes inchangés).

## Limites

- Le bot d'arène meurt plus souvent en P2-P3 (froid 3-4 morts sur 12, marteau 6 sur 12 en P3) : coups de mêlée du boss
  sur un personnage qui ne recule pas, renforts lanceurs de sorts, 8 potions sans mercenaire. Le bot d'endgame réel
  (mercenaire, ceinture) ne meurt pas plus qu'avant.
- Le build feu de l'arène meurt presque toujours (il mourait déjà 3-4 fois sur 10-12 avant) : sa référence est faible.
- Les dégâts sur la durée (poison, saignement, brûlure du joueur) ignorent le bouclier de phase.
- Le cône est dessiné par trois rangées de disques (pas de rendu de secteur) ; le mur non enflammé par une chaîne de zones.
- Les marqueurs sont à la couleur de l'élément : un marqueur de feu sur la lave reste lisible mais moins contrasté.
