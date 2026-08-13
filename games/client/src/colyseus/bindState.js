import { Callbacks } from '@colyseus/sdk';
import { HUZZ } from '../ui/huzzTheme.js';

/** Wire Colyseus 0.17 room state → Phaser (tutorial-phaser + turnbased-cards-demo). */
export function bindRoomState(room, _scene, handlers = {}) {
  if (!room?.state) return;

  const cb = Callbacks.get(room);

  const onChange = () => {
    handlers.onState?.(room.state);
    if (handlers.onPhase) handlers.onPhase(room.state.phase);
    if (handlers.onMessage) handlers.onMessage(room.state.message);
    if (handlers.onTurn) handlers.onTurn(room.state.currentTurnSessionId);
    if (handlers.onBoard) handlers.onBoard(room.state.board);
    if (handlers.onDice) handlers.onDice(room.state.dice);
    if (handlers.onWinner) handlers.onWinner(room.state.winnerSessionId);
    if (handlers.onTable) {
      handlers.onTable(room.state.tableCardA, room.state.tableCardB, room.state.round);
    }
    if (handlers.onDeadline) handlers.onDeadline(room.state.turnDeadline);
  };

  room.onStateChange(onChange);

  if (room.state.players) {
    cb.onAdd('players', (player, sessionId) => {
      cb.listen(player, () => handlers.onPlayerChange?.(player, sessionId));
      handlers.onPlayerAdd?.(player, sessionId);
      onChange();
    });

    cb.onRemove('players', (_player, sessionId) => {
      handlers.onPlayerRemove?.(sessionId);
      onChange();
    });
  }

  onChange();
}

export function createStatusBar(scene, launch) {
  const w = scene.scale.width;
  const bar = scene.add.container(0, 0).setScrollFactor(0).setDepth(200);

  const bg = scene.add.rectangle(w / 2, 28, w, 56, 0x2b2420, 0.94);
  const title = scene.add.text(16, 10, launch.gameId.charAt(0).toUpperCase() + launch.gameId.slice(1), {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '15px',
    fontStyle: 'bold',
    color: HUZZ.cream,
  });
  const status = scene.add.text(16, 30, '', {
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
    color: '#FBCFE8',
  });
  const turnPill = scene.add.rectangle(w - 70, 28, 120, 28, 0xdb2777, 1).setStrokeStyle(2, 0x2b2420);
  const turnText = scene.add
    .text(w - 70, 28, 'Waiting…', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: HUZZ.cream,
    })
    .setOrigin(0.5);

  bar.add([bg, title, status, turnPill, turnText]);

  return {
    container: bar,
    setStatus(msg) {
      status.setText(msg || '');
    },
    setTurn(label, isMyTurn) {
      turnText.setText(label || '');
      turnPill.setFillStyle(isMyTurn ? 0xdb2777 : 0x4a4038);
    },
  };
}

export function createWaitingOverlay(scene, launch) {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const container = scene.add.container(0, 0).setScrollFactor(0).setDepth(300);

  const veil = scene.add.rectangle(w / 2, h / 2, w, h, 0xfbcfe8, 0.92);
  const card = scene.add
    .rectangle(w / 2, h / 2, Math.min(w - 48, 320), 180, 0xf7f1e8, 1)
    .setStrokeStyle(2, 0x2b2420);
  const title = scene.add
    .text(w / 2, h / 2 - 36, 'Waiting for opponent…', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: HUZZ.ink,
      align: 'center',
    })
    .setOrigin(0.5);
  const sub = scene.add
    .text(
      w / 2,
      h / 2,
      launch.opponentName ? `Invite sent to ${launch.opponentName.split(' ')[0]}` : 'Your match can join from Social',
      {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: HUZZ.plum,
        align: 'center',
      },
    )
    .setOrigin(0.5);
  const hint = scene.add
    .text(w / 2, h / 2 + 32, 'Game starts when they join the same room', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: 'rgba(43,36,32,0.65)',
    })
    .setOrigin(0.5);

  container.add([veil, card, title, sub, hint]);

  return {
    container,
    hide() {
      container.setVisible(false);
    },
    show() {
      container.setVisible(true);
    },
  };
}

export function createWinOverlay(scene, message) {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const container = scene.add.container(0, 0).setScrollFactor(0).setDepth(400);
  const veil = scene.add.rectangle(w / 2, h / 2, w, h, 0x2b2420, 0.55);
  const card = scene.add
    .rectangle(w / 2, h / 2, Math.min(w - 48, 300), 140, 0xf7f1e8, 1)
    .setStrokeStyle(2, 0x2b2420);
  const text = scene.add
    .text(w / 2, h / 2, message || 'Game over', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: HUZZ.ink,
      align: 'center',
      wordWrap: { width: 260 },
    })
    .setOrigin(0.5);
  container.add([veil, card, text]);
  return container;
}
