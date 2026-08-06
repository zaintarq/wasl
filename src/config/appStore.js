import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const ANDROID_PACKAGE =
  Constants.expoConfig?.android?.package || Constants.manifest?.android?.package || 'com.huzz.app';

export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

export const PLAY_STORE_MARKET_URL = `market://details?id=${ANDROID_PACKAGE}`;

/** Prefer Play Store app on Android; fall back to web URL. */
export function getPlayStoreOpenUrl(customUrl) {
  const web = String(customUrl || PLAY_STORE_WEB_URL).trim() || PLAY_STORE_WEB_URL;
  if (Platform.OS === 'android') {
    return PLAY_STORE_MARKET_URL;
  }
  return web;
}
