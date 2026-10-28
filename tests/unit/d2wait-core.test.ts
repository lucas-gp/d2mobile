import { describe, expect, it } from 'vitest';
import { STUCK_MS, headline, judge, progressKey, statusLines, type WaitSnap } from '../../src/ui/d2wait-core';

const base = (o: Partial<WaitSnap> = {}): WaitSnap => ({
  phase: 'ready',
  files: 3,
  pending: 0,
  active: 0,
  slots: [],
  failed: [],
  batch: { done: 0, total: 0 },
  generated: 0,
  message: '',
  lastError: '',
  uiReady: false,
  uiImages: 0,
  uiIndexed: 0,
  missingKeys: [],
  notInCache: [],
  exhausted: false,
  screensReady: false,
  copyDone: 0,
  ...o,
});
const t0 = { reload: 0, redo: 0, rerequest: 0 };

describe('d2wait-core', () => {
  it('lot prêt mais images absentes : relit puis refabrique, une seule fois', () => {
    const s = base({ uiReady: true });
    expect(judge(s, t0).kind).toBe('reload-ui');
    expect(judge(s, { ...t0, reload: 2 }).kind).toBe('redo-ui');
    expect(judge(s, { reload: 2, redo: 1, rerequest: 0 }).kind).toBe('ok');
  });
  it('demande perdue (rien en file, rien en cours, pas d’échec) : refaite, bornée', () => {
    expect(judge(base(), t0).kind).toBe('rerequest');
    expect(judge(base(), { ...t0, rerequest: 3 }).kind).toBe('ok');
    expect(judge(base({ pending: 1 }), t0).kind).toBe('ok');
    expect(judge(base({ failed: ['ui'] }), t0).kind).toBe('ok');
    expect(judge(base({ files: 0, phase: 'needfiles' }), t0).kind).toBe('ok');
  });
  it('interface partielle (48 sur 82) : jamais « prepared », clés manquantes et attendu affichés, message d’incomplétude', () => {
    const s = base({ uiReady: true, uiImages: 48, uiIndexed: 82, missingKeys: ['select-bg', 'hero-sorceress-nu1'], notInCache: ['select-bg'], exhausted: true });
    const t = statusLines(s).join('\n');
    expect(t).toMatch(/INCOMPLETE, 48\/82/);
    expect(t).toMatch(/Missing: select-bg, hero-sorceress-nu1/);
    expect(t).toMatch(/Not in cache: select-bg/);
    expect(headline(s, false)).toMatch(/incomplete \(missing: select-bg, hero-sorceress-nu1\)/);
    expect(statusLines({ ...s, screensReady: true }).join('\n')).toMatch(/prepared, 48\/82/);
  });
  it('empreinte de progression : change avec la file, les Workers, les échecs', () => {
    const a = progressKey(base());
    expect(progressKey(base({ pending: 1 }))).not.toBe(a);
    expect(progressKey(base({ slots: [{ ready: true, dead: false, job: 'ui' }] }))).not.toBe(a);
    expect(progressKey(base({ failed: ['ui'] }))).not.toBe(a);
    expect(progressKey(base())).toBe(a);
    expect(STUCK_MS).toBeGreaterThanOrEqual(15000);
  });
  it('messages : jamais vide, explique l’échec, les fichiers absents, l’erreur de lecture', () => {
    expect(headline(base(), true)).toBe('Retrying…');
    expect(headline(base({ failed: ['ui'] }), false)).toMatch(/could not be built/);
    expect(headline(base({ phase: 'needfiles', files: 0 }), false)).toMatch(/not found/);
    expect(headline(base({ phase: 'error' }), false)).toMatch(/could not be read/);
    expect(headline(base(), false)).toMatch(/Preparing/);
    const l = statusLines(base({ pending: 2, active: 1, lastError: 'ui: boom', slots: [{ ready: false, dead: true, job: null }] }));
    expect(l.join('\n')).toMatch(/2 waiting, 1 running/);
    expect(l.join('\n')).toMatch(/stopped/);
    expect(l.join('\n')).toMatch(/Last error: ui: boom/);
  });
});
