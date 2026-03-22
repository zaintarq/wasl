import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { sha256 } from '../utils/hash';

async function getDeviceId() {
  try {
    if (Platform.OS === 'ios') {
      const v = await Application.getIosIdForVendorAsync();
      return String(v || '');
    }
    if (Platform.OS === 'android') {
      return String(Application.androidId || '');
    }
    return '';
  } catch {
    return '';
  }
}

export async function getDeviceHash() {
  const raw = await getDeviceId();
  if (!raw) return '';
  return await sha256(`device:${raw}`);
}

