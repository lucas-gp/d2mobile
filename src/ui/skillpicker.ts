/**
 * Choix de compétence par appui long sur un emplacement (style menu de Diablo II) : grille des compétences apprises, toucher pour assigner.
 * La compétence déjà placée ailleurs est déplacée (une compétence n'occupe qu'un emplacement, voir Game.assignSkill).
 */
import type { Game } from '../sim/game';
import { SKILLS } from '../data/skills';
import { classOf } from '../data/classes';
import { el } from './dom';
import { icon } from './hud';

export function openSkillPicker(root: HTMLElement, g: Game, slot: number | 'primary' | 'secondary', done: () => void, includeTeleport = false): void {
  const c = g.character;
  const d = g.world.player.d;
  const cls = classOf(c.classId);
  const learned = SKILLS.filter((s) => cls.trees.includes(s.tree) && !s.passive && (includeTeleport || s.id !== 'teleport') && ((c.skills[s.id] ?? 0) > 0 || (d.skillLevels[s.id] ?? 0) > 0));
  const current = slot === 'primary' ? c.hotbar.primary : slot === 'secondary' ? (c.hotbar.secondary ?? 'attack') : c.hotbar.slots[slot];
  const box = el('div', { cls: 'skill-picker' });
  const close = () => {
    box.remove();
    done();
  };
  const pick = (id: string | null) => {
    g.assignSkill(slot, id);
    close();
  };
  const cell = (id: string | null, label: string) => {
    const b = el(
      'button',
      { cls: `sp-cell${current === id ? ' sel' : ''}`, title: label },
      id ? icon(id) : el('span', { cls: 'sp-none', textContent: '∅' }),
      el('span', { cls: 'sp-name', textContent: label }),
    );
    b.addEventListener('click', () => pick(id));
    return b;
  };
  const grid = el('div', { cls: 'sp-grid' }, ...(typeof slot === 'number' ? [cell(null, 'Vide')] : []), cell('attack', 'Attaque'), ...learned.map((s) => cell(s.id, s.name)));
  const back = el('div', { cls: 'sp-back' });
  back.addEventListener('click', close);
  box.append(
    back,
    el(
      'div',
      { cls: 'sp-box' },
      el('div', {
        cls: 'sp-title',
        textContent: slot === 'primary' ? 'Compétence du clic gauche' : slot === 'secondary' ? 'Compétence du clic droit' : `Emplacement ${(slot % 4) + 1} — page ${Math.floor(slot / 4) + 1}`,
      }),
      grid,
    ),
  );
  root.append(box);
}
