// Generates build/icon.png (256x256): violet-to-pink rounded square with a 2x2 grid glyph.
// Dependency-free PNG encoder.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 256;
const px = Buffer.alloc(N * N * 4);

const sdRoundBox = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const cover = (d) => Math.min(1, Math.max(0, 0.5 - d)); // 1px antialias
const mix = (a, b, t) => a + (b - a) * t;

const A = [139, 92, 246];
const B = [236, 72, 153];
const cells = [[84, 84], [172, 84], [84, 172], [172, 172]];

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const t = (x + y) / (2 * N);
    let r = mix(A[0], B[0], t), g = mix(A[1], B[1], t), b = mix(A[2], B[2], t);
    let a = cover(sdRoundBox(x + 0.5, y + 0.5, N / 2, N / 2, 120, 120, 54));
    for (const [cx, cy] of cells) {
      const c = cover(sdRoundBox(x + 0.5, y + 0.5, cx, cy, 30, 30, 11)) * 0.95;
      r = mix(r, 255, c); g = mix(g, 255, c); b = mix(b, 255, c);
    }
    const i = (y * N + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.round(a * 255);
  }
}

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
