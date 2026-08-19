/** Parse Mehram invite token from app deep link or hosted web URL. */
export function parseMehramTokenFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const looksLikeMehram =
    /^huzz:\/\/mehram/i.test(raw) ||
    /\/mehram(?:\.html)?(?:\?|#|$)/i.test(raw) ||
    (/mehram/i.test(raw) && /[?&#]t=/i.test(raw));

  if (!looksLikeMehram) return null;

  try {
    const normalized = raw.includes('://') ? raw : `huzz://mehram?${raw.replace(/^\?/, '')}`;
    const parsed = new URL(normalized);
    const host = String(parsed.hostname || parsed.host || '').toLowerCase();
    const path = String(parsed.pathname || '').toLowerCase();

    const isMehramLink =
      (parsed.protocol === 'huzz:' && host === 'mehram') ||
      path.endsWith('/mehram') ||
      path.endsWith('/mehram.html');

    if (!isMehramLink) return null;

    const t = parsed.searchParams.get('t');
    if (t) return String(t).trim();

    const hash = String(parsed.hash || '').replace(/^#/, '');
    if (hash.startsWith('t=')) return decodeURIComponent(hash.slice(2)).trim();
  } catch {
    /* fall through */
  }

  const qMatch = raw.match(/[?&#]t=([^&#]+)/i);
  return qMatch ? decodeURIComponent(qMatch[1]).trim() : null;
}

export function isMehramInviteUrl(url) {
  return !!parseMehramTokenFromUrl(url);
}
