/**
 * Journal d'erreurs local et alertes discrètes : un gestionnaire global (window.onerror, unhandledrejection)
 * range chaque erreur dans un petit journal (localStorage, exportable) et prévient le joueur par un message
 * court, sans jamais interrompre la partie. Les alertes de stockage (sauvegarde impossible, quota plein)
 * passent par le même canal.
 */
const LOG_KEY = 'd2m.errlog';
const MAX_ENTRIES = 60;

export interface ErrorEntry {
  /** horodatage (ms) */
  t: number;
  /** origine : error, promesse, sauvegarde, stockage… */
  kind: string;
  msg: string;
  stack?: string;
}

export type AlertKind = 'error' | 'save' | 'storage';
type AlertListener = (kind: AlertKind, text: string) => void;

const listeners = new Set<AlertListener>();
const lastShown = new Map<string, number>();

/** S'abonne aux alertes joueur (l'application les affiche dans le HUD) ; renvoie le désabonnement */
export function onAlert(cb: AlertListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Émet une alerte, au plus une fois par `cooldownMs` pour un même texte (pas de spam à 60 i/s) */
export function raiseAlert(kind: AlertKind, text: string, cooldownMs = 20000, now = Date.now()): boolean {
  const key = `${kind}:${text}`;
  const prev = lastShown.get(key);
  if (prev !== undefined && now - prev < cooldownMs) return false;
  lastShown.set(key, now);
  for (const l of listeners) {
    try {
      l(kind, text);
    } catch {
      /* un abonné défaillant ne doit pas masquer l'alerte aux autres */
    }
  }
  return true;
}

/** Copie en mémoire : le journal reste lisible/exportable même quand le stockage est plein (cas fréquent : c'est justement l'erreur à journaliser) */
let mem: ErrorEntry[] = [];

export function readErrorLog(): ErrorEntry[] {
  let stored: ErrorEntry[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
    if (Array.isArray(v)) stored = v as ErrorEntry[];
  } catch {
    /* illisible : on part de la copie en mémoire */
  }
  const lastT = (l: ErrorEntry[]) => l[l.length - 1]?.t ?? -1;
  return mem.length && lastT(mem) >= lastT(stored) ? mem.map((e) => ({ ...e })) : stored;
}

/** Ajoute une entrée au journal (borné) ; renvoie false si elle répète la précédente (compteur incrémenté) */
export function logError(kind: string, err: unknown, now = Date.now()): boolean {
  const e = err as { message?: unknown; stack?: unknown } | null;
  const msg = String(e?.message ?? err ?? 'erreur inconnue').slice(0, 300);
  const stack = typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 6).join('\n').slice(0, 800) : undefined;
  const log = readErrorLog();
  const last = log[log.length - 1];
  if (last && last.kind === kind && last.msg === msg) {
    last.t = now;
    last.msg = msg;
    write(log);
    return false;
  }
  log.push({ t: now, kind, msg, stack });
  while (log.length > MAX_ENTRIES) log.shift();
  write(log);
  return true;
}

function write(log: ErrorEntry[]): void {
  mem = log.map((e) => ({ ...e }));
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* stockage plein : le journal reste en mémoire pour cette session (exportable) */
  }
}

/** Texte du journal pour l'export (lisible, avec l'appareil et la version) */
export function formatErrorLog(log: ErrorEntry[] = readErrorLog(), env = ''): string {
  const head = `D2 Mobile — journal d'erreurs (${log.length})${env ? `\n${env}` : ''}\n`;
  return head + log.map((e) => `\n[${new Date(e.t).toISOString()}] ${e.kind} : ${e.msg}${e.stack ? `\n${e.stack}` : ''}`).join('\n');
}

export function exportErrorLog(): void {
  const env = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const blob = new Blob([formatErrorLog(readErrorLog(), env)], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `d2m-errors-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** Traite une erreur capturée : journal + message discret (une fois par erreur distincte et par minute) */
export function reportError(kind: string, err: unknown): void {
  try {
    console.error(err);
    logError(kind, err);
    const msg = String((err as { message?: unknown } | null)?.message ?? err ?? '').slice(0, 80);
    raiseAlert('error', `Une erreur est survenue (${msg}). La partie continue — journal exportable dans Réglages.`, 60000);
  } catch {
    /* le gestionnaire d'erreurs ne doit jamais lever lui-même */
  }
}

let installed = false;
/** Branche window.onerror et unhandledrejection (idempotent) */
export function installGlobalErrorHandlers(target: Pick<Window, 'addEventListener'> = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener('error', (ev) => {
    const e = ev as ErrorEvent;
    // erreur de chargement de ressource (image, script) : pas une erreur de code
    if (!e.error && !e.message) return;
    reportError('erreur', e.error ?? e.message);
  });
  target.addEventListener('unhandledrejection', (ev) => reportError('promesse', (ev as PromiseRejectionEvent).reason));
}

/** Pour les tests */
export function resetErrorHandlersForTest(): void {
  installed = false;
  mem = [];
  lastShown.clear();
  listeners.clear();
}
