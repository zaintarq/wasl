import * as Contacts from 'expo-contacts';
import { Linking } from 'react-native';

export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}

export async function getContactsPermissionStatus() {
  try {
    const perm = await Contacts.getPermissionsAsync();
    return {
      granted: perm.status === 'granted',
      canAskAgain: perm.canAskAgain !== false,
      status: perm.status,
    };
  } catch {
    return { granted: false, canAskAgain: true, status: 'undetermined' };
  }
}

export async function requestContactsPermission() {
  const perm = await Contacts.requestPermissionsAsync();
  return {
    granted: perm.status === 'granted',
    canAskAgain: perm.canAskAgain !== false,
    status: perm.status,
  };
}
