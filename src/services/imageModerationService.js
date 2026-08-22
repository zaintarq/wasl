import { app, auth } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

function callableErrorMessage(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (code.includes('unauthenticated')) {
    return 'Sign in again to upload photos.';
  }
  if (code.includes('permission-denied')) {
    return msg || 'Not allowed to upload this photo.';
  }
  if (code.includes('not-found')) {
    return 'Upload not found. Try again.';
  }
  if (code.includes('invalid-argument')) {
    return msg || 'Invalid upload.';
  }
  return msg || "We couldn't verify this photo. Try again in a moment.";
}

/**
 * Run Google Cloud Vision Safe Search on an uploaded Storage object before publishing.
 */
export async function verifyUploadedImage(storagePath) {
  const user = auth.currentUser;
  if (!user) {
    return { allowed: false, message: 'Sign in to upload photos.' };
  }

  let idToken = null;
  try {
    idToken = await user.getIdToken();
  } catch {
    return { allowed: false, message: 'Sign in again to upload photos.' };
  }

  try {
    const functions = getFunctions(app, 'us-central1');
    const fn = httpsCallable(functions, 'moderateUploadedImage');
    const res = await fn({
      storagePath: String(storagePath || '').trim(),
      idToken,
    });
    const data = res?.data || {};
    return {
      allowed: data.allowed === true,
      message: data.message || null,
      safeSearch: data.safeSearch || null,
    };
  } catch (error) {
    return { allowed: false, message: callableErrorMessage(error) };
  }
}
