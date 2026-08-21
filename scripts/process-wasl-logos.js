/**
 * Process Wasl logo PNGs — preserve artwork (no aggressive white-key cutout).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const imagesDir = path.join(ROOT, 'assets', 'images');
const docsDir = path.join(ROOT, 'docs', 'assets');

/** English Wasl (default) + Arabic وصل (tap reveal). */
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

async function preserveLogo({ src, out }) {
  if (!fs.existsSync(src)) {
    console.warn('Skip (missing):', src);
    return false;
  }
  await sharp(src).png({ compressionLevel: 9, quality: 100 }).toFile(out);
  console.log('Written:', path.basename(out));
  return true;
}

async function main() {
  fs.mkdirSync(docsDir, { recursive: true });
  for (const item of LOGOS) {
    const ok = await preserveLogo({ src: item.src, out: item.out });
    if (!ok) continue;
    if (item.docsOut) {
      fs.copyFileSync(item.out, item.docsOut);
      console.log('Copied to docs:', path.basename(item.docsOut));
    }
    if (item.legacyOut) {
      fs.copyFileSync(item.out, item.legacyOut);
      fs.copyFileSync(item.out, item.legacyDocs);
      console.log('Synced legacy app-logo.png');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
