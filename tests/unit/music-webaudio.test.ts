import { describe, expect, it } from 'vitest';
import { MusicPlayer, estimatePcmBytes, fitsMemory, MUSIC_MAX_PCM, FADE_IN } from '../../src/platform/music';

/** Faux AudioContext : enregistre les nœuds, aucune sortie sonore */
function fake() {
  const log = { sources: [] as FakeSrc[], gains: [] as FakeGain[] };
  class FakeParam {
    value = 0;
    ramps: [number, number][] = [];
    setValueAtTime(v: number) {
      this.value = v;
    }
    linearRampToValueAtTime(v: number, t: number) {
      this.ramps.push([v, t]);
      this.value = v;
    }
    setTargetAtTime(v: number) {
      this.value = v;
    }
    cancelScheduledValues() {}
  }
  class FakeGain {
    gain = new FakeParam();
    connect(n: unknown) {
      return n;
    }
    disconnect() {}
  }
  class FakeSrc {
    buffer: unknown = null;
    loop = false;
    started = false;
    stopAt = -1;
    onended: (() => void) | null = null;
    connect(n: unknown) {
      return n;
    }
    disconnect() {}
    start() {
      this.started = true;
    }
    stop(t: number) {
      this.stopAt = t;
    }
  }
  const ctx = {
    currentTime: 10,
    createGain() {
      const g = new FakeGain();
      log.gains.push(g);
      return g as unknown as GainNode;
    },
    createBufferSource() {
      const s = new FakeSrc();
      log.sources.push(s);
      return s as unknown as AudioBufferSourceNode;
    },
  };
  return { ctx, log };
}

function setup(sizes: Record<string, number> = {}) {
  const f = fake();
  const reads: string[] = [];
  let decodes = 0;
  const p = new MusicPlayer({
    ctx: f.ctx,
    out: {} as AudioNode,
    has: () => true,
    read: async (k) => {
      reads.push(k);
      return new Uint8Array(sizes[k] ?? 1000);
    },
    decode: async () => {
      decodes++;
      return { duration: 5 } as AudioBuffer;
    },
  });
  return { p, f, reads, decodes: () => decodes };
}

describe('musique Web Audio', () => {
  it('estime la mémoire décodée (mono 22 050 Hz)', () => {
    expect(estimatePcmBytes(6000)).toBe(22050 * 4); // 1 s de MP3 48 kb/s = 88 200 octets
    expect(fitsMemory(2_876_298)).toBe(true); // plus gros morceau D2 (~42 Mo décodés)
    expect(estimatePcmBytes(2_876_298)).toBeLessThan(MUSIC_MAX_PCM);
    expect(fitsMemory(6000 * 800)).toBe(false);
  });

  it('volume 0 : rien n’est lu, décodé ni créé', async () => {
    const { p, f, reads, decodes } = setup();
    p.setLevel(0);
    await p.play('town');
    p.preload('crypt');
    expect(reads).toHaveLength(0);
    expect(decodes()).toBe(0);
    expect(f.log.sources).toHaveLength(0);
    expect(await p.stinger('st_x', 0.5)).toBe(0);
  });

  it('joue en boucle avec fondu entrant, puis démarre au passage de 0 à >0', async () => {
    const { p, f } = setup();
    p.setLevel(0);
    await p.play('town');
    expect(f.log.sources).toHaveLength(0);
    p.setLevel(0.5);
    await new Promise((r) => setTimeout(r, 0));
    expect(f.log.sources).toHaveLength(1);
    const s = f.log.sources[0];
    expect(s.loop).toBe(true);
    expect(s.started).toBe(true);
    expect(f.log.gains[0].gain.ramps[0]).toEqual([0.5, 10 + FADE_IN]);
  });

  it('fondu enchaîné : l’ancienne piste s’éteint, une seule reste active', async () => {
    const { p, f } = setup();
    p.setLevel(0.5);
    await p.play('a');
    await p.play('b');
    const [a, b] = f.log.sources as unknown as { stopAt: number }[];
    expect(a.stopAt).toBeGreaterThan(10);
    expect(b.stopAt).toBe(-1);
    expect(p.currentKey).toBe('b');
    await p.play('b'); // même piste : rien de plus
    expect(f.log.sources).toHaveLength(2);
  });

  it('garde mémoire : piste trop grosse refusée, cache limité à 2, retour instantané', async () => {
    const { p, f, reads, decodes } = setup({ big: 6000 * 800 });
    p.setLevel(0.5);
    await p.play('big');
    expect(f.log.sources).toHaveLength(0);
    expect(p.stats.refused).toBe(1);
    await p.play('a');
    await p.play('b');
    await p.play('c');
    expect(p.cached.length).toBeLessThanOrEqual(2);
    const n = decodes();
    await p.play('b'); // b en cache
    expect(decodes()).toBe(n);
    expect(reads.filter((k) => k === 'b')).toHaveLength(1);
  });

  it('préchargement : décode sans jouer, puis la lecture ne redécode pas', async () => {
    const { p, f, decodes } = setup();
    p.setLevel(0.5);
    p.preload('next');
    await new Promise((r) => setTimeout(r, 0));
    expect(decodes()).toBe(1);
    expect(f.log.sources).toHaveLength(0);
    await p.play('next');
    expect(decodes()).toBe(1);
    expect(f.log.sources).toHaveLength(1);
  });

  it('volume ramené à 0 : coupe et libère le cache', async () => {
    const { p, f } = setup();
    p.setLevel(0.5);
    await p.play('a');
    p.setLevel(0);
    expect((f.log.sources[0] as unknown as { stopAt: number }).stopAt).toBeGreaterThan(10);
    expect(p.cached).toHaveLength(0);
    expect(p.currentKey).toBeNull();
  });
});
