/**
 * Rendu Pixi du monde. FRONTIÈRE : ce module lit l'état de la simulation et ses événements,
 * il ne modifie JAMAIS rien dans la simulation. Un rendu Three.js pourrait le remplacer en
 * implémentant la même interface (voir docs/ARCHITECTURE.md).
 */
import { Application, BitmapFont, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { ImageFilter } from './image-filter';
import { imageFilterSupported, type RenderEngine } from './engine';
import { gradeIsNeutral, isIdentity, type ImageParams } from './image-quality';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/events';
import type { Monster } from '../sim/actors';
import { lerp } from '../core/math';
import { Rng } from '../core/rng';
import { PRIO } from '../platform/d2local-core';
import { planPrep, type PrepItem, type PrepProgress, type PrepStage } from '../platform/d2local-prep';
import { SpriteBank, type Sheet, type Tier } from './assets';
import { loadGroundItems } from './d2ground';
import { D2MapView, mapBytes, mapFiles, prefetchMap } from './d2map';
import { d2Map, type D2MapData } from '../data/d2map';
import { FxPlayer } from './fx';
import { buildGround } from './ground';
import { K, isoX, isoY, screenToWorld } from './iso';
import type { ClassId } from '../data/classes';
import type { SeamDef, ZoneDef } from '../data/zone-types';
import type { PrepGroups } from '../platform/d2local-prep';
import {
  updateBuffFxImpl,
  drawPetFxImpl,
  updateD2BuffFxImpl,
  updateMercAuraFxImpl,
  updateCurseFxImpl,
  updateAreaFxImpl,
  spawnParticleImpl,
  burstImpl,
  updateParticlesImpl,
  addFloaterImpl,
  updateFloatersImpl,
  addBeamImpl,
  addLightningImpl,
  updateBoltsImpl,
  addRingImpl,
  updateBeamsAndRingsImpl,
  onEventImpl,
  flashLightImpl,
} from './renderer-fx';
import {
  updateItemsImpl,
  buildDecorImpl,
  buildHeraldImpl,
  updateHeraldImpl,
  updateDecorImpl,
  updateObjectsImpl,
  updateMissilesImpl,
  updateAreasImpl,
  updateOcclusionImpl,
  updatePlayerGhostImpl,
  renderLightsImpl,
  drawCollisionsImpl,
} from './renderer-world';
import { groundRank, dressDecorImpl, dressNeighboursImpl, dressZoneImpl, seamSwapImpl, showNeighbourImpl, type Dressing } from './renderer-seams';
import { syncPartsImpl, setFrameImpl, updateActorsImpl, placeActorImpl, depthWithPropsImpl, classSheetsChangedImpl } from './renderer-actors';
import { sheetsForImpl, prefetchZoneImpl, planZoneAssetsImpl, prepGroupsImpl } from './renderer-assets';
import { type LightCandidate } from './dynamic-light';
import type { DynamicLight } from '../sim/save';
import { discTex, sparkTex } from './textures';
import { safeLimits, ViewPool, type RenderLimits, type ViewRect } from './budget';
import { BASE_RENDER_LIMITS } from '../mods/rules';
import {
  C_STEP,
  QUALITY_PRESETS,
  classSheets,
  PROCEDURAL_PETS,
  actorSheet,
  stagedRun,
  type RenderQuality,
  type ActorView,
  type Particle,
  type Floater,
  type Bolt,
  type Beam,
  type Ring,
} from './renderer-shared';
export { QUALITY_PRESETS, itemColor, objectSheets, type RenderQuality } from './renderer-shared';
export type { Monster };

/**
 * Rendu Pixi du monde (voir l'en-tête du module). API utilisée par l'application : `init`, `setZone` / `clearZone`, `render` (une image),
 * `resize`, conversions écran ↔ monde, qualité et filtre d'image, mesures. Les autres méthodes délèguent aux modules `renderer-*.ts`.
 */
/** What a zone's loading is doing (lot 305: the loading screen names it) */
export type ZoneStep = 'sheets' | 'map' | 'scene';

export class GameRenderer {
  app!: Application;
  bank: SpriteBank;
  quality: RenderQuality = QUALITY_PRESETS.high;
  private scene = new Container();
  private root = new Container();
  groundLayer = new Container();
  /** Marks on the ground (blood; lot 305: the elites' rings, renderer-actors.ts) */
  decalLayer = new Container();
  shadowLayer = new Container();
  entityLayer = new Container();
  /** Silhouette du joueur par-dessus le décor qui le cache (lisibilité façon D2R) */
  ghostLayer = new Container();
  playerGhost: Sprite | null = null;
  playerOccluded = false;
  lightLayer = new Container();
  lightSprite!: Sprite;
  lightRT!: RenderTexture;
  fxLayer = new Container();
  textLayer = new Container();
  private groundNode: Container | null = null;
  /** Carte de ville de Diablo II (Harrogath, Tristram) quand la zone en a une */
  mapView: D2MapView | null = null;
  /** La carte D2 de la zone est dessinée (faux : zone sans carte importée, ou chargement échoué) */
  mapLoaded(): boolean {
    return !!this.mapView;
  }
  /**
   * Lot 311: the maps of the zones joined edge to edge to this one (`ZoneDef.seams`), their part near the edge drawn beyond it; kept
   * across the zone change at a seam (the neighbour becomes the zone, the zone a neighbour: nothing read again, no black)
   */
  neighbours: { id: string; view: D2MapView }[] = [];
  /** Lot 311: the seams are drawn (rule `world.seams`, given by the application before `setZone`) */
  seamsOn = true;
  /**
   * Lot 311: the next `setZone` follows a crossing at a seam (set by the application, taken by `setZone`): the maps on screen are kept
   * for it. Any other `setZone` (another zone, the quality or the texture tier changed) loads its maps anew
   */
  seamSwap = false;
  /** Lot 311: the last `setZone`'s map: taken from the scene before (`reused`) and its rest loaded after (ms of the whole, measures) */
  lastZoneMap: { reused: boolean; ms: number } = { reused: false, ms: 0 };
  actorViews = new Map<number, ActorView>();
  /**
   * Drawing caps of the current frame (rule `render.limits`, given by the application) and the rectangle drawn (scene coordinates, set by
   * `cull`): actors outside are hidden and not animated. Pools: a monster's body and shadow, a projectile's sprite, a damage number,
   * reused instead of destroyed and created again (lot 284: a hundred monsters coming and dying, their projectiles)
   */
  limits: RenderLimits = { ...BASE_RENDER_LIMITS };
  viewRect: ViewRect | null = null;
  actorPool = new ViewPool<{ body: Sprite; shadow: Sprite }>(128, (v) => {
    v.body.destroy();
    v.shadow.destroy();
  });
  missilePool = new ViewPool<Sprite>(96, (s) => s.destroy());
  floaterPool = new ViewPool<Floater['t']>(48, (t) => t.destroy());
  /** Reused between frames (no allocation per frame): actors seen, death ticks of the corpses, projectile identifiers */
  seenActors = new Set<number>();
  corpseKeys: number[] = [];
  missileKeys: number[] = [];
  itemViews = new Map<number, { s: Sprite; img?: Sprite; beam?: Sprite; halo?: Sprite; drop: number; color: number; hl?: boolean }>();
  itemFilterVersion = -1;
  /** Dernière réévaluation des planches (tick, runs à vagues) */
  waveSheets = 0;
  objectViews = new Map<number, { s: Sprite; shadow?: Sprite; fx?: Sprite; sheet?: Sheet; born?: number; ids?: string[]; epoch?: number; base?: Sheet }>();
  propViews: {
    s: Sprite;
    shadow?: Sprite;
    rect: [number, number, number, number];
    occluder: boolean;
    key: number;
    alpha: number;
    light?: { x: number; y: number; radius: number; color: number; intensity: number; flicker: number };
    /** Lot 312: the D2 map it dresses (its decor, its zone's props and lights), the zone's or a neighbour's: moved at a seam's crossing */
    map?: string;
    /** Lot 312: a structure of the zone's own map (`mapView.structures`), taken out when the map becomes a neighbour's */
    struct?: true;
  }[] = [];
  /** Décor posé des cartes D2 : image fixe ou boucle (flammes), déphasée par instance */
  /** Baal sur son trône (Trône de la Destruction) : décoratif, il appelle les vagues */
  herald: { s: Sprite; sheet: Sheet; x: number; y: number; callUntil: number; born: number } | null = null;
  decorViews: { s: Sprite; sheet: Sheet; phase: number; id?: string }[] = [];
  missileViews = new Map<number, Sprite>();
  /** Planche d'effet D2 des missiles qui en ont une */
  missileFx = new WeakMap<Sprite, Sheet>();
  fx!: FxPlayer;
  /** Overlays D2 des sorts persistants du joueur (auras, armures, boucliers) */
  buffFx = new Map<string, ReturnType<FxPlayer['spawn']>>();
  /** Effets D2 attachés aux zones (mur de feu, blizzard, foyers) */
  areaFx = new Map<number, { plays: ReturnType<FxPlayer['spawn']>[]; next: number }>();
  areaViews = new Map<number, { s: Sprite; t: number }>();
  particles: Particle[] = [];
  particlePool: Sprite[] = [];
  floaters: Floater[] = [];
  beams: Beam[] = [];
  bolts: Bolt[] = [];
  rings: Ring[] = [];
  lightPool: Sprite[] = [];
  lightUsed = 0;
  zoneId = '';
  camX = 0;
  camY = 0;
  zoom = 1;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  rng = new Rng('render');
  time = 0;
  /** Dimensions de l'écran en px CSS */
  width = 1;
  height = 1;
  ambient = { color: 0x303040, level: 0.3 };
  /** Rayon de lumière du joueur (unités) */
  lightRadius = 6.5;
  /** Réglage « Luminosité » : part de lumière ajoutée à l'ambiance et rayon du personnage */
  lighting: 'clair' | 'penombre' | 'd2' = 'penombre';
  /** Éclairage dynamique effectif (réglage après rétrogradation par la garde de performance) ; off = chemin d'origine, aucun pixel changé */
  dynLight: DynamicLight = 'off';
  /** Lumières dynamiques actives à la dernière image (diagnostic, tests) */
  dynLightsUsed = 0;
  edgeSprite: Sprite | null = null;
  lightCands: LightCandidate[] = [];
  worldRef: World | null = null;
  /** Compte à rebours (s) avant la prochaine vérification des planches de la classe (armure, forme, mercenaire) */
  private bankEpoch = 0;
  private sheetCheck = 0;
  private sheetScan = 0;

  /** `bank` : banque de sprites déjà initialisée (le dossier D2 est déverrouillé avant l'écran de sélection) */
  constructor(base: string, tier: Tier, bank?: SpriteBank) {
    this.bank = bank ?? new SpriteBank(base, tier);
    this.bank.tier = tier;
  }

  /** Moteur réellement utilisé (WebGL, ou WebGPU quand l'initialisation a réussi) */
  engine: RenderEngine = 'webgl';
  /** Texte de l'échec de WebGPU quand il était demandé et que le rendu est revenu sur WebGL (null = aucun) */
  engineFailure: string | null = null;
  /** Appelé si l'appareil WebGPU est perdu en cours de partie (le prochain lancement retombe sur WebGL) */
  onEngineLost: ((reason: string) => void) | null = null;

  /** Crée l'application Pixi dans `canvasParent` avec le moteur demandé (repli WebGL si WebGPU échoue) et la qualité donnée */
  async init(canvasParent: HTMLElement, quality: RenderQuality, wanted: RenderEngine = 'webgl'): Promise<void> {
    this.quality = quality;
    const opts = {
      resizeTo: canvasParent,
      background: 0x000000,
      antialias: false,
      autoDensity: true,
      resolution: quality.resolution,
      powerPreference: 'high-performance' as const,
      roundPixels: true,
    };
    this.engine = 'webgl';
    this.engineFailure = null;
    if (wanted === 'webgpu') {
      // WebGPU expérimental : Pixi essaie WebGPU puis retombe seul sur WebGL ; une exception reprend aussi le chemin WebGL d'origine
      try {
        const app = new Application();
        await app.init({ ...opts, preference: 'webgpu' });
        if (app.renderer.name === 'webgpu') {
          this.app = app;
          this.engine = 'webgpu';
        } else {
          this.engineFailure = 'WebGPU indisponible (repli WebGL par Pixi)';
          app.destroy(true, { children: true });
        }
      } catch (e) {
        this.engineFailure = `WebGPU : ${e instanceof Error ? e.message : String(e)}`;
      }
      if (this.engine === 'webgpu') {
        try {
          const dev = (
            this.app.renderer as unknown as { gpu?: { device?: { lost?: Promise<{ message?: string }>; addEventListener?: (t: string, f: (e: { error?: { message?: string } }) => void) => void } } }
          ).gpu?.device;
          void dev?.lost?.then((info) => this.onEngineLost?.(info?.message ?? 'appareil WebGPU perdu'));
          // première erreur de validation non capturée (pipeline ou ressource invalide) : le rendu WebGPU est suspect, WebGL au prochain lancement
          let errs = 0;
          dev?.addEventListener?.('uncapturederror', (ev) => {
            if (errs++ === 0) this.onEngineLost?.(`erreur WebGPU : ${ev.error?.message ?? 'inconnue'}`.slice(0, 160));
          });
        } catch {
          /* sans surveillance : sans conséquence */
        }
      }
    }
    if (this.engine === 'webgl') {
      this.app = new Application();
      await this.app.init({ ...opts, preference: 'webgl' });
    }
    canvasParent.appendChild(this.app.canvas);
    this.app.ticker.stop(); // la boucle est pilotée par le jeu
    this.bank.onBeforeDestroy = (sources) => this.sweepTextures(sources);
    this.bank.uploader = (src) => {
      try {
        (this.app.renderer.texture as unknown as { initSource?: (s: unknown) => void }).initSource?.(src);
      } catch {
        /* téléversement différé à la première utilisation */
      }
    };
    await this.bank.init();
    await loadGroundItems((p) => this.bank.d2Read(p));
    this.root.addChild(this.groundLayer, this.decalLayer, this.shadowLayer, this.entityLayer, this.ghostLayer);
    this.shadowLayer.alpha = 0.55;
    this.entityLayer.sortableChildren = true;
    // lot 312: the D2 maps' ground in a fixed order (`groundRank`): where two maps overlap at a seam, the same one on top on both sides
    this.groundLayer.sortableChildren = true;
    // la scène (monde, lumière, effets) est dans un conteneur à part : le filtre « Qualité d'image » ne touche pas les chiffres de dégâts
    this.app.stage.addChild(this.scene);
    this.scene.addChild(this.root);
    this.lightRT = RenderTexture.create({ width: 256, height: 256, resolution: 1 });
    this.lightSprite = new Sprite(this.lightRT);
    this.lightSprite.blendMode = 'multiply';
    this.scene.addChild(this.lightSprite);
    this.fxLayer.blendMode = 'add';
    this.root2().addChild(this.fxLayer);
    this.fx = new FxPlayer(this.bank, this.fxLayer, this.entityLayer);
    this.fx.setCap(Math.round(40 + 100 * quality.particles));
    this.app.stage.addChild(this.textLayer);
    BitmapFont.install({
      name: 'dmg',
      style: { fontFamily: 'Georgia, serif', fontSize: 18, fill: 0xffffff, stroke: { color: 0x000000, width: 4 }, fontWeight: 'bold' },
      chars: [['0', '9'], '+', '-', ' ', 'I', 'm', 'u', 'n', 'i', 's', 'é', 'R', 'a', 't', 'B', 'l', 'o', 'q', 'N', 'v', 'e', 'x', '!'],
    });
    this.resize();
  }

  /** Conteneur des effets additifs, placé au-dessus de la carte de lumière et suivant la caméra */
  private fxRoot: Container | null = null;
  private root2(): Container {
    if (!this.fxRoot) {
      this.fxRoot = new Container();
      this.scene.addChild(this.fxRoot);
    }
    return this.fxRoot;
  }

  /** Moteur Pixi actif */
  get renderer(): Renderer {
    return this.app.renderer;
  }

  /** Filtre « Qualité d'image » monté sur la scène, absent tant que tout est neutre */
  private imageFilter: ImageFilter | null = null;
  private imageParams: ImageParams | null = null;
  /** Comparaison : rendu sans filtre pendant l'appui */
  private imageBypass = false;
  private imageKey = '';
  /** Filtre actuellement monté ? (tests, mesures) */
  get imageFilterMounted(): boolean {
    return !!this.scene.filters && (this.scene.filters as unknown[]).length > 0;
  }

  /** Applique (ou retire, si neutre ou null) le filtre plein écran sur la scène du jeu ; le HUD, les panneaux (DOM) et les chiffres de dégâts ne sont jamais touchés */
  setImageFilter(p: ImageParams | null, bypass = this.imageBypass): void {
    this.imageParams = p;
    this.imageBypass = bypass;
    const scene = this.scene;
    // le filtre est écrit en GLSL : sous WebGPU il n'est jamais monté (la scène est rendue directement)
    if (!p || bypass || isIdentity(p) || !imageFilterSupported(this.engine)) {
      if (scene.filters) scene.filters = [];
      scene.filterArea = undefined;
      this.imageKey = '';
      return;
    }
    const res = this.app.renderer.resolution;
    // mise à l'échelle : la scène est rendue à la résolution native de l'art (1 pixel = 1 texel : 1 unité en palier hi, 2 en lo),
    // puis agrandie par le shader jusqu'à l'écran (comme D2GL). Normale : rendu direct à la résolution de l'écran.
    const upt = this.bank.tier === 'lo' ? 2 : 1;
    const fres = p.scale > 0 ? Math.min(res, Math.max(0.25, 1 / (this.zoom * upt))) : res;
    if (!this.imageFilter) this.imageFilter = new ImageFilter(fres);
    this.imageFilter.resolution = fres;
    this.imageFilter.set(p, !gradeIsNeutral(p), res / fres);
    this.imageKey = `${p.scale}|${this.zoom}|${this.bank.tier}|${res}|${this.width}|${this.height}`;
    // zone fixe = l'écran : évite le calcul des bornes de toute la scène à chaque image
    scene.filterArea = new Rectangle(0, 0, this.width, this.height);
    if (scene.filters?.[0] !== this.imageFilter) scene.filters = [this.imageFilter];
  }

  /** Le zoom, le palier ou la taille ont changé : la résolution native du filtre est à recalculer */
  private refreshImageFilter(): void {
    if (!this.imageParams || !this.imageKey || this.imageParams.scale === 0) return;
    const key = `${this.imageParams.scale}|${this.zoom}|${this.bank.tier}|${this.app.renderer.resolution}|${this.width}|${this.height}`;
    if (key !== this.imageKey) this.setImageFilter(this.imageParams);
  }

  /** Recalcule la taille de la vue (pixels CSS) et des cibles de rendu après un changement de taille de la fenêtre */
  resize(): void {
    // Pixi v8 : `screen` est en pixels CSS quelle que soit la résolution. `width / resolution`
    // divisait une seconde fois en qualité haute (résolution 2) : caméra et éclairage calculés
    // pour un écran deux fois plus petit, personnage en haut à gauche (retour téléphone)
    const r = this.app.renderer;
    this.width = r.screen.width;
    this.height = r.screen.height;
    const lw = Math.max(64, Math.ceil(this.width / 2));
    const lh = Math.max(64, Math.ceil(this.height / 2));
    // a new light map when the size changes (lot 287): the one resized in place kept its former frame, a phone turned from portrait to
    // landscape had the darkness only over the former width (the rest of the screen at full light)
    if (this.lightRT.width !== lw || this.lightRT.height !== lh) {
      const old = this.lightRT;
      this.lightRT = RenderTexture.create({ width: lw, height: lh, resolution: 1 });
      this.lightSprite.texture = this.lightRT;
      old.destroy(true);
    }
    this.lightSprite.width = this.width;
    this.lightSprite.height = this.height;
    if (this.imageParams && this.scene.filterArea) this.setImageFilter(this.imageParams);
  }

  /** Planches de sprites nécessaires au monde `w` (`core` : seulement celles du joueur et de la ville) */
  sheetsFor(w: World, core = false): string[] {
    return sheetsForImpl.call(this, w, core);
  }

  /** Sprites encore posés sur des textures sur le point d'être détruites : texture vide (chaque vue reprend la sienne à l'image suivante) */
  private sweepTextures(sources: Set<unknown>): void {
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        const t = (ch as unknown as { texture?: Texture }).texture;
        if (t && sources.has(t.source)) (ch as unknown as { texture: Texture }).texture = Texture.EMPTY;
        if (ch.children?.length) walk(ch as Container);
      }
    };
    walk(this.app.stage);
  }

  /** Images des objets au sol : relues quand le lot d'icônes vient d'être généré (mode local) */
  async reloadGroundItems(): Promise<void> {
    await loadGroundItems((p) => this.bank.d2Read(p));
  }

  /** Précharge en arrière-plan les planches d'une zone à venir */
  prefetchZone(z: ZoneDef): void {
    return prefetchZoneImpl.call(this, z);
  }

  /** Half resolution for a D2 map (its part `view` seen, lot 301) when the whole would not hold in the device's texture budget */
  mapLowFor(dm: D2MapData, view?: readonly [number, number, number, number]): boolean {
    return this.bank.mapLow(dm.id, this.bank.tier === 'lo' || (this.bank.budget > 0 && mapBytes(dm, false, view) + this.bank.gpuBytes() > this.bank.budget * 1.15));
  }

  /**
   * The next zone's D2 map decoded ahead (lot 301, a game mode naming its next zone, rule `game.nextZone`): its part seen only, one file
   * at a time during the current zone, taken by `setZone` (src/render/d2map.ts `prefetchMap`)
   */
  prefetchMap(z: ZoneDef): void {
    const dm = z.d2Map ? d2Map(z.d2Map.id) : undefined;
    if (!dm || !z.d2Map?.view) return;
    prefetchMap((p) => this.bank.d2Read(p), dm, this.mapLowFor(dm, z.d2Map.view), z.d2Map.view);
  }

  /** Planches et carte D2 qu'une zone demandera à cette classe (préparation du mode graphismes locaux) */
  planZoneAssets(z: ZoneDef, classId: ClassId): { sheets: string[]; map?: string } {
    return planZoneAssetsImpl.call(this, z, classId);
  }

  /** Ressources à préparer pour le monde, regroupées par catégorie (écran de préparation, palier `lo` si `low`) */
  prepGroups(w: World, low: boolean): PrepGroups {
    return prepGroupsImpl.call(this, w, low);
  }

  /** Espèces de la distribution complète de la zone en préparation (sons) */
  rosterIds = new Set<string>();
  /** Préparation en cours (mode local) : annulée si une autre zone commence ou si le joueur quitte */
  private prepCtl: { cancelled: boolean } | null = null;
  /** Demi-résolution décidée pour la carte de la zone en préparation (mode local) */
  private zoneLow: boolean | null = null;

  /** Annule la préparation en cours (le joueur a quitté la zone) : ce qui n'est pas encore parti est retiré de la file */
  cancelPrep(): void {
    if (this.prepCtl) this.prepCtl.cancelled = true;
  }

  /**
   * Charge la zone du monde `w` : planches, carte D2, sol, décor ; `onProgress` et `prep` suivent la préparation. Lot 305 (owner: "the bar
   * sticks at the end and lasts long"): `onProgress(done, total, step)` weighs the sheets AND the D2 map's files by their texture bytes (the
   * map was outside the bar: 17 MB of the Blood Moor after 0.5 MB of sheets, the bar still at 95 %), `step` naming what loads.
   * `noMap`: the zone is never seen (a game mode's screen covers it, rule `render.zoneHidden`): its D2 map is not built
   */
  async setZone(
    w: World,
    onProgress?: (d: number, t: number, step?: ZoneStep) => void,
    prep?: { sounds?: (monsterIds: string[]) => PrepItem[]; onStage: (p: PrepProgress, stages: PrepStage[]) => void },
    noMap = false,
  ): Promise<{ missing: string[] }> {
    this.cancelPrep();
    this.zoneLow = null;
    const missing: string[] = [];
    const tz0 = performance.now();
    // lot 311: the maps on screen (the zone's and its neighbours') kept out of the clearing: the next zone may be one of them
    const swap = this.seamSwap;
    this.seamSwap = false;
    const spare = this.detachMaps();
    if (!swap) {
      for (const v of spare.values()) v.dispose();
      spare.clear();
    }
    this.clearZone();
    this.zoneId = w.zone.id;
    this.worldRef = w;
    this.sheetScan = 0;
    this.waveSheets = w.tick;
    performance.mark('set:0');
    // d'abord le nécessaire au départ (la barre le reflète fidèlement), le reste en arrière-plan pendant le jeu
    this.bank.beginZone();
    this.bank.setPlayerSheets(classSheets(w, this.bank));
    const core = this.sheetsFor(w, true);
    performance.mark('set:ids');
    if (this.bank.strict && prep) {
      // sans repli : tout ce qui est affiché vient des fichiers du joueur, on attend qu'il soit prêt, dans l'ordre où c'est nécessaire
      const dm0 = w.zone.d2Map ? d2Map(w.zone.d2Map.id) : undefined;
      if (dm0) this.zoneLow = this.bank.mapLow(dm0.id, this.bank.tier === 'lo' || (this.bank.budget > 0 && mapBytes(dm0, false) + this.bank.estimateGpu(core) > this.bank.budget * 1.15));
      const groups = this.prepGroups(w, this.zoneLow ?? false);
      const extra = prep.sounds?.([...this.rosterIds]) ?? [];
      groups.sounds = [...(groups.sounds ?? []), ...extra];
      const stages = planPrep(groups);
      const ctl = { cancelled: false };
      this.prepCtl = ctl;
      const r = await this.bank.prepareLocal(stages, (p) => prep.onStage(p, stages), ctl);
      if (ctl.cancelled) return { missing: [] };
      missing.push(...r.missing);
    }
    // lot 305: the sheets and the map's files on one bar, by their texture bytes (64 KiB a unit, `setActive`'s own)
    const dm = !noMap && w.zone.d2Map ? d2Map(w.zone.d2Map.id) : undefined;
    const seen0 = w.zone.d2Map?.view;
    const sheetW = core.length + this.bank.estimateGpu(core) / 65536;
    const low0 = dm ? (this.zoneLow ?? this.mapLowFor(dm, seen0)) : false;
    const mapW = dm ? mapFiles(dm, low0, seen0).length + mapBytes(dm, low0, seen0) / 65536 : 0;
    const total = Math.max(1, sheetW + mapW);
    onProgress?.(0, total, 'sheets');
    await this.bank.setActive(core, (d, t) => onProgress?.((sheetW * d) / Math.max(1, t), total, 'sheets'), PRIO.near);
    performance.mark('set:sheets');
    this.bankEpoch = this.bank.epoch;
    void this.bank.setActive(this.sheetsFor(w), undefined, PRIO.zoneRest);
    this.ambient = w.zone.ambient;
    this.ambientFade = null;
    if (dm) onProgress?.(sheetW, total, 'map');
    if (dm) {
      // carte de Diablo II : sol et structures importés, à la place du sol et du décor du jeu
      let view = new D2MapView((p) => this.bank.d2Read(p));
      // pleine résolution seulement si l'ensemble tient à peu près dans le budget de textures de l'appareil
      const seen = w.zone.d2Map?.view;
      const low = this.zoneLow ?? this.mapLowFor(dm, seen);
      const hidden = w.zone.d2Map?.hidden;
      const onFile = (d: number, t: number) => onProgress?.(sheetW + (mapW * d) / Math.max(1, t), total, 'map');
      // lot 311: the zone walked into at a seam was drawn as a neighbour: its view taken as it is (its part near the edge), the rest of
      // the map loaded behind the play
      const kept = spare.get(dm.id);
      let built = false;
      // lot 314: kept when it leaves out the same structures (the trees a campaign zone thins out, its neighbours' views built with them)
      if (kept && (kept.hiddenList ?? null) === (hidden?.length ? hidden : null)) {
        spare.delete(dm.id);
        view = kept;
        view.cullStructures = false;
        view.setOffset(0, 0);
        view.attach(this.groundLayer, this.entityLayer, false);
        built = true;
        this.lastZoneMap.reused = true;
        const epoch = view;
        void view.extend(seen).then((added) => {
          if (this.mapView !== epoch) return;
          for (const st of added) this.propViews.push({ s: st.s, rect: [0, 0, 0, 0], occluder: false, key: st.key, alpha: 1, struct: true });
          this.lastZoneMap.ms = performance.now() - tz0;
        });
      } else {
        this.lastZoneMap.reused = false;
        built = await view.build(dm, low, this.groundLayer, this.entityLayer, hidden, seen, onFile);
        for (let again = 0; !built && again < 2; again++) {
          view.clear();
          built = await view.build(dm, low, this.groundLayer, this.entityLayer, hidden, seen, onFile);
        }
      }
      if (built) {
        this.mapView = view;
        for (const st of view.structures) this.propViews.push({ s: st.s, rect: [0, 0, 0, 0], occluder: false, key: st.key, alpha: 1, struct: true });
        view.ground.zIndex = groundRank(dm.id);
        this.buildDecor(dm.raw as { decor?: [string, number, number][] }, dm.id);
        this.buildHerald(w);
      }
    }
    performance.mark('set:mapview');
    onProgress?.(total, total, 'scene');
    if (!this.mapView) {
      this.groundNode = buildGround(w.zone, this.bank);
      this.groundLayer.addChild(this.groundNode);
    }
    performance.mark('set:ground');
    // sur une carte D2 seuls les décors posés en planche D2 (decor.ts) sont dessinés, jamais les modèles du jeu
    this.dressZone(w.zone, { x: 0, y: 0 });
    performance.mark('set:props');
    const p = w.player;
    this.camX = p.x;
    this.camY = p.y;
    // lot 311: the neighbours joined edge to edge, drawn beyond the edges (kept from the scene before, else loaded behind the play)
    this.showNeighbours(w, spare);
    performance.mark('set:end');
    return { missing };
  }

  /** Lot 311: the maps on screen taken out of the scene (by map id), the renderer's own references dropped */
  private detachMaps(): Map<string, D2MapView> {
    const out = new Map<string, D2MapView>();
    const all = [...this.neighbours.map((n) => n.view), ...(this.mapView ? [this.mapView] : [])];
    for (const v of all) {
      // (a view still loading keeps what it loads out of the scene until it is attached again)
      if (!v.map) {
        v.dispose();
        continue;
      }
      v.detach();
      out.get(v.map.id)?.dispose();
      out.set(v.map.id, v);
    }
    this.neighbours = [];
    this.mapView = null;
    return out;
  }

  /**
   * Lot 311: the seams' neighbours drawn: a view kept from the scene before (moved to its place, cut to its part near the edge) or a new
   * one loaded in the background, under the zone's own ground; the views left over freed
   */
  private showNeighbours(w: World, spare: Map<string, D2MapView>): void {
    const seams = this.seamsOn && this.mapView ? (w.zone.seams ?? []) : [];
    for (const s of seams) {
      const nm = d2Map(s.to);
      if (!nm) continue;
      const v = spare.get(s.to);
      if (v) {
        spare.delete(s.to);
        v.setOffset(s.at.x, s.at.y);
        v.trim(s.view);
        v.ground.zIndex = groundRank(s.to);
        v.attach(this.groundLayer, this.entityLayer, true);
        v.cullStructures = true;
        this.neighbours.push({ id: s.to, view: v });
        this.dressDecor(s.to, s.at, s.view);
      } else {
        // the resolution its own zone would load it at (taken as it is, whatever its resolution, when the hero walks into it)
        this.showNeighbour(s, this.mapLowFor(nm));
      }
    }
    for (const v of spare.values()) v.dispose();
    // lot 312: the neighbours' zones already built by the simulation: their props and lights
    this.dressNeighbours(w);
  }

  /** Lot 312: ms of the parts of the last crossing on the kept scene (measures, e2e) */
  swapParts: Record<string, number> = {};
  /** Lot 312: the light moving from one zone's to the next's after a crossing at a seam */
  ambientFade: { from: { color: number; level: number }; to: { color: number; level: number }; t: number } | null = null;
  /** Lot 312: the neighbours whose sheets were last made active */
  private linkSheets = '';
  /** Lot 312: some neighbour's structures still to be moved after a crossing (`D2MapView.flushOffset`) */
  flushViews = false;
  /** Lot 312: seconds before the next look at the neighbours to dress */
  private dressT = 0;
  /** Lot 312: what of each D2 map on screen is dressed (decor, its zone's props and lights), by map */
  dressings = new Map<string, Dressing>();

  /** Lot 312: a zone's props and lights at `off` (a neighbour's: within `limit`, its own coordinates) */
  dressZone(z: ZoneDef, off: { x: number; y: number }, limit?: readonly [number, number, number, number]): void {
    return dressZoneImpl.call(this, z, off, limit);
  }

  /** Lot 312: a D2 map's decor at `off` (within `limit`, its own coordinates) */
  dressDecor(mapId: string, off: { x: number; y: number }, limit?: readonly [number, number, number, number]): void {
    return dressDecorImpl.call(this, mapId, off, limit);
  }

  /** Lot 312: the neighbours' zones built by the simulation since: their props and lights */
  dressNeighbours(w: World): void {
    return dressNeighboursImpl.call(this, w);
  }

  /** Lot 312: a neighbour's map loaded beyond the edge in the background */
  showNeighbour(s: SeamDef, low: boolean, chunked = false): D2MapView | null {
    return showNeighbourImpl.call(this, s, low, chunked);
  }

  /**
   * Lot 312: the hero walked into the neighbour at a seam (`w`, coordinates moved by (dx, dy)): the scene kept and moved, no clearing, no
   * loading (src/render/renderer-seams.ts). False: the application loads the zone as any other
   */
  swapAtSeam(w: World, dx: number, dy: number): boolean {
    return seamSwapImpl.call(this, w, dx, dy);
  }

  /** Libère les éléments de la zone affichée (carte, effets, vues des acteurs) */
  clearZone(): void {
    this.mapView?.clear();
    this.mapView = null;
    for (const n of this.neighbours) n.view.dispose();
    this.neighbours = [];
    this.fx?.clear();
    this.areaFx.clear();
    this.buffFx.clear();
    this.mercFx.clear();
    this.aimDisc = null;
    this.aimLine = [];
    this.collGfx = null;
    for (const c of [this.groundLayer, this.decalLayer, this.shadowLayer, this.entityLayer, this.ghostLayer, this.fxLayer, this.textLayer]) {
      for (const ch of c.removeChildren()) ch.destroy({ children: true });
    }
    this.groundNode = null;
    this.playerGhost = null;
    // the pooled sprites were children of the layers just emptied (destroyed with them)
    this.actorPool.forget();
    this.missilePool.forget();
    this.floaterPool.forget();
    this.actorViews.clear();
    this.itemViews.clear();
    this.objectViews.clear();
    this.propViews = [];
    this.dressings.clear();
    this.decorViews = [];
    this.herald = null;
    this.missileViews.clear();
    this.areaViews.clear();
    this.particles = [];
    this.particlePool = [];
    this.floaters = [];
    for (const b of this.bolts) for (const g of b.g) g.destroy();
    this.bolts = [];
    this.beams = [];
    this.rings = [];
    // les sprites de lumière restent dans `lightLayer` : sans ce masquage ils s'additionnaient à leurs dernières positions dans la zone suivante
    for (const l of this.lightPool) l.visible = false;
    this.lightPool = [];
  }

  /* ------------------------------------------------------------------ */
  /* Caméra                                                              */
  /* ------------------------------------------------------------------ */

  worldToScreen(x: number, y: number, z = 0): { x: number; y: number } {
    return {
      x: (isoX(x, y) - isoX(this.camX, this.camY)) * this.zoom + this.width / 2 + this.shakeX,
      y: (isoY(x, y, z) - isoY(this.camX, this.camY)) * this.zoom + this.height / 2 + this.shakeY,
    };
  }

  /** Point du sol (z = 0) sous un point de l'écran */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const px = (sx - this.width / 2 - this.shakeX) / this.zoom + isoX(this.camX, this.camY);
    const py = (sy - this.height / 2 - this.shakeY) / this.zoom + isoY(this.camX, this.camY);
    return screenToWorld(px, py);
  }

  /** Secousse d'écran (cumulée, plafonnée à 12) */
  addShake(amount: number): void {
    this.shake = Math.min(12, this.shake + amount);
  }

  /* ------------------------------------------------------------------ */
  /* Boucle de rendu                                                     */
  /* ------------------------------------------------------------------ */

  render(w: World, alpha: number, dt: number, events: SimEvent[], opts: { shake: number; damageNumbers: boolean; limits?: Partial<RenderLimits> }): void {
    this.limits = opts.limits ? safeLimits(opts.limits, BASE_RENDER_LIMITS) : { ...BASE_RENDER_LIMITS };
    // runs par étapes : planches réévaluées chaque seconde (chargement de ce qui va apparaître,
    // libération de ce qui a disparu)
    if (w === this.worldRef && stagedRun(w) && w.tick - this.waveSheets >= 25) {
      this.waveSheets = w.tick;
      void this.bank.setActive(this.sheetsFor(w));
    }
    // Druide : forme ou créature apprise en cours de zone, mercenaire recruté → planche chargée à la volée
    // (ou planche importée abandonnée car illisible : le monstre reprend la planche commune du jeu)
    this.sheetCheck -= dt;
    this.sheetScan -= dt;
    // graphismes générés sur l'appareil (mode local) : une planche vient de remplacer le sprite d'origine → ensembles réévalués (au plus une fois par demi-seconde)
    const changed = this.bank.epoch !== this.bankEpoch && w === this.worldRef && this.sheetCheck <= 0.5;
    // planches de classe et vues sans planche : recherche coûteuse (chaînes, tous les monstres), une fois par seconde au plus, même quand rien ne manque
    let stale = false;
    if (!changed && w === this.worldRef && this.sheetCheck <= 0 && this.sheetScan <= 0) {
      this.sheetScan = 1;
      stale = this.classSheetsChanged(w) || this.missingSheetViews(w) > 0;
    }
    if (w === this.worldRef && this.sheetCheck <= 0 && (changed || stale)) {
      this.sheetCheck = changed ? 0.5 : 1;
      this.bankEpoch = this.bank.epoch;
      this.bank.setPlayerSheets(classSheets(w, this.bank));
      void this.bank.setActive(this.sheetsFor(w), undefined, PRIO.near);
    }
    if (w.zone.id !== this.zoneId) return;
    // lot 312: the structures of the map left at a seam moved to their new place a few hundred an image
    if (this.flushViews) {
      let left = false;
      for (const n of this.neighbours) if (n.view.flushOffset(400)) left = true;
      this.flushViews = left;
    }
    // lot 312: the light of a zone walked into at a seam reached over a second
    const af = this.ambientFade;
    if (af) {
      af.t = Math.min(1, af.t + dt);
      const mix = (a: number, b: number, sh: number) => Math.round(((a >> sh) & 255) * (1 - af.t) + ((b >> sh) & 255) * af.t) << sh;
      this.ambient = {
        color: mix(af.from.color, af.to.color, 16) | mix(af.from.color, af.to.color, 8) | mix(af.from.color, af.to.color, 0),
        level: af.from.level + (af.to.level - af.from.level) * af.t,
      };
      if (af.t >= 1) this.ambientFade = null;
    }
    // lot 312: the neighbours' zones built by the simulation meanwhile dressed (their props and lights beyond the seam)
    this.dressT -= dt;
    if (this.dressT <= 0) {
      this.dressT = 1;
      if (w.seamLinks?.length) this.dressNeighbours(w);
      // a neighbour built since (the simulation builds it ahead): its monsters' sheets loaded before they come into sight
      const key = (w.seamLinks ?? []).map((l) => l.world.zone.id).join(',');
      if (key !== this.linkSheets) {
        this.linkSheets = key;
        if (key) void this.bank.setActive(this.sheetsFor(w), undefined, PRIO.near);
      }
    }
    this.time += dt;
    this.drawCollisions(w);
    for (const e of events) this.onEvent(w, e, opts);
    const p = w.player;
    const px = lerp(p.px, p.x, alpha);
    const py = lerp(p.py, p.y, alpha);
    // caméra : suit le joueur sans à-coups
    const k = 1 - Math.exp(-dt * 14);
    this.camX += (px - this.camX) * k;
    this.camY += (py - this.camY) * k;
    if (Math.hypot(px - this.camX, py - this.camY) > 12) {
      this.camX = px;
      this.camY = py;
    }
    this.shake = Math.max(0, this.shake - dt * 30);
    const sh = this.shake * opts.shake;
    this.shakeX = sh ? (this.rng.next() - 0.5) * sh : 0;
    this.shakeY = sh ? (this.rng.next() - 0.5) * sh : 0;
    const ox = -isoX(this.camX, this.camY) * this.zoom + this.width / 2 + this.shakeX;
    const oy = -isoY(this.camX, this.camY) * this.zoom + this.height / 2 + this.shakeY;
    for (const c of [this.root, this.fxRoot!]) {
      c.position.set(Math.round(ox), Math.round(oy));
      c.scale.set(this.zoom);
    }
    if (!this.fxLayer.parent) this.fxRoot!.addChild(this.fxLayer);
    w.viewReach = this.viewReach();
    this.cull();
    this.updateActors(w, alpha);
    this.updateItems(w);
    this.updateObjects(w);
    this.updateDecor();
    this.updateHerald();
    this.updateMissiles(w, alpha);
    this.updateAreas(w, dt);
    this.updateAreaFx(w, dt);
    this.updateD2BuffFx(w, dt);
    this.updateCurseFx(w);
    this.fx.update(dt);
    this.updateOcclusion(px, py);
    this.updatePlayerGhost(w);
    this.updateParticles(dt);
    this.updateFloaters(dt);
    this.updateBeamsAndRings(dt);
    this.updateBolts(dt);
    this.renderLights(w, px, py);
    this.refreshImageFilter();
    this.app.renderer.render(this.app.stage);
  }

  /** Distance maximale (unités de monde) du centre au coin de l'écran, plus une marge : les monstres doivent apparaître hors champ */
  viewReach(): number {
    const a = this.width / (2 * this.zoom * C_STEP); // demi-largeur en x − y
    const b = this.height / (this.zoom * C_STEP); // demi-hauteur en x + y
    return Math.ceil(Math.sqrt((a * a + b * b) / 2)) + 4;
  }

  private cull(): void {
    const margin = 260;
    const x0 = (-this.root.position.x - margin) / this.zoom;
    const y0 = (-this.root.position.y - margin) / this.zoom;
    const x1 = x0 + (this.width + margin * 2) / this.zoom;
    const y1 = y0 + (this.height + margin * 2) / this.zoom;
    this.viewRect = { x0, y0, x1, y1 };
    this.mapView?.cull(x0, y0, x1, y1);
    for (const n of this.neighbours) n.view.cull(x0, y0, x1, y1);
    if (this.groundNode) {
      for (const s of this.groundNode.children) {
        s.visible = s.position.x > x0 - 200 && s.position.x < x1 + 200 && s.position.y > y0 - 120 && s.position.y < y1 + 120;
      }
    }
    for (const pv of this.propViews) {
      const v = pv.s.position.x > x0 - 300 && pv.s.position.x < x1 + 300 && pv.s.position.y > y0 - 200 && pv.s.position.y < y1 + 400;
      pv.s.visible = v;
      if (pv.shadow) pv.shadow.visible = v;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Acteurs                                                             */
  /* ------------------------------------------------------------------ */

  /** Les planches de la classe ont changé (forme, mercenaire, armure) : une manque ou une variante d'armure devenue inutile est encore chargée */
  classSheetsChanged(w: World): boolean {
    return classSheetsChangedImpl.call(this, w);
  }

  syncParts(v: ActorView, w: World): void {
    return syncPartsImpl.call(this, v, w);
  }

  getActorView(id: number, sheetId: string): ActorView {
    let v = this.actorViews.get(id);
    // planche chargée après la création de la vue (vague préchargée en retard) : on la reprend ;
    // planche libérée entre-temps : la vue redevient vide (jamais de texture détruite affichée)
    if (v && v.sheetId !== sheetId) {
      // changement de planche (forme du Druide) : la nouvelle si elle est chargée
      v.sheetId = sheetId;
      v.sheet = this.bank.get(sheetId) ?? null;
      v.lastAnim = '';
      if (!v.sheet) {
        v.body.texture = Texture.EMPTY;
        v.shadow.texture = Texture.EMPTY;
      }
    } else if (v && !v.sheet) v.sheet = this.bank.get(sheetId) ?? null;
    else if (v && v.sheet && this.bank.get(sheetId) && this.bank.get(sheetId) !== v.sheet) {
      // planche rechargée (autre palier de qualité) : la vue reprend la nouvelle, l'ancienne est détruite
      v.sheet = this.bank.get(sheetId) ?? null;
      v.lastAnim = '';
    } else if (v && v.sheet && !this.bank.get(sheetId)) {
      v.sheet = null;
      v.body.texture = Texture.EMPTY;
      v.shadow.texture = Texture.EMPTY;
    }
    if (!v) {
      const sheet = this.bank.get(sheetId) ?? null;
      const { body, shadow } = this.actorPool.take(
        () => {
          const pair = { body: new Sprite(Texture.EMPTY), shadow: new Sprite(Texture.EMPTY) };
          this.entityLayer.addChild(pair.body);
          this.shadowLayer.addChild(pair.shadow);
          return pair;
        },
        (pair) => {
          for (const sp of [pair.body, pair.shadow]) {
            sp.texture = Texture.EMPTY;
            sp.visible = true;
            sp.alpha = 1;
            sp.tint = 0xffffff;
            sp.rotation = 0;
            sp.scale.set(1);
            sp.anchor.set(0);
          }
        },
      );
      v = { body, shadow, sheet, sheetId, lastAnim: '' };
      this.actorViews.set(id, v);
    }
    return v;
  }

  /** An actor no longer drawn: its body and shadow go back to the pool (hidden), its aura, effects and parts are destroyed */
  releaseActorView(v: ActorView): void {
    v.aura?.destroy();
    v.mark?.destroy();
    v.label?.destroy();
    v.fx?.destroy();
    for (const ps of v.parts?.values() ?? []) ps.destroy();
    this.actorPool.give({ body: v.body, shadow: v.shadow }, (pair) => {
      pair.body.visible = false;
      pair.shadow.visible = false;
      pair.body.texture = Texture.EMPTY;
      pair.shadow.texture = Texture.EMPTY;
    });
  }

  /** Elites marked in the last image (lot 305, rule `render.eliteMarks`; measures: tools/e2e/survivals-305.mjs) */
  eliteMarkCount = 0;
  eliteMarks(): number {
    return this.eliteMarkCount;
  }

  /** Display objects made and reused since the start (measures: tools/e2e/survivals.mjs, `__arpg.renderer().poolStats()`) */
  poolStats(): Record<'actors' | 'missiles' | 'floaters', { made: number; reused: number; pooled: number }> {
    const one = (p: { made: number; reused: number; size: number }) => ({ made: p.made, reused: p.reused, pooled: p.size });
    return { actors: one(this.actorPool), missiles: one(this.missilePool), floaters: one(this.floaterPool) };
  }

  /**
   * Monstres vivants affichés sans planche et dont la planche n'est pas chargée (invisibles) :
   * doit rester à 0 (tests E2E). Une planche arrivée entre deux images est reprise à la suivante.
   */
  missingSheetViews(w: World): number {
    let n = 0;
    for (const m of w.monsters) {
      const v = this.actorViews.get(m.id);
      const sid = actorSheet(m, this.bank);
      if (!m.dead && v && !v.sheet && !PROCEDURAL_PETS.has(sid) && !this.bank.get(sid)) n++;
    }
    return n;
  }

  setFrame(v: ActorView, anim: string, dir: number, frame: number): void {
    return setFrameImpl.call(this, v, anim, dir, frame);
  }

  updateActors(w: World, alpha: number): void {
    return updateActorsImpl.call(this, w, alpha);
  }

  drawPetFx(w: World, v: ActorView, m: Monster, x: number, y: number): void {
    return drawPetFxImpl.call(this, w, v, m, x, y);
  }

  updateBuffFx(w: World): void {
    return updateBuffFxImpl.call(this, w);
  }

  placeActor(v: ActorView, x: number, y: number, scale: number): void {
    return placeActorImpl.call(this, v, x, y, scale);
  }

  depthWithProps(x: number, y: number): number {
    return depthWithPropsImpl.call(this, x, y);
  }

  updateOcclusion(px: number, py: number): void {
    return updateOcclusionImpl.call(this, px, py);
  }

  updatePlayerGhost(w: World): void {
    return updatePlayerGhostImpl.call(this, w);
  }

  /* ------------------------------------------------------------------ */
  /* Objets au sol, objets interactifs                                   */
  /* ------------------------------------------------------------------ */

  updateItems(w: World): void {
    return updateItemsImpl.call(this, w);
  }

  buildDecor(raw: { decor?: [string, number, number][] }, map?: string, off?: { x: number; y: number }, limit?: readonly [number, number, number, number], done?: Set<number>): void {
    return buildDecorImpl.call(this, raw, map, off, limit, done);
  }

  buildHerald(w: World): void {
    return buildHeraldImpl.call(this, w);
  }

  updateHerald(): void {
    return updateHeraldImpl.call(this);
  }

  updateDecor(): void {
    return updateDecorImpl.call(this);
  }

  updateObjects(w: World): void {
    return updateObjectsImpl.call(this, w);
  }

  /* ------------------------------------------------------------------ */
  /* Projectiles et zones                                                */
  /* ------------------------------------------------------------------ */

  updateMissiles(w: World, alpha: number): void {
    return updateMissilesImpl.call(this, w, alpha);
  }

  updateAreas(w: World, dt: number): void {
    return updateAreasImpl.call(this, w, dt);
  }

  updateD2BuffFx(w: World, dt: number): void {
    return updateD2BuffFxImpl.call(this, w, dt);
  }

  /** Auras du mercenaire : l'animation D2 de l'aura tourne sous lui (deux au plus, la principale d'abord), comme sous le joueur */
  mercFx = new Map<string, ReturnType<FxPlayer['spawn']>>();
  mercHaloT = 0;
  updateMercAuraFx(w: World, dt: number): void {
    return updateMercAuraFxImpl.call(this, w, dt);
  }
  haloBuf: Monster[] = [];

  /** Malédictions du Nécromancien : l'effet D2 de la malédiction tourne sur le monstre maudit tant qu'elle dure */
  curseFx = new Map<number, { id: string; play: ReturnType<FxPlayer['spawn']> }>();
  updateCurseFx(w: World): void {
    return updateCurseFxImpl.call(this, w);
  }

  updateAreaFx(w: World, dt: number): void {
    return updateAreaFxImpl.call(this, w, dt);
  }

  /* ------------------------------------------------------------------ */
  /* Particules et effets                                                 */
  /* ------------------------------------------------------------------ */

  spawnParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number, size: number, gravity: number, ground = false): void {
    return spawnParticleImpl.call(this, x, y, z, vx, vy, vz, life, color, size, gravity, ground);
  }

  burst(x: number, y: number, z: number, n: number, color: number, speed: number, life: number, size: number, up = 2): void {
    return burstImpl.call(this, x, y, z, n, color, speed, life, size, up);
  }

  updateParticles(dt: number): void {
    return updateParticlesImpl.call(this, dt);
  }

  addFloater(text: string, x: number, y: number, color: number, big = false): void {
    return addFloaterImpl.call(this, text, x, y, color, big);
  }

  updateFloaters(dt: number): void {
    return updateFloatersImpl.call(this, dt);
  }

  addBeam(points: number[], color: number, life: number, width: number, z = 1): void {
    return addBeamImpl.call(this, points, color, life, width, z);
  }

  /** Nombre d'éclairs de Sorcière en cours (tests) */
  lightningStats(): number {
    return this.bolts.length;
  }

  addLightning(points: number[], chain: boolean): void {
    return addLightningImpl.call(this, points, chain);
  }

  updateBolts(dt: number): void {
    return updateBoltsImpl.call(this, dt);
  }

  addRing(x: number, y: number, r0: number, r1: number, color: number, life: number): void {
    return addRingImpl.call(this, x, y, r0, r1, color, life);
  }

  updateBeamsAndRings(dt: number): void {
    return updateBeamsAndRingsImpl.call(this, dt);
  }

  /* ------------------------------------------------------------------ */
  /* Événements                                                          */
  /* ------------------------------------------------------------------ */

  onEvent(w: World, e: SimEvent, opts: { shake: number; damageNumbers: boolean }): void {
    return onEventImpl.call(this, w, e, opts);
  }

  /* ------------------------------------------------------------------ */
  /* Lumière                                                              */
  /* ------------------------------------------------------------------ */

  flashes: { x: number; y: number; r: number; color: number; life: number }[] = [];
  flashLight(x: number, y: number, r: number, color: number): void {
    return flashLightImpl.call(this, x, y, r, color);
  }

  renderLights(w: World, px: number, py: number): void {
    return renderLightsImpl.call(this, w, px, py);
  }

  /** Diagnostic : cases bloquées de la zone en losanges (Réglages, « Afficher les collisions ») */
  showCollisions = false;
  collGfx: Graphics | null = null;
  drawCollisions(w: World): void {
    return drawCollisionsImpl.call(this, w);
  }

  private aimDisc: Sprite | null = null;
  private aimLine: Sprite[] = [];
  /** Indicateur de visée au sol (demandé par la couche de contrôles, jamais par la simulation) */
  setAimIndicator(a: { x: number; y: number; r: number; color: number; line: boolean } | null): void {
    if (!this.aimDisc) {
      this.aimDisc = new Sprite(discTex());
      this.aimDisc.anchor.set(0.5);
      this.fxLayer.addChild(this.aimDisc);
      for (let i = 0; i < 8; i++) {
        const s = new Sprite(sparkTex());
        s.anchor.set(0.5);
        this.fxLayer.addChild(s);
        this.aimLine.push(s);
      }
    }
    if (!this.aimDisc.parent) this.fxLayer.addChild(this.aimDisc, ...this.aimLine);
    const vis = !!a;
    this.aimDisc.visible = vis;
    for (const s of this.aimLine) s.visible = vis && !!a?.line;
    if (!a || !this.worldRef) return;
    this.aimDisc.position.set(isoX(a.x, a.y), isoY(a.x, a.y));
    this.aimDisc.scale.set((Math.max(0.6, a.r) * 2 * K) / 256);
    this.aimDisc.tint = a.color;
    this.aimDisc.alpha = 0.8;
    const p = this.worldRef.player;
    this.aimLine.forEach((s, i) => {
      const t = (i + 1) / (this.aimLine.length + 1);
      const x = p.x + (a.x - p.x) * t;
      const y = p.y + (a.y - p.y) * t;
      s.position.set(isoX(x, y), isoY(x, y));
      s.tint = a.color;
      s.scale.set(0.5);
      s.alpha = 0.7;
    });
  }

  /** Position écran des objets au sol visibles (étiquettes de l'interface) */
  /** Alt maintenu (mode PC) : montre aussi les objets masqués par le filtre */
  revealAll = false;

  /** Positions écran des objets au sol affichés (étiquettes du HUD), selon le filtre de butin */
  groundItemScreens(w: World): { id: number; x: number; y: number }[] {
    const out: { id: number; x: number; y: number }[] = [];
    const reveal = w.character.filter.revealHidden || this.revealAll;
    for (const gi of w.items) {
      if (gi.show <= 0 && !reveal) continue;
      const p = this.worldToScreen(gi.x, gi.y);
      if (p.x < -50 || p.y < -50 || p.x > this.width + 50 || p.y > this.height + 50) continue;
      out.push({ id: gi.id, x: p.x, y: p.y });
    }
    return out;
  }

  /** Mémoire de textures estimée (octets) : planches chargées et carte de lumière */
  textureMemory(): number {
    return this.bank.gpuBytes() + this.lightRT.width * this.lightRT.height * 4;
  }

  /** Appels de dessin de la dernière image : non mesurés (toujours 0) */
  drawCalls(): number {
    return 0;
  }

  /** Détruit l'application Pixi et ses textures */
  destroy(): void {
    this.app.destroy(true);
  }

  /** Monde actuellement affiché */
  get world(): World | null {
    return this.worldRef;
  }
}
