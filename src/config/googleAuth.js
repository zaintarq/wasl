import Constants from 'expo-constants';

/** Public OAuth client IDs (same as app.json). Safe to ship in the app bundle. */
const DEFAULT_GOOGLE_AUTH = {
  iosClientId: '19254029866-oeiorhatafeooe1pphck4ftikl82ndb6.apps.googleusercontent.com',
  androidClientId: '19254029866-cc9eslb2sgrlelri0leqo1q0dje4qof5.apps.googleusercontent.com',
  webClientId: '19254029866-jiled6i3aoom1ih9jgdj1f3k39h04t7h.apps.googleusercontent.com',
};

function readExtraGoogleAuth() {
  const extra =
    Constants.expoConfig?.extra ||
    Constants.manifest?.extra ||
    Constants.manifest2?.extra?.expoClient?.extra ||
    {};
  return extra.googleAuth && typeof extra.googleAuth === 'object' ? extra.googleAuth : {};
}

/**
 * Google OAuth client IDs for expo-auth-session.
 * Expo Go often omits custom `extra` from Constants — defaults keep auth from crashing.
 */
export function getGoogleAuthConfig() {
  const fromExtra = readExtraGoogleAuth();
  const fromEnv = {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  };

  return {
    ...DEFAULT_GOOGLE_AUTH,
    ...Object.fromEntries(Object.entries(fromEnv).filter(([, v]) => typeof v === 'string' && v.trim())),
    ...Object.fromEntries(Object.entries(fromExtra).filter(([, v]) => typeof v === 'string' && v.trim())),
  };
}
