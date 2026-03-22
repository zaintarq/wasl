import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { Platform, LogBox } from 'react-native';
import { enableScreens } from 'react-native-screens';

// Suppress expected warnings for Expo Go compatibility
LogBox.ignoreLogs([
  'expo-notifications.*Expo Go',
  'getNotificationListeners.*not available',
  'Android Push notifications.*removed from Expo Go',
]);

// Global error handler to prevent crashes (ErrorUtils is a global in React Native)
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
      
      // Log but don't crash on non-fatal errors
      if (!isFatal) {
        console.warn('[Global Error Handler] Non-fatal error, continuing...');
        return;
      }
      
      // Call original handler for fatal errors
      if (originalHandler) {
        originalHandler(error, isFatal);
      }
    });
  } catch (e) {
    console.warn('[Global Error Handler] Failed to set error handler:', e);
  }
}

// Handle unhandled promise rejections (if available)
if (typeof global !== 'undefined') {
  try {
    const originalUnhandledRejection = global.onunhandledrejection;
    global.onunhandledrejection = (event) => {
      console.error('[Unhandled Promise Rejection]', {
        reason: event?.reason,
        message: event?.reason?.message,
        stack: event?.reason?.stack,
      });
      // Prevent default crash behavior
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

import App from './App.js';

// Improve navigation performance (native screens). Safe to skip on web.
if (Platform.OS !== 'web') {
  enableScreens(true);
}

// Register the main component
registerRootComponent(App);
