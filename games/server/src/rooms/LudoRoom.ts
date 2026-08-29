import { Room, Client } from '@colyseus/core';
import { LudoRoomState, PlayerSchema, type LudoRoomStateType } from '../schema/gameState.js';
import { verifyRoomAuth, nextSessionId, TURN_MS } from './roomHelpers.js';

const HOME = 27;

export class LudoRoom extends Room<{ state: LudoRoomStateType }> {
  private turnTimeout?: ReturnType<typeof setTimeout>;
  private botFillTimeout?: ReturnType<typeof setTimeout>;

  async onAuth(_client: Client, options: Record<string, unknown>) {
    return verifyRoomAuth('ludo', options);
  }

  onCreate(options: Record<string, unknown>) {
    this.maxClients = 2;
    this.setState(new LudoRoomState());
    this.state.inviteRoomId = String(options?.inviteRoomId || '');
    this.state.phase = 'waiting';
    this.state.message = 'Waiting for opponent…';

    this.onMessage('roll', (client) => {
      this.handleRoll(client);
    });
  }

  onJoin(client: Client, options: Record<string, unknown>, auth: { name?: string | null; uid: string }) {
    const seat = this.state.players.size;
    const player = new PlayerSchema();
    player.uid = auth.uid;
    player.name = auth.name || String(options?.name || 'Player');
    player.sessionId = client.sessionId;
    player.seat = seat;
    player.color = seat === 0 ? 'red' : 'blue';
    player.ludoPos = -1;
    player.connected = true;
    player.isBot = false;
    this.state.players.set(client.sessionId, player);

    if (this.state.players.size < this.maxClients) {
      this.state.message = `Waiting for opponent (${this.state.players.size}/${this.maxClients})…`;
      this.scheduleBotFill();
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
    clearTimeout(this.botFillTimeout);
  }

  /** If no friend joins within a few seconds, start vs CPU so solo play always works. */
  private scheduleBotFill() {
    clearTimeout(this.botFillTimeout);
    this.botFillTimeout = setTimeout(() => {
      if (this.state.phase !== 'waiting' || this.state.players.size >= this.maxClients) return;
      const botSessionId = `bot_${this.roomId}`;
      const bot = new PlayerSchema();
      bot.uid = 'cpu';
      bot.name = 'CPU';
      bot.sessionId = botSessionId;
      bot.seat = 1;
      bot.color = 'blue';
      bot.ludoPos = -1;
      bot.connected = true;
      bot.isBot = true;
      this.state.players.set(botSessionId, bot);
      this.state.message = 'Playing vs CPU — roll to start!';
      this.startGame();
    }, 4000);
  }

  private startGame() {
    this.state.phase = 'playing';
    this.state.dice = 0;
    const first = [...this.state.players.keys()][0];
    const p = this.state.players.get(first);
    this.state.currentTurnSessionId = first;
    this.state.message = `${p?.name || 'Player'} rolls first`;
    this.scheduleTurn(false);
  }

  private handleRoll(client: Client) {
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;
    if (this.state.currentTurnSessionId !== client.sessionId) return;

    clearTimeout(this.turnTimeout);
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const roll = 1 + Math.floor(Math.random() * 6);
    this.state.dice = roll;

    if (player.ludoPos < 0) {
      if (roll !== 6) {
        this.state.message = `${player.name} rolled ${roll} — need 6 to start`;
        this.passTurn();
        return;
      }
      player.ludoPos = 0;
      this.state.message = `${player.name} rolled 6 and entered!`;
    } else {
      const nextPos = player.ludoPos + roll;
      if (nextPos > HOME) {
        this.state.message = `${player.name} rolled ${roll} — too far`;
      } else {
        player.ludoPos = nextPos;
        this.state.message = `${player.name} rolled ${roll} → space ${nextPos + 1}`;
        if (player.ludoPos >= HOME) {
          this.endGame(client.sessionId, `${player.name} wins Ludo! 🎉`);
          return;
        }
      }
    }

    this.passTurn();
  }

  private passTurn() {
    const next = nextSessionId(this.state, this.state.currentTurnSessionId);
    const np = this.state.players.get(next);
    this.state.currentTurnSessionId = next;
    this.state.message = `${np?.name || 'Opponent'}'s turn — roll dice`;
    this.scheduleTurn(true);
    if (np?.isBot) {
      setTimeout(() => this.handleBotRoll(next), 800);
    }
  }

  private handleBotRoll(botSessionId: string) {
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;
    if (this.state.currentTurnSessionId !== botSessionId) return;
    const fakeClient = { sessionId: botSessionId } as Client;
    this.handleRoll(fakeClient);
  }

  private scheduleTurn(autoRoll: boolean) {
    clearTimeout(this.turnTimeout);
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;

    this.state.turnDeadline = Date.now() + TURN_MS.ludo;
    this.turnTimeout = setTimeout(() => {
      const current = this.state.currentTurnSessionId;
      const client = this.clients.find((c) => c.sessionId === current);
      if (client && autoRoll) this.handleRoll(client);
    }, TURN_MS.ludo);
  }

  private endGame(winnerSessionId: string, message: string) {
    clearTimeout(this.turnTimeout);
    this.state.winnerSessionId = winnerSessionId;
    this.state.phase = 'finished';
    this.state.message = message;
  }
}
