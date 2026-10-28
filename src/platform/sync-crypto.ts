/**
 * Chiffrement de la synchronisation (Web Crypto), zéro connaissance : le mot de passe et la clé de chiffrement ne quittent jamais l'appareil.
 *   PBKDF2-SHA256(mot de passe, sel = sel public du compte ‖ nom, ≥ 600 000 itérations) → 64 octets :
 *     octets 0-31  : clé AES-256-GCM des sauvegardes (jamais envoyée)
 *     octets 32-63 : `authHash` envoyé au serveur (qui le re-hache avec son propre sel)
 *   Limite connue (documentée dans SECURITY.md) : les deux moitiés viennent d'une même sortie PBKDF2 de 512 bits ; l'attaquant qui ne détient que les
 *   blobs ne calcule que le premier bloc (coût divisé par deux). Séparer les clés par HKDF casserait la connexion des comptes existants (le
 *   vérificateur serveur est l'`authHash` actuel) : à faire avec une version de dérivation portée par le compte.
 *   Blob : [version = 1][IV 12 octets aléatoires][AES-GCM(données) + étiquette 16 octets] ; données = [0 brut | 1 gzip] ‖ texte ;
 *   l'identifiant d'emplacement est lié au blob (données authentifiées additionnelles) : le serveur ne peut pas échanger deux sauvegardes.
 */
export const PBKDF2_ITERATIONS = 600_000;
/** Bornes acceptées pour les paramètres renvoyés par le serveur : mêmes que celles qu'il impose à l'inscription (api/_lib/core.ts) */
export const MIN_ITERATIONS = 600_000;
export const MAX_ITERATIONS = 5_000_000;
const SALT_BYTES = 16;
const BLOB_VERSION = 1;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Derived {
  /** Clé AES-GCM non extractable (utilisable, mais jamais lisible) */
  key: CryptoKey;
  /** Empreinte d'authentification (base64) pour le serveur */
  authHash: string;
}

export function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Nom de compte normalisé : minuscules, 3 à 32 caractères [a-z0-9_.-] (null : invalide) */
export function normalizeAccountName(raw: string): string | null {
  const n = raw.normalize('NFKC').trim().toLowerCase();
  return /^[a-z0-9_.-]{3,32}$/.test(n) ? n : null;
}

/**
 * Vérifie les paramètres de dérivation renvoyés par le serveur avant de s'en servir : un serveur compromis ne doit pas pouvoir imposer
 * un nombre d'itérations faible (mot de passe cassable à partir de l'`authHash` envoyé) ni un sel de taille anormale.
 * Retourne les paramètres validés ou lève une erreur.
 */
export function checkKdfParams(salt: unknown, iterations: unknown): { salt: Uint8Array; iterations: number } {
  const n = Number(iterations);
  if (!Number.isInteger(n) || n < MIN_ITERATIONS || n > MAX_ITERATIONS) throw new Error('paramètres de dérivation refusés (itérations hors plage)');
  let bytes: Uint8Array;
  try {
    bytes = fromB64(String(salt));
  } catch {
    throw new Error('paramètres de dérivation refusés (sel illisible)');
  }
  if (bytes.length !== SALT_BYTES) throw new Error('paramètres de dérivation refusés (sel de taille inattendue)');
  return { salt: bytes, iterations: n };
}

export async function deriveKeys(name: string, password: string, publicSalt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<Derived> {
  const salt = new Uint8Array([...publicSalt, ...enc.encode(name)]);
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const authHash = toB64(bits.slice(32, 64));
  bits.fill(0);
  return { key, authHash };
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(data as BufferSource).then(() => w.close());
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function encryptBlob(key: CryptoKey, slot: string, text: string): Promise<Uint8Array> {
  let flag = 0;
  let body: Uint8Array = enc.encode(text);
  if (typeof CompressionStream !== 'undefined') {
    try {
      body = await pipe(body, new CompressionStream('gzip'));
      flag = 1;
    } catch {
      body = enc.encode(text);
    }
  }
  const plain = new Uint8Array(body.length + 1);
  plain[0] = flag;
  plain.set(body, 1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(slot) }, key, plain));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = BLOB_VERSION;
  out.set(iv, 1);
  out.set(ct, 13);
  return out;
}

/** Lève une erreur si la clé est mauvaise, si le blob est altéré ou s'il appartient à un autre emplacement */
export async function decryptBlob(key: CryptoKey, slot: string, blob: Uint8Array): Promise<string> {
  if (blob.length < 13 + 17 || blob[0] !== BLOB_VERSION) throw new Error('blob invalide');
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(1, 13), additionalData: enc.encode(slot) }, key, blob.slice(13)));
  const body = plain.subarray(1);
  if (plain[0] === 0) return dec.decode(body);
  if (plain[0] === 1) return dec.decode(await pipe(body, new DecompressionStream('gzip')));
  throw new Error('format inconnu');
}

/** Force d'un mot de passe : 0 (trop court) à 4 (solide) ; longueur et variété, sans prétendre à plus */
export function passwordStrength(pw: string): number {
  if (pw.length < 10) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let s = 1 + (pw.length >= 14 ? 1 : 0) + (pw.length >= 20 ? 1 : 0) + (classes >= 3 ? 1 : 0);
  if (/^(.)\1+$/.test(pw) || new Set(pw).size < 5) s = 1;
  return Math.min(4, s);
}
