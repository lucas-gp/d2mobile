import { describe, expect, it } from 'vitest';
import { PREP_ORDER, estimateWeight, fmtEta, planPrep, prepProgress, prepTitle, problemText, stageLabel, windowed } from '../../src/platform/d2local-prep';

const it_ = (id: string, kind: 'sheet' | 'extra' | 'map' | 'sound' = 'sheet', weight = 1) => ({ id, kind, weight });

describe('préparation sans repli : ordre de priorité', () => {
  it('interface → icônes → carte → sol → joueur → monstres → objets → effets → sons', () => {
    expect([...PREP_ORDER]).toEqual(['ui', 'icons', 'map', 'ground', 'player', 'units', 'objects', 'fx', 'sounds']);
    const st = planPrep({
      sounds: [it_('s', 'sound')],
      fx: [it_('fx_a')],
      units: [it_('fallen')],
      player: [it_('barbarian')],
      ground: [it_('ground_x')],
      map: [it_('harrogath', 'map')],
      icons: [it_('icons:items', 'extra')],
      ui: [it_('ui', 'extra')],
    });
    expect(st.map((s) => s.key)).toEqual(['ui', 'icons', 'map', 'ground', 'player', 'units', 'fx', 'sounds']);
  });

  it("un identifiant demandé par plusieurs étapes n'est compté que dans la première", () => {
    const st = planPrep({ player: [it_('hydra'), it_('barbarian')], units: [it_('hydra'), it_('fallen')], objects: [it_('hydra')] });
    expect(st.find((s) => s.key === 'player')!.items.map((i) => i.id)).toEqual(['hydra', 'barbarian']);
    expect(st.find((s) => s.key === 'units')!.items.map((i) => i.id)).toEqual(['fallen']);
    expect(st.find((s) => s.key === 'objects')).toBeUndefined();
  });

  it('un même identifiant de natures différentes reste distinct (carte et planche)', () => {
    const st = planPrep({ map: [it_('tristram', 'map')], ground: [it_('tristram', 'sheet')] });
    expect(st.length).toBe(2);
  });
});

describe('progression et temps restant', () => {
  const stages = planPrep({ ui: [it_('ui', 'extra', 2)], units: [it_('a', 'sheet', 1), it_('b', 'sheet', 1), it_('c', 'sheet', 1)] });
  it('fraction pondérée, étape courante et compteur', () => {
    const p = prepProgress(stages, new Set(['extra:ui', 'sheet:a']), 4000);
    expect(p.stage).toBe('units');
    expect(p.done).toBe(1);
    expect(p.total).toBe(3);
    expect(p.fraction).toBeCloseTo(3 / 5, 5);
  });
  it('temps restant : estimation de départ puis débit mesuré', () => {
    const start = prepProgress(stages, new Set(), 0, 4);
    expect(start.etaSeconds).toBe(5 * 4);
    const mid = prepProgress(stages, new Set(['extra:ui', 'sheet:a']), 6000);
    // 3 poids faits en 6 s → 2 restants ≈ 4 s
    expect(mid.etaSeconds).toBeCloseTo(4, 5);
    expect(prepProgress(stages, new Set(['extra:ui', 'sheet:a', 'sheet:b', 'sheet:c']), 9000).etaSeconds).toBe(0);
    expect(prepProgress(stages, new Set(['extra:ui', 'sheet:a', 'sheet:b', 'sheet:c']), 9000).stage).toBeNull();
  });
  it('plan vide : prêt', () => {
    const p = prepProgress([], new Set(), 0);
    expect(p.fraction).toBe(1);
    expect(p.stage).toBeNull();
  });
});

describe('libellés', () => {
  it('étapes en français', () => {
    expect(stageLabel('units', 2, 12)).toBe('Monstres 3/12');
    expect(stageLabel('units', 0, 4, true)).toBe('Personnages 1/4');
    expect(stageLabel('ground', 0, 9)).toBe('Sols et murs');
    expect(stageLabel('player', 0, 6)).toBe('Équipement');
    expect(stageLabel('icons', 0, 4)).toBe('Icônes');
    expect(stageLabel('map', 0, 1)).toBe('Carte');
    expect(stageLabel('sounds', 0, 1)).toBe('Sons');
    expect(prepTitle(true)).toBe('Préparation de la ville…');
  });
  it('durées lisibles', () => {
    expect(fmtEta(null)).toBe('');
    expect(fmtEta(0.2)).toBe('1 s');
    expect(fmtEta(42)).toBe('42 s');
    expect(fmtEta(80)).toBe('1 min 20 s');
    expect(fmtEta(120)).toBe('2 min');
  });
  it("poids estimés : un effet est bien plus léger qu'une unité", () => {
    expect(estimateWeight('fx_firebolt', 'sheet')).toBeLessThan(estimateWeight('fallen', 'sheet'));
    expect(estimateWeight('ui', 'extra')).toBeGreaterThan(estimateWeight('ground_x', 'sheet'));
  });
  it('fenêtre bornée : au plus `limit` éléments en avance', () => {
    expect(windowed([1, 2, 3, 4, 5, 6], 0, 2)).toEqual([1, 2]);
    expect(windowed([1, 2, 3, 4, 5, 6], 3, 2)).toEqual([1, 2, 3, 4, 5]);
    expect(windowed([1, 2], 9, 2)).toEqual([1, 2]);
  });
  it("messages d'erreur clairs", () => {
    expect(problemText('nofiles')).toMatch(/cannot be found/);
    expect(problemText('quota')).toMatch(/Storage full/);
    expect(problemText('unreadable', 'd2data.mpq')).toMatch(/d2data\.mpq/);
  });
});

import { Game } from '../../src/sim/game';

describe("porte de départ d'une run (cartes en préparation)", () => {
  it('une run attend, et le menu du point de passage dit pourquoi', () => {
    const g = new Game(undefined, 'sorceress');
    let ready = false;
    g.runGate = () => (ready ? null : 'Préparation des cartes de Diablo II 3/20…');
    const opts = g.runOptions().filter((o) => o.run.id === 'tristram' && o.difficulty === 0);
    expect(opts[0].unlocked).toBe(false);
    expect(opts[0].reason).toMatch(/Préparation des cartes/);
    expect(g.startRun('tristram', 0, 1)).toBe(false);
    ready = true;
    expect(g.startRun('tristram', 0, 1)).toBe(true);
  });
});
