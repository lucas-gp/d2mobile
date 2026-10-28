/** Décodage d'octets sans Buffer (CLI Node et navigateur) */
export function latin1(d: Uint8Array): string {
  let s = '';
  for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, Math.min(d.length, i + 8192)));
  return s;
}

const UTF8 = new TextDecoder('utf-8');
export const utf8 = (d: Uint8Array): string => UTF8.decode(d);
