/**
 * Chat translation via Firebase callable (MyMemory). Used on web, iOS, and as Android fallback.
 * Callable requires Firebase Auth — we refresh the ID token before calling so the server sees context.auth.
 */
import { app, auth } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

const _translateChatMessageCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'translateChatMessage');
  } catch {
    return null;
  }
})();

function callableErrorMessage(e) {
  const code = e?.code;
  if (code === 'functions/not-found') return 'Translation not deployed yet.';
  if (code === 'functions/unauthenticated' || code === 'unauthenticated') {
    return 'Sign in required for translation. Try logging out and back in.';
  }
  return e?.message || String(e);
}

export async function translateChatMessageCloud(text, targetLang) {
  const t = String(text || '').trim();
  const lang = String(targetLang || 'en').trim().toLowerCase();
  if (!t) return { translatedText: null, error: 'Empty text' };
  const callable = _translateChatMessageCallable;
  if (!callable) return { translatedText: null, error: 'Translation unavailable' };

  const user = auth.currentUser;
  if (!user) {
    return {
      translatedText: null,
      error: 'Sign in required for translation.',
    };
  }

  try {
    await user.getIdToken(true);
  } catch {
    return {
      translatedText: null,
      error: 'Session expired. Please sign in again.',
    };
  }

  try {
    const { data } = await callable({ text: t, targetLang: lang });
    const out = data && typeof data.translatedText === 'string' ? data.translatedText : null;
    return { translatedText: out, error: out ? null : 'No translation returned' };
  } catch (e) {
    return { translatedText: null, error: callableErrorMessage(e) };
  }
}
