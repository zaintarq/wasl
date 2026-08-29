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
  players: Record<string, PlayerState>;
}

export const TURN_MS_LUDO = 12_000;
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
    board: '',
    players: {},
  };
}

export function nextSessionId(state: LudoRoomState, fromSessionId: string): string {
  const ids = Object.keys(state.players);
  const idx = ids.indexOf(fromSessionId);
  if (idx < 0) return ids[0] || '';
  return ids[(idx + 1) % ids.length] || '';
}

export function rollLudo(state: LudoRoomState, sessionId: string): LudoRoomState {
  if (state.phase !== 'playing' || state.winnerSessionId) return state;
  if (state.currentTurnSessionId !== sessionId) return state;

  const player = state.players[sessionId];
  if (!player) return state;

  const roll = 1 + Math.floor(Math.random() * 6);
  const next: LudoRoomState = {
    ...state,
    dice: roll,
    players: { ...state.players, [sessionId]: { ...player } },
  };
  const p = next.players[sessionId]!;

  if (p.ludoPos < 0) {
    if (roll !== 6) {
      next.message = `${p.name} rolled ${roll} — need 6 to start`;
      return passLudoTurn(next);
    }
    p.ludoPos = 0;
    next.message = `${p.name} rolled 6 and entered!`;
  } else {
    const target = p.ludoPos + roll;
    if (target > LUDO_HOME) {
      next.message = `${p.name} rolled ${roll} — too far`;
    } else {
      p.ludoPos = target;
      next.message = `${p.name} rolled ${roll} → space ${target + 1}`;
      if (p.ludoPos >= LUDO_HOME) {
        next.winnerSessionId = sessionId;
        next.phase = 'finished';
        next.message = `${p.name} wins Ludo! 🎉`;
        next.turnDeadline = 0;
        return next;
      }
    }
  }

  return passLudoTurn(next);
}

function passLudoTurn(state: LudoRoomState): LudoRoomState {
  const nextId = nextSessionId(state, state.currentTurnSessionId);
  const np = state.players[nextId];
  return {
    ...state,
    currentTurnSessionId: nextId,
    message: `${np?.name || 'Opponent'}'s turn — roll dice`,
    turnDeadline: Date.now() + TURN_MS_LUDO,
  };
}

export function startLudoGame(state: LudoRoomState): LudoRoomState {
  const ids = Object.keys(state.players);
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
