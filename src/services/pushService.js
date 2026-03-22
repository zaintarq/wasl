// Web/JS fallback for push service.
// Native implementation lives in pushService.native.js

export async function registerForPushNotificationsAsync() {
  return { token: null, status: 'undetermined' };
}

export async function sendExpoPushAsync() {
  return { data: null, error: 'Push not supported on this platform.' };
}

