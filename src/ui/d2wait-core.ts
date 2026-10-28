/**
 * Écran d'attente de l'interface Diablo II (sélection de personnage, mode local) : logique pure, testée sans navigateur.
 * L'écran doit toujours avancer ou s'expliquer : état affiché, détection d'absence de progrès, choix de la réparation.
 */
import type { LocalWaitDiag } from '../platform/d2local';

export interface WaitSnap extends LocalWaitDiag {
  /** le lot « ui » est déclaré prêt (marqueur en cache) */
  uiReady: boolean;
  /** images D2 de l'interface réellement enregistrées */
  uiImages: number;
  /** les cinq images indispensables aux écrans sont enregistrées */
  screensReady: boolean;
  /** images listées par l'index de l'interface (attendu) */
  uiIndexed: number;
  /** images indispensables absentes des images enregistrées */
  missingKeys: string[];
  /** images listées mais absentes du cache */
  notInCache: string[];
  /** relectures et refabrication déjà essayées sans succès */
  exhausted: boolean;
  /** copie des MPQ en cours : octets copiés */
  copyDone: number;
}

/** Empreinte de progression : change dès que quelque chose avance */
export function progressKey(s: WaitSnap): string {
  return [
    s.phase,
    s.files,
    s.pending,
    s.active,
    s.batch.done,
    s.generated,
    s.failed.length,
    s.uiReady,
    s.uiImages,
    s.copyDone,
    s.slots.map((x) => `${+x.ready}${+x.dead}${x.job ?? ''}`).join('/'),
  ].join('|');
}

/** Lignes d'état affichées sous le message */
export function statusLines(s: WaitSnap): string[] {
  const slots = s.slots.length ? s.slots.map((x) => (x.dead ? 'stopped' : x.job ? `busy (${x.job})` : x.ready ? 'idle' : 'opening')).join(', ') : 'none';
  const out = [
    `Phase: ${s.phase} · files: ${s.files ? s.files : 'not loaded'}`,
    `Queue: ${s.pending} waiting, ${s.active} running · workers: ${slots}`,
    `Interface: ${s.screensReady ? 'prepared' : s.uiReady ? 'INCOMPLETE' : 'not prepared'}, ${s.uiImages}${s.uiIndexed ? `/${s.uiIndexed}` : ''} image(s) loaded${s.batch.total ? ` · batch ${s.batch.done}/${s.batch.total}` : ''}`,
  ];
  if (!s.screensReady && s.missingKeys.length) out.push(`Missing: ${s.missingKeys.join(', ')}`);
  if (s.notInCache.length) out.push(`Not in cache: ${s.notInCache.slice(0, 8).join(', ')}${s.notInCache.length > 8 ? `… (${s.notInCache.length})` : ''}`);
  if (s.lastError) out.push(`Last error: ${s.lastError}`);
  else if (s.message) out.push(s.message);
  return out;
}

export type WaitVerdict =
  | { kind: 'ok' }
  /** lot prêt (marqueur) mais images pas enregistrées : relire le cache */
  | { kind: 'reload-ui' }
  /** relecture sans effet : le contenu du cache est inutilisable, refabriquer le lot */
  | { kind: 'redo-ui' }
  /** rien en file, rien en cours, aucun échec : la demande s'est perdue, la refaire */
  | { kind: 'rerequest' };

/** Que faire maintenant, sans attendre l'utilisateur ? (appelé à chaque tic ; `tries` = relectures / refabrications déjà faites) */
export function judge(s: WaitSnap, tries: { reload: number; redo: number; rerequest: number }): WaitVerdict {
  if (s.uiReady && !s.screensReady) {
    if (tries.reload < 2) return { kind: 'reload-ui' };
    if (tries.redo < 1) return { kind: 'redo-ui' };
    return { kind: 'ok' };
  }
  if (!s.uiReady && s.files > 0 && s.phase === 'ready' && s.pending + s.active === 0 && !s.failed.length && tries.rerequest < 3) return { kind: 'rerequest' };
  return { kind: 'ok' };
}

/** Message principal de l'écran selon l'état */
export function headline(s: WaitSnap, retrying: boolean): string {
  if (retrying) return 'Retrying…';
  if (s.uiReady && !s.screensReady && s.exhausted) return `The Diablo II interface is incomplete (missing: ${s.missingKeys.join(', ') || '?'}). Retry, verify your files, or choose them again.`;
  if (s.failed.length) return 'The Diablo II interface could not be built from your files. Retry, or choose your files again.';
  if (s.phase === 'needfiles' && !s.files) return 'Diablo II files not found: choose them again.';
  if (s.phase === 'error') return 'The Diablo II files could not be read. Retry, or choose your files again.';
  if (s.phase === 'needperm') return 'Allow access to your Diablo II files to continue.';
  return 'Preparing the Diablo II interface…';
}

export const STUCK_MS = 20000;
