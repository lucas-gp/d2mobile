/**
 * Onglet « Guilde » du coffre : coffre d'échange partagé (code d'invitation). Composant autonome : il se redessine seul
 * (la ligne de saisie n'est pas perdue à l'actualisation), interroge le service toutes les 20 s tant qu'il est affiché.
 * Textes en français (la couche i18n les traduit).
 */
import type { Item } from '../sim/item';
import { Guild, GuildError, depositBlock, type GuildEntry, type GuildState } from '../platform/guild';
import { itemName } from '../sim/itemstats';
import { icon, itemIconOf, labelClass } from './hud';
import { itemTooltip } from './itemtext';
import { el } from './dom';
import { verbatim } from '../i18n';
import type { CharacterState } from '../sim/character-state';

const GUILD_REFRESH_MS = 20000;

export interface GuildTabDeps {
  character(): CharacterState;
  /** objet sélectionné dans le sac/coffre/charmes/cartes et sa suppression locale (appelée après la réponse OK du serveur) */
  candidate(): { item: Item; remove: () => boolean } | null;
  hasRoom(it: Item): boolean;
  place(it: Item): boolean;
  /** après un changement local (objet déposé/pris) : redessiner le panneau */
  changed(): void;
  notify(msg: string, color?: string): void;
}

const when = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const LOG_TEXT: Record<string, string> = { deposit: 'a déposé', withdraw: 'a pris', join: 'a rejoint le coffre', leave: 'a quitté le coffre' };

/** Dernier état connu (affiché immédiatement au retour sur l'onglet, puis actualisé) */
let state: GuildState | null = null;
let error = '';
/** instance affichée : toute opération terminée la redessine (le panneau reconstruit l'onglet à chaque clic) */
let activeDraw: (() => void) | null = null;
let lastFetch = 0;
/** opération en cours (commune à toutes les instances : le panneau est redessiné à chaque clic) */
let busy = false;

export function guildTab(d: GuildTabDeps): HTMLElement {
  const box = el('div', { cls: 'col guildtab', style: { gap: '6px' } });
  let confirmLeave = false;
  let codeShown = false;
  const form = { name: '', nick: Guild.session()?.nick ?? '', jnick: Guild.session()?.nick ?? '', code: '' };
  let selId: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let armHook: () => void = () => {};

  const note = (m: string, bad = true) => d.notify(m, bad ? '#d66' : '#8fd18f');
  const errText = (e: unknown) => (e instanceof GuildError ? e.message : 'Coffre de guilde indisponible');

  async function refresh(quiet = false, minAgeMs = 0): Promise<void> {
    if (!Guild.session() || busy || Date.now() - lastFetch < minAgeMs) return;
    lastFetch = Date.now();
    busy = true;
    if (!quiet) draw();
    try {
      const moved = await Guild.recover({ hasRoom: d.hasRoom, place: d.place });
      if (moved) {
        note('Objet récupéré du coffre de guilde.', false);
        d.changed();
      }
      state = await Guild.state();
      error = '';
    } catch (e) {
      error = errText(e);
      if (e instanceof GuildError && e.kind === 'unauthorized') {
        state = null;
      }
    } finally {
      busy = false;
      draw();
      activeDraw?.();
    }
  }

  async function act(f: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    error = '';
    draw();
    try {
      await f();
    } catch (e) {
      error = errText(e);
      note(error);
    } finally {
      busy = false;
      draw();
      activeDraw?.();
    }
  }

  const input = (label: string, key: 'name' | 'nick' | 'jnick' | 'code', max: number, ph = ''): HTMLElement => {
    const i = el('input', { type: 'text', maxLength: max, cls: 'sync-input', placeholder: ph, autocomplete: 'off', spellcheck: false, value: form[key] });
    i.setAttribute('autocapitalize', key === 'code' ? 'characters' : 'none');
    i.setAttribute('autocorrect', 'off');
    i.dataset.testid = `guild-${key}`;
    i.addEventListener('input', () => (form[key] = i.value));
    return el('label', { cls: 'sync-field' }, el('span', { textContent: label }), i);
  };
  const btn = (text: string, testid: string, run: () => void, cls = '', disabled = false) => {
    const b = el('button', { cls: `btn ${cls}`.trim(), textContent: text, data: { testid }, style: { minHeight: '44px' } });
    b.disabled = disabled || busy;
    b.addEventListener('click', run);
    return b;
  };

  function loggedOut(): HTMLElement[] {
    const out: HTMLElement[] = [];
    out.push(
      el('div', {
        cls: 'base',
        textContent: 'Coffre partagé entre amis : un code d’invitation, chacun dépose et prend des objets. À réserver à des joueurs de confiance : aucune vérification n’est faite.',
      }),
    );
    out.push(el('div', { cls: 'lvl', textContent: 'Créer un coffre' }));
    out.push(input('Nom du coffre', 'name', 30, 'Les Amis de Tristram'), input('Ton pseudo', 'nick', 20));
    out.push(
      btn('Créer le coffre', 'guild-create', () => {
        if (!form.name.trim() || !form.nick.trim()) {
          error = 'Renseigne le nom du coffre et ton pseudo.';
          return draw();
        }
        void act(async () => {
          await Guild.create(form.name, form.nick);
          state = null;
          note('Coffre créé : le code d’invitation est affiché ci-dessous.', false);
          codeShown = true;
          await refreshAfter();
        });
      }),
    );
    out.push(el('div', { cls: 'lvl', textContent: 'Rejoindre un coffre' }));
    // le pseudo du bloc « Rejoindre » est le sien : avant, le bouton lisait le pseudo du bloc « Créer » (vide pour un invité) et ne faisait rien
    out.push(input('Code d’invitation', 'code', 24, 'XXXX-XXXX-XXXX-XXXX'), input('Ton pseudo', 'jnick', 20));
    out.push(
      btn('Rejoindre', 'guild-join', () => {
        if (!form.code.trim() || !form.jnick.trim()) {
          error = 'Renseigne le code et ton pseudo (dans le bloc « Rejoindre un coffre »).';
          return draw();
        }
        void act(async () => {
          await Guild.join(form.code, form.jnick);
          state = null;
          await refreshAfter();
        });
      }),
    );
    return out;
  }

  async function refreshAfter(): Promise<void> {
    state = await Guild.state();
    lastFetch = Date.now();
  }

  function loggedIn(): HTMLElement[] {
    const s = Guild.session()!;
    const out: HTMLElement[] = [];
    const head = el('div', { cls: 'tabs', style: { flexWrap: 'wrap', alignItems: 'center', gap: '6px' } });
    head.append(el('b', { textContent: verbatim(state?.name ?? s.name), data: { testid: 'guild-name' } }));
    head.append(btn('Actualiser', 'guild-refresh', () => void refresh(), '', false));
    out.push(head);
    if (error) out.push(el('div', { cls: 'base', style: { color: '#e88' }, textContent: error, data: { testid: 'guild-error' } }));
    if (busy) out.push(el('div', { cls: 'base', textContent: 'Connexion au coffre…' }));
    if (state?.code) {
      const row = el('div', { cls: 'tabs', style: { flexWrap: 'wrap', alignItems: 'center', gap: '6px' } });
      row.append(el('span', { textContent: 'Code : ' }), el('code', { textContent: codeShown ? state.code : '••••-••••-••••-••••', data: { testid: 'guild-code' } }));
      row.append(
        btn(codeShown ? 'Masquer' : 'Afficher', 'guild-code-toggle', () => {
          codeShown = !codeShown;
          draw();
        }),
      );
      row.append(
        btn('Copier', 'guild-code-copy', () => {
          const c = state!.code!;
          const done = () => note('Code copié.', false);
          if (navigator.clipboard?.writeText)
            navigator.clipboard.writeText(c).then(done, () => {
              codeShown = true;
              draw();
            });
          else {
            codeShown = true;
            draw();
          }
        }),
      );
      out.push(row);
    }
    if (state) out.push(el('div', { cls: 'base', textContent: `Membres (${state.members.length}) : ${state.members.join(', ')}`, data: { testid: 'guild-members' } }));

    // dépôt de l'objet sélectionné
    const cand = d.candidate();
    const why = cand ? depositBlock(cand.item) : null;
    const full = !!state && state.items.length >= 300;
    const depLabel = cand ? `Déposer : ${itemName(cand.item)}` : 'Déposer (choisis un objet dans le sac)';
    const dep = btn(
      depLabel,
      'guild-deposit',
      () => {
        if (!cand) return;
        if (why) return note(why);
        void act(async () => {
          await Guild.deposit(cand.item, itemName(cand.item), cand.remove);
          note('Objet déposé dans le coffre de guilde.', false);
          await refreshAfter().catch(() => undefined);
          d.changed();
        });
      },
      '',
      !cand || !!why || full,
    );
    dep.style.width = '100%';
    dep.style.overflow = 'hidden';
    dep.style.textOverflow = 'ellipsis';
    out.push(dep);
    if (why) out.push(el('div', { cls: 'base', style: { color: '#e88' }, textContent: why }));
    if (full) out.push(el('div', { cls: 'base', style: { color: '#e88' }, textContent: 'Le coffre de guilde est plein.' }));

    out.push(el('div', { cls: 'lvl', textContent: `Objets du coffre (${state?.items.length ?? 0})` }));
    if (state && !state.items.length) out.push(el('div', { cls: 'base', textContent: 'Le coffre est vide.' }));
    const list = el('div', { cls: 'col', style: { gap: '3px' } });
    for (const e of state?.items ?? []) list.append(row(e));
    out.push(list);
    if (selId) {
      const e = state?.items.find((x) => x.id === selId);
      if (e) {
        out.push(el('div', { cls: 'guild-tip' }, itemTooltip(e.item, d.character())));
      }
    }

    out.push(el('div', { cls: 'lvl', textContent: 'Journal' }));
    const log = el('div', { cls: 'col guild-log', style: { gap: '1px', fontSize: '12px' }, data: { testid: 'guild-log' } });
    const entries = (state?.log ?? []).slice(-30).reverse();
    if (!entries.length) log.append(el('div', { cls: 'base', textContent: 'Aucun mouvement.' }));
    for (const l of entries) {
      log.append(el('div', { cls: 'base', textContent: `${when(l.at)} · ${l.by} ${LOG_TEXT[l.type] ?? l.type}${l.name ? ` : ${l.name}` : ''}` }));
    }
    out.push(log);

    if (!confirmLeave)
      out.push(
        btn(
          'Quitter le coffre',
          'guild-leave',
          () => {
            confirmLeave = true;
            draw();
          },
          'danger',
        ),
      );
    else {
      out.push(el('div', { cls: 'base', textContent: 'Quitter ce coffre ? Tu devras de nouveau saisir le code pour y revenir.' }));
      const r = el('div', { cls: 'tabs', style: { gap: '6px' } });
      r.append(
        btn(
          'Oui, quitter',
          'guild-leave-ok',
          () => {
            confirmLeave = false;
            void act(async () => {
              await Guild.leave();
              state = null;
              codeShown = false;
            });
          },
          'danger',
        ),
        btn('Annuler', 'guild-leave-no', () => {
          confirmLeave = false;
          draw();
        }),
      );
      out.push(r);
    }
    return out;
  }

  function row(e: GuildEntry): HTMLElement {
    const r = el('div', { cls: 'guildrow', data: { id: e.id } });
    const name = el('button', { cls: `btn maprow${selId === e.id ? ' sel' : ''}`, style: { minHeight: '44px', flex: '1', minWidth: '0' }, data: { testid: 'guild-item' } });
    name.append(icon(itemIconOf(e.item), labelClass(e.item)), el('span', { cls: 'mr-name', textContent: itemName(e.item) }), el('small', { textContent: e.by, style: { opacity: '0.7' } }));
    name.addEventListener('click', () => {
      selId = selId === e.id ? null : e.id;
      draw();
    });
    const take = btn('Prendre', 'guild-take', () => {
      void act(async () => {
        await Guild.withdraw(e, { hasRoom: d.hasRoom, place: d.place });
        note(`Pris : ${itemName(e.item)}`, false);
        await refreshAfter().catch(() => undefined);
        d.changed();
      });
    });
    take.style.minWidth = '84px';
    r.append(name, take);
    return r;
  }

  function draw(): void {
    const keep = box.parentElement;
    const scrollTop = keep?.scrollTop ?? 0;
    const parts = Guild.session() ? loggedIn() : [...(error ? [el('div', { cls: 'base', style: { color: '#e88' }, textContent: error, data: { testid: 'guild-error' } })] : []), ...loggedOut()];
    box.replaceChildren(...parts);
    if (Guild.session()) armHook();
    if (keep) keep.scrollTop = scrollTop;
  }

  function arm(): void {
    if (timer) return;
    timer = setInterval(() => {
      if (!box.isConnected) {
        if (timer) clearInterval(timer);
        timer = null;
        return;
      }
      void refresh(true, GUILD_REFRESH_MS - 1000);
    }, GUILD_REFRESH_MS);
  }
  armHook = arm;
  activeDraw = () => {
    if (box.isConnected) draw();
  };
  draw();
  if (Guild.session()) {
    void refresh(true, 5000); // le panneau est redessiné à chaque clic : pas de requête si l'état est récent
  }
  return box;
}
