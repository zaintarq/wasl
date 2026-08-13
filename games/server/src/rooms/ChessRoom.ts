import { Room, Client } from '@colyseus/core';
import { ChessRoomState, PlayerSchema, type ChessRoomStateType } from '../schema/gameState.js';
import { START, validateMove, moveToAlgebraic } from '../logic/chess.js';
import { verifyRoomAuth, nextSessionId, TURN_MS } from './roomHelpers.js';

export class ChessRoom extends Room<{ state: ChessRoomStateType }> {
  private turnTimeout?: ReturnType<typeof setTimeout>;

  async onAuth(_client: Client, options: Record<string, unknown>) {
    return verifyRoomAuth('chess', options);
  }

  onCreate(options: Record<string, unknown>) {
    this.maxClients = 2;
    this.setState(new ChessRoomState());
    this.state.inviteRoomId = String(options?.inviteRoomId || '');
    this.state.phase = 'waiting';
    this.state.message = 'Waiting for opponent…';
    this.state.board = START;

    this.onMessage('move', (client, data: { from?: number; to?: number }) => {
      this.handleMove(client, data);
    });
  }

  onJoin(client: Client, options: Record<string, unknown>, auth: { name?: string | null; uid: string }) {
    const seat = this.state.players.size;
    const player = new PlayerSchema();
    player.uid = auth.uid;
    player.name = auth.name || String(options?.name || 'Player');
    player.sessionId = client.sessionId;
    player.seat = seat;
    player.color = seat === 0 ? 'white' : 'black';
    player.connected = true;
    player.isBot = false;
    this.state.players.set(client.sessionId, player);

    if (this.state.players.size < this.maxClients) {
      this.state.message = `Waiting for opponent (${this.state.players.size}/${this.maxClients})…`;
      return;
    }

    this.startGame();
  }

  async onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    if (this.state.phase === 'playing' && !this.state.winnerSessionId) {
      const alive = [...this.state.players.values()].filter((p) => p.connected);
      if (alive.length === 1) {
        this.endGame(alive[0].sessionId, `${alive[0].name} wins — opponent left.`);
      }
    }
  }

  onDispose() {
    clearTimeout(this.turnTimeout);
  }

  private startGame() {
    this.state.phase = 'playing';
    this.state.board = START;
    this.state.lastMoveFrom = -1;
    this.state.lastMoveTo = -1;
    const first = [...this.state.players.keys()][0];
    const p = this.state.players.get(first);
    this.state.currentTurnSessionId = first;
    this.state.message = `${p?.name || 'White'} to move`;
    this.scheduleTurn();
  }

  private handleMove(client: Client, data: { from?: number; to?: number }) {
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;
    if (this.state.currentTurnSessionId !== client.sessionId) return;

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const from = Number(data?.from);
    const to = Number(data?.to);
    const result = validateMove(this.state.board, from, to, player.color);
    if (!result) {
      this.state.message = 'Illegal move.';
      return;
    }

    clearTimeout(this.turnTimeout);
    this.state.board = result.board;
    this.state.lastMoveFrom = from;
    this.state.lastMoveTo = to;
    this.state.message = `${player.name} ${moveToAlgebraic(from, to)}`;

    if (result.captured.toLowerCase() === 'k') {
      this.endGame(client.sessionId, `${player.name} wins!`);
      return;
    }

    const next = nextSessionId(this.state, client.sessionId);
    const np = this.state.players.get(next);
    this.state.currentTurnSessionId = next;
    this.state.message = `${np?.name || 'Opponent'}'s turn`;
    this.scheduleTurn();
  }

  private scheduleTurn() {
    clearTimeout(this.turnTimeout);
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;

    this.state.turnDeadline = Date.now() + TURN_MS.chess;
    this.turnTimeout = setTimeout(() => {
      const current = this.state.currentTurnSessionId;
      const opponent = nextSessionId(this.state, current);
      const opp = this.state.players.get(opponent);
      this.endGame(opponent, `${opp?.name || 'Opponent'} wins — time out.`);
    }, TURN_MS.chess);
  }

  private endGame(winnerSessionId: string, message: string) {
    clearTimeout(this.turnTimeout);
    this.state.winnerSessionId = winnerSessionId;
    this.state.phase = 'finished';
    this.state.message = message;
  }
}
