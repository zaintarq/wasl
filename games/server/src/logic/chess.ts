/** Server-authoritative chess (Colyseus turn-based demo pattern). */

export const START =
  'rnbqkbnr' +
  'pppppppp' +
  '........' +
  '........' +
  '........' +
  '........' +
  'PPPPPPPP' +
  'RNBQKBNR';

const FILES = 'abcdefgh';

function idxToRowCol(i: number) {
  return { row: Math.floor(i / 8), col: i % 8 };
}

function rowColToIdx(row: number, col: number) {
  return row * 8 + col;
}

function isWhite(piece: string) {
  return piece >= 'A' && piece <= 'Z';
}

function isBlack(piece: string) {
  return piece >= 'a' && piece <= 'z';
}

function colorOf(piece: string): 'white' | 'black' | null {
  if (isWhite(piece)) return 'white';
  if (isBlack(piece)) return 'black';
  return null;
}

function cloneBoard(board: string) {
  return board.split('');
}

function applyMove(boardArr: string[], from: number, to: number) {
  const piece = boardArr[from];
  boardArr[from] = '.';
  boardArr[to] = piece;
  return boardArr.join('');
}

function inBounds(row: number, col: number) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function rayMoves(boardArr: string[], from: number, dr: number, dc: number, color: string) {
  const { row, col } = idxToRowCol(from);
  const moves: number[] = [];
  let r = row + dr;
  let c = col + dc;
  while (inBounds(r, c)) {
    const idx = rowColToIdx(r, c);
    const target = boardArr[idx];
    if (target === '.') moves.push(idx);
    else {
      if (colorOf(target) !== color) moves.push(idx);
      break;
    }
    r += dr;
    c += dc;
  }
  return moves;
}

function knightMoves(boardArr: string[], from: number, color: string) {
  const { row, col } = idxToRowCol(from);
  const deltas = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  const moves: number[] = [];
  deltas.forEach(([dr, dc]) => {
    const r = row + dr;
    const c = col + dc;
    if (!inBounds(r, c)) return;
    const idx = rowColToIdx(r, c);
    const target = boardArr[idx];
    if (target === '.' || colorOf(target) !== color) moves.push(idx);
  });
  return moves;
}

function pawnMoves(boardArr: string[], from: number, color: string) {
  const { row, col } = idxToRowCol(from);
  const moves: number[] = [];
  const dir = color === 'white' ? -1 : 1;
  const startRow = color === 'white' ? 6 : 1;
  const one = rowColToIdx(row + dir, col);
  if (inBounds(row + dir, col) && boardArr[one] === '.') {
    moves.push(one);
    if (row === startRow) {
      const two = rowColToIdx(row + dir * 2, col);
      if (boardArr[two] === '.') moves.push(two);
    }
  }
  [-1, 1].forEach((dc) => {
    const r = row + dir;
    const c = col + dc;
    if (!inBounds(r, c)) return;
    const idx = rowColToIdx(r, c);
    const target = boardArr[idx];
    if (target !== '.' && colorOf(target) !== color) moves.push(idx);
  });
  return moves;
}

function legalMoves(board: string, from: number, color: string) {
  const boardArr = cloneBoard(board);
  const piece = boardArr[from];
  if (!piece || piece === '.' || colorOf(piece) !== color) return [];

  const lower = piece.toLowerCase();
  if (lower === 'p') return pawnMoves(boardArr, from, color);
  if (lower === 'n') return knightMoves(boardArr, from, color);
  if (lower === 'b') {
    return [
      ...rayMoves(boardArr, from, 1, 1, color),
      ...rayMoves(boardArr, from, 1, -1, color),
      ...rayMoves(boardArr, from, -1, 1, color),
      ...rayMoves(boardArr, from, -1, -1, color),
    ];
  }
  if (lower === 'r') {
    return [
      ...rayMoves(boardArr, from, 1, 0, color),
      ...rayMoves(boardArr, from, -1, 0, color),
      ...rayMoves(boardArr, from, 0, 1, color),
      ...rayMoves(boardArr, from, 0, -1, color),
    ];
  }
  if (lower === 'q') {
    return [
      ...rayMoves(boardArr, from, 1, 0, color),
      ...rayMoves(boardArr, from, -1, 0, color),
      ...rayMoves(boardArr, from, 0, 1, color),
      ...rayMoves(boardArr, from, 0, -1, color),
      ...rayMoves(boardArr, from, 1, 1, color),
      ...rayMoves(boardArr, from, 1, -1, color),
      ...rayMoves(boardArr, from, -1, 1, color),
      ...rayMoves(boardArr, from, -1, -1, color),
    ];
  }
  if (lower === 'k') {
    const { row, col } = idxToRowCol(from);
    const moves: number[] = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const idx = rowColToIdx(r, c);
        const target = boardArr[idx];
        if (target === '.' || colorOf(target) !== color) moves.push(idx);
      }
    }
    return moves;
  }
  return [];
}

export function validateMove(board: string, from: number, to: number, color: string) {
  if (from < 0 || from > 63 || to < 0 || to > 63) return null;
  const moves = legalMoves(board, from, color);
  if (!moves.includes(to)) return null;
  const next = applyMove(cloneBoard(board), from, to);
  return { board: next, captured: board[to] };
}

export function moveToAlgebraic(from: number, to: number) {
  const a = idxToRowCol(from);
  const b = idxToRowCol(to);
  return `${FILES[a.col]}${8 - a.row}→${FILES[b.col]}${8 - b.row}`;
}
