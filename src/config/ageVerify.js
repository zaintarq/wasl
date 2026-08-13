import Constants from 'expo-constants';
import { AGE_VERIFY_HTML } from '../assets/ageVerifyHtml';

const DEFAULT_AUDIENCE = 'https://zaintarq.github.io';
const DEFAULT_HOSTED_PAGE =
  'https://us-central1-huzz-10264.cloudfunctions.net/ageVerifyPage';
/** Official ZoiVera API (see https://zoivera.zoitra.com/docs) */
export const ZOIVERA_API_BASE =
  'https://wlctyycddctuxhnhtdug.supabase.co/functions/v1';

const FALLBACK_ZOIVERA_KEY =
  'zv_live_fa30721874e3df857d948e2d9a3d580bb94ae7585b2028da4f09662aaa54988a';

export function getZoiVeraApiKey() {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_ZOIVERA_API_KEY === 'string'
      ? process.env.EXPO_PUBLIC_ZOIVERA_API_KEY.trim()
      : '';
  const fromExtra = String(Constants.expoConfig?.extra?.zoiVeraApiKey || '').trim();
  return fromEnv || fromExtra || FALLBACK_ZOIVERA_KEY;
}

export function getZoiVeraAudience() {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_ZOIVERA_AUDIENCE === 'string'
      ? process.env.EXPO_PUBLIC_ZOIVERA_AUDIENCE.trim()
      : '';
  const fromExtra = String(Constants.expoConfig?.extra?.zoiVeraAudience || '').trim();
  return fromEnv || fromExtra || DEFAULT_AUDIENCE;
}

export function getAgeVerifyHostedUrl(uid) {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_AGE_VERIFY_HOST_URL === 'string'
      ? process.env.EXPO_PUBLIC_AGE_VERIFY_HOST_URL.trim()
      : '';
  const fromExtra = String(Constants.expoConfig?.extra?.ageVerifyHostUrl || '').trim();
  const base = (fromEnv || fromExtra || DEFAULT_HOSTED_PAGE).replace(/\/$/, '');
  const id = String(uid || '').trim();
  return `${base}?uid=${encodeURIComponent(id)}&t=${Date.now()}`;
}

export function buildAgeVerifyHtml() {
  return AGE_VERIFY_HTML;
}

export { AGE_VERIFY_HTML };
