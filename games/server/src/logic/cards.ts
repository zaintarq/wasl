export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['H', 'D', 'C', 'S'];

export interface PlainCard {
  id: string;
  rank: string;
  suit: string;
}

export function buildDeck(): PlainCard[] {
  const deck: PlainCard[] = [];
  let id = 0;
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      deck.push({ id: `c${id++}`, rank, suit });
    });
  });
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardValue(card: PlainCard | { rank: string }) {
  return RANKS.indexOf(card.rank);
}

export function dealHands(deck: PlainCard[], perHand = 5) {
  const hands: PlainCard[][] = [[], []];
  for (let i = 0; i < perHand * 2; i += 1) {
    hands[i % 2].push(deck[i]);
  }
  return { hands, rest: deck.slice(perHand * 2) };
}

export function compareCards(a: PlainCard, b: PlainCard) {
  return cardValue(a) - cardValue(b);
}

export function formatCard(card: PlainCard | null | undefined) {
  if (!card) return '';
  const suitMap: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
  return `${card.rank}${suitMap[card.suit] || card.suit}`;
}

export function parseLegacyCard(str: string): PlainCard {
  const rank = str.slice(0, -1);
  const suit = str.slice(-1);
  return { id: str, rank, suit };
}
