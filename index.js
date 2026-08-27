import './src/polyfills/setupNativeGlobals.native';
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { Platform, LogBox } from 'react-native';
import { enableScreens } from 'react-native-screens';
import Constants from 'expo-constants';
import App from './App.js';

LogBox.ignoreLogs([
  /expo-notifications/i,
  'getNotificationListeners.*not available',
]);

function reportCrashSafely(payload) {
  try {
    // Lazy require so startup never hard-fails if Firebase is mid-init
    const { privacyAdminService } = require('./src/services/firebaseService');
    privacyAdminService.reportCrash({
      ...payload,
      platform: Platform.OS,
      appVersion:
        Constants.expoConfig?.version ||
        Constants.nativeAppVersion ||
        '',
      osVersion: String(Platform.Version || ''),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

if (typeof global !== 'undefined' && global.ErrorUtils && global.ErrorUtils.getGlobalHandler) {
  try {
    const originalHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      console.error('[Global Error Handler]', {
        error: error?.message || String(error),
        stack: error?.stack,
        isFatal,
        name: error?.name,
      });
      reportCrashSafely({
        message: error?.message || String(error),
        stack: error?.stack || '',
        name: error?.name || 'Error',
        isFatal: Boolean(isFatal),
      });
      if (!isFatal) {
        console.warn('[Global Error Handler] Non-fatal error, continuing...');
        return;
      }
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  } catch (e) {
    console.warn('[Global Error Handler] Failed to set error handler:', e);
  }
}

if (typeof global !== 'undefined') {
  try {
    const originalUnhandledRejection = global.onunhandledrejection;
    global.onunhandledrejection = (event) => {
      console.error('[Unhandled Promise Rejection]', {
        reason: event?.reason,
        message: event?.reason?.message,
        stack: event?.reason?.stack,
      });
      reportCrashSafely({
        message: event?.reason?.message || String(event?.reason || 'Unhandled rejection'),
        stack: event?.reason?.stack || '',
        name: 'UnhandledRejection',
        isFatal: false,
      });
      if (event?.preventDefault) {
        event.preventDefault();
      }
      if (originalUnhandledRejection) {
        originalUnhandledRejection(event);
      }
    };
  } catch (e) {
    console.warn('[Unhandled Rejection Handler] Failed to set handler:', e);
  }
}

if (Platform.OS !== 'web') {
  enableScreens(true);
}

registerRootComponent(App);
