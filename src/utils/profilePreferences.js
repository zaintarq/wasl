/**
 * Match preferences live in Settings — not onboarding.
 * Default matching is straight (boys ↔ girls) when no custom prefs are set.
 */

export function hasPreferencesComplete(_profile) {
  return true;
}

export function getOnboardingInitialStep(_profile) {
  return 2;
}

export function normalizeProfileGender(raw) {
  const g = String(raw || '').trim().toLowerCase();
  if (!g) return '';
  if (g === 'male' || g === 'm' || g === 'man' || g === 'boy' || g === 'boys') return 'male';
  if (g === 'female' || g === 'f' || g === 'woman' || g === 'girl' || g === 'girls') return 'female';
  return g;
}

/** Effective "interested in" list; empty profile prefs → straight default from gender. */
export function getEffectiveGenderPreferences(profile) {
  const gp = Array.isArray(profile?.genderPreferences) ? profile.genderPreferences.filter(Boolean) : [];
  if (gp.length > 0) return gp;

  const g = normalizeProfileGender(profile?.gender);
  if (g === 'male') return ['girls'];
  if (g === 'female') return ['boys'];
  return [];
}

export function usesStraightDefaultMatching(profile) {
  const gp = Array.isArray(profile?.genderPreferences) ? profile.genderPreferences : [];
  return gp.length === 0;
}
