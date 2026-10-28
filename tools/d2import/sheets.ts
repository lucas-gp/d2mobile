/**
 * Écriture des planches d'unités vers un récepteur (CLI : fichiers ; navigateur : API Cache) et liste des pièces d'équipement.
 * Code commun à `export-game.ts` (CLI) et `browser.ts` (Worker) : aucune API Node.
 */
import type { GameData } from './data';
import { GAME_ACTORS, type GameActor } from './game-map';
import { buildActor, layoutPages, type Img } from './actor-build';
import { gearOptions } from './layers';
import { sha1Hex } from './sha1';
import type { Sink } from './sink';
import { WEAPON_LOOK } from '../../src/render/weapon-look';

/** codes d'armes utilisés par les bases du jeu (les autres dessins D2 ne sont pas exportés) */
const WEAPON_CODES = new Set(Object.values(WEAPON_LOOK).map((v) => v[0]));

export interface PagesOut {
  pages: { file: string; w: number; h: number }[];
  rects: Record<string, number[]>;
  bytes: number;
  gpu: number;
}

/** Pages PNG d'un ensemble d'images : `<tier>/<id>-<suffix><n>.png` */
export async function writePages(out: Sink, tier: string, id: string, suffix: string, items: Map<string, Img>): Promise<PagesOut> {
  const { pages, bufs, rects } = layoutPages(items);
  let bytes = 0;
  let gpu = 0;
  const res: PagesOut['pages'] = [];
  for (let i = 0; i < pages.length; i++) {
    const file = `${id}-${suffix}${i}.png`;
    bytes += await out.png(`${tier}/${file}`, pages[i].w, pages[i].h, bufs[i]);
    gpu += pages[i].w * pages[i].h * 4;
    res.push({ file, w: pages[i].w, h: pages[i].h });
  }
  return { pages: res, rects, bytes, gpu };
}

export interface ActorSheetResult {
  entry: { hash: string; hi: { bytes: number; gpu: number }; lo: { bytes: number; gpu: number }; kind: 'actor' };
  anims: string[];
  warnings: string[];
  maxDirs: number;
}

/** Planche d'unité complète (hi + lo, ombres, JSON) : jette si l'animation « idle » manque (le sprite d'origine reste alors) */
export async function writeActorSheet(data: GameData, a: GameActor, out: Sink, only: readonly ('hi' | 'lo')[] = ['hi', 'lo']): Promise<ActorSheetResult> {
  const warnings: string[] = [];
  const { anims, hi, lo, maxDirs } = buildActor(data, a, warnings, only);
  if (!anims.idle) throw new Error('animation « idle » introuvable');
  const tiers: Record<'hi' | 'lo', { bytes: number; gpu: number }> = { hi: { bytes: 0, gpu: 0 }, lo: { bytes: 0, gpu: 0 } };
  let hashSrc = '';
  for (const [tier, t, scale] of [
    ['hi', hi, 1],
    ['lo', lo, 0.5],
  ] as const) {
    if (!only.includes(tier)) continue;
    const fr = await writePages(out, tier, a.id, '', t.frames);
    const sh = await writePages(out, tier, a.id, 's-', t.shadows);
    const json = { id: a.id, kind: 'actor', dirs: maxDirs, scale, shadowScale: scale / 2, anims, pages: fr.pages, frames: fr.rects, shadowPages: sh.pages, shadows: sh.rects };
    const text = JSON.stringify(json);
    await out.write(`${tier}/${a.id}.json`, text);
    hashSrc += text;
    tiers[tier] = { bytes: fr.bytes + sh.bytes + text.length, gpu: fr.gpu + sh.gpu };
  }
  return { entry: { hash: sha1Hex(hashSrc).slice(0, 16), hi: tiers.hi, lo: tiers.lo, kind: 'actor' }, anims: Object.keys(anims), warnings, maxDirs };
}

/**
 * Pièces d'équipement des classes (casques, armes, boucliers, jambes, bras…) : planches à part, superposées au corps par le jeu,
 * alignées sur ses images. Dépend du contenu des archives (calques existants), d'où `data`.
 */
export function partActors(data: GameData): GameActor[] {
  const actors: GameActor[] = [];
  for (const base of GAME_ACTORS) {
    if (base.kind !== 'chars' || /_(med|hvy)$/.test(base.id) || base.id === 'valkyrie') continue;
    const root = `data\\global\\chars\\${base.code}`;
    // corps par classe d'arme : casque et arme seulement (pas de bouclier avec une arme à deux mains)
    const isVariant = /_w[a-z0-9]{3}$/.test(base.id);
    // bouclier : corps de base et variantes à une main (une arme à deux mains ou un bâton n'en porte pas)
    const oneHand = !isVariant || /_w1h[st]$/.test(base.id);
    for (const layer of isVariant ? ['hd', 'rh', 'lg', 'ra', 'la', ...(oneHand ? ['sh'] : [])] : ['hd', 'sh', 'rh', 'lh', 'lg', 'ra', 'la']) {
      const opts = new Set<string>();
      for (const mode of ['nu', 'rn', 'a1', 'gh'])
        for (const o of gearOptions(data.vfs, root, base.code, layer, mode, (base.wclass ?? 'hth').toLowerCase())) if (o !== 'lit' || ['lg', 'ra', 'la'].includes(layer)) opts.add(o);
      for (const code of opts) {
        if ((layer === 'rh' || layer === 'lh') && !WEAPON_CODES.has(code)) continue;
        const gear: Record<string, string | null> = {};
        for (const l of ['hd', 'tr', 'lg', 'ra', 'la', 'rh', 'lh', 'sh', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) gear[l] = l === layer ? code : null;
        actors.push({
          ...base,
          id: `${base.id}_${layer}_${code}`,
          gear,
          note: `pièce ${layer} ${code}`,
          partLayer: ['hd', 'lg', 'ra', 'la'].includes(layer) ? undefined : (layer as 'sh' | 'rh' | 'lh'),
        });
      }
    }
  }
  return actors;
}
