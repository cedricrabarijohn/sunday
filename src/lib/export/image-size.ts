/* Minimal intrinsic-dimension sniffer for the image types a card description
 * can embed. Reads just the header — no decoding, no dependency. Returns null
 * for anything it doesn't recognize (caller falls back to a hyperlink). */

export type ImageMeta = { type: "png" | "jpg" | "gif"; width: number; height: number };

export function imageMeta(buf: Buffer): ImageMeta | null {
  if (buf.length < 24) return null;

  // PNG: 8-byte signature, then IHDR (width @16, height @20, big-endian).
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: "GIF8", then logical-screen width/height (little-endian @6/@8).
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { type: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // JPEG: 0xFFD8, then walk segment markers to the first Start-Of-Frame.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      // SOF0..SOF15, excluding DHT(C4), JPG(C8), DAC(CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "jpg", height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      const segLen = buf.readUInt16BE(off + 2);
      if (segLen < 2) return null;
      off += 2 + segLen;
    }
  }

  return null;
}
