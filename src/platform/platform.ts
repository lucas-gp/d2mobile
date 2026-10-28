/**
 * Intégration navigateur mobile : stockage de la sauvegarde (avec copie de secours),
 * écran maintenu allumé, plein écran + verrouillage paysage (Android), neutralisation des
 * gestes du navigateur, service worker (mise à jour appliquée au lancement suivant ou à la demande du joueur, jamais en pleine partie).
 */
import { parseImportedSave, MAX_IMPORT_BYTES } from '../sim/save-check';
import { DEFAULT_RULESET, deserialize, remapLegacyBases, serialize, type SaveData, type SharedStash } from '../sim/save';
import { quarantineShared } from '../sim/save-orphans';
import { activeRuleset, contentRuleset, defaultRuleset, isKnownRuleset, repairRuleset } from '../mods/activate';
import { CLASS_IDS, type ClassId } from '../data/classes';
import { logError, raiseAlert } from './errorlog';
import { isQuotaError } from './d2cache';
import { freeLegacyCopies, newKeyOf } from './storage-migrate';
import { LEGACY_KEY_PREFIX } from './legacy-names';
import { tr } from '../i18n';
import { askWorkerVersion, DOWNLOAD_STALL_MS, fetchServerVersion, progressOf, SW_UPDATE_TIMEOUT_MS, type UpdateFailure, watchInstall, withTimeout } from './update-check';

/** Texte de sauvegarde lisible par le jeu (migration comprise) ? Sert à ne jamais écraser une bonne copie par une mauvaise. */
export function isValidSaveText(text: string | null): boolean {
  if (!text) return false;
  try {
    deserialize(text);
    return true;
  } catch {
    return false;
  }
}

function validShared(text: string): boolean {
  try {
    return Array.isArray((JSON.parse(text) as SharedStash).tabs);
  } catch {
    return false;
  }
}

/** Version d'application plus ancienne que la sauvegarde (cache d'une ancienne version) : on ne charge pas la copie de secours en silence */
export class FutureSaveError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'FutureSaveError';
  }
}

const KEY = 'd2m.save';
/** Emplacement du personnage en cours (clé de sa sauvegarde) */
const ACTIVE = 'd2m.active';
/** Coffre partagé entre les personnages du jeu de règles `pd2` (clé d'origine, celle de tous les coffres existants) */
const SHARED = 'd2m.shared';
/** Suffixes des copies et dates d'un coffre : jamais un identifiant de jeu de règles */
const SHARED_RESERVED = new Set(['backup', 'at', 'presync', 'premigration-stash']);

/**
 * Coffre partagé d'un jeu de règles (un coffre par jeu de règles : les objets d'un jeu ne passent pas dans l'autre) : `pd2` garde la clé
 * d'origine `d2m.shared` (aucun déplacement du coffre existant), un autre jeu de règles `d2m.shared.<id>` ; dates en `<clé>.at`.
 * Lot 299 (owner: the modes keep their characters apart): a game mode has its own stash too, under its full id
 * (`d2m.shared.d2+survivals`, `d2m.shared.pd2+survivals`), first filled with a copy of its content's stash (`loadShared`).
 */
export function sharedKeyOf(id: string): string {
  const parts = id.split('+');
  for (const p of parts) if (!/^[a-z0-9-]+$/.test(p) || SHARED_RESERVED.has(p)) throw new Error(`Jeu de règles invalide pour un coffre partagé : « ${id} »`);
  if (parts.length === 1 && parts[0] === DEFAULT_RULESET) return SHARED;
  return `${SHARED}.${parts.join('+')}`;
}
/** Jeu de règles d'une clé de coffre partagé (null : pas un coffre) ; un mode de jeu : son identifiant complet */
export function sharedRulesetOfKey(key: string): string | null {
  if (key === SHARED) return DEFAULT_RULESET;
  const m = /^d2m\.shared\.([a-z0-9-]+(?:\+[a-z0-9-]+)*)$/.exec(key);
  return m && !m[1].split('+').some((p) => SHARED_RESERVED.has(p)) ? m[1] : null;
}
/** Identifiant de synchronisation du coffre d'un jeu de règles : `shared` pour `pd2` (celui d'origine), `shared-<id>` sinon (`+` → `_`) */
export function sharedSyncIdOf(id: string): string {
  const key = sharedKeyOf(id);
  return key === SHARED ? SHARED_SYNC_ID : `${SHARED_SYNC_ID}-${key.slice(SHARED.length + 1).replace(/\+/g, '_')}`;
}
/** Jeu de règles d'un identifiant de synchronisation de coffre (null : un personnage) */
export function sharedRulesetOfSyncId(id: string): string | null {
  if (id === SHARED_SYNC_ID) return DEFAULT_RULESET;
  const m = /^shared-([a-z0-9-]+(?:_[a-z0-9-]+)*)$/.exec(id);
  if (!m) return null;
  const parts = m[1].split('_');
  return parts.some((p) => SHARED_RESERVED.has(p)) ? null : parts.join('+');
}
/** Jeu de règles de la session (celui du personnage joué) ; `pd2` sans activation (outils) */
const sessionRuleset = (): string => activeRuleset() ?? DEFAULT_RULESET;

/** Résumé d'un personnage pour l'écran de sélection */
export interface CharSummary {
  slot: string;
  name: string;
  classId: ClassId;
  level: number;
  /** Difficulté la plus haute débloquée */
  difficulty: number;
  savedAt: number;
  /** Jeu de règles du personnage (SaveData.ruleset ; absent dans une sauvegarde d'avant la version 7 : `pd2`) */
  ruleset: string;
  /** Lot 299: the milestones of its progression (numbers only), read by a mode's card on the selection screen */
  milestones?: Record<string, number>;
}

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

/** Emplacements de sauvegarde : `d2m.save` (Sorcière d'origine) et `d2m.save.<id>` */
function isSlot(k: string): boolean {
  // pas de point après l'identifiant : exclut `.backup` (copie de secours) et `.presync` (copie avant remplacement par la synchro)
  const m = /^d2m\.save(?:\.([A-Za-z0-9_-]+))?$/.exec(k);
  if (!m) return false;
  // l'emplacement d'origine (`d2m.save`) a ses copies en `d2m.save.backup`, `.presync`, `.premigration-stash` : ce ne sont pas des personnages
  return !(m[1] && ['backup', 'presync', 'premigration-stash'].includes(m[1]));
}

/** Writes a key; storage full: the fallback copies kept from before the rename (storage-migrate.ts) go first, then one more try */
function writeFreeing(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (!isQuotaError(e) || !freeLegacyCopies(localStorage)) throw e;
    localStorage.setItem(key, value);
  }
}

/** Date de dernière modification du coffre partagé (le coffre n'a pas de `savedAt` dans son contenu) */
/** Suffixe de la copie faite avant la fusion des coffres (conservée) */
const PREMIGRATION = '.premigration-stash';
/**
 * Identifiant d'emplacement pour la synchronisation : le suffixe de la clé (UUID) ; `shared` pour le coffre de `pd2` (`shared-<id>` pour
 * celui d'un autre jeu de règles) ; `legacy` pour l'emplacement d'origine non migré
 */
export const SHARED_SYNC_ID = 'shared';
export function syncIdOfKey(key: string): string {
  const r = sharedRulesetOfKey(key);
  if (r) return sharedSyncIdOf(r);
  return key === KEY ? 'legacy' : key.slice(KEY.length + 1);
}
export function keyOfSyncId(id: string): string {
  const r = sharedRulesetOfSyncId(id);
  if (r) return sharedKeyOf(r);
  return id === 'legacy' ? KEY : `${KEY}.${id}`;
}
function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 0xffffffff)
        .toString(16)
        .padStart(8, '0'),
    ).join('-');
  }
}

/** Anciennes valeurs de l'emplacement actif (une sauvegarde par classe) */
function legacySlot(v: string): string {
  // slot key from before the rename to D2 Mobile (normally rewritten by storage-migrate.ts)
  if (v.startsWith(LEGACY_KEY_PREFIX)) return newKeyOf(v);
  if (v === 'sorceress') return KEY;
  if ((CLASS_IDS as string[]).includes(v)) return `${KEY}.${v}`;
  return v;
}

/** Personnage à créer après le rechargement de la page : son jeu de règles n'est pas celui de la session (un seul par session, src/mods) */
export interface PendingCreate {
  classId: ClassId;
  name: string;
  ruleset: string;
  /** Game mode's variant picked at creation (lot 289) */
  variant?: string;
}
const PENDING_CREATE = 'd2m.pendingCreate';
function readPending(): PendingCreate | null {
  try {
    const p = JSON.parse(read(PENDING_CREATE) ?? 'null') as Partial<PendingCreate> | null;
    if (p && typeof p.name === 'string' && typeof p.ruleset === 'string' && CLASS_IDS.includes(p.classId as ClassId))
      return { classId: p.classId as ClassId, name: p.name, ruleset: p.ruleset, ...(typeof p.variant === 'string' ? { variant: p.variant } : {}) };
  } catch {
    /* illisible : ignoré */
  }
  return null;
}
export const pendingCreate = {
  set(p: PendingCreate): void {
    try {
      localStorage.setItem(PENDING_CREATE, JSON.stringify(p));
    } catch {
      /* stockage indisponible : le joueur recommencera la création */
    }
  },
  /** Lue au démarrage (jeu de règles à activer), sans la retirer */
  peek: readPending,
  /** Lue puis retirée (création faite une seule fois) */
  take(): PendingCreate | null {
    const p = readPending();
    try {
      localStorage.removeItem(PENDING_CREATE);
    } catch {
      /* stockage indisponible */
    }
    return p;
  },
};

/** Mode picked at launch (full ruleset id, `d2m.mode`) and the one-shot "open the list after the reload" flag (`sessionStorage`) */
const LAUNCH_MODE = 'd2m.mode';
const OPEN_LIST = 'd2m.openList';
export const launchMode = {
  /** Last mode picked by the player (null: never picked, or storage unavailable) */
  get(): string | null {
    return read(LAUNCH_MODE);
  },
  set(id: string): void {
    try {
      localStorage.setItem(LAUNCH_MODE, id);
    } catch {
      /* storage unavailable: the mode of the last character played is used */
    }
  },
  /** The page reloads to activate the picked mode: the character list opens directly after it */
  openListAfterReload(): void {
    try {
      sessionStorage.setItem(OPEN_LIST, '1');
    } catch {
      /* the main menu opens instead */
    }
  },
  /** Read once */
  takeOpenList(): boolean {
    try {
      const v = sessionStorage.getItem(OPEN_LIST) === '1';
      sessionStorage.removeItem(OPEN_LIST);
      return v;
    } catch {
      return false;
    }
  },
};

/**
 * Jeu de règles à activer au démarrage (src/mods) : celui d'un personnage en cours de création (page rechargée pour lui), sinon the mode
 * picked at launch (`launchMode`), sinon celui du dernier personnage joué ; sans personnage, ou s'il est inconnu de cette version, celui
 * d'un nouveau personnage (`pd2` si le mod est présent)
 */
export function bootRuleset(): string {
  const p = readPending();
  if (p && isKnownRuleset(p.ruleset)) return p.ruleset;
  const m = launchMode.get();
  if (m && isKnownRuleset(m)) return m;
  const slot = SaveStore.active();
  const r = slot ? SaveStore.list().find((c) => c.slot === slot)?.ruleset : undefined;
  return r && isKnownRuleset(r) ? r : defaultRuleset();
}

/** The numeric entries of a save's milestones (anything else left out) */
function numbersOf(m: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

export const SaveStore = {
  /** Personnages enregistrés, le plus récemment joué d'abord */
  list(): CharSummary[] {
    const out: CharSummary[] = [];
    let keys: string[] = [];
    try {
      keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '').filter(isSlot);
    } catch {
      return out;
    }
    for (const slot of keys) {
      const t = read(slot) ?? read(`${slot}.backup`);
      if (!t) continue;
      try {
        const d = JSON.parse(t) as {
          savedAt?: number;
          ruleset?: unknown;
          character?: { name?: string; level?: number; classId?: ClassId; progression?: { highestDifficulty?: number; milestones?: unknown } };
        };
        const c = d.character ?? {};
        out.push({
          slot,
          name: c.name ?? '',
          classId: c.classId ?? 'sorceress',
          level: c.level ?? 1,
          difficulty: c.progression?.highestDifficulty ?? 0,
          savedAt: d.savedAt ?? 0,
          ruleset: typeof d.ruleset === 'string' ? repairRuleset(d.ruleset) : DEFAULT_RULESET,
          milestones: numbersOf(c.progression?.milestones),
        });
      } catch {
        /* emplacement illisible : ignoré */
      }
    }
    return out.sort((x, y) => y.savedAt - x.savedAt || x.slot.localeCompare(y.slot));
  },
  /** Dernier personnage joué (null : aucun) */
  active(): string | null {
    const a = read(ACTIVE);
    const slot = a ? legacySlot(a) : null;
    if (slot && isSlot(slot) && (read(slot) || read(`${slot}.backup`))) return slot;
    return this.list()[0]?.slot ?? null;
  },
  setActive(slot: string): void {
    try {
      localStorage.setItem(ACTIVE, slot);
    } catch {
      /* stockage indisponible */
    }
  },
  /** Nouvel emplacement libre */
  newSlot(): string {
    // UUID : unique entre appareils (la synchronisation fusionne les personnages par identifiant d'emplacement)
    let k = '';
    do k = `${KEY}.${uuid()}`;
    while (read(k));
    return k;
  },
  /** Rappels de la synchronisation (posés par sync.ts) : un emplacement ou le coffre vient d'être enregistré / supprimé */
  onSaved: null as null | ((key: string) => void),
  onCleared: null as null | ((key: string) => void),
  /** Dernière erreur d'écriture (null : la dernière sauvegarde a réussi) */
  lastError: null as null | { quota: boolean; message: string },
  load(slot: string): SaveData | null {
    for (const key of [slot, `${slot}.backup`]) {
      try {
        const t = localStorage.getItem(key);
        if (!t) continue;
        const save = deserialize(t);
        // lot 299: a ruleset id this version reads under its canonical form (`repairRuleset`), saved so at the next save
        return { ...save, ruleset: repairRuleset(save.ruleset) };
      } catch (e) {
        console.warn(`Sauvegarde ${key} illisible`, e);
        // sauvegarde d'une version plus récente : ne pas retomber sur la copie, plus ancienne, comme si de rien n'était
        if (key === slot && /plus récente/.test((e as Error).message))
          throw new FutureSaveError(`${(e as Error).message} — rechargez l’application pour la mettre à jour avant de jouer ce personnage`);
      }
    }
    return null;
  },
  /** Enregistre une sauvegarde préparée avec une date fixe (en fin de liste : elle ne devient pas le personnage par défaut) */
  seed(s: SaveData, slot: string, savedAt = 1): boolean {
    try {
      localStorage.setItem(slot, serialize({ ...s, savedAt }));
      return true;
    } catch {
      return false;
    }
  },
  save(s: SaveData, slot: string): boolean {
    try {
      const text = serialize({ ...s, savedAt: Date.now() });
      const prev = localStorage.getItem(slot);
      // la copie de secours n'est remplacée que par une sauvegarde VALIDE : si la principale est corrompue, la copie saine est gardée
      if (prev && prev !== text && isValidSaveText(prev)) {
        try {
          localStorage.setItem(`${slot}.backup`, prev);
        } catch (e) {
          // plus de place pour la copie : mieux vaut écrire la principale sans copie que perdre la progression
          console.warn('Copie de secours impossible', e);
        }
      }
      writeFreeing(slot, text);
      this.lastError = null;
      this.onSaved?.(slot);
      return true;
    } catch (e) {
      console.warn('Échec de la sauvegarde', e);
      const quota = isQuotaError(e);
      this.lastError = { quota, message: String((e as Error)?.message ?? e) };
      logError('sauvegarde', e);
      raiseAlert(
        'save',
        quota
          ? 'Sauvegarde impossible : stockage de l’appareil plein. Exportez votre personnage (Réglages) et libérez de la place.'
          : 'Sauvegarde impossible : le navigateur refuse l’écriture. Exportez votre personnage (Réglages).',
        120000,
      );
      return false;
    }
  },
  /** Coffre partagé d'un jeu de règles (défaut : celui de la session) */
  loadShared(ruleset = sessionRuleset()): SharedStash | null {
    const sk = sharedKeyOf(ruleset);
    this.seedModeStash(ruleset, sk);
    for (const key of [sk, `${sk}.backup`]) {
      const t = read(key);
      if (!t) continue;
      try {
        const d = JSON.parse(t) as SharedStash;
        if (Array.isArray(d.tabs)) {
          remapLegacyBases(d.tabs);
          quarantineShared(d);
          return d;
        }
      } catch (e) {
        console.warn(`Coffre partagé ${key} illisible`, e);
      }
    }
    return null;
  },
  /**
   * Lot 299: a game mode's stash (`d2m.shared.<content>+<mode>`) that does not exist yet starts as a copy of its content's stash (the one
   * the mode shared until then: nothing it held is lost to the mode's characters), written once; the content's stash is not touched
   */
  seedModeStash(ruleset: string, sk = sharedKeyOf(ruleset)): void {
    const content = contentRuleset(ruleset);
    if (content === ruleset) return;
    try {
      if (localStorage.getItem(sk) !== null || localStorage.getItem(`${sk}.backup`) !== null) return;
      const from = sharedKeyOf(content);
      const text = [localStorage.getItem(from), localStorage.getItem(`${from}.backup`)].find((t) => t !== null && validShared(t));
      if (!text) return;
      writeFreeing(sk, text);
      localStorage.setItem(`${sk}.at`, String(Date.now()));
      this.onSaved?.(sk);
    } catch (e) {
      logError('coffre du mode', e);
    }
  },
  /** Enregistre le coffre partagé d'un jeu de règles (défaut : celui de la session) */
  saveShared(s: SharedStash | null, ruleset = sessionRuleset()): boolean {
    if (!s) return true;
    const sk = sharedKeyOf(ruleset);
    try {
      const prev = localStorage.getItem(sk);
      const json = JSON.stringify(s);
      // inchangé : ni écriture, ni nouvelle date, ni envoi (la sauvegarde automatique appelle ceci en continu) ; la copie de secours
      // garde ainsi la version d'avant le dernier vrai changement au lieu d'être réécrite avec la version courante
      if (prev === json) return true;
      if (prev && validShared(prev)) {
        try {
          localStorage.setItem(`${sk}.backup`, prev);
        } catch {
          /* pas de place pour la copie */
        }
      }
      writeFreeing(sk, json);
      localStorage.setItem(`${sk}.at`, String(Date.now()));
      this.onSaved?.(sk);
      return true;
    } catch (e) {
      console.warn('Échec de la sauvegarde du coffre partagé', e);
      logError('coffre partagé', e);
      raiseAlert('save', 'Sauvegarde du coffre partagé impossible : stockage de l’appareil plein ou refusé.', 120000);
      return false;
    }
  },
  /**
   * Copie de sauvegarde avant la fusion des coffres personnels dans le coffre partagé : le personnage et le coffre
   * partagé tels quels, en clés séparées (`<clé>.premigration-stash`), écrites une seule fois et jamais écrasées.
   */
  backupBeforeStashMerge(slot: string, ruleset = sessionRuleset()): boolean {
    const SH = sharedKeyOf(ruleset);
    try {
      const k = `${slot}${PREMIGRATION}`;
      if (localStorage.getItem(k)) return true;
      const own = localStorage.getItem(slot) ?? localStorage.getItem(`${slot}.backup`);
      if (!own) return false;
      localStorage.setItem(k, own);
      const sh = localStorage.getItem(SH);
      const sk = `${SH}${PREMIGRATION}`;
      if (sh && !localStorage.getItem(sk)) localStorage.setItem(sk, sh);
      return true;
    } catch (e) {
      logError('copie avant fusion des coffres', e);
      return false;
    }
  },
  clear(slot: string): void {
    try {
      localStorage.removeItem(slot);
      localStorage.removeItem(`${slot}.backup`);
      localStorage.removeItem(`${slot}.presync`);
      localStorage.removeItem(`${slot}${PREMIGRATION}`);
      if (read(ACTIVE) === slot) localStorage.removeItem(ACTIVE);
    } catch {
      /* stockage indisponible */
    }
    this.onCleared?.(slot);
  },
  /* ---- accès brut pour la synchronisation (texte de sauvegarde tel quel) ---- */
  /** Texte d'un emplacement ou du coffre (null : absent / illisible) et sa date de sauvegarde */
  rawText(key: string): { text: string; savedAt: number } | null {
    const shared = sharedRulesetOfKey(key) !== null;
    const text = read(key) ?? (shared ? read(`${key}.backup`) : null);
    if (!text) return null;
    if (shared) return validShared(text) ? { text, savedAt: Number(read(`${key}.at`)) || 0 } : null;
    try {
      return { text, savedAt: (JSON.parse(text) as { savedAt?: number }).savedAt ?? 0 };
    } catch {
      return null;
    }
  },
  /** Installe un texte reçu du serveur (validé) ; l'ancienne version locale est gardée dans `<clé>.presync` ; `.backup` n'est pas touchée */
  installRaw(key: string, text: string, savedAt: number): boolean {
    try {
      const shared = sharedRulesetOfKey(key) !== null;
      if (shared ? !validShared(text) : !isValidSaveText(text)) return false;
      const prev = localStorage.getItem(key);
      if (prev) localStorage.setItem(`${key}.presync`, prev);
      localStorage.setItem(key, text);
      if (shared) localStorage.setItem(`${key}.at`, String(savedAt));
      return true;
    } catch (e) {
      logError('synchronisation', e);
      return false;
    }
  },
  /** Coffres partagés locaux (clés), un par jeu de règles */
  sharedKeys(): string[] {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')
        .filter((k) => sharedRulesetOfKey(k) !== null)
        .sort();
    } catch {
      return [];
    }
  },
  /** Emplacements locaux (clés) existants, hors coffre */
  slotKeys(): string[] {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '').filter(isSlot);
    } catch {
      return [];
    }
  },
  /** L'emplacement d'origine `d2m.save` reçoit un identifiant unique (deux appareils auraient chacun le leur) ; renvoie la nouvelle clé */
  migrateLegacySlot(): string | null {
    const text = read(KEY);
    if (!text) return null;
    const to = this.newSlot();
    try {
      localStorage.setItem(to, text);
      const bk = read(`${KEY}.backup`);
      if (bk) localStorage.setItem(`${to}.backup`, bk);
      const act = read(ACTIVE);
      if (act && legacySlot(act) === KEY) localStorage.setItem(ACTIVE, to);
      localStorage.removeItem(KEY);
      localStorage.removeItem(`${KEY}.backup`);
      return to;
    } catch {
      try {
        localStorage.removeItem(to);
      } catch {
        /* rien */
      }
      return null;
    }
  },
  exportFile(s: SaveData): void {
    const blob = new Blob([serialize(s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `d2m-${s.character.name}-lvl${s.character.level}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  },
  importFile(): Promise<SaveData | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        try {
          if (f.size > MAX_IMPORT_BYTES) throw new Error('fichier trop volumineux');
          resolve(parseImportedSave(await f.text()));
        } catch (e) {
          alert(`Fichier de sauvegarde invalide : ${(e as Error).message}`);
          resolve(null);
        }
      };
      input.click();
    });
  },
};

/** Le point touché est-il dans un conteneur défilant (classe `.scroll`, ou n'importe quel élément en overflow auto/scroll qui déborde) ? Sinon le jeu bloque le geste (pas de défilement de page) */
function inScrollable(t: EventTarget | null): boolean {
  for (let n = t instanceof Element ? t : null; n && n !== document.body; n = n.parentElement) {
    if (n.classList.contains('scroll')) return true;
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return true;
  }
  return false;
}

/** Neutralise zoom, défilement, tirer-pour-rafraîchir, sélection, menu contextuel */
export function lockBrowserGestures(): void {
  const prevent = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  document.addEventListener('gesturestart', prevent, { passive: false });
  document.addEventListener('gesturechange', prevent, { passive: false });
  document.addEventListener('dblclick', prevent, { passive: false });
  document.addEventListener('contextmenu', prevent);
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!inScrollable(e.target) && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
}

let wakeLock: { release(): Promise<void> } | null = null;
export async function keepAwake(): Promise<void> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } };
    if (nav.wakeLock && !wakeLock) wakeLock = await nav.wakeLock.request('screen');
  } catch {
    /* refusé (économie d'énergie) */
  }
}
export function releaseAwake(): void {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

/** Plein écran et paysage (Android ; iOS l'ignore : un écran « tournez l'appareil » s'affiche) */
let fullscreenTried = false;
/**
 * Une seule tentative par lancement (premier toucher) : chaque entrée en plein écran fait afficher par Android le bandeau
 * « Pour quitter le plein écran… », qui gênait en réapparaissant à chaque toucher après une sortie (geste système, bandeau, clavier).
 */
/** Orientation asked of the screen in fullscreen: landscape (the game), or any when a game mode is playable in portrait (`ui.orientation`) */
let orientationPolicy: 'landscape' | 'any' = 'landscape';

/**
 * Is a game on screen (its policy set by `setOrientationPolicy`)? Before it, on the menus, the screen is never locked (lot 290, owner's
 * Fold: the first touch of the menu locked landscape, the Survivals game then unlocked it, the screen turned twice at the launch)
 */
let policySet = false;

/** Sets the orientation policy of the game on screen; if the screen is already in fullscreen, it is locked (or unlocked) right away */
export function setOrientationPolicy(p: 'landscape' | 'any'): void {
  if (p === orientationPolicy && policySet) return;
  orientationPolicy = p;
  policySet = true;
  if (!fullscreenTried) return;
  // a game playable in any orientation leaves the screen as it is (nothing was locked on the menus)
  if (p === 'any' && !locked) return;
  void applyPolicy();
}

/** The screen locked in landscape by `applyPolicy` (unlocked only then) */
let locked = false;

/**
 * Applies the policy to the screen: landscape is locked; `any` unlocks (lot 287: never `lock('any')`, which on Android follows the sensor
 * even when the player has locked the rotation; unlocked, the device keeps its own orientation, as on the menus)
 */
function applyPolicy(): Promise<void> {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
  if (orientationPolicy === 'landscape') {
    locked = true;
    return o.lock?.('landscape').catch(() => undefined) ?? Promise.resolve();
  }
  if (!locked) return Promise.resolve();
  locked = false;
  try {
    o.unlock?.();
  } catch {
    /* non supporté */
  }
  return Promise.resolve();
}

export async function enterFullscreenLandscape(): Promise<void> {
  if (fullscreenTried) return;
  fullscreenTried = true;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (!document.fullscreenElement && el.requestFullscreen && matchMedia('(pointer: coarse)').matches && document.documentElement.dataset.input !== 'pc')
      await el.requestFullscreen({ navigationUI: 'hide' });
    // the menus are never locked: the game's policy applies once it is on screen (lot 290)
    if (policySet) await applyPolicy();
  } catch {
    /* non supporté */
  }
}

/**
 * State of the application's updates (lot 297): `checking` (the server asked), `downloading` (a new version's files, `progress` 0..1),
 * `available` (downloaded, waiting), `installing` then `restarting` (the reload), `uptodate`, `error` (`failure` tells why: offline, server
 * unreachable, server error, download or install failed), `unsupported` (no service worker: dev server, old browser).
 */
export type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'installing' | 'restarting' | 'error' | 'unsupported';

/** The states where a check or an install is under way (the buttons are busy, a tap does nothing) */
export const UPDATE_BUSY: ReadonlySet<UpdateStatus> = new Set(['checking', 'downloading', 'installing', 'restarting']);

/**
 * État des mises à jour de l'application installée (PWA), lu par l'écran Réglages, le bouton de l'accueil et celui d'engrenage :
 * `check()` interroge le serveur (une seule vérification à la fois : un deuxième appel rejoint la première), `apply()` installe la nouvelle
 * version (sauvegarde puis rechargement). `quiet` : la vérification automatique du lancement, discrète (les boutons restent au repos, un
 * échec n'est pas affiché) tant que le joueur ne demande rien.
 */
export const appUpdate = {
  status: 'idle' as UpdateStatus,
  failure: null as UpdateFailure | null,
  /** 0..1 while downloading, installing, restarting; -1 when unknown (checking) */
  progress: -1,
  quiet: false,
  listeners: new Set<() => void>(),
  check: async (_opts?: { quiet?: boolean }): Promise<void> => undefined,
  apply: (): void => undefined,
  set(s: UpdateStatus, o: { failure?: UpdateFailure; progress?: number } = {}): void {
    this.status = s;
    this.failure = s === 'error' ? (o.failure ?? 'unreachable') : null;
    this.progress = o.progress ?? -1;
    this.emit();
  },
  emit(): void {
    for (const l of this.listeners) l();
  },
};

let onUpdateStage: (p: number, text: string) => void = () => undefined;

/** Fenêtre de progression de l'installation d'une mise à jour : étapes réelles (sauvegarde, activation, redémarrage), la barre avance doucement entre deux étapes */
function showUpdateProgress(): { step: (p: number, text: string) => void; close: () => void } {
  const box = document.createElement('div');
  box.className = 'upd-progress';
  box.innerHTML =
    '<div class="upd-pbox"><div class="upd-ptitle"></div><div class="upd-pbar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="upd-ptext" aria-live="polite"></div></div>';
  document.body.appendChild(box);
  (box.querySelector('.upd-ptitle') as HTMLElement).textContent = tr('Mise à jour en cours');
  const barBox = box.querySelector('.upd-pbar') as HTMLElement;
  const bar = box.querySelector('.upd-pbar i') as HTMLElement;
  const txt = box.querySelector('.upd-ptext') as HTMLElement;
  let target = 0;
  let shown = 0;
  const tick = setInterval(() => {
    // avance lentement vers (cible + 0,2) pour montrer que ça travaille, sans jamais dépasser 0,95 avant la fin
    const cap = target >= 1 ? 1 : Math.min(0.95, target + 0.2);
    shown += (cap - shown) * 0.08 + (target >= 1 ? 0.05 : 0);
    const pct = Math.min(100, Math.round(shown * 100));
    bar.style.width = `${pct}%`;
    barBox.setAttribute('aria-valuenow', String(pct));
  }, 100);
  setTimeout(() => clearInterval(tick), 120000);
  return {
    step: (p, text) => {
      target = p;
      txt.textContent = tr(text);
    },
    close: () => {
      clearInterval(tick);
      box.remove();
    },
  };
}

/**
 * Service worker : hors ligne après le premier chargement ; mise à jour cherchée à chaque lancement et appliquée tant que `canUpdateNow`
 * (lot 290 : l'écran d'accueil, aucune partie en cours), sinon au prochain lancement ou sur demande (jamais pendant une partie).
 * Lot 297 : la vérification lit `version.json` (sans cache, 8 s, un nouvel essai) puis ne télécharge que si la version diffère, chaque
 * étape bornée (src/platform/update-check.ts) : jamais « Recherche en cours… » sans fin.
 */
export function registerServiceWorker(canUpdateNow: () => boolean, beforeReload: () => void): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    appUpdate.set('unsupported');
    return;
  }
  const sws = navigator.serviceWorker;
  let waiting: ServiceWorker | null = null;
  let requested = false;
  let reloading = false;
  let registration: ServiceWorkerRegistration | null = null;
  let registering: Promise<ServiceWorkerRegistration | null> | null = null;
  /** The running check's hook on the new worker's download messages */
  let onDownload: ((p: number) => void) | null = null;
  const online = () => navigator.onLine !== false;
  /** A failure: told to the player, unless the check is the launch's discreet one (the buttons back at rest) */
  const fail = (failure: UpdateFailure) => (appUpdate.quiet ? appUpdate.set('idle') : appUpdate.set('error', { failure }));
  const install = () => {
    if (!waiting) return;
    requested = true;
    appUpdate.set('installing', { progress: 0.15 });
    const prog = showUpdateProgress();
    const stage = (p: number, text: string) => {
      prog.step(p, text);
      appUpdate.set(p >= 1 ? 'restarting' : 'installing', { progress: p });
    };
    stage(0.15, 'Sauvegarde de la partie…');
    beforeReload();
    stage(0.4, 'Installation de la nouvelle version…');
    onUpdateStage = stage;
    const sw = waiting;
    sw.postMessage({ type: 'SKIP_WAITING' });
    waiting = null;
    // lot 290: a new version that does not take over (measured offline: the waiting worker never activates) leaves the game as it was,
    // the update still offered; never a progress window forever (lot 297: a worker gone tells the install failed)
    setTimeout(() => {
      if (reloading || sw.state === 'activated') return;
      requested = false;
      prog.close();
      onUpdateStage = () => undefined;
      if (sw.state !== 'redundant') found(sw);
      else fail('install');
    }, 20000);
  };
  const found = (sw: ServiceWorker) => {
    waiting = sw;
    appUpdate.set('available');
  };
  // automatic install (`canUpdateNow`): online only, and once a session at most if a version did not take over (never a loop)
  let autoTried = false;
  const tryApply = () => {
    if (!waiting || autoTried || !online() || !canUpdateNow()) return;
    autoTried = true;
    install();
  };
  appUpdate.apply = install;
  const register = () =>
    sws
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((reg) => (registration = reg))
      .catch(() => {
        registering = null;
        return null;
      });
  /** The check itself; each step bounded (update-check.ts) */
  const runCheck = async (): Promise<void> => {
    if (waiting) return found(waiting);
    appUpdate.set('checking');
    // a tap before the registration's end waits for it (lot 290 told "impossible" at once); a failed registration is tried again
    const reg = registration ?? (await withTimeout((registering ??= register()), SW_UPDATE_TIMEOUT_MS, null));
    if (!reg) return fail(online() ? 'unreachable' : 'offline');
    if (reg.waiting) return found(reg.waiting);
    let nw = reg.installing;
    if (!nw) {
      const srv = await fetchServerVersion({ url: `${import.meta.env.BASE_URL}version.json`, fetch: (u, i) => fetch(u, i), online });
      if (!srv.ok) return fail(srv.reason);
      // the page not yet in a worker's hands (first visit): it is the server's version
      if (!sws.controller) return appUpdate.set('uptodate');
      const running = await askWorkerVersion(sws.controller);
      if (running === srv.version) return appUpdate.set('uptodate');
      // another version on the server (or a worker older than lot 297, which does not tell its version): its worker downloaded
      const r = await withTimeout(
        reg.update().then(
          () => 'ok',
          () => 'error',
        ),
        SW_UPDATE_TIMEOUT_MS,
        'timeout',
      );
      if (r !== 'ok') return fail(online() ? 'unreachable' : 'offline');
      if (reg.waiting) return found(reg.waiting);
      nw = reg.installing;
      // the browser found nothing new: up to date for a worker that cannot tell its version; otherwise the server's files are not all the
      // new version's yet (a deployment going on): a server error, to try again
      if (!nw) return running === null ? appUpdate.set('uptodate') : fail('server');
    }
    const sw = nw;
    appUpdate.set('downloading', { progress: 0 });
    const ok = await watchInstall(sw, DOWNLOAD_STALL_MS, (onProgress) => {
      onDownload = (p) => {
        onProgress();
        appUpdate.set('downloading', { progress: p });
      };
      return () => (onDownload = null);
    });
    if (ok && (reg.waiting || sw.state === 'installed')) return found(reg.waiting ?? sw);
    fail(online() ? 'download' : 'offline');
  };
  let running: Promise<void> | null = null;
  appUpdate.check = (opts = {}) => {
    // one check at a time: a tap during the launch's check joins it, and shows it
    if (running) {
      if (!opts.quiet && appUpdate.quiet) {
        appUpdate.quiet = false;
        appUpdate.emit();
      }
      return running;
    }
    if (appUpdate.status === 'installing' || appUpdate.status === 'restarting') return Promise.resolve();
    appUpdate.quiet = !!opts.quiet;
    running = runCheck()
      .catch(() => fail('unreachable'))
      .finally(() => {
        running = null;
        onDownload = null;
        if (appUpdate.quiet) {
          appUpdate.quiet = false;
          appUpdate.emit();
        }
      });
    return running;
  };
  registering = register();
  void registering.then((reg) => {
    if (!reg) return;
    // au lancement du jeu, une version déjà prête (téléchargée pendant la session précédente) s'installe tout de suite
    if (reg.waiting) {
      found(reg.waiting);
      // (offline the waiting worker does not activate, lot 290: installed at the next launch online)
      if (sws.controller && online()) install();
    }
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && sws.controller && !UPDATE_BUSY.has(appUpdate.status)) found(nw);
      });
    });
    // at each launch, the server asked at once (lot 290, owner), discreetly (lot 297): a new version found on the home screen is installed then (`canUpdateNow`)
    if (!reg.waiting && sws.controller) void appUpdate.check({ quiet: true });
    setInterval(() => void reg.update().catch(() => undefined), 10 * 60 * 1000);
    // au retour dans l'application (PWA rouverte depuis l'écran d'accueil), on cherche tout de suite
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
    // préchargement des planches (hors ligne) en tâche de fond, une fois le jeu lancé
    setTimeout(() => {
      void sws.ready.then((r) => r.active?.postMessage({ type: 'PRECACHE' }));
    }, 8000);
  });
  sws.addEventListener('message', (e: MessageEvent) => {
    // le service worker signale un stockage plein : les fichiers D2 ne sont plus gardés pour le hors ligne
    if (e.data?.type === 'D2_QUOTA') raiseAlert('storage', 'Stockage de l’appareil plein : les nouveaux fichiers du jeu ne seront pas disponibles hors ligne.', 600000);
    // the new version's download (lot 297), followed while a check runs
    if (e.data?.type === 'INSTALL_PROGRESS') onDownload?.(progressOf(Number(e.data.done), Number(e.data.total)));
  });
  sws.startMessages?.();
  // on ne recharge QUE pour une mise à jour demandée (canUpdateNow, que l'application laisse toujours à faux, ou par le bouton) : à la première visite,
  // clients.claim() déclenche aussi « controllerchange » (le jeu se rechargeait tout seul)
  sws.addEventListener('controllerchange', () => {
    if (reloading || !requested) return;
    reloading = true;
    onUpdateStage(1, 'Redémarrage du jeu…');
    setTimeout(() => location.reload(), 250);
  });
  setInterval(tryApply, 3000);
}
