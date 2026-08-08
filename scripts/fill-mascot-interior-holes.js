/**
 * After white-key background removal, eyes/teeth become transparent holes.
 * Flood-fill from the image border through transparent pixels; anything left
 * transparent is interior detail → fill with opaque white.
 *
 * Run: node scripts/fill-mascot-interior-holes.js [file.png ...]
 * Default targets: docs/assets + assets/images mascot PNGs.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');

const DEFAULT_FILES = [
  path.join(ROOT, 'docs/assets/app-logo.png'),
  path.join(ROOT, 'docs/assets/stop-touching.png'),
  path.join(ROOT, 'assets/images/app-logo.png'),
  path.join(ROOT, 'assets/images/stop-touching.png'),
];

/** Pixels below this alpha count as "empty" for flood + fill. */
const ALPHA_THRESH = 128;

function isEmpty(data, width, x, y) {
  return data[(width * y + x) * 4 + 3] < ALPHA_THRESH;
}

function markExterior(data, width, height) {
  const exterior = new Uint8Array(width * height);
  const queue = [];

  const trySeed = (x, y) => {
    const i = width * y + x;
    if (exterior[i] || !isEmpty(data, width, x, y)) return;
    exterior[i] = 1;
    queue.push(x, y);
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const x = queue[head++];
    const y = queue[head++];
    if (x > 0) tryNeighbor(x - 1, y);
    if (x < width - 1) tryNeighbor(x + 1, y);
    if (y > 0) tryNeighbor(x, y - 1);
    if (y < height - 1) tryNeighbor(x, y + 1);
  }

  function tryNeighbor(nx, ny) {
    const i = width * ny + nx;
    if (exterior[i] || !isEmpty(data, width, nx, ny)) return;
    exterior[i] = 1;
    queue.push(nx, ny);
  }

  return exterior;
}

function fillInteriorHoles(inputPath, outputPath) {
  const png = PNG.sync.read(fs.readFileSync(inputPath));
  const { data, width, height } = png;
  const exterior = markExterior(data, width, height);

  let filled = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = width * y + x;
      const pi = i * 4;
      if (data[pi + 3] < ALPHA_THRESH && !exterior[i]) {
        data[pi] = 255;
        data[pi + 1] = 255;
        data[pi + 2] = 255;
        data[pi + 3] = 255;
        filled += 1;
      }
    }
  }

  fs.writeFileSync(outputPath, PNG.sync.write(png));
  return { width, height, filled };
}

function main() {
  const args = process.argv.slice(2);
  const files = args.length ? args.map((f) => path.resolve(f)) : DEFAULT_FILES;

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn('Skip (not found):', file);
      continue;
    }
    const { width, height, filled } = fillInteriorHoles(file, file);
    console.log(`Written: ${file} (${width}x${height}, ${filled} interior pixels filled)`);
  }
}

module.exports = { fillInteriorHoles, ALPHA_THRESH };

if (require.main === module) {
  main();
}
