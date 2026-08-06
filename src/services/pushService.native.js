import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

// Configure notification handler for in-app notifications (dev / standalone builds)
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Register for push notifications
 * Works in both Expo Go and dev builds
 */
export async function registerForPushNotificationsAsync() {
  if (isExpoGo) {
    return { token: null, status: 'expo_go', error: null };
  }
  try {
    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    // Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: false,
        },
      });
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted:', finalStatus);
      return { token: null, status: finalStatus };
    }

    // Set up Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'HUZZ Notifications',
        description: 'Notifications for chats, messages, and updates',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    // Get project ID - works in Expo Go (uses @anonymous/huzz) and dev builds
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId ||
      Constants?.manifest2?.extra?.eas?.projectId ||
      undefined;

    // Get Expo push token
    // In Expo Go, this works without projectId (uses @anonymous/huzz)
    // In dev builds, projectId is required
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    
    const token = tokenData?.data;
    
    if (!token) {
      console.warn('[Push] No token received');
      return { token: null, status: finalStatus, error: 'No token received' };
    }

    console.log('[Push] Token registered:', token.substring(0, 20) + '...');
    return { token, status: 'granted' };
  } catch (e) {
    console.error('[Push] Registration error:', e);
    return { token: null, status: 'undetermined', error: e?.message || String(e) };
  }
}

/**
 * Send push notification via Expo Push API
 * Works in both Expo Go and dev builds
 */
export async function sendExpoPushAsync({ to, title, body, data, sound = 'default' }) {
  try {
    if (!to) {
      return { data: null, error: 'Missing push token.' };
    }

    const payload = {
      to,
      sound,
      title: String(title || ''),
      body: String(body || ''),
      data: data || {},
      badge: 1, // Set badge count
      priority: 'high',
      channelId: Platform.OS === 'android' ? 'default' : undefined,
    };

    console.log('[Push] Sending notification:', { to: to.substring(0, 20) + '...', title, body });

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[Push] Send failed:', res.status, errorText);
      return { data: null, error: `HTTP ${res.status}: ${errorText}` };
    }

    const json = await res.json();
    
    // Check for errors in response
    if (json.data && json.data.status === 'error') {
      console.error('[Push] Expo API error:', json.data.message);
      return { data: null, error: json.data.message || 'Push send failed' };
    }

    console.log('[Push] Notification sent successfully');
    return { data: json, error: null };
  } catch (e) {
    console.error('[Push] Send error:', e);
    return { data: null, error: e?.message || String(e) };
  }
}

/**
 * Get notification listeners for in-app handling
 */
export function getNotificationListeners() {
  return {
    // Listen for notifications received while app is foregrounded
    addNotificationReceivedListener: (listener) => {
      return Notifications.addNotificationReceivedListener(listener);
    },
    // Listen for user tapping on a notification
    addNotificationResponseReceivedListener: (listener) => {
      return Notifications.addNotificationResponseReceivedListener(listener);
    },
  };
}

/**
 * Set badge count (iOS only)
 */
export async function setBadgeCountAsync(count) {
  if (Platform.OS === 'ios') {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (e) {
      console.warn('[Push] Failed to set badge:', e);
    }
  }
}

/**
 * Clear all notifications
 */
export async function dismissAllNotificationsAsync() {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (e) {
    console.warn('[Push] Failed to dismiss notifications:', e);
  }
}
