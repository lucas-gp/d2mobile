import { describe, expect, it } from 'vitest';
import { checkKdfParams, decryptBlob, deriveKeys, encryptBlob, normalizeAccountName, passwordStrength, randomSalt, fromB64, toB64 } from '../../src/platform/sync-crypto';

const salt = new Uint8Array(16).fill(3);
const TEXT = JSON.stringify({ character: { name: 'Éloïse ✨', level: 42 }, items: Array.from({ length: 500 }, (_, i) => ({ i, n: 'Épée longue' })) });

describe('sync-crypto', () => {
  it('la dérivation est déterministe, dépend du mot de passe, du nom et du sel ; la clé de chiffrement n’est pas l’authHash', async () => {
    const a = await deriveKeys('alice', 'motdepasse-solide', salt);
    const b = await deriveKeys('alice', 'motdepasse-solide', salt);
    expect(a.authHash).toBe(b.authHash);
    expect(fromB64(a.authHash).length).toBe(32);
    expect((await deriveKeys('alice', 'motdepasse-solidE', salt)).authHash).not.toBe(a.authHash);
    expect((await deriveKeys('alicf', 'motdepasse-solide', salt)).authHash).not.toBe(a.authHash);
    expect((await deriveKeys('alice', 'motdepasse-solide', new Uint8Array(16).fill(4))).authHash).not.toBe(a.authHash);
    expect(a.key.extractable).toBe(false);
    // la clé n'est pas exportable
    await expect(crypto.subtle.exportKey('raw', a.key)).rejects.toThrow();
    // même clé : un blob chiffré avec l'une se déchiffre avec l'autre
    expect(await decryptBlob(b.key, 's1', await encryptBlob(a.key, 's1', TEXT))).toBe(TEXT);
  }, 20000);

  it('aller-retour (compressé, Unicode) et format versionné', async () => {
    const { key } = await deriveKeys('alice', 'motdepasse-solide', salt);
    const blob = await encryptBlob(key, 'slot', TEXT);
    expect(blob[0]).toBe(1);
    expect(blob.length).toBeLessThan(TEXT.length / 2); // compression
    expect(await decryptBlob(key, 'slot', blob)).toBe(TEXT);
    expect(await decryptBlob(key, 'slot', await encryptBlob(key, 'slot', ''))).toBe('');
  }, 20000);

  it('mauvaise clé, blob altéré, mauvais emplacement ou version inconnue : refusés', async () => {
    const a = await deriveKeys('alice', 'motdepasse-solide', salt);
    const other = await deriveKeys('alice', 'un-autre-mot-de-passe', salt);
    const blob = await encryptBlob(a.key, 's1', TEXT);
    await expect(decryptBlob(other.key, 's1', blob)).rejects.toThrow();
    await expect(decryptBlob(a.key, 's2', blob)).rejects.toThrow(); // blob déplacé par le serveur
    const t = blob.slice();
    t[t.length - 5] ^= 1;
    await expect(decryptBlob(a.key, 's1', t)).rejects.toThrow();
    const v = blob.slice();
    v[0] = 9;
    await expect(decryptBlob(a.key, 's1', v)).rejects.toThrow();
    await expect(decryptBlob(a.key, 's1', blob.slice(0, 10))).rejects.toThrow();
  }, 20000);

  it('IV aléatoire : deux blobs du même contenu diffèrent', async () => {
    const { key } = await deriveKeys('alice', 'motdepasse-solide', salt);
    const x = await encryptBlob(key, 's', TEXT);
    const y = await encryptBlob(key, 's', TEXT);
    expect(Buffer.from(x).equals(Buffer.from(y))).toBe(false);
    expect(Buffer.from(x.slice(1, 13)).equals(Buffer.from(y.slice(1, 13)))).toBe(false);
    expect(randomSalt().length).toBe(16);
  }, 20000);

  it('nom de compte et force du mot de passe', () => {
    expect(normalizeAccountName('  Alice_01 ')).toBe('alice_01');
    expect(normalizeAccountName('ab')).toBeNull();
    expect(normalizeAccountName('a b c')).toBeNull();
    expect(normalizeAccountName('é'.repeat(5))).toBeNull();
    expect(passwordStrength('court')).toBe(0);
    expect(passwordStrength('aaaaaaaaaaaa')).toBe(1);
    expect(passwordStrength('MotDePasse2024!ok')).toBeGreaterThanOrEqual(3);
  });
});

describe('paramètres de dérivation renvoyés par le serveur', () => {
  const okSalt = toB64(new Uint8Array(16).fill(7));
  it('acceptés dans la plage du serveur', () => {
    expect(checkKdfParams(okSalt, 600000).iterations).toBe(600000);
    expect(checkKdfParams(okSalt, '700000').iterations).toBe(700000);
    expect(checkKdfParams(okSalt, 5000000).salt.length).toBe(16);
  });
  it('refusés : itérations faibles, absentes, non entières ou énormes ; sel de mauvaise taille ou illisible', () => {
    for (const it of [1, 0, 599999, undefined, null, 'x', 1.5, 5000001, NaN]) expect(() => checkKdfParams(okSalt, it)).toThrow();
    expect(() => checkKdfParams(toB64(new Uint8Array(4)), 600000)).toThrow();
    expect(() => checkKdfParams('!!pas du base64!!', 600000)).toThrow();
    expect(() => checkKdfParams(undefined, 600000)).toThrow();
  });
});
