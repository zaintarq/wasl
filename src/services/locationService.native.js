import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

function clean(v) {
  return String(v || '').trim();
}

function pickCity(geo) {
  if (!geo) return '';
  return (
    clean(geo.city) ||
    clean(geo.subregion) ||
    clean(geo.district) ||
    clean(geo.region) ||
    ''
  );
}

export async function getLocationPermissionStatus() {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    return {
      status: perm?.status || 'undetermined',
      canAskAgain: perm?.canAskAgain !== false,
      granted: perm?.status === 'granted',
    };
  } catch {
    return { status: 'undetermined', canAskAgain: true, granted: false };
  }
}

/** Request foreground location — required to use Huzz. */
export async function requestForegroundLocationPermission() {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    return {
      status: perm?.status || 'undetermined',
      canAskAgain: perm?.canAskAgain !== false,
      granted: perm?.status === 'granted',
    };
  } catch (e) {
    return { status: 'denied', canAskAgain: false, granted: false, error: e?.message || String(e) };
  }
}

export function openAppSettings() {
  if (Platform.OS === 'ios') Linking.openURL('app-settings:');
  else Linking.openSettings();
}

/**
 * Request (or re-check) foreground location permission and reverse-geocode to country/city.
 * - Never returns coordinates (privacy).
 */
export async function detectCountryCity({ requestPermission = true } = {}) {
  try {
    const perm = requestPermission
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();

    const status = perm?.status || 'undetermined';
    const permission =
      status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';

    if (permission !== 'granted') {
      return { country: '', city: '', permission, canAskAgain: perm?.canAskAgain !== false, error: null };
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const geos = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const geo = geos?.[0] || null;

    const country = clean(geo?.country);
    const city = pickCity(geo);

    return { country, city, permission: 'granted', canAskAgain: true, error: null };
  } catch (e) {
    return {
      country: '',
      city: '',
      permission: 'undetermined',
      canAskAgain: true,
      error: e?.message || String(e),
    };
  }
}
