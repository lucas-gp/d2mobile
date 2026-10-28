/**
 * Crée (ou retrouve) le projet Vercel de la version publique (nom par défaut « diablo2mobile » ; voir `npm run deploy -- --public`).
 * Idempotent : si le projet existe déjà, il est réutilisé. Affiche son identifiant (jamais le jeton).
 *   VERCEL_TOKEN=… node tools/vercel-create-public-project.mjs
 * Variables : PUBLIC_PROJECT (nom du projet, défaut « diablo2mobile »), VERCEL_SCOPE (slug de l'équipe, obligatoire).
 */
const token = process.env.VERCEL_TOKEN;
const scope = process.env.VERCEL_SCOPE;
if (!token || !scope) {
  console.error("Variables d'environnement requises (voir .env.example) : VERCEL_TOKEN (jeton Vercel) et VERCEL_SCOPE (slug de l'équipe ou du compte Vercel). Facultatif : PUBLIC_PROJECT.");
  process.exit(1);
}
const name = process.env.PUBLIC_PROJECT ?? 'diablo2mobile';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const call = async (method, path, body) => {
  const r = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}slug=${encodeURIComponent(scope)}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
};

let res = await call('GET', `/v9/projects/${encodeURIComponent(name)}`);
let created = false;
if (res.status === 404) {
  res = await call('POST', '/v10/projects', { name, framework: 'vite', installCommand: 'npm ci', buildCommand: 'npm run build', outputDirectory: 'dist' });
  created = true;
}
if (res.status < 200 || res.status >= 300) throw new Error(`API Vercel : HTTP ${res.status} ${res.body?.error?.message ?? ''}`);
const p = res.body;
console.log(`${created ? 'projet créé' : 'projet existant réutilisé'} : ${p.name}`);
console.log(`PUBLIC_VERCEL_PROJECT_ID=${p.id}`);
console.log(`VERCEL_ORG_ID=${p.accountId}`);
