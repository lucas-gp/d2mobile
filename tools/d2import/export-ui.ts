/**
 * Art d'interface de Diablo II pour le jeu (sortie dans <sortie>/game/ui/) : fond et logo de l'écran de sélection, personnages du
 * menu, panneaux (personnage, inventaire, coffre), globes de vie et de mana, boutons et cadres. Les images sont des DC6 découpés
 * en morceaux : on les recompose ici en une seule image. `ui.json` liste chaque fichier avec sa taille.
 */
import type { GameData } from './data';
import { decodeDc6, type Dc6, type IndexedImage } from './formats/dc6';
import { putJson, type Sink } from './sink';
import { UI_REQUIRED, UI_REVISION } from './ui-keys';

interface Rgba {
  w: number;
  h: number;
  px: Uint8Array;
}

const blank = (w: number, h: number): Rgba => ({ w, h, px: new Uint8Array(w * h * 4) });

function paint(dst: Rgba, fr: IndexedImage, pal: Uint8Array | number[], x0: number, y0: number, opaque = false): void {
  for (let y = 0; y < fr.h; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= dst.h) continue;
    for (let x = 0; x < fr.w; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= dst.w) continue;
      const c = fr.px[y * fr.w + x];
      if (!c && !opaque) continue;
      dst.px.set([pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], c || !opaque ? 255 : 255], (yy * dst.w + xx) * 4);
    }
  }
}

/** Morceaux rangés de gauche à droite puis de haut en bas : `cols` = nombre de morceaux par ligne, à partir de `first` */
function assemble(dc: Dc6, pal: Uint8Array | number[], cols: number, first = 0, count = dc.frames.length - first, opaque = false): Rgba {
  const frames = dc.frames.slice(first, first + count);
  const rows = Math.ceil(frames.length / cols);
  const colW: number[] = Array(cols).fill(0);
  const rowH: number[] = Array(rows).fill(0);
  frames.forEach((f, i) => {
    colW[i % cols] = Math.max(colW[i % cols], f.w);
    rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], f.h);
  });
  const W = colW.reduce((s, v) => s + v, 0);
  const H = rowH.reduce((s, v) => s + v, 0);
  const out = blank(W, H);
  frames.forEach((f, i) => {
    const cx = colW.slice(0, i % cols).reduce((s, v) => s + v, 0);
    const cy = rowH.slice(0, Math.floor(i / cols)).reduce((s, v) => s + v, 0);
    paint(out, f, pal, cx, cy, opaque);
  });
  return out;
}

/** Images de même taille rangées en grille (bande d'animation) */
function sheet(frames: Rgba[], cols: number, cw: number, ch: number): Rgba {
  const rows = Math.ceil(frames.length / cols);
  const out = blank(cols * cw, rows * ch);
  frames.forEach((f, i) => {
    const x0 = (i % cols) * cw;
    const y0 = Math.floor(i / cols) * ch;
    for (let y = 0; y < Math.min(f.h, ch); y++) out.px.set(f.px.subarray(y * f.w * 4, (y * f.w + Math.min(f.w, cw)) * 4), ((y0 + y) * out.w + x0) * 4);
  });
  return out;
}

function single(fr: IndexedImage, pal: Uint8Array | number[]): Rgba {
  const o = blank(fr.w, fr.h);
  paint(o, fr, pal, 0, 0);
  return o;
}

/** Additive blend (the game's drawing mode for the logo fire) baked into a transparent image: over an opaque pixel the colours add up;
 *  elsewhere the brightest channel becomes the opacity (same result as an additive blend over a dark background) */
function addPixel(dst: Rgba, fr: IndexedImage, pal: Uint8Array | number[], x0: number, y0: number): void {
  for (let y = 0; y < fr.h; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= dst.h) continue;
    for (let x = 0; x < fr.w; x++) {
      const xx = x0 + x;
      const c = fr.px[y * fr.w + x];
      if (!c || xx < 0 || xx >= dst.w) continue;
      const o = (yy * dst.w + xx) * 4;
      const a = dst.px[o + 3];
      const r = Math.min(255, (dst.px[o] * a) / 255 + pal[c * 3]);
      const g = Math.min(255, (dst.px[o + 1] * a) / 255 + pal[c * 3 + 1]);
      const b = Math.min(255, (dst.px[o + 2] * a) / 255 + pal[c * 3 + 2]);
      const na = a === 255 ? 255 : Math.max(a, r, g, b);
      if (!na) continue;
      dst.px[o] = Math.round((r * 255) / na);
      dst.px[o + 1] = Math.round((g * 255) / na);
      dst.px[o + 2] = Math.round((b * 255) / na);
      dst.px[o + 3] = Math.round(na);
    }
  }
}

/** Animated logo: one frame out of two of the fire (15 images), static letters under it, all halves at their DC6 offsets around a
 *  common anchor (`ax`, `ay`: the anchor inside each cell, the point the game places at (400, 120) on the 800 × 600 menu) */
export function logoSheet(
  left: Dc6,
  right: Dc6,
  letters: IndexedImage[],
  pal: Uint8Array | number[],
): { im: Rgba; meta: { frames: number; cols: number; cw: number; ch: number; ax: number; ay: number } } {
  const idx = left.frames.map((_, i) => i).filter((i) => i % 2 === 0 && right.frames[i]);
  const all = [...letters, ...idx.flatMap((i) => [left.frames[i], right.frames[i]])];
  const x0 = Math.min(...all.map((f) => f.ox));
  const y0 = Math.min(...all.map((f) => f.oy));
  const CW = Math.max(...all.map((f) => f.ox + f.w)) - x0;
  const CH = Math.max(...all.map((f) => f.oy + f.h)) - y0;
  const frames = idx.map((i) => {
    const f = blank(CW, CH);
    for (const l of letters) paint(f, l, pal, l.ox - x0, l.oy - y0);
    for (const fire of [left.frames[i], right.frames[i]]) addPixel(f, fire, pal, fire.ox - x0, fire.oy - y0);
    return f;
  });
  return { im: sheet(frames, 5, CW, CH), meta: { frames: frames.length, cols: 5, cw: CW, ch: CH, ax: -x0, ay: -y0 } };
}

const CLASS_CODE: Record<string, [string, string]> = {
  sorceress: ['sorceress', 'so'],
  necromancer: ['necromancer', 'ne'],
  paladin: ['paladin', 'pa'],
  barbarian: ['barbarian', 'ba'],
  amazon: ['amazon', 'am'],
  assassin: ['assassin', 'as'],
  druid: ['druid', 'dz'],
};

export async function exportUi(data: GameData, sink: Sink, log: (s: string) => void): Promise<void> {
  const files: Record<string, { w: number; h: number; frames?: number; cols?: number; cw?: number; ch?: number; ax?: number; ay?: number }> = {};
  // Une image à la fois : chaque PNG est encodé puis libéré avant la suivante (sur téléphone, tout encoder en parallèle gardait
  // une centaine de Mo d'images brutes + leurs copies de travail en mémoire). L'ordre d'écriture reste celui de l'export.
  const out = async (name: string, im: Rgba, extra: { frames?: number; cols?: number; cw?: number; ch?: number; ax?: number; ay?: number } = {}): Promise<void> => {
    try {
      await sink.png(`ui/${name}.png`, im.w, im.h, im.px);
    } catch (e) {
      throw new Error(`ui/${name}.png (${im.w}×${im.h}) : ${(e as Error).message}`);
    }
    files[name] = { w: im.w, h: im.h, ...extra };
  };
  /** fichiers absents ou illisibles : expliquent une interface incomplète */
  const problems: string[] = [];
  const dc6 = (path: string): Dc6 | null => {
    const full = `data\\global\\ui\\${path.replace(/\//g, '\\')}.dc6`;
    let b: Uint8Array | null = null;
    try {
      b = data.vfs.get(full);
      if (!b) {
        problems.push(`absent: ${path}`);
        return null;
      }
      return decodeDc6(b);
    } catch (e) {
      // un fichier illisible n'empêche pas le reste de l'interface : il est signalé et ignoré ; le diagnostic dit ce qui a été lu
      const hex = (x: Uint8Array) => Array.from(x, (v) => v.toString(16).padStart(2, '0')).join(' ');
      let zero = 0;
      if (b) for (const x of b) if (x === 0) zero++;
      let ex = '';
      try {
        ex = data.vfs.explain(full);
      } catch (e2) {
        ex = `explain failed: ${(e2 as Error).message}`;
      }
      problems.push(`unreadable: ${path} (${(e as Error).message}) [${b ? `decoded ${b.length} bytes, head ${hex(b.subarray(0, 16))}, ${zero} zero bytes; ` : ''}${ex}]`);
      log(`  ATTENTION ${full} illisible : ${(e as Error).message}`);
      return null;
    }
  };
  const loading = data.palette('loading');
  const sky = data.palette('sky');
  const act1 = data.palette('act1');
  const fechar = data.palette('fechar');
  void data.palette('trademark');

  // ---- écran de sélection : fond 800 × 600 (12 morceaux), logo de feu, personnages ----
  const bg = dc6('charselect/charselectbckg');
  if (bg) await out('charselect-bg', assemble(bg, loading, 4, 0, 12, true));
  // Diablo II logo (title and main menu): the static letters (D2LogoBlackLeft/Right) under the fire (D2LogoFireLeft/Right, additive
  // blend in the game), every half placed by its DC6 offsets around one anchor, as the game does. The flames change size from one frame
  // to the next: an earlier version placed each half by its frame size, so the letters jumped by up to 8 px twelve times per second.
  const left = dc6('frontend/d2logofireleft');
  const right = dc6('frontend/d2logofireright');
  if (left && right) {
    const blackL = dc6('frontend/d2logoblackleft');
    const blackR = dc6('frontend/d2logoblackright');
    const logo = logoSheet(left, right, blackL && blackR ? [blackL.frames[0], blackR.frames[0]] : [], sky);
    await out('logo', logo.im, logo.meta);
  }
  for (const [cls, [dir, pre]] of Object.entries(CLASS_CODE)) {
    const nu = dc6(`frontend/${dir}/${pre}nu1`);
    if (!nu) continue;
    const CW = 100;
    const CH = 170;
    const frames = nu.frames.filter((_, i) => i % 2 === 0).map((f) => single(f, fechar));
    await out(`class-${cls}`, sheet(frames, 4, CW, CH), { frames: frames.length, cols: 4, cw: CW, ch: CH });
  }
  // personnages des écrans de sélection et de création : au repos (nu1), marche vers le feu (fw), debout au feu (nu3), retour (bw) ; une image sur deux
  // (25 → 12,5 images/s). Chaque image garde son décalage D2 : les cases partagent une ancre (les pieds du personnage au repos), commune aux quatre bandes.
  for (const [cls, [dir, pre]] of Object.entries(CLASS_CODE)) {
    const anims = (['nu1', 'fw', 'nu3', 'bw'] as const).map((a) => ({ a, dc: dc6(`frontend/${dir}/${pre}${a}`) }));
    if (anims.some((x) => !x.dc)) continue;
    const pick = anims.map(({ a, dc }) => ({ a, fr: dc!.frames.filter((_, i) => i % 2 === 0 || i === dc!.frames.length - 1) }));
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    for (const { fr } of pick)
      for (const f of fr) {
        x0 = Math.min(x0, f.ox);
        y0 = Math.min(y0, f.oy);
        x1 = Math.max(x1, f.ox + f.w);
        y1 = Math.max(y1, f.oy + f.h);
      }
    const CW = x1 - x0,
      CH = y1 - y0;
    for (const { a, fr } of pick) {
      const frames = fr.map((f) => {
        const im = blank(CW, CH);
        paint(im, f, fechar, f.ox - x0, f.oy - y0);
        return im;
      });
      const cols = 8;
      await out(`hero-${cls}-${a}`, sheet(frames, cols, CW, CH), { frames: frames.length, cols, cw: CW, ch: CH, ax: -x0, ay: -y0 });
    }
  }
  // feu de camp de l'écran de création (30 images, ancre = coin haut gauche décalé de l'offset D2)
  const fire = dc6('frontend/fire');
  if (fire) {
    const frames = fire.frames;
    const x0 = Math.min(...frames.map((f) => f.ox)),
      y0 = Math.min(...frames.map((f) => f.oy));
    const CW = Math.max(...frames.map((f) => f.ox + f.w)) - x0,
      CH = Math.max(...frames.map((f) => f.oy + f.h)) - y0;
    const ims = frames.map((f) => {
      const im = blank(CW, CH);
      paint(im, f, fechar, f.ox - x0, f.oy - y0);
      return im;
    });
    await out('cs-fire', sheet(ims, 6, CW, CH), { frames: ims.length, cols: 6, cw: CW, ch: CH, ax: -x0, ay: -y0 });
  }
  // fonds 800 × 600 des écrans de l'extension : menu principal, sélection, création (12 morceaux chacun), écran-titre
  for (const [name, path] of [
    ['menu-bg', 'frontend/gameselectscreenexp'],
    ['select-bg', 'charselect/characterselectscreenexp'],
    ['create-bg', 'frontend/charactercreationscreenexp'],
    ['title-bg', 'frontend/titlescreen'],
  ] as const) {
    const d = dc6(path);
    if (d) await out(name, assemble(d, name === 'title-bg' ? loading : name === 'create-bg' ? fechar : sky, 4, 0, 12, true));
  }
  const box = dc6('charselect/charselectbox');
  if (box) await out('charselect-box', assemble(box, loading, 2));
  const boxGrey = dc6('charselect/charselectboxgrey');
  if (boxGrey) await out('charselect-box-grey', assemble(boxGrey, loading, 2));
  // the buttons in the menus' palette (lot 292d: under `loading` their stone came out dark and speckled and their gems yellow; the
  // game draws them with its sky palette: grey stone, gold frame, blue gems)
  const wide = dc6('frontend/widebuttonblank');
  if (wide) {
    await out('btn-wide', assemble(wide, sky, 2, 0, 2));
    await out('btn-wide-down', assemble(wide, sky, 2, 2, 2));
  }
  const medium = dc6('frontend/mediumbuttonblank');
  if (medium) {
    await out('btn-medium', single(medium.frames[0], sky));
    if (medium.frames[1]) await out('btn-medium-down', single(medium.frames[1], sky));
  }
  const popup = dc6('frontend/popuplarge');
  if (popup) await out('popup', assemble(popup, loading, 2, 0, 4));
  for (const [name, path] of [
    ['btn-tall', 'charselect/tallbuttonblank'],
    ['btn-short', 'charselect/shortbuttonblank'],
    ['btn-narrow', 'frontend/narrowbuttonblank'],
  ] as const) {
    const d = dc6(path);
    if (d && d.frames.length >= 2) {
      await out(name, single(d.frames[0], sky));
      await out(`${name}-down`, single(d.frames[1], sky));
    }
  }
  const textbox = dc6('frontend/textbox');
  if (textbox) await out('textbox', single(textbox.frames[0], loading));

  // ---- panneaux : personnage et inventaire (2 × 2 morceaux de 320 × 432), coffre, marchand ----
  const inv = dc6('panel/invchar6');
  if (inv) {
    await out('panel-char', assemble(inv, act1, 2, 0, 4, true));
    await out('panel-inv', assemble(inv, act1, 2, 4, 4, true));
  }
  for (const n of ['bank', 'npcinv', 'trade', 'buysell', 'tradestash']) {
    const d = dc6(`panel/${n}`);
    if (d) await out(`panel-${n}`, assemble(d, act1, 2, 0, 4, true));
  }
  const tabs = dc6('panel/buyselltabs');
  if (tabs) await out('tabs-buysell', assemble(tabs, act1, 8), {});
  // fond de pierre vierge (arbres de compétences, fenêtres du jeu) et fond plein écran
  const blankPanel = dc6('panel/blank');
  if (blankPanel) await out('panel-blank', assemble(blankPanel, act1, 2, 0, 4, true));
  const socket = dc6('panel/gemsocket');
  if (socket) await out('gemsocket', single(socket.frames[0], act1));
  const inArmor = dc6('panel/inv_armor');
  if (inArmor) await out('slot-armor', single(inArmor.frames[0], act1));

  // ---- barre de bas d'écran : cadres des globes (gargouilles), globes, boutons de menu ----
  const ctl = dc6('panel/800ctrlpnl7');
  if (ctl) {
    await out('orb-left', single(ctl.frames[0], act1));
    await out('orb-right', single(ctl.frames[5], act1));
    await out('bar-belt', single(ctl.frames[2], act1));
    await out('bar-skill', single(ctl.frames[3], act1));
  }
  const orbs = dc6('panel/hlthmana');
  if (orbs) {
    await out('orb-life', single(orbs.frames[0], act1));
    await out('orb-mana', single(orbs.frames[1], act1));
    await out('orb-poison', single(orbs.frames[2], act1));
    await out('orb-cold', single(orbs.frames[3], act1));
  }
  const ov = dc6('panel/overlap');
  if (ov) await out('orb-overlap', assemble(ov, act1, 2));
  const mini = dc6('panel/minipanel');
  if (mini) await out('minipanel', single(mini.frames[0], act1));
  const mbtn = dc6('panel/minipanelbtn');
  if (mbtn) await out('minipanel-btn', assemble(mbtn, act1, 9), { frames: 18, cols: 9, cw: 20, ch: 20 });
  const run = dc6('panel/runbutton');
  if (run) await out('run-btn', assemble(run, act1, 4), { frames: 4, cols: 4, cw: 16, ch: 20 });
  const sp = dc6('panel/skillpoints');
  if (sp) await out('skillpoints', single(sp.frames[0], act1));
  const gold = dc6('panel/goldbtn');
  if (gold) await out('gold-btn', assemble(gold, act1, 4), { frames: 4, cols: 4, cw: 15, ch: 15 });
  const lvl = dc6('panel/level');
  if (lvl) await out('level-btn', assemble(lvl, act1, 3), { frames: 3, cols: 3, cw: 30, ch: 30 });

  // une interface incomplète n'est jamais déclarée prête : l'échec nomme les images et les fichiers D2 en cause
  const missing = UI_REQUIRED.filter((k) => !files[k]);
  if (missing.length) {
    throw new Error(
      `Interface incomplete: ${Object.keys(files).length} images built, missing ${missing.join(', ')}. ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? `; … (${problems.length} files in total, first 4 shown)` : ''}`,
    );
  }
  await putJson(sink, 'ui/ui.json', { rev: UI_REVISION, files });
  log(`  interface : ${Object.keys(files).length} images D2 (sélection, panneaux, globes, boutons)`);
}
