/**
 * Récepteur d'écriture des exporteurs : les algorithmes ne savent pas où va le résultat.
 * CLI Node → fichiers sous <sortie>/game/ (node-sink.ts) ; navigateur → API Cache (web-sink.ts, d2local.worker.ts).
 * Les chemins sont relatifs à `game/` (ex. `hi/paladin.json`, `icons/skills.png`), les mêmes que ceux du dossier produit par le CLI.
 */
export interface Sink {
  /** écrit un fichier (texte UTF-8 ou octets) */
  write(path: string, data: string | Uint8Array): void | Promise<void>;
  /** encode une image RGBA 8 bits en PNG, l'écrit et renvoie sa taille (octets) */
  png(path: string, w: number, h: number, rgba: Uint8Array): Promise<number>;
}

/** JSON indenté comme `writeJson` du CLI */
export async function putJson(out: Sink, path: string, obj: unknown): Promise<void> {
  await out.write(path, JSON.stringify(obj, null, 2) + '\n');
}
