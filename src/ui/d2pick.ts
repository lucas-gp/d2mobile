/** Sélecteur de fichiers MPQ (module feuille : évite le cycle d2local-ui <-> d2recap-ui). */
import { el } from './dom';

/** Sélecteur de fichiers : `<input type=file multiple>` (marche partout, y compris Chrome Android) ; null si l'utilisateur annule */
export function pickMpqFiles(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', multiple: true, accept: '.mpq,application/octet-stream' });
    input.style.display = 'none';
    document.body.append(input);
    let done = false;
    const finish = (v: File[] | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener('change', () => finish(input.files?.length ? [...input.files] : null));
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}
