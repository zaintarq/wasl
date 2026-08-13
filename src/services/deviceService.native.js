import { Platform, Dimensions } from 'react-native';
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

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export async function getDeviceHash() {
  const raw = await getDeviceId();
  if (!raw) return '';
  return await sha256(`device:${raw}`);
}

/** Rich device + network snapshot for admin moderation and device bans. */
export async function collectDeviceSnapshot() {
  const deviceId = await getDeviceId();
  const deviceHash = deviceId ? await sha256(`device:${deviceId}`) : '';
  const { width, height } = Dimensions.get('window');
  const model =
    Platform.OS === 'android'
      ? String(Platform.constants?.Model || Platform.constants?.model || 'Android')
      : String(Platform.constants?.systemName || 'iOS');

  let ipData = { ipAddress: '', country: '', city: '', region: '' };

  const parts = [
    deviceId,
    Platform.OS,
    String(Platform.Version),
    model,
    `${width}x${height}`,
    getTimezone(),
    ipData.ipAddress || '',
  ];
  const fingerprintHash = await sha256(`fp:${parts.join('|')}`);

  return {
    deviceHash,
    fingerprintHash,
    platform: Platform.OS,
    osVersion: String(Platform.Version || ''),
    appVersion: String(Application.nativeApplicationVersion || ''),
    model,
    screenWidth: width,
    screenHeight: height,
    timezone: getTimezone(),
    publicIp: ipData.ipAddress || '',
    ipCountry: ipData.country || '',
    ipCity: ipData.city || '',
    ipRegion: ipData.region || '',
    collectedAt: new Date().toISOString(),
  };
}
