import { classifyImageUri, topPredictionLabel } from '../services/nsfwScanner.native';

/**
 * Client-side gate before uploading profile/story images.
 * Server still runs moderateProfileImage as a second layer.
 * If the on-device scan fails, allow upload (soft fail) rather than blocking the user.
 */
export async function gateImageBeforeUpload(uri) {
  const { predictions, nsfw, error } = await classifyImageUri(uri);

  if (error) {
    if (__DEV__) {
      console.warn('[NSFW gate] Scan skipped:', error);
    }
    return {
      allowed: true,
      blocked: false,
      predictions,
      message: null,
      scanError: error,
      scanSkipped: true,
    };
  }

  if (nsfw) {
    const label = topPredictionLabel(predictions);
    return {
      allowed: false,
      blocked: true,
      predictions,
      message: `This photo looks inappropriate (${label}). Please choose a different image.`,
      scanError: null,
    };
  }

  return { allowed: true, blocked: false, predictions, scanError: null, scanSkipped: false };
}
