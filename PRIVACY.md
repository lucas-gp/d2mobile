# Privacy / Confidentialité

_Français ci-dessous · English first._

## English

D2 Mobile counts how many different people play. That is all. This page lists exactly what is collected.

**What is sent** (a small request to `/stats-api/ping`, when the game is open and the tab is visible: once at launch, then every 60 seconds):

| Field | Example | Why |
|---|---|---|
| `id` | `3f2b…` (random UUID made on your device) | tell two players apart; never linked to a name, account, save or device |
| `playing` | `true` / `false` | "in game" or "on a menu" |
| `ver` | `2026-10-18` | game version (date of the latest news entry) |
| `site` | `public` / `owner` | which build sent the ping: the public build, or the build with the optional services (`owner`) |

The server adds the time of the request. **Nothing else is stored by the statistics service**: no IP address, no User-Agent, no language, no screen size, no location, no save data, no character name, no cookie, no fingerprinting. The service uses your IP address only in memory, to limit abuse (rate limit), and never writes it anywhere.

**Lifetime of the random id.** It is replaced by a new random id 13 months after it was created at the latest (the creation date is kept next to it, in `d2m.stats.idAt`).

**Technical intermediaries (hosting).** The game and the `/stats-api` relay are served by **Vercel** (Vercel Inc.); the statistics service is reached through a **Cloudflare** tunnel (Cloudflare, Inc.). Like any host, they see the IP address and the User-Agent of each request in order to deliver it and may keep access logs under their own policies; the statistics service itself receives the request after them and writes none.

**Data controller.** _To be completed by the owner of the site: name and contact address._

**Retention.** Raw pings are deleted after 48 hours. What remains is one summary line per random id and per day (first and last ping, number of pings, number of sessions, version, site) kept for 400 days, plus the list of random ids ever seen (to count "new" versus "returning" players). The id is pseudonymous: it identifies a browser, not a person. Once it is removed from your device (see below), or replaced after 13 months, the owner has no way to link the old lines to you.

**What the owner sees**, behind a private token: players since the start, per day (30-day trend), active today, online now (last ping under 2 minutes) and how many are in game, daily peaks and the all-time record, new versus returning, split by site and version, approximate average session length.

**Turn it off.** Settings → Advanced → "Anonymous usage statistics" → No. Nothing is sent any more and your random id is deleted from the device. It is also off automatically when your browser sends "Do Not Track" or Global Privacy Control. If the service is not set up (the public repository ships without any server address), the requests simply fail silently.

**Your data.** Because the id is random and nothing else is kept, the owner cannot tell which lines are yours. If you want yours gone anyway: turn the option off (the id is deleted on your device, so it can no longer be matched), and ask for the removal of old lines by opening an issue with the id shown in the browser storage key `d2m.stats.id` (read it before turning the option off).

Code: [src/platform/stats.ts](src/platform/stats.ts) (client), [server/stats](server/stats/README.md) (service).

## Français

D2 Mobile compte combien de personnes différentes jouent. Rien de plus. Cette page liste exactement ce qui est collecté.

**Ce qui est envoyé** (une petite requête vers `/stats-api/ping`, quand le jeu est ouvert et l'onglet visible : au lancement, puis toutes les 60 secondes) :

| Champ | Exemple | Pourquoi |
|---|---|---|
| `id` | `3f2b…` (UUID aléatoire fabriqué sur votre appareil) | distinguer deux joueurs ; jamais relié à un nom, un compte, une sauvegarde ou un appareil |
| `playing` | `true` / `false` | « en jeu » ou « au menu » |
| `ver` | `2026-10-18` | version du jeu (date de la dernière entrée des nouveautés) |
| `site` | `public` / `owner` | quelle version a envoyé le ping : la version publique, ou la version avec les services facultatifs (`owner`) |

Le serveur ajoute l'heure de la requête. **Le service de statistiques ne conserve rien d'autre** : ni adresse IP, ni User-Agent, ni langue, ni taille d'écran, ni position, ni sauvegarde, ni nom de personnage, ni cookie, ni empreinte d'appareil. Le service n'utilise votre adresse IP qu'en mémoire, pour limiter les abus (limite de débit), et ne l'écrit nulle part.

**Durée de vie de l'identifiant aléatoire.** Il est remplacé par un nouvel identifiant aléatoire au plus tard 13 mois après sa création (la date de création est gardée à côté, dans `d2m.stats.idAt`).

**Intermédiaires techniques (hébergement).** Le jeu et le relais `/stats-api` sont servis par **Vercel** (Vercel Inc.) ; le service de statistiques est joint par un tunnel **Cloudflare** (Cloudflare, Inc.). Comme tout hébergeur, ils voient l'adresse IP et le User-Agent de chaque requête pour l'acheminer et peuvent tenir des journaux d'accès selon leurs propres règles ; le service de statistiques reçoit la requête après eux et n'en écrit aucun.

**Responsable du traitement.** _À compléter par le propriétaire du site : nom et adresse de contact._

**Conservation.** Les pings bruts sont supprimés après 48 heures. Il reste une ligne de synthèse par identifiant aléatoire et par jour (premier et dernier ping, nombre de pings, nombre de sessions, version, site), conservée 400 jours, plus la liste des identifiants aléatoires déjà vus (pour distinguer « nouveaux » et « de retour »). L'identifiant est pseudonyme : il désigne un navigateur, pas une personne. Une fois supprimé de votre appareil (voir ci-dessous) ou remplacé au bout de 13 mois, le propriétaire n'a plus aucun moyen de relier les anciennes lignes à vous.

**Ce que voit le propriétaire**, derrière un jeton privé : joueurs depuis le début, par jour (tendance sur 30 jours), actifs aujourd'hui, en ligne maintenant (dernier ping il y a moins de 2 minutes) dont ceux en jeu, pics par jour et record absolu, nouveaux et de retour, répartition par site et par version, durée moyenne approximative d'une session.

**Le désactiver.** Réglages › Avancé › « Statistiques anonymes d'utilisation » › Non. Plus rien n'est envoyé et votre identifiant aléatoire est supprimé de l'appareil. C'est aussi désactivé d'office quand votre navigateur envoie « Ne pas suivre » ou Global Privacy Control. Si le service n'est pas branché (le dépôt public ne contient aucune adresse de serveur), les requêtes échouent simplement en silence.

**Vos données.** L'identifiant étant aléatoire et rien d'autre n'étant gardé, le propriétaire ne peut pas savoir quelles lignes sont les vôtres. Si vous voulez quand même les voir disparaître : désactivez l'option (l'identifiant est supprimé de votre appareil, il ne peut donc plus être rapproché) et demandez la suppression des anciennes lignes en ouvrant une issue avec l'identifiant lu dans la clé de stockage du navigateur `d2m.stats.id` (à relever avant de désactiver l'option).

Code : [src/platform/stats.ts](src/platform/stats.ts) (client), [server/stats](server/stats/README.md) (service).
