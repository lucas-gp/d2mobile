/**
 * Moteur de rendu (WebGL par défaut, WebGPU expérimental) : logique pure, sans Pixi ni DOM.
 *  - choix : réglage du joueur + disponibilité de `navigator.gpu` + échec mémorisé sur CET appareil ;
 *  - l'échec est mémorisé localement (jamais synchronisé : il dépend de l'appareil) pour ne pas retenter à chaque lancement ;
 *    choisir de nouveau WebGPU dans les réglages efface la mémoire et autorise un nouvel essai.
 */
export type RenderEngine = 'webgl' | 'webgpu';

export const ENGINE_FAIL_KEY = 'd2m.renderEngineFailed';

export function sanitizeEngine(v: unknown): RenderEngine {
  return v === 'webgpu' ? 'webgpu' : 'webgl';
}

export interface EngineChoice {
  /** Moteur demandé à Pixi */
  engine: RenderEngine;
  /** Pourquoi : ok = WebGPU tenté ; default = WebGL choisi ; no-gpu-api = `navigator.gpu` absent ; previous-failure = échec mémorisé */
  reason: 'ok' | 'default' | 'no-gpu-api' | 'previous-failure';
}

/** `failure` : texte de l'échec mémorisé (null = aucun) */
export function chooseEngine(setting: unknown, hasGpuApi: boolean, failure: string | null): EngineChoice {
  if (sanitizeEngine(setting) !== 'webgpu') return { engine: 'webgl', reason: 'default' };
  if (!hasGpuApi) return { engine: 'webgl', reason: 'no-gpu-api' };
  if (failure) return { engine: 'webgl', reason: 'previous-failure' };
  return { engine: 'webgpu', reason: 'ok' };
}

/** Le filtre « Qualité d'image » est écrit en GLSL (WebGL) : monté seulement sous WebGL */
export function imageFilterSupported(engine: RenderEngine): boolean {
  return engine === 'webgl';
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readEngineFailure(store: Store | null): string | null {
  try {
    return store?.getItem(ENGINE_FAIL_KEY) || null;
  } catch {
    return null;
  }
}
export function recordEngineFailure(store: Store | null, reason: string): void {
  try {
    store?.setItem(ENGINE_FAIL_KEY, reason.slice(0, 200) || 'échec');
  } catch {
    /* stockage indisponible : l'essai sera simplement retenté */
  }
}
export function clearEngineFailure(store: Store | null): void {
  try {
    store?.removeItem(ENGINE_FAIL_KEY);
  } catch {
    /* sans conséquence */
  }
}

/** Message du joueur dans les réglages selon l'état (chaînes françaises, traduites par en.json) */
export function engineStatus(requested: unknown, active: RenderEngine, failure: string | null, hasGpuApi: boolean): { text: string; kind: 'info' | 'warn' } | null {
  const want = sanitizeEngine(requested);
  if (want === 'webgpu' && active === 'webgpu') return { text: 'WebGPU actif. La qualité d’image (netteté, mise à l’échelle, ambiance) n’est pas disponible sous WebGPU.', kind: 'info' };
  if (want === 'webgpu' && !hasGpuApi) return { text: 'WebGPU n’est pas disponible sur cet appareil : WebGL est utilisé.', kind: 'warn' };
  if (want === 'webgpu' && failure) return { text: 'WebGPU a échoué sur cet appareil : WebGL est utilisé. Rechoisissez WebGPU pour réessayer.', kind: 'warn' };
  if (want === 'webgpu') return { text: 'WebGPU sera essayé au prochain rechargement.', kind: 'info' };
  if (want === 'webgl' && active === 'webgpu') return { text: 'WebGL sera utilisé au prochain rechargement.', kind: 'info' };
  return null;
}
