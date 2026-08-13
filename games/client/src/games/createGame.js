import Phaser from 'phaser';
import { HUZZ, PIECE_UNICODE } from '../ui/huzzTheme.js';
import { bindRoomState, createStatusBar, createWaitingOverlay, createWinOverlay } from '../colyseus/bindState.js';

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
  }

  create() {
    this.cameras.main.setBackgroundColor('#831843');
    this.hud = createStatusBar(this, this.launch);
    this.waiting = createWaitingOverlay(this, this.launch);
    this.drawTrack();

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
      if (this.room?.state?.currentTurnSessionId !== this.localSessionId) return;
      if (this.room?.state?.phase !== 'playing') return;
      this.room.send('roll');
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
    }
  }

  drawTrack() {
    this.trackGraphics?.destroy();
    this.trackGraphics = this.add.graphics();
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2 - 10;
    const r = Math.min(this.scale.width, this.scale.height) * 0.28;
    this.trackGraphics.lineStyle(14, HUZZ.track, 1);
    this.trackGraphics.strokeCircle(cx, cy, r);
    this.trackGraphics.lineStyle(3, HUZZ.boardDark, 1);
    this.trackGraphics.strokeCircle(cx, cy, r);
    this.trackCenter = { cx, cy, r };
  }

  syncTokens() {
    if (!this.room?.state?.players || !this.trackCenter) return;
    const { cx, cy, r } = this.trackCenter;
    this.room.state.players.forEach((player, sessionId) => {
      let sprite = this.tokenSprites.get(sessionId);
      const color = player.color === 'red' ? 0xdb2777 : 0xf7f1e8;
      const angle = player.ludoPos < 0 ? (player.seat === 0 ? -Math.PI / 2 : Math.PI / 2) : (player.ludoPos / 27) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (!sprite) {
        sprite = this.add.circle(x, y, 16, color).setStrokeStyle(3, 0x2b2420).setDepth(20);
        const label = this.add.text(x, y + 22, player.name?.split(' ')[0] || '?', {
          fontSize: '10px',
          color: HUZZ.cream,
          fontFamily: 'system-ui, sans-serif',
        }).setOrigin(0.5).setDepth(21);
        sprite.label = label;
        this.tokenSprites.set(sessionId, sprite);
      }
      sprite.x = x;
      sprite.y = y;
      sprite.label.x = x;
      sprite.label.y = y + 22;
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
