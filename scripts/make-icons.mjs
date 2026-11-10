// Draws the app icon (a pot on a terracotta background) and writes the PNG sizes
// phones ask for. Run with `node scripts/make-icons.mjs` after changing the design.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [169, 74, 34];
const FG = [250, 246, 241];

/** Is the point (x, y), each 0..1, part of the pot drawing? */
function inPot(x, y) {
  const roundedBox = (cx, cy, hw, hh, r) => {
    const dx = Math.max(Math.abs(x - cx) - (hw - r), 0);
    const dy = Math.max(Math.abs(y - cy) - (hh - r), 0);
    return dx * dx + dy * dy <= r * r;
  };
  const body = roundedBox(0.5, 0.62, 0.25, 0.16, 0.07);
  const lid = roundedBox(0.5, 0.42, 0.28, 0.025, 0.025);
  const knob = roundedBox(0.5, 0.36, 0.05, 0.03, 0.03);
  const handles = roundedBox(0.5, 0.56, 0.33, 0.03, 0.03);
  return body || lid || knob || handles;
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size) {
  const SS = 3; // samples per pixel edge, for smooth outlines
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 3 + 1);
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) if (inPot((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size)) hits++;
      const a = hits / (SS * SS);
      for (let ch = 0; ch < 3; ch++) raw[row + 1 + px * 3 + ch] = Math.round(BG[ch] * (1 - a) + FG[ch] * a);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../public/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(new URL(name, dir), png(size));
  console.log(`wrote public/${name}`);
}
