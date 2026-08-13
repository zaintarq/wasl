import crypto from 'crypto';

export function getGameSessionSecret(): string {
  return String(process.env.GAME_SESSION_SECRET || '').trim();
}

export interface GameTokenPayload {
  uid: string;
  gameId: string;
  roomId: string;
  opponentUid: string | null;
  name: string | null;
}

export function verifyGameSessionToken(token: unknown): GameTokenPayload | null {
  const secret = getGameSessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig !== expected) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const exp = Number(payload.exp || 0);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;

  return {
    uid: String(payload.uid || ''),
    gameId: String(payload.gameId || ''),
    roomId: String(payload.roomId || ''),
    opponentUid: payload.opponentUid ? String(payload.opponentUid) : null,
    name: payload.name ? String(payload.name) : null,
  };
}
