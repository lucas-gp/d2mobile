/**
 * Import de personnages Diablo II (.d2s) depuis l'écran de sélection : fichiers choisis à la main (mobile et ordinateur) ou dossier de
 * sauvegardes mémorisé (File System Access API). Le lecteur et les tables (≈ 100 Ko) ne sont chargés qu'à l'ouverture. Chaque fichier
 * devient un NOUVEAU personnage (aucun n'est écrasé) ; un rapport indique ce qui n'a pas pu être importé.
 * Tout reste local : aucun envoi réseau.
 */
import { CLASSES } from '../data/classes';
import { canPickDirectory, ensureReadable, forgetDirectory, fromFile, importedBefore, listD2s, pickDirectory, rememberImport, savedDirectory, type D2File } from '../platform/d2files';
import { SaveStore } from '../platform/platform';
import { el } from './dom';

type Convert = typeof import('../sim/d2s/convert');

const loadConvert = (): Promise<Convert> => import('../sim/d2s/convert');

/**
 * Ouvre la fenêtre d'import par-dessus `root` ; se résout à sa fermeture (`changed` : au moins un personnage ajouté).
 */
export function openD2Import(root: HTMLElement): Promise<{ changed: boolean }> {
  return new Promise((resolve) => {
    let changed = false;
    const overlay = el('div', { cls: 'd2imp scroll', role: 'dialog' });
    const panel = el('div', { cls: 'd2imp-panel' });
    overlay.append(panel);
    root.append(overlay);
    const close = () => {
      overlay.remove();
      resolve({ changed });
    };

    const results = el('div', { cls: 'd2imp-results' });
    const folderBox = el('div', { cls: 'd2imp-folder' });
    const status = el('div', { cls: 'd2imp-status' });

    /** Importe une liste de fichiers, un nouvel emplacement par personnage */
    const importFiles = async (files: D2File[]): Promise<void> => {
      if (!files.length) return;
      status.textContent = 'Lecture en cours…';
      let conv: Convert;
      try {
        conv = await loadConvert();
      } catch {
        status.textContent = 'Impossible de charger l’import (hors ligne ?).';
        return;
      }
      for (const f of files) {
        const card = el('div', { cls: 'd2imp-card' });
        results.prepend(card);
        try {
          const bytes = await f.read();
          const { save, report } = conv.importD2s(bytes, { savedAt: Date.now() });
          const slot = SaveStore.newSlot();
          if (!SaveStore.seed(save, slot, Date.now())) throw new Error('Stockage de l’appareil plein ou refusé');
          rememberImport(f, slot);
          changed = true;
          const cls = CLASSES[report.classId]?.name ?? '';
          card.append(el('b', { textContent: `${report.name} — ${cls} — niveau ${report.level}` }), ...conv.reportLines(report).map((l) => el('div', { cls: 'd2imp-line', textContent: l })));
          card.classList.add('ok');
        } catch (e) {
          card.classList.add('bad');
          card.append(el('b', { textContent: f.name }), el('div', { cls: 'd2imp-line', textContent: (e as Error).message || 'Fichier illisible' }));
        }
      }
      status.textContent = '';
      void renderFolder();
    };

    /* ----------------------------- fichiers à la main ----------------------------- */
    const input = el('input', { type: 'file', multiple: true, accept: '.d2s,application/octet-stream', cls: 'd2imp-input' });
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])].map(fromFile);
      input.value = '';
      void importFiles(files);
    });
    const pick = el('button', { cls: 'btn primary', textContent: 'Choisir des fichiers .d2s' });
    pick.addEventListener('click', () => input.click());

    /* --------------------------------- dossier --------------------------------- */
    async function renderFolder(askPermission = false): Promise<void> {
      folderBox.replaceChildren();
      if (!canPickDirectory()) return;
      const h = await savedDirectory();
      const choose = el('button', { cls: 'btn', textContent: h ? 'Changer de dossier' : 'Choisir un dossier de sauvegardes' });
      choose.addEventListener('click', async () => {
        const d = await pickDirectory();
        if (d) await renderFolder(false);
      });
      if (!h) {
        folderBox.append(el('div', { cls: 'd2imp-hint', textContent: 'Choisissez le dossier « Save » de Diablo II : le jeu liste les personnages, vous importez ceux que vous voulez.' }), choose);
        return;
      }
      folderBox.append(el('div', { cls: 'd2imp-hint', textContent: `Dossier : ${h.name}` }));
      const ok = await ensureReadable(h, askPermission);
      if (!ok) {
        const allow = el('button', { cls: 'btn primary', textContent: 'Autoriser la lecture du dossier' });
        allow.addEventListener('click', () => void renderFolder(true));
        folderBox.append(allow, choose);
        return;
      }
      let files: D2File[] = [];
      try {
        files = await listD2s(h);
      } catch {
        folderBox.append(el('div', { cls: 'd2imp-hint', textContent: 'Dossier illisible ou supprimé.' }));
      }
      if (!files.length) folderBox.append(el('div', { cls: 'd2imp-hint', textContent: 'Aucun fichier .d2s dans ce dossier.' }));
      const list = el('div', { cls: 'd2imp-files' });
      for (const f of files) {
        const again = importedBefore(f);
        const b = el('button', { cls: 'btn', textContent: again ? 'Réimporter' : 'Importer' });
        b.addEventListener('click', async () => {
          b.disabled = true;
          await importFiles([f]);
        });
        list.append(
          el('div', { cls: 'd2imp-file' }, el('span', { cls: 'n', textContent: f.name.replace(/\.d2s$/i, '') }), el('span', { cls: 'd', textContent: new Date(f.modified).toLocaleDateString() }), b),
        );
      }
      const row = el('div', { cls: 'row' }, choose);
      if (files.length > 1) {
        const all = el('button', { cls: 'btn', textContent: 'Tout importer' });
        all.addEventListener('click', async () => {
          all.disabled = true;
          await importFiles(files);
        });
        row.prepend(all);
      }
      const forget = el('button', { cls: 'btn', textContent: 'Oublier ce dossier' });
      forget.addEventListener('click', async () => {
        await forgetDirectory();
        await renderFolder(false);
      });
      row.append(forget);
      folderBox.append(list, row);
    }

    const done = el('button', { cls: 'btn primary big', textContent: 'Terminé' });
    done.addEventListener('click', close);
    panel.append(
      el('h3', { textContent: 'Importer un personnage Diablo II' }),
      el('div', {
        cls: 'd2imp-hint',
        textContent:
          'Fichiers .d2s des versions 1.10 à 1.14d (dossier « Save » de Diablo II). Chaque fichier devient un nouveau personnage : aucun personnage existant n’est modifié. Tout reste sur votre appareil.',
      }),
      el('div', { cls: 'row' }, pick, input),
      folderBox,
      status,
      results,
      el('div', { cls: 'row' }, done),
    );
    void renderFolder(false);
  });
}
