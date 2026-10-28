/** AudioEngine sans Web Audio réel : faux AudioContext minimal, volumes, suspension, repli procédural et sons D2 importés. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/platform/audio';

interface FakeNode {
  kind: string;
  gain?: { value: number };
  started?: boolean;
  buffer?: unknown;
  connect: (n: FakeNode) => FakeNode;
}
class FakeCtx {
  static last: FakeCtx | null = null;
  state: 'running' | 'suspended' = 'running';
  sampleRate = 100;
  currentTime = 0;
  destination: FakeNode = { kind: 'dest', connect: (n) => n };
  nodes: FakeNode[] = [];
  calls: string[] = [];
  decoded = 0;
  constructor() {
    FakeCtx.last = this;
  }
  private node(kind: string, extra: Partial<FakeNode> = {}): FakeNode {
    const n: FakeNode = { kind, connect: (o) => o, ...extra };
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.node('gain', { gain: { value: 1, setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} } as never });
  }
  createDynamicsCompressor() {
    return this.node('comp', { threshold: { value: 0 }, ratio: { value: 0 } } as never);
  }
  createBuffer(_c: number, len: number) {
    return { length: len, getChannelData: () => new Float32Array(len) };
  }
  createBufferSource() {
    const n = this.node('source', {
      playbackRate: { value: 1 },
      start() {
        n.started = true;
      },
    } as never);
    return n;
  }
  createOscillator() {
    return this.node('osc', { type: 'sine', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, start() {}, stop() {} } as never);
  }
  createBiquadFilter() {
    return this.node('filter', { frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 } } as never);
  }
  decodeAudioData(_b: ArrayBuffer) {
    this.decoded++;
    return Promise.resolve({ duration: 1 });
  }
  suspend() {
    this.state = 'suspended';
    this.calls.push('suspend');
    return Promise.resolve();
  }
  resume() {
    this.state = 'running';
    this.calls.push('resume');
    return Promise.resolve();
  }
}

const g = globalThis as unknown as Record<string, unknown>;
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
/** Sources hors tampon silencieux de déverrouillage (1 échantillon, créé par unlock) */
const sources = () => FakeCtx.last!.nodes.filter((n) => n.kind === 'source' && (n.buffer as { length?: number } | undefined)?.length !== 1);
/** Les gains créés au déverrouillage : [maître, effets, ambiance] */
const gains = () => FakeCtx.last!.nodes.filter((n) => n.kind === 'gain');

beforeEach(() => {
  FakeCtx.last = null;
  g.window = { AudioContext: FakeCtx };
  g.fetch = () => Promise.resolve({ ok: false, headers: { get: () => '' } });
  (import.meta as unknown as { env: Record<string, string> }).env.BASE_URL ??= '/';
});
afterEach(() => {
  delete g.window;
});

describe('AudioEngine : volumes et cycle de vie', () => {
  it('sans AudioContext (vieux navigateur), unlock et les sons ne lèvent rien', () => {
    g.window = {};
    const a = new AudioEngine();
    expect(() => {
      a.unlock();
      a.ui();
      a.fail();
      a.levelUp();
      a.gold();
      a.potion();
      a.suspend();
      a.resume();
    }).not.toThrow();
    expect(FakeCtx.last).toBeNull();
  });
  it('unlock crée le contexte et applique les volumes par défaut (effets 0,8 ; ambiance = musique × 0,5)', () => {
    const a = new AudioEngine();
    a.unlock();
    const [master, sfx, amb] = gains();
    expect(master.gain!.value).toBeCloseTo(0.9);
    expect(sfx.gain!.value).toBeCloseTo(0.8);
    expect(amb.gain!.value).toBeCloseTo(0.25);
  });
  it('les volumes réglés avant le déverrouillage sont conservés puis appliqués', () => {
    const a = new AudioEngine();
    a.setVolumes(0.3, 0.6);
    expect(a.sfxVolume).toBe(0.3);
    expect(a.musicVolume).toBe(0.6);
    a.unlock();
    const [, sfx, amb] = gains();
    expect(sfx.gain!.value).toBeCloseTo(0.3);
    expect(amb.gain!.value).toBeCloseTo(0.3);
  });
  it('setVolumes agit en direct sur les gains existants, y compris le silence total', () => {
    const a = new AudioEngine();
    a.unlock();
    a.setVolumes(0, 0);
    const [, sfx, amb] = gains();
    expect(sfx.gain!.value).toBe(0);
    expect(amb.gain!.value).toBe(0);
    a.setVolumes(1, 1);
    expect(sfx.gain!.value).toBe(1);
    expect(amb.gain!.value).toBe(0.5);
  });
  it('un second unlock réutilise le contexte et le relance s’il était suspendu (iOS)', () => {
    const a = new AudioEngine();
    a.unlock();
    const ctx = FakeCtx.last!;
    ctx.state = 'suspended';
    a.unlock();
    expect(FakeCtx.last).toBe(ctx);
    expect(ctx.calls).toContain('resume');
    expect(gains()).toHaveLength(3);
  });
  it('suspend puis resume pilotent le contexte (application en arrière-plan)', () => {
    const a = new AudioEngine();
    a.unlock();
    vi.useFakeTimers();
    a.suspend();
    vi.advanceTimersByTime(1000);
    expect(FakeCtx.last!.state).toBe('running'); // délai de grâce : un aller-retour rapide ne coupe rien
    vi.advanceTimersByTime(4000);
    expect(FakeCtx.last!.state).toBe('suspended');
    a.resume();
    expect(FakeCtx.last!.state).toBe('running');
    a.suspend();
    a.resume(); // retour avant le délai : jamais suspendu
    vi.advanceTimersByTime(10000);
    expect(FakeCtx.last!.state).toBe('running');
    vi.useRealTimers();
  });
  it('suspend/resume avant tout unlock sont sans effet', () => {
    const a = new AudioEngine();
    expect(() => (a.suspend(), a.resume())).not.toThrow();
  });
});

describe('AudioEngine : sons procéduraux de repli', () => {
  it('l’interface produit un son (oscillateur) une fois déverrouillé, rien avant', () => {
    const a = new AudioEngine();
    a.ui();
    expect(FakeCtx.last).toBeNull();
    a.unlock();
    const before = FakeCtx.last!.nodes.filter((n) => n.kind === 'osc').length;
    a.ui();
    a.fail();
    expect(FakeCtx.last!.nodes.filter((n) => n.kind === 'osc').length).toBe(before + 2);
  });
  it('la montée de niveau joue quatre notes', () => {
    const a = new AudioEngine();
    a.unlock();
    a.levelUp();
    expect(FakeCtx.last!.nodes.filter((n) => n.kind === 'osc')).toHaveLength(4);
  });
  it('l’or est limité en cadence : dix pièces d’affilée ne font qu’un son', () => {
    const a = new AudioEngine();
    a.unlock();
    for (let i = 0; i < 10; i++) a.gold();
    expect(FakeCtx.last!.nodes.filter((n) => n.kind === 'osc')).toHaveLength(2); // un seul « ding » à deux notes
  });
});

describe('AudioEngine : attachD2 avec un faux lecteur', () => {
  const index = {
    sounds: {
      ESOUND_CURSOR_BUTTON_CLICK_1: { p: 'ui', o: 2, l: 4, v: 0.5, loop: 0 },
      ESOUND_CURSOR_ERROR_1: { p: 'ui', o: 0, l: 2, v: 1, loop: 0 },
    },
  };
  const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
  const reader =
    (reads: string[], withIndex = true) =>
    async (path: string) => {
      reads.push(path);
      if (path === 'audio/index.json') return withIndex ? enc(index) : null;
      if (path === 'audio/pack-ui.bin') return new Uint8Array([1, 2, 3, 4, 5, 6]);
      return null;
    };

  it('sans import (index absent), l’audio reste procédural et rien n’est décodé', async () => {
    const reads: string[] = [];
    const a = new AudioEngine();
    a.unlock();
    a.attachD2(reader(reads, false));
    await flush();
    expect(reads).toEqual(['audio/index.json']);
    expect(FakeCtx.last!.decoded).toBe(0);
    const osc0 = FakeCtx.last!.nodes.filter((n) => n.kind === 'osc').length;
    a.ui();
    expect(FakeCtx.last!.nodes.filter((n) => n.kind === 'osc').length).toBe(osc0 + 1);
  });
  it('avec l’import : lit l’index, précharge les sons d’interface, puis joue l’échantillon D2 à la place du procédural', async () => {
    const reads: string[] = [];
    const a = new AudioEngine();
    a.unlock();
    a.attachD2(reader(reads));
    await flush();
    expect(reads).toContain('audio/pack-ui.bin');
    expect(reads.filter((r) => r === 'audio/pack-ui.bin')).toHaveLength(1); // un paquet lu une seule fois
    expect(FakeCtx.last!.decoded).toBe(2);
    const osc0 = FakeCtx.last!.nodes.filter((n) => n.kind === 'osc').length;
    a.ui();
    const srcs = sources();
    expect(srcs).toHaveLength(1);
    expect(srcs[0].started).toBe(true);
    expect(FakeCtx.last!.nodes.filter((n) => n.kind === 'osc').length).toBe(osc0); // pas de repli procédural
  });
  it('le volume de l’échantillon D2 suit son volume d’index × le volume de l’appel', async () => {
    const a = new AudioEngine();
    a.unlock();
    a.attachD2(reader([]));
    await flush();
    a.ui();
    const srcs = sources();
    // le gain créé juste après la source : 0,5 (appel) × 0,5 (index)
    const idx = FakeCtx.last!.nodes.indexOf(srcs[0]);
    expect(FakeCtx.last!.nodes[idx + 1].gain!.value).toBeCloseTo(0.25, 5);
  });
  it('un son absent de l’index retombe sur le procédural (levelUp : quatre notes)', async () => {
    const a = new AudioEngine();
    a.unlock();
    a.attachD2(reader([]));
    await flush();
    a.levelUp();
    expect(FakeCtx.last!.nodes.filter((n) => n.kind === 'osc')).toHaveLength(4);
  });
  it('un paquet illisible ne casse rien : le son reste procédural', async () => {
    const a = new AudioEngine();
    a.unlock();
    a.attachD2(async (p) => (p === 'audio/index.json' ? enc(index) : null));
    await flush();
    expect(() => a.ui()).not.toThrow();
    expect(sources()).toHaveLength(0);
  });
});
