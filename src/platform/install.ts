/**
 * Installation de l'application (PWA) : capture de `beforeinstallprompt` (Chrome, Edge, Android), état « déjà installée »
 * (display-mode: standalone / appinstalled) et indication « Partager → Sur l'écran d'accueil » sur iOS Safari (aucun événement).
 * Textes en anglais direct (version publique).
 */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

const isStandalone = (): boolean => {
  try {
    return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  } catch {
    return false;
  }
};

export const isIos = (): boolean => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** À appeler tout de suite au démarrage : l'événement n'est émis qu'une fois */
export function installPwaCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export type InstallState = { kind: 'none' } | { kind: 'prompt' } | { kind: 'ios' };

export function installState(): InstallState {
  if (installed || isStandalone()) return { kind: 'none' };
  if (deferred) return { kind: 'prompt' };
  if (isIos()) return { kind: 'ios' };
  return { kind: 'none' };
}

async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const d = deferred;
  if (!d) return 'unavailable';
  deferred = null;
  emit();
  try {
    await d.prompt();
    const r = await d.userChoice;
    return r.outcome;
  } catch {
    return 'unavailable';
  }
}

function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Bouton « Install the app » (ou indication iOS) ; null si rien à proposer. `compact` : petit bouton discret. */
export function installControl(compact = false): HTMLElement {
  const box = document.createElement('div');
  box.className = `pwa-install${compact ? ' compact' : ''}`;
  const render = (): void => {
    box.replaceChildren();
    const s = installState();
    box.hidden = s.kind === 'none';
    if (s.kind === 'prompt') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = 'Install the app';
      b.dataset.act = 'pwa-install';
      b.addEventListener('click', () => void promptInstall());
      box.append(b);
    } else if (s.kind === 'ios') {
      const t = document.createElement('span');
      t.className = 'pwa-hint';
      t.textContent = 'To install: Share → Add to Home Screen';
      box.append(t);
    }
  };
  render();
  onInstallChange(render);
  return box;
}
