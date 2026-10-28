/** Frontières d'architecture : la simulation et les données ne dépendent jamais du rendu ni du DOM. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('Architecture', () => {
  it('src/sim et src/data n’importent ni rendu, ni interface, ni Pixi, ni DOM', () => {
    const bad: string[] = [];
    for (const f of [...files('src/sim'), ...files('src/data')]) {
      const s = readFileSync(f, 'utf8');
      if (/from ['"](pixi\.js|.*\/render\/|.*\/ui\/|.*\/input\/|.*\/platform\/)/.test(s)) bad.push(`${f} : import interdit`);
      if (/\b(document|window|localStorage|requestAnimationFrame)\s*[.(]/.test(s)) bad.push(`${f} : accès au navigateur`);
      if (/Math\.random\s*\(/.test(s)) bad.push(`${f} : Math.random (utiliser Rng)`);
      if (/Date\.now\s*\(|performance\.now\s*\(/.test(s) && !f.includes('/bot/')) bad.push(`${f} : horloge réelle dans la simulation`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('le rendu n’écrit pas dans le monde', () => {
    const bad: string[] = [];
    for (const f of files('src/render')) {
      const s = readFileSync(f, 'utf8');
      if (/world\.(input|player|monsters|items|objects)\s*(\.[a-zA-Z]+)*\s*=[^=]/.test(s)) bad.push(f);
      if (/\.(hp|x|y|dead|mana)\s*=[^=]/.test(s) && /world/.test(s) && /m\.hp\s*=|player\.hp\s*=/.test(s)) bad.push(f);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
