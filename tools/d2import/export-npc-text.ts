/**
 * Textes de bavardage des PNJ de Harrogath (strings D2 : « <Pnj>Gossip<n> », associés aux sons ESOUND_<PNJ>_ACT5_GOSSIP_<n>) : game/audio/npc-text.json
 * { pnj : { n : texte } }. Les textes restent dans l'import privé (anglais d'origine), jamais dans le dépôt.
 */
import type { GameData } from './data';
import type { Sink } from './sink';

const NPCS: Record<string, string> = {
  larzuk: 'Larzuk',
  malah: 'Malah',
  anya: 'Anya',
  qual_kehk: 'QualKehk',
  akara: 'Akara',
  charsi: 'Charsi',
  gheed: 'Gheed',
  kashya: 'Kashya',
  warriv: 'Warriv',
  cain1: 'Cain',
  tyrael: 'TyraelAct4',
  cain4: 'CainAct4',
  jamella: 'Jamella',
  halbu: 'Halbu',
  atma: 'Atma',
  fara: 'Fara',
  drognan: 'Drognan',
  lysander: 'Lysander',
  elzix: 'Elzix',
  greiz: 'Greiz',
  geglash: 'Geglash',
  meshif: 'Meshif',
  jerhyn: 'Jerhyn',
  cain2: 'CainAct2',
  warriv2: 'WarrivAct2',
  ormus: 'Ormus',
  hratli: 'Hratli',
  asheara: 'Asheara',
  alkor: 'Alkor',
  natalya: 'Natalya',
  meshif3: 'MeshifAct3',
  cain3: 'CainAct3',
};

export async function exportNpcText(data: GameData, out: Sink, log: (s: string) => void): Promise<void> {
  const texts: Record<string, Record<string, string>> = {};
  let n = 0;
  for (const [id, key] of Object.entries(NPCS)) {
    texts[id] = {};
    for (let i = 1; i <= 20; i++) {
      const raw = data.strings.get(`${key}Gossip${i}`);
      if (!raw) continue;
      // le texte est précédé d'une ligne numérique (durée) ; les retours à la ligne sont ceux de la boîte de dialogue d'origine
      const text = raw
        .split(/\r?\n/)
        .filter((l, k) => !(k === 0 && /^\d+$/.test(l.trim())))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        texts[id][String(i)] = text;
        n++;
      }
    }
  }
  await out.write('audio/npc-text.json', JSON.stringify(texts));
  log(`  textes de PNJ : ${n} phrases`);
}
