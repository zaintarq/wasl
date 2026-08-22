/** NSFWJS thresholds — keep in sync with functions/index.js */
export const NSFW_THRESHOLD = 0.6;
/** Bikini/suggestive content often scores 0.4–0.55 on Sexy — block below full NSFW bar. */
export const NSFW_SEXY_THRESHOLD = 0.45;

/** Live video: scan remote tile every N ms (CPU inference is ~200–800ms). */
export const NSFW_VIDEO_SCAN_MS = 2800;

/** Require this many consecutive hits before auto-skip (reduces false positives). */
export const NSFW_VIDEO_CONSECUTIVE_HITS = 2;

/** Resize captured frames before classify (NSFWJS MobileNet expects ~224–299). */
export const NSFW_CAPTURE_WIDTH = 224;
export const NSFW_CAPTURE_HEIGHT = 224;

export const NSFW_CLASSES = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
