import { Alert } from 'react-native';
import { Routes } from '../app/navigation/routes';

const verifiedSessionUids = new Set();

/** Remember a successful gate for this app session (avoids re-scan loops after Firestore lag). */
export function markAgeVerifiedSession(userId) {
  if (userId) verifiedSessionUids.add(String(userId));
}

/**
 * ZoiVera 18+ face scan (`ageChecked18Plus`) or HUZZ badge (`isVerified`) both unlock chat.
 */
export function hasPassedAgeCheck(profile) {
  const uid = profile?.uid || profile?.id;
  if (uid && verifiedSessionUids.has(String(uid))) return true;
  if (profile?.ageChecked18Plus === true) return true;
  if (profile?.isVerified === true) return true;
  return false;
}

export function shouldSkipAgeCheck(profile, roleCheck) {
  if (roleCheck?.isAdmin || roleCheck?.isStaff) return true;
  if (String(profile?.role || '').toLowerCase() === 'wali') return true;
  return false;
}

function openAgeCheck(nav) {
  if (nav?.navigate) {
    nav.navigate(Routes.AgeCheck);
    return;
  }
  if (typeof nav === 'function') {
    nav('ageCheck');
  }
}

export function promptAgeCheckRequired(nav) {
  Alert.alert(
    '18+ verification required',
    'Verify your age once with a quick in-app face scan to use likes, matches, chat, live, and clubs.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Verify now', onPress: () => openAgeCheck(nav) },
    ]
  );
}

/** Sync gate — pass profile=null while loading (do not redirect). */
export function blockIfAgeNotVerified(profile, nav, roleCheck) {
  if (shouldSkipAgeCheck(profile, roleCheck)) return false;
  if (profile == null) return false;
  if (hasPassedAgeCheck(profile)) return false;
  openAgeCheck(nav);
  return true;
}

/** Re-fetch Firestore profile before blocking (fixes stale cache after face scan). */
export async function blockIfAgeNotVerifiedAsync(profile, nav, roleCheck, userId, getUserById) {
  if (shouldSkipAgeCheck(profile, roleCheck)) {
    return { blocked: false, profile };
  }
  if (hasPassedAgeCheck(profile)) {
    markAgeVerifiedSession(userId);
    return { blocked: false, profile };
  }

  let fresh = profile;
  if (userId && typeof getUserById === 'function') {
    try {
      const res = await getUserById(userId);
      if (res?.data) fresh = res.data;
    } catch {
      /* use cached profile */
    }
  }

  if (hasPassedAgeCheck(fresh)) {
    markAgeVerifiedSession(userId);
    return { blocked: false, profile: fresh };
  }

  openAgeCheck(nav);
  return { blocked: true, profile: fresh };
}
