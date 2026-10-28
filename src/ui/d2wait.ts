/**
 * Mode local : attente des images de l'interface Diablo II avant l'écran de sélection (jamais l'écran d'origine). L'écran avance toujours
 * ou s'explique : état en direct, « Retry » qui relance vraiment (échecs oubliés, Workers remplacés, service rouvert), refabrication d'un lot
 * déclaré prêt mais absent du cache, et — sans progrès pendant ~20 s — message clair, « Copy error details » et « Verify / repair files ».
 */
import { d2Local, localRead } from '../platform/d2local';
import { el } from './dom';
import { d2ScreensReady } from './d2charselect';
import { d2UiCount, d2UiLoadInfo, loadD2Ui } from './d2ui';
import { buildPrepDiagnostic, copyText } from './d2diag';
import { missingOf, requiredForAll } from '../platform/d2requires';
import { describeEn } from '../platform/d2check-core';
import { pickAndAddMpq } from './d2recap-ui';
import { STUCK_MS, headline, judge, progressKey, statusLines, type WaitSnap } from './d2wait-core';

let exhaustedFlag = false;

function snap(): WaitSnap {
  const d = d2Local.waitDiag();
  const li = d2UiLoadInfo();
  return {
    ...d,
    uiReady: d2Local.isExtraReady('ui'),
    uiImages: d2UiCount(),
    screensReady: d2ScreensReady(),
    uiIndexed: li.indexed,
    missingKeys: li.missingRequired,
    notInCache: li.notInCache,
    exhausted: exhaustedFlag,
    copyDone: d2Local.status.copy?.all ?? 0,
  };
}

export function waitD2Screens(root: HTMLElement): Promise<void> {
  exhaustedFlag = false;
  return new Promise((resolve) => {
    const msg = el('p', { textContent: headline(snap(), false) });
    const status = el('pre', { cls: 'err-tech', textContent: '' });
    const stuckMsg = el('div', { cls: 'err-msg', textContent: '' });
    const note = el('div', { cls: 'err-msg', textContent: '' });
    stuckMsg.hidden = true;
    note.hidden = true;
    const retry = el('button', { cls: 'btn primary', type: 'button', textContent: 'Retry' });
    const pick = el('button', { cls: 'btn', type: 'button', textContent: 'Choose my Diablo II files…' });
    const copy = el('button', { cls: 'btn', type: 'button', textContent: 'Copy error details' });
    const repair = el('button', { cls: 'btn', type: 'button', textContent: 'Verify / repair files' });
    copy.hidden = true;
    repair.hidden = true;
    const adds = el('div', { cls: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
    const need = el('div', { cls: 'err-msg', textContent: '' });
    need.hidden = true;
    const box = el('div', { cls: 'charselect' }, el('h2', { textContent: 'D2 Mobile' }), msg, status, need, adds, stuckMsg, note, el('div', { cls: 'row' }, retry, pick, repair, copy));
    root.append(box);

    let busy = false;
    let retrying = false;
    let lastKey = '';
    let lastMove = performance.now();
    let stuck = false;
    const tries = { reload: 0, redo: 0, rerequest: 0 };
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      window.clearInterval(t);
      box.remove();
      resolve();
    };
    /** Relit les images de l'interface depuis le cache local */
    let reading = false;
    const readUi = async () => {
      if (reading) return;
      reading = true;
      try {
        await loadD2Ui((p) => localRead(p));
      } finally {
        reading = false;
      }
      if (d2ScreensReady()) finish();
    };
    /** Relance complète : échecs oubliés, Workers remplacés, service rouvert si besoin, nouvelle demande */
    const restart = async (redo: string[] = []) => {
      d2Local.clearFailed(['ui']);
      await d2Local.recover(['ui'], redo);
      await readUi();
    };
    const run = async (label: string, fn: () => Promise<void>) => {
      if (busy) return;
      busy = true;
      retrying = true;
      lastMove = performance.now();
      msg.textContent = label;
      note.hidden = true;
      try {
        await fn();
      } catch (e) {
        note.hidden = false;
        note.textContent = `Retry failed: ${(e as Error).message}`;
      } finally {
        busy = false;
        retrying = false;
        lastMove = performance.now();
        stuck = false;
        render();
      }
    };

    const render = () => {
      const s = snap();
      const k = progressKey(s);
      if (k !== lastKey) {
        lastKey = k;
        lastMove = performance.now();
        if (stuck && !s.failed.length) stuck = false;
      }
      if (!busy && performance.now() - lastMove > STUCK_MS) stuck = true;
      // archive obligatoire incomplète : rien n'est fabriqué, on l'explique tout de suite (jamais « Preparing… » sans fin)
      const blocked = d2Local.blocked();
      msg.textContent = blocked.length && !retrying ? blocked.flatMap(describeEn).join(' ') : headline(s, retrying);
      status.textContent = statusLines(s).join('\n');
      exhaustedFlag = tries.reload >= 2 && tries.redo >= 1 && !busy;
      const problem = blocked.length > 0 || stuck || exhaustedFlag || s.failed.length > 0 || s.phase === 'error' || (s.phase === 'needfiles' && !s.files);
      copy.hidden = !problem;
      repair.hidden = !problem;
      // archive manquante : nommée, avec un bouton direct (une seule archive à ajouter, les autres sont gardées)
      const known = d2Local.fileInfo().map((f) => f.name);
      const miss = [...new Set([...(d2Local.status.report?.missing ?? []), ...(d2Local.hasFiles ? missingOf(requiredForAll(['ui']), known) : [])])];
      const badNames = blocked.map((c) => c.name);
      const key = `${miss.join(',')}|${badNames.join(',')}`;
      if (adds.dataset.k !== key) {
        adds.dataset.k = key;
        adds.replaceChildren(
          ...[...miss, ...badNames].map((m) => {
            const isBad = badNames.includes(m);
            const b = el('button', { cls: 'btn primary', type: 'button', textContent: isBad ? (badNames.length > 1 ? `Choose ${m} again` : 'Choose the file again') : `Add ${m}` });
            b.addEventListener(
              'click',
              () =>
                void run('Adding…', async () => {
                  await pickAndAddMpq(m, (t, c) => {
                    note.hidden = false;
                    note.textContent = t;
                    void c;
                  });
                  await restart();
                }),
            );
            return b;
          }),
        );
      }
      need.hidden = !miss.length;
      need.textContent = miss.length ? `Required: ${miss.join(', ')} — add it with the button below.` : '';
      stuckMsg.hidden = !stuck || blocked.length > 0;
      if (stuck) stuckMsg.textContent = 'Nothing has moved for a while. Press Retry, choose your files again, or copy the error details to report the problem.';
    };

    const diag = () =>
      buildPrepDiagnostic(
        'character screen: interface not ready',
        ['extra:ui'],
        [
          `wait: ${statusLines(snap()).join(' | ')}`,
          `ui load: ${JSON.stringify(d2UiLoadInfo())}`,
          `generator warnings (ui): ${d2Local.warningsOf('ui').join(' ; ') || 'none'}`,
          `timeline: ${d2Local.timeline
            .slice(-6)
            .map((x) => x[1])
            .join(' ; ')}`,
        ],
      );

    retry.addEventListener('click', () => void run('Retrying…', () => restart(d2Local.isExtraReady('ui') && !d2ScreensReady() ? ['ui'] : [])));
    pick.addEventListener(
      'click',
      () =>
        void run('Choose your Diablo II files…', async () => {
          const { showD2Choice } = await import('./d2-choice');
          msg.textContent = 'Choose your Diablo II files…';
          await showD2Choice({ encrypted: false, start: 'import' });
          msg.textContent = 'Retrying…';
          await restart(d2Local.isExtraReady('ui') && !d2ScreensReady() ? ['ui'] : []);
        }),
    );
    copy.addEventListener('click', () => void diag().then((text) => copyText(text, box, () => (copy.textContent = 'Copied'))));
    repair.addEventListener('click', () => {
      void run('Verifying files…', async () => {
        const unsub = d2Local.subscribe((s2) => {
          if (s2.copy?.verifying && s2.copy.total) msg.textContent = `Verifying files… ${Math.round((100 * s2.copy.all) / s2.copy.total)}%`;
        });
        try {
          const r = await d2Local.repairFiles();
          note.hidden = false;
          note.textContent = r.message;
          if (r.action === 'reselect') {
            const { showD2Choice } = await import('./d2-choice');
            await showD2Choice({ encrypted: false, start: 'import' });
          }
        } finally {
          unsub();
        }
        await restart();
      });
    });

    const t = window.setInterval(() => {
      if (done) return;
      if (d2ScreensReady()) {
        finish();
        return;
      }
      render();
      if (busy) return;
      const v = judge(snap(), tries);
      if (reading) return;
      if (v.kind === 'reload-ui') {
        tries.reload++;
        void readUi();
      } else if (v.kind === 'redo-ui') {
        tries.redo++;
        void run('Rebuilding the interface…', () => restart(['ui']));
      } else if (v.kind === 'rerequest') {
        tries.rerequest++;
        d2Local.requestExtras();
      }
    }, 400);
    // premier passage : demande l'interface (les fichiers sont peut-être déjà là)
    d2Local.clearFailed(['ui']);
    d2Local.requestExtras();
    render();
  });
}
