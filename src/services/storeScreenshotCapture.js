import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureScreen } from 'react-native-view-shot';

function slugify(label) {
  return String(label || 'screen')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'screen';
}

export async function captureAppScreenshot(label) {
  const uri = await captureScreen({
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });
  const filename = `wasl-${slugify(label)}-${Date.now()}.png`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function saveScreenshotToPhotos(uri) {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library permission is required to save screenshots.');
  }
  return MediaLibrary.createAssetAsync(uri);
}

export async function shareScreenshot(uri) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
}
