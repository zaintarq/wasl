/** Huzz games visual tokens — matches app pink / ink / cream. */
export const HUZZ = {
  bg: '#FBCFE8',
  bgDeep: '#F9A8D4',
  ink: '#2B2420',
  cream: '#F7F1E8',
  raspberry: '#DB2777',
  plum: '#831843',
  boardLight: 0xf7f1e8,
  boardDark: 0x2b2420,
  accent: 0xdb2777,
  track: 0xfbcfe8,
};

export const PIECE_UNICODE = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

export function formatCardLabel(card) {
  if (!card) return '';
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
  const red = suit === 'H' || suit === 'D';
  return { text: `${rank}${suits[suit] || suit}`, red };
}

export function parseHand(str) {
  if (!str) return [];
  return str.split(',').filter(Boolean);
}
