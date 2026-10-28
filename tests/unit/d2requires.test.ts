import { describe, expect, it } from 'vitest';
import { existsSync, linkSync, mkdtempSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import gen from '../../src/platform/d2requires.gen.json';
import { BASE_ARCHIVES, missingOf, optionalFor, requiredFor, requiredForAll } from '../../src/platform/d2requires';
import { Vfs } from '../../tools/d2import/vfs';
import { GameData } from '../../tools/d2import/data';
import { availableMaps } from '../../tools/d2import/browser';

describe('archives requises par élément (mesurées)', () => {
  it('interface : d2data + d2exp ; classes d’origine : d2char ; Druide et Assassin : d2exp ; Acte V : d2exp', () => {
    expect(requiredFor('ui')).toEqual(['d2data.mpq', 'd2exp.mpq']);
    expect(requiredFor('sorceress_hd_x')).toEqual(['d2data.mpq', 'd2char.mpq']);
    expect(requiredFor('druid_hd_x')).toContain('d2exp.mpq');
    expect(requiredFor('druid_hd_x')).not.toContain('d2char.mpq');
    expect(requiredFor('baal')).toEqual(['d2exp.mpq']);
    expect(requiredFor('map:a5_tundra')).toEqual(['d2exp.mpq']);
    expect(requiredFor('map:harrogath')).toEqual(['d2exp.mpq']);
    expect(requiredFor('map:a1_bloodmoor')).toEqual(['d2data.mpq']);
    expect(requiredFor('zombie')).toEqual(['d2data.mpq']);
  });
  it('ensemble : union dans l’ordre d2data, d2exp, d2char', () => {
    expect(requiredForAll(['sorceress', 'baal', 'zombie'])).toEqual(['d2data.mpq', 'd2exp.mpq', 'd2char.mpq']);
    expect(requiredForAll([])).toEqual([]);
  });
  it('archives manquantes (sans casse) et facultatives', () => {
    expect(missingOf(['d2data.mpq', 'd2char.mpq'], ['D2Data.MPQ'])).toEqual(['d2char.mpq']);
    expect(optionalFor('sounds').map((o) => o.name)).toEqual(['d2sfx.mpq', 'd2speech.mpq', 'd2xtalk.mpq', 'd2music.mpq']);
    expect(optionalFor('maps')[0].name).toBe('Patch_D2.mpq');
    expect(optionalFor('class')).toEqual([]);
  });
  it('la table mesurée couvre les trois archives', () => {
    for (const a of BASE_ARCHIVES) expect((gen as Record<string, { sheets: string[] }>)[a].sheets.length + (gen as Record<string, { maps: string[] }>)[a].maps.length, a).toBeGreaterThan(0);
  });
});

// vérification contre les vrais fichiers (ignorée sans eux) : les cartes dont le DS1 disparaît quand on retire l'archive
const IN = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
/** lien symbolique, ou lien dur sous Windows sans le mode développeur (EPERM) */
const link = (from: string, to: string): void => {
  try {
    symlinkSync(from, to);
  } catch {
    linkSync(from, to);
  }
};
describe.skipIf(!existsSync(join(IN, 'd2exp.mpq')))('table des cartes contre les vraies archives', () => {
  const open = (skip?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'd2req-t-'));
    for (const f of readdirSync(IN)) if (/\.mpq$/i.test(f) && f.toLowerCase() !== skip) link(join(IN, f), join(dir, f));
    return new GameData(Vfs.open(dir), 'eng', '');
  };
  it('cartes exigées par chaque archive = cartes perdues sans elle', () => {
    const all = availableMaps(open());
    for (const a of BASE_ARCHIVES) {
      const have = new Set(availableMaps(open(a)));
      const lost = all.filter((m) => !have.has(m)).sort();
      expect([...(gen as Record<string, { maps: string[] }>)[a].maps].sort(), a).toEqual(lost);
    }
  });
});
