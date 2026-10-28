/** Encodeur PNG RGBA 8 bits pour le navigateur : deflate natif (CompressionStream), sans canvas (le canvas perdrait les couleurs sous alpha 0 et prémultiplierait) */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const w = cs.writable.getWriter();
  void w.write(raw as never).then(() => w.close());
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

export async function encodePngWeb(w: number, h: number, rgba: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const idat = await deflate(raw);
  const out = new Uint8Array(8 + 25 + 12 + idat.length + 12);
  const v = new DataView(out.buffer);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let p = 8;
  const chunk = (type: string, data: Uint8Array) => {
    v.setUint32(p, data.length);
    for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i);
    out.set(data, p + 8);
    v.setUint32(p + 8 + data.length, crc32(out, p + 4, p + 8 + data.length));
    p += 12 + data.length;
  };
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w);
  iv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  chunk('IHDR', ihdr);
  chunk('IDAT', idat);
  chunk('IEND', new Uint8Array(0));
  return out;
}
