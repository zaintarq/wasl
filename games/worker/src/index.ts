import { DurableObject } from 'cloudflare:workers';
import { verifyGameSessionToken, type GameTokenPayload } from './auth';
import {
  createEmptyLudoState,
  MAX_LUDO_PLAYERS,
  rollLudo,
  startLudoGame,
  type LudoRoomState,
  type PlayerState,
} from './ludoLogic';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  GAME_SESSION_SECRET: string;
}

interface SocketMeta {
  sessionId: string;
  uid: string;
  name: string;
  auth: GameTokenPayload;
}

type ClientMessage = { type: 'roll' } | { type: 'ping' };

export class GameRoom extends DurableObject<Env> {
  private gameId = 'ludo';
  private roomId = '';
  private state: LudoRoomState = createEmptyLudoState('', 'ludo');
  private socketMeta = new Map<WebSocket, SocketMeta>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({
        ok: true,
        service: 'huzz-games-room',
        gameId: this.gameId,
        roomId: this.roomId,
        phase: this.state.phase,
        players: Object.keys(this.state.players).length,
      });
    }

    const token = url.searchParams.get('token') || '';
    const uid = url.searchParams.get('uid') || '';
    const name = url.searchParams.get('name') || 'Player';
    const pathParts = url.pathname.split('/').filter(Boolean);
    const gameFromPath = pathParts[1] || 'ludo';
    const roomFromPath = pathParts[2] || '';

    const auth = await verifyGameSessionToken(token, this.env.GAME_SESSION_SECRET);
    if (!auth) {
      return new Response('Invalid or expired game token', { status: 401 });
    }
    if (uid && auth.uid !== uid) {
      return new Response('Player identity mismatch', { status: 403 });
    }
    if (roomFromPath && auth.roomId !== roomFromPath) {
      return new Response('Room invite mismatch', { status: 403 });
    }
    if (auth.gameId !== gameFromPath) {
      return new Response('Game token does not match room type', { status: 403 });
    }

    this.gameId = auth.gameId;
    this.roomId = auth.roomId;
    if (!this.state.inviteRoomId) {
      this.state = createEmptyLudoState(auth.roomId, auth.gameId);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    this.ctx.acceptWebSocket(server);

    const sessionId = crypto.randomUUID();
    const meta: SocketMeta = {
      sessionId,
      uid: auth.uid,
      name: name || auth.name || 'Player',
      auth,
    };
    this.socketMeta.set(server, meta);
    this.addPlayer(meta);

    server.send(
      JSON.stringify({
        type: 'joined',
        sessionId,
        state: this.state,
      })
    );
    this.broadcastState();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    let data: ClientMessage;
    try {
      data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (data.type === 'roll' && this.gameId === 'ludo') {
      this.state = rollLudo(this.state, meta.sessionId);
      this.broadcastState();
      return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = this.socketMeta.get(ws);
    this.socketMeta.delete(ws);
    if (!meta) return;

    const player = this.state.players[meta.sessionId];
    if (player) {
      player.connected = false;
    }

    if (this.state.phase === 'playing' && !this.state.winnerSessionId) {
      const alive = Object.values(this.state.players).filter((p) => p.connected);
      if (alive.length === 1 && alive[0]) {
        this.state.winnerSessionId = alive[0].sessionId;
        this.state.phase = 'finished';
        this.state.message = `${alive[0].name} wins — opponent left.`;
      }
    }

    this.broadcastState();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private addPlayer(meta: SocketMeta) {
    const existing = Object.values(this.state.players).find((p) => p.uid === meta.uid && p.connected);
    if (existing) {
      this.state.players[existing.sessionId] = { ...existing, connected: false };
    }

    const connectedBefore = Object.values(this.state.players).filter((p) => p.connected).length;
    const seat = Math.min(connectedBefore, MAX_LUDO_PLAYERS - 1);
    const player: PlayerState = {
      uid: meta.uid,
      name: meta.name,
      sessionId: meta.sessionId,
      seat,
      color: seat === 0 ? 'red' : 'blue',
      ludoPos: -1,
      connected: true,
      isBot: false,
    };
    this.state.players[meta.sessionId] = player;

    const connectedCount = Object.values(this.state.players).filter((p) => p.connected).length;
    if (connectedCount < MAX_LUDO_PLAYERS) {
      this.state.phase = 'waiting';
      this.state.message = `Waiting for opponent (${connectedCount}/${MAX_LUDO_PLAYERS})…`;
      return;
    }

    if (this.state.phase === 'waiting') {
      this.state = startLudoGame(this.state);
    }
  }

  private broadcastState() {
    const payload = JSON.stringify({ type: 'state', state: this.state });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        /* closed */
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'huzz-games-api' });
    }

    const match = url.pathname.match(/^\/room\/([^/]+)\/([^/]+)\/?$/);
    if (!match) {
      return new Response('Huzz Games API — use /room/{gameId}/{roomId}', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const gameId = match[1]!.toLowerCase();
    const roomId = match[2]!;
    if (!['ludo', 'chess', 'cards', 'hearts'].includes(gameId)) {
      return new Response('Unsupported game', { status: 400 });
    }

    const id = env.GAME_ROOM.idFromName(`${gameId}:${roomId}`);
    const stub = env.GAME_ROOM.get(id);
    return stub.fetch(request);
  },
};
