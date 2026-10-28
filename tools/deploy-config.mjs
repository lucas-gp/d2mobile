/**
 * vercel.json d'un déploiement, généré depuis vercel.example.json (tools/deploy.mjs) : les origines viennent de l'environnement, rien en dur dans le dépôt.
 * Version publique : ni /guild-api ni /d2 ni fonction api/sync ; seule la réécriture /stats-api est gardée, quand STATS_API_URL est défini (compteur anonyme, PRIVACY.md).
 * @param {any} example contenu de vercel.example.json
 * @param {{ isPublic: boolean, codeOnly: boolean, env: Record<string, string | undefined> }} o
 */
export function buildVercelConfig(example, { isPublic, codeOnly, env }) {
  const cfg = structuredClone(example);
  const hosts = { '/guild-api/': env.GUILD_API_URL, '/d2/': env.D2_REMOTE_ORIGIN, '/stats-api/': env.STATS_API_URL };
  if (codeOnly && !hosts['/d2/']) throw new Error('D2_REMOTE_ORIGIN manquant (origine https://… des ressources chiffrées optionnelles ; voir .env.example)');
  const host = (r) => hosts[`/${r.source.split('/')[1]}/`];
  cfg.rewrites = (cfg.rewrites ?? [])
    .filter((r) => (!isPublic || r.source.startsWith('/stats-api/')) && host(r))
    .map((r) => ({ ...r, destination: r.destination.replace(/^https:\/\/[^/]+/, host(r).replace(/\/$/, '')) }));
  if (!cfg.rewrites.length) delete cfg.rewrites;
  if (isPublic) {
    delete cfg.functions;
    // tsc réclame api/ (tests de la synchro) : il est écarté ; la vérification des types est faite en amont
    cfg.buildCommand = 'vite build';
    cfg.headers = (cfg.headers ?? []).filter((h) => !/^\/(guild-api|api|d2)\//.test(h.source));
  }
  return cfg;
}

/**
 * CLI Vercel : version EXACTE (jamais `@latest` : la CLI reçoit VERCEL_TOKEN et `vercel pull` écrit les secrets du projet).
 * Une version publiée sur npm ne peut plus changer ; pour monter de version, la changer ici après lecture du journal des versions.
 * Si `node_modules/.bin/vercel` existe (CLI installée dans le dépôt, verrouillée par package-lock.json), elle est préférée.
 */
export const VERCEL_CLI = 'vercel@64.5.0';
