/**
 * Generates the PWA / touch icons into ./public.
 *
 *   node scripts/generate-icons.mjs
 *
 * Written as a tiny PNG encoder rather than pulling in an image library: the
 * mark is two slanted VOLT bars on the arena's near-black, which is pure
 * geometry. Re-run this if the brand colours in DESIGN.md change.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const INK = [0x08, 0x09, 0x0a];
const VOLT = [0xcc, 0xff, 0x00];
const BLAZE = [0xff, 0x5c, 0x1a];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixelAt) {
  // Raw scanlines: one filter byte (0 = none) then RGB triples.
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const offset = y * stride + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The mark: two forward-leaning bars (the "//" of the wordmark) with a blaze
 * underline, on ink. Maskable-safe: everything sits inside the middle 80%.
 */
function arenaMark(size) {
  const unit = size / 64;
  const slant = 0.42;

  return (x, y) => {
    const u = x / unit;
    const v = y / unit;

    // Blaze underline
    if (v >= 50 && v <= 53 && u >= 12 && u <= 52) return BLAZE;

    // Two slanted bars, second one dimmer
    const shifted = u + (v - 12) * slant;
    if (v >= 12 && v <= 46) {
      if (shifted >= 26 && shifted <= 38) return VOLT;
      if (shifted >= 42 && shifted <= 54) {
        return VOLT.map((channel, index) => Math.round(channel * 0.45 + INK[index] * 0.55));
      }
    }

    return INK;
  };
}

const outDir = path.join(process.cwd(), 'public');

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'apple-icon.png' : `icon-${size}.png`;
  const png = encodePng(size, arenaMark(size));
  writeFileSync(path.join(outDir, name), png);
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}
