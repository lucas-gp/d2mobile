/**
 * Écran de préparation du mode « graphismes locaux » sans repli : logique PURE (testée en unitaire).
 * Le jeu n'affiche que des graphismes Diablo II fabriqués depuis les fichiers du joueur ; il les ATTEND, dans l'ordre où ils sont
 * nécessaires : interface et icônes → carte, sol, murs → joueur et mercenaire → personnages, monstres, objets → effets → sons.
 */

/** Étapes, dans l'ordre de priorité */
export const PREP_ORDER = ['ui', 'icons', 'map', 'ground', 'player', 'units', 'objects', 'fx', 'sounds'] as const;
export type PrepKey = (typeof PREP_ORDER)[number];

export type PrepKind = 'sheet' | 'extra' | 'map' | 'sound';

export interface PrepItem {
  /** identifiant d'asset : planche, lot « extras », carte, ou chemin sonore */
  id: string;
  kind: PrepKind;
  /** poids relatif (temps estimé en secondes sur un PC, avant mesure) */
  weight: number;
  /** palier voulu (cartes) */
  tier?: 'hi' | 'lo';
  /** cartes : données seules (collision, objets), sans les images */
  dataOnly?: boolean;
  /** travail propre à l'élément (sons) : true si fait */
  run?: () => Promise<boolean>;
}

export interface PrepStage {
  key: PrepKey;
  items: PrepItem[];
}

export type PrepGroups = Partial<Record<PrepKey, PrepItem[]>>;

/** Temps de génération typique d'un asset sur PC (s) : mesures de BROWSER.md (phases 2 à 5), palier lo */
export function estimateWeight(id: string, kind: PrepKind): number {
  if (kind === 'extra') return 2;
  if (kind === 'map') return 3;
  if (kind === 'sound') return 0.05;
  if (id.startsWith('fx_')) return 0.08;
  if (id.startsWith('ground_')) return 0.4;
  if (id.startsWith('prop_') || id.startsWith('dec_')) return 0.25;
  if (/_(hd|sh|lg|ra|la|rh|lh|tr|ll|rl|s1|s2|s3|s4|s5|s6|s7|s8)_/.test(id)) return 0.9;
  return 0.7;
}

/** Étapes dans l'ordre de priorité, sans doublon (un identifiant n'est compté que dans la première étape qui le demande) et sans étape vide */
export function planPrep(groups: PrepGroups): PrepStage[] {
  const seen = new Set<string>();
  const out: PrepStage[] = [];
  for (const key of PREP_ORDER) {
    const items: PrepItem[] = [];
    for (const it of groups[key] ?? []) {
      const k = `${it.kind}:${it.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(it);
    }
    if (items.length) out.push({ key, items });
  }
  return out;
}

/** Libellé français d'une étape (traduit ensuite par la couche i18n) ; `done`/`total` ajoutés aux étapes à plusieurs éléments */
export function stageLabel(key: PrepKey, done: number, total: number, town = false): string {
  const n = total > 1 ? ` ${Math.min(done + 1, total)}/${total}` : '';
  switch (key) {
    case 'ui':
      return 'Interface';
    case 'icons':
      return 'Icônes';
    case 'map':
      return 'Carte';
    case 'ground':
      return 'Sols et murs';
    case 'player':
      return 'Équipement';
    case 'units':
      return `${town ? 'Personnages' : 'Monstres'}${n}`;
    case 'objects':
      return `Objets${n}`;
    case 'fx':
      return `Effets${n}`;
    case 'sounds':
      return 'Sons';
  }
}

/** Titre de l'écran : « Préparation de la ville… » / « Préparation de la zone… » */
export const prepTitle = (town: boolean): string => (town ? 'Préparation de la ville…' : 'Préparation de la zone…');

export interface PrepProgress {
  /** 0..1, pondérée par le temps estimé */
  fraction: number;
  /** étape en cours (la première non terminée), null si tout est prêt */
  stage: PrepKey | null;
  done: number;
  total: number;
  /** secondes restantes estimées, null tant qu'aucune mesure n'existe */
  etaSeconds: number | null;
}

/**
 * Progression d'un plan. `doneIds` : éléments terminés (`kind:id`) ; `elapsedMs` : temps écoulé depuis le début. Le temps restant
 * suit le débit mesuré (poids terminés / temps écoulé) dès que `minDone` poids sont faits, sinon l'estimation de départ × `slow`.
 */
export function prepProgress(stages: PrepStage[], doneIds: ReadonlySet<string>, elapsedMs: number, slow = 1): PrepProgress {
  let wTotal = 0;
  let wDone = 0;
  let stage: PrepKey | null = null;
  let done = 0;
  let total = 0;
  for (const s of stages) {
    let d = 0;
    for (const it of s.items) {
      wTotal += it.weight;
      if (doneIds.has(`${it.kind}:${it.id}`)) {
        wDone += it.weight;
        d++;
      }
    }
    if (stage === null && d < s.items.length) {
      stage = s.key;
      done = d;
      total = s.items.length;
    }
  }
  const fraction = wTotal > 0 ? wDone / wTotal : 1;
  const left = wTotal - wDone;
  let eta: number | null = null;
  if (left <= 0) eta = 0;
  else if (wDone >= 1.5 && elapsedMs > 1500) eta = (left * elapsedMs) / 1000 / wDone;
  else if (wTotal > 0) eta = left * slow;
  return { fraction, stage, done, total, etaSeconds: eta };
}

/** « environ 1 min 20 s », « 12 s » ; vide si inconnu */
export function fmtEta(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return '';
  const s = Math.max(1, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/**
 * Plafond de la file de génération en mémoire d'un appareil modeste : au plus `limit` assets en attente à la fois (les suivants sont
 * ajoutés au fil des terminaisons) pour que ni les promesses ni les tampons ne s'accumulent.
 */
export function windowed<T>(items: readonly T[], doneCount: number, limit: number): T[] {
  return items.slice(0, Math.max(0, doneCount) + Math.max(1, limit));
}

/** Messages d'erreur de préparation (clair pour le joueur) */
export type PrepProblem = 'nofiles' | 'quota' | 'unreadable' | 'failed';

export function problemText(p: PrepProblem, detail = ''): string {
  switch (p) {
    case 'nofiles':
      return 'The Diablo II files cannot be found on this device (the browser may have freed the space): please choose them again.';
    case 'quota':
      return 'Storage full: the Diablo II graphics cannot be prepared. Free some space on the device, then restart.';
    case 'unreadable':
      return `Unreadable Diablo II file${detail ? `: ${detail}` : ''}. Please choose it again.`;
    case 'failed':
      return `Some graphics could not be prepared${detail ? ` (${detail})` : ''}.`;
  }
}
