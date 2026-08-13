import { Room, Client } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import {
  CardsRoomState,
  CardsPlayerSchema,
  CardSchema,
  type CardsRoomStateType,
  type CardsPlayerType,
  type CardType,
} from '../schema/gameState.js';
import {
  buildDeck,
  shuffle,
  dealHands,
  compareCards,
  formatCard,
  type PlainCard,
} from '../logic/cards.js';
import { verifyRoomAuth, nextSessionId, getClientForSession, TURN_MS } from './roomHelpers.js';

export class CardsRoom extends Room<{ state: CardsRoomStateType }> {
  private turnTimeout?: ReturnType<typeof setTimeout>;
  private deck: PlainCard[] = [];
  private pendingA: PlainCard | null = null;
  private pendingB: PlainCard | null = null;

  async onAuth(_client: Client, options: Record<string, unknown>) {
    return verifyRoomAuth('cards', options);
  }

  onCreate(options: Record<string, unknown>) {
    this.maxClients = 2;
    this.setState(new CardsRoomState());
    this.state.inviteRoomId = String(options?.inviteRoomId || '');
    this.state.phase = 'waiting';
    this.state.message = 'Waiting for opponent…';

    this.onMessage('play_card', (client, message: { cardId?: string; index?: number }) => {
      this.handlePlayCard(client, message);
    });
  }

  onJoin(client: Client, options: Record<string, unknown>, auth: { name?: string | null; uid: string }) {
    const seat = this.state.players.size;
    const player = new CardsPlayerSchema();
    player.uid = auth.uid;
    player.name = auth.name || String(options?.name || 'Player');
    player.sessionId = client.sessionId;
    player.seat = seat;
    player.connected = true;
    player.isBot = false;
    player.handCount = 0;
    this.state.players.set(client.sessionId, player);

    client.view = new StateView();
    client.view.add(player);

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

  private createCardSchema(card: PlainCard): CardType {
    const c = new CardSchema();
    c.id = card.id;
    c.rank = card.rank;
    c.suit = card.suit;
    return c;
  }

  /** turnbased-cards-demo pattern — register new hand cards with StateView. */
  private pushCardToHand(player: CardsPlayerType, card: PlainCard) {
    const schemaCard = this.createCardSchema(card);
    player.hand.push(schemaCard);
    player.handCount = player.hand.length;

    const client = getClientForSession(this.clients, player.sessionId);
    if (client?.view) client.view.add(schemaCard);
  }

  private dealNewHands() {
    if (this.deck.length < 10) this.deck = shuffle(buildDeck());
    const dealt = dealHands(this.deck, 5);
    this.deck = dealt.rest;

    const ids = [...this.state.players.keys()];
    ids.forEach((id, i) => {
      const p = this.state.players.get(id);
      if (!p) return;
      p.hand.splice(0, p.hand.length);
      p.handCount = 0;
      dealt.hands[i].forEach((card) => this.pushCardToHand(p, card));
    });

    this.state.tableCardA = '';
    this.state.tableCardB = '';
  }

  private startGame() {
    this.deck = shuffle(buildDeck());
    this.dealNewHands();
    this.state.phase = 'playing';
    this.state.round = 0;
    const first = [...this.state.players.keys()][0];
    const p = this.state.players.get(first);
    this.state.currentTurnSessionId = first;
    this.state.message = `${p?.name || 'Player'}'s turn — pick a card`;
    this.scheduleTurn();
  }

  private handlePlayCard(client: Client, message: { cardId?: string; index?: number }) {
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;
    if (this.state.currentTurnSessionId !== client.sessionId) return;

    clearTimeout(this.turnTimeout);
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    let cardIndex = -1;
    if (message.cardId) {
      for (let i = 0; i < player.hand.length; i += 1) {
        if (player.hand[i].id === message.cardId) {
          cardIndex = i;
          break;
        }
      }
    } else if (typeof message.index === 'number') {
      cardIndex = message.index;
    }

    if (cardIndex < 0 || cardIndex >= player.hand.length) return;

    const card = player.hand[cardIndex];
    const plain = { id: card.id, rank: card.rank, suit: card.suit };
    player.hand.splice(cardIndex, 1);
    player.handCount = player.hand.length;

    const ids = [...this.state.players.keys()];
    if (client.sessionId === ids[0]) {
      this.pendingA = plain;
      this.state.tableCardA = formatCard(plain);
    } else {
      this.pendingB = plain;
      this.state.tableCardB = formatCard(plain);
    }

    this.state.message = `${player.name} played ${formatCard(plain)}`;

    const bothPlayed = this.pendingA && this.pendingB;
    if (!bothPlayed) {
      const next = nextSessionId(this.state, client.sessionId);
      const np = this.state.players.get(next);
      this.state.currentTurnSessionId = next;
      this.state.message = `${np?.name}'s turn — pick a card`;
      this.scheduleTurn();
      return;
    }

    const cardA = this.pendingA!;
    const cardB = this.pendingB!;
    const cmp = compareCards(cardA, cardB);
    const winnerId = cmp >= 0 ? ids[0] : ids[1];
    const winner = this.state.players.get(winnerId);
    if (winner) winner.score += 1;

    this.state.round += 1;
    this.state.message = `Round ${this.state.round}: ${formatCard(cardA)} vs ${formatCard(cardB)} — ${winner?.name} wins the trick`;
    this.state.tableCardA = '';
    this.state.tableCardB = '';
    this.pendingA = null;
    this.pendingB = null;

    const p0 = this.state.players.get(ids[0]);
    const p1 = this.state.players.get(ids[1]);
    if ((p0?.handCount || 0) === 0 && (p1?.handCount || 0) === 0) {
      const s0 = p0?.score || 0;
      const s1 = p1?.score || 0;
      if (s0 === s1) {
        this.dealNewHands();
        this.state.message = 'Tie — new hands dealt!';
        this.state.currentTurnSessionId = ids[0];
        this.scheduleTurn();
        return;
      }
      const winId = s0 > s1 ? ids[0] : ids[1];
      const wp = this.state.players.get(winId);
      this.endGame(winId, `${wp?.name} wins ${Math.max(s0, s1)}-${Math.min(s0, s1)}!`);
      return;
    }

    this.state.currentTurnSessionId = winnerId;
    this.state.message = `${winner?.name}'s turn — pick a card`;
    this.scheduleTurn();
  }

  private scheduleTurn() {
    clearTimeout(this.turnTimeout);
    if (this.state.phase !== 'playing' || this.state.winnerSessionId) return;

    this.state.turnDeadline = Date.now() + TURN_MS.cards;
    this.turnTimeout = setTimeout(() => {
      const current = this.state.currentTurnSessionId;
      const client = this.clients.find((c) => c.sessionId === current);
      const player = this.state.players.get(current);
      if (client && player && player.hand.length > 0) {
        this.handlePlayCard(client, { index: 0 });
      }
    }, TURN_MS.cards);
  }

  private endGame(winnerSessionId: string, message: string) {
    clearTimeout(this.turnTimeout);
    this.state.winnerSessionId = winnerSessionId;
    this.state.phase = 'finished';
    this.state.message = message;
  }
}
