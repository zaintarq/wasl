import Constants from 'expo-constants';

/**
 * Public LiveKit WebSocket URL (from .env EXPO_PUBLIC_LIVEKIT_URL or app.config extra).
 * API key/secret must not be imported in native UI — use a callable to mint room tokens.
 */
export function getLiveKitWsUrl() {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_LIVEKIT_URL === 'string' ? process.env.EXPO_PUBLIC_LIVEKIT_URL.trim() : '';
  const fromExtra = String(Constants.expoConfig?.extra?.liveKitUrl || '').trim();
  return fromEnv || fromExtra;
}
