/**
 * Application : boucle à pas fixe (25 Hz, indépendante de l'affichage, lui-même plafonné à
 * ~60 i/s), chargement zone par zone, paliers de qualité adaptatifs, pause et sauvegarde au
 * passage en arrière-plan, perte de contexte graphique, service worker.
 */
import type { Game } from './sim/game';
import type { SimEvent } from './sim/events';
import type { World } from './sim/world';
import type { GameRenderer, RenderQuality, ZoneStep } from './render/renderer';
import type { Hud } from './ui/hud';
import type { Tips } from './ui/tips';
import type { Panels } from './ui/panels';
import type { Controls } from './input/controls';
import type { AudioEngine, Haptics } from './platform/audio';
import { Sync } from './platform/sync';
import { installConflictDialog } from './ui/sync-ui';
import { appUpdate, SaveStore, enterFullscreenLandscape, keepAwake, lockBrowserGestures, registerServiceWorker, releaseAwake, setOrientationPolicy } from './platform/platform';
import type { BotBrain, BotOptions } from './sim/bot/brain';
import { el } from './ui/dom';
import { d2LoadingArt, loadD2Icons, loadD2Loading } from './ui/d2icons';
import { loadD2Ui } from './ui/d2ui';
import { hasRoomFor as hasRoom, recordPack, requestPersist } from './platform/d2cache';
import { exportErrorLog, onAlert, readErrorLog, reportError } from './platform/errorlog';
import { D2_SKIP_ALLOWED, SpriteBank, d2Info } from './render/assets';
import { PRIO, looksCorrupt } from './platform/d2local-core';
import { fmtEta, prepTitle, problemText, stageLabel, type PrepItem, type PrepKey, type PrepProgress, type PrepProblem, type PrepStage } from './platform/d2local-prep';
import { installControl } from './platform/install';
import { d2Local, d2LocalGenTier, d2LocalMapsEnabled, refreshStorageTight } from './platform/d2local';
import { buildPrepDiagnostic, missingAssetIds } from './ui/d2diag';
import { mountD2LocalBanner } from './ui/d2local-ui';
import { pickAndAddMpq } from './ui/d2recap-ui';
import { missingOf, requiredForAll } from './platform/d2requires';
import type { Settings } from './sim/save';
import { i18nReady, tr } from './i18n';
import { effectiveDynamicLight, sanitizeDynamicLight } from './render/dynamic-light';
import { chooseEngine, clearEngineFailure, engineStatus, readEngineFailure, recordEngineFailure, sanitizeEngine } from './render/engine';
import { PerfGuard, imageParams, nextQuickPreset, type ImageParams } from './render/image-quality';
import { InputModeStore, readCapabilities, watchCapabilities } from './input/mode';
import { CLASS_IDS, CLASSES, type ClassId } from './data/classes';
import { characterScreen, type ScreenMods } from './ui/charselect';
import { activeModIds, activeRuleset, BASE_RULESET, gameModes, playableRulesets, rulesetProblem, rulesetSwitch } from './mods/activate';
import { contributions, LevelUpGate, safely, type HudWidget, type UiHost, type UiScreen } from './mods/ui';
import { RULES } from './mods/rules';
import { applyHudHidden } from './ui/hud-parts';
import { launchMode, pendingCreate } from './platform/platform';
import { startMenuMusic } from './platform/music';
import { startStats, stats } from './platform/stats';

type QualityName = 'low' | 'medium' | 'high';

/**
 * Cœur du jeu (simulation, rendu, interface, données) : module séparé, chargé pendant l'affichage de l'écran de sélection
 * pour que le premier écran n'attende que le strict nécessaire.
 */
/** Version publique : constante de compilation (remplacée par vite), pour que le code de test (personnage d'essai) disparaisse du paquet public */
declare const __D2_PUBLIC__: boolean | undefined;
const IS_PUBLIC_BUILD = typeof __D2_PUBLIC__ !== 'undefined' && __D2_PUBLIC__ === true;

/** Attente sans fin pendant le rechargement de la page (changement de jeu de règles) */
const reloading = (): Promise<never> => new Promise<never>(() => undefined);
let G!: typeof import('./game-core');
let corePromise: Promise<void> | null = null;
function loadCore(): Promise<void> {
  corePromise ??= import('./game-core').then((m) => {
    G = m;
  });
  return corePromise;
}

/**
 * Shares of the start's loading bar (lot 305, measured on the dev server with the D2 graphics: the towns' maps 5.5 MB, Act I's maps 10 MB,
 * the first zone's sheets and map 10 to 20 MB): the towns' maps, the act's maps, the first zone
 */
const BOOT_BAR = { maps: [0.05, 0.3], act: [0.3, 0.55], zone: [0.55, 1] } as const;

/** The loading screen's line under the bar: the zone and what of it loads (lot 305) */
function zoneStepLabel(zone: string, step: ZoneStep): string {
  if (step === 'sheets') return `${zone} : personnages, monstres et effets`;
  return step === 'map' ? `${zone} : carte de la zone` : `${zone} : mise en place`;
}

/** Milliseconds a change of zone keeps the last image before its loading screen shows (lot 301) */
const LOADING_DELAY_MS = 400;
/** The same at a seam (lot 311): the neighbour already on screen, the image kept longer before a loading screen */
const SEAM_LOADING_DELAY_MS = 1500;

/** Lot 316: Diablo II's town healers (talking to one heals the hero, his poison and his mercenary) */
const HEALERS: Record<string, string> = { akara: 'Akara', fara: 'Fara', ormus: 'Ormus', jamella: 'Jamella', malah: 'Malah' };
export class App {
  game!: Game;
  /** Emplacement de sauvegarde du personnage en cours */
  private slot: string | null = null;
  renderer!: GameRenderer;
  hud!: Hud;
  private tips!: Tips;
  panels!: Panels;
  controls!: Controls;
  /** Mode de commandes (tactile / PC) : réglage + dernière entrée utilisée */
  readonly inputMode = new InputModeStore(readCapabilities());
  audio!: AudioEngine;
  haptics!: Haptics;
  private acc = 0;
  private last = 0;
  private lastRender = 0;
  private running = false;
  private paused = false;
  private loadingZone = false;
  /** Lot 311: ms the last change of zone at a seam kept the image (scene rebuilt), -1 after another change (measures, e2e) */
  seamMs = -1;
  private currentWorld: World | null = null;
  private pendingEvents: SimEvent[] = [];
  private qualityName: QualityName = 'high';
  private frameTimes: number[] = [];
  private perfWindowStart = 0;
  /** Mesure de fluidité suspendue jusque-là : un redimensionnement ou le plein écran fige quelques images sans que l'appareil soit lent */
  private perfHoldUntil = 0;
  private resizeTimer = 0;
  private badWindows = 0;
  private goodWindows = 0;
  private lastQualityChange = 0;
  private lastSave = 0;
  private fpsCount = 0;
  private fpsValue = 0;
  private fpsTime = 0;
  private contextLost = false;
  private loadingEl: HTMLElement | null = null;
  private hideInstallPill: () => void = () => undefined;
  /** Éléments du HUD ajoutés par les mods (point d'insertion `hud`) */
  private modWidgets: HudWidget[] = [];
  /** Level-up screens of the mods, one at a time (levels gained while a mod screen is open wait for it to close) */
  private levelUps = new LevelUpGate((level) => {
    for (const f of contributions('levelUp'))
      safely(
        () => f({ game: this.game, host: this.uiHost(), screen: this.uiScreen(), level }),
        undefined,
        (err) => reportError('mod (niveau)', err),
      );
  });
  /** Bot de jeu (hook de debug, bot tactile, mode benchmark) : remplace les contrôles */
  private botBrain: BotBrain | null = null;
  /** Accélération de la simulation (hook de debug, tests E2E) ; 1 en jeu */
  timeScale = new URLSearchParams(location.search).has('freeze') ? 0 : 1;
  /** Mesures exposées au bot et au mode benchmark */
  metrics = { frames: 0, renderMsSum: 0, worstFrame: 0, frameIntervals: [] as number[] };

  /** Mode benchmark (?bench=1) : scène fixe, aucune sauvegarde touchée */
  readonly bench = new URLSearchParams(location.search).has('bench');

  constructor(private readonly root: HTMLElement) {}

  /**
   * Personnage à jouer : écran de sélection / création à chaque lancement. Le benchmark, les
   * navigateurs pilotés (tests E2E) et `?class=` démarrent sans écran (dernier personnage joué,
   * ou le dernier de la classe demandée, sinon un nouveau).
   */
  private async chooseCharacter(): Promise<void> {
    if (this.bench) {
      await loadCore();
      this.game = new G.Game(undefined, 'sorceress', true);
      return;
    }
    const q = new URLSearchParams(location.search).get('class') as ClassId | null;
    const cls = q && CLASS_IDS.includes(q) ? q : null;
    if (navigator.webdriver || cls) {
      await loadCore();
      const slot = cls ? (SaveStore.list().find((c) => c.classId === cls)?.slot ?? null) : SaveStore.active();
      if (!this.useSlot(slot, cls ?? 'sorceress')) return reloading();
      return;
    }
    await this.ensureTestCharacter();
    // personnage créé avant le rechargement de la page qui a activé son jeu de règles
    const pending = pendingCreate.take();
    if (pending && pending.ruleset === activeRuleset()) {
      await loadCore();
      return this.createCharacter(pending.classId, pending.name, pending.variant);
    }
    const screen = characterScreen(
      this.root,
      () => SaveStore.list(),
      (slot) => SaveStore.clear(slot),
      this.screenMods(),
    );
    // le cœur du jeu se télécharge pendant que le joueur regarde l'écran de sélection
    void loadCore().catch(() => undefined);
    const choice = await screen;
    await loadCore();
    if ('play' in choice) {
      if (!this.useSlot(choice.play, 'sorceress')) return reloading();
      // `?testmerc=1` : équipe le mercenaire d'essai (Garde du désert, Infini…) sur le personnage choisi, sans toucher au reste
      if (!IS_PUBLIC_BUILD && /[?&]testmerc=1\b/.test(location.search)) {
        (await import('./sim/testchar')).equipTestMerc(this.game);
        this.saveNow();
        // à usage unique : le paramètre est retiré de l'adresse, un rechargement ne remplace pas le mercenaire une seconde fois
        try {
          const u = new URL(location.href);
          u.searchParams.delete('testmerc');
          history.replaceState(null, '', u.toString());
        } catch {
          /* adresse non modifiable : sans conséquence */
        }
      }
      return;
    }
    // un seul jeu de règles par session (src/mods) : un personnage d'un autre jeu de règles est créé après le rechargement qui active le sien
    const { classId, name, ruleset, variant } = choice.create;
    if (ruleset && rulesetSwitch(ruleset) === 'reload') {
      pendingCreate.set({ classId, name, ruleset, ...(variant ? { variant } : {}) });
      location.reload();
      return reloading();
    }
    this.createCharacter(classId, name, variant);
  }

  /** Jeux de règles et mods vus par l'écran de sélection : choix à la création, personnages grisés, boutons du menu */
  private screenMods(): ScreenMods {
    return {
      options: {
        // the Campaign is built on Diablo II's maps: without the player's files, Normal is only Harrogath and the endgame
        campaign: (d2Info.mode !== 'off' || d2Info.local) && !d2Info.locked,
        // the base game is named as the original at launch, next to the overhauls built on it
        contents: playableRulesets().map((r) => ({
          id: r.id,
          name: r.id === BASE_RULESET ? 'Diablo II (original)' : r.name,
          description: r.description,
          ...(r.tagline ? { tagline: r.tagline } : {}),
        })),
        modes: gameModes().map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          ...(m.tagline ? { tagline: m.tagline } : {}),
          rulesets: m.rulesets,
          ...(m.variants ? { variants: m.variants } : {}),
        })),
      },
      problem: rulesetProblem,
      menu: contributions('menu.buttons'),
      onError: (e) => reportError('mod (menu)', e),
      mode: activeRuleset() ?? undefined,
      // one ruleset per page session (src/mods): another mode is remembered, then the page reloads and opens its character list
      switchMode: (id) => {
        launchMode.set(id);
        if (rulesetSwitch(id) !== 'reload') return true;
        launchMode.openListAfterReload();
        location.reload();
        return false;
      },
      openList: launchMode.takeOpenList(),
      // lot 299: a mode's lines on the cards of its own characters (its milestones), the base's level and difficulty otherwise
      card: (c) => {
        if (c.ruleset !== activeRuleset()) return null;
        const ctx = { ruleset: c.ruleset, classId: c.classId, className: CLASSES[c.classId]?.name ?? '', level: c.level, difficulty: c.difficulty, milestones: c.milestones ?? {} };
        for (const f of contributions('charselect.card')) {
          const lines = safely(
            () => f(ctx),
            null,
            (e) => reportError('mod (carte)', e),
          );
          if (lines?.length) return lines;
        }
        return null;
      },
    };
  }

  /** Nouveau personnage du jeu de règles de la session : mêmes réglages que le dernier joué, état de départ des mods (`create.character`) */
  private createCharacter(classId: ClassId, name: string, variant?: string): void {
    const last = SaveStore.list()[0];
    const settings = last ? SaveStore.load(last.slot)?.settings : undefined;
    this.useSlot(null, classId);
    this.game.character.name = name;
    if (settings) {
      // réglages propres aux mods : seulement ceux du jeu de règles du nouveau personnage (celui de la session)
      const keep = new Set(activeModIds());
      const mods = settings.mods ? Object.fromEntries(Object.entries(settings.mods).filter(([m]) => keep.has(m))) : undefined;
      this.game.settings = G.withDefaultSettings({ ...settings, mods }, true);
      this.game.applyInventorySize();
      G.applyLootPreset(this.game.settings.lootRate);
    }
    for (const f of contributions('create.character'))
      safely(
        () => f({ game: this.game, ...(variant ? { variant } : {}) }),
        undefined,
        (e) => reportError('mod (création)', e),
      );
    this.saveNow();
  }

  /**
   * Sorcière de niveau 99 équipée pour parcourir tout le contenu : ajoutée une seule fois par appareil (en fin de liste, elle ne devient pas le
   * personnage par défaut) ; `?testchar=1` la recrée. Jamais pour les navigateurs pilotés ni le benchmark.
   */
  private async ensureTestCharacter(): Promise<void> {
    // version publique : aucun personnage préfabriqué (nouveau joueur = écran de création vide)
    if (IS_PUBLIC_BUILD) return;
    const FLAG = 'd2m.testchar.v1';
    const force = /[?&]testchar=1\b/.test(location.search);
    // navigateurs sans écran (tests de bout en bout) : jamais d'ajout automatique
    if (!force && /HeadlessChrome/.test(navigator.userAgent)) return;
    try {
      if (!force && localStorage.getItem(FLAG)) return;
      localStorage.setItem(FLAG, '1');
    } catch {
      return;
    }
    const T = await import('./sim/testchar');
    if (!force && SaveStore.list().some((c) => c.name === T.TEST_CHAR_NAME)) return;
    SaveStore.seed(T.buildTestSorceress(), SaveStore.newSlot());
  }

  /** Charge le personnage (ou en crée un) ; faux si la page se recharge pour activer le jeu de règles du personnage (rien d'autre à faire) */
  private useSlot(slot: string | null, cls: ClassId): boolean {
    const save = slot ? SaveStore.load(slot) : null;
    // un seul jeu de règles par session de page (src/mods) : un personnage d'un autre jeu de règles recharge la page, qui l'active au démarrage
    const sw = save ? rulesetSwitch(save.ruleset) : 'same';
    if (sw === 'unknown') throw new Error(`Ce personnage demande le jeu de règles « ${save!.ruleset} », absent de cette version : mettez l’application à jour`);
    if (sw === 'reload' && slot) {
      SaveStore.setActive(slot);
      // the character's ruleset becomes the launch mode (otherwise the remembered mode would be activated again at boot)
      launchMode.set(save!.ruleset);
      location.reload();
      return false;
    }
    this.slot = save && slot ? slot : SaveStore.newSlot();
    this.game = new G.Game(save ?? undefined, save?.character.classId ?? cls, true);
    // l'invite « tournez l'appareil » ne concerne que le jeu : les menus d'avant-partie se lisent en portrait
    document.documentElement.classList.add('in-game');
    this.applyOrientation();
    // l'application active les défauts de ramassage automatique (le module Game et les tests restent neutres)
    this.game.settings = G.withDefaultSettings(save?.settings, true);
    G.applyLootPreset(this.game.settings.lootRate);
    this.game.character.looseRunes = true;
    // coffre unique : copie de sauvegarde (une fois) puis fusion des pages personnelles dans le coffre partagé (celui du jeu de règles du personnage)
    const sharedSave = SaveStore.loadShared(this.game.ruleset);
    const hadPersonal = !!save && save.character.stash.slice(0, 4).some((t) => t.some((x) => x));
    if (hadPersonal && this.slot) SaveStore.backupBeforeStashMerge(this.slot, this.game.ruleset);
    this.game.attachShared(sharedSave);
    // tri ou envoi en lot du coffre : sauvegardé et synchronisé aussitôt (coffre partagé puis personnage)
    this.game.onStashOp = () => this.saveNow();
    if (this.game.stashMigration && this.slot) {
      // le coffre partagé d'abord : en cas d'interruption, aucun objet n'est perdu (le doublon personnel est écarté au prochain chargement)
      if (SaveStore.saveShared(this.game.sharedStash(), this.game.ruleset)) SaveStore.save(this.game.toSave(), this.slot);
    }
    SaveStore.setActive(this.slot);
    Sync.playing = this.slot;
    return true;
  }

  /** Retours de l'interface donnés aux mods (points d'insertion en jeu) */
  private uiHost(): UiHost {
    return {
      message: (t, color) => this.hud.message(t, color),
      haptic: (k) => (k === 'fail' ? (this.audio.fail(), this.haptics.vibrate(12)) : (this.audio.ui(), this.haptics.vibrate(8))),
      itemSound: (type) => this.audio.itemUi(type),
      openPanel: (name) => {
        // a vendor's stall as its NPC shows it (lot 316: renewed on a change of act, not at each visit)
        if (name === 'vendor') this.openVendor(null);
        else this.openPanel(name);
      },
      characterList: () => this.switchCharacter(),
      homeScreen: () => this.homeScreen(),
      loadActMaps: async (act) => {
        // the maps already loaded are skipped (no screen then): the loading screen shows from the first map to read
        let shown = false;
        try {
          await this.loadCampaignMaps(`a${act}`, (d, t) => {
            shown = true;
            this.showLoading('D2 Mobile', d / t, `Cartes de l’acte ${act} ${d} / ${t}`);
          });
        } finally {
          if (shown) this.hideLoading();
        }
      },
    };
  }

  /** Écran plein d'un mod : posé sur les panneaux, la partie en pause jusqu'à sa fermeture */
  private uiScreen(): UiScreen {
    return {
      open: (node) => {
        const wrap = el('div', { cls: 'mod-screen' }, node);
        (this.root.querySelector('#panels') as HTMLElement).append(wrap);
        this.paused = true;
        this.levelUps.screenOpened();
        this.controls.resetAll();
        return {
          close: () => {
            if (!wrap.isConnected) return;
            wrap.remove();
            if (this.levelUps.screensOpen <= 1) this.paused = false;
            // levels gained meanwhile: the next level-up screen (one at a time)
            this.levelUps.screenClosed();
          },
        };
      },
    };
  }

  /** Orientations the game is played in (rule `ui.orientation`): a game mode may allow portrait, which removes the "rotate" prompt */
  private applyOrientation(): void {
    const any = RULES['ui.orientation'](this.game) === 'any';
    document.documentElement.classList.toggle('any-orientation', any);
    setOrientationPolicy(any ? 'any' : 'landscape');
  }

  /** Retour à l'écran de sélection des personnages (sauvegarde puis relance) ; lot 298 : la liste du mode s'ouvre directement, sans l'accueil */
  switchCharacter(): void {
    this.saveNow();
    launchMode.openListAfterReload();
    location.reload();
  }

  /** Retour à l'écran d'accueil du jeu (les modes, les liens) : sauvegarde puis relance (lot 298) */
  homeScreen(): void {
    this.saveNow();
    location.reload();
  }

  async start(): Promise<void> {
    lockBrowserGestures();
    // fullscreen asked at the first touch of the menus already (lot 290, owner's Fold: asked at the first touch of the game, it resized the
    // screen as the run began); the screen's orientation is locked only once a game is on screen (`setOrientationPolicy`)
    window.addEventListener('pointerdown', () => void enterFullscreenLandscape(), { capture: true, passive: true, once: true });
    // statistiques anonymes (réglage « Statistiques anonymes d’utilisation », PRIVACY.md) : le ping d'ouverture dit « au menu », la partie lancée dit « en jeu »
    void import('./ui/changelog').then((m) => startStats(m.CHANGELOG[0].date)).catch(() => undefined);
    // service worker enregistré dès le départ (et non après le chargement) : sans lui Chrome ne propose pas l'installation, et un
    // écran de préparation bloqué empêchait l'enregistrement
    registerServiceWorker(
      // lot 290 (owner): a new version found on the home screen (no game running yet) is installed at once; never during a game (next
      // launch, or the player's request)
      () => !this.running,
      () => this.saveNow(),
    );
    // bouton « Install the app » discret sur les écrans d'avant-jeu (import, sélection de personnage) ; retiré quand la partie démarre
    const installPill = el('div', { cls: 'pwa-pill' }, installControl(true));
    document.body.append(installPill);
    this.hideInstallPill = () => installPill.remove();
    const stage = this.root.querySelector('#stage') as HTMLElement;
    const hudEl = this.root.querySelector('#hud') as HTMLElement;
    const panelsEl = this.root.querySelector('#panels') as HTMLElement;
    // dossier D2 déverrouillé d'abord (mot de passe) : l'écran de sélection utilise déjà ses images
    const boot = el('div', { cls: 'd2-boot', textContent: 'D2 Mobile — chargement…' });
    document.body.append(boot);
    const bank = new SpriteBank(import.meta.env.BASE_URL, 'lo');
    // graphismes générés à la demande (mode local) : l'interface et les icônes arrivent quand leur lot est prêt, le jeu démarre avec le repli
    d2Local.onExtra = (id) => {
      if (id === 'ui') void loadD2Ui((p) => bank.d2Read(p));
      else if (id === 'icons:items' || id === 'icons:skills') void loadD2Icons((p) => bank.d2Read(p), true);
      else if (id === 'icons:loading') void loadD2Loading((p) => bank.d2Read(p));
      else if (id === 'icons:ground') void this.renderer?.reloadGroundItems();
      else if (id === 'text:npc') this.audio?.reloadNpcText();
    };
    await Promise.all([bank.init(), i18nReady()]);
    // mode local, sans repli : l'interface et les icônes sont fabriquées AVANT le premier écran (aucun graphisme d'origine affiché)
    if (d2Info.local) {
      // l'écran d'attente d'origine (z-index 150) recouvrirait l'écran de préparation : texte superposé et clics captés
      boot.remove();
      await this.localBootGate(bank);
    }
    await loadD2Ui((path) => bank.d2Read(path));
    boot.remove();
    const stopMenuMusic = startMenuMusic(
      () => bank.d2Read('audio/music-options.mp3'),
      () => {
        // volume de musique du dernier personnage joué (0 : le menu reste silencieux et rien n'est décodé)
        try {
          const last = SaveStore.list()[0];
          return (last && SaveStore.load(last.slot)?.settings?.music) ?? 0.5;
        } catch {
          return 0.5;
        }
      },
    );
    if (!this.bench) {
      // synchronisation : session restaurée et personnages mis à jour avant l'écran de sélection (5 s au plus, hors ligne : le jeu démarre quand même)
      installConflictDialog(this.root);
      // diagnostic / tests de bout en bout (?sync-debug) : le moteur est accessible dans la console
      if (new URLSearchParams(location.search).has('sync-debug')) window.__sync = Sync;
      await Promise.race([Sync.init(), new Promise((r) => setTimeout(r, 5000))]).catch(() => undefined);
    }
    await this.chooseCharacter();
    stopMenuMusic();
    this.audio = new G.AudioEngine();
    this.haptics = new G.Haptics();
    // stockage persistant : sans lui, iOS/Android peuvent purger la sauvegarde et le cache hors ligne sous pression
    if (!this.bench) void requestPersist();
    this.showLoading('D2 Mobile', 0, 'Démarrage du rendu');
    if (d2Info.local) await refreshStorageTight();
    this.qualityName = this.initialQuality();
    const q = G.QUALITY_PRESETS[this.qualityName];
    this.renderer = new G.GameRenderer(import.meta.env.BASE_URL, this.scaledQuality(q).tier, bank);
    // budget de textures selon la mémoire de l'appareil : les grosses planches importées passent en basse résolution au-delà
    {
      const mem = navigator.deviceMemory ?? 4;
      this.renderer.bank.budget = (mem <= 2 ? 56 : mem <= 4 ? 84 : mem < 8 ? 104 : 200) * 1048576;
    }
    // moteur de rendu : WebGL par défaut ; WebGPU (expérimental) seulement s'il est demandé, disponible et n'a pas déjà échoué ici
    const store = (() => {
      try {
        return localStorage;
      } catch {
        return null;
      }
    })();
    const pick = chooseEngine(this.game.settings.renderEngine, !!navigator.gpu, readEngineFailure(store));
    this.engineSetting = sanitizeEngine(this.game.settings.renderEngine);
    await this.renderer.init(stage, this.scaledQuality(q), pick.engine);
    if (pick.engine === 'webgpu' && this.renderer.engine !== 'webgpu') recordEngineFailure(store, this.renderer.engineFailure ?? 'repli sur WebGL');
    this.renderer.onEngineLost = (why) => {
      recordEngineFailure(store, `appareil WebGPU perdu : ${why}`);
      this.hud?.message('WebGPU a été interrompu : WebGL sera utilisé au prochain lancement.', '#d9a050');
    };
    // sons importés de Diablo II (si présents) ; les sons d'origine servent de repli
    this.audio.attachD2((path) => this.renderer.bank.d2Read(path), d2Info.local ? (path, range) => this.renderer.bank.d2ReadRange(path, range) : undefined);
    if (d2Info.local) window.__d2audio = this.audio;
    // mode local : les archives sonores peuvent arriver (ou être retrouvées) après le démarrage ; les sons se décodent alors à la demande
    if (d2Info.local)
      d2Local.onAudioReady = () =>
        this.audio.attachD2(
          (path) => this.renderer.bank.d2Read(path),
          (path, range) => this.renderer.bank.d2ReadRange(path, range),
        );
    // la barre avance pendant les téléchargements (premier chargement après une mise à jour : plusieurs dizaines de Mo)
    this.showLoading('D2 Mobile', 0.02, 'Icônes et images');
    await loadD2Icons((path) => this.renderer.bank.d2Read(path), d2Info.local);
    // mode local, sans repli : la carte de la ville (données) est fabriquée avant la première zone
    if (d2Info.local) await this.localTownGate();
    // cartes de villes de Diablo II : la zone de la ville est reconstruite avec leur collision (les cartes des campagnes se chargent à la demande)
    // lot 305: the start's bar in weighed steps, each named (towns' maps, the act's maps, the first zone), never still at its end
    if (
      (await G.loadD2Maps(
        (path) => this.renderer.bank.d2Read(path),
        (d, t) => this.showLoading('D2 Mobile', BOOT_BAR.maps[0] + (BOOT_BAR.maps[1] - BOOT_BAR.maps[0]) * (d / t), `Cartes des villes ${d} / ${t}`),
        (id) => !/^a[1-5]_/.test(id) && RULES['maps.wanted'](this.game, id),
      )) > 0 &&
      this.game.mode === 'town'
    )
      this.game.refreshTown();
    void loadD2Loading((path) => this.renderer.bank.d2Read(path));
    this.hud = new G.Hud(hudEl);
    if (d2Info.local) {
      mountD2LocalBanner(this.root);
      // fichiers fournis en cours de partie : la zone est reconstruite pour prendre les sols et décors générés (le reste est remplacé à chaud)
      d2Local.onFilesReady = () => void this.rebuildZoneGraphics();
      this.startLocalMaps();
      void this.startPregen();
      this.installRunGate();
    }
    // erreurs, stockage plein et échecs de sauvegarde : message discret dans le HUD, la partie continue
    onAlert((kind, text) => this.hud.message(text, kind === 'error' ? '#d9a050' : '#e06a6a'));
    // objets illisibles mis de côté au chargement (base inconnue) : signalés à chaque partie, jamais supprimés
    const orphans = this.game.orphans.length + this.game.sharedOrphans.length;
    if (orphans) this.hud.message(`${orphans} objet(s) illisible(s) mis de côté (objet inconnu de cette version) : conservés dans la sauvegarde`, '#e06a6a');
    // éléments du HUD ajoutés par les mods (point d'insertion `hud`)
    for (const f of contributions('hud')) {
      const w = safely(
        () => f({ game: this.game, host: this.uiHost(), screen: this.uiScreen() }),
        null,
        (e) => reportError('mod (HUD)', e),
      );
      if (w) {
        hudEl.append(w.el);
        this.modWidgets.push(w);
      }
    }
    this.tips = new G.Tips(hudEl, { atk: this.hud.atkBtn, skills: this.hud.skillsBtn, char: this.hud.charBtn, inv: this.hud.invBtn, hp: this.hud.hpBtn, skill1: this.hud.skillBtns[0] ?? null });
    this.panels = new G.Panels(panelsEl, {
      game: () => this.game,
      close: () => {
        this.paused = false;
        this.controls.enabled = true;
      },
      onSettingsChanged: (s) => this.applySettings(s),
      onImageCompare: (on) => this.setImageCompare(on),
      renderEngineInfo: () => this.renderEngineInfo(),
      reloadGame: () => {
        this.saveNow();
        location.reload();
      },
      exportSave: () => SaveStore.exportFile(this.game.toSave()),
      importSave: () => void this.importSave(),
      resetSave: () => {
        if (this.slot) SaveStore.clear(this.slot);
        this.slot = null;
        location.reload();
      },
      switchCharacter: () => this.switchCharacter(),
      downloadPack: (pack, cb, signal) =>
        G.downloadPack(pack, this.renderer.bank, cb, (act) => G.loadCampaignMaps((path) => this.renderer.bank.d2Read(path), act), { signal, hasRoom, record: recordPack }),
      packStatus: (pack) => G.packRealState(pack.id, this.renderer.bank.d2Version),
      errorLogCount: () => readErrorLog().length,
      exportErrorLog,
      loadCampaign: (act, cb) => this.loadCampaignMaps(act, cb),
      campaignMaps: (act) => G.campaignMapIds((path) => this.renderer.bank.d2ReadWait(path), act),
      haptic: (k) => (k === 'fail' ? (this.audio.fail(), this.haptics.vibrate(12)) : (this.audio.ui(), this.haptics.vibrate(8))),
      itemSound: (type) => this.audio.itemUi(type),
      message: (t, color) => this.hud.message(t, color),
      resetTips: () => this.tips.reset(this.game),
      modScreen: this.uiScreen(),
    });
    this.controls = new G.Controls(() => this.game, this.hud, this.renderer, stage);
    this.controls.mode = () => this.inputMode.current;
    this.controls.panelOpen = () => this.panels.open || this.paused;
    this.controls.onAssignHover = (slot) => this.panels.assignHoveredSkill(slot);
    this.controls.onAlt = (down) => {
      this.hud.altLabels = down;
      this.renderer.revealAll = down;
    };
    this.controls.onPanel = (name) => this.openPanel(name);
    this.controls.onWalk = () => {
      const st = this.game.settings;
      st.walkMode = st.walkMode !== true;
      this.hud.message(st.walkMode ? 'Marche' : 'Course', '#9ab');
    };
    this.controls.onImageCycle = () => {
      const st = this.game.settings;
      const p = nextQuickPreset(st);
      Object.assign(st, p.values);
      this.applyImageQuality(st);
      this.hud.message(`Qualité d'image : ${p.label}`, '#9ab');
    };
    this.controls.onImageCompare = (on) => this.setImageCompare(on);
    this.controls.onSkillPicker = (slot) => {
      this.paused = true;
      G.openSkillPicker(
        panelsEl,
        this.game,
        slot,
        () => {
          this.paused = false;
          this.hud.relayout(this.game.settings.leftHanded);
        },
        this.inputMode.current === 'pc',
      );
    };
    this.inputMode.onChange(() => {
      this.controls.resetAll();
      this.applyMode();
    });
    this.controls.onHaptic = (k) => this.haptics.vibrate(k === 'cancel' ? 10 : 8);
    this.applySettings(this.game.settings);
    this.bindLifecycle(stage);
    G.installDebugHook(() => this.game, {
      loadCampaign: (act: string) => this.loadCampaignMaps(act),
      app: this,
      bot: (on = true, opts: Partial<BotOptions> = {}) => this.setBot(on, opts),
      speed: (k = 1) => (this.timeScale = Math.max(0, Math.min(16, k))),
      setQuality: (n: QualityName) => this.setQuality(n),
      metrics: () => this.metrics,
      renderer: () => this.renderer,
    });
    this.watchUpdates();
    // reconnexion : on réapparaît dans la dernière ville visitée (un nouveau personnage : le Camp des Rôdeuses, Acte I) ; les cartes de l'acte
    // sont chargées d'abord, sinon la ville retombe sur Harrogath
    const town = this.game.lastTown;
    const camp = this.game.runDef?.campaign ?? '';
    const actMaps = (act: string) =>
      this.loadCampaignMaps(act.replace('act', 'a'), (d, t) =>
        this.showLoading('D2 Mobile', BOOT_BAR.act[0] + (BOOT_BAR.act[1] - BOOT_BAR.act[0]) * (d / t), `Cartes de l’acte ${act.slice(3)} ${d} / ${t}`),
      ).catch(() => 0);
    if (this.game.mode === 'run') {
      // a game mode's run resumed at load (`RunDef.resumeOnLoad`): the maps of its act first, then the run rebuilt on them from the save
      if (/^act[1-4]$/.test(camp)) {
        await actMaps(camp);
        this.game.rebuildResumedRun();
      }
    } else if (/^act[1-4]$/.test(town)) {
      await actMaps(town);
      this.game.enterTown(town);
    }
    await this.syncZone(BOOT_BAR.zone);
    this.hideLoading();
    this.watchMemory();
    this.running = true;
    stats().setPlaying(true);
    this.hideInstallPill();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (this.bench) void this.runBenchmark();
  }

  /** Fenêtre « mise à jour disponible » : une fois par version détectée, « plus tard » la masque jusqu'au prochain lancement */
  private watchUpdates(): void {
    let card: HTMLElement | null = null;
    let later = 0;
    const show = () => {
      if (appUpdate.status !== 'available') {
        if (appUpdate.status === 'installing' || appUpdate.status === 'restarting') card?.remove();
        return;
      }
      if (card?.isConnected) return;
      // lot 290 (owner): never in the middle of a run; offered when it ends (the town, a game mode's hub)
      if (this.game.mode === 'run') {
        clearTimeout(later);
        later = window.setTimeout(show, 2000);
        return;
      }
      const laterBtn = el('button', { cls: 'btn', textContent: 'Plus tard' });
      const now = el('button', { cls: 'btn primary', textContent: 'Installer maintenant (recharge)' });
      card = el(
        'div',
        { cls: 'tip-card update-card' },
        el('div', { cls: 'tip-title', textContent: 'Mise à jour disponible' }),
        el('div', {
          cls: 'upd-text',
          textContent:
            'Une nouvelle version est prête : elle s’installera au prochain lancement du jeu, sans interrompre votre partie. Vous pouvez aussi l’installer maintenant (Réglages › Application).',
        }),
        el('div', { cls: 'upd-btns' }, laterBtn, now),
      );
      laterBtn.addEventListener('click', () => card?.remove());
      now.addEventListener('click', () => appUpdate.apply());
      this.root.appendChild(card);
    };
    appUpdate.listeners.add(show);
    show();
  }

  /* ------------------------------ Réglages / qualité ------------------------------ */

  private initialQuality(): QualityName {
    const s = this.game.settings.quality;
    if (s !== 'auto') return s;
    const mem = navigator.deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (mem <= 2 || cores <= 4) return 'medium';
    return 'high';
  }

  private scaledQuality(q: RenderQuality): RenderQuality {
    // résolution interne : facteur entier ≤ DPR (préscale net), le navigateur termine en bilinéaire
    const dpr = window.devicePixelRatio || 1;
    // graphismes générés sur l'appareil : haute résolution par défaut partout (économe si ≤ 2 Go de mémoire ou stockage presque plein)
    const tier = d2Info.local ? d2LocalGenTier() : q.tier;
    return { ...q, tier, resolution: Math.max(1, Math.min(q.resolution, Math.floor(dpr))) };
  }

  async setQuality(name: QualityName): Promise<void> {
    this.qualityName = name;
    const q = this.scaledQuality(G.QUALITY_PRESETS[name]);
    this.renderer.quality = q;
    if (this.renderer.bank.tier !== q.tier) {
      // les sprites de la zone référencent les textures : on les détruit AVANT de libérer
      // les planches, et le rendu est suspendu pendant le rechargement
      const wasLoading = this.loadingZone;
      this.loadingZone = true;
      this.renderer.clearZone();
      await this.renderer.bank.setTier(q.tier);
      if (this.currentWorld) await this.renderer.setZone(this.currentWorld);
      this.loadingZone = wasLoading;
    }
    if (this.renderer.app.renderer.resolution !== q.resolution) {
      this.renderer.app.renderer.resolution = q.resolution;
      this.renderer.app.resize();
      this.renderer.resize();
    }
  }

  /** Interface selon le mode de commandes : joystick et boutons ronds (tactile) ou barre de compétences façon Diablo II (PC) */
  private applyMode(): void {
    const pc = this.inputMode.current === 'pc';
    document.documentElement.dataset.input = pc ? 'pc' : 'touch';
    if (this.hud && this.hud.pc !== pc) this.hud.setMode(pc);
    if (this.controls) this.controls.mode = () => this.inputMode.current;
  }

  /** Réglage de moteur vu par le dernier applySettings : rechoisir WebGPU efface l'échec mémorisé (nouvel essai au prochain lancement) */
  private engineSetting: 'webgl' | 'webgpu' = 'webgl';

  /** Moteur utilisé, échec mémorisé et message pour la page Réglages */
  renderEngineInfo(): { active: 'webgl' | 'webgpu'; status: { text: string; kind: 'info' | 'warn' } | null } {
    const active = this.renderer?.engine ?? 'webgl';
    let failure: string | null = null;
    try {
      failure = readEngineFailure(localStorage);
    } catch {
      /* stockage indisponible */
    }
    return { active, status: engineStatus(this.game.settings.renderEngine, active, failure, !!navigator.gpu) };
  }

  applySettings(s: Settings): void {
    this.game.settings = s;
    const eng = sanitizeEngine(s.renderEngine);
    if (eng !== this.engineSetting) {
      this.engineSetting = eng;
      if (eng === 'webgpu') {
        try {
          clearEngineFailure(localStorage);
        } catch {
          /* sans conséquence */
        }
      }
    }
    this.inputMode.setPref(s.controls ?? 'auto');
    this.applyMode();
    G.applyLootPreset(s.lootRate);
    G.setDurabilityEnabled(s.durability !== false);
    this.audio.setVolumes(s.sound, s.music);
    this.haptics.level = s.haptics;
    const zoom = s.zoom * Math.max(0.8, Math.min(1.1, window.innerHeight / 420));
    // a game mode can widen the view (rule `render.zoom`: portrait, folded foldable); base: unchanged
    this.renderer.zoom = this.game ? RULES['render.zoom'](this.game, zoom, { width: window.innerWidth, height: window.innerHeight }) : zoom;
    this.hud.relayout(s.leftHanded);
    this.renderer.lighting = s.lighting ?? 'penombre';
    this.renderer.showCollisions = !!s.showCollisions;
    this.applyImageQuality(s);
    if (s.quality !== 'auto' && s.quality !== this.qualityName) void this.setQuality(s.quality);
  }

  private imageWanted: ImageParams = imageParams();
  private imageGuard = new PerfGuard();
  private imageKey = '';

  /** Qualité d'image : (re)monte ou retire le filtre de la scène ; le réglage du joueur reste intact, seule la garde rétrograde l'effet appliqué */
  private applyImageQuality(s: Settings): void {
    const key = `${s.imageSharpen ?? 0}|${s.imageSmooth ? 1 : 0}|${s.imageMood ?? 'normal'}|${s.imageScale ?? 'normal'}|${s.dynamicLight ?? 'off'}`;
    if (key !== this.imageKey) {
      this.imageKey = key;
      this.imageGuard.reset();
    }
    this.imageWanted = imageParams(s.imageSharpen, s.imageSmooth, s.imageMood, s.imageScale);
    this.renderer.setImageFilter(this.imageGuard.apply(this.imageWanted));
    this.applyDynamicLight();
  }

  /** Éclairage dynamique : réglage du joueur rétrogradé par la garde de performance (coupé avant les autres effets) */
  private applyDynamicLight(): void {
    this.renderer.dynLight = effectiveDynamicLight(this.game.settings.dynamicLight, this.imageGuard.lightDrop);
  }

  /** Niveau d'éclairage dynamique demandé par le joueur : 0 désactivé, 1 léger, 2 normal */
  private dynLightWanted(): number {
    const v = sanitizeDynamicLight(this.game.settings.dynamicLight);
    return v === 'normal' ? 2 : v === 'light' ? 1 : 0;
  }

  /** Comparer : rendu sans filtre tant que le bouton est appuyé */
  setImageCompare(on: boolean): void {
    this.renderer.setImageFilter(this.imageGuard.apply(this.imageWanted), on);
    document.documentElement.classList.toggle('image-compare', on);
  }

  /** Paliers adaptatifs : descend si les images sont lentes, remonte avec hystérésis, sans osciller */
  private adaptQuality(now: number): void {
    if (this.game.settings.quality !== 'auto') return;
    if (now < this.perfHoldUntil) {
      this.frameTimes = [];
      this.perfWindowStart = now;
      return;
    }
    if (now - this.perfWindowStart < 2000) return;
    const n = this.frameTimes.length;
    if (n > 10) {
      const sorted = [...this.frameTimes].sort((a, b) => a - b);
      const p90 = sorted[Math.floor(n * 0.9)];
      if (p90 > 24) {
        this.badWindows++;
        this.goodWindows = 0;
      } else if (p90 < 14) {
        this.goodWindows++;
        this.badWindows = 0;
      } else {
        this.badWindows = Math.max(0, this.badWindows - 1);
        this.goodWindows = 0;
      }
      if (now - this.lastQualityChange > 10000) {
        const order: QualityName[] = ['low', 'medium', 'high'];
        const i = order.indexOf(this.qualityName);
        if (this.badWindows >= 3 && i > 0) {
          void this.setQuality(order[i - 1]);
          this.lastQualityChange = now;
          this.badWindows = 0;
        } else if (this.goodWindows >= 15 && i < order.length - 1 && this.initialQuality() === 'high') {
          void this.setQuality(order[i + 1]);
          this.lastQualityChange = now;
          this.goodWindows = 0;
        }
      }
    }
    this.frameTimes = [];
    this.perfWindowStart = now;
  }

  /* ------------------------------ Boucle ------------------------------ */

  private frame(now: number): void {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    if (this.paused || this.loadingZone || this.contextLost) return;
    if (!this.panels.open) {
      this.acc += dt * this.timeScale;
      while (this.acc >= G.DT) {
        if (this.botBrain) this.botStep();
        else this.controls.apply();
        // une exception de la simulation est journalisée, le pas est abandonné : la partie ne se fige pas sur l'erreur
        let ev: SimEvent[] = [];
        const crossed = this.game.seamCrossed;
        try {
          ev = this.game.step(1);
        } catch (err) {
          reportError('simulation', err);
        }
        // lot 312: walked into the neighbour at a seam: the events of the steps before, waiting for this image, are seen in the new
        // zone's coordinates (the step's own are already)
        const seam = this.game.seamCrossed;
        if (seam && seam !== crossed && this.pendingEvents.length) this.pendingEvents = this.pendingEvents.map((e) => G.shiftEvent(e, seam.dx, seam.dy));
        if (ev.length) this.pendingEvents.push(...ev);
        this.acc -= G.DT;
        if (this.game.world !== this.currentWorld) break;
      }
    }
    if (this.game.world !== this.currentWorld) {
      // lot 312: walked into the neighbour at a seam: the scene kept as it is (no loading, no clearing), else the zone loaded
      if (!this.seamSwapFast()) {
        void this.syncZone();
        return;
      }
    }
    this.idleSeams();
    // affichage plafonné à ~60 i/s
    if (now - this.lastRender < 1000 / 62) return;
    const interval = now - this.lastRender;
    this.lastRender = now;
    const t0 = performance.now();
    const events = this.pendingEvents;
    this.pendingEvents = [];
    this.handleUiEvents(events);
    this.renderer.render(this.game.world, this.panels.open ? 1 : this.acc / G.DT, Math.min(0.05, dt), events, {
      shake: this.game.settings.screenShake,
      damageNumbers: this.game.settings.damageNumbers,
      // drawing caps of a game mode (rule `render.limits`; base: the base's drawing)
      limits: RULES['render.limits'](this.game),
    });
    this.audio.onEvents(this.game.world, events);
    this.haptics.onEvents(events);
    this.hud.update(this.game, now);
    // controls of the HUD a game mode hides (rule `ui.hudHidden`; base: none)
    // lot 314: no town portal at will in a campaign (`Game.portalAllowed`): its button hidden there
    const modeHidden = RULES['ui.hudHidden'](this.game);
    const hidden = this.game.portalAllowed() || modeHidden.includes('portal') ? modeHidden : [...modeHidden, 'portal'];
    applyHudHidden(hidden);
    this.hud.setHiddenParts(hidden);
    // place of the floating joystick a game mode asks (rule `ui.joystick`; base: null, the base's zone and buttons)
    this.hud.setJoystickPlace(RULES['ui.joystick'](this.game, { width: window.innerWidth, height: window.innerHeight, leftHanded: !!this.game.settings.leftHanded }));
    for (const w of this.modWidgets)
      if (w.update)
        safely(
          () => w.update!(this.game),
          undefined,
          (e) => reportError('mod (HUD)', e),
        );
    this.tips.onEvents(this.game, events);
    this.tips.update(this.game, now, !!this.panels.open);
    this.hud.updateLabels(this.game, this.renderer.groundItemScreens(this.game.world));
    if (this.metrics.frames % 6 === 0) this.hud.drawMinimap(this.game);
    const rt = performance.now() - t0;
    this.metrics.frames++;
    this.metrics.renderMsSum += rt;
    this.metrics.worstFrame = Math.max(this.metrics.worstFrame, interval);
    if (this.metrics.frameIntervals.length < 20000) this.metrics.frameIntervals.push(interval);
    // image isolée très longue (rechargement, mise en veille) : plafonnée, elle ne représente pas la fluidité
    this.frameTimes.push(Math.min(interval, 250));
    this.adaptQuality(now);
    const step = this.imageGuard.push(interval, now, this.imageWanted, this.dynLightWanted());
    if (step) {
      this.renderer.setImageFilter(this.imageGuard.apply(this.imageWanted));
      this.applyDynamicLight();
      this.hud.bannerText(step === 'light' ? 'Éclairage dynamique réduit pour préserver la fluidité' : "Qualité d'image réduite pour préserver la fluidité", undefined, 1, 'image-guard');
    }
    this.fpsCount++;
    if (now - this.fpsTime > 1000) {
      this.fpsValue = (this.fpsCount * 1000) / (now - this.fpsTime);
      this.fpsCount = 0;
      this.fpsTime = now;
      if (this.game.settings.showPerf) {
        const w = this.game.world;
        this.hud.setPerf(
          `${this.fpsValue.toFixed(0)} i/s  rendu ${rt.toFixed(1)} ms  qualité ${this.qualityName}\n` +
            `textures ${(this.renderer.textureMemory() / 1048576).toFixed(1)} Mo  planches ${this.renderer.bank.loadedIds().length}\n` +
            `monstres ${w.aliveMonsters().length}  projectiles ${w.missiles.length}  sol ${w.items.length}`,
        );
      } else this.hud.setPerf(null);
    }
    if (now - this.lastSave > 30000) this.saveNow();
  }

  private handleUiEvents(events: SimEvent[]): void {
    this.hud.onEvents(this.game, events);
    for (const e of events) {
      // montée de niveau : écrans des mods (point d'insertion `levelUp`, ex. choix d'une compétence d'un mode de jeu) ; several levels in one
      // step, or a level while a mod screen is open: queued, one screen at a time
      if (e.t === 'levelUp' && contributions('levelUp').length) this.levelUps.push(e.level);
      // end of a run: a game mode's end-of-run screen (slot `run.complete`)
      if (e.t === 'runComplete' && this.game.lastRunSummary)
        for (const f of contributions('run.complete'))
          safely(
            () => f({ game: this.game, host: this.uiHost(), screen: this.uiScreen(), summary: { ...this.game.lastRunSummary! } }),
            undefined,
            (err) => reportError('mod (run complete)', err),
          );
      if (e.t === 'interact') {
        if (e.kind === 'stash') this.openPanel('stash');
        // lot 315: the waypoint activated by the simulation (`Game.handle`), the screen opens its travel menu
        else if (e.kind === 'waypoint') this.openPanel('waypoint');
        else if (e.kind === 'npc') {
          const ref = e.ref ?? '';
          // chaque PNJ : son nom, son titre et ce qu'il fait au toucher (soin, marchand, cartes, mercenaires)
          // lot 321 (audit 3.3): each trader opens his own stall (src/data/vendors.ts); a second action where Diablo II gives two
          const trade = (npc: string) => () => this.openVendor(npc);
          type NpcEntry = { name: string; title: string; label: string; act: () => void; extra?: { label: string; act: () => void }[] };
          const NPC: Record<string, NpcEntry> = {
            malah: { name: 'Malah', title: 'Guérisseuse', label: 'Commercer', act: trade('malah') },
            larzuk: {
              name: 'Larzuk',
              title: 'Forgeron',
              label: 'Commercer',
              act: () => {
                // Siège d'Harrogath accompli : Larzuk perce un objet (une fois par difficulté)
                if (this.game.socketQuestAvailable()) this.openPanel('socketquest');
                else this.openVendor('larzuk');
              },
            },
            // Camp des Rôdeuses : Akara soigne et vend (bâtons, potions), Charsi forge et répare, Gheed vend et joue, Kashya engage des Rôdeuses
            akara: { name: 'Akara', title: 'Prêtresse', label: 'Commercer', act: trade('akara') },
            charsi: {
              name: 'Charsi',
              title: 'Forgeronne',
              label: 'Commercer',
              act: () => {
                if (this.game.imbueAvailable()) this.openPanel('imbue');
                else this.openVendor('charsi');
              },
            },
            gheed: { name: 'Gheed', title: 'Marchand', label: 'Commercer', act: trade('gheed') },
            kashya: { name: 'Kashya', title: 'Capitaine des Rôdeuses', label: 'Mercenaires', act: () => this.openPanel('merc', 'kashya') },
            warriv: this.traveler('warriv', 'Warriv', 'Caravanier'),
            // Lut Gholein : Fara soigne, forge et répare, Elzix vend et joue, Drognan et Lysander vendent, Greiz engage des Gardes du désert ;
            // Atma ne fait pas commerce dans Diablo II (lot 321)
            atma: {
              name: 'Atma',
              title: 'Aubergiste',
              label: 'Écouter',
              act: () => this.hud.message('Atma : « Radament se terre dans les égouts, sous la ville. Vengez mon fils. »', '#ffd98a'),
            },
            fara: { name: 'Fara', title: 'Forgeronne', label: 'Commercer', act: trade('fara') },
            elzix: { name: 'Elzix', title: 'Marchand', label: 'Commercer', act: trade('elzix') },
            drognan: { name: 'Drognan', title: 'Mage Vizjerei', label: 'Commercer', act: trade('drognan') },
            lysander: { name: 'Lysander', title: 'Alchimiste', label: 'Commercer', act: trade('lysander') },
            greiz: { name: 'Greiz', title: 'Chef des mercenaires', label: 'Mercenaires', act: () => this.openPanel('merc', 'greiz') },
            warriv2: this.traveler('warriv2', 'Warriv', 'Caravanier'),
            geglash: { name: 'Geglash', title: 'Marin', label: 'Écouter', act: () => this.hud.message('Geglash : « Le port est calme, mais la ville a de grands besoins… »', '#ffd98a') },
            meshif: this.traveler('meshif', 'Meshif', 'Capitaine'),
            jerhyn: {
              name: 'Jerhyn',
              title: 'Seigneur de Lut Gholein',
              label: 'Écouter',
              act: () => this.hud.message('Jerhyn : « Les égouts, le désert et les tombeaux… la ville compte sur vous. »', '#ffd98a'),
            },
            cain2: {
              name: 'Deckard Cain',
              title: 'Le dernier Horadrim',
              label: 'Écouter',
              act: () => this.hud.message('Cain : « Tal Rasha repose dans l’un des sept tombeaux. Duriel veille sur lui. »', '#ffd98a'),
            },
            // Kurast : Ormus soigne et vend, Alkor vend et joue, Hratli forge et répare, Asheara engage des Loups de fer et vend
            ormus: { name: 'Ormus', title: 'Mage de Kurast', label: 'Commercer', act: trade('ormus') },
            alkor: { name: 'Alkor', title: 'Alchimiste', label: 'Commercer', act: trade('alkor') },
            hratli: { name: 'Hratli', title: 'Forgeron', label: 'Commercer', act: trade('hratli') },
            asheara: {
              name: 'Asheara',
              title: 'Capitaine des mercenaires',
              label: 'Mercenaires',
              act: () => this.openPanel('merc', 'asheara'),
              extra: [{ label: 'Commercer', act: trade('asheara') }],
            },
            natalya: {
              name: 'Natalya',
              title: 'Chasseuse de démons',
              label: 'Écouter',
              act: () => this.hud.message('Natalya : « Mephisto est tapi dans la Durance de la Haine. Je vous attends au Travincal. »', '#ffd98a'),
            },
            meshif3: this.traveler('meshif3', 'Meshif', 'Capitaine'),
            cain3: {
              name: 'Deckard Cain',
              title: 'Le dernier Horadrim',
              label: 'Écouter',
              act: () => this.hud.message('Cain : « Les Anciens Zakarum se sont tournés vers Mephisto. Le Conseil garde le Travincal. »', '#ffd98a'),
            },
            // Forteresse du Pandémonium : Jamella soigne, vend et joue, Halbu forge et répare, Tyrael et Cain conseillent
            jamella: { name: 'Jamella', title: 'Guérisseuse', label: 'Commercer', act: trade('jamella') },
            halbu: { name: 'Halbu', title: 'Forgeron', label: 'Commercer', act: trade('halbu') },
            tyrael: this.traveler('tyrael', 'Tyrael', 'Archange de la Justice'),
            cain: {
              name: 'Deckard Cain',
              title: 'Le dernier Horadrim',
              label: 'Écouter',
              act: () => this.hud.message('Cain : « Les terres de l’Enfer sont dangereuses : avancez de portail en portail. »', '#ffd98a'),
            },
            // Anya vend et joue dans Diablo II ; ses cartes (la fin de jeu du mod) restent un second choix
            anya: { name: 'Anya', title: 'Alchimiste', label: 'Commercer', act: trade('anya'), extra: [{ label: 'Cartes', act: () => this.openPanel('maps') }] },
            // PD2 : Cain à Harrogath (identification inutile : les objets tombent identifiés dans ce jeu)
            cain5: {
              name: 'Deckard Cain',
              title: 'Le dernier Horadrim',
              label: 'Écouter',
              act: () => this.hud.message('Cain : « Baal marche sur la Pierre-Monde. Les Anciens ne laisseront passer que les plus dignes. »', '#ffd98a'),
            },
            qual_kehk: { name: 'Qual-Kehk', title: 'Commandant', label: 'Mercenaires', act: () => this.openPanel('merc', 'qual_kehk') },
          };
          const n = NPC[ref];
          // objets de quête rapportés (Malus à Charsi, Oiseau d'or et Grimoire à Alkor, Gidbinn à Ormus…)
          if (n) this.game.talkTo(ref);
          if (n) {
            // Diablo II's healers (lot 316: entering a town no longer heals): Akara, Fara, Ormus, Jamella, Malah; Atma does not
            if (HEALERS[ref]) {
              this.game.heal();
              this.hud.message(`${HEALERS[ref]} vous soigne.`, '#8f8');
            }
            const lines = [...this.questLines(ref), ...this.audio.npcLines(ref === 'cain' ? 'cain4' : ref)];
            if (!lines.length && !n.extra) n.act();
            else {
              this.paused = true;
              this.controls.resetAll();
              G.openNpcDialog(this.root.querySelector('#panels') as HTMLElement, {
                name: n.name,
                title: n.title,
                lines,
                classId: this.game.character.classId,
                actionLabel: n.label,
                action: n.act,
                extra: n.extra,
                speak: (f) => void this.audio.playGossip(f),
                done: () => (this.paused = false),
              });
            }
          }
        } else if (e.kind === 'cube') this.openPanel('cube');
      }
      if (e.t === 'runComplete') this.saveNow();
    }
  }

  /** Phrases de quête d'un PNJ : l'état de ses quêtes (en cours, accomplies) à la difficulté courante */
  private questLines(ref: string): { n: number; text: string; file?: string }[] {
    const g = this.game;
    return G.QUESTS.filter((q) => q.giver === ref && q.say).map((q, i) => ({ n: -1 - i, text: g.questDone(q.id) ? `${q.say![1]}` : `${q.say![0]}` }));
  }

  /**
   * Lot 319: a transporter of Diablo II (Warriv, Meshif, Tyrael): "Travel" to his act once its gate is open, else he only talks (his line);
   * no longer the whole waypoint menu (Rush included). That act's maps not on the device yet: the waypoint opens on its tab (download)
   */
  private traveler(ref: string, name: string, title: string): { name: string; title: string; label: string; act: () => void } {
    const o = this.game.travelOffer(ref);
    if (!o || o.lock) return { name, title, label: 'Écouter', act: () => this.hud.message(o?.lock ?? '', '#ffd98a') };
    return {
      name,
      title,
      label: 'Voyager',
      act: () => {
        const r = this.game.travel(ref);
        if (r.ok || !r.maps) {
          if (!r.ok && r.reason) this.hud.message(r.reason, '#d66');
          return;
        }
        this.openPanel('waypoint');
        this.panels.waypointUi.campAct = o.to;
        this.panels.render();
      },
    };
  }

  /** Active le bot : il prépare le personnage en ville, lance la run choisie et joue */
  setBot(on: boolean, opts: Partial<BotOptions> = {}): void {
    // build par défaut selon la classe (Druide : invocateur, qui charge loups, grizzly et corbeaux)
    const build = opts.build ?? (this.game.character.classId === 'druid' ? 'summon' : undefined);
    this.botBrain = on ? new G.BotBrain(this.game, { ...opts, ...(build ? { build } : {}) }) : null;
    if (this.botBrain) {
      // points en attente dépensés tout de suite (le bot peut démarrer en pleine run)
      this.botBrain.spendSkillPoints();
      this.botBrain.spendStatPoints();
      this.botBrain.setupHotbar();
      this.game.world.refreshPlayer();
    }
  }

  private botStep(): void {
    const b = this.botBrain!;
    const g = this.game;
    if (g.mode === 'town') {
      if (g.world.player.dead) return;
      const plan = b.town();
      if (plan) g.startRun(plan.runId, plan.difficulty);
      return;
    }
    b.tick();
    const run = g.world.run;
    // run finie : retour par le portail de fin, ou par le bouton de portail de ville après 20 s
    if (run?.completed && (b.idleTicks > 50 || g.world.tick - run.completeTick > 25 * 20)) g.townPortal();
  }

  /** Lot 321: the stall of town NPC `npc` (src/data/vendors.ts; null: the generic stall) opened */
  openVendor(npc: string | null): void {
    this.game.openVendor(npc);
    this.openPanel('vendor', npc ?? undefined);
  }

  openPanel(name: string, npc?: string): void {
    if (name === 'close') {
      // le choix de compétence (fenêtre au-dessus du jeu) se ferme aussi à Échap
      const back = this.root.querySelector('#panels .sp-back') as HTMLElement | null;
      if (back) back.click();
      else if (this.panels.open) this.panels.hide();
      return;
    }
    this.controls.resetAll();
    this.panels.show(name, npc);
    this.paused = false;
  }

  /**
   * Lot 312: the hero walked into the neighbour at a seam and its map is on screen: the renderer keeps the scene (moved into the new
   * zone's coordinates), the controls go on, nothing is loaded; the save and the preparations of the next neighbours wait for idle time.
   * False when the scene cannot be kept (the zone is then loaded as any other: `syncZone`, its image held up to 1.5 s)
   */
  private seamSwapFast(): boolean {
    const w = this.game.world;
    const seam = this.game.seamCrossed?.world === w ? this.game.seamCrossed : null;
    if (!seam || !this.currentWorld || this.loadingZone) return false;
    const t0 = performance.now();
    this.renderer.seamsOn = RULES['world.seams'](this.game);
    if (!this.renderer.swapAtSeam(w, seam.dx, seam.dy)) return false;
    this.controls?.onSeam(seam.dx, seam.dy);
    this.currentWorld = w;
    this.audio.setMood(w.zone.town ? 'harrogath' : (this.game.runDef?.zoneKey ?? 'tristram'));
    this.seamMs = performance.now() - t0;
    this.seamSwaps++;
    // the save (a whole zone's snapshot) and the next neighbours' preparations in idle time, once the renderer's jobs are done
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const save = () => {
      if (this.game.world !== w) return;
      this.saveNow();
      if (!d2Info.local) {
        try {
          for (const z of this.game.neighbourZones()) this.renderer.bank.prefetch(this.renderer.planZoneAssets(z, this.game.character.classId).sheets);
        } catch {
          /* préchargement facultatif */
        }
      }
    };
    window.setTimeout(() => (ric ? ric(save, { timeout: 4000 }) : save()), 1500);
    return true;
  }

  /** Lot 312: crossings done on the kept scene (measures, e2e) */
  seamSwaps = 0;
  /** Lot 312: ms of the longest idle-time preparation of a neighbour (measures, e2e) */
  seamPrepMs = 0;
  private seamIdle = 0;

  /**
   * Lot 312: a neighbour joined edge to edge within about two screens of the hero is built in idle time (its zone, then its world, one
   * part per idle period), so that the simulation finds it ready when the hero comes near (`SeamWorlds.prepareStep`)
   */
  private idleSeams(): void {
    if (this.seamIdle || !this.game.seams.wantsPrepare()) return;
    const ric = (window as unknown as { requestIdleCallback?: (f: (d?: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = (d?: { timeRemaining(): number }) => {
      this.seamIdle = 0;
      const t0 = performance.now();
      // a few milliseconds of the idle period at most (the frame's own work first)
      const more = () => performance.now() - t0 < 4 && (!d || d.timeRemaining() > 3);
      try {
        this.game.seams.prepareStep(more);
      } catch (err) {
        reportError('simulation', err);
      }
      this.seamPrepMs = Math.max(this.seamPrepMs, performance.now() - t0);
    };
    this.seamIdle = ric ? ric(run, { timeout: 1500 }) : window.setTimeout(() => run(), 50);
  }

  /**
   * Loads the current zone's graphics. `range`: the share of the loading bar it fills (the game's start: the bar already shown, from where
   * the steps before it left it); without it, its own screen from 0 after `LOADING_DELAY_MS`
   */
  private async syncZone(range?: readonly [number, number]): Promise<void> {
    if (this.loadingZone) return;
    this.loadingZone = true;
    const w = this.game.world;
    // lot 311: walked into a neighbour at a seam: the hero goes on walking (joystick, keys, held mouse kept, the coordinates moved), the
    // image stays (the neighbour was already drawn) and no loading screen unless it really lasts
    const seam = this.game.seamCrossed?.world === w ? this.game.seamCrossed : null;
    if (seam) this.controls?.onSeam(seam.dx, seam.dy);
    else this.controls?.resetAll();
    this.renderer.seamsOn = RULES['world.seams'](this.game);
    this.renderer.seamSwap = !!seam;
    performance.mark('sync:0');
    // lot 301: a quick change of zone (its graphics prepared ahead) keeps the last image on the screen, no loading screen; it shows
    // after `LOADING_DELAY_MS` only
    const t0 = performance.now();
    const [a, b] = range ?? [0, 1];
    const title = range ? 'D2 Mobile' : w.zone.name;
    // lot 305 (owner: "the bar sticks at the end and lasts long, it looks like a bug"): the sheets and the D2 map's files weighed on one
    // bar by their bytes (the map was outside it: the bar stood at 95 % while most of the bytes came), each step named under it
    let last = a;
    let detail = zoneStepLabel(w.zone.name, 'sheets');
    const show = () => this.showLoading(title, last, detail);
    const delay = seam ? SEAM_LOADING_DELAY_MS : LOADING_DELAY_MS;
    const reveal = range ? 0 : window.setTimeout(show, delay);
    if (range) show();
    const hidden = RULES['render.zoneHidden'](this.game);
    await this.setZoneGated(
      w,
      (d, t, step) => {
        performance.mark('sync:prog');
        last = Math.max(last, a + (b - a) * Math.min(1, d / Math.max(1e-9, t)));
        if (step) detail = zoneStepLabel(w.zone.name, step);
        if (range || performance.now() - t0 >= delay) show();
      },
      hidden,
    );
    clearTimeout(reveal);
    performance.mark('sync:setZone');
    this.currentWorld = w;
    if (w.zone.d2Map && !this.renderer.mapLoaded()) this.hud?.message('Décor de la zone indisponible (réseau ?) : revenez en ville puis relancez la zone.', '#d66');
    this.pendingEvents = [];
    this.acc = 0;
    this.hideLoading();
    performance.mark('sync:end');
    this.loadingZone = false;
    this.audio.setMood(w.zone.town ? 'harrogath' : (this.game.runDef?.zoneKey ?? 'tristram'));
    performance.mark('sync:mood');
    // lot 301: a game mode that names its next zone (Survivals) has its D2 map's part seen and its monsters' sheets prepared during this
    // zone, whatever the graphics' source (the change of zone then builds the scene from what is ready)
    try {
      const ahead = RULES['game.nextZone'](this.game);
      if (ahead) {
        this.renderer.prefetchMap(ahead);
        if (!d2Info.local) this.renderer.bank.prefetch(this.renderer.planZoneAssets(ahead, this.game.character.classId).sheets);
      }
    } catch {
      /* préchargement facultatif */
    }
    this.seamMs = seam ? performance.now() - t0 : -1;
    // lot 311: the zones joined at the seams: their monsters' sheets prepared during this zone (their maps' edges are on screen already),
    // a little after its first images
    if (!d2Info.local)
      window.setTimeout(() => {
        if (this.game.world !== w) return;
        try {
          for (const z of this.game.neighbourZones()) this.renderer.bank.prefetch(this.renderer.planZoneAssets(z, this.game.character.classId).sheets);
        } catch {
          /* préchargement facultatif */
        }
      }, 1500);
    // zone suivante probable (retour en ville, ou run laissée derrière un portail) : graphismes préparés en tâche de fond (mode local)
    if (d2Info.local) {
      try {
        // un mode de jeu qui enchaîne ses zones sans ville (Survivals, lot 300) nomme la suivante : sa carte, ses monstres (`monsterPool`)
        // et ses effets sont préparés pendant la zone en cours
        const modNext = RULES['game.nextZone'](this.game);
        const next = modNext ?? (this.game.mode === 'run' ? this.game.previewTownZone() : this.game.suspendedZone);
        if (next) this.renderer.prefetchZone(next);
        if (modNext) {
          const plan = this.renderer.planZoneAssets(modNext, this.game.character.classId);
          this.renderer.bank.prefetch(plan.sheets);
          if (plan.map && d2LocalMapsEnabled()) void d2Local.requestMap(plan.map, { tier: this.renderer.quality.tier, prio: PRIO.prefetch });
        }
        // lot 311: the zones joined at the seams are walked into without a loading screen: their graphics prepared too
        for (const z of this.game.neighbourZones()) {
          this.renderer.prefetchZone(z);
          this.renderer.bank.prefetch(this.renderer.planZoneAssets(z, this.game.character.classId).sheets);
        }
      } catch {
        /* préchargement facultatif */
      }
    }
    this.saveNow();
    performance.mark('sync:saved');
  }

  /**
   * Cartes d'une campagne. En mode local les données sont fabriquées une à une (attendues, avec progression), puis les cartes hors campagne
   * que certains actes exigent (Tombeaux, Sanctuaire du Chaos…) le sont aussi si elles ne sont pas encore prêtes.
   */
  private async loadCampaignMaps(act: string, cb?: (done: number, total: number) => void): Promise<number> {
    const bank = this.renderer.bank;
    // lot 305: the maps the character plays (rule `maps.wanted`; the base: all of the act)
    const n = await G.loadCampaignMaps(
      (path) => bank.d2ReadWait(path),
      act,
      cb,
      (id) => RULES['maps.wanted'](this.game, id),
    );
    if (d2Info.local) await G.loadD2Maps((path) => bank.d2ReadWait(path), undefined);
    return n;
  }

  /**
   * Cartes DS1 en mode local (phase 5) : la ville est générée tout de suite (données + images du palier courant) puis remplace la ville d'origine ;
   * les autres cartes hors campagne se préparent en arrière-plan, une à la fois, quand plus rien d'autre n'est demandé. Les campagnes se
   * préparent à la demande (bouton de la campagne, avec progression). Une carte pas prête à l'entrée de sa zone laisse la zone d'origine.
   */
  private memoryWatch = 0;
  /**
   * Lot 316: the zones kept for the session (src/sim/zone-keep.ts) given up under memory pressure: where the browser tells the heap's use
   * (Chromium's `performance.memory`), half of them, the oldest, go when it passes 75 % of its limit (they are built again on the next visit)
   */
  private watchMemory(): void {
    if (this.memoryWatch) return;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (!mem?.jsHeapSizeLimit) return;
    this.memoryWatch = window.setInterval(() => {
      const kept = this.game.kept;
      if (kept.size && mem.usedJSHeapSize > 0.75 * mem.jsHeapSizeLimit) kept.release(Math.ceil(kept.size / 2));
    }, 10000);
  }

  private startLocalMaps(): void {
    if (!d2LocalMapsEnabled()) return;
    const read = (path: string) => this.renderer.bank.d2Read(path);
    d2Local.onMapData = (id) => {
      void G.loadD2Maps(read, undefined, (m) => m === id).then((n) => {
        if (n > 0 && id === 'harrogath' && this.game.mode === 'town' && this.game.world.zone.id === 'harrogath') this.game.refreshTown();
      });
    };
    let kicked = false;
    window.setInterval(() => {
      const maps = d2Local.catalog?.maps;
      if (!maps?.length || !d2Local.hasFiles) return;
      const tier = this.renderer.quality.tier;
      if (!kicked) {
        kicked = true;
        if (maps.includes('harrogath')) void d2Local.requestMap('harrogath', { tier, prio: PRIO.player });
      }
      const rest = maps.filter((id) => id !== 'harrogath' && !/^a[1-5]_/.test(id));
      d2Local.idleMapPrefetch(['harrogath', ...rest], tier);
    }, 2500);
  }

  /**
   * Préparation en arrière-plan des zones suivantes dans l'ordre de leveling (voir platform/d2pregen.ts) : Tristram d'abord, puis la campagne
   * acte par acte. Basse priorité, en pause quand le jeu rame, qu'un chargement est en cours ou que l'appareil économise ; annulable (Réglages).
   */
  private async startPregen(): Promise<void> {
    const [{ RUN_BY_ID, RUNS }, { CAMPAIGNS }, plan, pg, live] = await Promise.all([
      import('./data/runs'),
      import('./data/campaigns'),
      import('./platform/d2plan'),
      import('./platform/d2pregen'),
      import('./platform/d2planlive'),
    ]);
    const order = plan.levelingOrder(RUNS, CAMPAIGNS);
    let battery: { level: number; charging: boolean } | null = null;
    try {
      const getB = navigator.getBattery;
      void getB?.call(navigator).then((b) => {
        const upd = () => (battery = { level: b.level, charging: b.charging });
        upd();
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
      });
    } catch {
      /* indisponible */
    }
    const { d2Map } = await import('./data/d2map');
    const mapIdOf = (r: { id: string }): string | null => (d2Local.catalog?.maps?.includes(r.id) ? r.id : null);
    const inst = new pg.Pregen({
      order: () => order,
      // les données de la carte de la zone sont fabriquées puis enregistrées dans le jeu AVANT de connaître la zone (monstres, décors)
      prepare: async (r) => {
        const mid = mapIdOf(r);
        if (!mid || d2Map(mid) || !d2LocalMapsEnabled()) return true;
        if (!(await d2Local.requestMap(mid, { tier: 'lo', prio: PRIO.background, data: true }))) return false;
        await G.loadD2Maps(
          (p) => this.renderer.bank.d2Read(p),
          undefined,
          (m) => m === mid,
        );
        return !!d2Map(mid);
      },
      plan: (r) => live.planFor(r),
      tier: () => this.renderer.quality.tier,
      ctx: () => ({
        enabled: pg.pregenEnabled(),
        hasFiles: d2Local.hasFiles,
        loading: this.loadingZone || this.paused,
        copying: !!d2Local.status.copy,
        quotaFull: d2Local.status.quotaFull,
        queueBusy: d2Local.status.queued + d2Local.status.active > 1 || d2Local.status.all.running,
        visible: document.visibilityState === 'visible',
        fps: this.fpsValue,
        saveData: !!navigator.connection?.saveData,
        battery,
      }),
      request: (id, tier) => d2Local.requestAsset(id, tier, PRIO.background),
      ready: (id, tier) => d2Local.assetReady(id, tier),
      why: (id) => d2Local.failureOf(id)?.error ?? d2Local.failureOf(id.replace(/^map:/, 'mapdata:'))?.error ?? 'not generated',
      mapsEnabled: () => d2LocalMapsEnabled(),
    });
    live.installPlanner(
      order,
      (r) => {
        const def = RUN_BY_ID[r.id];
        if (!def) return null;
        const z = def.build(1, 0);
        const a = this.renderer.planZoneAssets(z, this.game.character.classId);
        const mid = mapIdOf(r);
        return { runId: r.id, name: r.name, act: plan.actOfRun(r), sheets: a.sheets, map: a.map ?? mid ?? undefined, complete: !mid || !!d2Map(mid) };
      },
      inst,
    );
    inst.start();
  }

  /** Reconstruit la zone courante (sols, décors) sans toucher à la simulation : graphismes locaux devenus disponibles */
  private async rebuildZoneGraphics(): Promise<void> {
    if (!this.currentWorld || this.loadingZone || !this.renderer) return;
    this.loadingZone = true;
    const w = this.currentWorld;
    try {
      this.renderer.clearZone();
      this.showLoading(w.zone.name, 0);
      await this.setZoneGated(w, (d, t, step) => this.showLoading(w.zone.name, d / t, zoneStepLabel(w.zone.name, step ?? 'scene')));
    } finally {
      this.hideLoading();
      this.loadingZone = false;
    }
  }

  private showLoading(title: string, progress: number, detail?: string, eta?: string, extra?: HTMLElement): void {
    if (!this.loadingEl) {
      this.loadingEl = el('div', { cls: 'loading' });
      this.root.appendChild(this.loadingEl);
    }
    this.loadingEl.classList.toggle('has-problem', !!extra);
    const art = d2LoadingArt();
    const pic = art
      ? el('div', { cls: 'art', style: { backgroundImage: `url("${art.url}")`, backgroundPosition: `0 ${(Math.min(art.frames - 1, Math.floor(progress * art.frames)) / (art.frames - 1)) * 100}%` } })
      : null;
    this.loadingEl.replaceChildren(
      el(
        'div',
        {},
        ...(pic ? [pic] : []),
        el('div', { textContent: title }),
        ...(detail ? [el('div', { cls: 'detail', textContent: detail })] : []),
        el('div', { cls: 'bar' }, el('div', { cls: 'fill', style: { transform: `scaleX(${progress})` } })),
        ...(eta ? [el('div', { cls: 'eta', textContent: eta })] : []),
        ...(extra ? [extra] : []),
      ),
    );
  }

  /* ------------- mode local sans repli : préparation avant le jeu ------------- */

  /** Libellé et temps restant d'une progression de préparation (l'écran de chargement) */
  private prepText(p: PrepProgress, town: boolean): { detail: string; eta: string } {
    const detail = p.stage ? stageLabel(p.stage, p.done, p.total, town) : '';
    const e = fmtEta(p.etaSeconds);
    return { detail, eta: e ? `${tr('Temps restant estimé')} : ${e}` : '' };
  }

  /**
   * Mode local sans repli, avant le premier écran : interface puis icônes. Si les fichiers Diablo II sont introuvables (copie perdue) et
   * qu'il manque quelque chose, re-sélection guidée ; le jeu ne démarre pas avec les graphismes d'origine.
   */
  private async localBootGate(bank: SpriteBank): Promise<void> {
    const title = tr(prepTitle(false));
    const mk = (id: string): PrepItem => ({ id, kind: 'extra', weight: 2 });
    const stages: PrepStage[] = [
      { key: 'ui', items: [mk('ui')] },
      { key: 'icons', items: ['icons:loading', 'icons:items', 'icons:skills', 'icons:ground', 'text:npc'].map(mk) },
    ];
    const dets = new Set<PrepKey>();
    void dets;
    for (;;) {
      this.showLoading(title, 0);
      const r = await bank.prepareLocal(stages, (p) => {
        const t = this.prepText(p, false);
        this.showLoading(title, p.fraction, tr(t.detail), t.eta);
      });
      this.hideLoading();
      if (!r.missing.length || d2Local.status.quotaFull) {
        if (r.missing.length) await this.prepProblem('quota');
        return;
      }
      if (!d2Local.hasFiles) {
        if (!(await this.promptFiles())) return;
        continue;
      }
      if ((await this.prepFailure('interface', r.missing)) === 'retry') continue;
      return;
    }
  }

  /** Mode local sans repli : carte de la ville (données) prête avant la première zone */
  private async localTownGate(): Promise<void> {
    const title = tr(prepTitle(true));
    const tier = this.renderer.quality.tier;
    const maps = d2Local.catalog?.maps ?? [];
    if (!d2Local.hasFiles || !maps.includes('harrogath')) return;
    const stages: PrepStage[] = [{ key: 'map', items: [{ id: 'harrogath', kind: 'map', weight: 3, tier, dataOnly: true }] }];
    for (;;) {
      this.showLoading(title, 0, tr(stageLabel('map', 0, 1)));
      const r = await this.renderer.bank.prepareLocal(stages, (p) => {
        const t = this.prepText(p, true);
        this.showLoading(title, p.fraction, tr(t.detail), t.eta);
      });
      this.hideLoading();
      if (!r.missing.length) return;
      if (d2Local.status.quotaFull) {
        await this.prepProblem('quota');
        return;
      }
      if ((await this.prepFailure('map', r.missing)) !== 'retry') return;
    }
  }

  /**
   * Zone : préparation bloquante (écran de chargement avec étape et temps restant) puis construction de la scène. Mode d'origine : appel direct.
   */
  private async setZoneGated(w: World, onProgress: (d: number, t: number, step?: ZoneStep) => void, noMap = false): Promise<void> {
    if (!d2Info.local) {
      await this.renderer.setZone(w, onProgress, undefined, noMap);
      return;
    }
    const town = !!w.zone.town;
    const title = tr(prepTitle(town));
    for (let attempt = 0; attempt < 8; attempt++) {
      const prep = {
        sounds: (ids: string[]) => this.soundItems(w, ids),
        onStage: (p: PrepProgress, st: PrepStage[]) => {
          void st;
          const t = this.prepText(p, town);
          this.showLoading(title, 0.9 * p.fraction, tr(t.detail), t.eta);
        },
      };
      const r = await this.renderer.setZone(w, (d, t, step) => this.showLoading(title, 0.9 + 0.1 * (d / t), tr(zoneStepLabel(w.zone.name, step ?? 'scene'))), prep, noMap);
      if (!r.missing.length) return;
      const quota = d2Local.status.quotaFull;
      if (!d2Local.hasFiles && !quota) {
        this.hideLoading();
        if (await this.promptFiles()) continue;
        return;
      }
      this.hideLoading();
      if (quota) {
        await this.prepProblem('quota');
        return;
      }
      if ((await this.prepFailure(`zone ${w.zone.name}`, r.missing)) === 'retry') continue;
      return;
    }
  }

  /** Étape « Sons » : les sons de la zone (distribution complète) décodés d'avance par les archives, dans le Worker audio */
  private soundItems(w: World, monsterIds: string[]): PrepItem[] {
    const bank = this.renderer.bank;
    return [
      {
        id: 'zone-sounds',
        kind: 'sound',
        weight: 1.5,
        run: async () => {
          // l'index sonore se charge en tâche de fond : court délai ; sans archives sonores, rien à préparer (sons du jeu)
          for (let i = 0; i < 40 && !this.audio.d2Ready; i++) await new Promise((r) => setTimeout(r, 100));
          if (!this.audio.d2Ready) return true;
          const t = this.audio.zoneSoundTargets(w, w.zone.town ? 'harrogath' : (this.game.runDef?.zoneKey ?? 'tristram'), monsterIds);
          for (const r of t.ranges) await bank.d2ReadRange(r.path, r.range);
          for (const f of t.files) await bank.d2Read(f);
          return true;
        },
      },
    ];
  }

  /** Fichiers Diablo II introuvables : l'écran d'import (re-sélection guidée) ; true si de nouveaux fichiers sont fournis */
  private async promptFiles(): Promise<boolean> {
    const { showD2Choice } = await import('./ui/d2-choice');
    const r = await showD2Choice({ encrypted: false, start: 'import', allowSkip: D2_SKIP_ALLOWED });
    if (r.kind === 'local') return d2Local.hasFiles;
    if (r.kind === 'skip') {
      // choix explicite du joueur : graphismes de remplacement pour cet onglet
      try {
        sessionStorage.setItem('d2m.d2skip', '1');
        localStorage.removeItem('d2m.d2local');
      } catch {
        /* ignoré */
      }
      location.reload();
      await new Promise(() => undefined);
    }
    return false;
  }

  /** Texte de diagnostic (copiable) d'un échec de préparation */
  private prepDiagnostic(step: string, missing: string[]): Promise<string> {
    return buildPrepDiagnostic(step, missing);
  }

  /**
   * Échec de préparation : jamais bloquant. Message réel (asset et erreur technique), « Retry » (relance seulement les assets échoués),
   * « Continue anyway » (le jeu démarre ; l'interface garde son repli d'origine pour ce qui manque, la génération reprend en arrière-plan)
   * et « Copy error details ».
   */
  private async prepFailure(step: string, missing: string[]): Promise<'retry' | 'continue'> {
    const ids = missingAssetIds(missing);
    const items = ids.map((id) => d2Local.failureOf(id)).filter((f): f is NonNullable<typeof f> => !!f);
    const shown = items.length ? items : [];
    const lines = shown.slice(0, 3).map((f) => `${f.id}: ${f.error}`);
    if (!lines.length) lines.push(missing.slice(0, 3).join(', '));
    if (missing.length > 3) lines.push(`… (${missing.length})`);
    const diag = await this.prepDiagnostic(step, missing);
    try {
      console.warn(diag);
    } catch {
      /* ignoré */
    }
    return new Promise<'retry' | 'continue'>((resolve) => {
      const retry = el('button', { cls: 'btn primary', type: 'button', textContent: tr('Retry') });
      const cont = el('button', { cls: 'btn', type: 'button', textContent: tr('Continue anyway') });
      const copy = el('button', { cls: 'btn', type: 'button', textContent: tr('Copy error details') });
      // données corrompues (signature, décompression…) ou copie non vérifiée : vérifier / réparer la copie des fichiers
      const suspect = shown.some((f) => looksCorrupt(f.error)) || d2Local.status.integrity.state === 'damaged';
      const repair = el('button', { cls: 'btn primary', type: 'button', textContent: 'Verify / repair files' });
      const repairMsg = el('div', { cls: 'err-msg', textContent: '' });
      repairMsg.hidden = true;
      const msg = el('div', {
        cls: 'err-msg',
        textContent: `${tr(
          problemText(
            'failed',
            `${step}: ${missing
              .slice(0, 3)
              .map((m) => m.replace(/^\w+:/, ''))
              .join(', ')}${missing.length > 3 ? '…' : ''}`,
          ),
        )}`,
      });
      const tech = el('pre', { cls: 'err-tech', textContent: lines.join('\n') });
      // archive manquante (d'après la table des archives requises) : nommée, avec un bouton direct qui n'ajoute QUE celle-là
      const lack = missingOf(
        requiredForAll(ids),
        d2Local.fileInfo().map((f) => f.name),
      );
      const addBtns = lack.map((m) => {
        const b = el('button', { cls: 'btn primary', type: 'button', textContent: `Add ${m}` });
        b.addEventListener(
          'click',
          () =>
            void pickAndAddMpq(m, (t) => {
              repairMsg.hidden = false;
              repairMsg.textContent = t;
            }).then((ok) => ok && finish('retry')),
        );
        return b;
      });
      if (lack.length) msg.textContent += ` Required: ${lack.join(', ')}.`;
      const btns = [...addBtns, ...(d2Local.status.source === 'opfs' && suspect ? [repair, retry, cont, copy] : [retry, cont, copy])];
      const box = el('div', { cls: 'problem' }, msg, repairMsg, el('div', { cls: 'err-btns' }, ...btns), tech);
      this.showLoading('D2 Mobile', 1, undefined, undefined, box);
      const finish = (v: 'retry' | 'continue') => {
        d2Local.clearFailed(ids);
        this.hideLoading();
        if (v === 'continue') {
          // ce qui manque est retenté en arrière-plan (l'interface et les icônes s'installent à l'arrivée : onExtra)
          for (const m of missing) {
            const mm = /^extra:(.*)$/.exec(m);
            if (mm) void d2Local.request(mm[1], 'lo', PRIO.background);
          }
        }
        resolve(v);
      };
      retry.addEventListener('click', () => finish('retry'));
      repair.addEventListener('click', () => {
        repair.disabled = true;
        repairMsg.hidden = false;
        repairMsg.textContent = 'Verifying files…';
        const unsub = d2Local.subscribe((s2) => {
          if (s2.copy?.verifying && s2.copy.total) repairMsg.textContent = `Verifying files… ${Math.round((100 * s2.copy.all) / s2.copy.total)}%`;
        });
        void d2Local.repairFiles().then(async (r) => {
          unsub();
          repair.disabled = false;
          repairMsg.textContent = r.message;
          if (r.action !== 'reselect') return;
          // copie abîmée : re-sélection guidée (recopie vérifiée), puis nouvel essai
          this.hideLoading();
          d2Local.clearFailed(ids);
          const ok = await this.promptFiles();
          resolve(ok ? 'retry' : 'continue');
        });
      });
      cont.addEventListener('click', () => finish('continue'));
      copy.addEventListener('click', () => {
        const ok = () => (copy.textContent = tr('Copied'));
        const fallback = () => {
          const ta = el('textarea', { cls: 'err-copy' });
          ta.value = diag;
          ta.readOnly = true;
          box.append(ta);
          ta.focus();
          ta.select();
          try {
            document.execCommand('copy');
            ok();
          } catch {
            /* le texte reste sélectionnable */
          }
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(diag).then(ok, fallback);
        else fallback();
      });
    });
  }

  /** Problème de préparation : message clair, le jeu continue sans l'élément manquant (rien n'est remplacé par un sprite d'origine) */
  private async prepProblem(kind: PrepProblem, detail = ''): Promise<void> {
    const text = tr(problemText(kind, detail));
    const btn = el('button', { cls: 'btn primary', textContent: tr('Continuer') });
    const box = el('div', { cls: 'problem' }, el('div', { textContent: text }), btn);
    this.showLoading('D2 Mobile', 1, undefined, undefined, box);
    await new Promise<void>((res) => btn.addEventListener('click', () => res(), { once: true }));
    this.hideLoading();
  }

  /**
   * Mode local sans repli : une run ne démarre que si les cartes (données) de Diablo II hors campagne sont prêtes (sinon la zone prendrait
   * son sol d'origine). Les cartes manquantes passent en priorité ; le message indique la progression.
   */
  private installRunGate(): void {
    this.game.runGate = (runId: string): string | null => {
      if (!d2Info.local || !d2LocalMapsEnabled()) return null;
      const maps = (d2Local.catalog?.maps ?? []).filter((id) => !/^a[1-5]_/.test(id));
      if (!maps.length || !d2Local.hasFiles || d2Local.status.quotaFull) return null;
      const need = maps.filter((id) => !d2Local.mapDataReady(id) && !d2Local.hasFailed(`mapdata:${id}`) && !d2Local.hasFailed(`map:${id}`));
      if (!need.length) return null;
      const tier = this.renderer.quality.tier;
      for (const id of need) void d2Local.requestMap(id, { tier, prio: PRIO.player, data: true });
      void runId;
      return `${tr('Préparation des cartes de Diablo II')} ${maps.length - need.length}/${maps.length}…`;
    };
  }

  private hideLoading(): void {
    this.loadingEl?.remove();
    this.loadingEl = null;
  }

  /* ------------------------------ Cycle de vie ------------------------------ */

  saveNow(): void {
    this.lastSave = performance.now();
    if (this.bench) return;
    if (!this.slot) return;
    // jamais d'exception ici (pause au passage en arrière-plan) ; un échec d'écriture prévient le joueur (platform.ts : alerte « save »)
    try {
      // coffre partagé d'abord : un objet fondu dans le partagé n'est retiré du personnage qu'une fois le partagé écrit
      const sharedOk = SaveStore.saveShared(this.game.sharedStash(), this.game.ruleset);
      if (sharedOk || !this.game.stashMigration) SaveStore.save(this.game.toSave(), this.slot);
    } catch (e) {
      reportError('sauvegarde', e);
    }
  }

  /** Benchmark : Tristram, bot de jeu, qualité automatique, 60 s, puis résultats à l'écran */
  private async runBenchmark(): Promise<void> {
    const g = this.game;
    g.settings.quality = 'auto';
    g.settings.showPerf = true;
    const c = g.character;
    G.addXp(c, G.xpToReach(24));
    this.setBot(true);
    const brain = this.botBrain!;
    brain.spendSkillPoints();
    brain.spendStatPoints();
    g.startRun('tristram', 0, 1);
    await new Promise((r) => setTimeout(r, 3000));
    this.metrics.frameIntervals.length = 0;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 60000));
    const a = [...this.metrics.frameIntervals].sort((x, y) => x - y);
    const q = (p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
    const secs = (performance.now() - t0) / 1000;
    const res = {
      images: a.length,
      ips: +(a.length / secs).toFixed(1),
      medianeMs: +q(0.5).toFixed(1),
      p95Ms: +q(0.95).toFixed(1),
      pireMs: +(a[a.length - 1] ?? 0).toFixed(1),
      qualite: this.qualityName,
      texturesMo: +(this.renderer.bank.gpuBytes() / 1048576).toFixed(1),
      ecran: `${innerWidth}×${innerHeight} @${devicePixelRatio}`,
    };
    this.setBot(false);
    console.log('BENCHMARK', JSON.stringify(res)); // sortie volontaire du mode ?bench=1 (lue aussi dans window.__bench par les scripts de mesure)
    window.__bench = res;
    const box = el(
      'div',
      { cls: 'loading' },
      el('div', {}, el('div', { textContent: 'Benchmark terminé' }), el('pre', { textContent: JSON.stringify(res, null, 1), style: { textAlign: 'left', fontSize: '13px' } })),
    );
    this.root.appendChild(box);
  }

  private async importSave(): Promise<void> {
    const s = await SaveStore.importFile();
    if (!s) return;
    if (!confirm(`Importer « ${s.character.name} » niveau ${s.character.level} comme nouveau personnage ?`)) return;
    // la sauvegarde importée devient un nouveau personnage (aucun n'est écrasé)
    this.saveNow();
    const slot = SaveStore.newSlot();
    SaveStore.save(s, slot);
    SaveStore.setActive(slot);
    location.reload();
  }

  private bindLifecycle(stage: HTMLElement): void {
    // dernière entrée utilisée : bascule tactile <-> souris + clavier (appareils hybrides), avant tout autre écouteur
    window.addEventListener('pointerdown', (e) => this.inputMode.noteInput(e.pointerType === 'touch' ? 'touch' : 'mouse'), { capture: true, passive: true });
    // souris ou clavier branchés, pliable plié / déplié : capacités relues, mode recalculé
    watchCapabilities(this.inputMode);
    window.addEventListener('pointermove', (e) => e.pointerType !== 'touch' && this.inputMode.noteInput('mouse'), { capture: true, passive: true });
    window.addEventListener('keydown', () => this.inputMode.capabilities.anyFine && this.inputMode.noteInput('mouse'), { capture: true, passive: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { passive: true });
    const firstTouch = () => {
      this.audio.unlock();
      void keepAwake();
      void enterFullscreenLandscape();
    };
    window.addEventListener('pointerdown', firstTouch, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // pause immédiate et sauvegarde complète, y compris en pleine run
        this.paused = true;
        this.saveNow();
        this.audio.suspend();
        this.controls.resetAll();
        releaseAwake();
      } else {
        this.paused = false;
        this.last = performance.now();
        this.audio.resume();
        void keepAwake();
      }
    });
    window.addEventListener('pagehide', () => this.saveNow());
    window.addEventListener('blur', () => this.controls.resetAll());
    // redimensionnement, rotation, plein écran : une seule remise à l'échelle une fois la taille stabilisée,
    // et la mesure de fluidité est suspendue (sinon la qualité chutait, ce qui rechargeait toutes les planches :
    // personnage et mercenaire perdaient leurs jambes le temps du rechargement)
    const onResize = (reset: boolean) => {
      // le plein écran se déclenche au premier toucher : y remettre les commandes à zéro annulerait le premier glissement du joystick
      if (reset) this.controls.resetAll();
      this.perfHoldUntil = performance.now() + 4000;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        requestAnimationFrame(() => {
          this.renderer.resize();
          this.applySettings(this.game.settings);
        });
      }, 120);
    };
    window.addEventListener('resize', () => onResize(true));
    window.addEventListener('orientationchange', () => onResize(false));
    document.addEventListener('fullscreenchange', () => onResize(false));
    // perte du contexte WebGL : on met en pause ; Pixi recharge les textures à la restauration
    const canvas = this.renderer.app.canvas;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.saveNow();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.last = performance.now();
      if (this.currentWorld) void this.renderer.setZone(this.currentWorld);
    });
    void stage;
  }
}
