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

/** Effective "interested in" list; empty profile prefs → straight default from gender. */
export function getEffectiveGenderPreferences(profile) {
  const gp = Array.isArray(profile?.genderPreferences) ? profile.genderPreferences.filter(Boolean) : [];
  if (gp.length > 0) return gp;

  const g = String(profile?.gender || '').trim().toLowerCase();
  if (g === 'male') return ['girls'];
  if (g === 'female') return ['boys'];
  return [];
}

export function usesStraightDefaultMatching(profile) {
  const gp = Array.isArray(profile?.genderPreferences) ? profile.genderPreferences : [];
  return gp.length === 0;
}
