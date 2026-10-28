/** Tables Excel de D2 (.txt tabulés, première ligne = en-têtes) */
export type Row = Record<string, string>;
export interface Table {
  headers: string[];
  rows: Row[];
}

export function parseTxt(text: string): Table {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].split('\t');
  // en-têtes en double (ex. « Comment ») : suffixe pour ne pas s'écraser
  const seen = new Map<string, number>();
  const keys = headers.map((h) => {
    const k = seen.get(h) ?? 0;
    seen.set(h, k + 1);
    return k ? `${h}#${k}` : h;
  });
  const rows = lines.slice(1).map((l) => {
    const c = l.split('\t');
    const r: Row = {};
    keys.forEach((k, i) => (r[k] = c[i] ?? ''));
    return r;
  });
  return { headers, rows };
}
