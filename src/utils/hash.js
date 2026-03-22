export async function sha256(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return '';

  // Web: use SubtleCrypto if available
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(s);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback (non-cryptographic): deterministic hash to avoid breaking builds
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16)}`;
}





