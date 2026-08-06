import './src/polyfills/setupNativeGlobals.native';
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { Platform, LogBox } from 'react-native';
import { enableScreens } from 'react-native-screens';
import App from './App.js';

LogBox.ignoreLogs([
  /expo-notifications/i,
  'getNotificationListeners.*not available',
]);

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
