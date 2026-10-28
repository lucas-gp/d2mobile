/**
 * Contrôle des archives fournies : logique PURE de présentation et de décision (sans navigateur, testée en unitaire). Le contrôle lui-même est
 * dans tools/d2import/mpq-check.ts (exécuté par le Worker) ; ce module dit quoi en faire : quelles archives bloquent la fabrication, quels
 * messages afficher (anglais à l'import, français dans les Réglages, via des gabarits traduits par la couche i18n), quelle ligne de diagnostic.
 * Un MD5 différent de la distribution de référence n'est JAMAIS bloquant ni même un avertissement : c'est une indication.
 */
import { REFERENCE_MD5, md5Verdict, type ArchiveCheck } from '../../tools/d2import/mpq-check';

export type { ArchiveCheck };
export {};

const REQUIRED = ['d2data.mpq', 'd2char.mpq', 'd2exp.mpq'];
export const isRequiredName = (name: string): boolean => REQUIRED.includes(name.toLowerCase());

/** Mo (10^6 octets) lisibles : une décimale sous 10 Mo */
const mbText = (bytes: number, round: 'near' | 'down' | 'up' = 'near'): string => {
  const f = round === 'down' ? Math.floor : round === 'up' ? Math.ceil : Math.round;
  const m = bytes / 1e6;
  return m >= 10 ? String(f(m)) : (f(m * 10) / 10).toFixed(1);
};
/** Début et fin d'une zone arrondis vers l'extérieur : l'intervalle affiché contient toujours la zone réelle */
const zoneFrom = (z: { from: number }): string => mbText(z.from, 'down');
const zoneTo = (z: { to: number }): string => mbText(z.to, 'up');

/** Un résultat n'est valable que pour un fichier de la même taille */
export const checkMatches = (c: ArchiveCheck | undefined, size: number): c is ArchiveCheck => !!c && c.size === size;

/** Archives OBLIGATOIRES incomplètes (la fabrication ne peut pas partir) ; `files` = fichiers actuellement en service */
export function blockingChecks(checks: Record<string, ArchiveCheck>, files: { name: string; size: number }[]): ArchiveCheck[] {
  const out: ArchiveCheck[] = [];
  for (const f of files) {
    const c = checks[f.name.toLowerCase()];
    if (isRequiredName(f.name) && checkMatches(c, f.size) && c.status === 'incomplete') out.push(c);
  }
  return out;
}

/** Archives FACULTATIVES incomplètes : on avertit et on continue sans elles */
export function skippedChecks(checks: Record<string, ArchiveCheck>, files: { name: string; size: number }[]): ArchiveCheck[] {
  const out: ArchiveCheck[] = [];
  for (const f of files) {
    const c = checks[f.name.toLowerCase()];
    if (!isRequiredName(f.name) && checkMatches(c, f.size) && c.status === 'incomplete') out.push(c);
  }
  return out;
}

/** Faut-il garder un résultat existant face à un nouveau ? Un contrôle complet n'est pas remplacé par un rapide sur le même fichier */
export function mergeCheck(prev: ArchiveCheck | undefined, next: ArchiveCheck): ArchiveCheck {
  if (prev && prev.size === next.size && prev.mode === 'full' && next.mode === 'quick') return prev;
  return next;
}

/* ------------------------------ anglais (import) ------------------------------ */

const namesEn = (c: ArchiveCheck): string => (c.zone?.names.length ? `, e.g. ${c.zone.names.join(', ')}` : '');

/** Phrases (une par ligne) décrivant un résultat, en anglais direct : écran d'import */
export function describeEn(c: ArchiveCheck): string[] {
  const z = c.zone;
  const range = z ? `from ${zoneFrom(z)} MB to ${zoneTo(z)} MB` : '';
  const files = z ? (z.files ? ` (${z.files} file${z.files > 1 ? 's' : ''} affected${namesEn(c)})` : '') : '';
  const again = 'It was probably not copied completely. Copy it again from your installation and add it again.';
  switch (c.reason) {
    case 'zeros':
      return [`${c.name} looks incomplete: its data is empty ${range}${files}.`, again];
    case 'truncated':
      return [`${c.name} looks incomplete: the file is shorter than it should be${z ? ` (it should reach ${mbText(z.to)} MB, it holds ${mbText(c.size)} MB)` : ''}.`, again];
    case 'headers':
      return [`${c.name} looks incomplete: ${c.badHeaders} of its files start with empty data${z ? ` (first at ${zoneFrom(z)} MB${namesEn(c)})` : ''}.`, again];
    case 'rawzeros':
      return [`${c.name} looks suspect: an empty area ${range} in uncompressed files${z ? ` (${z.files} file${z.files > 1 ? 's' : ''})` : ''}. This can be normal for some editions.`];
    case 'tables':
      return [`${c.name} looks suspect: its internal tables are inconsistent. This can come from another edition or from a damaged download.`];
    case 'notmpq':
      return [`${c.name} is not recognised as a readable MPQ archive.`];
    case 'unreadable':
      return [`${c.name} could not be read as an MPQ archive${c.note ? ` (${c.note})` : ''}.`];
    default:
      return [];
  }
}

/** Libellé court du statut (anglais) */
export const statusEn = (c: ArchiveCheck | undefined): string => (!c ? 'not checked' : { ok: 'OK', suspect: 'suspect', incomplete: 'incomplete', unrecognized: 'not recognised' }[c.status]);

/* ------------------------------ français (Réglages) ------------------------------ */
/* Chaque phrase est un gabarit {0}… traduit par src/i18n/en.json : une phrase par élément du tableau (un nœud de texte chacune). */

export function describeFr(c: ArchiveCheck): string[] {
  const z = c.zone;
  const again = 'Il n’a probablement pas été copié en entier. Copie-le de nouveau depuis ton installation et ajoute-le à nouveau.';
  switch (c.reason) {
    case 'zeros':
      if (z && z.files)
        return [
          z.names.length
            ? `${c.name} semble incomplet : ses données sont vides de ${zoneFrom(z)} à ${zoneTo(z)} Mo (${z.files} fichiers touchés, par ex. ${z.names.join(', ')}).`
            : `${c.name} semble incomplet : ses données sont vides de ${zoneFrom(z)} à ${zoneTo(z)} Mo (${z.files} fichiers touchés).`,
          again,
        ];
      return [`${c.name} semble incomplet : ses données sont vides de ${mbText(z?.from ?? 0, 'down')} à ${mbText(z?.to ?? c.size, 'up')} Mo.`, again];
    case 'truncated':
      return [`${c.name} semble incomplet : le fichier est plus court que prévu (${mbText(c.size)} Mo sur ${mbText(z?.to ?? c.size)} Mo attendus).`, again];
    case 'headers':
      return [`${c.name} semble incomplet : ${c.badHeaders} fichiers de l’archive commencent par des octets vides.`, again];
    case 'rawzeros':
      return [
        `${c.name} paraît suspecte : une zone vide de ${mbText(z?.from ?? 0, 'down')} à ${mbText(z?.to ?? 0, 'up')} Mo dans des fichiers non compressés (${z?.files ?? 0} fichiers). Cela peut être normal pour certaines éditions.`,
      ];
    case 'tables':
      return [`${c.name} paraît suspecte : ses tables internes sont incohérentes. Cela peut venir d’une autre édition ou d’un téléchargement abîmé.`];
    case 'notmpq':
      return [`${c.name} n’est pas reconnue comme une archive MPQ lisible.`];
    case 'unreadable':
      return [`${c.name} n’a pas pu être lue comme une archive MPQ.`];
    default:
      return [];
  }
}

/** Lignes MD5 (français) : empreinte calculée, verdict, empreinte attendue ; `[]` si non calculée */
export function md5LinesFr(c: ArchiveCheck | undefined, name: string): string[] {
  const ref = REFERENCE_MD5[name.toLowerCase()];
  const v = md5Verdict(name, c?.md5);
  const out: string[] = [];
  if (c?.md5) out.push(`MD5 : ${c.md5}`);
  else out.push('MD5 : non calculé (lance la vérification complète).');
  if (v === 'reference') out.push('Conforme à la distribution de référence.');
  else if (v === 'different') out.push('Version différente de la référence (OK si ton édition est autre).');
  else if (c?.md5) out.push('Pas de MD5 de référence connu pour ce fichier.');
  if (ref) out.push(`MD5 de référence : ${ref}`);
  return out;
}

/** Ligne de diagnostic « check: … » (copiable) pour une archive */
export function diagLine(name: string, c: ArchiveCheck | undefined): string {
  if (!c) return `check: ${name} not checked`;
  const z = c.zone;
  const parts = [`check: ${name}`, `status=${c.status}`, `reason=${c.reason}`, `mode=${c.mode}`, `${c.ms}ms`];
  if (z) parts.push(`zone=${z.from}-${z.to} (${zoneFrom(z)}-${zoneTo(z)} MB)`, `files=${z.files}`, `names=${z.names.join('|') || '-'}`, `zones=${c.zones}`, `affected=${c.affected}`);
  if (c.badHeaders) parts.push(`badHeaders=${c.badHeaders}`);
  parts.push(`md5=${c.md5 ?? 'n/a'}`, `md5verdict=${md5Verdict(name, c.md5)}`);
  if (c.note) parts.push(`note=${c.note}`);
  return parts.join(' ');
}
