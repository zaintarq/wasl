import { classifyImageUri, topPredictionLabel } from '../services/nsfwScanner.native';

/**
 * Client-side gate before uploading profile/story images.
 * Server still runs moderateProfileImage as a second layer.
 */
export async function gateImageBeforeUpload(uri) {
  const { predictions, nsfw, error } = await classifyImageUri(uri);

  if (error) {
    return {
      allowed: false,
      blocked: true,
      predictions,
      message: 'Safety scan unavailable. Connect to the internet and try again.',
      scanError: error,
    };
  }

  if (nsfw) {
    const label = topPredictionLabel(predictions);
    return {
      allowed: false,
      blocked: true,
      predictions,
      message: `This photo looks inappropriate (${label}). Please choose a different image.`,
    };
  }

  return { allowed: true, blocked: false, predictions, scanError: null };
}
