import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

function getCallable(name) {
  const functions = getFunctions(app, 'us-central1');
  return httpsCallable(functions, name);
}

/**
 * Mint a short-lived game launch session (partner token + URL built on server).
 */
export async function fetchGameLaunchSession({ gameId, opponentUid, roomId } = {}) {
  try {
    const fn = getCallable('getGameLaunchSession');
    const res = await fn({
      gameId: String(gameId || ''),
      opponentUid: opponentUid ? String(opponentUid) : null,
      roomId: roomId ? String(roomId) : null,
    });
    return { data: res?.data || null, error: null };
  } catch (error) {
    return {
      data: null,
      error: error?.message || String(error),
    };
  }
}
