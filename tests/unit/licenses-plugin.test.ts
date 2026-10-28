/** Avis de licence des paquets embarqués dans le build (tools/build/licenses-plugin.ts, lot 252) */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundledPorted, collectPackages, packageDirOf, portedNotices, renderLicenses } from '../../tools/build/licenses-plugin';

const NM = join(process.cwd(), 'node_modules');

describe('licences des paquets embarqués', () => {
  it('packageDirOf : paquet simple, paquet à portée, modules du projet et virtuels', () => {
    expect(packageDirOf('/x/node_modules/pixi.js/lib/index.mjs')).toBe('/x/node_modules/pixi.js');
    expect(packageDirOf('\0/x/node_modules/@pixi/colord/index.mjs?commonjs-proxy')).toBe('/x/node_modules/@pixi/colord');
    expect(packageDirOf('/x/node_modules/a/node_modules/b/i.js')).toBe('/x/node_modules/a/node_modules/b');
    expect(packageDirOf('C:\\p\\node_modules\\earcut\\src\\earcut.js')).toBe('C:/p/node_modules/earcut');
    expect(packageDirOf('/x/src/main.ts')).toBeNull();
    expect(packageDirOf('\0vite/preload-helper')).toBeNull();
    expect(packageDirOf('/x/node_modules/@scope')).toBeNull();
  });

  it('collectPackages : dédoublonné, trié, texte de licence ou avis reconstitué', () => {
    const pkgs = collectPackages([join(NM, 'pixi.js/lib/index.mjs'), join(NM, 'pixi.js/lib/app.mjs'), join(NM, '@pixi/colord/index.mjs'), join(NM, 'earcut/src/earcut.js'), '/x/src/main.ts']);
    expect(pkgs.map((p) => p.name)).toEqual(['@pixi/colord', 'earcut', 'pixi.js']);
    const pixi = pkgs.find((p) => p.name === 'pixi.js')!;
    expect(pixi.license).toBe('MIT');
    expect(pixi.text).toMatch(/Copyright/);
    const txt = renderLicenses(pkgs);
    expect(txt).toBe(renderLicenses(collectPackages([join(NM, 'earcut/src/earcut.js'), join(NM, '@pixi/colord/index.mjs'), join(NM, 'pixi.js/lib/index.mjs')])));
    // @pixi/colord ne livre pas son fichier : avis MIT reconstitué depuis l'auteur déclaré
    expect(txt).toMatch(/@pixi\/colord [\d.]+ — MIT\n\n\(texte reconstitué[^\n]*\n\nMIT License\n\nCopyright \(c\) Vlad Shilov/);
    expect(txt).toMatch(/ISC License/);
  });

  it('paquet sans licence MIT ni fichier : licence et auteur déclarés', () => {
    const t = renderLicenses([{ name: 'x', version: '1.0.0', license: 'BSD-3-Clause', text: null, author: 'Quelqu’un' }]);
    expect(t).toContain('licence déclarée : BSD-3-Clause, auteur : Quelqu’un');
  });

  it('code tiers porté (THIRD_PARTY_NOTICES.md §4) : avis recopié seulement pour les fichiers du bundle', () => {
    const notices = portedNotices(readFileSync('THIRD_PARTY_NOTICES.md', 'utf8'));
    expect(notices.map((n) => n.files)).toEqual([['tools/d2import/blast.ts'], ['tools/d2import/inflate.ts'], ['tools/d2import/huffman-tables.ts', 'tools/d2import/mpq-audio.ts']]);
    for (const n of notices) for (const f of n.files) expect(existsSync(f), f).toBe(true);
    const ids = ['C:\\p\\tools\\d2import\\inflate.ts', '/p/tools/d2import/mpq-audio.ts?worker', '/p/src/main.ts'];
    const got = bundledPorted(ids, notices);
    expect(got.map((n) => n.title)).toEqual([notices[1].title, notices[2].title]);
    const t = renderLicenses([], got);
    expect(t).toMatch(/tiny-inflate \(MIT\)[^\n]*\(code porté dans le dépôt\)\n\nSynchronous zlib inflate/);
    expect(t).toContain('Copyright (c) Ladislav Zezula');
    expect(t).not.toContain('blast.c');
  });
});
