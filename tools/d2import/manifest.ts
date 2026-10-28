/** Manifeste des sorties : chaque étape réécrit sa propre section (relançable seule, sans toucher aux autres) */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function writeFileEnsured(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

export function writeJson(path: string, obj: unknown): void {
  writeFileEnsured(path, JSON.stringify(obj, null, 2) + '\n');
}

export function readManifest(outDir: string): Record<string, unknown> {
  const p = join(outDir, 'manifest.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

export function updateManifest(outDir: string, section: string, value: unknown): void {
  const m = readManifest(outDir);
  m[section] = value;
  m.generatedBy = 'd2import';
  writeJson(join(outDir, 'manifest.json'), m);
}
