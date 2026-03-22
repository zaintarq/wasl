import * as Location from 'expo-location';

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
      return { country: '', city: '', permission, error: null };
    }

    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const geos = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const geo = geos?.[0] || null;

    const country = clean(geo?.country);
    const city = pickCity(geo);

    return { country, city, permission: 'granted', error: null };
  } catch (e) {
    // Never block UX on location errors.
    return { country: '', city: '', permission: 'undetermined', error: e?.message || String(e) };
  }
}

