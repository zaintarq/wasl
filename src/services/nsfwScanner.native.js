/**
 * On-device NSFWJS scanner (TensorFlow.js CPU + jpeg decode).
 * Used for live video frame sampling and pre-upload image checks.
 */
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';
import jpeg from 'jpeg-js';
import * as FileSystem from 'expo-file-system';
import { NSFW_THRESHOLD } from '../config/nsfwConfig';

let initPromise = null;
let modelPromise = null;

async function readUriAsBytes(uri) {
  const u = String(uri || '').trim();
  if (!u) throw new Error('Empty image URI');

  if (u.startsWith('file://') || u.startsWith('content://') || u.startsWith('ph://')) {
    const base64 = await FileSystem.readAsStringAsync(u, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const res = await fetch(u);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function rgbaToRgbTensor(rgba, width, height) {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    pixels[j] = rgba[i];
    pixels[j + 1] = rgba[i + 1];
    pixels[j + 2] = rgba[i + 2];
  }
  return tf.tensor3d(pixels, [height, width, 3]);
}

async function bytesToTensor(bytes) {
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error('Could not decode JPEG');
  }
  return rgbaToRgbTensor(decoded.data, decoded.width, decoded.height);
}

export function scoresFromPredictions(predictions) {
  const map = {};
  for (const p of predictions || []) {
    map[String(p.className || '').toLowerCase()] = Number(p.probability || 0);
  }
  return map;
}

export function isNsfwPredictions(predictions, threshold = NSFW_THRESHOLD) {
  const s = scoresFromPredictions(predictions);
  return (
    (s.porn ?? 0) >= threshold ||
    (s.hentai ?? 0) >= threshold ||
    (s.sexy ?? 0) >= threshold
  );
}

export function topPredictionLabel(predictions) {
  if (!Array.isArray(predictions) || !predictions.length) return 'unknown';
  const sorted = [...predictions].sort((a, b) => (b.probability || 0) - (a.probability || 0));
  return sorted[0]?.className || 'unknown';
}

async function ensureBackend() {
  if (!initPromise) {
    initPromise = (async () => {
      await tf.setBackend('cpu');
      await tf.ready();
    })();
  }
  await initPromise;
}

async function loadModel() {
  await ensureBackend();
  if (!modelPromise) {
    modelPromise = nsfwjs.load().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

/** Warm model in background (call from Live lobby). */
export function preloadNsfwModel() {
  loadModel().catch(() => {});
}

/**
 * Classify image at URI. Returns { predictions, nsfw, error }.
 */
export async function classifyImageUri(uri) {
  try {
    const model = await loadModel();
    const bytes = await readUriAsBytes(uri);
    const tensor = await bytesToTensor(bytes);
    try {
      const predictions = await model.classify(tensor);
      const nsfw = isNsfwPredictions(predictions);
      return { predictions, nsfw, error: null };
    } finally {
      tensor.dispose();
    }
  } catch (e) {
    return {
      predictions: null,
      nsfw: false,
      error: e?.message || String(e),
    };
  }
}
