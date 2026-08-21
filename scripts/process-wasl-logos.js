/**
 * Process Wasl logos → transparent PNGs.
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
    variant: 'en',
    tol: 52,
  },
  {
    src: path.join(imagesDir, 'wasl-logo-ar-source.png'),
    out: path.join(imagesDir, 'wasl-logo-ar.png'),
    docsOut: path.join(docsDir, 'wasl-logo-ar.png'),
    variant: 'ar-clean',
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

function isInk(r, g, b) {
  const sum = r + g + b;
  return sum < 120 || Math.max(r, g, b) < 55;
}

function isCheckerBg(r, g, b) {
  const sum = r + g + b;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return sum > 500 && chroma < 24;
}

function floodRemoveExterior(data, width, height, br, bg, bb, tol) {
  const isBg = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return isCheckerBg(r, g, b) || dist(r, g, b, br, bg, bb) <= tol;
  };
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

function scrubEnclosedChecker(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isInk(r, g, b)) continue;
    if (isCheckerBg(r, g, b)) data[i + 3] = 0;
  }
}

function defringeLight(data, br, bg, bb, tol, soft) {
  for (let i = 0; i < data.length; i += 4) {
    const d = dist(data[i], data[i + 1], data[i + 2], br, bg, bb);
    if (d <= tol) {
      data[i + 3] = 0;
    } else if (d < tol + soft && data[i + 3] < 255) {
      data[i + 3] = Math.min(data[i + 3], Math.round((255 * (d - tol)) / soft));
    }
  }
}

function cutBackground(buffer, tol) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  const bg = sampleCorners(data, width, height);
  floodRemoveExterior(data, width, height, ...bg, tol);
  scrubEnclosedChecker(data);
  defringeLight(data, ...bg, tol, 20);
  return PNG.sync.write(png);
}

function cutCleanAr(buffer) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = 255;
  }
  const bg = sampleCorners(data, width, height);
  floodRemoveExterior(data, width, height, ...bg, 36);
  scrubEnclosedChecker(data);
  return PNG.sync.write(png);
}

function tightCrop(pngBuffer, pad = 4) {
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

async function processLogo({ src, out, variant, tol }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return false;
  }
  const raw = await sharp(src).ensureAlpha().png().toBuffer();
  const cut =
    variant === 'ar-clean'
      ? tightCrop(cutCleanAr(raw), 6)
      : tightCrop(cutBackground(raw, tol), 2);
  await sharp(cut).png({ compressionLevel: 9 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`Written ${variant} (${meta.width}x${meta.height}):`, path.basename(out));
  return meta;
}

async function main() {
  fs.mkdirSync(docsDir, { recursive: true });
  const only = process.env.ONLY?.split(',') || null;
  for (const item of LOGOS) {
    if (only && !only.includes(item.variant.replace('-clean', '')) && !only.includes(item.variant)) continue;
    const meta = await processLogo(item);
    if (!meta) continue;
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
