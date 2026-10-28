/** Chargement d'un calque : DCC (la plupart des unités) ou DC6 animé (Diablo, Méphisto, Baal…) */
import type { VfsCore as Vfs } from './vfs-core';
import { decodeDcc, type Dcc } from './formats/dcc';
import { decodeDc6 } from './formats/dc6';

/** `pathNoExt` sans extension ; renvoie null si ni .dcc ni .dc6 n'existent */
export function loadLayer(vfs: Vfs, pathNoExt: string): { dcc: Dcc; file: string } | null {
  const dcc = vfs.get(`${pathNoExt}.dcc`);
  if (dcc) return { dcc: decodeDcc(dcc), file: `${pathNoExt}.dcc` };
  const dc6 = vfs.get(`${pathNoExt}.dc6`);
  if (dc6) {
    const d = decodeDc6(dc6);
    const directions = Array.from({ length: d.directions }, (_, di) => ({
      frames: d.frames.slice(di * d.framesPerDir, (di + 1) * d.framesPerDir),
      diag: { flag: 0, ok: true, dev: [] as number[] },
    }));
    return { dcc: { directions, framesPerDir: d.framesPerDir }, file: `${pathNoExt}.dc6` };
  }
  return null;
}

/** Codes d'équipement disponibles pour un calque (fichiers `<code><calque>XXX<mode><classe>.dcc|dc6`) */
export function gearOptions(vfs: Vfs, root: string, code: string, layer: string, mode: string, wc: string): string[] {
  const re = new RegExp(`^${root.replace(/\\/g, '\\\\')}\\\\${layer}\\\\${code}${layer}(...)${mode}${wc}\\.(dcc|dc6)$`);
  return vfs
    .list(`${root}\\${layer}\\`)
    .map((f) => re.exec(f)?.[1])
    .filter((x): x is string => !!x);
}
