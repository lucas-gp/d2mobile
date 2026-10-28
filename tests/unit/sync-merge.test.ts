import { describe, expect, it } from 'vitest';
import { decide, planSync } from '../../src/platform/sync-merge';

const R = (updatedAt: number, savedAt = updatedAt) => ({ updatedAt, savedAt });

describe('sync-merge : decide', () => {
  it('(a) absent localement : téléchargement', () => {
    expect(decide(undefined, R(10), undefined)).toBe('download');
  });
  it('(b) serveur plus récent, local inchangé depuis la dernière synchro : remplacement', () => {
    expect(decide({ savedAt: 5 }, R(20, 18), { rev: 10, localAt: 5 })).toBe('download');
  });
  it('(c) local plus récent, serveur inchangé : envoi', () => {
    expect(decide({ savedAt: 9 }, R(10, 5), { rev: 10, localAt: 5 })).toBe('upload');
  });
  it('(d) les deux ont changé : conflit', () => {
    expect(decide({ savedAt: 9 }, R(20, 18), { rev: 10, localAt: 5 })).toBe('conflict');
  });
  it('rien de changé : rien à faire ; local seul : envoi', () => {
    expect(decide({ savedAt: 5 }, R(10, 5), { rev: 10, localAt: 5 })).toBe('none');
    expect(decide({ savedAt: 5 }, undefined, undefined)).toBe('upload');
    expect(decide(undefined, undefined, undefined)).toBe('none');
  });
  it('sans marque (marque perdue) et contenus différents : conflit, jamais d’écrasement ; même contenu : adoption', () => {
    expect(decide({ savedAt: 5 }, R(10, 7), undefined)).toBe('conflict');
    expect(decide({ savedAt: 7 }, R(10, 7), undefined)).toBe('adopt');
  });
});

describe('sync-merge : planSync', () => {
  it('plan sur plusieurs personnages, dont un coffre partagé', () => {
    const plan = planSync(
      { a: { savedAt: 5 }, b: { savedAt: 9 }, c: { savedAt: 9 }, shared: { savedAt: 3 } },
      { a: R(10, 5), b: R(10, 5), c: R(20, 18), d: R(30), shared: R(8, 3) },
      { a: { rev: 10, localAt: 5 }, b: { rev: 10, localAt: 5 }, c: { rev: 10, localAt: 5 }, shared: { rev: 8, localAt: 3 } },
    );
    expect(plan).toEqual([
      { slot: 'b', action: 'upload' },
      { slot: 'c', action: 'conflict' },
      { slot: 'd', action: 'download' },
    ]);
  });
  it('suppression locale : la copie en ligne n’est supprimée que si elle n’a pas bougé', () => {
    expect(planSync({}, { x: R(10) }, {}, { x: 10 })).toEqual([{ slot: 'x', action: 'deleteRemote' }]);
    expect(planSync({}, { x: R(11) }, {}, { x: 10 })).toEqual([{ slot: 'x', action: 'download' }]);
    expect(planSync({}, {}, {}, { x: 10 })).toEqual([{ slot: 'x', action: 'forgetTomb' }]);
  });
  it('aucune perte : toute version qui change a été vue ou conservée (propriété sur toutes les combinaisons)', () => {
    // pour chaque combinaison (local, serveur, marque), l'action qui écrase un côté exige que ce côté n'ait pas changé
    const locals = [undefined, { savedAt: 5 }, { savedAt: 9 }];
    const remotes = [undefined, R(10, 5), R(20, 18)];
    const marks = [undefined, { rev: 10, localAt: 5 }];
    for (const l of locals)
      for (const r of remotes)
        for (const m of marks) {
          const a = decide(l, r, m);
          if (a === 'download' && l && r) {
            expect(m, 'écrasement du local sans marque').toBeDefined();
            expect(l.savedAt, 'écrasement d’un local modifié').toBe(m!.localAt);
          }
          if (a === 'upload' && l && r) {
            expect(m, 'envoi sans marque').toBeDefined();
            expect(r.updatedAt, 'écrasement d’un serveur modifié').toBe(m!.rev);
          }
        }
  });
});
