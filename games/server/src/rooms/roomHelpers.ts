import type { Client } from '@colyseus/core';
import { verifyGameSessionToken, type GameTokenPayload } from '../auth/verifyGameToken.js';

const GAME_AUTH: Record<string, string[]> = {
  chess: ['chess'],
  ludo: ['ludo'],
  cards: ['cards', 'hearts'],
};

export async function verifyRoomAuth(
  gameId: string,
  options: Record<string, unknown>,
): Promise<GameTokenPayload> {
  const auth = verifyGameSessionToken(options?.token);
  if (!auth) throw new Error('Invalid or expired game token.');

  const allowed = GAME_AUTH[gameId] || [gameId];
  if (!allowed.includes(auth.gameId)) {
    throw new Error('Game token does not match room type.');
  }
  if (options?.inviteRoomId && auth.roomId !== String(options.inviteRoomId)) {
    throw new Error('Room invite mismatch.');
  }
  if (options?.uid && auth.uid !== String(options.uid)) {
    throw new Error('Player identity mismatch.');
  }
  return auth;
}

export function sessionIds(state: { players: { keys(): IterableIterator<string> } }) {
  return [...state.players.keys()];
}

export function nextSessionId(
  state: { players: { keys(): IterableIterator<string> } },
  fromSessionId: string,
) {
  const ids = sessionIds(state);
  const idx = ids.indexOf(fromSessionId);
  return ids[(idx + 1) % ids.length];
}

export function getClientForSession(clients: Client[], sessionId: string) {
  return clients.find((c) => c.sessionId === sessionId);
}

export const TURN_MS = {
  chess: 90_000,
  ludo: 12_000,
  cards: 15_000,
};
