import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { defineServer, defineRoom } from 'colyseus';
import { ChessRoom } from './rooms/ChessRoom.js';
import { LudoRoom } from './rooms/LudoRoom.js';
import { CardsRoom } from './rooms/CardsRoom.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

export default defineServer({
  rooms: {
    chess: defineRoom(ChessRoom).filterBy(['inviteRoomId']),
    ludo: defineRoom(LudoRoom).filterBy(['inviteRoomId']),
    cards: defineRoom(CardsRoom).filterBy(['inviteRoomId']),
  },
  express: (app) => {
    app.use(
      cors({
        origin: true,
        credentials: true,
      })
    );
    app.get('/health', (_req, res) => {
      res.json({ ok: true, service: 'huzz-games', colyseus: '0.17' });
    });
    app.use(express.static(publicDir));
  },
});
