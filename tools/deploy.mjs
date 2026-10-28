/**
 * Déploiement Vercel : build compilé localement (`vercel build`) puis envoyé depuis un dossier
 * hors du dépôt Git. Vercel bloque les déploiements dont l'auteur du dernier commit n'est pas
 * membre du projet ; sans métadonnées Git, le déploiement est attribué au jeton.
 *   VERCEL_TOKEN=… npm run deploy
 * Tout est lu depuis l'environnement (voir .env.example) ; sans VERCEL_TOKEN, le script affiche l'aide ci-dessous.
 *
 * Avec --code : déploie le code seul ; les ressources chiffrées optionnelles (chargeur générique, voir src/render/d2crypto.ts) sont
 * servies sous `/d2/*` par la réécriture de vercel.example.json vers l'origine D2_REMOTE_ORIGIN (hors dépôt).
 *   VERCEL_TOKEN=… D2_REMOTE_ORIGIN=https://… npm run deploy -- --code
 *
 * Avec --public : version publique (projet Vercel distinct, nom par défaut « diablo2mobile » ; sans ressources chiffrées, sans coffre
 * de guilde ni synchronisation) : D2_PUBLIC=1, D2_SPRITES=0, pas de D2_REMOTE. Le projet de --code n'est pas touché :
 *   VERCEL_TOKEN=… VERCEL_ORG_ID=… PUBLIC_VERCEL_PROJECT_ID=… npm run deploy -- --public
 * (VERCEL_ORG_ID et PUBLIC_VERCEL_PROJECT_ID viennent du shell ; `node tools/vercel-create-public-project.mjs` crée le projet et
 * affiche son id). Pendant l'opération, `.vercel/`, `vercel.json` et `api/` du dépôt sont écartés puis restaurés (finally, signaux
 * compris) ; le build utilise une vercel.json temporaire (générée depuis vercel.example.json) sans réécritures /guild-api et /d2 ni fonction api/sync (seule la réécriture /stats-api est gardée, si STATS_API_URL est défini : compteur de joueurs anonyme, voir PRIVACY.md).
 *
 * Mods : par défaut, le build embarque tous les mods présents dans mods/ (le mod PD2 reste dans les builds
 * publics déployés depuis ce dépôt). Avec --no-mods (combinable avec les autres options), MODS='' : la base seule, aucun mod embarqué :
 *   VERCEL_TOKEN=… … npm run deploy -- --public --no-mods
 *
 * Compteur de joueurs anonyme (server/stats, PRIVACY.md) : avec STATS_API_URL (origine https://… du service, hors dépôt), --code et --public réécrivent /stats-api/* vers lui ;
 * sans la variable, aucune réécriture n'est ajoutée (les pings du client échouent en silence) et le build ne mentionne aucun serveur.
 *
 * Les fonctions serverless du dossier api/ (synchronisation des sauvegardes) sont compilées par `vercel build` et déployées avec le site ;
 * elles lisent BLOB_READ_WRITE_TOKEN et SYNC_PEPPER dans les variables d’environnement du projet (jamais dans le dépôt).
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildVercelConfig, VERCEL_CLI } from './deploy-config.mjs';

// --code : code seul ; les ressources chiffrées optionnelles viennent de D2_REMOTE_ORIGIN, servies via /d2/ par réécriture
const codeOnly = process.argv.includes('--code');
const isPublic = process.argv.includes('--public');
if (isPublic && codeOnly) throw new Error('--public est incompatible avec --code');
// --no-mods : base seule (MODS vide) ; sans l'option, rien ne change (MODS de l'environnement, sinon tous les mods présents)
if (process.argv.includes('--no-mods')) process.env.MODS = '';
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error(`Déploiement Vercel : variables d'environnement requises (voir .env.example).
  VERCEL_TOKEN                jeton Vercel
  VERCEL_ORG_ID, VERCEL_PROJECT_ID   (ou PUBLIC_VERCEL_PROJECT_ID avec --public) : ids du projet, si le dossier n'est pas lié
  GUILD_API_URL, D2_REMOTE_ORIGIN, STATS_API_URL  facultatifs : origines relayées par /guild-api, /d2 et /stats-api (vercel.example.json)
  --no-mods                   build de la base seule (MODS vide) ; par défaut, tous les mods présents sont embarqués`);
  process.exit(1);
}

if (isPublic) {
  if (!process.env.VERCEL_ORG_ID) throw new Error('VERCEL_ORG_ID manquant (variable d’environnement)');
  const pid = process.env.PUBLIC_VERCEL_PROJECT_ID;
  if (!pid) throw new Error('PUBLIC_VERCEL_PROJECT_ID manquant (variable d’environnement ; voir tools/vercel-create-public-project.mjs)');
  process.env.VERCEL_PROJECT_ID = pid;
  process.env.D2_PUBLIC = '1';
  process.env.D2_SPRITES = '0';
  delete process.env.D2_REMOTE;
} else if (codeOnly) {
  process.env.D2_REMOTE = '1';
  delete process.env.D2_SPRITES;
} else {
  // sans --code : aucun sprite importé n'est référencé ni embarqué
  process.env.D2_SPRITES = '0';
}
// CLI épinglée (deploy-config.mjs) ; celle du dépôt si elle est installée
const localCli = resolve('node_modules/.bin/vercel');
const vercel = (args, cwd) =>
  existsSync(localCli)
    ? execFileSync(localCli, [...args, '--token', token], { cwd, stdio: 'inherit', env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' } })
    : execFileSync('npx', ['--yes', VERCEL_CLI, ...args, '--token', token], { cwd, stdio: 'inherit', env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' }, shell: process.platform === 'win32' }); // npx est un .cmd sous Windows
/** `vercel pull` écrit les variables du projet (secrets) dans .vercel/.env.*.local : fichiers créés en 0600, et remis en 0600 s'ils existaient déjà */
const pullPrivate = () => {
  const old = process.umask(0o077);
  try {
    vercel(['pull', '--yes', '--environment=production'], process.cwd());
  } finally {
    process.umask(old);
  }
  for (const f of existsSync('.vercel') ? readdirSync('.vercel') : []) if (/^\.env/.test(f)) chmodSync(join('.vercel', f), 0o600);
};
const dir = mkdtempSync(join(tmpdir(), 'd2m-deploy-'));

/** Éléments du dépôt écartés pendant un déploiement public (restaurés dans tous les cas) */
const SUFFIX = '.prev-public';
const stashed = [];
const stash = (p) => {
  if (existsSync(p + SUFFIX)) throw new Error(`${p}${SUFFIX} existe déjà (déploiement public interrompu ?) : restaurer à la main avant de relancer`);
  if (existsSync(p)) {
    renameSync(p, p + SUFFIX);
    stashed.push(p);
  }
};
const restoreStashed = () => {
  while (stashed.length) {
    const p = stashed.pop();
    rmSync(p, { recursive: true, force: true });
    renameSync(p + SUFFIX, p);
  }
};
{
  for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => {
      restoreStashed();
      process.exit(130);
    });
}

try {
  // vercel.json local : généré depuis vercel.example.json (les hôtes viennent de l'environnement, rien en dur dans le dépôt)
  const cfg = buildVercelConfig(JSON.parse(readFileSync('vercel.example.json', 'utf8')), { isPublic, codeOnly, env: process.env });
  if (isPublic) {
    // projet Vercel distinct : .vercel/ (lien du projet actuel) et api/ (synchro) écartés
    stash('.vercel');
    stash('api');
  }
  stash('vercel.json');
  writeFileSync('vercel.json', JSON.stringify(cfg, null, 2) + '\n');
  pullPrivate();
  vercel(['build', '--prod'], process.cwd());
  cpSync('.vercel/output', join(dir, '.vercel/output'), { recursive: true });
  if (isPublic && !existsSync('.vercel/project.json')) writeFileSync('.vercel/project.json', JSON.stringify({ orgId: process.env.VERCEL_ORG_ID, projectId: process.env.VERCEL_PROJECT_ID }));
  cpSync('.vercel/project.json', join(dir, '.vercel/project.json'));
  // offre gratuite : 5 000 fichiers envoyés par jour, une seule archive
  vercel(['deploy', '--prebuilt', '--prod', '--yes', '--archive=tgz'], dir);
} finally {
  rmSync(dir, { recursive: true, force: true });
  restoreStashed();
}
