/**
 * Process Wasl logos: transparent PNGs.
 * - English: light BG (white/grey) corner cutout
 * - Arabic tap reveal: dark BG flood-fill from edges (black plate)
 * Run: node scripts/process-wasl-logos.js
 */
const sharp = require('sharp');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const imagesDir = path.join(ROOT, 'assets', 'images');
const docsDir = path.join(ROOT, 'docs', 'assets');

const LIGHT_TOL = 58;
const LIGHT_SOFT = 40;
const DARK_TOL = 42;

const LOGOS = [
  {
    src: path.join(imagesDir, 'wasl-logo-en-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-en.png'),
    docsOut: path.join(docsDir, 'wasl-logo-en.png'),
    legacyOut: path.join(imagesDir, 'app-logo.png'),
    legacyDocs: path.join(docsDir, 'app-logo.png'),
    mode: 'light',
  },
  {
    src: path.join(imagesDir, 'wasl-logo-ar-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-ar.png'),
    docsOut: path.join(docsDir, 'wasl-logo-ar.png'),
    mode: 'dark',
  },
];

function sampleCorners(data, width, height) {
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of corners) {
    const i = (width * y + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
}

function dist(r, g, b, br, bg, bb) {
  return Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
}

function removeLightBackground(data, width, height) {
  const [br, bg, bb] = sampleCorners(data, width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const d = dist(data[i], data[i + 1], data[i + 2], br, bg, bb);
      if (d <= LIGHT_TOL) {
        data[i + 3] = 0;
      } else if (d < LIGHT_TOL + LIGHT_SOFT) {
        data[i + 3] = Math.round((255 * (d - LIGHT_TOL)) / LIGHT_SOFT);
      }
    }
  }
}

/** Flood exterior dark BG from image edges; white outlines keep logo ink. */
function removeDarkBackground(data, width, height) {
  const [br, bg, bb] = sampleCorners(data, width, height);
  const isBg = (i) => dist(data[i], data[i + 1], data[i + 2], br, bg, bb) <= DARK_TOL;
  const seen = new Uint8Array(width * height);
  const queue = [];

  const trySeed = (x, y) => {
    const idx = y * width + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (!isBg(i)) return;
    seen[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop();
    const i = idx * 4;
    data[i + 3] = 0;

    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) tryPush(x - 1, y);
    if (x < width - 1) tryPush(x + 1, y);
    if (y > 0) tryPush(x, y - 1);
    if (y < height - 1) tryPush(x, y + 1);
  }

  function tryPush(x, y) {
    const idx = y * width + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (!isBg(i)) return;
    seen[idx] = 1;
    queue.push(idx);
  }
}

function removeBackground(buffer, mode) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  if (mode === 'dark') removeDarkBackground(data, width, height);
  else removeLightBackground(data, width, height);
  return PNG.sync.write(png);
}

async function processLogo({ src, out, mode }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return false;
  }
  const raw = await sharp(src).ensureAlpha().png().toBuffer();
  const cut = removeBackground(raw, mode);
  await sharp(cut).png({ compressionLevel: 9 }).toFile(out);
  console.log(`Written (${mode} BG cut):`, path.basename(out));
  return true;
}

async function main() {
  fs.mkdirSync(docsDir, { recursive: true });
  for (const item of LOGOS) {
    const ok = await processLogo(item);
    if (!ok) continue;
    if (item.docsOut) fs.copyFileSync(item.out, item.docsOut);
    if (item.legacyOut) {
      fs.copyFileSync(item.out, item.legacyOut);
      fs.copyFileSync(item.out, item.legacyDocs);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
