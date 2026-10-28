/**
 * Dialogue des PNJ de Harrogath façon Diablo II : le PNJ parle (voix et texte d'origine importés), puis on choisit : écouter un autre sujet,
 * commercer (l'action habituelle du PNJ) ou partir. Sans l'import D2 (aucune ligne), l'action s'ouvre directement, comme avant.
 */
import type { ClassId } from '../data/classes';
import { el } from './dom';

export interface NpcLine {
  n: number;
  text: string;
  file?: string;
}

export interface NpcDialogOpts {
  name: string;
  title: string;
  lines: NpcLine[];
  classId: ClassId;
  actionLabel: string;
  action: () => void;
  /** Lot 321: other actions of the NPC (Asheara: trade beside hiring; Anya: the maps beside trade), after the main one */
  extra?: { label: string; act: () => void }[];
  speak: (file: string | undefined) => void;
  done: () => void;
}

const CLASS_EN: Record<ClassId, string> = { sorceress: 'Sorceress', druid: 'Druid', barbarian: 'Barbarian', paladin: 'Paladin', amazon: 'Amazon', assassin: 'Assassin', necromancer: 'Necromancer' };

/** Les lignes qui s'adressent à une autre classe (« you Amazons… ») sont écartées */
export function linesFor(lines: NpcLine[], classId: ClassId): NpcLine[] {
  const own = CLASS_EN[classId];
  const others = Object.values(CLASS_EN).filter((n) => n !== own);
  return lines.filter((l) => !others.some((o) => new RegExp(`\\b${o}s?\\b`, 'i').test(l.text)));
}

export function openNpcDialog(root: HTMLElement, o: NpcDialogOpts): void {
  const lines = linesFor(o.lines, o.classId);
  const box = el('div', { cls: 'npc-dialog' });
  const close = () => {
    o.speak(undefined);
    box.remove();
    o.done();
  };
  const text = el('div', { cls: 'nd-text', textContent: '…' });
  let k = Math.floor(Math.random() * Math.max(1, lines.length));
  const talk = el('button', { cls: 'btn nd-btn', textContent: 'Parler' });
  const say = () => {
    const l = lines[k % lines.length];
    k++;
    text.textContent = l.text;
    o.speak(l.file);
    talk.textContent = 'Autre sujet';
  };
  talk.addEventListener('click', say);
  const button = (label: string, run: () => void, primary: boolean) => {
    const b = el('button', { cls: `btn nd-btn${primary ? ' primary' : ''}`, textContent: label });
    b.addEventListener('click', () => {
      o.speak(undefined);
      box.remove();
      o.done();
      run();
    });
    return b;
  };
  const act = button(o.actionLabel, o.action, true);
  const extra = (o.extra ?? []).map((x) => button(x.label, x.act, false));
  const bye = el('button', { cls: 'btn nd-btn', textContent: 'Au revoir' });
  bye.addEventListener('click', close);
  const back = el('div', { cls: 'nd-back' });
  back.addEventListener('click', close);
  box.append(
    back,
    el(
      'div',
      { cls: 'nd-box' },
      el('div', { cls: 'nd-name', textContent: o.name }),
      el('div', { cls: 'nd-title', textContent: o.title }),
      text,
      el('div', { cls: 'nd-btns' }, ...(lines.length ? [talk] : []), act, ...extra, bye),
    ),
  );
  root.append(box);
  if (lines.length) say();
}
