import Constants from 'expo-constants';

/** Public URL where Phaser games are hosted (Colyseus server serves the built client). */
export function getGamesClientUrl() {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_GAMES_CLIENT_URL === 'string'
      ? process.env.EXPO_PUBLIC_GAMES_CLIENT_URL.trim()
      : '';
  const fromExtra = String(Constants.expoConfig?.extra?.gamesClientUrl || '').trim();
  return fromEnv || fromExtra;
}

/** WebSocket URL for Colyseus (optional override; games page defaults to same host). */
export function getColyseusWsUrl() {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_COLYSEUS_WS_URL === 'string'
      ? process.env.EXPO_PUBLIC_COLYSEUS_WS_URL.trim()
      : '';
  const fromExtra = String(Constants.expoConfig?.extra?.colyseusWsUrl || '').trim();
  return fromEnv || fromExtra;
}
