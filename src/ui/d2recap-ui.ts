/**
 * Réglages › « Graphismes & fichiers Diablo II » : qualité, préparation automatique des zones suivantes, tableau de ce qui est généré
 * et de ce qui reste (par catégorie : interface, icônes, personnages par classe, monstres, décors et cartes par acte, effets, sons) avec
 * générer / effacer, et liste des archives MPQ (obligatoires et facultatives) avec « Ajouter ce fichier ».
 */
import { d2Local, d2LocalAutoReason, d2LocalGenTier, d2LocalModest, d2LocalTierSetting, fmtMo, setD2LocalTierSetting } from '../platform/d2local';
import { AUDIO_MPQ, PRIO, isAudioMpq } from '../platform/d2local-core';
import { buildCategories, buildRows, sheetBytes, type CatalogLike, type Category, type PlanZone, type Row } from '../platform/d2plan';
import { allPlan, livePregen, planReady } from '../platform/d2planlive';
import { pregenEnabled, setPregenEnabled } from '../platform/d2pregen';
import { missingOf, optionalFor, requiredForAll } from '../platform/d2requires';
import { CLASS_IDS, CLASSES, type ClassId } from '../data/classes';
import { el } from './dom';
import { tr } from '../i18n';
import { pickMpqFiles } from './d2pick';
import { describeFr, md5LinesFr, type ArchiveCheck } from '../platform/d2check-core';

const dur = (s: number): string => (s <= 0 ? '—' : s >= 5400 ? `${(s / 3600).toFixed(1)} h` : s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`);

/** Ce que chaque archive apporte réellement au jeu (vérifié dans le code : graphismes = tools/d2import, sons = tools/d2import/audio-build.ts) */
export interface MpqRow {
  key: string;
  name: string;
  required: boolean;
  gives: string;
  /** reconnaît le fichier choisi comme étant cette archive */
  matches: (n: string) => boolean;
  /** peut être ajoutée depuis ce menu */
  addable: boolean;
}

export const MPQ_ROWS: MpqRow[] = [
  {
    key: 'd2data',
    name: 'd2data.mpq',
    required: true,
    gives: 'Les données et images de base du jeu : monstres, décors, interface, objets, cartes, tables (obligatoire).',
    matches: (n) => n === 'd2data.mpq',
    addable: true,
  },
  {
    key: 'd2exp',
    name: 'd2exp.mpq',
    required: true,
    gives: 'L’extension Lord of Destruction : Acte V, l’Assassin et le Druide, cartes et interface de l’extension (obligatoire).',
    matches: (n) => n === 'd2exp.mpq',
    addable: true,
  },
  { key: 'd2char', name: 'd2char.mpq', required: true, gives: 'Les personnages jouables et leur équipement visible (obligatoire).', matches: (n) => n === 'd2char.mpq', addable: true },
  {
    key: 'patch_d2',
    name: 'Patch_D2.mpq',
    required: false,
    gives: 'Les tables du patch 1.10+ : monstres placés sur les cartes (monpreset.txt). Sans lui les cartes Diablo II n’ont pas de monstres posés. Facultatif.',
    matches: (n) => n === 'patch_d2.mpq',
    addable: true,
  },
  {
    key: 'pd2',
    name: 'Patch Project Diablo 2',
    required: false,
    gives: 'Le mod : ses fichiers remplacent ceux du jeu de base (graphismes et données du mod). Facultatif.',
    matches: (n) => /^(pd2.*|.*patch.*)\.mpq$/.test(n) && n !== 'patch_d2.mpq',
    addable: true,
  },
  ...AUDIO_MPQ.map((a): MpqRow => ({
    key: a.name.replace('.mpq', ''),
    name: a.name,
    required: false,
    gives:
      {
        'd2sfx.mpq': 'Les effets sonores : combats, sorts, interface. Facultatif.',
        'd2speech.mpq': 'Les voix des PNJ des Actes I à IV. Facultatif.',
        'd2xtalk.mpq': 'Les voix de l’extension (Acte V, héroïnes). Facultatif.',
        'd2music.mpq': 'Les musiques des zones. Facultatif.',
      }[a.name] ?? a.gives,
    matches: (n) => n === a.name,
    addable: true,
  })),
  {
    key: 'd2video',
    name: 'd2video.mpq',
    required: false,
    gives: 'Les vidéos (introductions, cinématiques d’acte) : non utilisées par ce jeu, inutile de l’ajouter.',
    matches: (n) => /^d2(x)?video\.mpq$/.test(n),
    addable: false,
  },
];

/** Statut d'une ligne de fichiers à partir des archives connues (graphismes et sons) */
export function mpqStatus(row: MpqRow, files: { name: string; size: number }[]): { present: boolean; size: number; name: string } {
  const f = files.find((x) => row.matches(x.name.toLowerCase()));
  return { present: !!f, size: f?.size ?? 0, name: f?.name ?? row.name };
}

/** Archives de Diablo II connues (graphismes et sons) : noms de fichiers */
const knownArchiveNames = (): string[] => [...d2Local.fileInfo(), ...d2Local.audioFileInfo()].map((f) => f.name);

/** Ligne de MPQ d'après un nom d'archive (Patch_D2.mpq, d2char.mpq…) */
const mpqRowOf = (name: string): MpqRow | undefined => MPQ_ROWS.find((r) => r.matches(name.toLowerCase()));

/**
 * Ouvre le sélecteur pour UNE archive et l'ajoute aux autres sans tout resélectionner (copie vérifiée dans OPFS) ; la préparation des zones
 * abandonnées reprend, ce qui manquait se génère ensuite. `then` : appelé après un ajout réussi.
 */
export async function pickAndAddMpq(name: string, onMessage: (text: string, color?: string) => void, then?: () => void): Promise<boolean> {
  const row = mpqRowOf(name);
  const files = await pickMpqFiles();
  if (!files) return false;
  const f = files.find((x) => (row ? row.matches(x.name.toLowerCase()) : x.name.toLowerCase() === name.toLowerCase())) ?? (files.length === 1 ? files[0] : undefined);
  if (!f) {
    onMessage(`Aucun fichier ${name} dans cette sélection.`);
    return false;
  }
  // remplacer une archive jugée incomplète est le but : pas de confirmation
  const replacingBad = d2Local.status.checks[f.name.toLowerCase()]?.status === 'incomplete';
  if (
    !isAudioMpq(f.name) &&
    d2Local.hasFiles &&
    !replacingBad &&
    !window.confirm(tr('Ajouter cette archive change les graphismes de base : ce qui a déjà été généré sera refait avec elle. Continuer ?'))
  )
    return false;
  onMessage(`Ajout de ${f.name}…`);
  const r = await d2Local.addMpq(f);
  onMessage(r.message, r.ok ? undefined : '#e8a24a');
  if (r.ok) {
    // l'empreinte a changé pour une archive de graphismes : tout est refait ; sinon seules les zones abandonnées sont retentées
    if (!isAudioMpq(f.name) && d2Local.hasFiles) livePregen()?.reset();
    else livePregen()?.retrySkipped();
    then?.();
  }
  return r.ok;
}

/** Ligne « étiquette : archive ✓ — ce qu'elle apporte · … » : un nœud de texte par morceau (chacun est traduit séparément) */
function archiveLine(label: string, items: { name: string; ok: boolean; gives?: string }[], warn = false): HTMLElement {
  const line = el('div', { cls: warn ? 'set-help warn' : 'set-help' }, el('span', { textContent: `${label} ` }));
  items.forEach((it, i) => {
    if (i) line.append(el('span', { textContent: ' · ' }));
    line.append(el('span', { textContent: `${it.name} ${it.ok ? '✓' : '✗'}` }));
    if (it.gives) line.append(el('span', { textContent: ' — ' }), el('span', { textContent: it.gives }));
  });
  return line;
}

function barEl(frac: number): HTMLElement {
  return el('div', { cls: 'd2l-bar' }, el('div', { cls: 'fill', style: { transform: `scaleX(${Math.max(0, Math.min(1, frac))})` } }));
}

/** Section « Qualité, préparation et récapitulatif » */
export function buildRecapSection(onMessage: (text: string, color?: string) => void): HTMLElement {
  const root = el('div', { cls: 'col d2l-recap', style: { gap: '6px' } });
  let plan: PlanZone[] | null = null;
  let planBusy = false;
  let planProgress = '';
  let timer = 0;
  const tierNow = () => d2LocalGenTier();

  const ensurePlan = () => {
    if (plan || planBusy || !planReady()) return;
    planBusy = true;
    void allPlan((d, t) => {
      planProgress = `${d}/${t}`;
    }).then((p) => {
      plan = p;
      planBusy = false;
      render();
    });
  };

  const render = () => {
    if (!root.isConnected && root.dataset.mounted === '1') {
      window.clearInterval(timer);
      off();
      return;
    }
    root.dataset.mounted = '1';
    const s = d2Local.status;
    const tier = tierNow();
    const nodes: HTMLElement[] = [];
    // qualité
    const set = d2LocalTierSetting();
    const tabs = el('div', { cls: 'tabs' });
    for (const [v, l] of [
      ['auto', 'Auto (haute)'],
      ['lo', 'Économe'],
      ['hi', 'Haute'],
    ] as const) {
      const b = el('button', { cls: `btn${set === v ? ' sel' : ''}`, textContent: l });
      b.addEventListener('click', () => {
        setD2LocalTierSetting(v);
        onMessage('Rechargement nécessaire pour appliquer la qualité des graphismes générés.');
        render();
      });
      tabs.append(b);
    }
    nodes.push(el('div', { cls: 'statrow' }, el('span', { textContent: 'Qualité des graphismes générés' }), tabs));
    const why = d2LocalAutoReason();
    nodes.push(
      el('div', {
        cls: why ? 'set-help warn' : 'set-help',
        textContent:
          why === 'weak'
            ? 'Auto : résolution économe sur cet appareil (2 Go de mémoire ou moins). Tu peux forcer « Haute ».'
            : why === 'storage'
              ? 'Auto : résolution économe car il reste peu d’espace de stockage (moins de 700 Mo). Libère de la place ou force « Haute ».'
              : set === 'lo'
                ? 'Économe : images moitié moins grandes, génération plus rapide, environ 40 % de stockage en moins.'
                : 'Haute résolution (réglage par défaut). Ce qui est déjà généré en économe reste utilisé, puis remplacé en haute au fil du jeu, en arrière-plan.',
      }),
    );
    // préparation en arrière-plan
    const pg = livePregen();
    const on = pregenEnabled();
    const tg = el('button', { cls: `btn${on ? ' sel' : ''}`, textContent: on ? 'Activée' : 'Désactivée' });
    tg.addEventListener('click', () => {
      setPregenEnabled(!on);
      onMessage(on ? 'Préparation automatique des zones suivantes arrêtée.' : 'Préparation automatique des zones suivantes activée.');
      render();
    });
    nodes.push(el('div', { cls: 'statrow' }, el('span', { textContent: 'Préparer les zones suivantes à l’avance' }), tg));
    if (pg && on) {
      const st = pg.status;
      const pauseText: Record<string, string> = {
        nofiles: 'fichiers à fournir',
        loading: 'chargement ou menu ouvert',
        copying: 'copie des fichiers en cours',
        quota: 'stockage plein',
        busy: 'génération en cours',
        hidden: 'page en arrière-plan',
        fps: 'le jeu a besoin de toute la puissance',
        saver: 'économiseur de données activé',
        battery: 'batterie faible',
      };
      const line = st.finished
        ? st.skipped
          ? 'Préparation terminée, avec des zones abandonnées.'
          : 'Toutes les zones sont prêtes.'
        : st.paused
          ? `En pause : ${pauseText[st.paused] ?? st.paused}.`
          : st.current
            ? `En cours : ${st.current}.`
            : 'En attente…';
      nodes.push(
        el('div', { cls: 'set-help', textContent: line }),
        el('div', { cls: 'set-help', textContent: `Zones préparées : ${st.done}/${st.total}, dans l’ordre de progression (Tristram, puis les Actes I à V).` }),
        barEl(st.total ? st.done / st.total : 0),
      );
      if (st.skipped) nodes.push(el('div', { cls: 'set-help warn', textContent: `Zones abandonnées : ${st.skipped}. Dernière erreur : ${st.lastError || 'inconnue'}` }));
      else if (st.lastError) nodes.push(el('div', { cls: 'set-help warn', textContent: `Dernier essai échoué : ${st.lastError}` }));
    } else {
      nodes.push(
        el('div', {
          cls: 'set-help',
          textContent:
            'Le jeu prépare en tâche de fond, à basse priorité, les zones que tu rencontreras ensuite (Tristram d’abord, puis les Actes I à V) : cartes, sols et décors, monstres, effets. Il se met en pause quand le jeu ralentit et reprend après un rechargement.',
        }),
      );
    }
    // tableau récapitulatif
    const cat = d2Local.catalog as CatalogLike | null;
    if (!d2Local.hasFiles || !cat) {
      nodes.push(el('div', { cls: 'set-help', textContent: 'Le récapitulatif apparaît quand les fichiers Diablo II sont fournis.' }));
    } else {
      ensurePlan();
      const cats: Category[] = buildCategories(cat, plan ?? [], CLASS_IDS, (c) => `Personnage — ${CLASSES[c as ClassId].name}`);
      const man = d2Local.manifestJson();
      const rows: Row[] = buildRows(
        cats,
        cat,
        (id) => d2Local.assetReady(id, tier),
        (id) => d2Local.assetBytes(id, tier) || sheetBytes(man, id),
        man,
        tier,
        d2LocalModest() ? 4 : 1,
      );
      if (!plan) nodes.push(el('div', { cls: 'set-help', textContent: `Calcul de la répartition par acte… ${planProgress}` }));
      const totalLeft = rows.reduce((a, r) => a + r.secondsLeft, 0);
      const bytesLeft = rows.reduce((a, r) => a + r.bytesLeft, 0);
      const bytesDone = rows.reduce((a, r) => a + r.bytes, 0);
      nodes.push(
        el('div', {
          cls: 'base',
          textContent:
            tier === 'hi'
              ? `Généré : ${fmtMo(bytesDone)} · reste ≈ ${fmtMo(bytesLeft)} et ≈ ${dur(totalLeft)} (qualité haute)`
              : `Généré : ${fmtMo(bytesDone)} · reste ≈ ${fmtMo(bytesLeft)} et ≈ ${dur(totalLeft)} (qualité économe)`,
        }),
      );
      for (const r of rows) {
        const pct = r.total ? Math.round((100 * r.done) / r.total) : 100;
        const line = el('div', { cls: 'd2l-row', style: { display: 'grid', gap: '2px', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.08)' } });
        line.append(
          el(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
            el('span', { textContent: r.label }),
            el('span', { cls: 'base', textContent: `${r.done}/${r.total} · ${pct} %` }),
          ),
          barEl(r.total ? r.done / r.total : 1),
          el('div', { cls: 'set-help', textContent: r.todo.length ? `${fmtMo(r.bytes)} utilisés · reste ≈ ${fmtMo(r.bytesLeft)}, ≈ ${dur(r.secondsLeft)}` : `${fmtMo(r.bytes)} utilisés · complet` }),
        );
        // archives requises (mesurées) et facultatives : statut, nom de ce qui manque, bouton direct
        const known = knownArchiveNames();
        const need = requiredForAll(cats.find((x) => x.key === r.key)!.ids);
        const missing = missingOf(need, known);
        if (need.length) {
          line.append(
            archiveLine(
              'Archives requises :',
              need.map((a) => ({ name: a, ok: !missing.includes(a) })),
              missing.length > 0,
            ),
          );
        }
        const opt = optionalFor(r.kind);
        if (opt.length)
          line.append(
            archiveLine(
              'Facultatif :',
              opt.map((o) => ({ name: o.name, ok: !missingOf([o.name], known).length, gives: o.gives })),
            ),
          );
        const lastErr = r.todo.map((id) => d2Local.failureOf(id)).find((f) => f);
        if (missing.length && r.todo.length) {
          line.append(el('div', { cls: 'set-help warn', textContent: `Requis : ${missing.join(', ')} — ajoutez-le ci-dessous.` }));
          const addRow = el('div', { cls: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
          for (const m of missing) {
            const ab = el('button', { cls: 'btn primary', textContent: `Ajouter ${m}` });
            ab.addEventListener('click', () => void pickAndAddMpq(m, onMessage, render));
            addRow.append(ab);
          }
          line.append(addRow);
        }
        if (lastErr && r.todo.length) line.append(el('div', { cls: 'set-help warn', textContent: `Dernière erreur : ${lastErr.id} — ${lastErr.error.slice(0, 160)}` }));
        const btns = el('div', { cls: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
        if (r.todo.length) {
          const g = el('button', { cls: 'btn', textContent: 'Générer maintenant' });
          g.addEventListener('click', () => {
            for (const id of r.todo) void d2Local.requestAsset(id, tier, PRIO.background);
            onMessage(`Génération lancée : ${r.todo.length} éléments en tâche de fond.`);
          });
          btns.append(g);
        }
        if (r.done > 0) {
          const c = el('button', { cls: 'btn danger', textContent: 'Effacer' });
          c.addEventListener('click', () => {
            if (!window.confirm(tr('Effacer ce qui a été généré pour cette catégorie ? Ce sera refabriqué à la demande.'))) return;
            const ids = cats.find((x) => x.key === r.key)!.ids.filter((id) => d2Local.assetReady(id, 'hi') || d2Local.assetReady(id, 'lo'));
            void d2Local.clearAssets(ids).then((n) => {
              livePregen()?.reset();
              onMessage(`${n} éléments effacés.`);
              render();
            });
          });
          btns.append(c);
        }
        if (btns.childElementCount) line.append(btns);
        nodes.push(line);
      }
      // sons
      const au = s.audio;
      nodes.push(
        el(
          'div',
          { cls: 'd2l-row', style: { display: 'grid', gap: '2px', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.08)' } },
          el(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
            el('span', { textContent: 'Sons et musique' }),
            el('span', { cls: 'base', textContent: au.names.length ? `${au.names.length} archive(s) · ${fmtMo(au.bytes)}` : au.cached ? 'sons décodés conservés' : 'non fournis' }),
          ),
          el('div', { cls: 'set-help', textContent: 'Les sons sont décodés à la première écoute, jamais en bloc : rien à générer d’avance. Ajoute les archives sonores dans la liste ci-dessous.' }),
          archiveLine(
            'Archives :',
            optionalFor('sounds').map((o) => ({ name: o.name, ok: !missingOf([o.name], knownArchiveNames()).length, gives: o.gives })),
          ),
        ),
      );
      // tout générer
      if (s.counts) {
        if (s.all.running) {
          const stop = el('button', { cls: 'btn', textContent: `Arrêter (${s.all.done}/${s.all.total})` });
          stop.addEventListener('click', () => d2Local.stopAll());
          nodes.push(stop, barEl(s.all.total ? s.all.done / s.all.total : 0));
        } else {
          const all = el('button', { cls: 'btn primary', textContent: `Tout générer (≈ ${dur(totalLeft)}, ≈ ${fmtMo(bytesLeft)})` });
          all.addEventListener('click', () => {
            const n = d2Local.generateAll(tier);
            for (const r of rows) for (const id of r.todo) if (id.startsWith('map:')) void d2Local.requestAsset(id, tier, PRIO.background);
            onMessage(n ? `Génération lancée : ${n} éléments en tâche de fond.` : 'Tout est déjà généré.');
          });
          nodes.push(
            all,
            el('div', {
              cls: 'set-help',
              textContent:
                'Tout se passe sur l’appareil, sans réseau. Les estimations viennent de mesures sur PC (planches) ; sur téléphone la durée est multipliée par 4 (supposé, non mesuré). Reprend là où elle s’est arrêtée.',
            }),
          );
        }
      }
    }
    root.replaceChildren(...nodes);
  };
  const off = d2Local.subscribe(() => {
    if (!timer)
      timer = window.setTimeout(() => {
        timer = 0;
        render();
      }, 1000);
  });
  const pgOff = livePregen();
  if (pgOff) pgOff.onChange = () => render();
  // rafraîchissement régulier tant que la section est affichée (octets générés, compteur de zones, état de la file)
  const tick = window.setInterval(() => {
    if (!root.isConnected) {
      if (root.dataset.mounted === '1') window.clearInterval(tick);
      return;
    }
    const st = livePregen()?.status;
    const sig = `${d2Local.status.generated}|${d2Local.status.queued}|${d2Local.status.active}|${st?.done}|${st?.skipped}|${st?.current}|${st?.paused}|${d2Local.status.extras.length}`;
    if (sig !== lastSig) {
      lastSig = sig;
      render();
    }
  }, 2000);
  let lastSig = '';
  render();
  return root;
}

/** Section « Fichiers Diablo II » : archives connues, statut, taille, ce qu'elles apportent, « Ajouter ce fichier » */
/** Phrase d'état du contrôle d'une archive (texte fixe, traduit tel quel) */
function checkSentence(c: ArchiveCheck | undefined, checking: boolean): string {
  if (!c) return checking ? 'Contrôle : en cours…' : 'Contrôle : pas encore fait.';
  if (c.status === 'ok') return c.mode === 'full' ? 'Contrôle : OK (lecture complète).' : 'Contrôle : OK (contrôle rapide ; lance la vérification complète pour lire tout le fichier).';
  return { suspect: 'Contrôle : suspecte.', incomplete: 'Contrôle : incomplète.', unrecognized: 'Contrôle : non reconnue.' }[c.status];
}

export function buildFilesSection(onMessage: (text: string, color?: string) => void): HTMLElement {
  const root = el('div', { cls: 'col d2l-files', style: { gap: '6px' } });
  const render = () => {
    if (!root.isConnected && root.dataset.mounted === '1') {
      off();
      return;
    }
    root.dataset.mounted = '1';
    const st0 = d2Local.status;
    const known = [...d2Local.fileInfo(), ...d2Local.audioFileInfo()];
    const nodes: HTMLElement[] = [
      el('div', {
        cls: 'set-help',
        textContent: 'Archives de ton installation de Diablo II. Seules les trois premières sont obligatoires. Ajouter une archive ne demande pas de tout resélectionner.',
      }),
    ];
    for (const row of MPQ_ROWS) {
      const st = mpqStatus(row, known);
      const line = el('div', { cls: 'd2l-row', style: { display: 'grid', gap: '2px', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.08)' } });
      line.append(
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } },
          el('span', { textContent: `${row.name}${row.required ? ' (obligatoire)' : ''}` }),
          el('span', { cls: st.present ? 'base' : row.required ? 'set-help warn' : 'base', textContent: st.present ? `✓ ajouté · ${fmtMo(st.size)}` : row.required ? 'manquant' : 'non ajouté' }),
        ),
        el('div', { cls: 'set-help', textContent: row.gives }),
      );
      const chk = st.present ? st0.checks[st.name.toLowerCase()] : undefined;
      if (st.present) {
        const bad = chk && chk.status !== 'ok';
        const running = st0.checking?.name === st.name;
        line.append(el('div', { cls: bad ? 'set-help warn' : 'set-help', textContent: checkSentence(chk, running || !!st0.copy) }));
        if (chk && bad) for (const m of describeFr(chk)) line.append(el('div', { cls: 'set-help warn', textContent: m }));
        if (chk?.md5 || chk || row.required || row.name.startsWith('d2'))
          for (const m of md5LinesFr(chk, st.name)) line.append(el('div', { cls: 'set-help', style: { wordBreak: 'break-all' }, textContent: m }));
      }
      if (row.addable) {
        const label = chk?.status === 'incomplete' ? 'Choisir de nouveau ce fichier' : st.present ? 'Remplacer ce fichier' : 'Ajouter ce fichier';
        const b = el('button', { cls: `btn${chk?.status === 'incomplete' ? ' primary' : ''}`, textContent: label });
        b.addEventListener('click', () => void pickAndAddMpq(row.name, onMessage, render));
        line.append(b);
      }
      nodes.push(line);
    }
    // vérification complète : lit tous les fichiers, calcule le MD5, cherche toute zone vide de 64 Ko ou plus
    if (known.length) {
      nodes.push(
        el('div', {
          cls: 'set-help',
          textContent:
            'Contrôle rapide (à l’ajout d’un fichier) : en-tête, tables et sondages tous les 256 Ko. Il trouve un fichier tronqué et toute zone vide d’au moins 260 Ko ; il ne voit pas les petites zones vides ni les altérations isolées et ne calcule pas le MD5.',
        }),
        el('div', {
          cls: 'set-help',
          textContent:
            'Vérification complète : lit tout le fichier, trouve toute zone vide d’au moins 64 Ko et calcule le MD5. Un fichier copié sur l’appareil est déjà contrôlé en entier pendant la copie.',
        }),
        el('div', { cls: 'set-help', textContent: 'Un MD5 différent de la référence n’est jamais une erreur : d’autres éditions légitimes de Diablo II ont des archives différentes.' }),
      );
      const ck = st0.checking;
      if (ck) {
        const pct = ck.total ? ck.done / ck.total : 0;
        nodes.push(el('div', { cls: 'base', textContent: `Vérification : ${ck.name} — ${Math.round(ck.done / 1e6)} / ${Math.round(ck.total / 1e6)} Mo` }), barEl(pct));
        const cancel = el('button', { cls: 'btn', textContent: 'Annuler la vérification' });
        cancel.addEventListener('click', () => {
          d2Local.cancelChecks();
          onMessage('Vérification annulée.');
        });
        nodes.push(cancel);
      } else {
        const full = el('button', { cls: 'btn', textContent: 'Vérification complète des archives' });
        full.disabled = !!st0.copy;
        full.addEventListener(
          'click',
          () =>
            void d2Local.verifyArchives('full').then((r) => {
              const bad = r.filter((c) => c.status === 'incomplete');
              onMessage(bad.length ? `${bad.map((c) => c.name).join(', ')} : incomplète.` : 'Vérification terminée : aucune zone vide trouvée.', bad.length ? '#e8a24a' : undefined);
            }),
        );
        nodes.push(full);
      }
    }
    root.replaceChildren(...nodes);
  };
  const off = d2Local.subscribe(() => render());
  render();
  return root;
}
