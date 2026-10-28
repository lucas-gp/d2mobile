/** Chargeur de ressources chiffrées : le déchiffrement du jeu (WebCrypto) doit lire le format AES-256-GCM documenté dans d2crypto.ts */
import { describe, expect, it } from 'vitest';
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { checkKey, decryptBytes, deriveKey, type D2Index } from '../../src/render/d2crypto';
import { LEGACY_D2_VERIFY_TEXT } from '../../src/platform/legacy-names';

const ITER = 1000;
// plaintext of the verify file of an encrypted folder made before the rename: the compatibility constant
const VERIFY = LEGACY_D2_VERIFY_TEXT;

/** Chiffreur minimal de test (synthétique) : IV (12) + chiffré + étiquette GCM (16) */
function enc(key: Buffer, plain: Uint8Array): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, body, c.getAuthTag()]);
}

function make(password: string) {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const index: D2Index = { v: 1, iterations: ITER, salt: salt.toString('base64'), verify: 'verify.enc' };
  return { key, index, verify: enc(key, Buffer.from(VERIFY)) };
}

describe('ressources chiffrées', () => {
  it('verify plaintext unchanged by the rename (folders encrypted earlier still open)', () => {
    expect(createHash('sha256').update(VERIFY).digest('hex')).toBe('80022763b592118cce3dc9b3442b7a57bc3c2323b470cd3094cc4a96b9dfdd3c');
  });
  it('aller-retour avec le bon mot de passe', async () => {
    const { key, index, verify } = make('mot-de-passe-test');
    const k = await deriveKey('mot-de-passe-test', index.salt, index.iterations);
    expect(await checkKey(k, verify)).toBe(true);
    const png = await decryptBytes(k, enc(key, Uint8Array.from([1, 2, 3, 4, 5, 250, 251, 252])));
    expect([...png]).toEqual([1, 2, 3, 4, 5, 250, 251, 252]);
  });

  it('mauvais mot de passe : refusé', async () => {
    const { key, index, verify } = make('mot-de-passe-test');
    const bad = await deriveKey('autre-mot-de-passe', index.salt, index.iterations);
    expect(await checkKey(bad, verify)).toBe(false);
    await expect(decryptBytes(bad, enc(key, Buffer.from('x')))).rejects.toBeTruthy();
  });
});
