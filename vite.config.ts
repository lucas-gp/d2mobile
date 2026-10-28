import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, normalize, relative, resolve, sep } from 'node:path';
import { modsPlugin } from './tools/build/mods-plugin.ts';
import { LICENSES_FILE, licensesPlugin } from './tools/build/licenses-plugin.ts';
import { LEGACY_PREFIX } from './src/platform/legacy-names.ts';

/**
 * Génère le service worker après le build : liste des fichiers du cœur (pré-cache immédiat)
 * et des planches de sprites (préchargées en arrière-plan après activation), version = empreinte
 * du contenu. Une nouvelle version n'est appliquée qu'au lancement suivant ou à la demande du joueur (voir registerServiceWorker, platform.ts).
 */
/** The build's version for the update check (lot 297: src/platform/update-check.ts), served `no-store`, outside the service worker's cache */
const VERSION_FILE = 'version.json';

function serviceWorker(): Plugin {
  let outDir = join(process.cwd(), 'dist');
  return {
    name: 'd2m-sw',
    apply: 'build',
    configResolved(cfg) {
      // respecte --outDir (sinon le plugin lisait toujours « dist » et plantait avec un dossier personnalisé)
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      const dist = outDir;
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(dist, p).split('\\').join('/'));
        }
      };
      walk(dist);
      // the server's version (lot 297), written after the walk: never part of the version nor of the cached files (the update check asks it of the network)
      const listed = files.filter((f) => f !== VERSION_FILE);
      files.length = 0;
      files.push(...listed);
      const h = createHash('sha1');
      for (const f of files.sort()) h.update(f + statSync(join(dist, f)).size);
      // le code du service worker fait partie de la version (nouvelle logique → nouveau cache)
      h.update(readFileSync(join(process.cwd(), 'src/platform/sw-template.js'), 'utf8'));
      const version = h.digest('hex').slice(0, 12);
      // le manifeste des planches est lu au démarrage : il fait partie du cœur (mis en cache à
      // l'installation), sinon un démarrage sans réseau lisait une page HTML à sa place
      const core = files.filter((f) => (!f.startsWith('sprites/') || f === 'sprites/manifest.json') && !f.startsWith('d2/') && f !== 'sw.js' && f !== LICENSES_FILE);
      const sprites = files.filter((f) => f.startsWith('sprites/'));
      const tpl = readFileSync(join(process.cwd(), 'src/platform/sw-template.js'), 'utf8');
      // substitution indépendante du style de guillemets (le formateur peut les changer)
      const out = tpl
        .replace(/['"]__VERSION__['"]/, JSON.stringify(version))
        .replace(/['"]__CORE__['"]/, JSON.stringify(core))
        .replace(/['"]__SPRITES__['"]/, JSON.stringify(sprites))
        .replace(/['"]__LEGACY_PREFIX__['"]/, JSON.stringify(LEGACY_PREFIX));
      if (/__(VERSION|CORE|SPRITES|LEGACY_PREFIX)__/.test(out)) throw new Error('service worker : substitution incomplète du modèle');
      writeFileSync(join(dist, 'sw.js'), out);
      writeFileSync(join(dist, VERSION_FILE), `${JSON.stringify({ version })}\n`);
      console.log(`service worker ${version} : ${core.length} fichiers cœur, ${sprites.length} planches`);
    },
  };
}

/**
 * Sprites importés de Diablo II (usage strictement privé, jamais dans le dépôt ni dans `dist`) : le dossier
 * généré par tools/d2import est servi sous /d2/ par les serveurs locaux (dev et preview) s'il existe.
 * Désactivable avec D2_SPRITES=0 (le déploiement le fait). Sans le dossier, le jeu garde ses sprites.
 */
const D2_DIR = resolve(process.env.D2_GAME_DIR ?? join(process.env.D2_OUTPUT_DIR ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'out'), 'game'));
const D2_ENABLED = process.env.D2_SPRITES !== '0' && existsSync(join(D2_DIR, 'manifest.json'));
/**
 * D2_REMOTE=1 : chargeur optionnel de ressources chiffrées, servies sous /d2/ par une réécriture externe de vercel.json (hors dépôt,
 * mot de passe requis dans le jeu). Sans cette variable, aucune ressource chiffrée n'est référencée.
 */
const D2_REMOTE = process.env.D2_SPRITES !== '0' && process.env.D2_REMOTE === '1';
/**
 * D2_PUBLIC=1 : version publiable sans assets Blizzard. Si elle ne référence pas de ressources chiffrées (D2_REMOTE), l'écran
 * de départ ne propose que l'import des fichiers du joueur (génération locale) ; avec des ressources chiffrées, il propose aussi le mot de passe.
 * Sans D2_PUBLIC, rien ne change (développement, version complète) ; `?d2=choose` force l'écran pour un essai.
 */
const D2_MODE = D2_REMOTE ? 'enc' : D2_ENABLED ? 'plain' : 'off';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/**
 * Adresse d'écoute des serveurs locaux (dev et preview) : boucle locale par défaut ; `VITE_HOST=0.0.0.0` (ou `npm run dev:lan`)
 * pour un essai depuis un téléphone du réseau local, en connaissance de cause (le serveur de dev sert aussi le code source).
 */
const HOST = process.env.VITE_HOST || '127.0.0.1';

function d2Sprites(): Plugin {
  const types: Record<string, string> = { '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream' };
  const middleware = (req: { url?: string; socket?: { remoteAddress?: string } }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b?: unknown): void }, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (D2_MODE !== 'plain' || !url.startsWith('/d2/')) return next();
    // planches tirées des MPQ : jamais servies hors de cette machine, même avec VITE_HOST=0.0.0.0
    if (!LOOPBACK.has(req.socket?.remoteAddress ?? '')) {
      res.statusCode = 403;
      return res.end();
    }
    const file = normalize(join(D2_DIR, decodeURIComponent(url.slice(4))));
    if (!file.startsWith(D2_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      return res.end();
    }
    const ext = file.slice(file.lastIndexOf('.'));
    res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(readFileSync(file));
  };
  return {
    name: 'd2m-d2-sprites',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  // coffre de guilde : en local, `/guild-api/*` est relayé vers le service `server/guild` (en production : réécriture Vercel)
  // statistiques anonymes : `/stats-api/*` est relayé vers le service `server/stats` (en production : réécriture Vercel vers STATS_API_URL)
  server: {
    host: HOST,
    proxy: {
      '/guild-api': { target: process.env.GUILD_API_URL ?? 'http://127.0.0.1:5320', changeOrigin: true, rewrite: (p) => p.replace(/^\/guild-api/, '') },
      '/stats-api': { target: process.env.STATS_API_URL ?? 'http://127.0.0.1:5330', changeOrigin: true, rewrite: (p) => p.replace(/^\/stats-api/, '') },
    },
  },
  preview: { host: HOST },
  // D2_ALLOW_SKIP=1 : builds de test seulement (scripts e2e sans MPQ) ; jamais au déploiement : sans lui, on ne joue pas sans les graphismes Diablo II
  define: { __D2_SPRITES__: JSON.stringify(D2_MODE), __D2_PUBLIC__: JSON.stringify(process.env.D2_PUBLIC === '1'), __D2_ALLOW_SKIP__: JSON.stringify(process.env.D2_ALLOW_SKIP === '1') },
  // mods (mods/<id>/) : `MODS=pd2` (défaut : tous les mods présents), `MODS=` pour la base seule ; un mod exclu n'est pas dans le bundle
  plugins: [modsPlugin(), licensesPlugin(), serviceWorker(), d2Sprites()],
});
