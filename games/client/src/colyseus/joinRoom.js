import { Client } from '@colyseus/sdk';

const MULTIPLAYER_GAMES = new Set(['chess', 'ludo', 'cards', 'hearts']);

const COLYSEUS_ROOM = {
  hearts: 'cards',
};

export function resolveColyseusRoom(gameId) {
  return COLYSEUS_ROOM[gameId] || gameId;
}

export function parseLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    gameId: (params.get('game') || params.get('gameId') || 'chess').toLowerCase(),
    roomId: params.get('roomId') || '',
    token: params.get('token') || '',
    uid: params.get('uid') || '',
    name: params.get('name') || 'Player',
    opponentName: params.get('opponentName') || '',
    wsUrl: params.get('wsUrl') || defaultWsUrl(),
    solo: params.get('solo') === '1',
  };
}

function defaultWsUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:2567';
}

export function isMultiplayerGame(gameId) {
  return MULTIPLAYER_GAMES.has(gameId);
}

/** HTTP endpoint for Colyseus 0.17 Client (ws URL → http for SDK). */
export function toHttpEndpoint(wsUrl) {
  return String(wsUrl || '')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/+$/, '');
}

export async function joinColyseusRoom(launch) {
  if (!launch.token || !launch.roomId) {
    throw new Error('Missing game session (token or roomId).');
  }
  if (!isMultiplayerGame(launch.gameId)) {
    return null;
  }

  const client = new Client(toHttpEndpoint(launch.wsUrl));
  const roomName = resolveColyseusRoom(launch.gameId);
  const room = await client.joinOrCreate(roomName, {
    inviteRoomId: launch.roomId,
    token: launch.token,
    uid: launch.uid,
    name: launch.name,
  });
  return room;
}

export function bindRoomHud(room, launch) {
  const statusEl = document.getElementById('hud-status');
  const titleEl = document.getElementById('hud-title');
  if (titleEl) {
    titleEl.textContent = launch.gameId.charAt(0).toUpperCase() + launch.gameId.slice(1);
  }

  const render = () => {
    if (!statusEl || !room?.state) return;
    statusEl.textContent = room.state.message || `Players: ${room.state.players?.size ?? 0}`;
  };

  room.onStateChange(render);
  render();

  room.onLeave(() => {
    if (statusEl) statusEl.textContent = 'Disconnected from room';
  });
}

export function hideOverlay() {
  const el = document.getElementById('overlay');
  if (el) el.classList.add('hidden');
}

export function showOverlayError(message) {
  const el = document.getElementById('overlay');
  const msg = document.getElementById('overlay-msg');
  if (msg) msg.textContent = message;
  if (el) {
    el.classList.remove('hidden');
    const title = el.querySelector('h1');
    if (title) title.textContent = 'Could not join';
    const spinner = el.querySelector('.spinner');
    if (spinner) spinner.style.display = 'none';
  }
}
