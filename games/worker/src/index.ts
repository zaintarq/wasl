import { DurableObject } from 'cloudflare:workers';
import { verifyGameSessionToken, type GameTokenPayload } from './auth';
import { CHESS_START, moveToAlgebraic, validateChessMove } from './chessLogic';
import {
  connectedSessionIds,
  createEmptyLudoState,
  MAX_LUDO_PLAYERS,
  nextSessionId,
  rollLudo,
  startLudoGame,
  TURN_MS_CHESS,
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

type ClientMessage =
  | { type: 'roll' }
  | { type: 'move'; from?: number; to?: number }
  | { type: 'ping' };

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
        players: connectedSessionIds(this.state).length,
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
      if (auth.gameId === 'chess') {
        this.state.board = CHESS_START;
      }
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

    if (data.type === 'move' && this.gameId === 'chess') {
      this.handleChessMove(meta.sessionId, data.from, data.to);
      return;
    }
  }

  private handleChessMove(sessionId: string, fromRaw?: number, toRaw?: number) {
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;
    if (this.state.currentTurnSessionId !== sessionId) return;

    const player = this.state.players[sessionId];
    if (!player?.connected) return;

    const from = Number(fromRaw);
    const to = Number(toRaw);
    const result = validateChessMove(this.state.board, from, to, player.color);
    if (!result) {
      this.state.message = 'Illegal move.';
      this.broadcastState();
      return;
    }

    this.state.board = result.board;
    this.state.lastMoveFrom = from;
    this.state.lastMoveTo = to;
    this.state.message = `${player.name} ${moveToAlgebraic(from, to)}`;

    if (result.captured.toLowerCase() === 'k') {
      this.state.winnerSessionId = sessionId;
      this.state.phase = 'finished';
      this.state.message = `${player.name} wins!`;
      this.state.turnDeadline = 0;
      this.broadcastState();
      return;
    }

    const nextId = nextSessionId(this.state, sessionId);
    const np = this.state.players[nextId];
    this.state.currentTurnSessionId = nextId;
    this.state.message = np ? `${np.name}'s turn` : this.state.message;
    this.state.turnDeadline = Date.now() + TURN_MS_CHESS;
    this.broadcastState();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = this.socketMeta.get(ws);
    this.socketMeta.delete(ws);
    if (!meta) return;

    const player = this.state.players[meta.sessionId];
    if (player) {
      player.connected = false;
    }

    const connected = connectedSessionIds(this.state).length;
    if (this.state.phase === 'playing' && !this.state.winnerSessionId) {
      if (connected === 0) {
        this.state.phase = 'waiting';
        this.state.message = 'Waiting for players to rejoin…';
        this.state.currentTurnSessionId = '';
      } else if (connected === 1) {
        this.state.message = 'Opponent disconnected — waiting for rejoin…';
      }
    }

    this.broadcastState();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private addPlayer(meta: SocketMeta) {
    const existingEntry = Object.entries(this.state.players).find(([, p]) => p.uid === meta.uid);

    if (existingEntry) {
      const [oldSessionId, existing] = existingEntry;
      if (oldSessionId !== meta.sessionId) {
        delete this.state.players[oldSessionId];
      }
      this.state.players[meta.sessionId] = {
        ...existing,
        sessionId: meta.sessionId,
        name: meta.name || existing.name,
        connected: true,
      };
      if (this.state.currentTurnSessionId === oldSessionId) {
        this.state.currentTurnSessionId = meta.sessionId;
      }
      if (this.state.winnerSessionId === oldSessionId) {
        this.state.winnerSessionId = meta.sessionId;
      }
      const connected = connectedSessionIds(this.state).length;
      if (connected >= MAX_LUDO_PLAYERS && this.state.phase === 'waiting') {
        this.state = this.gameId === 'chess' ? this.startChessGame() : startLudoGame(this.state);
      } else if (connected < MAX_LUDO_PLAYERS) {
        this.state.phase = 'waiting';
        this.state.message = `Waiting for opponent (${connected}/${MAX_LUDO_PLAYERS})…`;
      } else {
        this.state.message = `${meta.name} rejoined`;
      }
      return;
    }

    const connectedBefore = connectedSessionIds(this.state).length;
    const seat = Math.min(connectedBefore, MAX_LUDO_PLAYERS - 1);
    const isChess = this.gameId === 'chess';
    const player: PlayerState = {
      uid: meta.uid,
      name: meta.name,
      sessionId: meta.sessionId,
      seat,
      color: isChess ? (seat === 0 ? 'white' : 'black') : seat === 0 ? 'red' : 'blue',
      ludoPos: -1,
      connected: true,
      isBot: false,
    };
    this.state.players[meta.sessionId] = player;

    const connectedCount = connectedSessionIds(this.state).length;
    if (connectedCount < MAX_LUDO_PLAYERS) {
      this.state.phase = 'waiting';
      this.state.message = `Waiting for opponent (${connectedCount}/${MAX_LUDO_PLAYERS})…`;
      return;
    }

    if (this.state.phase === 'waiting') {
      this.state = isChess ? this.startChessGame() : startLudoGame(this.state);
    }
  }

  private startChessGame(): LudoRoomState {
    const ids = connectedSessionIds(this.state);
    const first = ids[0] || '';
    const p = this.state.players[first];
    return {
      ...this.state,
      phase: 'playing',
      board: CHESS_START,
      lastMoveFrom: -1,
      lastMoveTo: -1,
      dice: 0,
      currentTurnSessionId: first,
      message: `${p?.name || 'White'} to move`,
      turnDeadline: Date.now() + TURN_MS_CHESS,
    };
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
