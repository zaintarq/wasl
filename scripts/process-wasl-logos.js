/**
 * Process Wasl logos → transparent PNGs (edge flood-fill + trim).
 * EN: corner BG sample (f92e918 pipeline). AR: top/left edge sample + grey-plate scrub.
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
    src: path.join(imagesDir, 'wasl-logo-ar-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-ar.png'),
    docsOut: path.join(docsDir, 'wasl-logo-ar.png'),
    variant: 'ar',
    tol: 62,
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

/** AR plate + watermark: sample only top/left edges (skip vignette corners). */
function sampleEdgePlate(data, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let x = 12; x < width - 220; x += 24) {
    const i = x * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  for (let y = 12; y < height - 12; y += 24) {
    const i = (y * width) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function dist(r, g, b, br, bg, bb) {
  return Math.sqrt((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2);
}

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

/** EN only: feather compression fringe without touching ink. */
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

/** Drop enclosed grey plate, vignette strips, and watermark leftovers; keep black ink. */
function scrubGreyPlate(data, width, height, br, bg, bb) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const sum = r + g + b;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    if (sum < 180 && maxC < 90) continue;
    if (chroma < 48 && sum > 400) {
      data[i + 3] = 0;
      continue;
    }
    if (dist(r, g, b, br, bg, bb) <= 58) data[i + 3] = 0;
  }
}

/** Watermark grey text only — keep black calligraphy (horns/head). */
function scrubTopWatermark(data, width, height) {
  const topH = 78;
  const leftX = Math.round(width * 0.64);
  for (let y = 0; y < topH; y++) {
    for (let x = leftX; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const sum = r + g + b;
      const maxC = Math.max(r, g, b);
      if (sum > 140 && sum < 580 && maxC < 210) data[i + 3] = 0;
    }
  }
}

/** JPEG blue fringe on plate / vignette edges. */
function scrubBlueFringe(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const sum = r + g + b;
    if (sum < 130) continue;
    if (b > r + 6 && b > g + 4) data[i + 3] = 0;
  }
}

/** Vertical grey/blue plate column on the right (vignette seam). */
function scrubRightPlateLine(data, width, height) {
  const startX = Math.round(width * 0.78);
  for (let x = startX; x < width; x++) {
    let plate = 0;
    let ink = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const sum = r + g + b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (sum < 150) ink++;
      else if (chroma < 52 && sum > 280) plate++;
    }
    if (plate > 8 && plate >= ink) {
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 16) continue;
        const sum = data[i] + data[i + 1] + data[i + 2];
        if (sum > 130) data[i + 3] = 0;
      }
    }
  }
}

/** Remove mostly-grey side columns (vignette leftovers). */
function stripSideGreyBands(data, width, height) {
  const band = Math.max(12, Math.round(width * 0.04));
  for (let pass = 0; pass < 2; pass++) {
    for (const side of ['left', 'right']) {
      for (let x = 0; x < band; x++) {
        const col = side === 'left' ? x : width - 1 - x;
        let grey = 0;
        let total = 0;
        for (let y = 0; y < height; y++) {
          const i = (y * width + col) * 4;
          if (data[i + 3] < 16) continue;
          total++;
          const sum = data[i] + data[i + 1] + data[i + 2];
          const maxC = Math.max(data[i], data[i + 1], data[i + 2]);
          if (sum > 400 && maxC > 100) grey++;
        }
        if (total > 0 && grey / total > 0.55) {
          for (let y = 0; y < height; y++) {
            const i = (y * width + col) * 4;
            const sum = data[i] + data[i + 1] + data[i + 2];
            const maxC = Math.max(data[i], data[i + 1], data[i + 2]);
            if (data[i + 3] > 16 && sum > 350 && maxC > 90) data[i + 3] = 0;
          }
        }
      }
    }
  }
}

function cutBackground(buffer, variant, tol) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  const bg = variant === 'ar' ? sampleEdgePlate(data, width, height) : sampleCorners(data, width, height);
  floodRemoveExterior(data, width, height, ...bg, tol);
  if (variant === 'en') {
    defringeLight(data, ...bg, tol, 28);
  } else {
    scrubGreyPlate(data, width, height, ...bg);
    scrubTopWatermark(data, width, height);
    scrubGreyPlate(data, width, height, ...bg);
    scrubBlueFringe(data);
    stripSideGreyBands(data, width, height);
    scrubRightPlateLine(data, width, height);
  }
  return PNG.sync.write(png);
}

/** Final pass on cropped AR asset — watermark corner + side vignette. */
function postCropArCleanup(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  const { data, width, height } = png;
  const wmLeft = Math.round(width * 0.82);
  const wmTop = 72;
  for (let y = 0; y < wmTop; y++) {
    for (let x = wmLeft; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 16) continue;
      const sum = data[i] + data[i + 1] + data[i + 2];
      const maxC = Math.max(data[i], data[i + 1], data[i + 2]);
      if (sum > 140 && sum < 520 && maxC < 210) data[i + 3] = 0;
    }
  }
  scrubBlueFringe(data);
  scrubRightPlateLine(data, width, height);
  stripSideGreyBands(data, width, height);
  const band = Math.max(10, Math.round(width * 0.035));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < band; x++) {
      for (const col of [x, width - 1 - x]) {
        const i = (y * width + col) * 4;
        if (data[i + 3] < 16) continue;
        const sum = data[i] + data[i + 1] + data[i + 2];
        const maxC = Math.max(data[i], data[i + 1], data[i + 2]);
        const chroma = maxC - Math.min(data[i], data[i + 1], data[i + 2]);
        if (sum > 380 && maxC > 95 && chroma < 45) data[i + 3] = 0;
      }
    }
  }
  scrubBlueFringe(data);
  return PNG.sync.write(png);
}

function tightCrop(pngBuffer, { inkTop = false, padTop = 2 } = {}) {
  const png = PNG.sync.read(pngBuffer);
  const { data, width, height } = png;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let minYInk = height;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      if (data[i + 3] <= 16) continue;
      const sum = data[i] + data[i + 1] + data[i + 2];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (sum < 180) minYInk = Math.min(minYInk, y);
    }
  }
  if (maxX < minX || maxY < minY) return pngBuffer;
  if (inkTop && minYInk < height) minY = Math.min(minY, minYInk);
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - padTop);
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

async function prepareArRaster(src) {
  const meta = await sharp(src).metadata();
  const w = meta.width;
  const h = meta.height;
  const { data } = await sharp(src).extract({ left: 50, top: 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  const fill = `rgb(${r},${g},${b})`;
  const svg = `<svg width="${w}" height="${h}">
    <rect x="660" y="0" width="${w - 660}" height="78" fill="${fill}"/>
  </svg>`;
  return sharp(src).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).ensureAlpha().png().toBuffer();
}

async function processLogo({ src, out, variant, tol }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return false;
  }
  const raw = variant === 'ar' ? await prepareArRaster(src) : await sharp(src).ensureAlpha().png().toBuffer();
  let cut = tightCrop(cutBackground(raw, variant, tol), variant === 'ar' ? { inkTop: true, padTop: 8 } : {});
  if (variant === 'ar') cut = postCropArCleanup(cut);
  await sharp(cut).png({ compressionLevel: 9 }).toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`Written ${variant} (${meta.width}x${meta.height}):`, path.basename(out));
  return meta;
}

async function main() {
  fs.mkdirSync(docsDir, { recursive: true });
  const only = process.env.ONLY?.split(',') || null;
  for (const item of LOGOS) {
    if (only && !only.includes(item.variant)) continue;
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
