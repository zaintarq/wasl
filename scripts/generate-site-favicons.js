#!/usr/bin/env node
/** Generate crisp website favicons from the app icon on brand pink background. */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/images/icon-1024.png');
const FALLBACK = path.join(ROOT, 'assets/images/wasl-logo-en.png');
const OUT = path.join(ROOT, 'docs/assets');
const BG = { r: 251, g: 207, b: 232, alpha: 1 }; // #FBCFE8

async function renderIcon(size, outName, pad = 0.14) {
  const src = fs.existsSync(SRC) ? SRC : FALLBACK;
  const meta = await sharp(src).metadata();
  const inner = Math.round(size * (1 - pad * 2));
  const scale = Math.min(inner / meta.width, inner / meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const resized = await sharp(src).resize(w, h, { fit: 'inside' }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, outName));
}

async function main() {
  if (!fs.existsSync(SRC) && !fs.existsSync(FALLBACK)) {
    console.error('Missing icon source');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  await renderIcon(512, 'icon-512.png', 0.12);
  await renderIcon(192, 'favicon-192.png', 0.14);
  await renderIcon(32, 'favicon-32.png', 0.16);
  await renderIcon(16, 'favicon-16.png', 0.18);
  await renderIcon(180, 'apple-touch-icon.png', 0.12);
  console.log('Site favicons written to docs/assets/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
