import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@huzz_local_filters_v1';

/**
 * Hot Seat + Tonight Mode are not stored in Firestore; persist when leaving Filters screen
 * so HomeScreen can restore after navigation / swipe back.
 */
export async function saveLocalFilters(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[localFilterStorage] save failed:', e?.message || e);
  }
}

export async function loadLocalFilters() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[localFilterStorage] load failed:', e?.message || e);
    return null;
  }
}
