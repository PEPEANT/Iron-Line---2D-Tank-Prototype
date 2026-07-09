"use strict";

// Generates placeholder weapon illustration PNGs into assets/weapons/.
// Real art drops in later with the same file names (96x48, transparent bg).
// Usage: node tools/generate-weapon-placeholders.cjs [--force]

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const WIDTH = 96;
const HEIGHT = 48;
const OUT_DIR = path.join(__dirname, "..", "assets", "weapons");
const FORCE = process.argv.includes("--force");

const BODY = [223, 230, 224, 255];
const DARK = [150, 160, 152, 255];
const AMBER = [255, 209, 102, 255];
const BLUE = [142, 216, 255, 255];

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    raw[y * (WIDTH * 4 + 1)] = 0;
    pixels.copy(raw, y * (WIDTH * 4 + 1) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function makeCanvas() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  const set = (x, y, color) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) return;
    const offset = (py * WIDTH + px) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  };
  const rect = (x, y, w, h, color) => {
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) set(x + dx, y + dy, color);
  };
  const circle = (cx, cy, radius, color) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy <= radius * radius) set(cx + dx, cy + dy, color);
      }
    }
  };
  const line = (x0, y0, x1, y1, thickness, color) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      rect(cx - thickness / 2, cy - thickness / 2, thickness, thickness, color);
    }
  };
  return { pixels, rect, circle, line };
}

// Every silhouette faces right, roughly centered on 96x48.
const WEAPONS = {
  rifle(c) {
    c.rect(10, 24, 14, 6, DARK); // stock
    c.rect(22, 22, 44, 8, BODY); // receiver
    c.rect(66, 24, 22, 4, BODY); // barrel
    c.rect(36, 30, 7, 10, DARK); // magazine
    c.rect(30, 18, 10, 4, DARK); // sight
    c.rect(48, 30, 4, 7, DARK); // grip
  },
  smg(c) {
    c.rect(16, 22, 34, 9, BODY);
    c.rect(50, 24, 14, 4, BODY);
    c.rect(28, 31, 7, 13, DARK); // long mag
    c.rect(40, 31, 4, 7, DARK);
    c.rect(10, 24, 6, 5, DARK); // folding stock
  },
  lmg(c) {
    c.rect(8, 23, 12, 7, DARK);
    c.rect(20, 20, 46, 10, BODY);
    c.rect(66, 23, 22, 5, BODY);
    c.rect(34, 30, 12, 10, AMBER); // box mag
    c.rect(70, 28, 3, 12, DARK); // bipod front
    c.rect(78, 28, 3, 12, DARK); // bipod rear
    c.rect(28, 16, 12, 4, DARK);
  },
  machinegun(c) {
    c.rect(8, 23, 12, 7, DARK);
    c.rect(20, 20, 44, 11, BODY);
    c.rect(64, 22, 26, 6, BODY);
    c.rect(64, 20, 8, 10, DARK); // barrel shroud
    c.rect(34, 31, 12, 9, AMBER);
    c.rect(50, 31, 4, 8, DARK);
    c.rect(26, 16, 12, 4, DARK);
  },
  pistol(c) {
    c.rect(30, 20, 34, 9, BODY); // slide
    c.rect(58, 22, 10, 5, BODY);
    c.rect(34, 29, 9, 14, DARK); // grip
    c.rect(44, 29, 8, 5, DARK); // trigger guard
  },
  sniper(c) {
    c.rect(6, 25, 14, 6, DARK);
    c.rect(20, 23, 36, 7, BODY);
    c.rect(56, 25, 34, 3, BODY);
    c.rect(30, 15, 16, 5, BLUE); // scope
    c.rect(35, 20, 5, 3, DARK);
    c.rect(40, 30, 6, 8, DARK);
    c.rect(84, 23, 5, 7, DARK); // muzzle brake
  },
  grenade(c) {
    c.circle(46, 27, 12, BODY);
    c.circle(46, 27, 8, DARK);
    c.rect(41, 12, 10, 6, DARK); // fuse head
    c.rect(51, 10, 10, 4, AMBER); // lever
    c.circle(58, 16, 3, AMBER); // pin ring
  },
  grenadeLauncher(c) {
    c.rect(14, 22, 20, 8, DARK); // stock
    c.rect(32, 19, 34, 14, BODY); // fat tube
    c.rect(66, 22, 16, 8, DARK); // muzzle
    c.rect(42, 33, 5, 9, DARK);
    c.rect(36, 14, 12, 4, AMBER); // sight
  },
  rpg(c) {
    c.rect(10, 24, 46, 7, BODY); // tube
    c.rect(56, 20, 12, 15, DARK); // cone base
    c.line(68, 27, 86, 27, 9, AMBER); // warhead
    c.circle(84, 27, 5, AMBER);
    c.rect(4, 22, 8, 11, DARK); // exhaust
    c.rect(28, 31, 5, 9, DARK);
    c.rect(34, 17, 10, 5, DARK);
  },
  repairKit(c) {
    c.rect(26, 16, 44, 24, BODY); // case
    c.rect(26, 26, 44, 4, DARK); // seam
    c.rect(42, 10, 12, 8, DARK); // handle
    c.rect(44, 20, 8, 16, AMBER); // cross v
    c.rect(38, 26, 20, 4, AMBER); // cross h (overwritten seam ok)
  },
  fieldRadio(c) {
    c.line(46, 10, 58, 3, 3, DARK);
    c.line(56, 5, 66, 17, 3, DARK);
    c.rect(35, 10, 28, 32, DARK);
    c.rect(38, 13, 22, 26, BODY);
    c.rect(42, 16, 14, 8, [216, 244, 199, 255]);
    c.rect(42, 28, 14, 2, DARK);
    c.rect(42, 33, 14, 2, DARK);
    c.circle(44, 39, 2, AMBER);
    c.circle(50, 39, 2, DARK);
    c.circle(56, 39, 2, DARK);
  },
  reconDrone(c) {
    c.rect(38, 22, 20, 10, BODY); // body
    c.line(38, 24, 22, 14, 3, DARK);
    c.line(58, 24, 74, 14, 3, DARK);
    c.line(38, 30, 22, 40, 3, DARK);
    c.line(58, 30, 74, 40, 3, DARK);
    c.rect(14, 12, 16, 3, BLUE); // rotors
    c.rect(66, 12, 16, 3, BLUE);
    c.rect(14, 39, 16, 3, BLUE);
    c.rect(66, 39, 16, 3, BLUE);
    c.circle(48, 27, 3, BLUE); // camera eye
  },
  kamikazeDrone(c) {
    c.rect(38, 20, 20, 9, BODY);
    c.line(38, 22, 24, 13, 3, DARK);
    c.line(58, 22, 72, 13, 3, DARK);
    c.line(38, 27, 24, 36, 3, DARK);
    c.line(58, 27, 72, 36, 3, DARK);
    c.rect(16, 11, 16, 3, DARK);
    c.rect(64, 11, 16, 3, DARK);
    c.rect(16, 35, 16, 3, DARK);
    c.rect(64, 35, 16, 3, DARK);
    c.rect(43, 29, 10, 12, AMBER); // warhead
    c.line(48, 41, 48, 45, 3, AMBER);
  }
};

fs.mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
let skipped = 0;
for (const [id, draw] of Object.entries(WEAPONS)) {
  const file = path.join(OUT_DIR, `${id}.png`);
  if (!FORCE && fs.existsSync(file)) {
    skipped += 1;
    continue;
  }
  const canvas = makeCanvas();
  draw(canvas);
  fs.writeFileSync(file, encodePng(canvas.pixels));
  written += 1;
}
console.log(`Weapon placeholder PNGs: ${written} written, ${skipped} kept (real art wins; use --force to redraw).`);
