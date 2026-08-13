/** Curated games — multiplayer via Colyseus + Phaser; solo games run local Phaser only. */
export const GAMES_CATALOG = [
  {
    id: 'ludo',
    title: 'Ludo',
    subtitle: 'Colyseus 1v1–4',
    emoji: '🎲',
    category: 'board',
    multiplayer: true,
  },
  {
    id: 'chess',
    title: 'Chess',
    subtitle: 'Colyseus 1v1',
    emoji: '♟️',
    category: 'board',
    multiplayer: true,
  },
  {
    id: 'hearts',
    title: 'Hearts',
    subtitle: '5-card tricks',
    emoji: '♥️',
    category: 'cards',
    multiplayer: true,
    colyseusRoom: 'cards',
  },
  {
    id: 'solitaire',
    title: 'Solitaire',
    subtitle: 'Phaser solo',
    emoji: '🃏',
    category: 'cards',
    multiplayer: false,
  },
  {
    id: 'puzzle',
    title: 'Puzzle',
    subtitle: 'Phaser solo',
    emoji: '🧩',
    category: 'casual',
    multiplayer: false,
  },
  {
    id: 'snake',
    title: 'Snake',
    subtitle: 'Phaser solo',
    emoji: '🐍',
    category: 'arcade',
    multiplayer: false,
  },
];

export function getGameById(gameId) {
  return GAMES_CATALOG.find((g) => g.id === gameId) || null;
}
