import Phaser from 'phaser';
import { HUZZ, PIECE_UNICODE } from '../ui/huzzTheme.js';
import { bindRoomState, createStatusBar, createWaitingOverlay, createWinOverlay } from '../colyseus/bindState.js';
import {
  computeLudoLayout,
  drawClassicLudoBoard,
  drawPawnToken,
  tokenCell,
  playerColorHex,
} from './ludoBoard.js';

export class ChessScene extends Phaser.Scene {
  constructor(launch, room) {
    super('chess');
    this.launch = launch;
    this.room = room;
    this.localSessionId = room?.sessionId;
    this.selectedSquare = -1;
    this.pieceTexts = [];
    this.highlights = [];
    this.boardOrigin = { x: 0, y: 0, cell: 0 };
  }

  create() {
    this.cameras.main.setBackgroundColor(HUZZ.bgDeep);
    this.hud = createStatusBar(this, this.launch);
    this.waiting = createWaitingOverlay(this, this.launch);
    this.layoutBoard();
    this.drawPieces(this.room?.state?.board || '');

    if (this.room) {
      bindRoomState(this.room, this, {
        onPhase: (phase) => {
          if (phase === 'playing') this.waiting.hide();
          else this.waiting.show();
        },
        onMessage: (msg) => this.hud.setStatus(msg),
        onTurn: (sid) => this.updateTurn(sid),
        onBoard: (board) => {
          this.drawPieces(board);
          this.clearSelection();
        },
        onWinner: (sid) => {
          if (sid) {
            const p = this.room.state.players.get(sid);
            this.winOverlay = createWinOverlay(this, this.room.state.message || `${p?.name} wins!`);
          }
        },
      });
    }

    this.scale.on('resize', () => {
      this.layoutBoard();
      this.drawPieces(this.room?.state?.board || '');
    });

    this.input.on('pointerdown', (pointer) => this.handleTap(pointer));
  }

  layoutBoard() {
    this.boardGraphics?.destroy();
    this.boardGraphics = this.add.graphics();
    const size = Math.min(this.scale.width, this.scale.height - 120) - 24;
    const cell = size / 8;
    const ox = (this.scale.width - size) / 2;
    const oy = 64 + (this.scale.height - 120 - size) / 2;
    this.boardOrigin = { x: ox, y: oy, cell };

    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const light = (r + c) % 2 === 0;
        this.boardGraphics.fillStyle(light ? HUZZ.boardLight : HUZZ.boardDark, 1);
        this.boardGraphics.fillRect(ox + c * cell, oy + r * cell, cell - 1, cell - 1);
      }
    }
  }

  squareAt(px, py) {
    const { x, y, cell } = this.boardOrigin;
    const col = Math.floor((px - x) / cell);
    const row = Math.floor((py - y) / cell);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    return row * 8 + col;
  }

  clearSelection() {
    this.selectedSquare = -1;
    this.highlights.forEach((h) => h.destroy());
    this.highlights = [];
  }

  highlightSquare(idx, color = 0xdb2777) {
    const { x, y, cell } = this.boardOrigin;
    const row = Math.floor(idx / 8);
    const col = idx % 8;
    const rect = this.add.rectangle(x + col * cell + cell / 2, y + row * cell + cell / 2, cell - 4, cell - 4, color, 0.35);
    rect.setDepth(5);
    this.highlights.push(rect);
  }

  drawPieces(board) {
    this.pieceTexts.forEach((t) => t.destroy());
    this.pieceTexts = [];
    if (!board || board.length !== 64) return;

    const { x, y, cell } = this.boardOrigin;
    for (let i = 0; i < 64; i += 1) {
      const ch = board[i];
      if (ch === '.') continue;
      const row = Math.floor(i / 8);
      const col = i % 8;
      const isWhite = ch >= 'A' && ch <= 'Z';
      const text = this.add.text(x + col * cell + cell / 2, y + row * cell + cell / 2, PIECE_UNICODE[ch] || ch, {
        fontFamily: 'system-ui, serif',
        fontSize: `${Math.floor(cell * 0.62)}px`,
        color: isWhite ? '#F7F1E8' : '#2B2420',
      }).setOrigin(0.5).setDepth(10);
      if (this.room?.state?.lastMoveTo === i) {
        text.setScale(1.08);
      }
      this.pieceTexts.push(text);
    }
  }

  updateTurn(sessionId) {
    const mine = sessionId === this.localSessionId;
    const p = this.room?.state?.players?.get(sessionId);
    this.hud.setTurn(mine ? 'Your turn' : `${p?.name?.split(' ')[0] || 'Opponent'}'s turn`, mine);
  }

  handleTap(pointer) {
    if (this.room?.state?.phase !== 'playing' || this.room?.state?.winnerSessionId) return;
    if (this.room?.state?.currentTurnSessionId !== this.localSessionId) return;

    const sq = this.squareAt(pointer.x, pointer.y);
    if (sq < 0) return;

    if (this.selectedSquare < 0) {
      const board = this.room.state.board;
      const piece = board[sq];
      const me = this.room.state.players.get(this.localSessionId);
      if (!piece || piece === '.') return;
      const isWhite = piece >= 'A' && piece <= 'Z';
      if ((me?.color === 'white') !== isWhite) return;
      this.selectedSquare = sq;
      this.clearSelection();
      this.highlightSquare(sq, 0xfbcfe8);
      return;
    }

    if (sq === this.selectedSquare) {
      this.clearSelection();
      return;
    }

    this.room.send('move', { from: this.selectedSquare, to: sq });
    this.clearSelection();
  }
}

export class LudoScene extends Phaser.Scene {
  constructor(launch, room) {
    super('ludo');
    this.launch = launch;
    this.room = room;
    this.localSessionId = room?.sessionId;
    this.tokenSprites = new Map();
    this.local = null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f172a');
    this.hud = createStatusBar(this, this.launch);
    this.waiting = createWaitingOverlay(this, this.launch);
    this.layout = null;
    this.drawBoard();

    this.scale.on('resize', () => {
      this.drawBoard();
      if (this.room) this.syncTokens();
      else if (this.local) this.syncLocalTokens();
    });

    this.diceBtn = this.add.rectangle(this.scale.width / 2, this.scale.height - 72, 140, 52, 0x2b2420, 1)
      .setStrokeStyle(2, 0xf7f1e8)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);
    this.diceLabel = this.add.text(this.scale.width / 2, this.scale.height - 72, '🎲 Roll', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: HUZZ.cream,
    }).setOrigin(0.5).setDepth(51);

    this.diceBtn.on('pointerdown', () => {
      if (this.room) {
        if (this.room?.state?.currentTurnSessionId !== this.localSessionId) return;
        if (this.room?.state?.phase !== 'playing') return;
        this.room.send('roll');
      } else if (this.local?.turn === 'me' && this.local?.phase === 'playing') {
        this.localRoll('me');
      }
      this.diceBtn.setScale(0.95);
      this.time.delayedCall(100, () => this.diceBtn.setScale(1));
    });

    if (this.room) {
      bindRoomState(this.room, this, {
        onPhase: (phase) => {
          if (phase === 'playing') this.waiting.hide();
          else this.waiting.show();
        },
        onMessage: (msg) => this.hud.setStatus(msg),
        onTurn: (sid) => this.updateTurn(sid),
        onDice: (d) => {
          if (d > 0) this.diceLabel.setText(`🎲 ${d}`);
        },
        onPlayerChange: () => this.syncTokens(),
        onWinner: () => {
          this.winOverlay = createWinOverlay(this, this.room.state.message);
        },
      });
    } else {
      this.startLocalLudo();
    }
  }

  startLocalLudo() {
    const opp = String(this.launch?.opponentName || 'CPU').trim() || 'CPU';
    const meName = String(this.launch?.name || 'You').trim() || 'You';
    this.local = {
      phase: 'playing',
      turn: 'me',
      dice: 0,
      winner: null,
      home: 27,
      players: {
        me: { id: 'me', name: meName, color: 'red', seat: 0, ludoPos: -1 },
        cpu: { id: 'cpu', name: opp.split(' ')[0], color: 'blue', seat: 1, ludoPos: -1 },
      },
    };
    this.waiting.hide();
    this.hud.setStatus(`Local game vs ${opp.split(' ')[0]} — roll to start!`);
    this.hud.setTurn('Your roll', true);
    this.syncLocalTokens();
  }

  localRoll(who) {
    if (!this.local || this.local.phase !== 'playing' || this.local.winner) return;
    if (this.local.turn !== who) return;

    const player = this.local.players[who];
    if (!player) return;

    const roll = 1 + Math.floor(Math.random() * 6);
    this.local.dice = roll;
    this.diceLabel.setText(`🎲 ${roll}`);

    if (player.ludoPos < 0) {
      if (roll !== 6) {
        this.hud.setStatus(`${player.name} rolled ${roll} — need 6 to start`);
        this.passLocalTurn();
        return;
      }
      player.ludoPos = 0;
      this.hud.setStatus(`${player.name} rolled 6 and entered!`);
    } else {
      const nextPos = player.ludoPos + roll;
      if (nextPos > this.local.home) {
        this.hud.setStatus(`${player.name} rolled ${roll} — too far`);
      } else {
        player.ludoPos = nextPos;
        this.hud.setStatus(`${player.name} rolled ${roll} → space ${nextPos + 1}`);
        if (player.ludoPos >= this.local.home) {
          this.local.winner = who;
          this.local.phase = 'finished';
          this.winOverlay = createWinOverlay(this, `${player.name} wins Ludo! 🎉`);
          this.syncLocalTokens();
          return;
        }
      }
    }

    this.syncLocalTokens();
    this.passLocalTurn();
  }

  passLocalTurn() {
    if (!this.local || this.local.winner) return;
    this.local.turn = this.local.turn === 'me' ? 'cpu' : 'me';
    const next = this.local.players[this.local.turn];
    const mine = this.local.turn === 'me';
    this.hud.setTurn(mine ? 'Your roll' : `${next?.name || 'CPU'}'s roll`, mine);
    this.diceBtn.setAlpha(mine ? 1 : 0.45);
    if (this.local.turn === 'cpu') {
      this.time.delayedCall(900, () => this.localRoll('cpu'));
    }
  }

  placeToken(id, player, ludoPos) {
    if (!this.layout) return;
    const { r, c } = tokenCell(ludoPos, player.seat ?? 0);
    const pos = {
      x: this.layout.ox + (c + 0.5) * this.layout.cell,
      y: this.layout.oy + (r + 0.5) * this.layout.cell,
    };
    const size = this.layout.cell * 0.42;
    let entry = this.tokenSprites.get(id);
    if (!entry) {
      const pawn = drawPawnToken(this, pos.x, pos.y, size, playerColorHex(player));
      const label = this.add
        .text(pos.x, pos.y + size * 0.95, player.name?.split(' ')[0] || '?', {
          fontSize: `${Math.max(9, Math.floor(this.layout.cell * 0.22))}px`,
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          fontStyle: 'bold',
          stroke: '#0f172a',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(25);
      entry = { pawn, label };
      this.tokenSprites.set(id, entry);
    }
    entry.pawn.setPosition(pos.x, pos.y);
    entry.label.setPosition(pos.x, pos.y + size * 0.95);
  }

  syncLocalTokens() {
    if (!this.local?.players || !this.layout) return;
    Object.entries(this.local.players).forEach(([id, player]) => {
      this.placeToken(id, player, player.ludoPos ?? -1);
    });
  }

  drawBoard() {
    this.boardGraphics?.destroy();
    this.boardGraphics = this.add.graphics().setDepth(0);
    this.layout = computeLudoLayout(this.scale.width, this.scale.height);
    drawClassicLudoBoard(this.boardGraphics, this.layout);
    // Re-layer tokens after redraw
    this.tokenSprites.forEach((entry) => {
      entry.pawn?.setDepth(20);
      entry.label?.setDepth(25);
    });
  }

  syncTokens() {
    if (!this.room?.state?.players || !this.layout) return;
    this.room.state.players.forEach((player, sessionId) => {
      this.placeToken(sessionId, player, player.ludoPos ?? -1);
    });
  }

  updateTurn(sessionId) {
    const mine = sessionId === this.localSessionId;
    const p = this.room?.state?.players?.get(sessionId);
    this.hud.setTurn(mine ? 'Your roll' : `${p?.name?.split(' ')[0] || 'Opponent'}'s roll`, mine);
    this.diceBtn.setAlpha(mine ? 1 : 0.45);
  }
}

export class CardsScene extends Phaser.Scene {
  constructor(launch, room) {
    super('cards');
    this.launch = launch;
    this.room = room;
    this.localSessionId = room?.sessionId;
    this.cardTiles = [];
  }

  create() {
    this.cameras.main.setBackgroundColor('#14532d');
    this.hud = createStatusBar(this, this.launch);
    this.waiting = createWaitingOverlay(this, this.launch);
    this.tableA = this.add.text(this.scale.width / 2 - 50, this.scale.height / 2 - 20, '', {
      fontSize: '28px',
      fontFamily: 'system-ui, sans-serif',
      color: HUZZ.cream,
    }).setOrigin(0.5);
    this.tableB = this.add.text(this.scale.width / 2 + 50, this.scale.height / 2 - 20, '', {
      fontSize: '28px',
      fontFamily: 'system-ui, sans-serif',
      color: HUZZ.cream,
    }).setOrigin(0.5);
    this.scoreText = this.add.text(this.scale.width / 2, 72, '', {
      fontSize: '13px',
      fontFamily: 'system-ui, sans-serif',
      color: HUZZ.cream,
    }).setOrigin(0.5);

    if (this.room) {
      bindRoomState(this.room, this, {
        onPhase: (phase) => {
          if (phase === 'playing') {
            this.waiting.hide();
            const me = this.room.state.players.get(this.localSessionId);
            if (me) this.renderHand([...me.hand]);
          } else {
            this.waiting.show();
          }
        },
        onMessage: (msg) => this.hud.setStatus(msg),
        onTurn: (sid) => this.updateTurn(sid),
        onTable: (a, b) => {
          this.tableA.setText(formatCard(a));
          this.tableB.setText(formatCard(b));
        },
        onPlayerAdd: (player, sid) => {
          if (sid === this.localSessionId) this.renderHand([...player.hand]);
          this.updateScores();
        },
        onPlayerChange: (player, sid) => {
          if (sid === this.localSessionId) this.renderHand([...player.hand]);
          this.updateScores();
        },
        onWinner: () => {
          this.winOverlay = createWinOverlay(this, this.room.state.message);
        },
      });
    }
  }

  updateScores() {
    const ids = [...this.room.state.players.keys()];
    const scores = ids.map((id) => {
      const p = this.room.state.players.get(id);
      return `${p?.name?.split(' ')[0]}: ${p?.score || 0}`;
    });
    this.scoreText.setText(scores.join('  ·  '));
  }

  updateTurn(sessionId) {
    const mine = sessionId === this.localSessionId;
    const p = this.room?.state?.players?.get(sessionId);
    this.hud.setTurn(mine ? 'Pick a card' : `${p?.name?.split(' ')[0] || 'Opponent'}'s turn`, mine);
  }

  renderHand(handArray) {
    this.cardTiles.forEach((t) => t.destroy());
    this.cardTiles = [];
    const cards = Array.isArray(handArray) ? handArray : [];
    if (cards.length === 0) return;
    const startX = (this.scale.width - cards.length * 68) / 2 + 34;
    const y = this.scale.height - 88;

    cards.forEach((card, index) => {
      const x = startX + index * 68;
      const { text, red } = formatCardSchema(card);
      const tile = this.add
        .rectangle(x, y, 60, 84, 0xf7f1e8, 1)
        .setStrokeStyle(2, 0x2b2420)
        .setInteractive({ useHandCursor: true })
        .setDepth(30);
      const label = this.add
        .text(x, y, text, {
          fontSize: '18px',
          fontFamily: 'system-ui, sans-serif',
          color: red ? '#DB2777' : '#2B2420',
        })
        .setOrigin(0.5)
        .setDepth(31);
      tile.on('pointerdown', () => {
        if (this.room?.state?.currentTurnSessionId !== this.localSessionId) return;
        if (this.room?.state?.phase !== 'playing') return;
        this.room.send('play_card', { cardId: card.id, index });
      });
      this.cardTiles.push(tile, label);
    });
  }
}

function formatCardSchema(card) {
  if (!card) return { text: '', red: false };
  if (typeof card === 'string') {
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
    return { text: `${rank}${suits[suit] || suit}`, red: suit === 'H' || suit === 'D' };
  }
  const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
  return {
    text: `${card.rank}${suits[card.suit] || card.suit}`,
    red: card.suit === 'H' || card.suit === 'D',
  };
}

function formatCard(card) {
  if (!card) return '';
  if (typeof card === 'object') return formatCardSchema(card).text;
  return formatCardSchema(card).text;
}

export class SoloScene extends Phaser.Scene {
  constructor(launch) {
    super('solo');
    this.launch = launch;
  }

  create() {
    this.cameras.main.setBackgroundColor(HUZZ.bg);
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width - 40, 200, 0xf7f1e8, 1)
      .setStrokeStyle(2, 0x2b2420);
    this.add.text(this.scale.width / 2, this.scale.height / 2 - 20, this.launch.gameId.charAt(0).toUpperCase() + this.launch.gameId.slice(1), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: HUZZ.ink,
    }).setOrigin(0.5);
    this.add.text(this.scale.width / 2, this.scale.height / 2 + 24, 'Solo mode — coming soon', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: HUZZ.plum,
    }).setOrigin(0.5);
  }
}

export function createGameConfig(launch, room) {
  const map = {
    chess: ChessScene,
    ludo: LudoScene,
    cards: CardsScene,
    hearts: CardsScene,
  };
  const SceneClass = map[launch.gameId] || SoloScene;
  const scene = map[launch.gameId] ? new SceneClass(launch, room) : new SoloScene(launch);

  return {
    type: Phaser.AUTO,
    parent: 'game-root',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: HUZZ.bgDeep,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [scene],
  };
}
