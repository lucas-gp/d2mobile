/**
 * Mode de commandes : tactile ou « PC » (souris + clavier façon Diablo II).
 * Fonctions pures (testables) + petit magasin d'état : réglage « Commandes » (auto / tactile / souris + clavier)
 * et dernière entrée utilisée, qui bascule l'interface à la volée sur un appareil à la fois tactile et précis.
 */
export type InputMode = 'touch' | 'pc';
export type ControlsPref = 'auto' | 'touch' | 'pc';
export type LastInput = 'touch' | 'mouse' | null;

export interface Capabilities {
  /** pointeur principal précis (souris, pavé tactile) */
  primaryFine: boolean;
  /** le pointeur principal sait survoler */
  primaryHover: boolean;
  /** au moins un pointeur précis disponible */
  anyFine: boolean;
  /** au moins un pointeur grossier (écran tactile) disponible */
  anyCoarse: boolean;
}

export function readCapabilities(mq: (q: string) => { matches: boolean } = (q) => matchMedia(q)): Capabilities {
  return {
    primaryFine: mq('(pointer: fine)').matches,
    primaryHover: mq('(hover: hover)').matches,
    anyFine: mq('(any-pointer: fine)').matches,
    anyCoarse: mq('(any-pointer: coarse)').matches,
  };
}

const CAP_QUERIES = ['(pointer: fine)', '(hover: hover)', '(any-pointer: fine)', '(any-pointer: coarse)'];

interface WatchableQuery {
  matches: boolean;
  addEventListener?(type: 'change', fn: () => void): void;
  removeEventListener?(type: 'change', fn: () => void): void;
}

/**
 * Suit les capacités de pointage pendant la partie (souris ou clavier branchés, pliable plié ou déplié) : chaque changement d'une des
 * requêtes relit les capacités et recalcule le mode. Renvoie la fonction qui arrête l'écoute.
 */
export function watchCapabilities(store: InputModeStore, mq: (q: string) => WatchableQuery = (q) => matchMedia(q)): () => void {
  const lists = CAP_QUERIES.map(mq);
  const onChange = (): void => store.setCapabilities(readCapabilities(mq));
  for (const l of lists) l.addEventListener?.('change', onChange);
  return () => {
    for (const l of lists) l.removeEventListener?.('change', onChange);
  };
}

/** Mode effectif : le réglage force, sinon « auto » = pointeur principal précis sans écran tactile principal, ou dernière entrée utilisée sur un appareil hybride */
export function resolveInputMode(pref: ControlsPref, cap: Capabilities, last: LastInput): InputMode {
  if (pref === 'touch') return 'touch';
  if (pref === 'pc') return 'pc';
  const pcPrimary = cap.primaryFine && cap.primaryHover;
  if (pcPrimary) return cap.anyCoarse && last === 'touch' ? 'touch' : 'pc';
  return cap.anyFine && last === 'mouse' ? 'pc' : 'touch';
}

type Listener = (m: InputMode) => void;

export class InputModeStore {
  pref: ControlsPref = 'auto';
  last: LastInput = null;
  private mode: InputMode;
  private listeners = new Set<Listener>();

  constructor(private cap: Capabilities) {
    this.mode = resolveInputMode(this.pref, cap, this.last);
  }

  get current(): InputMode {
    return this.mode;
  }

  get capabilities(): Capabilities {
    return this.cap;
  }

  setCapabilities(c: Capabilities): void {
    this.cap = c;
    this.recompute();
  }

  setPref(p: ControlsPref): void {
    this.pref = p;
    this.recompute();
  }

  /** Dernière entrée : 'mouse' (souris, stylet ou clavier d'un appareil à pointeur précis) ou 'touch' */
  noteInput(kind: 'touch' | 'mouse'): void {
    if (this.last === kind) return;
    this.last = kind;
    this.recompute();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private recompute(): void {
    const m = resolveInputMode(this.pref, this.cap, this.last);
    if (m === this.mode) return;
    this.mode = m;
    for (const f of this.listeners) f(m);
  }
}

/* ------------------------------ Clavier ------------------------------ */

export type KeyAction =
  | { t: 'skill'; slot: number }
  | { t: 'potion'; kind: 'heal' | 'mana' | 'rejuv' }
  | { t: 'panel'; name: 'inventory' | 'character' | 'skills' | 'settings' | 'help' }
  | { t: 'throw' }
  | { t: 'walk' }
  | { t: 'map' }
  | { t: 'escape' }
  | { t: 'portal' }
  | { t: 'context' }
  | { t: 'teleport' }
  | { t: 'page' }
  | { t: 'image' };

/** Touches de Diablo II (mode PC) : F1-F8 compétences, 1-4 ceinture, I / C / S panneaux, M ou Tab carte, Échap */
export function keyActionPc(code: string, key = ''): KeyAction | null {
  const f = /^F([1-8])$/.exec(code);
  if (f) return { t: 'skill', slot: Number(f[1]) - 1 };
  switch (code) {
    case 'Digit1':
    case 'Digit4':
      return { t: 'potion', kind: 'heal' };
    case 'Digit2':
      return { t: 'potion', kind: 'mana' };
    case 'Digit3':
      return { t: 'potion', kind: 'rejuv' };
    case 'KeyI':
    case 'KeyB':
      return { t: 'panel', name: 'inventory' };
    case 'KeyC':
      return { t: 'panel', name: 'character' };
    case 'KeyS':
    case 'KeyT':
      return { t: 'panel', name: 'skills' };
    case 'KeyH':
      return { t: 'panel', name: 'help' };
    case 'KeyM':
    case 'Tab':
      return { t: 'map' };
    case 'Escape':
      return { t: 'escape' };
    case 'KeyP':
      return { t: 'portal' };
    case 'KeyG':
      return { t: 'throw' };
    case 'KeyR':
      return { t: 'walk' };
    case 'KeyE':
      return { t: 'context' };
    case 'Space':
      return { t: 'teleport' };
  }
  if (key === '?') return { t: 'panel', name: 'help' };
  if (code === 'KeyV') return { t: 'image' };
  return null;
}

/** Ancien clavier de secours du mode tactile (chiffres = compétences de la page, R / F potions, K compétences…) */
export function keyActionTouch(code: string): KeyAction | null {
  if (/^Digit[1-4]$/.test(code)) return { t: 'skill', slot: Number(code.slice(5)) - 1 };
  switch (code) {
    case 'Space':
      return { t: 'teleport' };
    case 'KeyR':
      return { t: 'potion', kind: 'heal' };
    case 'KeyF':
      return { t: 'potion', kind: 'mana' };
    case 'KeyG':
      return { t: 'throw' };
    case 'KeyE':
      return { t: 'context' };
    case 'KeyI':
    case 'KeyB':
      return { t: 'panel', name: 'inventory' };
    case 'KeyK':
    case 'KeyT':
      return { t: 'panel', name: 'skills' };
    case 'KeyC':
      return { t: 'panel', name: 'character' };
    case 'KeyP':
      return { t: 'portal' };
    case 'Tab':
      return { t: 'page' };
    case 'Escape':
      return { t: 'escape' };
    case 'KeyV':
      return { t: 'image' };
  }
  return null;
}

export type MouseIntent = 'primary' | 'secondary' | 'none';

/** Bouton de souris → compétence : gauche = principale, droit = secondaire (jamais le bouton du milieu) */
export function mouseButtonIntent(button: number): MouseIntent {
  return button === 0 ? 'primary' : button === 2 ? 'secondary' : 'none';
}

/** Compétence liée au bouton : la secondaire retombe sur l'attaque normale si le slot est vide */
export function skillForButton(hb: { primary: string; secondary?: string | null }, intent: MouseIntent): string | null {
  if (intent === 'primary') return hb.primary || 'attack';
  if (intent === 'secondary') return hb.secondary || 'attack';
  return null;
}

/** Touches de déplacement au clavier : WASD seulement en mode tactile (en mode PC, S ouvre les compétences comme dans Diablo II) */
export function movementKeys(mode: InputMode): string[] {
  return mode === 'pc' ? ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] : ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
}

/** Liste des raccourcis pour le panneau d'aide (PC) : [touche, description] */
export const SHORTCUTS: [string, string][] = [
  ['Clic gauche (sol)', 'Se déplacer (maintenir : marcher vers le curseur)'],
  ['Clic gauche (monstre)', 'Attaquer avec la compétence de gauche'],
  ['Clic droit', 'Compétence de droite'],
  ['Maj + clic', 'Attaquer sur place, sans se déplacer'],
  ['Clic sur un objet / PNJ', 'Ramasser / interagir'],
  ['F1 – F8', 'Compétences de la barre (sur une compétence survolée du panneau : lui assigner la touche)'],
  ['1 2 3 4', 'Potions de la ceinture (vie, mana, rajeunissement, vie)'],
  ['G', 'Lancer une potion de jet vers le curseur (la dernière ramassée ou achetée)'],
  ['I', 'Inventaire'],
  ['C', 'Personnage'],
  ['S', 'Arbre de compétences'],
  ['M ou Tab', 'Carte'],
  ['Alt (maintenu)', 'Afficher tous les objets au sol'],
  ['Espace', 'Téléportation vers le curseur (si apprise)'],
  ['P', 'Ouvrir un portail de ville'],
  ['E', 'Interagir / ramasser le plus proche'],
  ['V', "Qualité d'image : préréglage suivant (Off, Doux, Net, Cinéma)"],
  ['H ou ?', 'Cette aide'],
  ['Échap', 'Fermer le panneau, ou ouvrir les réglages'],
];
