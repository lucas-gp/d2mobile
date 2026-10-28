/**
 * Banque de sprites : charge les planches pré-rendues zone par zone, crée les textures des
 * images, libère ce qui ne sert plus et mesure la mémoire de textures occupée (budget).
 */
import { Assets, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { checkKey, decryptBytes, deriveKey, type D2Index } from './d2crypto';
import { cacheAvailable, isCached, QuotaError, storeFile } from '../platform/d2cache';
import { i18nReady } from '../i18n';
import { d2Local, d2LocalEnabled, d2LocalModest, localRead, setD2LocalEnabled } from '../platform/d2local';
import { PRIO, extraOfPath, isBlockingId, onboardAction } from '../platform/d2local-core';
import { prepProgress, type PrepItem, type PrepProgress, type PrepStage } from '../platform/d2local-prep';

export type Tier = 'hi' | 'lo';

export interface SheetAnim {
  frames: number;
  fps: number;
  loop: boolean;
  action: number;
  dirs: number;
  /** foulée de la marche (px par image à l'échelle 1), fournie par les planches importées : cadence = vitesse / foulée */
  stride?: number;
}

interface FrameTex {
  tex: Texture;
  /** ancre en px (dans le repère de l'image) */
  ax: number;
  ay: number;
  /** pièce d'équipement (arme, bouclier) dessinée derrière le corps à cette image */
  behind?: boolean;
  /** image à dessiner en miroir horizontal (ancre inchangée) */
  flip?: boolean;
}

export interface Sheet {
  id: string;
  kind: string;
  dirs: number;
  scale: number;
  shadowScale: number;
  /** côté d'une tuile de sol en unités (4 pour les sols du jeu, 5 pour ceux importés de D2) */
  tileSize?: number;
  /** effets de sorts importés : fusion additive (lumière) ou normale (objets solides) */
  blend?: 'add' | 'normal';
  anims: Record<string, SheetAnim>;
  frames: Map<string, FrameTex>;
  shadows: Map<string, FrameTex>;
  pageUrls: string[];
  /** textures décodées hors de Assets (planches chiffrées) : détruites au déchargement */
  ownPages?: Texture[];
  gpuBytes: number;
}

interface SheetJson {
  id: string;
  kind: string;
  dirs?: number;
  scale: number;
  shadowScale?: number;
  tileSize?: number;
  blend?: 'add' | 'normal';
  anims?: Record<string, SheetAnim>;
  pages: { file: string; w: number; h: number }[];
  frames: Record<string, number[]>;
  shadowPages?: { file: string; w: number; h: number }[];
  shadows?: Record<string, number[]>;
}

export interface Manifest {
  version: number;
  sheets: Record<string, { hi: { bytes: number; gpu: number }; lo: { bytes: number; gpu: number }; kind: string }>;
  tiles: Record<string, { hi: { bytes: number; gpu: number }; lo: { bytes: number; gpu: number } }>;
}

/**
 * Sprites importés des fichiers du joueur (tools/d2import, usage privé) : servis sous `d2/` seulement si
 * le dossier existe en local. Ils remplacent les planches du même identifiant ; sans eux — ou si l'une d'elles
 * est illisible — le jeu garde ses sprites d'origine.
 */
declare const __D2_SPRITES__: string | undefined;
/**
 * off : sprites d'origine ; plain : dossier local en clair (serveur vite) ; enc : dossier chiffré distant (chargeur optionnel `D2_REMOTE`, mot de passe) ;
 * local : planches générées sur l'appareil depuis les MPQ du joueur (src/platform/d2local.ts), seulement si le réglage
 * `d2m.d2local` est activé et si la version n'utilise pas déjà le dossier chiffré. Désactivé par défaut.
 */
declare const __D2_PUBLIC__: boolean | undefined;
const D2_BUILD: 'off' | 'plain' | 'enc' = typeof __D2_SPRITES__ !== 'undefined' && (__D2_SPRITES__ === 'plain' || __D2_SPRITES__ === 'enc') ? __D2_SPRITES__ : 'off';
/** Version publique (D2_PUBLIC=1 au build) : sans dossier chiffré, l'écran de choix guide vers l'import des fichiers du joueur */
const D2_PUBLIC = typeof __D2_PUBLIC__ !== 'undefined' && __D2_PUBLIC__ === true;
const savedPassword = (): boolean => {
  try {
    const v = localStorage.getItem('d2m.d2pass');
    return !!v && v !== '-';
  } catch {
    return false;
  }
};
/**
 * « Jouer avec les graphismes de remplacement » : seulement en développement (ni version publique, ni dossier chiffré). Ailleurs, le jeu ne se
 * lance qu'avec les graphismes Diablo II (fichiers du joueur ou mot de passe) : aucun lien pour passer l'écran de choix. Exception : les builds
 * de test (D2_ALLOW_SKIP=1, scripts e2e sans MPQ), jamais déployés.
 */
declare const __D2_ALLOW_SKIP__: boolean | undefined;
export const D2_SKIP_ALLOWED = (!D2_PUBLIC && D2_BUILD === 'off') || (typeof __D2_ALLOW_SKIP__ !== 'undefined' && __D2_ALLOW_SKIP__ === true);
const sessionSkip = (): boolean => {
  if (!D2_SKIP_ALLOWED) return false;
  try {
    return sessionStorage.getItem('d2m.d2skip') === '1';
  } catch {
    return false;
  }
};
/**
 * Un dossier en clair (développement) ou un mot de passe déjà mémorisé gardent leur mode (comportement inchangé) ;
 * sinon le réglage « graphismes locaux » (choisi sur l'écran de départ ou dans les Réglages) active le mode local.
 */
let D2_MODE: 'off' | 'plain' | 'enc' | 'local' = D2_BUILD === 'plain' || (D2_BUILD === 'enc' && (savedPassword() || !d2LocalEnabled())) ? D2_BUILD : d2LocalEnabled() ? 'local' : D2_BUILD;
const D2_PASS_KEY = 'd2m.d2pass';
const D2_SKIP_KEY = 'd2m.d2skip';

/** État des sprites D2 pour l'écran Réglages : mode de la version, planches et sols importés, mot de passe demandé */
export const d2Info = { mode: (D2_MODE === 'local' ? 'off' : D2_MODE) as 'off' | 'plain' | 'enc', local: D2_MODE === 'local', imported: 0, locked: false };

/** Efface le mot de passe (ou le refus) mémorisé et relance : la question est reposée */
export function resetD2Password(): void {
  try {
    localStorage.removeItem(D2_PASS_KEY);
  } catch {
    /* ignoré */
  }
  location.reload();
}

/** Bascule en mode local (choix « importer mes fichiers » ou fichiers déjà là) sans recharger : le réglage est mémorisé */
function switchToLocal(): void {
  setD2LocalEnabled(true);
  D2_MODE = 'local';
  d2Info.mode = 'off';
  d2Info.local = true;
  d2Local.modeActive = true;
}

/** « Jouer avec les graphismes de remplacement » : valable pour cet onglet seulement (aucun refus définitif mémorisé) */
function skipForSession(): void {
  try {
    sessionStorage.setItem(D2_SKIP_KEY, '1');
  } catch {
    /* ignoré */
  }
}

/** Écran de choix (mot de passe + import) pour une version qui embarque le dossier chiffré ; vide/annulé = null */
async function passwordForm(retry: boolean): Promise<string | null> {
  // écran chargé à la demande (il n'est montré qu'une fois, sans fichiers D2) : hors du chargement de départ
  const { showD2Choice } = await import('../ui/d2-choice');
  const r = await showD2Choice({ encrypted: true, retry, allowSkip: D2_SKIP_ALLOWED });
  if (r.kind === 'password') return r.value;
  if (r.kind === 'local') switchToLocal();
  else skipForSession();
  return null;
}

/** Mot de passe des sprites chiffrés : mémorisé sur l'appareil ; « sans les graphismes » = sprites d'origine pour cette session */
async function askPassword(retry: boolean): Promise<string | null> {
  try {
    if (/[?&]d2=reset\b/.test(location.search)) localStorage.removeItem(D2_PASS_KEY);
    const saved = localStorage.getItem(D2_PASS_KEY);
    // ancien refus mémorisé (« - ») : ignoré, la question est reposée
    if (saved && saved !== '-' && !retry) return saved;
    if (!retry && sessionSkip()) return null;
    return await passwordForm(retry);
  } catch {
    return null;
  }
}

/** Fusionne le manifeste importé dans celui du jeu (planches et sols) : renvoie les identifiants remplacés */
export function mergeManifest(base: Manifest, d2: Partial<Manifest> | null | undefined): { manifest: Manifest; replaced: Set<string> } {
  const replaced = new Set<string>();
  const sheets = { ...base.sheets };
  for (const [id, entry] of Object.entries(d2?.sheets ?? {})) {
    if (!entry?.hi || !entry?.lo) continue;
    sheets[id] = entry;
    replaced.add(id);
  }
  const tiles = { ...base.tiles };
  for (const [id, entry] of Object.entries(d2?.tiles ?? {})) {
    if (!entry?.hi || !entry?.lo) continue;
    tiles[id] = entry;
    replaced.add(id);
  }
  return { manifest: { ...base, sheets, tiles }, replaced };
}

export class SpriteBank {
  private sheets = new Map<string, Sheet>();
  /** planches actuellement fournies par l'import D2 */
  private d2 = new Set<string>();
  private original: Manifest['sheets'] = {};
  private originalTiles: Manifest['tiles'] = {};
  /** clé de déchiffrement des planches importées (mode chiffré) */
  private d2Key: CryptoKey | null = null;
  /** suffixe d'adresse (`?v=<empreinte>`) des fichiers chiffrés */
  private d2Ver = '';
  private loading = new Map<string, Promise<Sheet | null>>();
  /** Palier choisi planche par planche quand le budget de textures est dépassé (les grosses planches passent en basse résolution) */
  private tierOf = new Map<string, Tier>();
  /** Budget de textures pour les planches d'une zone (octets) ; 0 = pas de limite */
  budget = 0;
  manifest: Manifest | null = null;

  constructor(
    readonly base: string,
    public tier: Tier,
  ) {}

  async init(): Promise<void> {
    if (this.manifest) return;
    this.manifest = await fetchJson<Manifest>(`${this.base}sprites/manifest.json`);
    await this.onboard();
    if (D2_MODE !== 'off') await this.initD2();
  }

  /**
   * Premier lancement d'une version publique (ou écran forcé par `?d2=choose`) : écran de choix, ou import direct si le réglage
   * est actif mais les fichiers sont à fournir de nouveau. Le mode chiffré passe par askPassword (même écran).
   */
  private async onboard(): Promise<void> {
    if (D2_BUILD === 'plain' || D2_MODE === 'enc') return;
    const forced = /[?&]d2=choose\b/.test(location.search);
    if (forced) {
      try {
        sessionStorage.removeItem(D2_SKIP_KEY);
      } catch {
        /* ignoré */
      }
    }
    // l'écran ne concerne que les versions publiques (D2_PUBLIC), à dossier chiffré (mot de passe), ou forcées : en développement, le réglage
    // « graphismes locaux » des Réglages garde son comportement (jeu tout de suite, fichiers fournis depuis les Réglages)
    const publicOrForced = D2_PUBLIC || forced || D2_BUILD === 'enc';
    if (!publicOrForced) return;
    await d2Local.init();
    const st = d2Local.status;
    const haveAssets = d2Local.hasFiles || st.hasCache || st.phase === 'error';
    const act = onboardAction({ build: D2_BUILD, publicOrForced, savedPassword: savedPassword(), refused: false, sessionSkip: sessionSkip(), localFlag: D2_MODE === 'local', haveAssets });
    if (act === 'none') return;
    // fichiers déjà copiés sur l'appareil mais réglage perdu : on reprend sans rien demander
    if (act === 'choose' && haveAssets) {
      switchToLocal();
      return;
    }
    await i18nReady();
    const { showD2Choice } = await import('../ui/d2-choice');
    const r = await showD2Choice({ encrypted: false, start: act === 'import' ? 'import' : 'choose', canGoBack: D2_BUILD === 'enc', allowSkip: D2_SKIP_ALLOWED });
    if (r.kind === 'local') switchToLocal();
    else if (r.kind === 'back') {
      // version à dossier chiffré : retour à la saisie du mot de passe
      setD2LocalEnabled(false);
      location.reload();
      await new Promise(() => undefined);
    } else skipForSession();
  }

  private async initD2(): Promise<void> {
    try {
      if (D2_MODE === 'enc' && !(await this.unlockD2()) && (D2_MODE as string) !== 'local') {
        d2Info.locked = true;
        return;
      }
      this.original = { ...this.manifest!.sheets };
      this.originalTiles = { ...this.manifest!.tiles };
      if (D2_MODE === 'local') {
        await this.initLocal();
        return;
      }
      const json = JSON.parse(new TextDecoder().decode(await this.d2Bytes('manifest.json'))) as Partial<Manifest>;
      const { manifest, replaced } = mergeManifest(this.manifest!, json);
      this.manifest = manifest;
      this.d2 = replaced;
      d2Info.imported = replaced.size;
      if (replaced.size) console.info(`Sprites importés : ${replaced.size} planches D2 (les autres gardent les sprites du jeu)`);
    } catch {
      /* pas d'import local ou mot de passe refusé : sprites d'origine */
    }
  }

  /**
   * Mode local, génération paresseuse : les assets déjà générés sont ceux du manifeste en cache ; ceux que le catalogue sait produire
   * sont « en attente » (présents dans le manifeste avec une estimation de mémoire) et générés à la demande, par priorité. Tant qu'une
   * planche n'est pas prête, le sprite d'origine sert (remplacement à chaud ensuite).
   */
  private async initLocal(): Promise<void> {
    d2Local.modeActive = true;
    d2Local.hook = (id, tier, kind, entry) => this.onLocalGenerated(id, tier, kind, entry);
    d2Local.onChange = () => this.refreshLocal();
    await d2Local.init();
    this.refreshLocal(false);
  }

  /** Reconstruit les listes (prêtes / générables) depuis le service : au démarrage, puis quand le catalogue ou les fichiers changent */
  private refreshLocal(bump = true): void {
    if (!this.manifest || D2_MODE !== 'local') return;
    const base = { ...this.manifest, sheets: { ...this.original }, tiles: { ...this.originalTiles } };
    const { manifest, replaced } = mergeManifest(base, d2Local.manifestJson() as unknown as Partial<Manifest>);
    const cat = d2Local.catalog;
    const guess = (id: string, tile: boolean): Manifest['sheets'][string] => {
      // estimation de mémoire GPU avant génération (moyennes mesurées au palier lo : unité 0,8 Mo, pièce 0,6 Mo, effet 0,25 Mo, sol 0,5 Mo, décor 0,05 Mo ; hi ≈ 4×)
      const lo = tile ? 500_000 : id.startsWith('fx_') ? 250_000 : id.startsWith('prop_') ? 50_000 : /_(hd|sh|lg|ra|la|rh|lh)_/.test(id) ? 600_000 : 800_000;
      return { hi: { bytes: 0, gpu: lo * 4 }, lo: { bytes: 0, gpu: lo }, kind: tile ? 'ground' : 'actor' };
    };
    const pending = new Set<string>();
    if (cat) {
      for (const id of [...cat.units, ...cat.parts, ...cat.props, ...cat.fx]) {
        if (d2Local.hasFailed(id) || replaced.has(id)) continue;
        if (!(id in manifest.sheets)) manifest.sheets[id] = guess(id, false);
        pending.add(id);
      }
      for (const id of cat.grounds) {
        if (d2Local.hasFailed(id) || replaced.has(id)) continue;
        if (!(id in manifest.tiles)) manifest.tiles[id] = guess(id, true);
        pending.add(id);
      }
    }
    this.manifest = manifest;
    this.d2 = new Set([...replaced, ...pending]);
    d2Info.imported = this.d2.size;
    if (bump) this.epoch++;
  }

  /** Compteur incrémenté à chaque changement visible (planche remplacée à chaud, catalogue) : le rendu réévalue alors ses planches */
  epoch = 0;
  /** Planches actuellement chargées avec le sprite d'origine en attendant la génération D2 */
  private provisional = new Set<string>();
  /**
   * Mode local « sans repli » : aucun sprite d'origine n'est affiché tant qu'un équivalent Diablo II peut être (ou va être) fabriqué ; ce
   * qui n'est pas prêt n'est pas dessiné. Restent d'origine : ce qui n'a pas d'équivalent D2 (hors catalogue) ou dont la génération a échoué.
   */
  get strict(): boolean {
    return D2_MODE === 'local';
  }
  /** Sprites d'origine réellement servis en mode local (diagnostic et rapport : identifiant → raison) */
  readonly originalUsed = new Map<string, 'no-d2' | 'failed' | 'blocking'>();
  /** Demandées par la zone courante (monstres hors planche d'origine, pièces) : à charger dès qu'elles sont prêtes */
  private interest = new Set<string>();
  /** Planches du joueur (corps, pièces, mercenaire) : priorité haute */
  private playerIds = new Set<string>();
  private doomed: { s: Sheet; at: number }[] = [];

  /** Nouvelle zone : les demandes de la précédente (hors planches du joueur) ne servent plus */
  beginZone(): void {
    this.interest.clear();
    this.reqPrio.clear();
    if (D2_MODE === 'local') {
      d2Local.cancelAbove(PRIO.player);
      // une carte pas encore finie pour la zone qu'on vient de quitter ne sert plus (les fichiers déjà écrits restent)
      d2Local.cancelMaps();
    }
  }

  /** Planches du joueur (priorité de génération la plus haute après le sol) */
  setPlayerSheets(ids: string[]): void {
    this.playerIds = new Set(ids);
  }

  /** Précharge en arrière-plan (basse priorité) des planches d'une zone à venir : rien n'est chargé en mémoire GPU */
  prefetch(ids: string[]): void {
    if (D2_MODE !== 'local') return;
    for (const id of ids) {
      if (!this.d2.has(id)) continue;
      const tier = this.tierOf.get(id) ?? this.tier;
      d2Local.want(id, tier, PRIO.prefetch);
    }
  }

  /** Priorité de génération d'une planche demandée par `setActive` */
  private prioOf(id: string, base: number): number {
    if (isBlockingId(id)) return PRIO.zone;
    if (this.playerIds.has(id)) return PRIO.player;
    return this.reqPrio.get(id) ?? base;
  }

  private reqPrio = new Map<string, number>();

  /** Rendu : téléverse une texture sur le GPU tout de suite (une planche remplacée à chaud par image, pas de gros à-coup à la première utilisation) */
  uploader: ((source: TextureSource) => void) | null = null;
  /** Mises en place à chaud : une par image d'animation au plus (budget par image) */
  private swapChain: Promise<void> = Promise.resolve();

  /** Une planche vient d'être écrite dans le cache : elle est chargée et mise à la place du sprite d'origine (avant d'être déclarée prête) */
  private onLocalGenerated(id: string, tier: Tier, kind: string, entry?: Manifest['sheets'][string]): Promise<void> {
    if (kind === 'files' || kind === 'map') return Promise.resolve();
    if (entry) {
      if (kind === 'tile') this.manifest!.tiles[id] = entry as Manifest['tiles'][string];
      else this.manifest!.sheets[id] = entry;
    }
    this.d2.add(id);
    if (this.tier !== tier && (this.tierOf.get(id) ?? this.tier) !== tier) return Promise.resolve();
    // chargement en cours (bloquant) : il lira lui-même la planche une fois la demande résolue
    if (this.loading.has(id)) return Promise.resolve();
    if (!this.sheets.has(id) && !this.interest.has(id) && !(this.wanted?.has(id) ?? false)) return Promise.resolve();
    const run = async () => {
      try {
        const have = this.sheets.get(id);
        const fresh = await this.buildSheet(id, tier, true);
        if (!fresh) return;
        // téléversement GPU maintenant, hors de l'image où la planche sera dessinée pour la première fois
        if (this.uploader) for (const t of fresh.ownPages ?? []) this.uploader(t.source);
        this.sheets.set(id, fresh);
        this.provisional.delete(id);
        this.interest.delete(id);
        if (have) this.doomed.push({ s: have, at: performance.now() + 1500 });
        this.epoch++;
        this.reap();
      } catch (e) {
        console.warn(`Planche D2 ${id} illisible après génération :`, e);
      }
      // une mise en place par image : la suivante attend l'image d'animation suivante
      await new Promise<void>((r) => {
        const t = setTimeout(r, 100);
        requestAnimationFrame(() => {
          clearTimeout(t);
          r();
        });
      });
    };
    const p = this.swapChain.then(run, run);
    this.swapChain = p.catch(() => undefined);
    return p;
  }

  /** Mode local : demi-résolution à utiliser pour afficher une carte (celle qui est disponible si le palier voulu ne peut plus être fabriqué) */
  mapLow(id: string, wantLow: boolean): boolean {
    if (D2_MODE !== 'local') return wantLow;
    return d2Local.mapTierFor(id, wantLow ? 'lo' : 'hi') === 'lo';
  }

  /** Détruit les anciennes planches remplacées à chaud, une fois que les vues ont eu le temps d'adopter la nouvelle */
  private reap(): void {
    const now = performance.now();
    const keep: typeof this.doomed = [];
    for (const d of this.doomed) {
      if (d.at <= now) this.destroySheet(d.s);
      else keep.push(d);
    }
    this.doomed = keep;
    if (keep.length) setTimeout(() => this.reap(), 600);
  }

  /** Rappel du rendu : remplace par une texture vide les sprites encore posés sur les textures qui vont être détruites (planche remplacée à chaud) */
  onBeforeDestroy: ((sources: Set<unknown>) => void) | null = null;

  private destroySheet(s: Sheet, sweep = true): void {
    if (sweep && this.onBeforeDestroy) {
      const src = new Set<unknown>();
      for (const f of s.frames.values()) src.add(f.tex.source);
      for (const f of s.shadows.values()) src.add(f.tex.source);
      this.onBeforeDestroy(src);
    }
    for (const f of s.frames.values()) f.tex.destroy(false);
    for (const f of s.shadows.values()) f.tex.destroy(false);
    for (const url of s.pageUrls) void Assets.unload(url);
    for (const t of s.ownPages ?? []) t.destroy(true);
  }

  /** Mémoire de textures estimée (octets) d'un ensemble de planches, d'après le manifeste (palier voulu de chacune) */
  estimateGpu(ids: Iterable<string>): number {
    let n = 0;
    for (const id of ids) n += this.cost(id, this.tierOf.get(id) ?? this.tier);
    return n;
  }

  /**
   * Mode local sans repli : fabrique tout ce que les étapes demandent AVANT le départ, dans l'ordre des étapes, et signale la progression.
   * Tout est mis en file d'un coup (priorité « zone », ordre d'arrivée = ordre des étapes) mais par fenêtre bornée, donc la mémoire reste
   * bornée et une annulation (`ctl.cancelled`) retire ce qui n'est pas encore parti. Renvoie les éléments impossibles à fabriquer.
   */
  async prepareLocal(stages: PrepStage[], onUpdate: (p: PrepProgress) => void, ctl: { cancelled: boolean } = { cancelled: false }): Promise<{ missing: string[]; total: number }> {
    const items: PrepItem[] = stages.flatMap((s) => s.items);
    const missing: string[] = [];
    if (D2_MODE !== 'local' || !items.length) return { missing, total: items.length };
    const t0 = performance.now();
    const done = new Set<string>();
    const sheetIds = items.filter((i) => i.kind === 'sheet' && this.has(i.id)).map((i) => i.id);
    // paliers décidés une fois (budget de textures) : on fabrique le palier qui sera réellement chargé
    this.planTiers(new Set(sheetIds));
    const slow = d2LocalModest() ? 4 : 1;
    const tick = (): void => onUpdate(prepProgress(stages, done, performance.now() - t0, slow));
    tick();
    const one = async (it: PrepItem): Promise<void> => {
      let ok = true;
      try {
        if (it.kind === 'sheet') {
          const tier = this.tierOf.get(it.id) ?? this.tier;
          // pas d'équivalent D2 : le sprite du jeu reste (signalé par originalUsed au chargement)
          if (this.d2.has(it.id) && !d2Local.isReady(it.id, tier)) {
            if (tier === 'hi' && d2Local.bestTier(it.id, 'hi') === 'lo') {
              // déjà généré en économe (ancien réglage « Auto ») : utilisable tout de suite, la haute résolution arrive en arrière-plan et remplace à chaud
              void d2Local.request(it.id, 'hi', PRIO.background);
            } else ok = await d2Local.request(it.id, tier, PRIO.zone);
          }
        } else if (it.kind === 'extra') {
          if (!d2Local.isReady(it.id, 'lo')) ok = await d2Local.request(it.id, 'lo', PRIO.zone);
        } else if (it.kind === 'map') {
          ok = await d2Local.requestMap(it.id, { tier: it.tier ?? this.tier, prio: PRIO.zone, data: it.dataOnly });
        } else if (it.run) {
          ok = await it.run();
        }
      } catch {
        ok = false;
      }
      // une seule nouvelle tentative automatique avant de signaler l'échec (mémoire momentanément saturée, lecture interrompue…)
      if (!ok && !ctl.cancelled && it.kind !== 'sound' && d2Local.hasFailed(it.kind === 'map' ? `map:${it.id}` : it.id)) {
        const key = it.kind === 'map' ? `map:${it.id}` : it.id;
        d2Local.clearFailed([key]);
        try {
          if (it.kind === 'sheet') ok = await d2Local.request(it.id, this.tierOf.get(it.id) ?? this.tier, PRIO.zone);
          else if (it.kind === 'extra') ok = await d2Local.request(it.id, 'lo', PRIO.zone);
          else if (it.kind === 'map') ok = await d2Local.requestMap(it.id, { tier: it.tier ?? this.tier, prio: PRIO.zone, data: it.dataOnly });
        } catch {
          ok = false;
        }
      }
      if (!ok && !ctl.cancelled) missing.push(`${it.kind}:${it.id}`);
      done.add(`${it.kind}:${it.id}`);
      tick();
    };
    let next = 0;
    const lanes = Math.max(2, d2Local.poolSize + 1);
    await Promise.all(
      Array.from({ length: lanes }, async () => {
        while (next < items.length && !ctl.cancelled) await one(items[next++]);
      }),
    );
    if (ctl.cancelled) d2Local.cancelIds(new Set(items.filter((i) => i.kind !== 'sound').map((i) => (i.kind === 'map' ? `map:${i.id}` : i.id))));
    tick();
    return { missing, total: items.length };
  }

  /** Demande de planche D2 de la zone (sheetOf, appelé à chaque image) : file sans attendre */
  private wantLocal(id: string): void {
    this.interest.add(id);
    d2Local.want(id, this.tierOf.get(id) ?? this.tier, PRIO.near);
  }

  /** Demande le mot de passe et prépare la clé ; false si absent, incorrect ou indisponible */
  private async unlockD2(): Promise<boolean> {
    const r = await fetch(`${this.base}d2/index.json`);
    if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) return false;
    const index = (await r.json()) as D2Index;
    this.d2Ver = index.ver ? `?v=${index.ver}` : '';
    // fichier témoin introuvable (404, page HTML d'un serveur) : pas de demande de mot de passe, qui serait toujours jugé faux
    const vr = await fetch(`${this.base}d2/${index.verify}${this.d2Ver}`);
    if (!vr.ok || (vr.headers.get('content-type') ?? '').includes('text/html')) return false;
    const verify = new Uint8Array(await vr.arrayBuffer());
    // mot de passe faux : redemandé tant que le joueur n'a pas choisi l'import de ses fichiers (pas de jeu sans les graphismes)
    for (let attempt = 0; ; attempt++) {
      const pw = await askPassword(attempt > 0);
      if (!pw) return false;
      const key = await deriveKey(pw, index.salt, index.iterations);
      if (await checkKey(key, verify)) {
        try {
          localStorage.setItem(D2_PASS_KEY, pw);
        } catch {
          /* stockage indisponible : le mot de passe sera redemandé */
        }
        this.d2Key = key;
        return true;
      }
      try {
        localStorage.removeItem(D2_PASS_KEY);
      } catch {
        /* ignoré */
      }
    }
  }

  /** Octets d'un fichier importé (déchiffrés si besoin) */
  private async d2Bytes(path: string, wait = false): Promise<Uint8Array> {
    if (D2_MODE === 'local') {
      // cartes DS1 (phase 5) : générées par carte, les images à l'entrée de la zone, les données en arrière-plan (ou attendues pour une campagne)
      if (path.startsWith('maps/')) {
        const m = await d2Local.readMap(path, this.tier, wait);
        if (!m) throw new Error(`d2-local/${path} : absent`);
        return m;
      }
      // sons : décodés à la demande depuis les archives audio du joueur (facultatives), sinon le moteur garde ses sons d'origine
      if (path.startsWith('audio/') && path !== 'audio/npc-text.json') {
        const a = await d2Local.readAudio(path);
        if (!a) throw new Error(`d2-local/${path} : absent`);
        return a;
      }
      const b = await localRead(path);
      if (!b) {
        // lot d'interface / d'icônes pas encore généré : demandé en priorité, les appelants gardent leur repli et se relancent à l'arrivée
        const extra = extraOfPath(path);
        if (extra) void d2Local.request(extra, this.tier, PRIO.player);
        throw new Error(`d2-local/${path} : absent`);
      }
      return b;
    }
    const enc = D2_MODE === 'enc';
    const r = await fetch(`${this.base}d2/${path}${enc ? `.enc${this.d2Ver}` : ''}`, enc ? undefined : { cache: 'no-cache' });
    if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) throw new Error(`d2/${path} : HTTP ${r.status}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    return enc ? decryptBytes(this.d2Key!, buf) : buf;
  }

  /** Lecture d'un fichier importé quelconque (sons, musique) : déchiffré si besoin ; null s'il n'y a pas d'import ou pas de fichier */
  async d2Read(path: string): Promise<Uint8Array | null> {
    return this.d2ReadMode(path, false);
  }

  /**
   * Plage d'octets d'un fichier importé (un son d'un paquet) : seulement en mode local, où chaque son est décodé séparément ;
   * null ailleurs (le moteur lit alors le paquet entier).
   */
  async d2ReadRange(path: string, range: [number, number]): Promise<Uint8Array | null> {
    if (D2_MODE !== 'local') return null;
    try {
      return await d2Local.readAudio(path, range);
    } catch {
      return null;
    }
  }

  /** Comme `d2Read`, mais en mode local attend la génération des données d'une carte (chargement d'une campagne, avec progression) */
  d2ReadWait(path: string): Promise<Uint8Array | null> {
    return this.d2ReadMode(path, true);
  }

  private async d2ReadMode(path: string, wait: boolean): Promise<Uint8Array | null> {
    if (D2_MODE === 'off' || (D2_MODE === 'enc' && !this.d2Key) || (D2_MODE === 'plain' && !this.d2.size && !d2Info.imported)) return null;
    try {
      return await this.d2Bytes(path, wait);
    } catch {
      return null;
    }
  }

  /** Adresse absolue d'un fichier importé (clé du cache hors ligne) */
  rawUrl(path: string): string {
    if (D2_MODE === 'local') return new URL(`d2-local/${path}`, new URL('./', location.href)).href;
    const enc = D2_MODE === 'enc';
    return new URL(`${this.base}d2/${path}${enc ? `.enc${this.d2Ver}` : ''}`, location.href).href;
  }

  /** Empreinte `?v=…` du dossier chiffré (vide hors mode chiffré) : invalide la comptabilité des packs */
  get d2Version(): string {
    return this.d2Ver;
  }

  /**
   * Tire un fichier importé et s'assure qu'il est gardé pour le hors ligne (cache D2, voir d2cache.ts).
   * Renvoie 1 si le fichier est disponible, 0 s'il n'existe pas (404) ; lève une erreur sur échec réseau ou quota plein.
   */
  async prefetchRaw(path: string): Promise<number> {
    if (D2_MODE === 'off' || D2_MODE === 'local' || (D2_MODE === 'enc' && !this.d2Key)) return 0;
    const enc = D2_MODE === 'enc';
    const url = this.rawUrl(path);
    if (enc && cacheAvailable() && (await isCached(url))) return 1;
    const r = await fetch(url);
    if (r.status === 404) return 0;
    if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) throw new Error(`d2/${path} : HTTP ${r.status}`);
    // le service worker range le fichier pendant le téléchargement ; sans lui (premier lancement), on le fait ici
    const copy = enc && cacheAvailable() ? r.clone() : null;
    await r.arrayBuffer();
    if (copy && !(await isCached(url))) {
      if ((await storeFile(url, copy)) === 'quota') throw new QuotaError();
    }
    return 1;
  }

  /** Chemins des fichiers d'une planche importée (JSON puis pages) au palier courant ; vide si elle n'est pas importée */
  async sheetPaths(id: string): Promise<string[]> {
    if (!this.d2.has(id)) return [];
    const tier = this.tierOf.get(id) ?? this.tier;
    const json = JSON.parse(new TextDecoder().decode(await this.d2Bytes(`${tier}/${id}.json`))) as { pages: { file: string }[]; shadowPages?: { file: string; w: number; h: number }[] };
    return [`${tier}/${id}.json`, ...[...json.pages, ...(json.shadowPages?.filter((x) => x.w > 0 && x.h > 0) ?? [])].map((p) => `${tier}/${p.file}`)];
  }

  /** true si la planche vient de l'import D2 */
  isImported(id: string): boolean {
    return this.d2.has(id);
  }

  /**
   * Planche d'un monstre : l'import peut fournir une planche au nom du monstre (modèle propre dans D2) alors que
   * le jeu partage une planche entre plusieurs monstres ; sans elle, la planche commune du jeu.
   */
  sheetOf(monsterId: string, sprite: string): string {
    if (!this.d2.has(monsterId)) {
      if (D2_MODE === 'local' && !this.d2.has(sprite)) this.originalUsed.set(sprite, 'no-d2');
      return sprite;
    }
    if (D2_MODE !== 'local') return monsterId;
    // sans repli : la planche D2 est toujours celle du monstre ; pas encore prête → rien n'est dessiné, elle est générée en priorité haute
    const tier = this.tierOf.get(monsterId) ?? this.tier;
    if (d2Local.bestTier(monsterId, tier)) {
      if (!d2Local.isReady(monsterId, tier)) this.wantLocal(monsterId);
    } else this.wantLocal(monsterId);
    return monsterId;
  }

  /** Abandonne la version importée d'une planche illisible : retour au sprite d'origine */
  private revertToOriginal(id: string): void {
    this.d2.delete(id);
    if (!this.manifest) return;
    if (this.original[id]) this.manifest.sheets[id] = this.original[id];
    else delete this.manifest.sheets[id]; // planche propre à l'import : le monstre reprend la planche commune
    if (this.originalTiles[id]) this.manifest.tiles[id] = this.originalTiles[id];
    else delete this.manifest.tiles[id]; // sol propre à une zone : le sol générique reprend
  }

  has(id: string): boolean {
    return !!this.manifest && (id in this.manifest.sheets || id in this.manifest.tiles);
  }

  get(id: string): Sheet | undefined {
    return this.sheets.get(id);
  }

  /** Mémoire GPU occupée par les planches chargées (octets) */
  gpuBytes(): number {
    let n = 0;
    for (const s of this.sheets.values()) n += s.gpuBytes;
    return n;
  }

  loadedIds(): string[] {
    return [...this.sheets.keys()];
  }

  load(id: string): Promise<Sheet | null> {
    const have = this.sheets.get(id);
    if (have) return Promise.resolve(have);
    const pending = this.loading.get(id);
    if (pending) return pending;
    const p = this.doLoad(id)
      .catch(async (e) => {
        if (this.d2.has(id)) {
          console.warn(`Planche D2 ${id} illisible, sprite d'origine utilisé :`, e);
          this.revertToOriginal(id);
          return this.doLoad(id).catch(() => null);
        }
        // une planche illisible ne doit jamais bloquer le jeu : elle est ignorée et signalée
        console.warn(`Planche ${id} illisible :`, e);
        return null;
      })
      .finally(() => this.loading.delete(id));
    this.loading.set(id, p);
    return p;
  }

  private async doLoad(id: string): Promise<Sheet | null> {
    if (!this.has(id)) return null;
    const want = this.tierOf.get(id) ?? this.tier;
    let sheet: Sheet | null;
    if (D2_MODE === 'local' && this.d2.has(id)) {
      let blocking = false;
      let best = d2Local.bestTier(id, want);
      if (best !== want) {
        // planche D2 pas prête au palier voulu : demandée ; le sol et le décor (construits une fois) sont attendus, le reste garde son sprite d'origine
        this.interest.add(id);
        const p = d2Local.request(id, want, this.prioOf(id, PRIO.near));
        blocking = isBlockingId(id);
        if (best === null && blocking) {
          await p;
          best = d2Local.bestTier(id, want);
        }
      }
      if (best === null) {
        const failed = d2Local.hasFailed(id);
        if (failed) this.revertToOriginal(id);
        // pièce d'équipement, effet : aucun original, la planche apparaît à son arrivée
        if (!this.original[id] && !this.originalTiles[id]) return null;
        // sans repli : un monstre, un objet pas encore prêt n'est pas dessiné (il apparaît à son arrivée, générée en priorité haute) ;
        // l'original ne sert que si la génération a échoué, ou pour le sol et le décor (construits une fois) qui n'ont pu être fabriqués
        if (!failed && !blocking) return null;
        this.originalUsed.set(id, failed ? 'failed' : 'blocking');
        this.provisional.add(id);
        sheet = await this.buildSheet(id, want, false);
      } else sheet = await this.buildSheet(id, best, true);
    } else sheet = await this.buildSheet(id, want, this.d2.has(id));
    if (sheet) this.sheets.set(id, sheet);
    return sheet;
  }

  /** Lit une planche (JSON puis pages) au palier donné : `fromD2` = fichiers importés / générés, sinon sprite d'origine du jeu */
  private async buildSheet(id: string, tier: Tier, fromD2: boolean): Promise<Sheet | null> {
    const dir = `${this.base}${fromD2 ? 'd2' : 'sprites'}/${tier}/`;
    // enc et local : octets lus puis (déchiffrés) décodés en mémoire, jamais servis par une URL
    const encrypted = fromD2 && (D2_MODE === 'enc' || D2_MODE === 'local');
    const json = encrypted ? (JSON.parse(new TextDecoder().decode(await this.d2Bytes(`${tier}/${id}.json`))) as SheetJson) : await fetchJson<SheetJson>(`${dir}${id}.json`);
    const own: Texture[] = [];
    const pageTex: Texture[] = [];
    const pageUrls: string[] = [];
    let gpu = 0;
    const loadPage = async (p: { file: string; w: number; h: number }): Promise<Texture> => {
      const url = `${dir}${p.file}`;
      let t: Texture;
      if (encrypted) {
        // planche chiffrée : déchiffrée en mémoire puis décodée, jamais servie en clair
        const bytes = await this.d2Bytes(`${tier}/${p.file}`);
        t = Texture.from(await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' })));
        own.push(t);
      } else {
        t = (await Assets.load(url)) as Texture;
        pageUrls.push(url);
      }
      setNearest(t.source);
      gpu += p.w * p.h * 4;
      return t;
    };
    // pages d'une planche (et ses ombres) en parallèle : un aller-retour réseau de moins par page, l'ordre est conservé
    const loadPages = (pages: { file: string; w: number; h: number }[]) => Promise.all(pages.map(loadPage));
    // page d'ombre vide (0 × 0 px, décor sans ombre) : ignorée, elle ne se décode pas
    const shadowPages = json.shadowPages?.filter((p) => p.w > 0 && p.h > 0);
    const [mainTex, shadowTex] = await Promise.all([loadPages(json.pages), shadowPages?.length ? loadPages(shadowPages) : Promise.resolve([] as Texture[])]);
    pageTex.push(...mainTex);
    const mk = (pages: Texture[], rects: Record<string, number[]>) => {
      const m = new Map<string, FrameTex>();
      for (const [name, r] of Object.entries(rects)) {
        const [pg, x, y, w, h, ax, ay, behind, flip] = r;
        if (pg < 0) continue;
        const tex = new Texture({ source: pages[pg].source, frame: new Rectangle(x, y, w, h) });
        m.set(name, behind === 1 ? { tex, ax, ay, behind: true } : flip === 1 ? { tex, ax, ay, flip: true } : { tex, ax, ay });
      }
      return m;
    };
    const sheet: Sheet = {
      id,
      kind: json.kind,
      dirs: json.dirs ?? 1,
      scale: json.scale,
      shadowScale: json.shadowScale ?? json.scale / 2,
      tileSize: json.tileSize,
      blend: json.blend,
      anims: json.anims ?? {},
      frames: mk(pageTex, json.frames),
      shadows: json.shadows && shadowTex.length ? mk(shadowTex, json.shadows) : new Map(),
      pageUrls,
      ownPages: own,
      gpuBytes: gpu,
    };
    return sheet;
  }

  /** Charge un ensemble et libère tout le reste (chargement zone par zone) */
  async setActive(ids: string[], onProgress?: (done: number, total: number) => void, prio: number = PRIO.near): Promise<void> {
    const want = new Set(ids.filter((i) => this.has(i)));
    this.wanted = want;
    if (D2_MODE === 'local') for (const id of want) this.reqPrio.set(id, Math.min(this.reqPrio.get(id) ?? prio, prio));
    for (const id of [...this.sheets.keys()]) if (!want.has(id)) this.unload(id);
    this.planTiers(want);
    // progression honnête : pondérée par la taille des textures (une grosse planche de monstre pèse des dizaines de
    // petits décors), sinon la barre atteint 90 % avec les petites planches puis attend les grosses
    const list = [...want];
    const weight = (id: string) => 1 + this.cost(id, this.tierOf.get(id) ?? this.tier) / 65536;
    const total = list.reduce((a, id) => a + weight(id), 0);
    let done = 0;
    await Promise.all(
      list.map(async (id) => {
        await this.load(id);
        // arrivée tardive d'une planche devenue inutile (zone changée entre-temps) : libérée tout de suite
        if (this.wanted && !this.wanted.has(id)) this.unload(id);
        done += weight(id);
        onProgress?.(done, total);
      }),
    );
  }

  /** Dernier ensemble demandé à `setActive` : sert à libérer les planches arrivées après un changement de zone */
  private wanted: Set<string> | null = null;

  /** Mémoire de textures d'une planche au palier donné (octets) d'après le manifeste */
  private cost(id: string, tier: Tier): number {
    const e = this.manifest?.sheets[id] ?? this.manifest?.tiles[id];
    return e?.[tier].gpu ?? 0;
  }

  /**
   * Budget de textures : si l'ensemble demandé dépasse `budget` au palier courant, les planches pas encore chargées qui gagneraient le plus
   * passent en basse résolution (moitié de la taille des images, quart de la mémoire) jusqu'à rentrer dans le budget.
   */
  private planTiers(want: Set<string>): void {
    if (!this.budget || this.tier === 'lo') return;
    let total = 0;
    const movable: { id: string; save: number }[] = [];
    for (const id of want) {
      const loaded = this.sheets.get(id);
      const cur: Tier = this.tierOf.get(id) ?? this.tier;
      total += this.cost(id, cur);
      if (!loaded && cur === 'hi') movable.push({ id, save: this.cost(id, 'hi') - this.cost(id, 'lo') });
    }
    movable.sort((a, b) => b.save - a.save);
    for (const m of movable) {
      if (total <= this.budget) break;
      this.tierOf.set(m.id, 'lo');
      total -= m.save;
    }
  }

  unload(id: string): void {
    const s = this.sheets.get(id);
    if (!s) return;
    // mode local : les planches sont remplacées à chaud en cours de zone, des sprites peuvent encore y être posés
    this.destroySheet(s, D2_MODE === 'local');
    this.sheets.delete(id);
    this.provisional.delete(id);
  }

  /** Change de palier de qualité : recharge les mêmes planches dans l'autre résolution */
  async setTier(tier: Tier): Promise<void> {
    if (tier === this.tier) return;
    // chargements en cours (ancien palier) terminés d'abord : sinon une planche arrive APRÈS la libération,
    // à l'ancien palier, et l'ensemble (corps, jambes, armes) se retrouve mélangé ou incomplet
    await Promise.allSettled([...this.loading.values()]);
    if (tier === this.tier) return;
    this.tierOf.clear();
    const ids = [...this.sheets.keys()];
    for (const id of ids) this.unload(id);
    this.tier = tier;
    await Promise.all(ids.map((id) => this.load(id)));
  }
}

function setNearest(src: TextureSource): void {
  src.scaleMode = 'nearest';
}

/**
 * Lecture d'un fichier JSON du jeu : statut et type vérifiés (une page HTML renvoyée à la place
 * — réseau coupé, version déployée entre-temps — n'est jamais parsée), trois essais espacés.
 */
async function fetchJson<T>(url: string, tries = 3): Promise<T> {
  let last: unknown = null;
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url);
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
      if (type.includes('text/html')) throw new Error(`${url} : page HTML reçue au lieu de données`);
      return (await r.json()) as T;
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 400 * 2 ** k));
    }
  }
  throw new Error(`Données du jeu inaccessibles (connexion ?) — ${(last as Error)?.message ?? last}`);
}
