/**
 * Mesures de qualité du code (API du compilateur TypeScript, sans exécuter le code) : longueur des fonctions, graphe d'imports relatifs
 * et ses composantes cycliques (imports de valeur seuls, ou types compris). Utilisé par `tools/quality/metrics.ts` (`npm run metrics`).
 */
import ts from 'typescript';
import { posix } from 'node:path';

export interface FnLength {
  file: string;
  name: string;
  line: number;
  lines: number;
}

/** Fonctions, méthodes, constructeurs et accesseurs d'un fichier, avec leur nombre de lignes (une fonction imbriquée compte aussi à part) */
export function functionLengths(file: string, text: string): FnLength[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: FnLength[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n)) && n.body) {
      const start = sf.getLineAndCharacterOfPosition(n.getStart()).line;
      const end = sf.getLineAndCharacterOfPosition(n.end).line;
      const named = n.name ?? (n.parent as { name?: ts.Node }).name;
      out.push({ file, name: named ? named.getText(sf) : '(anonyme)', line: start + 1, lines: end - start + 1 });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Imports relatifs d'un fichier résolus vers les fichiers connus (`known`) ; `types` : compte aussi les imports de type seuls */
export function relativeImports(file: string, text: string, known: Set<string>, types: boolean): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out = new Set<string>();
  const add = (spec: string, typeOnly: boolean): void => {
    if ((typeOnly && !types) || !spec.startsWith('.')) return;
    const p = posix.join(posix.dirname(file), spec).replace(/\.js$/, '');
    for (const c of [`${p}.ts`, `${p}/index.ts`]) if (known.has(c)) return void out.add(c);
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const c = st.importClause;
      const named = c?.namedBindings && ts.isNamedImports(c.namedBindings) ? c.namedBindings.elements : undefined;
      const typeOnly = !!c && (c.isTypeOnly || (!c.name && !!named && named.length > 0 && named.every((e) => e.isTypeOnly)));
      add(st.moduleSpecifier.text, typeOnly);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) add(st.moduleSpecifier.text, st.isTypeOnly);
  }
  if (types) {
    const visit = (n: ts.Node): void => {
      if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) add(n.argument.literal.text, true);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return [...out];
}

/** Composantes fortement connexes de plus d'un fichier (algorithme de Tarjan) */
export function cyclicComponents(graph: Map<string, string[]>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];
  const connect = (v: string): void => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!idx.has(w)) {
        connect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const v of graph.keys()) if (!idx.has(v)) connect(v);
  return out.sort((a, b) => b.length - a.length);
}
