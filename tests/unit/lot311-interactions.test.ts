/**
 * Lot 311 (owner: "after a first interaction, the other interactions with a chest or an NPC do not work"): the touch context button
 * (the "interact" button) was shown through the memoised `setStyle` and hidden by a direct `style.display = 'none'`: the memo still held
 * 'block', so once hidden it was never shown again (the target's bar the same). Guard: no element of the UI is written both ways for the
 * same property. And `objectAt`: the nearest object, an NPC touched on his body too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { objectAt } from '../../src/sim/targeting';

const UI = path.join(__dirname, '../../src/ui');

describe('memoised styles are never written around the memo', () => {
  it('no `this.x` both through setStyle(x, prop) and x.style.prop = …', () => {
    const bad: string[] = [];
    for (const f of fs.readdirSync(UI).filter((n) => n.endsWith('.ts'))) {
      const s = fs.readFileSync(path.join(UI, f), 'utf8');
      for (const m of s.matchAll(/setStyle\((this\.[\w.]+),\s*'([\w-]+)'/g)) {
        const [, elName, prop] = m;
        const camel = prop.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
        const esc = elName.replace(/\./g, '\\.');
        if (new RegExp(`${esc}\\.style\\.${camel}\\s*=[^=]`).test(s) || new RegExp(`${esc}\\.style\\.setProperty\\('${prop}'`).test(s)) bad.push(`${f}: ${elName} ${prop}`);
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('the context button and the target bar are shown again after being hidden (hud.ts)', () => {
    const s = fs.readFileSync(path.join(UI, 'hud.ts'), 'utf8');
    expect(s).toContain("setStyle(this.ctxBtn, 'display', 'none')");
    expect(s).toContain("setStyle(this.target, 'display', 'none')");
  });
});

describe('objectAt: what a tap or a click means', () => {
  const objs = [
    { id: 1, kind: 'npc', x: 10, y: 10 },
    { id: 2, kind: 'stash', x: 14, y: 10 },
    { id: 3, kind: 'gate', x: 20, y: 20 },
    { id: 4, kind: 'chest', x: 14.8, y: 10 },
  ];
  it('the nearest object within reach, never a gate', () => {
    expect(objectAt(objs, 14.5, 10)?.id).toBe(4);
    expect(objectAt(objs, 13.9, 10.2)?.id).toBe(2);
    expect(objectAt(objs, 20, 20)).toBeNull();
    expect(objectAt(objs, 30, 30)).toBeNull();
  });
  it('an NPC is touched on his body (up the screen from his feet), not only at his feet', () => {
    // 1.5 units up the screen = (−1.5, −1.5): 2.1 units from the feet, on the body
    expect(objectAt(objs, 8.5, 8.5)?.id).toBe(1);
    // the same offset from the stash (a low object): nothing
    expect(objectAt(objs, 12.5, 8.5)).toBeNull();
    // below the feet (down the screen): only the feet's reach
    expect(objectAt(objs, 11.2, 11.2)).toBeNull();
  });
});
