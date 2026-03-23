/**
 * Religion, gender, and who you want to match with must be set before the profile is usable.
 * Muslim: genderPreferences auto-filled to opposite sex; still stored as non-empty array.
 */
export function hasPreferencesComplete(profile) {
  if (!profile || typeof profile !== 'object') return false;
  const religion = String(profile.religion || '').trim();
  if (!religion) return false;
  const gender = String(profile.gender || '').trim();
  if (!gender) return false;
  const gp = Array.isArray(profile.genderPreferences) ? profile.genderPreferences : [];
  if (gp.length === 0) return false;
  return true;
}

/**
 * Onboarding only for missing preferences (step 3). Photos / interests are completed from Profile.
 */
export function getOnboardingInitialStep(profile) {
  if (!hasPreferencesComplete(profile)) return 3;
  return 2;
}
