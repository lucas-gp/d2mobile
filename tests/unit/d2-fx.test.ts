/** Effets de sorts D2 : correspondances pures (impact, nova, incantation, sorts persistants) */
import { describe, expect, it } from 'vitest';
import { BUFF_FX, FX_BY_CLASS, MISSILE_FX, castFx, impactFx, novaFx } from '../../src/render/fx';
import { PROPS } from '../../src/data/props';
import { PROP_FLAME } from '../../src/render/fx';

const have =
  (...ids: string[]) =>
  (id: string) =>
    ids.includes(id);

describe('effets D2', () => {
  it('sans planche importée : aucun effet', () => {
    const none = have();
    expect(impactFx(none, 'meteor', 'fire', 3)).toBeNull();
    expect(novaFx(none, 'nova', 'light')).toBeNull();
    expect(castFx(none, 'fire')).toBeNull();
  });

  it('impact : type de sort avant élément, échelle bornée', () => {
    const r = impactFx(have('meteorblast', 'firearrowblast'), 'meteor', 'fire', 8);
    expect(r?.id).toBe('meteorblast');
    expect(r!.scale).toBeLessThanOrEqual(1.6);
    expect(impactFx(have('firearrowblast'), 'fire_bolt', 'fire', 0.5)?.id).toBe('firearrowblast');
    expect(impactFx(have('shockhitsm'), 'x', 'light', 0.5)?.id).toBe('shockhitsm');
    expect(impactFx(have('meteorblast'), 'x', 'phys', 1)).toBeNull();
  });

  it('nova : par type puis par élément', () => {
    expect(novaFx(have('frostnova', 'elecnova'), 'frost_nova', 'cold')).toBe('frostnova');
    expect(novaFx(have('elecnova'), 'inconnue', 'light')).toBe('elecnova');
    expect(castFx(have('icecast'), 'cold')).toBe('icecast');
  });

  it('les effets cités par le rendu existent dans la liste d’export', async () => {
    const src = (await import('node:fs')).readFileSync('tools/d2import/fx-map.ts', 'utf8');
    const exported = new Set([...src.matchAll(/[MO]\('(\w+)'/g)].map((m) => m[1]));
    const used = new Set<string>([...Object.values(MISSILE_FX), ...Object.values(BUFF_FX).map((b) => b.id), ...Object.values(FX_BY_CLASS).flat(), ...Object.values(PROP_FLAME).map((f) => f.id)]);
    expect([...used].filter((id) => !exported.has(id))).toEqual([]);
  });

  it('les décors qui brûlent existent dans le catalogue', () => {
    const ids = new Set(PROPS.map((p) => p.id));
    expect(Object.keys(PROP_FLAME).filter((id) => !ids.has(id))).toEqual([]);
  });
});
