#!/usr/bin/env node
/**
 * Generate Play Store + Expo icon presets from assets/images/app-logo.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/images/app-logo.png');
const OUT_DIR = path.join(ROOT, 'assets/play-store');
const BG = { r: 10, g: 10, b: 10, alpha: 1 };

async function squareIcon(size, outPath) {
  const meta = await sharp(SRC).metadata();
  const scale = Math.min(size / meta.width, size / meta.height) * 0.92;
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const resized = await sharp(SRC).resize(w, h, { fit: 'inside' }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function featureGraphic(outPath) {
  const width = 1024;
  const height = 500;
  const meta = await sharp(SRC).metadata();
  const scale = Math.min((width * 0.42) / meta.width, (height * 0.88) / meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const mascot = await sharp(SRC).resize(w, h, { fit: 'inside' }).png().toBuffer();
  const taglineSvg = Buffer.from(`
    <svg width="560" height="80" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="52" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#fbbf24">Meet. Match. Go live.</text>
    </svg>
  `);
  await sharp({
    create: { width, height, channels: 4, background: BG },
  })
    .composite([
      { input: mascot, left: Math.round((width - w) / 2), top: Math.round((height - h) / 2 - 24) },
      { input: taglineSvg, left: Math.round((width - 560) / 2), top: Math.round((height + h) / 2 - 16) },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Missing source logo:', SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'assets/images'), { recursive: true });

  const outputs = [
    ['icon-1024.png', () => squareIcon(1024, path.join(ROOT, 'assets/images/icon-1024.png'))],
    ['icon-512.png', () => squareIcon(512, path.join(OUT_DIR, 'icon-512.png'))],
    ['feature-graphic-1024x500.png', () => featureGraphic(path.join(OUT_DIR, 'feature-graphic-1024x500.png'))],
    ['adaptive-icon-1024.png', () => squareIcon(1024, path.join(ROOT, 'assets/images/adaptive-icon-1024.png'))],
  ];

  for (const [name, fn] of outputs) {
    await fn();
    console.log('Created', name);
  }

  console.log('\nPlay Store uploads:');
  console.log('  App icon:', path.join(OUT_DIR, 'icon-512.png'));
  console.log('  Feature graphic:', path.join(OUT_DIR, 'feature-graphic-1024x500.png'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
