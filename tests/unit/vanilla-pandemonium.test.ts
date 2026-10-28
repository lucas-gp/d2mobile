/**
 * Pandémonium de la base = Diablo II 1.11 (lot M10e) : clés de la Comtesse, de l'Invocateur et de Nihlathak en Enfer, organes des trois
 * mini-ubers (classes de trésor de TreasureClassEx.txt), Finale par les trois organes (CubeMain.txt), Torche du feu de l'enfer sur le
 * dernier mal primordial de Tristram (code du jeu, src/sim/loot/uber-drops.ts), Annihilus du Clone de Diablo (TC « ROP » : unique nommé).
 * Le jeu pd2 a les siens (mod : clés de six boss, Talisman, Vision de la terreur…).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { MONSTER_TC } from '../../src/data/treasure';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import { BASE_BY_ID } from '../../src/data/items/bases';
import { rollTc, type DropContext } from '../../src/sim/loot/drops';
import { NO_BONUS } from '../../src/sim/loot/itemgen';
import { withoutPd2 } from '../needs-pd2';

const ctx = (seed: string, difficulty: 0 | 1 | 2): DropContext => ({
  rng: new Rng(seed),
  ilvl: 85,
  mf: 0,
  difficulty,
  zoneKey: 'pandemonium',
  mapTier: 0,
  bonus: NO_BONUS,
  gf: 0,
  quantity: 1,
});

describe.skipIf(!withoutPd2)('Pandémonium D2 1.11 (jeu de règles d2)', () => {
  it('clés des boss d’Enfer et organes des mini-ubers dans leurs classes de trésor', () => {
    const refs = (id: string): string[] => MONSTER_TC[id].entries.map((e) => e.ref);
    expect(JSON.stringify(MONSTER_TC)).toContain('"key_terror"');
    expect(refs('lilith2')).toEqual(['organ_horn']);
    expect(refs('uber_duriel2')).toEqual(['organ_eye']);
    expect(refs('uber_izual2')).toEqual(['organ_brain']);
    expect(BASE_BY_ID.pandemonium_talisman).toBeUndefined();
  });
  it('Clone de Diablo : Annihilus en Enfer (TC « ROP (H) »), une fois sur cinq en Cauchemar, la TC de Diablo en Normal', () => {
    expect(MONSTER_TC.dclone2.entries).toEqual([{ ref: 'unique:u_annihilus', weight: 1 }]);
    expect(MONSTER_TC.dclone1.entries).toEqual([
      { ref: 'diablo1', weight: 4 },
      { ref: 'unique:u_annihilus', weight: 1 },
    ]);
    expect(MONSTER_TC.dclone0.entries).toEqual([{ ref: 'diablo0', weight: 1 }]);
    const out = rollTc(ctx('dclone', 2), 'dclone2');
    expect(out.map((i) => i.uniqueId)).toEqual(['u_annihilus']);
    let n = 0;
    for (let k = 0; k < 400; k++) n += rollTc(ctx(`dc${k}`, 1), 'dclone1').filter((i) => i.uniqueId === 'u_annihilus').length;
    expect(n / 400).toBeGreaterThan(0.12);
    expect(n / 400).toBeLessThan(0.28);
    expect(MONSTER_BY_ID.dclone).toBeTruthy();
  });
});
