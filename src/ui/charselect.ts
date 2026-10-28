/**
 * Écran de sélection des personnages, affiché à chaque lancement : liste des personnages
 * (pseudo, classe, niveau, difficulté atteinte), jouer, supprimer (appui maintenu), et création
 * d'un personnage (choix de la classe et du pseudo). Plusieurs personnages par classe.
 */
import { CLASS_IDS, CLASSES, type ClassId } from '../data/classes';
import type { CharSummary } from '../platform/platform';
import { el } from './dom';
import { icon } from './icon';
import { animatedSprite, d2UiReady } from './d2ui';
import { d2CharacterScreen, d2ScreensReady } from './d2charselect';
import { openD2Import } from './d2import';
import { openSyncDialog, syncButtonLabel } from './sync-ui';
import { DISCORD_URL, SYNC_ENABLED, d2ImportShown } from '../platform/build-flags';
import { d2Info } from '../render/assets';
import { waitD2Screens } from './d2wait';
import { NAME_MAX, cleanName, kindOf, modeName, showKindChoice, type CharChoice } from './charselect-core';
import { charList, PORTRAIT } from './charlist';
import { clampTop, isDoubleTap, keepVisible, revealTop, type Tap } from './select-core';
import { listedChars, modMenuButtons, NO_MODS, screenKinds, screenModes, showModeChoice, variantPicker, type ScreenMods } from './charselect-mods';
import { bindUpdateButton } from './update-link';

export { type CharChoice, type ScreenMods };

/** Décor de l'écran de Diablo II : fond de campement, logo de feu, personnage de la classe choisie près du feu (rien sans l'import) */
function decor(box: HTMLElement, cls: ClassId): HTMLElement[] {
  box.classList.toggle('d2', d2UiReady());
  if (!d2UiReady()) return [];
  const out: HTMLElement[] = [el('div', { cls: 'cs-bg' })];
  const logo = animatedSprite('logo', 0.62);
  if (logo) {
    logo.classList.add('cs-logo');
    out.push(logo);
  }
  const hero = animatedSprite(`class-${cls}`, 1.35);
  if (hero) {
    hero.classList.add('cs-hero');
    out.push(hero);
  }
  return out;
}

/** Écran de sélection / création sans l'art de Diablo II : liste des personnages, jouer, supprimer, créer, importer, synchroniser */
class CharacterScreen {
  readonly box = el('div', { cls: 'charselect' });
  selected: string | null = null;
  /** First visible row of the list, last tap (double tap plays) */
  top = 0;
  lastTap: Tap | null = null;
  finished = false;
  resolve!: (c: CharChoice) => void;

  constructor(
    readonly root: HTMLElement,
    readonly list: () => CharSummary[],
    readonly onDelete: (slot: string) => void,
    readonly mods: ScreenMods = NO_MODS,
  ) {}

  run(): Promise<CharChoice> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.root.append(this.box);
      // lot 318: Escape on the home screen's second step goes back to the kinds
      this.box.addEventListener('keydown', (e) => {
        const back = e.key === 'Escape' ? this.box.querySelector<HTMLElement>('[data-act="modeback"]') : null;
        if (!back) return;
        e.preventDefault();
        back.click();
      });
      if (showModeChoice(screenModes(this.mods)) && !this.mods.openList) this.showModes();
      else this.showList();
    });
  }

  done(c: CharChoice): void {
    if (this.finished) return;
    this.finished = true;
    this.box.remove();
    this.resolve(c);
  }

  /** Bouton « Importer un personnage D2 » : fenêtre d'import (.d2s) ; la liste est rafraîchie si des personnages ont été ajoutés */
  importButton(): HTMLElement[] {
    if (!d2ImportShown()) return [];
    const b = el('button', { cls: 'btn', textContent: 'Importer un personnage D2' });
    b.addEventListener('click', async () => {
      const r = await openD2Import(this.box);
      if (r.changed) this.showList();
    });
    return [b];
  }

  /** Bouton « Se connecter » / « Synchroniser » : le PC récupère ses personnages dès le premier lancement */
  syncButton(): HTMLElement {
    const b = el('button', { cls: 'btn', textContent: syncButtonLabel(), data: { act: 'sync' } });
    b.addEventListener('click', async () => {
      await openSyncDialog(this.box);
      this.showList();
    });
    return b;
  }

  /**
   * First screen when there is a choice of modes: one button per mode (Diablo II, Project Diablo 2, game modes), import, sync, mods.
   * Lot 318: with several kinds of game, the kind first (Normal, Survivals: `kind` null), then the game it is played on, with Back.
   */
  showModes(kind: string | null = null): void {
    const all = this.list();
    const modes = screenModes(this.mods);
    const kinds = screenKinds(this.mods);
    const twoSteps = showKindChoice(kinds);
    const picked = twoSteps && kind ? (kinds.find((k) => k.id === kind) ?? null) : null;
    const count = (n: number) => el('span', { cls: 'sub', textContent: n === 0 ? 'Aucun personnage' : n === 1 ? '1 personnage' : `${n} personnages` });
    const chars = (id: string) => listedChars(all, { ...this.mods, mode: id }).length;
    const pick = (id: string) => {
      if (this.mods.switchMode?.(id) ?? true) this.showList();
    };
    const modeButton = (id: string, name: string, sub: string | undefined) => {
      const b = el(
        'button',
        { cls: `btn mode${id === this.mods.mode ? ' cur' : ''}`, data: { act: 'mode', mode: id } },
        el('b', { textContent: name }),
        ...(sub ? [el('span', { cls: 'sub', textContent: sub })] : []),
        count(chars(id)),
      );
      b.addEventListener('click', () => pick(id));
      return b;
    };
    let buttons: HTMLElement[];
    if (twoSteps && !picked)
      buttons = kinds.map((k) => {
        const b = el(
          'button',
          { cls: `btn mode kind${this.mods.mode && kindOf(this.mods.mode) === k.id ? ' cur' : ''}`, data: { act: 'modetype', type: k.id } },
          el('b', { textContent: k.name }),
          ...(k.tagline ? [el('span', { cls: 'sub', textContent: k.tagline })] : []),
          count(k.modes.reduce((n, m) => n + chars(m.id), 0)),
        );
        b.addEventListener('click', () => (k.modes.length === 1 ? pick(k.modes[0].id) : this.showModes(k.id)));
        return b;
      });
    else if (picked) buttons = picked.modes.map((m) => modeButton(m.id, m.name, m.tagline));
    else buttons = modes.map((m) => modeButton(m.id, m.name, m.description));
    const back = picked ? el('button', { cls: 'btn', textContent: 'Retour', data: { act: 'modeback' } }) : null;
    back?.addEventListener('click', () => this.showModes());
    this.box.replaceChildren(
      ...decor(this.box, 'sorceress'),
      el(
        'div',
        { cls: 'cs-main' },
        el('h2', { textContent: 'D2 Mobile' }),
        el('div', { cls: 'sub', textContent: picked ? `${picked.name} — choisissez le jeu` : 'Choisissez un mode de jeu' }),
        el('div', { cls: 'modes' }, ...buttons, ...(back ? [back] : [])),
        el('div', { cls: 'row' }, ...this.importButton(), ...(SYNC_ENABLED ? [this.syncButton()] : []), ...this.modButtons()),
        el('a', { cls: 'btn discord', textContent: 'Discord', href: DISCORD_URL, target: '_blank', rel: 'noopener', data: { act: 'discord' } }),
        // lot 290 (owner): check for updates from the home screen (ui/update-link.ts)
        bindUpdateButton(el('button', { cls: 'btn upd' })),
      ),
    );
    if (picked) buttons[0]?.focus({ preventScroll: true });
  }

  modButtons(): HTMLElement[] {
    return modMenuButtons(
      this.mods,
      this.box,
      () => this.showList(),
      (label, run) => {
        const b = el('button', { cls: 'btn', textContent: label });
        b.addEventListener('click', run);
        return b;
      },
    );
  }

  /** Selection laid out as in the game (charlist.ts), drawn by the style sheet; import, sync and mod buttons (or "Change mode") below */
  showList(): void {
    const chars = listedChars(this.list(), this.mods);
    if (!chars.length) {
      this.showCreate(false);
      return;
    }
    if (!this.selected || !chars.some((c) => c.slot === this.selected)) this.selected = chars[0].slot;
    this.top = revealTop(
      this.top,
      chars.findIndex((c) => c.slot === this.selected),
      chars.length,
    );
    const modes = screenModes(this.mods);
    const choice = showModeChoice(modes);
    const extras = choice ? [] : [...this.importButton(), ...(SYNC_ENABLED ? [this.syncButton()] : []), ...this.modButtons()];
    const view = charList({
      chars,
      selected: this.selected,
      top: this.top,
      layout: 'compact',
      art: false,
      problem: (c) => this.mods.problem(c.ruleset),
      card: (c) => this.mods.card?.(c) ?? null,
      mode: choice ? modeName(modes, this.mods.mode ?? '') : undefined,
      exit: choice,
      extras,
      on: {
        select: (slot) => {
          const now = performance.now();
          const double = isDoubleTap(this.lastTap, slot, now);
          this.lastTap = double ? null : { slot, t: now };
          const c = chars.find((x) => x.slot === slot);
          if (double && c && !this.mods.problem(c.ruleset)) return this.done({ play: slot });
          if (slot !== this.selected) {
            this.selected = slot;
            this.showList();
          }
        },
        play: (slot) => this.done({ play: slot }),
        create: () => this.showCreate(true),
        remove: (slot) => {
          this.onDelete(slot);
          this.selected = null;
          this.showList();
        },
        exit: () => this.showModes(),
        scroll: (top) => {
          this.top = clampTop(top, chars.length);
          this.selected = keepVisible(chars, this.selected, this.top);
          this.showList();
        },
      },
    });
    this.box.classList.remove('d2');
    this.box.replaceChildren(view);
  }

  /** Back to the choice of mode */
  modesButton(): HTMLElement {
    const b = el('button', { cls: 'btn', textContent: 'Changer de mode', data: { act: 'modes' } });
    b.addEventListener('click', () => this.showModes());
    return b;
  }

  showCreate(canBack: boolean): void {
    let cls: ClassId = 'sorceress';
    const input = el('input', { type: 'text', maxLength: NAME_MAX, placeholder: 'Pseudo', autocomplete: 'off', spellcheck: false });
    input.setAttribute('autocapitalize', 'words');
    const cards = el('div', { cls: 'cards' });
    const descEl = el('div', { cls: 'cs-desc' });
    const drawCards = () => {
      descEl.textContent = CLASSES[cls].desc;
      cards.replaceChildren(
        ...CLASS_IDS.map((id) => {
          const c = CLASSES[id];
          const card = el(
            'button',
            { cls: `card ${id}${cls === id ? ' sel' : ''}` },
            el('span', { cls: 'portrait' }, icon(PORTRAIT[id])),
            el('b', { textContent: c.name }),
            el('span', { cls: 'desc', textContent: c.desc }),
          );
          card.addEventListener('click', () => {
            cls = id;
            drawCards();
            const hero = this.box.querySelector('.cs-hero');
            const next = animatedSprite(`class-${id}`, 1.35);
            if (hero && next) {
              next.classList.add('cs-hero');
              hero.replaceWith(next);
            }
          });
          return card;
        }),
      );
    };
    drawCards();
    const ok = el('button', { cls: 'btn primary big', textContent: 'Créer' });
    // the game mode's variants (lot 289: Survivals' Run or Campaign)
    const variants = variantPicker(this.mods, 'classic');
    const err = el('div', { cls: 'err' });
    ok.addEventListener('click', () => {
      const name = cleanName(input.value);
      if (!name) {
        err.textContent = 'Choisissez un pseudo.';
        input.focus();
        return;
      }
      this.done({ create: { classId: cls, name, ruleset: this.mods.mode ?? '', ...(variants ? { variant: variants.value() } : {}) } });
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok.click();
    });
    const row = el('div', { cls: 'row' });
    if (canBack) {
      const back = el('button', { cls: 'btn', textContent: 'Retour' });
      back.addEventListener('click', () => this.showList());
      row.append(back);
    }
    row.append(input, ok);
    if (!canBack) row.append(...(showModeChoice(screenModes(this.mods)) ? [this.modesButton()] : [...this.importButton(), ...(SYNC_ENABLED ? [this.syncButton()] : [])]));
    // champ en haut : le clavier du téléphone recouvre la moitié basse de l'écran
    this.box.replaceChildren(...decor(this.box, cls), el('div', { cls: 'cs-main' }, el('h2', { textContent: 'Nouveau personnage' }), row, variants?.el ?? null, err, cards, descEl));
  }
}

export function characterScreen(root: HTMLElement, list: () => CharSummary[], onDelete: (slot: string) => void, mods: ScreenMods = NO_MODS): Promise<CharChoice> {
  // avec l'import D2 : les écrans d'origine (menu, sélection, création)
  if (d2ScreensReady()) return d2CharacterScreen(root, list, onDelete, mods);
  // mode local : jamais l'écran d'origine — on attend que l'interface de Diablo II soit prête (fabriquée à partir des fichiers du joueur)
  if (d2Info.local) return waitD2Screens(root).then(() => d2CharacterScreen(root, list, onDelete, mods));
  return new CharacterScreen(root, list, onDelete, mods).run();
}
