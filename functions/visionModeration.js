/**
 * Google Cloud Vision Safe Search — explicit / racy content detection.
 * Requires Vision API enabled on the Firebase/GCP project.
 */
const vision = require('@google-cloud/vision');

let clientPromise = null;

function getVisionClient() {
  if (!clientPromise) {
    clientPromise = Promise.resolve(new vision.ImageAnnotatorClient());
  }
  return clientPromise;
}

/** Block revealing swimwear / suggestive content (bikini, etc.). */
const RACY_BLOCK_LEVELS = new Set(['POSSIBLE', 'LIKELY', 'VERY_LIKELY']);

/** Block explicit nudity — slightly stricter than racy alone. */
const ADULT_BLOCK_LEVELS = new Set(['POSSIBLE', 'LIKELY', 'VERY_LIKELY']);

const MODERATED_PREFIXES = ['images/', 'stories/', 'gallery/'];

const BLOCKED_USER_MESSAGE =
  'This photo is not allowed. Please choose a modest, appropriate photo.';

function isModeratedStoragePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return MODERATED_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function userIdFromModeratedPath(filePath) {
  const parts = String(filePath || '').split('/');
  return parts.length >= 2 ? parts[1] : null;
}

function isBlockedSafeSearch(annotation) {
  if (!annotation) return true;
  const adult = String(annotation.adult || 'UNKNOWN');
  const racy = String(annotation.racy || 'UNKNOWN');
  return ADULT_BLOCK_LEVELS.has(adult) || RACY_BLOCK_LEVELS.has(racy);
}

function formatSafeSearchLog(annotation) {
  if (!annotation) return 'no annotation';
  return `adult=${annotation.adult} racy=${annotation.racy} violence=${annotation.violence}`;
}

async function safeSearchFromBuffer(imageBuffer) {
  const client = await getVisionClient();
  const [result] = await client.safeSearchDetection({ image: { content: imageBuffer } });
  return result?.safeSearchAnnotation || null;
}

module.exports = {
  safeSearchFromBuffer,
  isBlockedSafeSearch,
  formatSafeSearchLog,
  isModeratedStoragePath,
  userIdFromModeratedPath,
  BLOCKED_USER_MESSAGE,
};
