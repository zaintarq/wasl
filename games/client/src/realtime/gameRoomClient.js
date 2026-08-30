/** Map-like players bag for Phaser scenes (mirrors Colyseus Map API). */
function playersMap(record) {
  const data = record && typeof record === 'object' ? record : {};
  return {
    get(k) {
      return data[k];
    },
    forEach(fn) {
      Object.entries(data).forEach(([id, player]) => fn(player, id));
    },
    keys() {
      return Object.keys(data).values();
    },
    get size() {
      return Object.keys(data).length;
    },
  };
}

function normalizeState(raw) {
  const state = raw && typeof raw === 'object' ? { ...raw } : {};
  state.players = playersMap(state.players);
  return state;
}

/**
 * WebSocket room client for Cloudflare Durable Objects (drop-in subset of Colyseus room).
 */
export class GameRoomClient {
  constructor() {
    this.sessionId = null;
    this.state = normalizeState({});
    this._listeners = [];
    this._disconnectListeners = [];
    this._ws = null;
    this.connected = false;
    this._pingTimer = null;
  }

  onStateChange(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  onDisconnect(listener) {
    this._disconnectListeners.push(listener);
    return () => {
      this._disconnectListeners = this._disconnectListeners.filter((l) => l !== listener);
    };
  }

  /** Colyseus-compatible alias */
  onLeave(listener) {
    return this.onDisconnect(listener);
  }

  _emitState() {
    for (const fn of this._listeners) {
      try {
        fn(this.state);
      } catch (e) {
        console.warn('[GameRoomClient] state listener error', e);
      }
    }
  }

  _emitDisconnect() {
    for (const fn of this._disconnectListeners) {
      try {
        fn();
      } catch (e) {
        console.warn('[GameRoomClient] disconnect listener error', e);
      }
    }
  }

  send(type, payload = {}) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(JSON.stringify({ type, ...payload }));
  }

  leave() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    try {
      this._ws?.close();
    } catch {
      /* ignore */
    }
  }

  _startPing() {
    if (this._pingTimer) clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      this.send('ping');
    }, 20000);
  }
}

export function joinGameRoom(launch) {
  if (!launch.token || !launch.roomId) {
    return Promise.reject(new Error('Missing game session (token or roomId).'));
  }

  const wsBase = String(launch.wsUrl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!wsBase) {
    return Promise.reject(new Error('Game server URL is not configured.'));
  }

  const gameId = String(launch.gameId || 'ludo').toLowerCase();
  const q = new URLSearchParams({
    token: launch.token,
    uid: launch.uid || '',
    name: launch.name || 'Player',
  });

  const url = `${wsBase}/room/${encodeURIComponent(gameId)}/${encodeURIComponent(launch.roomId)}?${q.toString()}`;

  return new Promise((resolve, reject) => {
    const room = new GameRoomClient();
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      room.leave();
      reject(err instanceof Error ? err : new Error(String(err || 'Connection failed')));
    };

    const ws = new WebSocket(url);
    room._ws = ws;

    const timer = setTimeout(() => fail(new Error('Game server timed out — try again.')), 15000);

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data || ''));
      } catch {
        return;
      }

      if (msg.type === 'joined') {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        room.sessionId = msg.sessionId;
        room.state = normalizeState(msg.state);
        room.connected = true;
        room._emitState();
        room._startPing();
        resolve(room);
        return;
      }

      if (msg.type === 'state') {
        room.state = normalizeState(msg.state);
        room._emitState();
      }

      if (msg.type === 'error') {
        fail(new Error(msg.message || 'Game server error'));
      }
    };

    ws.onerror = () => {
      fail(new Error('Could not connect to game server.'));
    };

    ws.onclose = () => {
      room.connected = false;
      if (room._pingTimer) {
        clearInterval(room._pingTimer);
        room._pingTimer = null;
      }
      if (!settled) {
        fail(new Error('Disconnected before joining the room.'));
      } else {
        room._emitDisconnect();
      }
    };
  });
}
