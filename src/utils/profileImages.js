/**
 * Normalize profile photo storage: Firestore may store `images` as string URLs
 * or legacy `{ url, uri, downloadURL }` objects.
 */

function normalizeImageUrl(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : '';
  }
  if (typeof value === 'object') {
    const u =
      value.url ||
      value.uri ||
      value.downloadURL ||
      value.src ||
      value.photoURL ||
      '';
    return typeof u === 'string' && u.trim().length > 0 ? u.trim() : '';
  }
  return '';
}

/**
 * Returns non-empty image URL strings for the current user profile.
 */
export function getProfileImageUrls(profile) {
  if (!profile || typeof profile !== 'object') return [];

  const urls = [];

  if (Array.isArray(profile.images)) {
    for (const img of profile.images) {
      const u = normalizeImageUrl(img);
      if (u) urls.push(u);
    }
  }

  // Legacy / single-field fallbacks
  for (const key of ['image', 'photoUrl', 'profileImage', 'avatarUrl', 'photo']) {
    const u = normalizeImageUrl(profile[key]);
    if (u) urls.push(u);
  }

  return urls;
}

/** At least one photo required to swipe (others optional). */
export function hasAtLeastOneProfilePhoto(profile) {
  return getProfileImageUrls(profile).length >= 1;
}
