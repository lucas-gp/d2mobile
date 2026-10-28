/**
 * Interface du mode « graphismes Diablo II locaux » : bandeau discret de progression en jeu et section des Réglages
 * (choix des fichiers MPQ, copie, « tout générer », stockage, effacement). Toute la logique est dans platform/d2local.ts.
 * L'écran de choix de mode viendra plus tard : ce module n'expose que ce qu'il faut pour l'appeler (`pickMpqFiles`).
 */
import { d2Local, d2LocalEnabled, d2LocalMapsEnabled, fmtMo, setD2LocalEnabled, setD2LocalMapsEnabled, type LocalStatus } from '../platform/d2local';
import { el } from './dom';
import { buildFilesSection, buildRecapSection } from './d2recap-ui';
import { pickMpqFiles } from './d2pick';

export { pickMpqFiles };

interface OpenPickerWindow {
  showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
}

/** Bureau (Chrome, Edge) : sélecteur à poignées mémorisables sans copie ; undefined si l'API n'existe pas (téléphone, Firefox, Safari) */
export const canPickHandles = (): boolean => typeof (window as unknown as OpenPickerWindow).showOpenFilePicker === 'function';

export async function pickMpqHandles(): Promise<{ files: File[]; handles: FileSystemFileHandle[] } | null> {
  try {
    const handles = await (window as unknown as OpenPickerWindow).showOpenFilePicker!({
      multiple: true,
      types: [{ description: 'Archives Diablo II', accept: { 'application/octet-stream': ['.mpq'] } }],
    });
    return { files: await Promise.all(handles.map((h) => h.getFile())), handles };
  } catch {
    return null;
  }
}

/** Fichiers choisis → service ; `store` : copie persistante (défaut), poignées mémorisées (bureau) ou session seule */
async function chooseAndProvide(store: 'opfs' | 'handles' | 'session'): Promise<void> {
  if (store === 'handles') {
    const r = await pickMpqHandles();
    if (r) await d2Local.provideFiles(r.files, { store: 'handles', handles: r.handles });
    return;
  }
  const files = await pickMpqFiles();
  if (files) await d2Local.provideFiles(files, { store });
}

/* -------------------------------------------------------------------------- */
/* Bandeau en jeu                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Bandeau « Préparation des graphismes… 12/25 » : discret (coin bas gauche, ne capte pas les clics), visible seulement pendant une
 * génération ou une copie ; un message persistant (stockage plein, fichiers manquants) s'affiche aussi, avec un bouton si utile.
 */
export function mountD2LocalBanner(parent: HTMLElement): () => void {
  const box = el('div', { cls: 'd2l-banner' });
  box.hidden = true;
  parent.append(box);
  let hideAt = 0;
  const render = (s: LocalStatus) => {
    const lines: (HTMLElement | string)[] = [];
    let show = false;
    if (s.copy) {
      show = true;
      const pct = s.copy.total ? s.copy.all / s.copy.total : 0;
      lines.push(
        el('div', { textContent: `${s.copy.verifying ? 'Verifying Diablo II files…' : 'Copying Diablo II files…'} ${Math.round(s.copy.all / 1e6)} / ${Math.round(s.copy.total / 1e6)} MB` }),
        el('div', { cls: 'd2l-bar' }, el('div', { cls: 'fill', style: { transform: `scaleX(${pct})` } })),
      );
    }
    const busy = s.queued + s.active > 0;
    if (busy) {
      show = true;
      const total = Math.max(s.batch.total, s.batch.done + s.queued + s.active);
      lines.push(
        el('div', { textContent: `Preparing graphics… ${Math.min(s.batch.done, total)}/${total}` }),
        el('div', { cls: 'd2l-bar' }, el('div', { cls: 'fill', style: { transform: `scaleX(${total ? s.batch.done / total : 0})` } })),
      );
      hideAt = 0;
    }
    if (s.quotaFull) {
      show = true;
      lines.push(el('div', { cls: 'warn', textContent: 'Storage full: the remaining Diablo II graphics cannot be prepared.' }));
    }
    box.replaceChildren(...lines.map((l) => (typeof l === 'string' ? el('div', { textContent: l }) : l)));
    box.hidden = !show;
  };
  const off = d2Local.subscribe(render);
  render(d2Local.status);
  void hideAt;
  return () => {
    off();
    box.remove();
  };
}

/* -------------------------------------------------------------------------- */
/* Section des Réglages                                                       */
/* -------------------------------------------------------------------------- */

/** Section « Graphismes Diablo II sur cet appareil » des Réglages : se met à jour toute seule tant qu'elle est affichée */
export function buildD2LocalSection(onMessage: (text: string, color?: string) => void): HTMLElement {
  const root = el('div', { cls: 'col d2l-sec', style: { gap: '6px' } });
  let copyChoice: 'opfs' | 'handles' = 'opfs';
  let audioCopy = false;
  let recap: HTMLElement | undefined;
  let files: HTMLElement | undefined;
  const render = () => {
    if (!root.isConnected && root.dataset.mounted === '1') {
      off();
      return;
    }
    root.dataset.mounted = '1';
    const s = d2Local.status;
    const enabled = d2LocalEnabled();
    const nodes: HTMLElement[] = [];
    nodes.push(
      el('div', {
        cls: 'set-help',
        textContent: 'Génère les graphismes de Diablo II directement sur cet appareil, à partir de tes propres fichiers du jeu (d2data.mpq, d2char.mpq, d2exp.mpq). Rien n’est envoyé nulle part.',
      }),
    );
    // activation
    const tg = el('button', { cls: `btn${enabled ? ' sel' : ''}`, textContent: enabled ? 'Activé' : 'Désactivé' });
    tg.addEventListener('click', () => {
      setD2LocalEnabled(!enabled);
      onMessage('Rechargement nécessaire pour appliquer ce réglage.');
      render();
    });
    nodes.push(el('div', { cls: 'statrow' }, el('span', { textContent: 'Graphismes locaux' }), tg));
    const needReload = enabled !== d2Local.modeActive;
    if (needReload) {
      const rl = el('button', { cls: 'btn primary', textContent: 'Recharger maintenant' });
      rl.addEventListener('click', () => location.reload());
      nodes.push(rl);
    }
    if (enabled && !needReload) {
      // état
      const status = {
        off: '',
        init: 'Lecture de l’état précédent…',
        needfiles: 'Fichiers Diablo II à fournir.',
        needperm: 'Autorisation d’accès aux fichiers à renouveler.',
        copying: 'Copie des fichiers en cours…',
        opening: 'Ouverture des archives…',
        ready:
          s.source === 'opfs'
            ? 'Prêt : les fichiers sont copiés sur l’appareil.'
            : s.source === 'handles'
              ? 'Prêt : les fichiers sont mémorisés (sans copie).'
              : 'Prêt : fichiers lus pour cette session seulement.',
        error: 'Erreur.',
      }[s.phase];
      if (status) nodes.push(el('div', { cls: 'base', textContent: status }));
      if (s.message) nodes.push(el('div', { cls: s.quotaFull || s.phase === 'error' ? 'set-help warn' : 'set-help', textContent: s.message }));
      if (s.report) for (const m of s.report.messages) if (!s.message.includes(m)) nodes.push(el('div', { cls: s.report.ok ? 'set-help' : 'set-help warn', textContent: m }));
      // choix des fichiers
      if (s.phase === 'needfiles' || s.phase === 'ready' || s.phase === 'needperm') {
        if (s.phase === 'needperm') {
          const gb = el('button', { cls: 'btn primary', textContent: 'Autoriser l’accès aux fichiers' });
          gb.addEventListener('click', () => void d2Local.grantHandles());
          nodes.push(gb);
        }
        if (canPickHandles()) {
          const cp = el('div', { cls: 'tabs' });
          for (const [v, l] of [
            ['opfs', 'Copier sur l’appareil (≈ 770 Mo)'],
            ['handles', 'Garder le lien, sans copie'],
          ] as const) {
            const b = el('button', { cls: `btn${copyChoice === v ? ' sel' : ''}`, textContent: l });
            b.addEventListener('click', () => {
              copyChoice = v;
              render();
            });
            cp.append(b);
          }
          nodes.push(cp);
        }
        const pick = el('button', { cls: `btn${s.phase === 'needfiles' ? ' primary' : ''}`, textContent: d2Local.hasFiles ? 'Choisir d’autres fichiers MPQ…' : 'Choisir les fichiers MPQ…' });
        pick.addEventListener('click', () => void chooseAndProvide(canPickHandles() ? copyChoice : 'opfs'));
        nodes.push(pick);
        nodes.push(el('div', { cls: 'set-help', textContent: 'Sélectionne ensemble d2data.mpq, d2char.mpq et d2exp.mpq (et si tu en as : Patch_D2.mpq et le patch Project Diablo 2).' }));
      }
      // copie
      if (s.copy) {
        const pct = s.copy.total ? s.copy.all / s.copy.total : 0;
        nodes.push(
          el('div', {
            cls: 'base',
            textContent: s.copy.verifying
              ? `Vérification : ${s.copy.name} — ${Math.round(s.copy.all / 1e6)} / ${Math.round(s.copy.total / 1e6)} Mo`
              : `Copie : ${s.copy.name} — ${Math.round(s.copy.all / 1e6)} / ${Math.round(s.copy.total / 1e6)} Mo`,
          }),
          el('div', { cls: 'd2l-bar' }, el('div', { cls: 'fill', style: { transform: `scaleX(${pct})` } })),
        );
      }
      // sons et musique (archives facultatives) : décodés à la demande, jamais en bloc
      const au = s.audio;
      const auSrc = au.source === 'opfs' ? 'copiées sur l’appareil' : au.source === 'handles' ? 'mémorisées' : 'pour cette session seulement';
      const auState = au.names.length
        ? `${au.names.length} archive(s) sonore(s) (${fmtMo(au.bytes)}) · ${auSrc}`
        : au.cached
          ? 'archives non disponibles, sons déjà décodés conservés'
          : 'non fournis (sons de remplacement)';
      nodes.push(el('div', { cls: 'statrow' }, el('span', { textContent: 'Sons et musique' }), el('span', { cls: 'base', textContent: auState })));
      nodes.push(el('div', { cls: 'set-help', textContent: 'Facultatif : d2sfx.mpq, d2speech.mpq, d2xtalk.mpq, d2music.mpq. Chaque son est préparé à la première écoute, jamais en bloc.' }));
      if (au.partial.length) nodes.push(el('div', { cls: 'set-help warn', textContent: `Copie des sons interrompue (${au.partial.join(', ')}) : choisis-les de nouveau pour la reprendre.` }));
      const acp = el('button', { cls: `btn${audioCopy ? ' sel' : ''}`, textContent: audioCopy ? 'Copier sur l’appareil (≈ 1 Go)' : 'Lire sans copie' });
      acp.addEventListener('click', () => {
        audioCopy = !audioCopy;
        render();
      });
      nodes.push(el('div', { cls: 'statrow' }, el('span', { textContent: 'Archives sonores' }), acp));
      const apick = el('button', { cls: 'btn', textContent: au.names.length ? 'Choisir d’autres fichiers sonores…' : 'Ajouter les fichiers sonores…' });
      apick.addEventListener('click', () => {
        void pickMpqFiles().then(async (files) => {
          if (!files) return;
          const r = await d2Local.provideAudioFiles(files, { copy: audioCopy });
          onMessage(r.used.length ? `Sons ajoutés : ${r.used.join(', ')}.${r.note ? ` ${r.note}` : ''}` : 'Aucune archive sonore dans cette sélection (d2sfx, d2speech, d2xtalk, d2music).');
        });
      });
      nodes.push(apick);
      if (au.cached) {
        const aclr = el('button', { cls: 'btn danger', textContent: 'Effacer les sons décodés' });
        aclr.addEventListener('click', () => void d2Local.clearAudio().then(() => onMessage('Sons décodés effacés : ils seront préparés de nouveau à la demande.')));
        nodes.push(aclr);
      }
      // cartes DS1 (décors des zones de Diablo II) : générées à la demande, puis en arrière-plan quand rien d'autre n'est demandé
      const mapsOn = d2LocalMapsEnabled();
      const mapsBtn = el('button', { cls: `btn${mapsOn ? ' sel' : ''}`, textContent: mapsOn ? 'Activées' : 'Désactivées' });
      mapsBtn.addEventListener('click', () => {
        setD2LocalMapsEnabled(!mapsOn);
        onMessage('Rechargement nécessaire pour appliquer ce réglage.');
        render();
      });
      nodes.push(el('div', { cls: 'statrow' }, el('span', { textContent: 'Cartes de Diablo II' }), mapsBtn));
      nodes.push(
        el('div', {
          cls: 'set-help',
          textContent:
            'Les zones de Diablo II (cartes) sont fabriquées sur l’appareil à partir de tes fichiers : la ville tout de suite, les autres en arrière-plan, les images à ta première visite de chaque zone. Désactivées : le jeu garde ses zones d’origine.',
        }),
      );
      // qualité, préparation à l'avance, récapitulatif par catégorie, « tout générer »
      recap ??= buildRecapSection(onMessage);
      files ??= buildFilesSection(onMessage);
      nodes.push(recap);
      // archives MPQ connues, ce qu'elles apportent, ajout d'un fichier
      nodes.push(el('div', { cls: 'base', textContent: 'Fichiers Diablo II' }), files);
      // stockage
      const st = el('div', { cls: 'base', textContent: '' });
      nodes.push(st);
      void d2Local.storage().then((u) => {
        const parts = [`Graphismes générés : ${fmtMo(u.generated)}`];
        if (u.usage !== null && u.quota !== null) parts.push(`stockage de l’appareil : ${fmtMo(u.usage)} utilisés sur ${fmtMo(u.quota)}`);
        const mc = d2Local.mapCounts();
        if (mc.total) parts.push(`cartes : ${mc.data} préparées sur ${mc.total} (dont ${mc.images} avec leurs images)`);
        if (u.persisted !== null) parts.push(u.persisted ? 'stockage protégé' : 'stockage non protégé (le navigateur peut le purger)');
        st.textContent = parts.join(' · ');
      });
      // effacement
      const clr = el('button', { cls: 'btn danger', textContent: 'Effacer les graphismes générés' });
      clr.addEventListener('click', () => {
        void d2Local.clearGenerated().then(() => onMessage('Graphismes générés effacés : ils seront recréés à la demande.'));
      });
      nodes.push(clr);
      if (s.source === 'opfs') {
        const it = s.integrity;
        const label = {
          'n/a': '',
          unknown: 'Intégrité de la copie : non vérifiée.',
          verified: 'Intégrité de la copie : vérifiée (relue et comparée à l’empreinte enregistrée).',
          unverified: 'Intégrité de la copie : inconnue (copie sans empreinte, faite par une version précédente) : lance la vérification, ou recopie les fichiers.',
          damaged: `Intégrité de la copie : fichier(s) abîmé(s) (${it.files
            .filter((f) => f.status !== 'ok')
            .map((f) => f.name)
            .join(', ')}). Recopie-les.`,
          checking: 'Vérification de la copie en cours…',
        }[it.state];
        if (label) nodes.push(el('div', { cls: it.state === 'damaged' || it.state === 'unverified' ? 'set-help warn' : 'set-help', textContent: label }));
        const vf = el('button', { cls: 'btn', textContent: 'Vérifier les fichiers copiés (Verify copied files)' });
        vf.disabled = it.state === 'checking' || !!s.copy;
        vf.addEventListener('click', () => void d2Local.verifyFiles().then((r) => onMessage(r.message, r.ok ? undefined : '#e8a24a')));
        nodes.push(vf);
        if (it.state === 'damaged' || it.state === 'unverified') {
          const rp = el('button', { cls: 'btn primary', textContent: 'Réparer : recopier les fichiers abîmés' });
          rp.addEventListener('click', () => void d2Local.repairFiles().then((r) => onMessage(r.message)));
          nodes.push(rp);
        }
      }
      if (s.source === 'opfs' || s.source === 'handles') {
        const fg = el('button', { cls: 'btn danger', textContent: 'Oublier les fichiers Diablo II copiés' });
        fg.addEventListener('click', () => void d2Local.forgetFiles().then(() => onMessage('Fichiers oubliés.')));
        nodes.push(fg);
      }
    }
    root.replaceChildren(...nodes);
  };
  const off = d2Local.subscribe(() => render());
  render();
  if (d2LocalEnabled()) void d2Local.init().then(render);
  return root;
}
