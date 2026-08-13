/**
 * Smoke test — Colyseus 0.17 + chess move sync.
 * Run: npm run games:smoke (server must be running)
 */
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const require = createRequire(path.join(__dirname, '..', 'client', 'package.json'));
const { Client } = require('@colyseus/sdk');

function toHttpEndpoint(wsUrl) {
  return String(wsUrl || '')
    .replace(/^wss:\/\//i, 'https://')
    .replace(/^ws:\/\//i, 'http://')
    .replace(/\/+$/, '');
}

const SECRET = process.env.GAME_SESSION_SECRET || 'test-secret-for-smoke';

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

async function main() {
  const wsUrl = process.env.COLYSEUS_WS_URL || 'ws://127.0.0.1:2567';
  const endpoint = toHttpEndpoint(wsUrl);
  const roomId = crypto.randomBytes(4).toString('hex');
  const exp = Math.floor(Date.now() / 1000) + 600;

  const clientA = new Client(endpoint);
  const clientB = new Client(endpoint);

  const tokenA = signToken({ uid: 'user-a', gameId: 'chess', roomId, exp, name: 'Alice' });
  const tokenB = signToken({ uid: 'user-b', gameId: 'chess', roomId, exp, name: 'Bob' });

  const roomA = await clientA.joinOrCreate('chess', {
    inviteRoomId: roomId,
    token: tokenA,
    uid: 'user-a',
    name: 'Alice',
  });

  const roomB = await clientB.joinOrCreate('chess', {
    inviteRoomId: roomId,
    token: tokenB,
    uid: 'user-b',
    name: 'Bob',
  });

  await new Promise((r) => setTimeout(r, 300));

  if (roomA.state.phase !== 'playing') {
    throw new Error(`Expected playing phase, got ${roomA.state.phase}`);
  }

  roomA.send('move', { from: 52, to: 36 });
  await new Promise((r) => setTimeout(r, 300));

  if (roomB.state.board[36] !== 'P') {
    throw new Error('Move did not sync to player B');
  }

  console.log('✅ Smoke test passed — Colyseus 0.17 chess move synced');
  await roomA.leave();
  await roomB.leave();
}

main().catch((err) => {
  console.error('❌ Smoke test failed:', err.message);
  process.exit(1);
});
