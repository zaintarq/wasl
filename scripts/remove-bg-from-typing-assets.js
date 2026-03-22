/**
 * Removes solid background from boys.png and girl.png.
 * Samples corner pixels to detect background color, then makes matching pixels transparent.
 * Run: npm run remove-typing-bg
 * Requires: npm install pngjs --save-dev
 */

const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');

const assetsDir = path.join(__dirname, '..', 'assets');
const files = ['boys.png', 'girl.png'];

const TOLERANCE = 42; // How close RGB must be to background to be removed (0–255)

function sampleBackgroundColor(data, width, height) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of corners) {
    const idx = (width * y + x) << 2;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
  }
  return [r >> 2, g >> 2, b >> 2]; // average of 4 corners
}

function isBackgroundPixel(r, g, b, a, bgR, bgG, bgB) {
  if (a < 15) return true;
  const dr = Math.abs(r - bgR);
  const dg = Math.abs(g - bgG);
  const db = Math.abs(b - bgB);
  return dr <= TOLERANCE && dg <= TOLERANCE && db <= TOLERANCE;
}

function removeBackground(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(new PNG())
      .on('parsed', function () {
        const data = this.data;
        const width = this.width;
        const height = this.height;
        const [bgR, bgG, bgB] = sampleBackgroundColor(data, width, height);

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (width * y + x) << 2;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            if (isBackgroundPixel(r, g, b, a, bgR, bgG, bgB)) {
              data[idx + 3] = 0;
            }
          }
        }

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
    const inputPath = path.join(assetsDir, file);
    if (!fs.existsSync(inputPath)) {
      console.warn('Skip (not found):', inputPath);
      continue;
    }
    await removeBackground(inputPath, inputPath);
  }
  console.log('Done. Background removed from typing assets.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
