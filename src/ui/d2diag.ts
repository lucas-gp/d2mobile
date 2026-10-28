/**
 * Diagnostic copiable de la préparation des graphismes Diablo II (écran d'erreur de démarrage ET écran d'attente de la sélection de personnage).
 */
import { d2Local, d2LocalModest } from '../platform/d2local';
import { diagLine } from '../platform/d2check-core';
import { el } from './dom';

/** Identifiant d'asset du service (d2Local) d'un élément manquant `kind:id` */
export function missingAssetIds(missing: string[]): string[] {
  const out: string[] = [];
  for (const m of missing) {
    const mm = /^(sheet|extra|map|sound):(.*)$/.exec(m);
    if (!mm) continue;
    if (mm[1] === 'map') out.push(`map:${mm[2]}`, `mapdata:${mm[2]}`);
    else out.push(mm[2]);
  }
  return out;
}

/** Texte de diagnostic (copiable) d'un échec de préparation */
export async function buildPrepDiagnostic(step: string, missing: string[], extra: string[] = []): Promise<string> {
  const nav = navigator;
  const st = d2Local.status;
  let storage = 'n/a';
  try {
    const e = await navigator.storage?.estimate?.();
    if (e) storage = `${Math.round((e.usage ?? 0) / 1e6)} MB used / ${Math.round((e.quota ?? 0) / 1e6)} MB quota`;
  } catch {
    /* ignoré */
  }
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const ids = missingAssetIds(missing);
  const lines = [
    `D2 Mobile preparation failure — ${new Date().toISOString()}`,
    `step: ${step}`,
    `failed items: ${missing.join(', ')}`,
    ...ids.flatMap((id) => {
      const f = d2Local.failureOf(id);
      return f
        ? [
            `asset ${id} (${f.tier}, ${f.ms} ms): ${f.error}`,
            ...(f.stack
              ? [
                  f.stack
                    .split('\n')
                    .map((l) => `    ${l}`)
                    .join('\n'),
                ]
              : []),
          ]
        : [];
    }),
    ...extra,
    `files: ${
      d2Local
        .fileInfo()
        .map((f) => `${f.name} (${f.size} B)`)
        .join(', ') || 'none'
    }`,
    ...d2Local
      .fileInfo()
      .concat(d2Local.audioFileInfo())
      .map((f) => diagLine(f.name, st.checks[f.name.toLowerCase()])),
    `integrity: ${st.integrity.state}${st.integrity.at ? ` (checked ${new Date(st.integrity.at).toISOString()})` : ''}${st.integrity.files.length ? `; ${st.integrity.files.map((f) => `${f.name}=${f.status}${f.offset !== undefined ? `@${f.offset}` : ''}`).join(', ')}` : ''}`,
    `source: ${st.source}, persistent: ${st.persistent}, phase: ${st.phase}, quotaFull: ${st.quotaFull}, failed: ${st.failed}, message: ${st.message}`,
    `ready extras: ${st.extras.join(', ')}`,
    `device: memory ${nav.deviceMemory ?? '?'} GB, cores ${nav.hardwareConcurrency ?? '?'}, screen ${innerWidth}x${innerHeight}@${devicePixelRatio}, modest ${d2LocalModest()}`,
    `heap: ${heap ? `${Math.round(heap.usedJSHeapSize / 1e6)} / ${Math.round(heap.jsHeapSizeLimit / 1e6)} MB` : 'n/a'}; storage: ${storage}`,
    `features: OPFS ${!!navigator.storage?.getDirectory}, CompressionStream ${typeof CompressionStream !== 'undefined'}, OffscreenCanvas ${typeof OffscreenCanvas !== 'undefined'}`,
    `browser: ${nav.userAgent}`,
  ];
  return lines.join('\n');
}

/** Copie un texte dans le presse-papiers ; sans autorisation, l'affiche sélectionné dans `host` */
export function copyText(text: string, host: HTMLElement, done: () => void): void {
  const fallback = () => {
    const ta = el('textarea', { cls: 'err-copy' });
    ta.value = text;
    ta.readOnly = true;
    host.append(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch {
      /* le texte reste sélectionnable */
    }
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}
