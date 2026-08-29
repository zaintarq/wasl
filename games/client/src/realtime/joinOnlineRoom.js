import { parseLaunchParams, isMultiplayerGame } from '../colyseus/joinRoom.js';
import { joinGameRoom } from './gameRoomClient.js';
import { bindRoomHud } from '../colyseus/joinRoom.js';

export { parseLaunchParams, isMultiplayerGame, bindRoomHud };

export function defaultWsUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:8787';
}

export function resolveWsUrl(launch) {
  const raw = String(launch.wsUrl || '').trim();
  if (raw) return raw.replace(/\/+$/, '');
  return defaultWsUrl();
}

/** Join a live room via Cloudflare Worker + Durable Object WebSocket. */
export async function joinOnlineRoom(launch) {
  if (!launch.token || !launch.roomId) {
    throw new Error('Missing game session (token or roomId).');
  }
  if (!isMultiplayerGame(launch.gameId)) {
    return null;
  }

  const wsUrl = resolveWsUrl(launch);
  try {
    return await joinGameRoom({ ...launch, wsUrl });
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/fetch|network|load failed|failed to fetch|timed out|connect/i.test(msg)) {
      throw new Error('Game server is offline. Deploy the Cloudflare Worker and try again.');
    }
    throw err;
  }
}
