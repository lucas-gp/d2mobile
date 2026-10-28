/** Interface de synchronisation : formulaire de compte, état, fenêtre de conflit. Textes en français (la couche i18n les traduit). */
import { passwordStrength } from '../platform/sync-crypto';
import { Sync, SyncError, type ConflictChoice, type ConflictInfo, type VersionSummary } from '../platform/sync';
import { el, holdButton } from './dom';

const NO_RECOVERY = 'Il n’y a pas de récupération de mot de passe : si vous l’oubliez, les sauvegardes en ligne sont perdues (vos sauvegardes locales restent).';
const STRENGTH = ['Trop court (10 caractères minimum)', 'Faible', 'Moyen', 'Bon', 'Solide'];

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dateTime = (ms: number) => (ms ? new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function field(label: string, input: HTMLInputElement): HTMLElement {
  return el('label', { cls: 'sync-field' }, el('span', { textContent: label }), input);
}
function textInput(type: 'text' | 'password', autocomplete: AutoFill, max = 128): HTMLInputElement {
  const i = el('input', { type, maxLength: max, autocomplete, spellcheck: false, cls: 'sync-input' });
  i.setAttribute('autocapitalize', 'none');
  i.setAttribute('autocorrect', 'off');
  return i;
}

/** Section « Synchronisation » (Réglages ; fenêtre de l'écran de sélection) */
export function syncSection(): HTMLElement {
  const box = el('div', { cls: 'sync-box' });
  let mode: 'login' | 'register' = 'login';
  let busy = false;
  let notice = '';
  let panel: '' | 'password' | 'delete' = '';
  let nameVal = '';

  const render = () => {
    if (!box.isConnected && box.dataset.rendered) {
      Sync.listeners.delete(render);
      return;
    }
    box.dataset.rendered = '1';
    const st = Sync.state;
    const parts: (HTMLElement | null)[] = [el('div', { cls: 'lvl', textContent: 'Synchronisation' })];
    if (!Sync.connected) parts.push(...loggedOut());
    else parts.push(...loggedIn(st));
    box.replaceChildren(...(parts.filter(Boolean) as HTMLElement[]));
  };

  const run = async (label: string, f: () => Promise<void>, after?: () => void) => {
    if (busy) return;
    busy = true;
    notice = label;
    render();
    try {
      await f();
      notice = '';
      after?.();
    } catch (e) {
      notice = e instanceof SyncError ? e.message : 'Échec : vérifiez la connexion et réessayez.';
    } finally {
      busy = false;
      render();
    }
  };

  const loggedOut = (): (HTMLElement | null)[] => {
    const name = textInput('text', 'username', 32);
    name.value = nameVal;
    name.addEventListener('input', () => (nameVal = name.value));
    const pw = textInput('password', mode === 'register' ? 'new-password' : 'current-password');
    const pw2 = textInput('password', 'new-password');
    const remember = el('input', { type: 'checkbox', checked: true });
    const meter = el('div', { cls: 'sync-meter' }, el('i'));
    const meterText = el('small', { cls: 'base' });
    pw.addEventListener('input', () => {
      const s = passwordStrength(pw.value);
      (meter.firstChild as HTMLElement).style.width = `${(s / 4) * 100}%`;
      (meter.firstChild as HTMLElement).dataset.s = String(s);
      meterText.textContent = pw.value ? STRENGTH[s] : '';
    });
    const tabs = el('div', { cls: 'tabs' });
    for (const [m, l] of [
      ['login', 'Se connecter'],
      ['register', 'Créer un compte'],
    ] as const) {
      const b = el('button', { cls: `btn${mode === m ? ' sel' : ''}`, textContent: l, disabled: busy, data: { act: `tab-${m}` } });
      b.addEventListener('click', () => {
        mode = m;
        notice = '';
        render();
      });
      tabs.append(b);
    }
    const go = el('button', { cls: 'btn primary', textContent: mode === 'register' ? 'Créer le compte et synchroniser' : 'Se connecter et synchroniser', disabled: busy, data: { act: 'go' } });
    const submit = () => {
      if (mode === 'register' && pw.value !== pw2.value) {
        notice = 'Les deux mots de passe ne sont pas identiques.';
        return render();
      }
      if (mode === 'register' && passwordStrength(pw.value) < 1) {
        notice = 'Mot de passe trop court (10 caractères minimum).';
        return render();
      }
      void run('Calcul de la clé de chiffrement…', () => (mode === 'register' ? Sync.register(name.value, pw.value, remember.checked) : Sync.login(name.value, pw.value, remember.checked)));
    };
    go.addEventListener('click', submit);
    for (const i of [name, pw, pw2]) i.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    return [
      el('div', {
        cls: 'base',
        textContent:
          'Retrouvez vos personnages sur tous vos appareils (téléphone, PC…). Compte sans e-mail ; vos sauvegardes sont chiffrées sur votre appareil avant l’envoi : le serveur ne peut pas les lire.',
      }),
      tabs,
      field('Nom de compte', name),
      field('Mot de passe', pw),
      ...(mode === 'register' ? [el('div', { cls: 'sync-strength' }, meter, meterText), field('Confirmer le mot de passe', pw2)] : []),
      el('label', { cls: 'sync-check' }, remember, el('span', { textContent: 'Rester connecté sur cet appareil' })),
      el('div', { cls: 'base sync-warn', textContent: NO_RECOVERY }),
      go,
      notice ? el('div', { cls: 'sync-notice', textContent: notice }) : null,
    ];
  };

  const loggedIn = (st: typeof Sync.state): HTMLElement[] => {
    const out: HTMLElement[] = [
      el('div', { cls: 'statrow' }, el('span', { textContent: 'Connecté en tant que' }), el('b', { textContent: st.account ?? '' })),
      el('div', { cls: 'statrow' }, el('span', { textContent: 'Dernière synchro' }), el('b', { textContent: st.lastSync ? `à ${hhmm(st.lastSync)}` : 'jamais' })),
      el('div', { cls: 'statrow' }, el('span', { textContent: 'Personnages en ligne' }), el('b', { textContent: String(st.count) })),
    ];
    const status: Record<string, string> = { idle: 'À jour', syncing: 'Synchronisation en cours…', offline: 'Hors ligne', error: 'Erreur', conflict: 'Conflit à résoudre', out: '' };
    out.push(el('div', { cls: `sync-status s-${st.status}`, textContent: busy ? notice : (status[st.status] ?? '') }));
    const msg = !busy && (notice || st.message);
    if (msg) out.push(el('div', { cls: 'sync-notice', textContent: notice || st.message }));
    const now = el('button', { cls: 'btn primary', textContent: 'Synchroniser maintenant', disabled: busy || st.status === 'syncing', data: { act: 'now' } });
    now.addEventListener('click', () => void run('Synchronisation en cours…', () => Sync.syncAll()));
    const cp = el('button', { cls: 'btn', textContent: 'Changer le mot de passe', disabled: busy });
    cp.addEventListener('click', () => ((panel = panel === 'password' ? '' : 'password'), render()));
    const lo = el('button', { cls: 'btn', textContent: 'Se déconnecter', disabled: busy });
    lo.addEventListener(
      'click',
      () =>
        void run(
          '',
          () => Sync.logout(),
          () => (notice = 'Déconnecté. Vos sauvegardes locales restent sur cet appareil.'),
        ),
    );
    const dl = el('button', { cls: 'btn danger', textContent: 'Supprimer mes données en ligne', disabled: busy });
    dl.addEventListener('click', () => ((panel = panel === 'delete' ? '' : 'delete'), render()));
    out.push(el('div', { cls: 'row' }, now, cp, lo, dl));
    if (panel === 'password') {
      const o = textInput('password', 'current-password');
      const n = textInput('password', 'new-password');
      const n2 = textInput('password', 'new-password');
      const ok = el('button', { cls: 'btn primary', textContent: 'Valider le nouveau mot de passe', disabled: busy });
      ok.addEventListener('click', () => {
        if (n.value !== n2.value) {
          notice = 'Les deux mots de passe ne sont pas identiques.';
          return render();
        }
        void run(
          'Rechiffrement des sauvegardes…',
          () => Sync.changePassword(o.value, n.value),
          () => {
            panel = '';
            notice = 'Mot de passe changé. Sur vos autres appareils, reconnectez-vous avec le nouveau.';
          },
        );
      });
      out.push(
        el(
          'div',
          { cls: 'sync-sub' },
          field('Ancien mot de passe', o),
          field('Nouveau mot de passe', n),
          field('Confirmer le nouveau mot de passe', n2),
          el('div', { cls: 'base sync-warn', textContent: NO_RECOVERY }),
          ok,
        ),
      );
    }
    if (panel === 'delete') {
      const del = holdButton(
        'Maintenir pour tout supprimer',
        () =>
          void run(
            'Suppression…',
            () => Sync.deleteOnline(),
            () => (notice = 'Données en ligne supprimées. Vos sauvegardes locales restent sur cet appareil.'),
          ),
        1500,
        'btn danger',
      );
      out.push(
        el(
          'div',
          { cls: 'sync-sub' },
          el('div', {
            cls: 'base sync-warn',
            textContent:
              'Supprime définitivement le compte et tous les personnages en ligne. Vos sauvegardes locales ne sont pas touchées, mais les autres appareils ne pourront plus récupérer ces personnages.',
          }),
          del,
        ),
      );
    }
    return out;
  };

  Sync.listeners.add(render);
  render();
  return box;
}

/** Suit la hauteur réellement visible (clavier virtuel) et amène le champ actif dans la vue ; se détache quand la fenêtre est retirée */
function watchViewport(overlay: HTMLElement): void {
  const vv = window.visualViewport;
  const fit = () => {
    if (!overlay.isConnected) return vv?.removeEventListener('resize', fit);
    if (vv) overlay.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && overlay.contains(a)) a.scrollIntoView({ block: 'center' });
  };
  vv?.addEventListener('resize', fit);
  overlay.addEventListener('focusin', (e) => {
    fit();
    const t = e.target as HTMLElement;
    setTimeout(() => t.isConnected && t.scrollIntoView({ block: 'center' }), 300);
  });
  fit();
}

/** Fenêtre « Synchronisation » (écran de sélection des personnages) ; se ferme avec Fermer ; renvoie quand elle est fermée */
export function openSyncDialog(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const overlay = el('div', { cls: 'd2imp sync-overlay scroll', role: 'dialog' });
    watchViewport(overlay);
    const close = el('button', { cls: 'btn', textContent: 'Fermer', data: { act: 'close' } });
    const panel = el('div', { cls: 'd2imp-panel' }, syncSection(), el('div', { cls: 'row' }, close));
    overlay.append(panel);
    root.append(overlay);
    const done = () => {
      overlay.remove();
      resolve();
    };
    close.addEventListener('click', done);
  });
}

const summaryCard = (title: string, v: VersionSummary, shared: boolean): HTMLElement =>
  el(
    'div',
    { cls: 'sync-card' },
    el('b', { textContent: title }),
    el('div', { textContent: v.name }),
    ...(shared ? [] : [el('div', { textContent: `Niveau ${v.level} — ${v.xp.toLocaleString('fr-FR')} XP` })]),
    el('div', { cls: 'base', textContent: `Dernière sauvegarde : ${dateTime(v.savedAt)}` }),
  );

/** Branche la fenêtre de conflit sur le moteur */
export function installConflictDialog(root: HTMLElement): void {
  Sync.conflictHandler = (c: ConflictInfo) =>
    new Promise<ConflictChoice>((resolve) => {
      const overlay = el('div', { cls: 'd2imp sync-overlay scroll', role: 'dialog' });
      watchViewport(overlay);
      const done = (c2: ConflictChoice) => {
        overlay.remove();
        resolve(c2);
      };
      const btn = (label: string, choice: ConflictChoice, cls = 'btn') => {
        const b = el('button', { cls, textContent: label, data: { act: `c-${choice}` } });
        b.addEventListener('click', () => done(choice));
        return b;
      };
      overlay.append(
        el(
          'div',
          { cls: 'd2imp-panel' },
          el('h3', { textContent: c.shared ? 'Le coffre partagé a été modifié sur deux appareils' : 'Ce personnage a été modifié sur deux appareils' }),
          el('div', { cls: 'base', textContent: 'Choisissez la version à garder. L’autre est conservée en copie de sécurité sur cet appareil quand elle est remplacée.' }),
          el('div', { cls: 'sync-cards' }, summaryCard('Cet appareil', c.local, c.shared), summaryCard('L’autre appareil', c.remote, c.shared)),
          el(
            'div',
            { cls: 'sync-choices' },
            btn('Garder cet appareil', 'local', 'btn primary'),
            btn('Garder l’autre', 'remote'),
            btn(c.shared ? 'Fusionner les deux coffres (sans doublon)' : 'Garder les deux (l’autre devient un nouveau personnage)', 'both'),
            btn('Décider plus tard', 'skip'),
          ),
        ),
      );
      root.append(overlay);
    });
}

/** Libellé court du bouton de l'écran de sélection */
export function syncButtonLabel(): string {
  return Sync.connected ? 'Synchroniser' : 'Se connecter';
}
