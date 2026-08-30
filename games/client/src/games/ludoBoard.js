/** Classic 15×15 Ludo board layout + token positions for simplified 2-player rules. */

export const GRID = 15;

export const LUDO_COLORS = {
  red: { fill: 0xdc2626, dark: 0x991b1b, label: 'Red' },
  green: { fill: 0x16a34a, dark: 0x14532d, label: 'Green' },
  yellow: { fill: 0xeab308, dark: 0xa16207, label: 'Yellow' },
  blue: { fill: 0x2563eb, dark: 0x1e3a8a, label: 'Blue' },
};

/** Shared outer path — 28 cells (ludoPos 0…27). */
export const LUDO_PATH = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8], [1, 8], [2, 8], [3, 8], [4, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13],
  [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], [9, 8],
];

export const YARD = {
  red: { r: 11, c: 2 },
  blue: { r: 2, c: 11 },
};

/** @returns {{ ox: number, oy: number, cell: number, boardPx: number }} */
export function computeLudoLayout(width, height, topPad = 56, bottomPad = 100) {
  const boardPx = Math.min(width - 16, height - topPad - bottomPad);
  const cell = boardPx / GRID;
  const ox = (width - boardPx) / 2;
  const oy = topPad + (height - topPad - bottomPad - boardPx) / 2;
  return { ox, oy, cell, boardPx };
}

export function cellCenter(layout, row, col) {
  return {
    x: layout.ox + (col + 0.5) * layout.cell,
    y: layout.oy + (row + 0.5) * layout.cell,
  };
}

/** Map game state to board cell. seat 0 = red, seat 1 = blue. */
export function tokenCell(ludoPos, seat) {
  if (ludoPos < 0) {
    return seat === 0 ? YARD.red : YARD.blue;
  }
  const idx = Math.min(ludoPos, LUDO_PATH.length - 1);
  const [r, c] = LUDO_PATH[idx];
  return { r, c };
}

function fillRect(g, layout, r0, c0, rows, cols, color) {
  const { ox, oy, cell } = layout;
  g.fillStyle(color, 1);
  g.fillRect(ox + c0 * cell, oy + r0 * cell, cols * cell, rows * cell);
}

function strokeCell(g, layout, r, c, color, alpha = 0.35) {
  const { ox, oy, cell } = layout;
  g.lineStyle(Math.max(1, cell * 0.04), color, alpha);
  g.strokeRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2);
}

/** Draw full classic Ludo board. */
export function drawClassicLudoBoard(g, layout) {
  const { ox, oy, cell, boardPx } = layout;
  const white = 0xf8fafc;
  const line = 0xcbd5e1;

  g.clear();

  // Base
  g.fillStyle(0x1e293b, 1);
  g.fillRoundedRect(ox - 8, oy - 8, boardPx + 16, boardPx + 16, 12);

  g.fillStyle(white, 1);
  g.fillRect(ox, oy, boardPx, boardPx);

  // Corner homes (6×6)
  fillRect(g, layout, 0, 0, 6, 6, LUDO_COLORS.green.fill);
  fillRect(g, layout, 0, 9, 6, 6, LUDO_COLORS.blue.fill);
  fillRect(g, layout, 9, 0, 6, 6, LUDO_COLORS.red.fill);
  fillRect(g, layout, 9, 9, 6, 6, LUDO_COLORS.yellow.fill);

  // Inner white yards in corners
  [ [1, 1], [1, 10], [10, 1], [10, 10] ].forEach(([r, c]) => {
    fillRect(g, layout, r, c, 4, 4, white);
  });

  // Yard slot dots
  const yardDots = {
    red: [[10, 2], [10, 4], [12, 2], [12, 4]],
    green: [[2, 2], [2, 4], [4, 2], [4, 4]],
    yellow: [[10, 11], [10, 13], [12, 11], [12, 13]],
    blue: [[2, 11], [2, 13], [4, 11], [4, 13]],
  };
  Object.entries(yardDots).forEach(([key, cells]) => {
    const col = LUDO_COLORS[key];
    cells.forEach(([r, c]) => {
      const { x, y } = cellCenter(layout, r, c);
      g.fillStyle(col.fill, 0.35);
      g.fillCircle(x, y, cell * 0.22);
    });
  });

  // Vertical & horizontal arms (path)
  fillRect(g, layout, 0, 6, 6, 3, white);
  fillRect(g, layout, 6, 0, 3, 6, white);
  fillRect(g, layout, 6, 9, 3, 6, white);
  fillRect(g, layout, 9, 6, 6, 3, white);
  fillRect(g, layout, 6, 6, 3, 3, white);

  // Colored home stretches
  fillRect(g, layout, 7, 1, 1, 5, LUDO_COLORS.red.fill);
  fillRect(g, layout, 1, 7, 5, 1, LUDO_COLORS.green.fill);
  fillRect(g, layout, 7, 9, 1, 5, LUDO_COLORS.yellow.fill);
  fillRect(g, layout, 9, 7, 5, 1, LUDO_COLORS.blue.fill);

  // Center finish triangles
  const cx = ox + 7.5 * cell;
  const cy = oy + 7.5 * cell;
  const tri = cell * 2.2;
  const drawTri = (points, color) => {
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => g.lineTo(p.x, p.y));
    g.closePath();
    g.fillPath();
  };
  drawTri(
    [{ x: cx, y: cy - tri }, { x: cx - tri, y: cy }, { x: cx, y: cy }],
    LUDO_COLORS.green.fill
  );
  drawTri(
    [{ x: cx + tri, y: cy }, { x: cx, y: cy - tri }, { x: cx, y: cy }],
    LUDO_COLORS.blue.fill
  );
  drawTri(
    [{ x: cx, y: cy + tri }, { x: cx + tri, y: cy }, { x: cx, y: cy }],
    LUDO_COLORS.yellow.fill
  );
  drawTri(
    [{ x: cx - tri, y: cy }, { x: cx, y: cy + tri }, { x: cx, y: cy }],
    LUDO_COLORS.red.fill
  );

  // Path cell grid lines
  LUDO_PATH.forEach(([r, c]) => strokeCell(g, layout, r, c, line, 0.55));
  [6, 7, 8].forEach((r) => [6, 7, 8].forEach((c) => strokeCell(g, layout, r, c, line, 0.25)));

  // Start arrows (safe cells)
  [[6, 1, LUDO_COLORS.red], [1, 8, LUDO_COLORS.green], [8, 13, LUDO_COLORS.yellow], [13, 6, LUDO_COLORS.blue]].forEach(
    ([r, c, col]) => {
      const { x, y } = cellCenter(layout, r, c);
      g.fillStyle(col.fill, 0.85);
      g.fillCircle(x, y, cell * 0.18);
    }
  );
}

/** Draw a pawn token at x,y. */
export function drawPawnToken(scene, x, y, size, colorHex, depth = 20) {
  const container = scene.add.container(x, y).setDepth(depth);
  const base = scene.add.circle(0, size * 0.15, size * 0.55, colorHex).setStrokeStyle(2, 0x1e293b);
  const body = scene.add.circle(0, -size * 0.15, size * 0.38, colorHex).setStrokeStyle(2, 0x1e293b);
  const head = scene.add.circle(0, -size * 0.48, size * 0.26, 0xffffff, 0.25).setStrokeStyle(1, 0x1e293b, 0.5);
  const shine = scene.add.circle(-size * 0.12, -size * 0.55, size * 0.08, 0xffffff, 0.45);
  container.add([base, body, head, shine]);
  return container;
}

export function playerColorHex(player) {
  if (player?.color === 'blue') return LUDO_COLORS.blue.fill;
  return LUDO_COLORS.red.fill;
}
