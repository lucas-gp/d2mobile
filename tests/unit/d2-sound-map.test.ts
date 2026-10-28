/** Correspondance événements → sons de Diablo II : premier groupe disponible, repli null */
import { describe, expect, it } from 'vitest';
import { castSound, impactSound, itemSound, monsterSound, stepSound, weaponSounds } from '../../src/platform/d2sound-map';
import { SKILL_BY_ID } from '../../src/data/skills';
import { MONSTERS } from '../../src/data/monsters';
import { MONSTER_OWNER } from '../../src/platform/d2sound-map';

const have =
  (...groups: string[]) =>
  (g: string) =>
    groups.includes(g);

describe('sons D2', () => {
  it('sans import : jamais de groupe', () => {
    const none = have();
    expect(castSound(none, 'sorceress', 'fire_bolt', 'fire')).toBeNull();
    expect(impactSound(none, 'sorceress', 'fire_bolt', 'fire', true)).toBeNull();
    expect(monsterSound(none, 'fallen', 'HIT')).toBeNull();
    expect(itemSound(none, 'sword', false)).toBeNull();
  });

  it('sort : nom de la compétence, alias, puis élément', () => {
    expect(castSound(have('SORCERESS_FIREBOLT'), 'sorceress', 'fire_bolt', 'fire')).toBe('SORCERESS_FIREBOLT');
    expect(castSound(have('SORCERESS_LIGHTNING'), 'sorceress', 'chain_lightning', 'light')).toBe('SORCERESS_LIGHTNING');
    expect(castSound(have('SORCERESS_CAST_COLD'), 'sorceress', 'frost_nova', 'cold')).toBe('SORCERESS_CAST_COLD');
    expect(castSound(have('BARBARIAN_WHIRLWIND'), 'barbarian', 'whirlwind', 'phys')).toBe('BARBARIAN_WHIRLWIND');
    expect(castSound(have('PALADIN_AURA_MIGHT'), 'paladin', 'might', 'phys')).toBe('PALADIN_AURA_MIGHT');
    expect(castSound(have('X'), 'sorceress', 'attack', 'phys')).toBeNull();
  });

  it('impact : l’effet de la compétence avant l’élément', () => {
    expect(impactSound(have('SORCERESS_FIREBALL_IMPACT', 'IMPACT_FIRE'), 'sorceress', 'fire_ball', 'fire', true)).toBe('SORCERESS_FIREBALL_IMPACT');
    expect(impactSound(have('IMPACT_FIRE'), 'sorceress', 'fire_ball', 'fire', true)).toBe('IMPACT_FIRE');
  });

  it('pas : poids de la classe, allure et sol', () => {
    expect(stepSound(have('HEAVY_WALK_SNOW'), 'barbarian', false, 'snow', true)).toBe('HEAVY_WALK_SNOW');
    expect(stepSound(have('LIGHT_WALK_ISTONE'), 'paladin', false, 'crypt', false)).toBe('LIGHT_WALK_ISTONE');
  });

  it('arme : coups par type', () => {
    expect(weaponSounds(have('WEAPON_BOW', 'IMPACT_ARROW'), 'bow', true)).toEqual({ swing: 'WEAPON_BOW', hit: 'IMPACT_ARROW' });
    expect(weaponSounds(have('WEAPON_2HS_LARGE', 'IMPACT_BLADE_SWING'), 'sword', true)).toEqual({ swing: 'WEAPON_2HS_LARGE', hit: 'IMPACT_BLADE_SWING' });
  });

  it('chaque monstre du jeu a un propriétaire de sons, sauf les invocations sans équivalent', () => {
    const missing = MONSTERS.filter((m) => !MONSTER_OWNER[m.id]).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  it('les compétences de toutes les classes ont un nom valide', () => {
    expect(Object.keys(SKILL_BY_ID).length).toBeGreaterThan(100);
  });
});

describe('musiques de cartes', () => {
  it("le morceau d'une carte est stable et appartient à son ambiance", async () => {
    const { mapMusic, MOOD_MUSIC, BOSS_STINGER } = await import('../../src/platform/d2sound-map');
    const a = mapMusic('tombs', 'Cryptes royales');
    expect(a).toBe(mapMusic('tombs', 'Cryptes royales'));
    expect(['tombs', 'lair', 'sewer', 'harem', 'crypt']).toContain(a);
    expect(mapMusic('inconnue', 'x')).toBeNull();
    expect(MOOD_MUSIC.harrogath).toBe('town4');
    expect(Object.values(BOSS_STINGER).every((k) => k.startsWith('st_'))).toBe(true);
  });
});
