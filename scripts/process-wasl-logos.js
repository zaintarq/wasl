/**
 * Process Wasl logos → transparent PNGs (edge flood-fill + trim).
 * Run: node scripts/process-wasl-logos.js
 */
const sharp = require('sharp');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const imagesDir = path.join(ROOT, 'assets', 'images');
const docsDir = path.join(ROOT, 'docs', 'assets');

const LOGOS = [
  {
    src: path.join(imagesDir, 'wasl-logo-en-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-en.png'),
    docsOut: path.join(docsDir, 'wasl-logo-en.png'),
    legacyOut: path.join(imagesDir, 'app-logo.png'),
    legacyDocs: path.join(docsDir, 'app-logo.png'),
    mode: 'light',
    tol: 52,
  },
  {
    src: path.join(imagesDir, 'wasl-logo-ar-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-ar.png'),
    docsOut: path.join(docsDir, 'wasl-logo-ar.png'),
    mode: 'dark',
    tol: 48,
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

/** Remove only exterior BG connected to image edges — keeps letter counters / ink. */
function floodRemoveExterior(data, width, height, br, bg, bb, tol) {
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

/** Feather leftover BG fringe (compression artefacts). */
function defringe(data, br, bg, bb, tol, soft) {
  for (let i = 0; i < data.length; i += 4) {
    const d = dist(data[i], data[i + 1], data[i + 2], br, bg, bb);
    if (d <= tol) {
      data[i + 3] = 0;
    } else if (d < tol + soft && data[i + 3] < 255) {
      data[i + 3] = Math.min(data[i + 3], Math.round((255 * (d - tol)) / soft));
    }
  }
}

function cutBackground(buffer, mode, tol) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  const [br, bg, bb] = sampleCorners(data, width, height);
  floodRemoveExterior(data, width, height, br, bg, bb, tol);
  defringe(data, br, bg, bb, tol, 28);
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

async function processLogo({ src, out, mode, tol }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return false;
  }
  const raw = await sharp(src).ensureAlpha().png().toBuffer();
  const cut = tightCrop(cutBackground(raw, mode, tol));
  await sharp(cut).png({ compressionLevel: 9 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`Written (${mode}, ${meta.width}x${meta.height}):`, path.basename(out));
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
