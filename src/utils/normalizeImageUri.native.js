import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Convert camera-roll URIs (HEIC/PNG/etc.) to JPEG for upload.
 */
export async function normalizeImageUriForUpload(uri) {
  const src = String(uri || '').trim();
  if (!src) throw new Error('Missing image URI');

  const result = await ImageManipulator.manipulateAsync(src, [], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  if (!result?.uri) throw new Error('Could not prepare image for upload');
  return result.uri;
}
