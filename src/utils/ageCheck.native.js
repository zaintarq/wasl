import { Alert } from 'react-native';
import { Routes } from '../app/navigation/routes';

export function hasPassedAgeCheck(profile) {
  return profile?.ageChecked18Plus === true;
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

export function blockIfAgeNotVerified(profile, nav, roleCheck) {
  if (shouldSkipAgeCheck(profile, roleCheck)) return false;
  if (hasPassedAgeCheck(profile)) return false;
  promptAgeCheckRequired(nav);
  return true;
}
