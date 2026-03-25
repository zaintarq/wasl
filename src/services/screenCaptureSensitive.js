/**
 * OS-level screenshot / screen recording protection in sync with navigation.
 * On Android (FLAG_SECURE) and supported iOS versions, captures show as black (Netflix-style).
 */
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Routes } from '../app/navigation/routes';

const KEY = 'huzz-sensitive-routes';

let active = false;

function isSensitiveNavigationState(state) {
  const route = state?.routes?.[state?.index];
  const name = route?.name;
  return (
    name === Routes.TabHome ||
    name === Routes.TabMatches ||
    name === Routes.ChatThread
  );
}

/**
 * Call from NavigationContainer `onStateChange` and `onReady` with root state.
 */
export function syncScreenCaptureToNavigationState(state) {
  if (Platform.OS === 'web') return;

  const shouldProtect = isSensitiveNavigationState(state);

  if (shouldProtect && !active) {
    active = true;
    ScreenCapture.preventScreenCaptureAsync(KEY).catch(() => {});
  } else if (!shouldProtect && active) {
    active = false;
    ScreenCapture.allowScreenCaptureAsync(KEY).catch(() => {});
  }
}

/** Release when navigation container unmounts (e.g. full logout). */
export function releaseScreenCaptureNavigation() {
  if (Platform.OS === 'web') return;
  if (!active) return;
  active = false;
  ScreenCapture.allowScreenCaptureAsync(KEY).catch(() => {});
}
