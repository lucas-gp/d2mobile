/** Browser entry point. */
// first: storage keys from before the rename are migrated before any module reads them
import './platform/storage-migrate-boot';
import './ui/style.css';
// Pixi sans `eval` / `new Function` (génération des synchronisations d'uniformes) : permet une Content-Security-Policy sans 'unsafe-eval' (vercel.json)
import 'pixi.js/unsafe-eval';
import { App } from './app';
import { initLang, installI18n } from './i18n';
import { installPwaCapture, isIos } from './platform/install';
import { installGlobalErrorHandlers, logError } from './platform/errorlog';
import { activateRuleset } from './mods/activate';
import { bootRuleset } from './platform/platform';

// gestionnaire d'erreurs global : journal local exportable + message discret, la partie continue
installGlobalErrorHandlers();
installPwaCapture();
// conseil « Sur l'écran d'accueil » de l'écran « tournez l'appareil » : iPhone et iPad seulement
if (isIos()) document.documentElement.classList.add('ios');
initLang();
installI18n();

const root = document.getElementById('app')!;
const app = new App(root);
// jeu de règles du dernier personnage joué, activé avant le cœur du jeu (src/mods) ; un autre personnage d'un autre jeu de règles recharge la page
activateRuleset(bootRuleset(), { freezeTables: import.meta.env.DEV })
  .then(() => app.start())
  .catch((e) => {
    console.error(e);
    logError('démarrage', e);
    const box = document.createElement('div');
    box.className = 'loading';
    const inner = document.createElement('div');
    inner.style.textAlign = 'center';
    inner.style.padding = '0 24px';
    inner.append('Erreur au démarrage :', document.createElement('br'), String((e as Error).message ?? e), document.createElement('br'));
    // bouton « Réessayer » : recharge la page (le service worker sert la version complète en cache)
    const retry = document.createElement('button');
    retry.className = 'btn';
    retry.textContent = 'Réessayer';
    retry.style.marginTop = '16px';
    retry.style.pointerEvents = 'auto';
    retry.addEventListener('click', () => location.reload());
    inner.append(retry);
    box.append(inner);
    root.append(box);
  });
