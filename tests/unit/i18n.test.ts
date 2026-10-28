import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import dict from '../../src/i18n/en.json';
import { loadDict, setLang, tr, verbatim } from '../../src/i18n';

describe('traduction anglaise', () => {
  beforeAll(() => loadDict());
  beforeEach(() => {
    setLang('en');
  });

  it('traduit une phrase exacte', () => {
    expect(tr('Points de compétence')).toBe('Skill points');
  });

  it('traduit un gabarit avec valeurs et garde les espaces autour', () => {
    expect(tr('  1er passage : 5  ')).toMatch(/^ {2}First clear: 5 {2}$/);
  });

  it('traduit chaque segment d’un texte composé', () => {
    expect(tr("+20 % d'expérience · +64 % de densité")).toBe('+20 % experience · +64 % density');
  });

  it('ne casse pas un texte déjà anglais', () => {
    expect(tr('Frost Nova')).toBe('Frost Nova');
  });

  it('never translates a player name, even one that is a French word (« Tour »)', () => {
    expect(tr('Tour')).toBe('Tower');
    expect(tr(verbatim('Tour'))).toBe(verbatim('Tour'));
    expect(tr(`Supprimer ${verbatim('Tour')} (Sorcière)`)).toBe(`Delete ${verbatim('Tour')} (Sorceress)`);
    expect(tr(`${verbatim('Tour')} — Sorcière niveau 3`)).toBe(`${verbatim('Tour')} — Sorceress level 3`);
    // the isolates are invisible: the name reads the same once they are removed
    expect(verbatim('Tour').replace(/[\u2068\u2069]/g, '')).toBe('Tour');
  });

  it('translates the F1-F8 tooltips', () => {
    expect(tr('F3 (clic droit : changer)')).toBe('F3 (right-click: change)');
  });

  it('rend le français tel quel', () => {
    setLang('fr');
    expect(tr('Points de compétence')).toBe('Points de compétence');
  });

  it('n’invente aucun marqueur absent du français', () => {
    const ph = (s: string) => s.match(/\{[A-Za-z0-9_]+\}/g) ?? [];
    for (const [fr, en] of Object.entries(dict as Record<string, string>)) for (const p of ph(en)) expect(ph(fr), fr).toContain(p);
  });
});
