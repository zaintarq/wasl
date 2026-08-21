/**
 * Process Wasl logos → transparent PNGs with solid ink (same bold look).
 * - English: light BG, edge flood
 * - Arabic (black plate): keep ink neighborhood around white/black artwork, drop outer black
 * Run: node scripts/process-wasl-logos.js
 */
const sharp = require('sharp');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const imagesDir = path.join(ROOT, 'assets', 'images');
const docsDir = path.join(ROOT, 'docs', 'assets');

const TOL = 52;
const INK_LUM = 118;
const INK_DILATE = 28;

const LOGOS = [
  {
    src: path.join(imagesDir, 'wasl-logo-en-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-en.png'),
    docsOut: path.join(docsDir, 'wasl-logo-en.png'),
    legacyOut: path.join(imagesDir, 'app-logo.png'),
    legacyDocs: path.join(docsDir, 'app-logo.png'),
    darkBg: false,
  },
  {
    src: path.join(imagesDir, 'wasl-logo-ar-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-ar.png'),
    docsOut: path.join(docsDir, 'wasl-logo-ar.png'),
    darkBg: true,
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

function isInkPixel(i, data) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return Math.max(r, g, b) >= INK_LUM || r + g + b >= 90;
}

function dilateMask(mask, width, height, radius) {
  const out = new Uint8Array(mask.length);
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
}

function clearExteriorLight(data, width, height, br, bg, bb, tol) {
  const isBg = (i) => dist(data[i], data[i + 1], data[i + 2], br, bg, bb) <= tol;
  const seen = new Uint8Array(width * height);
  const queue = [];

  const seed = (x, y) => {
    const idx = y * width + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (!isBg(i)) return;
    seen[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }

  while (queue.length) {
    const idx = queue.pop();
    data[idx * 4 + 3] = 0;
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  function push(x, y) {
    const idx = y * width + x;
    if (seen[idx]) return;
    const i = idx * 4;
    if (!isBg(i)) return;
    seen[idx] = 1;
    queue.push(idx);
  }
}

/** Black plate: keep dilated artwork ink; drop outer black void. */
function cutDarkArtwork(data, width, height) {
  const seed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (isInkPixel(idx * 4, data)) seed[idx] = 1;
    }
  }
  const keep = dilateMask(seed, width, height, INK_DILATE);
  for (let idx = 0; idx < width * height; idx++) {
    const i = idx * 4;
    if (keep[idx]) {
      data[i + 3] = 255;
    } else {
      data[i + 3] = 0;
    }
  }
}

function cutBackground(buffer, darkBg) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  if (darkBg) {
    cutDarkArtwork(data, width, height);
  } else {
    const bg = sampleCorners(data, width, height);
    clearExteriorLight(data, width, height, ...bg, TOL);
  }
  return PNG.sync.write(png);
}

function tightCrop(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  const { data, width, height } = png;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(width * y + x) * 4 + 3] > 16) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) return pngBuffer;
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((minY + y) * width + (minX + x)) * 4;
      const di = (y * cw + x) * 4;
      out.data[di] = data[si];
      out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2];
      out.data[di + 3] = data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

async function processLogo({ src, out, darkBg }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return false;
  }
  const raw = await sharp(src).ensureAlpha().png().toBuffer();
  const cut = tightCrop(cutBackground(raw, darkBg));
  await sharp(cut).png({ compressionLevel: 9 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`Written (${meta.width}x${meta.height}):`, path.basename(out));
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
