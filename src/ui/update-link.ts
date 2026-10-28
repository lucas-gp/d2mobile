/**
 * "Check for updates" buttons (lot 290 on the main menu, owner's request; lot 297: the same control in Settings › Application, with a
 * progress bar): the application's update state (`appUpdate`, src/platform/platform.ts) on a button. A tap checks the server; on the home
 * screen a new version found is installed at once and the page reloads (no game to lose; the saves are written first), in Settings it waits
 * for a second tap. The button tells each step (checking, downloading x %, installing, restarting, up to date, a precise failure to retry),
 * `aria-busy` while busy and a `progressbar` (determinate when the percentage is known); the launch's automatic check stays discreet
 * (`appUpdate.quiet`: the button at rest).
 */
import { appUpdate, UPDATE_BUSY, type UpdateStatus } from '../platform/platform';
import type { UpdateFailure } from '../platform/update-check';

export interface UpdateLabels {
  status: Record<UpdateStatus, string>;
  /** The `error` state's text by cause */
  failure: Record<UpdateFailure, string>;
}

/** Text of the menu's button by state (French source, translated by the i18n table); short (the home screen's small stone link) */
export const MENU_UPDATE_LABELS: UpdateLabels = {
  status: {
    idle: 'Vérifier les mises à jour',
    checking: 'Vérification…',
    uptodate: 'À jour',
    available: 'Mise à jour disponible',
    downloading: 'Téléchargement {0} %',
    installing: 'Installation…',
    restarting: 'Redémarrage…',
    error: 'Échec · Réessayer',
    unsupported: 'Vérifier les mises à jour',
  },
  failure: {
    offline: 'Hors ligne · Réessayer',
    unreachable: 'Injoignable · Réessayer',
    server: 'Erreur serveur · Réessayer',
    download: 'Interrompu · Réessayer',
    install: 'Échec · Réessayer',
  },
};
/** Lot 290's name, kept for the callers */
export const MENU_UPDATE_LABEL = MENU_UPDATE_LABELS.status;

/** Settings' button (a full-width row: the precise sentence) */
export const SETTINGS_UPDATE_LABELS: UpdateLabels = {
  status: {
    idle: 'Rechercher une mise à jour',
    checking: 'Recherche en cours…',
    uptodate: 'À jour · rechercher de nouveau',
    available: 'Installer la mise à jour et relancer',
    downloading: 'Téléchargement de la mise à jour : {0} %',
    installing: 'Installation…',
    restarting: 'Redémarrage du jeu…',
    error: 'Recherche impossible · réessayer',
    unsupported: 'Mises à jour : installez l’application (hors mode dev)',
  },
  failure: {
    offline: 'Hors ligne : pas de connexion · réessayer',
    unreachable: 'Serveur injoignable · réessayer',
    server: 'Le serveur a mal répondu · réessayer',
    download: 'Téléchargement interrompu · réessayer',
    install: 'La nouvelle version ne s’est pas installée · réessayer',
  },
};

/** The longest label of the menu's button (its layout sizes the button once, whatever the state) */
export const MENU_UPDATE_WIDEST = [...Object.values(MENU_UPDATE_LABELS.status), ...Object.values(MENU_UPDATE_LABELS.failure)].reduce((a, b) => (b.length > a.length ? b : a));

/** State read by `updateView` (appUpdate's fields) */
interface UpdateState {
  status: UpdateStatus;
  failure: UpdateFailure | null;
  progress: number;
  quiet: boolean;
}

/** What a button shows: its text, whether busy, the bar (null: none; -1: under way, length unknown; 0..1 otherwise) */
export function updateView(labels: UpdateLabels, s: UpdateState = appUpdate): { text: string; busy: boolean; bar: number | null; state: string } {
  // the launch's check is discreet: the button at rest until the player asks (a download found meanwhile is shown)
  const status: UpdateStatus = s.quiet && s.status === 'checking' ? 'idle' : s.status;
  const p = Math.max(0, Math.min(1, s.progress));
  const text = status === 'error' && s.failure ? labels.failure[s.failure] : labels.status[status].replace('{0}', String(Math.round(p * 100)));
  const busy = UPDATE_BUSY.has(status);
  const bar = !busy ? null : status === 'checking' || s.progress < 0 ? -1 : p;
  return { text, busy, bar, state: status === 'error' && s.failure ? `error-${s.failure}` : status };
}

/** A tap: checks (a launch's check under way is joined), installs a version ready; `autoApply`: a version found is installed at once */
export function tapUpdate(autoApply: boolean): void {
  const s = appUpdate;
  if (s.status === 'available') return s.apply();
  if (s.status === 'unsupported' || (UPDATE_BUSY.has(s.status) && !s.quiet)) return;
  void s.check().then(() => {
    if (autoApply && s.status === 'available') s.apply();
  });
}

/** Paints `b` (its label, its bar, its accessibility state) from `appUpdate` */
function paint(b: HTMLElement, labels: UpdateLabels): void {
  const v = updateView(labels);
  let lbl = b.querySelector<HTMLElement>(':scope > .upd-lbl');
  let bar = b.querySelector<HTMLElement>(':scope > .upd-bar');
  if (!lbl || !bar) {
    lbl = document.createElement('span');
    lbl.className = 'upd-lbl';
    bar = document.createElement('span');
    bar.className = 'upd-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-label', 'Progression de la mise à jour');
    bar.appendChild(document.createElement('i'));
    b.replaceChildren(lbl, bar);
  }
  if (lbl.textContent !== v.text) lbl.textContent = v.text;
  b.dataset.state = v.state;
  // Settings' button stands out once a version is ready (lot 290's look)
  if (b.classList.contains('btn')) b.classList.toggle('primary', v.state === 'available');
  b.setAttribute('aria-busy', String(v.busy));
  bar.hidden = v.bar === null;
  bar.classList.toggle('ind', v.bar === -1);
  const fill = bar.firstElementChild as HTMLElement;
  if (v.bar !== null && v.bar >= 0) {
    const pct = Math.round(v.bar * 100);
    fill.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
  } else {
    fill.style.removeProperty('width');
    bar.removeAttribute('aria-valuenow');
  }
}

/** Makes `b` an update button: it follows `appUpdate` while shown (then leaves the listeners), a tap checks then installs */
export function bindUpdateControl(b: HTMLElement, labels: UpdateLabels, autoApply: boolean): HTMLElement {
  b.classList.add('upd-btn');
  paint(b, labels);
  let shown = false;
  const onChange = () => {
    // a menu or a panel replaced: its button leaves the listeners
    if (!b.isConnected && shown) {
      appUpdate.listeners.delete(onChange);
      return;
    }
    shown ||= b.isConnected;
    paint(b, labels);
  };
  appUpdate.listeners.add(onChange);
  b.addEventListener('click', () => tapUpdate(autoApply));
  return b;
}

/** Makes `b` the menu's update button (lot 290): a new version found is installed at once */
export function bindUpdateButton(b: HTMLElement): HTMLElement {
  b.dataset.act = 'update';
  return bindUpdateControl(b, MENU_UPDATE_LABELS, true);
}
