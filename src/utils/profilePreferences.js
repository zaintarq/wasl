/**
 * Discovery preferences live in Settings — not onboarding.
 * Default discovery is men ↔ women when no custom prefs are set.
 */

export function hasPreferencesComplete(_profile) {
  return true;
}

export function getOnboardingInitialStep(_profile) {
  return 2;
}

/** Effective "connect with" list; empty profile prefs → default from gender. */
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
