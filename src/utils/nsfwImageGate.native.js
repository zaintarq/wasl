import { classifyImageUri, topPredictionLabel } from '../services/nsfwScanner.native';

/**
 * Client-side gate before uploading profile/story images.
 * @param {string} uri
 * @param {{ strict?: boolean }} [opts] — strict=true blocks when scan fails (stories).
 */
export async function gateImageBeforeUpload(uri, opts = {}) {
  const strict = opts.strict === true;
  const { predictions, nsfw, error } = await classifyImageUri(uri);

  if (error) {
    if (__DEV__) {
      console.warn('[NSFW gate] Scan skipped:', error);
    }
    if (strict) {
      return {
        allowed: false,
        blocked: true,
        predictions,
        message: "We couldn't verify this photo. Try again or choose a different image.",
        scanError: error,
        scanSkipped: true,
      };
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
