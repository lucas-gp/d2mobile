/**
 * Chargeur optionnel de ressources chiffrées (AES-256-GCM, clé dérivée du mot de passe par PBKDF2-SHA256).
 * Format d'un fichier : IV (12 octets) + texte chiffré + étiquette GCM (16 octets). Le dossier chiffré ne contient
 * que du chiffré : sans le mot de passe, l'URL seule ne donne accès à rien.
 */
import { LEGACY_D2_VERIFY_TEXT } from '../platform/legacy-names';
export interface D2Index {
  v: 1;
  iterations: number;
  /** sel PBKDF2, base64 */
  salt: string;
  /** fichier chiffré contenant VERIFY_TEXT : détecte un mauvais mot de passe */
  verify: string;
  /** empreinte du dossier chiffré : ajoutée en `?v=` aux adresses, pour un cache navigateur immuable (une nouvelle empreinte = de nouvelles adresses) */
  ver?: string;
}

/**
 * Plaintext of the `verify` file. Compatibility constant: an encrypted folder made before the rename has a `verify` file holding the
 * former name (legacy-names.ts); a new value would reject every correct password until the folder is re-encrypted. Never shown.
 */
const VERIFY_TEXT = LEGACY_D2_VERIFY_TEXT;

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(password: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto indisponible (page non sécurisée ?)');
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt: b64ToBytes(saltB64) as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

export async function decryptBytes(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 12 + 16) throw new Error('fichier chiffré trop court');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) as BufferSource }, key, data.subarray(12) as BufferSource);
  return new Uint8Array(plain);
}

/** Vérifie que la clé ouvre bien le fichier témoin */
export async function checkKey(key: CryptoKey, verifyFile: Uint8Array): Promise<boolean> {
  try {
    return new TextDecoder().decode(await decryptBytes(key, verifyFile)) === VERIFY_TEXT;
  } catch {
    return false;
  }
}
