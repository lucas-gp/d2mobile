import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sha1Hex } from '../../tools/d2import/sha1';
import { WebSink } from '../../tools/d2import/web-sink';

describe('sha1Hex (empreintes des manifestes, identiques à node:crypto)', () => {
  it('même résultat que node:crypto sur des longueurs aux frontières de bloc', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100000]) {
      const b = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
      expect(sha1Hex(b)).toBe(createHash('sha1').update(b).digest('hex'));
    }
  });
  it('texte : UTF-8', () => {
    const s = 'planche é ✓ {"id":"paladin"}';
    expect(sha1Hex(s)).toBe(createHash('sha1').update(s).digest('hex'));
  });
});

describe('WebSink', () => {
  it('remet les octets au rappel et compte par dossier', async () => {
    const got: Record<string, number> = {};
    const s = new WebSink((p, b) => void (got[p] = b.length));
    await s.write('ui/ui.json', '{"files":{}}');
    const n = await s.png('hi/x-0.png', 2, 2, new Uint8Array(16));
    expect(got['ui/ui.json']).toBe(12);
    expect(got['hi/x-0.png']).toBe(n);
    expect(s.stats.get('ui')).toEqual({ files: 1, bytes: 12 });
    expect(s.stats.get('hi')!.files).toBe(1);
  });
});
