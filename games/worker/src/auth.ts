export interface GameTokenPayload {
  uid: string;
  gameId: string;
  roomId: string;
  opponentUid: string | null;
  name: string | null;
  exp: number;
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToBase64Url(sig);
}

export async function verifyGameSessionToken(
  token: string | null | undefined,
  secret: string
): Promise<GameTokenPayload | null> {
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmacSha256Base64Url(secret, body);
  if (sig !== expected) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
  } catch {
    return null;
  }

  const exp = Number(payload.exp || 0);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;

  return {
    uid: String(payload.uid || ''),
    gameId: String(payload.gameId || '').toLowerCase(),
    roomId: String(payload.roomId || ''),
    opponentUid: payload.opponentUid ? String(payload.opponentUid) : null,
    name: payload.name ? String(payload.name) : null,
    exp,
  };
}
