/**
 * Panneau des réglages du jeu (catégories, recherche, sauvegarde, installation, journal).
 * Le catalogue (catégories, libellés, aide, recherche) est dans `settings-catalog.ts` ; ici, la fabrication des contrôles et la mise en page.
 * Fonctions extraites de la classe Panels (panels.ts) : `this` / `p` y désigne l'instance.
 */
import type { Game } from '../sim/game';
import { classOf } from '../data/classes';
import { el, holdButton } from './dom';
import { unseenChanges } from './changelog';
import { getLang, setLang, tr, verbatim } from '../i18n';
import {
  GROUP_HELP,
  SETTINGS_CATS,
  catFields,
  catInfo,
  entriesOf,
  fieldValue,
  resetCategory,
  searchSettings,
  setFieldValue,
  settingDefaults,
  type SettingsCat,
  type SettingsEntry,
  type SettingsField,
} from './settings-catalog';
import { PACKS, packState } from '../platform/packs';
import { bindUpdateControl, SETTINGS_UPDATE_LABELS } from './update-link';
import { d2Info, resetD2Password } from '../render/assets';
import { buildD2LocalSection } from './d2local-ui';
import { installControl, installState } from '../platform/install';
import type { Settings } from '../sim/save';
import { syncSection } from './sync-ui';
import { statsSection } from './stats-ui';
import type { Panels } from './panels';
import { RULES, type SettingsLayout } from '../mods/rules';
import { SETTINGS_CAT_KEY, PRESET_NAMES } from './panels-shared';

/** Fabrique du contrôle d'une option (appelée seulement pour les options affichées) ; null : rien à afficher */
type OptionBuilder = () => HTMLElement | null;
type ChoiceVals = [string | number, string][];

/** Options à choix exclusif : libellé de la ligne et valeurs (valeur du réglage, libellé du bouton). L'identifiant de l'option est la clé du réglage. */
const CHOICE_ROWS: Partial<Record<SettingsField, [string, ChoiceVals]>> = {
  lootRate: [
    'Taux de butin',
    [
      ['normal', 'Normal'],
      ['fast', 'Rapide'],
      ['veryfast', 'Très rapide'],
      ['abundant', 'Abondant'],
    ],
  ],
  quality: [
    'Qualité graphique',
    [
      ['auto', 'Auto'],
      ['low', 'Basse'],
      ['medium', 'Moyenne'],
      ['high', 'Haute'],
    ],
  ],
  bigCells: [
    'Grandes cases (inventaire, coffre)',
    [
      ['auto', 'Auto'],
      ['on', 'Oui'],
      ['off', 'Non'],
    ],
  ],
  lighting: [
    'Luminosité',
    [
      ['clair', 'Claire'],
      ['penombre', 'Pénombre'],
      ['d2', 'Diablo 2'],
    ],
  ],
  dynamicLight: [
    'Éclairage dynamique',
    [
      ['off', 'Désactivé'],
      ['light', 'Léger'],
      ['normal', 'Normal'],
    ],
  ],
  screenShake: [
    'Secousses d’écran',
    [
      [0, 'Non'],
      [0.5, 'Légères'],
      [1, 'Normales'],
    ],
  ],
  imageSharpen: [
    'Netteté',
    [
      [0, 'Aucune'],
      [1, 'Légère'],
      [2, 'Moyenne'],
      [3, 'Forte'],
    ],
  ],
  imageScale: [
    'Mise à l’échelle',
    [
      ['normal', 'Normale'],
      ['soft', 'Douce'],
      ['pixel', 'Pixel-art'],
    ],
  ],
  imageMood: [
    'Ambiance',
    [
      ['normal', 'Normale'],
      ['dark', 'Sombre'],
      ['warm', 'Chaude'],
      ['cold', 'Froide'],
      ['vivid', 'Vive'],
    ],
  ],
  controls: [
    'Commandes',
    [
      ['auto', 'Auto'],
      ['touch', 'Tactile'],
      ['pc', 'Souris + clavier'],
    ],
  ],
  haptics: [
    'Vibrations',
    [
      [0, 'Non'],
      [1, 'Normales'],
      [2, 'Fortes'],
    ],
  ],
  autoPickupRunes: [
    'Runes',
    [
      ['none', 'Aucune'],
      ['pul', 'Sous Pul'],
      ['vex', 'Sous Vex'],
      ['all', 'Toutes'],
    ],
  ],
  autoPickupGems: [
    'Gemmes',
    [
      ['none', 'Aucune'],
      ['all', 'Toutes'],
      ['normal', 'Normales et +'],
      ['flawless', 'Sans défaut et +'],
    ],
  ],
  autoPickupMaps: [
    'Cartes',
    [
      ['none', 'Aucune'],
      ['all', 'Toutes'],
      ['rare', 'Rares et +'],
      ['magic', 'Magiques et +'],
    ],
  ],
};

/** Options Oui / Non : libellé de la ligne (l'identifiant de l'option est la clé du réglage) */
const TOGGLE_ROWS: Partial<Record<SettingsField, string>> = {
  durability: 'Durabilité des armes et armures',
  freeRespec: 'Réinitialisation gratuite des points',
  potionUpgrade: 'Potions qui montent en gamme',
  instantCast: 'Lancement instantané des sorts',
  tips: 'Conseils de jeu',
  damageNumbers: 'Chiffres de dégâts',
  imageSmooth: 'Lissage des bords',
  showCollisions: 'Afficher les collisions',
  showPerf: 'Affichage des performances',
  leftHanded: 'Gaucher (commandes inversées)',
  walkButton: 'Bouton Marche / Course (touche R)',
  imageButton: 'Bouton Image (touche V)',
  autoPickupPotions: 'Potions',
  autoPickupMaterials: 'Composants',
  beltRefill: 'Remplissage de la ceinture',
  confirmCorrupt: 'Corrompre un objet',
  confirmMapUpgrade: 'Améliorer une carte',
};

/** Durée d'appui maintenu pour supprimer le personnage (ms) */
const DELETE_HOLD_MS = 1500;

export function settingsImpl(this: Panels, g: Game): HTMLElement {
  const build = optionBuilders(this, g);
  const hidden = hiddenOptions(this, build);
  const layout = RULES['ui.settings'](g);
  return this.frame('Réglages', layout ? flatPane(this, g, build, hidden, layout) : settingsPane(this, g, build, hidden));
}

/**
 * A game mode's settings (rule `ui.settings`, lot 286): one page, no folded category nor search box (a few options). The mode's rows first under its title, then the base's
 * options kept, in the rule's order; a category's name is shown over its options only when two of them or more follow each other.
 */
function flatPane(p: Panels, g: Game, build: Record<string, OptionBuilder>, hidden: Set<string>, layout: SettingsLayout): HTMLElement {
  const st = g.settings;
  const byId = new Map(SETTINGS_CATS.flatMap((c) => entriesOf(c.id)).map((e) => [e.id, e]));
  const kept = layout.keep.map((id) => byId.get(id)).filter((e): e is SettingsEntry => !!e && !hidden.has(e.id));
  const nodes = kept.map((e) => ({ e, node: build[e.id]?.() ?? null })).filter((x): x is { e: SettingsEntry; node: HTMLElement } => !!x.node);
  const body = el('div', { cls: 'col set-body set-flat' });
  const rows = layout.rows ?? [];
  if (rows.length) {
    if (layout.title) body.append(el('div', { cls: 'lvl', textContent: layout.title }));
    for (const r of rows) {
      const wrap = el('div', { cls: 'setopt', data: { opt: r.key } }, row(r.label, choice(p, st, r.key, r.values as [string | number, string][])));
      if (r.help) wrap.append(el('div', { cls: 'set-help', textContent: r.help }));
      body.append(wrap);
    }
  }
  nodes.forEach(({ e, node }, i) => {
    const sameAs = (j: number) => nodes[j]?.e.cat === e.cat;
    if (!sameAs(i - 1) && sameAs(i + 1)) body.append(el('div', { cls: 'lvl', textContent: catInfo(e.cat).name }));
    const wrap = el('div', { cls: 'setopt', data: { opt: e.id } }, node);
    if (e.help && e.id !== 'lootFilter' && e.id !== 'packs') wrap.append(el('div', { cls: 'set-help', textContent: e.help }));
    body.append(wrap);
  });
  return el('div', { cls: 'col scroll setpane', style: { flex: '1' } }, body);
}

/** Ligne « libellé | contrôle » */
function row(label: string, input: HTMLElement): HTMLElement {
  return el('div', { cls: 'statrow' }, el('span', { textContent: label }), input);
}

/** Boutons à choix exclusif d'un réglage (valeur par défaut soulignée : classe `dflt`) */
function choice<T extends string | number>(p: Panels, st: Settings, key: SettingsField, vals: [T, string][]): HTMLElement {
  const box = el('div', { cls: 'tabs' });
  for (const [v, l] of vals) {
    const b = el('button', { cls: `btn${fieldValue(st, key) === v ? ' sel' : ''}${(settingDefaults() as Record<string, unknown>)[key] === v ? ' dflt' : ''}`, textContent: l });
    b.addEventListener('click', () => {
      setFieldValue(st, key, v);
      p.host.onSettingsChanged(st);
      p.render();
    });
    box.append(b);
  }
  return box;
}

function toggle(p: Panels, st: Settings, key: SettingsField): HTMLElement {
  return choice(p, st, key, [
    [true as unknown as string, 'Oui'],
    [false as unknown as string, 'Non'],
  ]);
}

/**
 * Contrôles de chaque option, par identifiant du catalogue. Les éléments à état (boutons d'action, curseurs) sont créés tout de suite,
 * à chaque rendu du panneau, comme l'écouteur d'état de la mise à jour ; les lignes de réglage simples le sont à la demande.
 */
function optionBuilders(p: Panels, g: Game): Record<string, OptionBuilder> {
  const st = g.settings;
  // maintenir appuyé = rendu sans filtre (les panneaux deviennent transparents, voir style.css)
  const compareBtn = el('button', { cls: 'btn', textContent: 'Maintenir pour comparer' });
  const cmp = (on: boolean) => p.host.onImageCompare?.(on);
  compareBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cmp(true);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) compareBtn.addEventListener(ev, () => cmp(false));
  st.imageSharpen ??= 0;
  st.imageSmooth ??= false;
  st.imageMood ??= 'normal';
  st.imageScale ??= 'normal';
  st.dynamicLight ??= 'off';
  st.renderEngine ??= 'webgl';
  st.imageButton ??= false;
  st.walkButton ??= false;
  const shortcutsBtn = el('button', { cls: 'btn', textContent: 'Raccourcis clavier' });
  shortcutsBtn.addEventListener('click', () => p.show('help'));
  const zoom = zoomControl(p, st);
  const vol = (key: 'sound' | 'music') => {
    const r = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(st[key]) });
    r.addEventListener('input', () => {
      st[key] = Number(r.value);
      p.host.onSettingsChanged(st);
    });
    return r;
  };
  const exp = el('button', { cls: 'btn', textContent: 'Exporter la sauvegarde' });
  exp.addEventListener('click', () => p.host.exportSave());
  const imp = el('button', { cls: 'btn', textContent: 'Importer une sauvegarde' });
  imp.addEventListener('click', () => p.host.importSave());
  const tipsReset = el('button', { cls: 'btn', textContent: 'Revoir les conseils' });
  tipsReset.addEventListener('click', () => {
    p.host.resetTips();
    p.host.message('Les conseils réapparaîtront au bon moment.');
  });
  const upd = updateButton();
  const d2Line =
    d2Info.mode === 'off'
      ? 'Sprites Diablo II : non inclus dans cette version'
      : d2Info.locked
        ? 'Sprites Diablo II : verrouillés (mot de passe non saisi ou refusé)'
        : `Sprites Diablo II : ${d2Info.imported} éléments actifs`;
  const errCount = p.host.errorLogCount?.() ?? 0;
  const errLog = p.host.exportErrorLog ? el('button', { cls: 'btn', textContent: errCount ? `Exporter le journal d’erreurs (${errCount})` : 'Exporter le journal d’erreurs (vide)' }) : null;
  errLog?.addEventListener('click', () => p.host.exportErrorLog?.());
  const d2Reset = d2Info.mode === 'enc' ? el('button', { cls: 'btn', textContent: 'Ressaisir le mot de passe des sprites D2' }) : null;
  d2Reset?.addEventListener('click', () => resetD2Password());
  const news = unseenChanges();
  const changes = el('button', { cls: `btn${news ? ' primary' : ''}`, textContent: news ? `Nouveautés (${news})` : 'Nouveautés' });
  changes.addEventListener('click', () => p.show('changelog'));
  const cred = el('button', { cls: 'btn', textContent: 'Crédits' });
  cred.addEventListener('click', () => p.show('credits'));
  const reset = holdButton(`Supprimer ${verbatim(g.character.name)} (${classOf(g.character.classId).name})`, () => p.host.resetSave(), DELETE_HOLD_MS, 'btn danger');
  const switchChar = el('button', { cls: 'btn primary', textContent: 'Changer de personnage' });
  switchChar.addEventListener('click', () => p.host.switchCharacter());
  const f = g.character.filter;
  const openFilter = el('button', { cls: 'btn', textContent: 'Régler le filtre de butin' });
  openFilter.addEventListener('click', () => p.show('filter'));
  const langRow = languageRow(p);
  const build: Record<string, OptionBuilder> = {};
  for (const [key, [label, vals]] of Object.entries(CHOICE_ROWS) as [SettingsField, [string, ChoiceVals]][]) build[key] = () => row(label, choice(p, st, key, vals));
  for (const [key, label] of Object.entries(TOGGLE_ROWS) as [SettingsField, string][]) build[key] = () => row(label, toggle(p, st, key));
  return Object.assign(build, {
    lang: () => langRow,
    lootFilter: () =>
      el(
        'div',
        { cls: 'col', style: { gap: '4px' } },
        el('div', { cls: 'set-help', textContent: `Préréglage actuel : ${PRESET_NAMES[f.preset]}. L'or, les potions, les cartes, les orbes et les objets set/uniques sont toujours ramassés.` }),
        openFilter,
      ),
    tipsReset: () => tipsReset,
    switchChar: () => switchChar,
    bigInventory: () => bigInventoryRow(p, g),
    zoom: () => row('Zoom', zoom),
    renderEngine: () => renderEngineRow(p, st),
    imageCompare: () => row('Comparer avec le rendu d’origine', compareBtn),
    shortcuts: () => row('Raccourcis clavier', shortcutsBtn),
    sound: () => row('Effets sonores', vol('sound')),
    music: () => row('Musique d’ambiance', vol('music')),
    sync: () => syncSection(),
    exportSave: () => exp,
    importSave: () => imp,
    packs: () => {
      const box = packsSection(p, g);
      return el('div', { cls: 'col', style: { gap: '4px' } }, el('div', { cls: 'set-help', textContent: d2Line }), ...(box ? [box] : []));
    },
    d2Reset: () => d2Reset,
    resetSave: () => reset,
    install: () => installControl(),
    update: () => upd,
    errLog: () => errLog,
    stats: () => statsSection(() => p.render()),
    d2local: () => buildD2LocalSection((text, color) => p.host.message(text, color)),
    changelog: () => changes,
    credits: () => cred,
  } satisfies Record<string, OptionBuilder>);
}

/** Curseur de zoom : 80 % = dézoom maximal (on voit 25 % de monde en plus) ; 100 % = vue d'origine ; au-delà, on se rapproche */
function zoomControl(p: Panels, st: Settings): HTMLElement {
  const zoom = el('input', { type: 'range', min: '0.8', max: '1.25', step: '0.05', value: String(st.zoom) });
  const zoomPct = el('small', { cls: 'base', textContent: `${Math.round(st.zoom * 100)} %` });
  zoom.addEventListener('input', () => {
    st.zoom = Math.round(Number(zoom.value) * 100) / 100;
    zoomPct.textContent = `${Math.round(st.zoom * 100)} %`;
    p.host.onSettingsChanged(st);
  });
  return el('span', { cls: 'zoomctl' }, zoom, zoomPct);
}

/** Bouton de mise à jour de l'application (lot 297 : le même contrôle que l'accueil, sa barre de progression ; une version trouvée attend un deuxième appui) */
function updateButton(): HTMLButtonElement {
  return bindUpdateControl(el('button', { cls: 'btn', data: { testid: 'settings-update' } }), SETTINGS_UPDATE_LABELS, false) as HTMLButtonElement;
}

/** Langue : l'anglais est la langue par défaut ; le choix s'applique tout de suite (traduction du texte affiché) et reste sur l'appareil */
function languageRow(p: Panels): HTMLElement {
  const langRow = el('div', { cls: 'statrow' }, el('span', { textContent: 'Language / Langue' }));
  const langTabs = el('div', { cls: 'tabs' });
  for (const [v, label] of [
    ['en', 'English'],
    ['fr', 'Français'],
  ] as const) {
    const b = el('button', { cls: `btn${getLang() === v ? ' sel' : ''}`, textContent: label });
    b.addEventListener('click', () => {
      setLang(v);
      p.render();
    });
    langTabs.append(b);
  }
  langRow.append(langTabs);
  return langRow;
}

/** Grand inventaire (10 × 8) : le retour à 4 rangées est refusé tant que les rangées du bas sont occupées */
function bigInventoryRow(p: Panels, g: Game): HTMLElement {
  const st = g.settings;
  const box = el('div', { cls: 'tabs' });
  for (const [v, l] of [
    [true, 'Oui'],
    [false, 'Non'],
  ] as [boolean, string][]) {
    const b = el('button', { cls: `btn${(st.bigInventory === true) === v ? ' sel' : ''}${v ? ' dflt' : ''}`, textContent: l });
    b.addEventListener('click', () => {
      if (!g.setBigInventory(v)) p.host.message('Libère les rangées du bas de l’inventaire (ou fais de la place au coffre) avant de revenir à 4 rangées.', '#d66');
      p.host.onSettingsChanged(st);
      p.render();
    });
    box.append(b);
  }
  return row('Grand inventaire', box);
}

/** Moteur de rendu : état du moteur actif, et rechargement proposé quand le choix diffère du moteur en cours */
function renderEngineRow(p: Panels, st: Settings): HTMLElement {
  const info = p.host.renderEngineInfo?.();
  const box = el(
    'div',
    {},
    row(
      'Moteur de rendu',
      choice(p, st, 'renderEngine', [
        ['webgl', 'WebGL'],
        ['webgpu', 'WebGPU (expérimental)'],
      ]),
    ),
  );
  if (info?.status) box.append(el('div', { cls: info.status.kind === 'warn' ? 'set-help warn' : 'set-help', textContent: info.status.text }));
  if (info && (st.renderEngine ?? 'webgl') !== info.active && p.host.reloadGame) {
    const b = el('button', { cls: 'btn', textContent: 'Recharger maintenant' });
    b.addEventListener('click', () => p.host.reloadGame?.());
    box.append(b);
  }
  return box;
}

/** Contenus téléchargeables : préchargement par pack (les zones se téléchargent de toute façon à la première visite) ; null si rien à proposer */
function packsSection(p: Panels, g: Game): HTMLElement | null {
  const packsBox = el('div', { cls: 'col', style: { gap: '4px', flexShrink: '0' } });
  if (p.host.downloadPack && d2Info.mode !== 'off' && !d2Info.locked) {
    const state = packState();
    packsBox.append(
      el('div', { cls: 'lvl', textContent: 'Contenu à télécharger' }),
      el('div', {
        cls: 'base',
        textContent:
          'Chaque zone se télécharge une seule fois (à la première visite) et reste sur l’appareil, y compris hors ligne. Un pack précharge tout d’un coup, de préférence en Wi-Fi ; l’état affiché est relu dans le stockage de l’appareil.',
      }),
    );
    for (const pk of PACKS) packsBox.append(packTile(p, g, pk, !!state[pk.id]));
  }
  return packsBox.children.length ? packsBox : null;
}

/** Tuile d'un pack : état réel relu dans le cache hors ligne (complet, incomplet, purgé), bouton télécharger / annuler */
function packTile(p: Panels, g: Game, pk: (typeof PACKS)[number], have: boolean): HTMLElement {
  const info = el('small', { cls: 'base', textContent: `${pk.desc} (≈ ${pk.mb[g.settings.quality === 'low' ? 1 : 0]} Mo)` });
  const status = el('small', { cls: 'base', textContent: have ? 'Vérification…' : '' });
  const btn = el('button', { cls: `btn${have ? '' : ' primary'}`, textContent: have ? 'Téléchargé ✓ — retélécharger' : `Télécharger : ${pk.name}` });
  void p.host.packStatus?.(pk).then((st) => {
    if (!btn.isConnected || p.packAbort) return;
    if (st.state === 'ok') {
      status.textContent = `Disponible hors ligne (${st.total} fichiers).`;
      btn.className = 'btn';
      btn.textContent = 'Téléchargé ✓ — vérifier / retélécharger';
    } else if (st.state === 'partial' || st.purged) {
      status.textContent = `Incomplet : ${st.have} / ${st.total} fichiers en stock${st.purged ? ' (le navigateur en a purgé une partie)' : ''}. Relancez pour compléter.`;
      btn.className = 'btn primary';
      btn.textContent = `Reprendre : ${pk.name}`;
    } else {
      status.textContent = '';
      btn.className = 'btn primary';
      btn.textContent = `Télécharger : ${pk.name}`;
    }
  });
  btn.addEventListener('click', () => {
    if (p.packAbort) {
      p.packAbort.abort();
      return;
    }
    const ac = (p.packAbort = new AbortController());
    btn.textContent = 'Téléchargement… (toucher pour annuler)';
    void p.host.downloadPack!(pk, (d, t) => (btn.textContent = `Téléchargement… ${d} / ${t} (toucher pour annuler)`), ac.signal)
      .then(
        () => p.host.message(`${pk.name} : téléchargé, disponible hors ligne.`, '#8f8'),
        (e: Error) => p.host.message(`${pk.name} : ${e.message || 'téléchargement interrompu'}.`, '#d66'),
      )
      .finally(() => {
        p.packAbort = null;
        p.render();
      });
  });
  return el('div', { cls: 'tip', style: { flexShrink: '0' } }, el('b', { textContent: pk.name }), el('br'), info, el('br'), status, el('br'), btn);
}

/** Options masquées dans cette version ou sur cet appareil */
function hiddenOptions(p: Panels, build: Record<string, OptionBuilder>): Set<string> {
  const hidden = new Set<string>();
  if (!build.d2Reset()) hidden.add('d2Reset');
  if (!build.errLog()) hidden.add('errLog');
  // graphismes générés sur l'appareil : proposé seulement si cette version n'embarque pas déjà le dossier des graphismes (mode off ou local)
  if (d2Info.mode !== 'off') hidden.add('d2local');
  if (installState().kind === 'none') hidden.add('install');
  if (!(p.host.downloadPack && d2Info.mode !== 'off' && !d2Info.locked) && d2Info.mode === 'off') hidden.add('packs');
  return hidden;
}

/** Dernière catégorie ouverte : relue à chaque ouverture (stockage local, sinon mémoire de la session) */
function restoreOpenCategory(p: Panels): SettingsCat | '' {
  try {
    const saved = localStorage.getItem(SETTINGS_CAT_KEY);
    if (saved !== null && (saved === '' || SETTINGS_CATS.some((c) => c.id === saved))) p.settingsUi.cat = saved as SettingsCat | '';
  } catch {
    /* stockage indisponible */
  }
  p.settingsUi.cat ??= 'game';
  return p.settingsUi.cat;
}

/** Ouvre une catégorie (une seule à la fois) et fait remonter son en-tête sous la barre de recherche */
function openCategory(p: Panels, c: SettingsCat | ''): void {
  p.settingsUi.cat = c;
  try {
    localStorage.setItem(SETTINGS_CAT_KEY, c);
  } catch {
    /* stockage indisponible */
  }
  p.settingsUi.resetAsk = null;
  p.render();
  const pane = p.root.querySelector<HTMLElement>('.setpane');
  const head = c ? pane?.querySelector<HTMLElement>(`.setcat[data-cat="${c}"]`) : null;
  if (pane && head) pane.scrollTop += head.getBoundingClientRect().top - pane.getBoundingClientRect().top - (pane.querySelector<HTMLElement>('.set-bar')?.offsetHeight ?? 0);
}

/** Mise en page : barre de recherche + catégories repliables (une seule ouverte), ou résultats de la recherche */
function settingsPane(p: Panels, g: Game, build: Record<string, OptionBuilder>, hidden: Set<string>): HTMLElement {
  const openCat = restoreOpenCategory(p);
  const option = (e: SettingsEntry): HTMLElement | null => {
    if (hidden.has(e.id)) return null;
    const node = build[e.id]?.();
    if (!node) return null;
    const wrap = el('div', { cls: 'setopt', data: { opt: e.id } }, node);
    if (e.help && !(e.id === 'lootFilter' || e.id === 'packs')) wrap.append(el('div', { cls: 'set-help', textContent: e.help }));
    return wrap;
  };
  const search = el('input', { type: 'search', cls: 'set-search', placeholder: 'Rechercher un réglage…', value: p.settingsUi.query, autocomplete: 'off', spellcheck: false });
  search.setAttribute('enterkeyhint', 'search');
  search.setAttribute('aria-label', 'Rechercher un réglage');
  const clearBtn = el('button', { cls: 'btn set-clear', textContent: '✕', title: 'Effacer la recherche' });
  const bar = el('div', { cls: 'set-bar' }, search, clearBtn);
  const body = el('div', { cls: 'col set-body' });
  const fill = () => {
    const q = p.settingsUi.query.trim();
    clearBtn.style.display = q ? '' : 'none';
    body.replaceChildren();
    if (q) searchResults(body, q, hidden, option);
    else for (const c of SETTINGS_CATS) categoryBlock(p, g, body, c, c.id === openCat, option);
  };
  search.addEventListener('input', () => {
    p.settingsUi.query = search.value;
    fill();
  });
  clearBtn.addEventListener('click', () => {
    p.settingsUi.query = '';
    search.value = '';
    fill();
    search.focus();
  });
  fill();
  return el('div', { cls: 'col scroll setpane', style: { flex: '1' } }, bar, body);
}

/** Résultats de la recherche : options correspondantes, chacune avec le nom de sa catégorie */
function searchResults(body: HTMLElement, q: string, hidden: Set<string>, option: (e: SettingsEntry) => HTMLElement | null): void {
  const found = searchSettings(q, tr).filter((e) => !hidden.has(e.id));
  body.append(
    el('div', { cls: 'set-help', textContent: found.length ? `${found.length} réglage${found.length > 1 ? 's' : ''} trouvé${found.length > 1 ? 's' : ''}` : 'Aucun réglage ne correspond.' }),
  );
  for (const e of found) {
    const o = option(e);
    if (o) body.append(el('div', { cls: 'setres' }, el('small', { cls: 'set-tag', textContent: catInfo(e.cat).name }), o));
  }
}

/** En-tête repliable d'une catégorie et, si elle est ouverte, ses options par groupe et « Rétablir les valeurs par défaut » (confirmé) */
function categoryBlock(p: Panels, g: Game, body: HTMLElement, c: (typeof SETTINGS_CATS)[number], isOpen: boolean, option: (e: SettingsEntry) => HTMLElement | null): void {
  const st = g.settings;
  const head = el('button', { cls: `btn setcat${isOpen ? ' sel' : ''}`, data: { cat: c.id }, textContent: `${isOpen ? '▾' : '▸'} ${c.name}` });
  head.setAttribute('aria-expanded', String(isOpen));
  head.addEventListener('click', () => openCategory(p, isOpen ? '' : c.id));
  body.append(head);
  if (!isOpen) return;
  const sec = el('div', { cls: 'col setsec' });
  let group: string | undefined;
  for (const e of entriesOf(c.id)) {
    const o = option(e);
    if (!o) continue;
    if (e.group !== group) {
      group = e.group;
      if (group) {
        sec.append(el('div', { cls: 'lvl', textContent: group }));
        if (GROUP_HELP[group]) sec.append(el('div', { cls: 'set-help', textContent: GROUP_HELP[group] }));
      }
    }
    sec.append(o);
  }
  if (catFields(c.id).length) {
    const rb = el('button', { cls: 'btn setreset', textContent: 'Rétablir les valeurs par défaut' });
    if (p.settingsUi.resetAsk === c.id) {
      const yes = el('button', { cls: 'btn danger', textContent: `Rétablir « ${c.name} » ?` });
      yes.addEventListener('click', () => {
        resetCategory(st, c.id);
        g.applyInventorySize();
        p.settingsUi.resetAsk = null;
        p.host.onSettingsChanged(st);
        p.render();
      });
      const no = el('button', { cls: 'btn', textContent: 'Annuler' });
      no.addEventListener('click', () => {
        p.settingsUi.resetAsk = null;
        p.render();
      });
      sec.append(el('div', { cls: 'tabs' }, yes, no));
    } else {
      rb.addEventListener('click', () => {
        p.settingsUi.resetAsk = c.id;
        p.render();
      });
      sec.append(rb);
    }
    sec.append(el('div', { cls: 'set-help', textContent: 'Les valeurs par défaut sont soulignées. Les sauvegardes et comptes ne sont jamais touchés.' }));
  }
  body.append(sec);
}
