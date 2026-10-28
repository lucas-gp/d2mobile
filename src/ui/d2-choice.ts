/**
 * Écran de choix des graphismes Diablo II (premier lancement, version publique ou version à dossier chiffré avec mot de passe).
 *
 * Deux voies, côte à côte sur grand écran et empilées sur téléphone :
 *  1. « J'ai le mot de passe » : dossier chiffré (chargeur optionnel `D2_REMOTE`) — seulement si la version l'utilise ;
 *  2. « J'ai Diablo II : importer mes fichiers » : le navigateur génère les graphismes sur l'appareil depuis les MPQ du joueur.
 * En développement seulement (`allowSkip`), un lien discret vers les graphismes de remplacement du jeu (sans mémoriser de refus : l'écran
 * reviendra au prochain lancement) ; ailleurs, on ne joue pas sans les graphismes Diablo II.
 * Toute la logique de copie et de génération reste dans platform/d2local.ts ; l'écran ne fait que la piloter et l'expliquer.
 */
import { d2Local, fmtMo, type LocalStatus } from '../platform/d2local';
import { AUDIO_MPQ, REQUIRED_MPQ, archiveReport, audioMpq, audioReport, relevantMpq } from '../platform/d2local-core';
import { describeEn, statusEn } from '../platform/d2check-core';
import { canPickHandles, pickMpqFiles, pickMpqHandles } from './d2local-ui';
import { el } from './dom';

export type ChoiceResult = { kind: 'password'; value: string } | { kind: 'local' } | { kind: 'skip' } | { kind: 'back' };

export interface ChoiceOptions {
  /** la version embarque le dossier chiffré : la carte « mot de passe » est proposée */
  encrypted: boolean;
  /** le mot de passe précédent était faux */
  retry?: boolean;
  /** `import` : ouvrir directement la carte d'import (réglage actif mais fichiers à fournir de nouveau) */
  start?: 'choose' | 'import';
  /** version à dossier chiffré : proposer de revenir au mot de passe */
  canGoBack?: boolean;
  /** développement : proposer de jouer avec les graphismes de remplacement */
  allowSkip?: boolean;
}

/** Dossier d'installation entier (sélecteur de dossier) : disponible sur navigateur de bureau seulement */
const canPickFolder = (): boolean => {
  try {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return !coarse && 'webkitdirectory' in HTMLInputElement.prototype;
  } catch {
    return false;
  }
};

function pickFolder(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', multiple: true });
    (input as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
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

const needGo = (n: number): string => fmtMo(n);

export function showD2Choice(o: ChoiceOptions): Promise<ChoiceResult> {
  return new Promise((resolve) => {
    const wrap = el('div', { cls: 'd2c', role: 'dialog' });
    wrap.setAttribute('aria-label', 'D2 Mobile');
    const scroll = el('div', { cls: 'd2c-scroll' });
    wrap.append(scroll);
    document.body.append(wrap);
    let off: (() => void) | null = null;
    const done = (r: ChoiceResult) => {
      off?.();
      wrap.remove();
      resolve(r);
    };

    // état de l'import
    let busy = false;
    let error: string[] = [];
    let notes: string[] = [];
    let wantCopy = true;
    /** copier aussi les archives sonores dans OPFS (≈ 1 Go de plus) : facultatif, désactivé par défaut */
    let wantAudioCopy = false;
    /** archives obligatoires jugées incomplètes : l'import s'arrête là tant qu'elles ne sont pas remplacées */
    let badNames: string[] = [];
    const view: 'choose' | 'import' = o.start === 'import' && !o.encrypted ? 'import' : 'choose';

    const skipLink = (): HTMLElement => {
      const b = el('button', { cls: 'd2c-skip', type: 'button', textContent: 'Play with the replacement graphics (limited)' });
      b.addEventListener('click', () => done({ kind: 'skip' }));
      return b;
    };

    /** carte « mot de passe » */
    const passwordCard = (): HTMLElement => {
      const form = el('form', { cls: 'd2c-card' });
      const input = el('input', { type: 'password', autocomplete: 'off', placeholder: 'Password', name: 'd2pw' });
      input.setAttribute('aria-label', 'Password');
      const ok = el('button', { type: 'submit', cls: 'btn primary d2c-btn', textContent: 'Unlock' });
      form.append(
        el('h3', { textContent: 'I have the password' }),
        el('p', { textContent: 'Enter the password of this build’s encrypted graphics: they are loaded directly, nothing to import.' }),
        ...(o.retry ? [el('p', { cls: 'err', textContent: 'Wrong password.' })] : []),
        input,
        ok,
        el('small', { textContent: 'The password is remembered on this device.' }),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value) done({ kind: 'password', value: input.value });
      });
      return form;
    };

    /** progression pendant la validation / copie */
    const progress = (s: LocalStatus): HTMLElement[] => {
      const out: HTMLElement[] = [];
      if (s.copy) {
        const pct = s.copy.total ? s.copy.all / s.copy.total : 0;
        out.push(
          el('p', { cls: 'd2c-status', textContent: `${s.copy.verifying ? 'Verifying files…' : 'Copying files:'} ${Math.round(s.copy.all / 1e6)} / ${Math.round(s.copy.total / 1e6)} MB` }),
          el('div', { cls: 'd2l-bar' }, el('div', { cls: 'fill', style: { transform: `scaleX(${pct})` } })),
        );
      } else if (s.checking && s.checking.total) {
        const c = s.checking;
        out.push(
          el('p', { cls: 'd2c-status', textContent: `Checking files… ${c.name} ${Math.round(c.done / 1e6)} / ${Math.round(c.total / 1e6)} MB` }),
          el('div', { cls: 'd2l-bar' }, el('div', { cls: 'fill', style: { transform: `scaleX(${c.done / c.total})` } })),
        );
      } else if (busy) {
        // pas encore de mesure : barre indéterminée, pour montrer que le contrôle travaille
        out.push(el('p', { cls: 'd2c-status', textContent: 'Checking files…' }), el('div', { cls: 'd2l-bar indet' }, el('div', { cls: 'fill' })));
      }
      return out;
    };

    /** fichiers déjà choisis lors des essais précédents : on peut les fournir un par un, chacun s'ajoute aux autres */
    const pool: { file: File; handle?: FileSystemFileHandle }[] = [];
    const runImport = async (pick: () => Promise<{ files: File[]; handles?: FileSystemFileHandle[] } | null>) => {
      if (busy) return;
      error = [];
      notes = [];
      badNames = [];
      let picked: { files: File[]; handles?: FileSystemFileHandle[] } | null;
      try {
        picked = await pick();
      } catch {
        picked = null;
      }
      if (!picked) return;
      // fusion avec les fichiers déjà reçus (même nom : le plus récent remplace)
      for (const [i, f] of picked.files.entries()) {
        const k = pool.findIndex((x) => x.file.name.toLowerCase() === f.name.toLowerCase());
        if (k >= 0) pool.splice(k, 1);
        pool.push({ file: f, handle: picked.handles?.[i] });
      }
      // lisibilité de TOUS les fichiers retenus, y compris ceux d'une sélection précédente : sur Android, un fichier choisi plus tôt peut
      // devenir illisible (autorisation perdue, fichier modifié) ; on le signale tout de suite au lieu d'échouer plus tard dans le Worker
      const bad: string[] = [];
      for (let i = pool.length - 1; i >= 0; i--) {
        const f = pool[i].file;
        try {
          if (f.size > 0) {
            await f.slice(0, 4096).arrayBuffer();
            await f.slice(Math.max(0, f.size - 4096)).arrayBuffer();
          }
        } catch (e) {
          bad.push(`${f.name} (${(e as Error).name || 'error'})`);
          pool.splice(i, 1);
        }
      }
      if (bad.length) {
        error = [`Unreadable file${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}. Please choose ${bad.length > 1 ? 'them' : 'it'} again.`];
      }
      picked = { files: pool.map((x) => x.file), handles: pool.every((x) => x.handle) ? pool.map((x) => x.handle as FileSystemFileHandle) : undefined };
      const rel = relevantMpq(picked.files);
      const pre = archiveReport(rel.used.map((f) => ({ name: f.name, size: f.size })));
      if (!pre.ok) {
        // détecte tout de suite l'oubli d'un fichier (ou la sélection de mauvais fichiers) sans rien copier
        error = [...error, ...pre.messages.filter((m) => /Missing|Unreadable/.test(m))];
        error.push(
          picked.files.length
            ? `Files received: ${picked.files
                .map((f) => f.name)
                .slice(0, 12)
                .join(', ')}.`
            : 'No file received.',
        );
        render();
        return;
      }
      // sons et musique (facultatifs) : ce qui a été fourni, ce qu'il apporte
      const aud = audioMpq(picked.files);
      const files = [...rel.used, ...aud];
      const ar = audioReport(aud.map((f) => ({ name: f.name, size: f.size })));
      busy = true;
      render();
      try {
        const handles = picked.handles && picked.handles.length === picked.files.length ? files.map((f) => picked!.handles![picked!.files.indexOf(f)]) : undefined;
        const report = await d2Local.provideFiles(files, handles ? { store: 'handles', handles } : { store: wantCopy ? 'opfs' : 'session', copyAudio: wantAudioCopy });
        if (!report.ok) {
          error = report.messages;
          busy = false;
          render();
          return;
        }
        notes = [...report.messages];
        // contrôle d'intégrité des archives (rapide d'abord, le passage complet se fait pendant la copie) : AVANT toute fabrication
        await d2Local.awaitChecks();
        const blockedNow = (): boolean => {
          const b = d2Local.blocked();
          badNames = b.map((c) => c.name);
          if (b.length) error = b.flatMap(describeEn);
          return b.length > 0;
        };
        const stopped = blockedNow();
        const names = [...rel.used, ...aud].map((f) => f.name);
        const checks = names.map((n) => d2Local.status.checks[n.toLowerCase()]).filter(Boolean);
        for (const c of d2Local.skipped()) notes.push(`${describeEn(c).join(' ')} The game continues without it.`);
        for (const c of checks) if (c.status === 'suspect' || c.status === 'unrecognized') notes.push(describeEn(c).join(' '));
        if (checks.length && !badNames.length) notes.push(`Archive check: ${checks.map((c) => `${c.name} ${statusEn(c)}`).join(', ')}.`);
        if (ar.present.length) {
          notes.push(`Sound and music recognised: ${ar.gives.join(', ')}.`);
          if (ar.lacks.length) notes.push(`Not provided: ${ar.lacks.join(', ')} (the game keeps its replacement sounds for them).`);
          if (!handles && !wantAudioCopy) notes.push('Sounds are read from your files at each launch (select them again); those already used are kept on the device.');
          else if (!handles && wantCopy) notes.push(`Sounds are copied to the device (${needGo(ar.bytes)} more).`);
        } else notes.push('No sound archive received: the game keeps its replacement sounds. You can add them later in Settings.');
        // copie persistante en cours : on l'attend (barre de progression), le joueur peut ne pas patienter
        busy = false;
        const finish = () => done({ kind: 'local' });
        if (!d2Local.status.copy) {
          if (stopped) {
            render();
            return;
          }
          return finish();
        }
        copying = true;
        render();
        const unsub = d2Local.subscribe((s) => {
          // un contrôle complet (pendant la copie) peut révéler un problème que le contrôle rapide n'avait pas vu
          const was = badNames.join();
          const now = blockedNow();
          if (now && badNames.join() !== was) render();
          if (!s.copy) {
            unsub();
            if (now || d2Local.blocked().length) {
              copying = false;
              render();
            } else finish();
          }
        });
      } catch (e) {
        error = [`Import failed: ${(e as Error).message}`];
        busy = false;
        render();
      }
    };
    let copying = false;

    const importCard = (): HTMLElement => {
      const s = d2Local.status;
      const card = el('div', { cls: 'd2c-card' });
      card.append(el('h3', { textContent: 'I own Diablo II: import my files' }));
      card.append(el('p', { textContent: 'The game builds its graphics on your device from your own Diablo II files. Select these three files together:' }));
      card.append(el('ul', { cls: 'd2c-files' }, ...REQUIRED_MPQ.map((n) => el('li', {}, el('code', { textContent: n })))));
      card.append(el('p', { cls: 'd2c-help', textContent: 'Optional: Patch_D2.mpq (monsters placed on maps) and the Project Diablo 2 patch (mod graphics).' }));
      card.append(
        el('p', { cls: 'd2c-help', textContent: 'Optional but recommended, for sound (without them the game keeps its replacement sounds):' }),
        el('ul', { cls: 'd2c-files' }, ...AUDIO_MPQ.map((a) => el('li', {}, el('code', { textContent: a.name }), ` : ${a.gives} (≈ ${needGo(a.approx)})`))),
      );
      card.append(
        el('p', {
          cls: 'd2c-help',
          textContent:
            'Where to find them: in the Diablo II (Lord of Destruction) installation folder, for example C:\\Program Files (x86)\\Diablo II. On a phone, copy them to the device storage first.',
        }),
      );
      card.append(el('p', { cls: 'd2c-help', textContent: 'Nothing is uploaded: everything stays on your device.' }));
      card.append(
        el('p', {
          cls: 'd2c-notice',
          textContent:
            'You must own a copy of Diablo II: Lord of Destruction and a valid CD key to use this feature, even though the game does not ask for one. Files stay on your device; nothing is uploaded.',
        }),
      );
      card.append(
        el('p', {
          cls: 'd2c-help',
          textContent: 'Allow about 1.5 GB of free space. First preparation: 1 to 3 minutes for the copy, then a few seconds to a minute for each new area, depending on the device.',
        }),
      );

      if (s.phase === 'needperm') {
        const g = el('button', { cls: 'btn primary d2c-btn', type: 'button', textContent: 'Allow access to the files' });
        g.addEventListener('click', () => {
          void d2Local.grantHandles().then(() => {
            if (d2Local.hasFiles) done({ kind: 'local' });
            else render();
          });
        });
        card.append(g);
      }

      for (const m of error) card.append(el('p', { cls: 'err', textContent: m }));
      if (!error.length && s.message && !busy && !copying) card.append(el('p', { cls: 'd2c-help warn', textContent: s.message }));
      for (const m of notes) card.append(el('p', { cls: 'd2c-help', textContent: m }));

      if (busy || copying) {
        card.append(...progress(s));
        if (copying && !badNames.length) {
          const go = el('button', { cls: 'btn d2c-btn', type: 'button', textContent: 'Play now (the copy continues)' });
          go.addEventListener('click', () => done({ kind: 'local' }));
          card.append(go);
        }
      } else {
        for (const n of badNames) {
          const again = el('button', { cls: 'btn primary d2c-btn d2c-again', type: 'button', textContent: badNames.length > 1 ? `Choose ${n} again` : 'Choose the file again' });
          again.addEventListener('click', () => void runImport(async () => ((f) => (f ? { files: f } : null))(await pickMpqFiles())));
          card.append(again);
        }
        const pick = el('button', {
          cls: `btn${badNames.length ? '' : ' primary'} d2c-btn`,
          type: 'button',
          textContent: badNames.length ? 'Choose other files…' : pool.length ? 'Add the missing files…' : error.length ? 'Choose other files…' : 'Choose my files…',
        });
        const handles = canPickHandles() && !wantCopy;
        pick.addEventListener('click', () => void runImport(async () => (handles ? await pickMpqHandles() : ((f) => (f ? { files: f } : null))(await pickMpqFiles()))));
        card.append(pick);
        if (canPickFolder() && !handles) {
          const dir = el('button', { cls: 'btn d2c-btn', type: 'button', textContent: 'Choose the installation folder…' });
          dir.addEventListener('click', () => void runImport(async () => ((f) => (f ? { files: f } : null))(await pickFolder())));
          card.append(dir);
        }
        if (canPickHandles()) {
          const lab = el('label', { cls: 'd2c-check' });
          const cb = el('input', { type: 'checkbox', checked: wantCopy });
          cb.addEventListener('change', () => {
            wantCopy = cb.checked;
            render();
          });
          lab.append(cb, el('span', { textContent: `Copy the files to the device (recommended, ≈ ${needGo(770e6)})` }));
          card.append(lab);
        }
        if (wantCopy || !canPickHandles()) {
          const lab = el('label', { cls: 'd2c-check' });
          const cb = el('input', { type: 'checkbox', checked: wantAudioCopy });
          cb.addEventListener('change', () => {
            wantAudioCopy = cb.checked;
            render();
          });
          lab.append(cb, el('span', { textContent: `Also copy the sounds and music if I provide them (≈ ${needGo(AUDIO_MPQ.reduce((a, m) => a + m.approx, 0))} more)` }));
          card.append(lab);
        }
      }
      return card;
    };

    const render = () => {
      const kids: HTMLElement[] = [];
      kids.push(el('h2', { textContent: 'D2 Mobile' }));
      if (view === 'import' && !o.encrypted) {
        kids.push(el('p', { cls: 'd2c-lead', textContent: 'Your Diablo II files must be provided again to restore the graphics.' }));
      } else {
        kids.push(el('p', { cls: 'd2c-lead', textContent: 'D2 Mobile uses the graphics of Diablo II. They are not shipped with the game: choose how to get them.' }));
      }
      const cards = el('div', { cls: `d2c-cards${o.encrypted ? ' two' : ''}` });
      if (o.encrypted) cards.append(passwordCard());
      cards.append(importCard());
      kids.push(cards);
      if (o.canGoBack && !o.encrypted) {
        const back = el('button', { cls: 'd2c-skip', type: 'button', textContent: 'I actually have the password' });
        back.addEventListener('click', () => done({ kind: 'back' }));
        kids.push(back);
      }
      if (o.allowSkip) kids.push(skipLink());
      scroll.replaceChildren(...kids);
    };

    off = d2Local.subscribe(() => {
      if (busy || copying || view === 'import') render();
    });
    render();
  });
}
