/**
 * Process Wasl logos: corner-sampled BG removal → transparent PNG.
 * Run: node scripts/process-wasl-logos.js
 */
const sharp = require('sharp');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const imagesDir = path.join(ROOT, 'assets', 'images');
const docsDir = path.join(ROOT, 'docs', 'assets');

/** BG feather — white / light grey plate behind black ink. */
const TOLERANCE = 58;
const SOFT = 40;

const LOGOS = [
  {
    src: path.join(imagesDir, 'wasl-logo-en-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-en.png'),
    docsOut: path.join(docsDir, 'wasl-logo-en.png'),
    legacyOut: path.join(imagesDir, 'app-logo.png'),
    legacyDocs: path.join(docsDir, 'app-logo.png'),
  },
  {
    src: path.join(imagesDir, 'wasl-logo-ar-source.jpg'),
    out: path.join(imagesDir, 'wasl-logo-ar.png'),
    docsOut: path.join(docsDir, 'wasl-logo-ar.png'),
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

function removeBackground(buffer) {
  const png = PNG.sync.read(buffer);
  const { data, width, height } = png;
  const [br, bg, bb] = sampleCorners(data, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const d = dist(r, g, b, br, bg, bb);

      if (d <= TOLERANCE) {
        data[i + 3] = 0;
      } else if (d < TOLERANCE + SOFT) {
        data[i + 3] = Math.round((255 * (d - TOLERANCE)) / SOFT);
      }
    }
  }

  return PNG.sync.write(png);
}

async function processLogo({ src, out }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return false;
  }
  const raw = await sharp(src).ensureAlpha().png().toBuffer();
  const cut = removeBackground(raw);
  await sharp(cut).png({ compressionLevel: 9 }).toFile(out);
  console.log('Written (transparent BG):', path.basename(out));
  return true;
}

async function main() {
  fs.mkdirSync(docsDir, { recursive: true });
  for (const item of LOGOS) {
    const ok = await processLogo({ src: item.src, out: item.out });
    if (!ok) continue;
    if (item.docsOut) {
      fs.copyFileSync(item.out, item.docsOut);
      console.log('Copied to docs:', path.basename(item.docsOut));
    }
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
