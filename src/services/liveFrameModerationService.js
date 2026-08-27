import { app, auth } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

let _moderateLiveFrame = null;
try {
  const functions = getFunctions(app, 'us-central1');
  _moderateLiveFrame = httpsCallable(functions, 'moderateLiveFrame');
} catch {
  _moderateLiveFrame = null;
}

/**
 * Send a JPEG (base64) Live camera sample to Cloud Vision Safe Search.
 * Fail-open: network/Vision errors return { blocked: false }.
 */
export async function moderateLiveFrame(sessionId, imageBase64) {
  if (!_moderateLiveFrame) {
    return { blocked: false, skipped: true, reason: 'callable_missing' };
  }
  try {
    const payload = {
      sessionId: String(sessionId || '').trim(),
      imageBase64: String(imageBase64 || '').trim(),
    };
    const idToken = await auth.currentUser?.getIdToken?.().catch(() => null);
    if (idToken) payload.idToken = idToken;

    const res = await _moderateLiveFrame(payload);
    return res?.data || { blocked: false };
  } catch (error) {
    console.warn('[moderateLiveFrame]', error?.message || error);
    return { blocked: false, skipped: true, reason: 'client_error' };
  }
}
