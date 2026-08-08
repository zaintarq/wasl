/**
 * Removes near-white / sampled background from mascot PNGs (transparent alpha).
 * Run: node scripts/remove-mascot-white-bg.js
 * Requires: pngjs (devDependency)
 */

const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const { fillInteriorHoles } = require('./fill-mascot-interior-holes');

const imagesDir = path.join(__dirname, '..', 'assets', 'images');
const files = ['app-logo.png', 'stop-touching.png'];

/** How close RGB must be to detected background before full transparency (0–255). */
const TOLERANCE = 52;
/** Feather edge: pixels between TOLERANCE and TOLERANCE+SOFT get partial alpha. */
const SOFT = 36;

function sampleBackgroundColor(data, width, height) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of corners) {
    const idx = (width * y + x) << 2;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
  }
  return [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
}

function distance(r, g, b, br, bg, bb) {
  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function processPixels(data, width, height, bgR, bgG, bgB) {
  const maxD = Math.sqrt(3 * 255 * 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const d = distance(r, g, b, bgR, bgG, bgB);

      if (d <= TOLERANCE) {
        data[idx + 3] = 0;
      } else if (d < TOLERANCE + SOFT) {
        const t = (d - TOLERANCE) / SOFT;
        data[idx + 3] = Math.round(255 * t);
      }
      // else keep original alpha (usually 255)
    }
  }
}

function removeBackground(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(new PNG())
      .on('parsed', function () {
        const data = this.data;
        const { width, height } = this;
        const [bgR, bgG, bgB] = sampleBackgroundColor(data, width, height);
        processPixels(data, width, height, bgR, bgG, bgB);

        this.pack()
          .pipe(fs.createWriteStream(outputPath))
          .on('finish', () => {
            console.log('Written:', outputPath);
            resolve();
          })
          .on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  for (const file of files) {
    const inputPath = path.join(imagesDir, file);
    if (!fs.existsSync(inputPath)) {
      console.warn('Skip (not found):', inputPath);
      continue;
    }
    const backup = `${inputPath}.bak.png`;
    if (!fs.existsSync(backup)) {
      fs.copyFileSync(inputPath, backup);
      console.log('Backup:', backup);
    }
    await removeBackground(inputPath, inputPath);
    const { filled } = fillInteriorHoles(inputPath, inputPath);
    console.log('Interior holes filled:', filled);
  }
  console.log('Done. Re-run restores from *.bak.png if needed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
