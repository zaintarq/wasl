/**
 * Process welcome mascot PNGs with ONE pipeline (same as angry art):
 * 1) flatten sampled corner background → white
 * 2) white-key cutout (tol 52 / soft 36)
 */
const sharp = require('sharp');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const imagesDir = path.join(ROOT, 'assets', 'images');

const TOLERANCE = 52;
const SOFT = 36;

const SOURCES = [
  {
    src: path.join(imagesDir, 'wasl-logo-source.jpg'),
    out: path.join(imagesDir, 'app-logo.png'),
  },
  {
    src: path.join(imagesDir, 'wasl-arabic-logo-source.jpg'),
    out: path.join(imagesDir, 'wasl-arabic-logo.png'),
  },
  {
    src: path.join(
      '/Users/muhammad-zain/.cursor/projects/Users-muhammad-zain-Desktop-huzz/assets',
      'Copilot_20260730_185551-60fb6a26-ac3d-4298-b3af-daf19e91df72.png'
    ),
    out: path.join(imagesDir, 'stop-touching.png'),
  },
];

function sampleCorners(data, width, height) {
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

/** Identical cutout for default + angry mascots */
function cutoutLikeAngry(buffer) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  const [br, bg, bb] = sampleCorners(data, width, height);

  // Step 1: whatever the corner bg is (black OR white) → flat white plate
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const d = dist(r, g, b, br, bg, bb);
      if (d <= TOLERANCE + SOFT) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
  }

  // Step 2: white-key — same as angry art
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const d = dist(r, g, b, 255, 255, 255);
      if (d <= TOLERANCE) {
        data[i + 3] = 0;
      } else if (d < TOLERANCE + SOFT) {
        data[i + 3] = Math.round((255 * (d - TOLERANCE)) / SOFT);
      }
    }
  }

  return PNG.sync.write(png);
}

async function processOne({ src, out }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return;
  }
  const raw = await sharp(src).png().toBuffer();
  const cut = cutoutLikeAngry(raw);
  await sharp(cut).png({ compressionLevel: 9 }).toFile(out);
  console.log('Written:', path.basename(out));
}

async function main() {
  for (const item of SOURCES) {
    await processOne(item);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
