import { schema } from '@colyseus/schema';

/** Shared player fields across chess / ludo / cards rooms. */
export const PlayerSchema = schema({
  uid: 'string',
  name: 'string',
  sessionId: 'string',
  seat: 'number',
  color: 'string',
  handCount: 'number',
  ludoPos: 'number',
  score: 'number',
  connected: 'boolean',
  isBot: 'boolean',
});

export const CardSchema = schema({
  id: 'string',
  rank: 'string',
  suit: 'string',
});

export const ChessRoomState = schema({
  inviteRoomId: 'string',
  phase: 'string',
  message: 'string',
  currentTurnSessionId: 'string',
  winnerSessionId: 'string',
  board: 'string',
  lastMoveFrom: 'number',
  lastMoveTo: 'number',
  turnDeadline: 'number',
  players: { map: PlayerSchema },
});

export const LudoRoomState = schema({
  inviteRoomId: 'string',
  phase: 'string',
  message: 'string',
  currentTurnSessionId: 'string',
  winnerSessionId: 'string',
  dice: 'number',
  turnDeadline: 'number',
  players: { map: PlayerSchema },
});

export const CardsPlayerSchema = schema({
  uid: 'string',
  name: 'string',
  sessionId: 'string',
  seat: 'number',
  score: 'number',
  connected: 'boolean',
  isBot: 'boolean',
  hand: { array: CardSchema, view: true },
  handCount: 'number',
});

export const CardsRoomState = schema({
  inviteRoomId: 'string',
  phase: 'string',
  message: 'string',
  currentTurnSessionId: 'string',
  winnerSessionId: 'string',
  round: 'number',
  tableCardA: 'string',
  tableCardB: 'string',
  turnDeadline: 'number',
  players: { map: CardsPlayerSchema },
});

export type ChessRoomStateType = InstanceType<typeof ChessRoomState>;
export type LudoRoomStateType = InstanceType<typeof LudoRoomState>;
export type CardsRoomStateType = InstanceType<typeof CardsRoomState>;
export type PlayerType = InstanceType<typeof PlayerSchema>;
export type CardsPlayerType = InstanceType<typeof CardsPlayerSchema>;
export type CardType = InstanceType<typeof CardSchema>;
