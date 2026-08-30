export interface PlayerState {
  uid: string;
  name: string;
  sessionId: string;
  seat: number;
  color: string;
  ludoPos: number;
  connected: boolean;
  isBot: boolean;
  handCount?: number;
  score?: number;
}

export interface LudoRoomState {
  inviteRoomId: string;
  gameId: string;
  phase: 'waiting' | 'playing' | 'finished';
  message: string;
  currentTurnSessionId: string;
  winnerSessionId: string;
  dice: number;
  turnDeadline: number;
  board: string;
  lastMoveFrom: number;
  lastMoveTo: number;
  players: Record<string, PlayerState>;
}

export const TURN_MS_LUDO = 12_000;
export const TURN_MS_CHESS = 60_000;
export const LUDO_HOME = 27;
export const MAX_LUDO_PLAYERS = 2;

export function createEmptyLudoState(inviteRoomId: string, gameId: string): LudoRoomState {
  return {
    inviteRoomId,
    gameId,
    phase: 'waiting',
    message: 'Waiting for opponent…',
    currentTurnSessionId: '',
    winnerSessionId: '',
    dice: 0,
    turnDeadline: 0,
    board: gameId === 'chess' ? '' : '',
    lastMoveFrom: -1,
    lastMoveTo: -1,
    players: {},
  };
}

export function connectedSessionIds(state: LudoRoomState): string[] {
  return Object.keys(state.players).filter((id) => state.players[id]?.connected);
}

export function nextSessionId(state: LudoRoomState, fromSessionId: string): string {
  const ids = connectedSessionIds(state);
  if (ids.length === 0) return '';
  const idx = ids.indexOf(fromSessionId);
  if (idx < 0) return ids[0] || '';
  return ids[(idx + 1) % ids.length] || '';
}

function applyLudoCapture(state: LudoRoomState, moverSessionId: string, newPos: number) {
  if (newPos < 0) return;
  for (const [sid, p] of Object.entries(state.players)) {
    if (sid === moverSessionId || !p.connected) continue;
    if (p.ludoPos === newPos) {
      p.ludoPos = -1;
      state.message = `${state.players[moverSessionId]?.name || 'Player'} captured ${p.name}!`;
    }
  }
}

export function rollLudo(state: LudoRoomState, sessionId: string): LudoRoomState {
  if (state.phase !== 'playing' || state.winnerSessionId) return state;
  if (state.currentTurnSessionId !== sessionId) return state;

  const player = state.players[sessionId];
  if (!player || !player.connected) return state;

  const roll = 1 + Math.floor(Math.random() * 6);
  const next: LudoRoomState = {
    ...state,
    dice: roll,
    players: { ...state.players, [sessionId]: { ...player } },
  };
  const p = next.players[sessionId]!;
  let extraTurn = false;

  if (p.ludoPos < 0) {
    if (roll !== 6) {
      next.message = `${p.name} rolled ${roll} — need 6 to start`;
      return passLudoTurn(next);
    }
    p.ludoPos = 0;
    applyLudoCapture(next, sessionId, 0);
    next.message = `${p.name} rolled 6 and entered!`;
    extraTurn = true;
  } else {
    const target = p.ludoPos + roll;
    if (target > LUDO_HOME) {
      next.message = `${p.name} rolled ${roll} — too far`;
    } else {
      p.ludoPos = target;
      applyLudoCapture(next, sessionId, target);
      next.message = `${p.name} rolled ${roll} → space ${target + 1}`;
      if (p.ludoPos >= LUDO_HOME) {
        next.winnerSessionId = sessionId;
        next.phase = 'finished';
        next.message = `${p.name} wins Ludo! 🎉`;
        next.turnDeadline = 0;
        return next;
      }
    }
    if (roll === 6) extraTurn = true;
  }

  if (extraTurn) {
    next.message = `${p.name} rolled 6 — roll again!`;
    next.turnDeadline = Date.now() + TURN_MS_LUDO;
    return next;
  }

  return passLudoTurn(next);
}

function passLudoTurn(state: LudoRoomState): LudoRoomState {
  const nextId = nextSessionId(state, state.currentTurnSessionId);
  const np = state.players[nextId];
  return {
    ...state,
    currentTurnSessionId: nextId,
    message: np ? `${np.name}'s turn — roll dice` : 'Waiting for opponent…',
    turnDeadline: np ? Date.now() + TURN_MS_LUDO : 0,
  };
}

export function startLudoGame(state: LudoRoomState): LudoRoomState {
  const ids = connectedSessionIds(state);
  const first = ids[0] || '';
  const p = state.players[first];
  return {
    ...state,
    phase: 'playing',
    dice: 0,
    currentTurnSessionId: first,
    message: `${p?.name || 'Player'} rolls first`,
    turnDeadline: Date.now() + TURN_MS_LUDO,
  };
}
