/**
 * OS-level screenshot / screen recording protection in sync with navigation.
 * On Android (FLAG_SECURE) and supported iOS versions, captures show as black (Netflix-style).
 */
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Routes } from '../app/navigation/routes';
import { isStoreScreenshotModeActive } from './storeScreenshotMode';

const KEY = 'huzz-sensitive-routes';

let active = false;

function isSensitiveNavigationState(state) {
  const route = state?.routes?.[state?.index];
  const name = route?.name;
  if (name === Routes.TabHome || name === Routes.TabMatches || name === Routes.TabLive) {
    return true;
  }
  if (name === Routes.ChatThread) {
    return true;
  }
  const nested = route?.state;
  if (nested?.routes?.length) {
    const nestedRoute = nested.routes[nested.index ?? nested.routes.length - 1];
    if (nestedRoute?.name === Routes.ChatThread) {
      return true;
    }
  }
  return false;
}

/**
 * Call from NavigationContainer `onStateChange` and `onReady` with root state.
 */
export function syncScreenCaptureToNavigationState(state) {
  if (Platform.OS === 'web') return;

  if (isStoreScreenshotModeActive()) {
    if (active) {
      active = false;
      ScreenCapture.allowScreenCaptureAsync(KEY).catch(() => {});
    }
    return;
  }

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
