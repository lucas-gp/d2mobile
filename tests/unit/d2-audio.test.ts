import { describe, expect, it } from 'vitest';
import { adpcmDecode, huffmanDecode } from '../../tools/d2import/mpq-audio';
import { parseWav, soundOwner, streamMonoWav, wavHeader, wavSeconds } from '../../tools/d2import/audio-build';
import { AUDIO_MPQ, audioMpq, audioReport, audioStaleReason, isAudioMpq, AUDIO_GENERATOR_VERSION } from '../../src/platform/d2local-core';
import { pcmBytesOf, fitsMemoryBytes, estimatePcmBytes } from '../../src/platform/music';

const hex = (h: string): Uint8Array => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

/**
 * Vecteurs produits par StormLib (SCompCompress puis SCompDecompress) sur un signal synthétique (sinus + bruit + passages calmes) :
 * rien de Blizzard. `comp` = secteur compressé sans l'octet de masque, `pcm` = sortie de StormLib.
 */
const VEC = {
  mono: {
    mask: 0x41,
    size: 800,
    comp: [
      '07194a01eef47f19b73619603d3cb8c8e752f77ffd6ecc677d56e16c0c1ce9c9dcd9571a9148617504434c6f2bc4f2e7979e1556574dfddf4ad578c7',
      'a0b27396f1d2db7c4b3ffff95f7ff35e29ac6a6ea52530f7f76ec0fa293e56d8a9389ef4fddcc0e914a1ab2c5beefbbeef53eefbbeef73dff77ddff7',
      'a9effbdce79cb364c939e73ea59428e59ccab22ccbd28b4816c989de1be39cbaf0f54f60cf47a70c2b3867750dc27edfc6ed9fef925b5d8898b668e9',
      'bdceafeecd00447820bf59b61dbdfadfcd9c4e0de773567d24bd36697959515aa89163b606a69e61b3cfefd4ae11c17088846fe7dbda9c2d97beeffb',
      'beeffb3ef77dee73ceb9ef73ca29a5d4a7beef45b26491448863d830eb74',
    ].join(''),
    pcm: [
      'c0ffb3058e0b6911e21512187d19c81aab189a173f164e142f13df117911c213e413c517e2195f1e3721ae250228012ca52d232f012d6a2b66274925',
      '5f20661a3d152c117a0dab0b9e0868087007f7070d0a5d0b7f0bc80d860b200b90099b06d6014cfb9df5c2ef49eb57e52ee0fedd02dcc0db94da80dc',
      '69df4be0fce39fe4b3e8efe8dee7ade7cbe663e409e120de1fdb88d9cdd6a4d6a4d66ed929dc52e103e68decf6efe1f72bfa69008c01a504f5043d05',
      '0306f602e501b401d20044024803be04a8095a0dc912da16d31c9c208e26572aa72a362de22aa62a97267a24d820a41d901973173d177e150516d216',
      'b718e919ec1cdd1e4f2009211b200f1e0c1bfc161c11f30bc10483fe58fa7df415f204ee99ec5fed5fed5fede5ef7cf149f24df32bf3d9f154ef8fec',
      'e7e723fe71ff71ff71ff71ff71ff71ffb4fe5fff5fff5fff5fff5fff5fffc0ffc0ffc0ffc0ffc0ffc0ffc0ffc0ff93ff93ff93ff93ffb1ffb1ffcaff',
      'e1fff6ff09003c004b00750082008d009700a000a000980091008b008500750070007400780075004e199e1d892119252d261f29cc2b9b2cde2bdc29',
      'd0260a247c1d8717f312c80eed08d405a403390239020d01b001a8023f0455069b053505e3036cff18fda1f832f3a0ecf1e616e1fdddecd913d944d7',
      '44d730d952db53de8fdf4ae2a9e52fe84de711e9a2e8d8e566e42be05cdeb8dc3adb09dba0dc1bdd4adfb1e4a3eaccefddf3fafa3801a104ba07ea09',
      '550ba00cec0b490bee09fd07ca08ef084508d509d40df10fb6157f19301e2924f227c32abf2c8e2e522ef92bac28fc24a322c81da81a541855142913',
      '86121a131a138215fd176c18ae1ad01abb191718cd158a11a00cca071c0012fbd4f425ef0cecfbe7ffe5bde5bde53be733e8cae9e9eaaeedd7ed1ded',
      'a7eb9be91de656e318dee8db81d610d337d271d125d2a3d3c5d53fdb08df5ae4ace9bded6ff1d5f517f6acffacffacffacffacffacffacffacffacff',
      'eeffeeffeeff1f001f0048006d008f00ad00ad00ad00c400af00c200b100a2009400870087007d007d007d007d009200a500ab00bb00c000cd00d900',
      'd600cd00b800a600860069004a0033001a000400',
    ].join(''),
  },
  stereo: {
    mask: 0x81,
    size: 1600,
    comp: [
      '07194a01eef47fa7c1f5abfc96656b7a75ef7d79cbeeba87eb8c41e77cd6f255f07ffffa4f9c2fddea914ba3212ed4153ec5a9c16c7d0ebe45c86fa7',
      '1fbefc778d9ba868d6b2b6732b845da44083030d5cefe527fbcabd705be379b693b2524f3786eb19eb138ed5356ce0b9f8779bca36ff79bff1bc6d7a',
      'fd2fb3a64dfcba7457ee2e89307fcb76771ce5dbbcbfdca6c2147082a9f7d5e57ac21a27ac7a0e8e35e071e2dc18badfe7eb37dea2d9ae50babdd8c9',
      '823a477ff4d85ea9ef429396ff79655e1e223974915a6b59c665d993bbae4b5dd7755dd7755deebaaeebbaaeebbad4e59cbadca5aeebbaae4b5dd775',
      '5dd775b9eb729773ce39e72c398b7439e79c73ce3951ca29d14b99e8654a2454966559967ff9cd45ee95072fd77c64a532bc4301c33ac7ce5aab9e27',
      '4753d970724c9e1b7899d9bff9662165bd47ec85575731d6c3b0904642e66b8df8c5c465059373cb6a96dcc7cc5671ce3be93cf2e267e9f7fcfaa6b1',
      'eaafb34d7f5966ba94016a5e02f911ed5f7cfb77ff78efd614f8dda3a5d1810f86e2b3ccb93a6ac5630791deee92349df3b6fc733bea74b4b2d0caa6',
      '05055fe53453f427269fe3ad9dea9785afbc0dc5781167a539b3510c5bd502af6ee45736e44ebb9f15fc9d77c3bda596655feebaaeebbaaeebbaaeeb',
      'badc755d97bbaecb397739e72e77b9eb724e5d97ba2ea59412a52e7529a59c72ca49927490a4939c53973011593a64299025cb26fd04',
    ].join(''),
    pcm: [
      'c0ff70ff3806de08a90c3011d410c018ed13e01cbe167421ba18dd248019f6278019f6276f18fa25b016222364141520e913bc1d4f12e1181d115216',
      '6613ec11cc131d105316f10e6319050d191de30a0322100b2325950afb271a08722c1607412ed3028d2d76ff302e87fa802ab1f594284af0b92318e9',
      '992003e2af1bc5db6c175cd8f41093d44d0e03d3340b2ad20409f9d3990716d6570793da83080be1010a00e9010acbf03d0b96f8b80b75ff270cb305',
      '490c620be3073d110b0506150c01961695fc2519a2f6e31817f02f182aebad199fe41919b2dfdd1799dc101709db35179ed99b17f2dbed18a6dc211a',
      'ffdea01a21e12a1c22e4cb1c6ee6e41be0e7521a4fe80517e9e70011e9e7130c7de6d80467e36fffa8e1f6f54ddedcef64db49e7cdd9bbe065d7c6da',
      '61d632d6d7d78bd35eda8bd3aedb9bd284e04dd67de6aad946ea8adf78f103e40cf655e9f9fa47ef220082f693036bf98f051aff4d05330299046304',
      '8803630457033b07c0017707c001d0095101640ab701a00b8d02a40f8c063912a90823176e0e1f193712851d29186f22f21b6b244421c827f525f428',
      'a7299729f22a8325a62bdf23702bac1d782a3b17e128460fe723910616210300f61d4ef7a21bbbee0d192fe98f173ae3d015d1ddb216ecdbd11794db',
      'd518e4db171be0ddc11be0dd481e57e26d1e2fe5f3204ce7ef1fa5e9e11cf2ec3b1ab1ee801793ef451005f1860c09f291046ff2710008f35cf974f4',
      'f3f38af74cf13afbe4eedcfe54edbb05e9eb4f0a34edc010e8ed31171eee261fa4f030242bf19929eff2402c0af1482d70f1982d27ef982d91eb3229',
      'efe7cc2489fef1ffd7fff1ffd7fff1ffc3fef1ffc3fef1ffc3fef1ffc3fef1ffc3fef1ff6efff1ff6efff1ff6efff1ff6efff1ff6efff1ff6eff34ff',
      '6effdfffc6ff43ffc6ffd1ffc6ff50ffc6ff50ffc6ff50ffc6ff50ff95ff50ff95ff50ff95ff50ff95ff50ff95ff8cff95ff8cffb1ff8cffcaffb9ff',
      'e1ffe2fff6ff0700090029003c0047004b009b0075009b008200b2008d00c7009700da00a000eb00a800dc009000ce009700c10091009f0073009500',
      '7800790069004e006d0036006900210073000e00ea1b54017f1d9cffef1eb9fcda22d7fbcb280afbdf298ff8da2af5f6872dc3f5b82cd9f00729b9ed',
      '0527cfe8c12268e3c31df7df3718b4db2d1360d96e0f43d7fd08ead418077ed54f0324d8ff02ffdd030178e2d202aae91e0294f19c035ff994041402',
      '1b05a208440557118a04e517e003da1d1c01191f41fb442378f74c24c7f2bc2260ed51210ee8fd1edce0f01b1ddddf1a76da2f175dd7b1156dd62b13',
      '25d6ef11f4d70e1389dadf102bde7910a9dfe00f20e48c0fefe5ea0b1be7b608bee79406e0e923003ae774fa11e739f36be3fbec37e04ce778de61df',
      '87dc57dabadbc3d595db98d1ebda90d034dd80d1badf32d5ace586d725ea66dd17f041e340f52cebf1f90bf2eaff49f86304bafe7408ed05940bd608',
      '5a0cc30d1e0c8c117b0bdc11730c471372098913db073d14a8087314ee07df13880776150f0af115d40c6c183310bc193816ca1ca119611e7c1f1c21',
      'a524e921d5262f21f529b91fd62dd81b222d4319332eeb13d82cf90dc8285d05ab26cdfd2e222df4c81df7ec621964e49317d8de0e14ced99012e5d6',
      'fc1100d5931300d56a13f0d5e51533daca1790dd40198fe15e197ee6221a54eb0a1997ef241778f3b81577f7ce10fcfaf80b7afcb50763ffc201dcfe',
      '37fbe901c6f470029bf02b0572eb930742e9580a22e6090e5ce5181298e57f1784e7301c84e773202aeaeb2649eb0e284decd72bb3ec472ac8edb22b',
      '43eb552889eafd21bfe74e1c96e21315e5ddd50e33da1e06d6d68efeb9d4c3f685d10eeee0d284e9e0d28fe309d37be15bd8d4de8bdad4deceded4de',
      '3de4d0e0eee81be255eeb0e466f209e7f5f401e8cdf7f2e95dff5bffd2ff5bffd2ff5bffd2ff5bffd2ff5bffd2ff5bffd2ff5bffd2ff5bffd2ff0600',
      'd2ff0600d2ff0600ffff0600ffff060024007000460070006400c8008000c8009900c800b000c800b0000401c300ce00c300ce00b400ce00b400a500',
      'a70080009c005e007d0040007d0024007d000b007500f4ff7c00dfff8200ccff8800bbff9800acffa700acffbd009fffc9009fffd300a9ffd600a0ff',
      'd60098ffc40090ffbd007bff9c0075ff850063ff6b005eff4b004fff31004bff18004fff020059ff',
    ].join(''),
  },
};

describe('décompression audio MPQ (Huffman + ADPCM), contre StormLib', () => {
  for (const [name, v] of Object.entries(VEC)) {
    it(`secteur ${name} : Huffman puis ADPCM = PCM de StormLib`, () => {
      const stage1 = huffmanDecode(hex(v.comp), v.size);
      const pcm = adpcmDecode(stage1, v.size, v.mask & 0x80 ? 2 : 1);
      expect(Buffer.from(pcm).toString('hex')).toBe(v.pcm);
    });
  }
  it('flux tronqué ou invalide : erreur claire, jamais de boucle', () => {
    expect(() => huffmanDecode(new Uint8Array([0x07]), 64)).toThrow();
    const ok = hex(VEC.mono.comp);
    expect(() => huffmanDecode(ok.subarray(0, 20), 800)).toThrow();
  });
  it('ADPCM : sortie bornée par la taille attendue', () => {
    const stage1 = huffmanDecode(hex(VEC.mono.comp), 800);
    expect(adpcmDecode(stage1, 100, 1).length).toBe(100);
    expect(adpcmDecode(new Uint8Array(0), 100, 1).length).toBe(0);
  });
});

describe('WAV : en-tête, mélange mono en flux', () => {
  const stereo = (frames: number): Uint8Array => {
    const h = wavHeader(frames * 4, 2, 22050);
    const out = new Uint8Array(44 + frames * 4);
    out.set(h);
    const v = new DataView(out.buffer);
    for (let i = 0; i < frames; i++) {
      v.setInt16(44 + i * 4, i * 10, true);
      v.setInt16(46 + i * 4, -i * 4, true);
    }
    return out;
  };
  it('lit rythme, voies et durée', () => {
    const b = stereo(22050);
    const w = parseWav(b)!;
    expect([w.channels, w.rate, w.bits, w.dataStart, w.dataLen]).toEqual([2, 22050, 16, 44, 88200]);
    expect(wavSeconds(w, b.length)).toBeCloseTo(1, 5);
    expect(parseWav(new Uint8Array(20))).toBeNull();
  });
  it('mélange la stéréo en mono sur des tranches de tailles quelconques, sans perdre une trame', () => {
    const b = stereo(1000);
    for (const step of [1, 3, 7, 4096, 4001]) {
      const out = streamMonoWav((sink) => {
        for (let p = 0; p < b.length; p += step) if (sink(b.subarray(p, Math.min(b.length, p + step))) === false) break;
        return true;
      }, b.length)!;
      const w = parseWav(out)!;
      expect([w.channels, w.rate, out.length]).toEqual([1, 22050, 44 + 2000]);
      const v = new DataView(out.buffer);
      for (const i of [0, 1, 499, 999]) expect(v.getInt16(44 + i * 2, true)).toBe((i * 10 + -i * 4) >> 1);
    }
  });
  it('mono : copie sous un en-tête canonique', () => {
    const h = wavHeader(8, 1, 22050);
    const b = new Uint8Array(52);
    b.set(h);
    b.set([1, 0, 2, 0, 3, 0, 4, 0], 44);
    const out = streamMonoWav((sink) => (sink(b), true), b.length)!;
    expect([...out.subarray(44)]).toEqual([1, 0, 2, 0, 3, 0, 4, 0]);
  });
});

describe('identifiants audio', () => {
  it('propriétaire des paquets (comme tools/d2audio/extract.py)', () => {
    expect(soundOwner('ESOUND_IMPACT_BLUNT')).toBe('common');
    expect(soundOwner('ESOUND_EVENT_WILD_NIGHT')).toBe('event-wild');
    expect(soundOwner('ESOUND_MONSTER_SKILL_X')).toBe('monster-skills');
    expect(soundOwner('ESOUND_PALADIN_HIT')).toBe('paladin');
  });
});

describe('archives audio facultatives (import)', () => {
  const f = (name: string, size = 5000) => ({ name, size });
  it('reconnaît les quatre archives sonores et ce qu’elles apportent', () => {
    expect(AUDIO_MPQ.map((a) => a.name)).toEqual(['d2sfx.mpq', 'd2speech.mpq', 'd2xtalk.mpq', 'd2music.mpq']);
    expect(isAudioMpq('D2Music.MPQ')).toBe(true);
    expect(isAudioMpq('d2data.mpq')).toBe(false);
    const r = audioReport([f('d2sfx.mpq', 52e6), f('D2MUSIC.mpq', 345e6), f('d2data.mpq')]);
    expect(r.present).toEqual(['d2sfx.mpq', 'd2music.mpq']);
    expect(r.missing).toEqual(['d2speech.mpq', 'd2xtalk.mpq']);
    expect(r.bytes).toBe(397e6);
    expect(r.gives.length).toBe(2);
    expect(r.lacks.length).toBe(2);
  });
  it('archive illisible : signalée, comptée comme manquante pour ce qu’elle apporte', () => {
    const r = audioReport([f('d2sfx.mpq'), f('d2speech.mpq')], ['d2speech.mpq']);
    expect(r.present).toEqual(['d2sfx.mpq']);
    expect(r.invalid).toEqual(['d2speech.mpq']);
  });
  it('sélection sans archive sonore : rien, le jeu garde ses sons', () => {
    expect(audioMpq([f('d2data.mpq'), f('d2char.mpq')])).toEqual([]);
    expect(audioReport([f('d2data.mpq')]).present).toEqual([]);
  });
  it('doublon (sous-dossiers) : le plus gros', () => {
    expect(audioMpq([f('d2sfx.mpq', 10), f('d2sfx.mpq', 900)])[0].size).toBe(900);
  });
  it('invalidation : version du décodeur ou archives changées', () => {
    const meta = { gen: AUDIO_GENERATOR_VERSION, fp: 'a', created: 0 };
    expect(audioStaleReason(null, 'a')).toBeNull();
    expect(audioStaleReason(meta, 'a')).toBeNull();
    expect(audioStaleReason(meta, 'b')).toBe('files');
    expect(audioStaleReason(meta, null)).toBeNull();
    expect(audioStaleReason({ ...meta, gen: AUDIO_GENERATOR_VERSION - 1 }, 'a')).toBe('generator');
  });
});

describe('musique : garde mémoire WAV ou MP3', () => {
  it('un WAV mono est jugé sur sa taille décodée réelle, pas sur un débit MP3', () => {
    const wav = new Uint8Array(44 + 22050 * 2 * 120);
    wav.set(wavHeader(22050 * 2 * 120, 1, 22050));
    expect(pcmBytesOf(wav)).toBe(22050 * 120 * 4);
    expect(fitsMemoryBytes(wav)).toBe(true);
    const huge = new Uint8Array(44 + 22050 * 2 * 900);
    huge.set(wavHeader(22050 * 2 * 900, 1, 22050));
    expect(fitsMemoryBytes(huge)).toBe(false);
  });
  it('un MP3 garde l’estimation par le débit (comportement inchangé)', () => {
    const mp3 = new Uint8Array(500000);
    expect(pcmBytesOf(mp3)).toBe(estimatePcmBytes(500000));
  });
});
