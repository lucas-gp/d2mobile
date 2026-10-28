/**
 * Fusion des personnages entre l'appareil et le serveur : fonction pure (testée), aucune perte silencieuse.
 * Pour chaque emplacement : date locale de sauvegarde, version serveur, et « marque » = ce qui était identique à la dernière synchro.
 */
export interface LocalInfo {
  savedAt: number;
}
export interface RemoteInfo {
  /** Version serveur */
  updatedAt: number;
  /** Date de sauvegarde annoncée par l'appareil auteur */
  savedAt: number;
}
export interface Mark {
  /** Version serveur à la dernière synchro de cet emplacement */
  rev: number;
  /** Date de sauvegarde locale à la dernière synchro */
  localAt: number;
  /** Empreinte du contenu (sans l'horodatage de sauvegarde) à la dernière synchro : évite de renvoyer un contenu identique */
  fp?: string;
}
export type SyncAction = 'none' | 'adopt' | 'download' | 'upload' | 'conflict' | 'deleteRemote' | 'forgetTomb';

export interface PlanItem {
  slot: string;
  action: SyncAction;
}

/** Décision pour un emplacement présent des deux côtés (a) ou d'un seul */
export function decide(local: LocalInfo | undefined, remote: RemoteInfo | undefined, mark: Mark | undefined): SyncAction {
  if (!local && !remote) return 'none';
  if (!local) return 'download'; // nouvel appareil : on récupère le personnage
  if (!remote) return 'upload'; // créé ici, pas encore en ligne
  if (local.savedAt === remote.savedAt) return mark && mark.rev === remote.updatedAt && mark.localAt === local.savedAt ? 'none' : 'adopt'; // même contenu : on mémorise seulement la marque
  const remoteChanged = !mark || remote.updatedAt !== mark.rev;
  const localChanged = !mark || local.savedAt !== mark.localAt;
  if (remoteChanged && localChanged) return 'conflict';
  if (remoteChanged) return 'download';
  if (localChanged) return 'upload';
  return 'none';
}

/**
 * Plan complet. `tombs` : emplacements supprimés sur cet appareil (valeur = version serveur connue à la suppression) :
 * la copie en ligne n'est supprimée que si personne ne l'a modifiée depuis ; sinon le personnage revient (jamais de perte).
 */
export function planSync(locals: Record<string, LocalInfo>, remotes: Record<string, RemoteInfo>, marks: Record<string, Mark>, tombs: Record<string, number> = {}): PlanItem[] {
  const slots = new Set([...Object.keys(locals), ...Object.keys(remotes), ...Object.keys(tombs)]);
  const out: PlanItem[] = [];
  for (const slot of [...slots].sort()) {
    const remote = remotes[slot];
    if (!locals[slot] && slot in tombs) {
      out.push({ slot, action: !remote ? 'forgetTomb' : remote.updatedAt === tombs[slot] ? 'deleteRemote' : 'download' });
      continue;
    }
    out.push({ slot, action: decide(locals[slot], remote, marks[slot]) });
  }
  return out.filter((p) => p.action !== 'none');
}
