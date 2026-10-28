import { describe, expect, it } from 'vitest';
import { ENGINE_FAIL_KEY, chooseEngine, clearEngineFailure, engineStatus, imageFilterSupported, readEngineFailure, recordEngineFailure, sanitizeEngine } from '../../src/render/engine';
import { withDefaultSettings } from '../../src/sim/save';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe('moteur de rendu', () => {
  it('absent ou inconnu = WebGL (neutre pour les tests et les bots)', () => {
    expect(sanitizeEngine(undefined)).toBe('webgl');
    expect(sanitizeEngine('vulkan')).toBe('webgl');
    expect(withDefaultSettings().renderEngine).toBeUndefined();
    expect(withDefaultSettings(null, true).renderEngine).toBeUndefined();
    expect(withDefaultSettings({ renderEngine: 'webgpu' }, true).renderEngine).toBe('webgpu');
    expect(withDefaultSettings({ renderEngine: 'x' as never }, true).renderEngine).toBe('webgl');
  });

  it('choix : WebGPU seulement si demandé, disponible et jamais échoué', () => {
    expect(chooseEngine(undefined, true, null)).toEqual({ engine: 'webgl', reason: 'default' });
    expect(chooseEngine('webgl', true, null).engine).toBe('webgl');
    expect(chooseEngine('webgpu', true, null)).toEqual({ engine: 'webgpu', reason: 'ok' });
    expect(chooseEngine('webgpu', false, null)).toEqual({ engine: 'webgl', reason: 'no-gpu-api' });
    expect(chooseEngine('webgpu', true, 'device lost')).toEqual({ engine: 'webgl', reason: 'previous-failure' });
  });

  it('l’échec est mémorisé puis effacé ; un stockage défaillant ne casse rien', () => {
    const s = memStore();
    expect(readEngineFailure(s)).toBeNull();
    recordEngineFailure(s, 'adapter null');
    expect(s.m.get(ENGINE_FAIL_KEY)).toBe('adapter null');
    expect(chooseEngine('webgpu', true, readEngineFailure(s)).engine).toBe('webgl');
    clearEngineFailure(s);
    expect(chooseEngine('webgpu', true, readEngineFailure(s)).engine).toBe('webgpu');
    const bad = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(readEngineFailure(bad)).toBeNull();
    expect(() => recordEngineFailure(bad, 'a')).not.toThrow();
    expect(() => clearEngineFailure(bad)).not.toThrow();
    expect(readEngineFailure(null)).toBeNull();
  });

  it('le filtre GLSL n’est monté que sous WebGL', () => {
    expect(imageFilterSupported('webgl')).toBe(true);
    expect(imageFilterSupported('webgpu')).toBe(false);
  });

  it('messages d’état', () => {
    expect(engineStatus('webgl', 'webgl', null, true)).toBeNull();
    expect(engineStatus('webgpu', 'webgpu', null, true)?.text).toMatch(/qualité d’image/);
    expect(engineStatus('webgpu', 'webgl', null, false)?.kind).toBe('warn');
    expect(engineStatus('webgpu', 'webgl', 'échec', true)?.kind).toBe('warn');
    expect(engineStatus('webgpu', 'webgl', null, true)?.kind).toBe('info');
    expect(engineStatus('webgl', 'webgpu', null, true)?.text).toMatch(/WebGL/);
  });
});
