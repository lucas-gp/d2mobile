/** animdata.d2 : cadence et déclencheurs de chaque animation, indexés par nom de COF */
import { latin1 } from '../bytes';
export interface AnimRecord {
  cof: string;
  framesPerDir: number;
  /** vitesse en 1/256 de trame de jeu (256 = une trame par tick de 40 ms = 25 i/s) */
  speed: number;
  fps: number;
  /** trame → code de déclencheur (0 rien, 1 coup/déclenchement, 2 pas, 3 saut, 4 lancer de sort) */
  flags: number[];
}

export function parseAnimData(d: Uint8Array): Map<string, AnimRecord> {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const out = new Map<string, AnimRecord>();
  let p = 0;
  for (let bucket = 0; bucket < 256 && p + 4 <= d.length; bucket++) {
    const count = v.getUint32(p, true);
    p += 4;
    for (let i = 0; i < count; i++) {
      const cof = latin1(d.subarray(p, p + 8))
        .replace(/\0.*$/, '')
        .toUpperCase();
      const fpd = v.getUint32(p + 8, true);
      const speed = v.getUint32(p + 12, true);
      const flags = Array.from(d.subarray(p + 16, p + 16 + 144)).slice(0, fpd);
      out.set(cof, { cof, framesPerDir: fpd, speed, fps: (25 * speed) / 256, flags });
      p += 160;
    }
  }
  return out;
}
