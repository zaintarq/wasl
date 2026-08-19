import { app } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

export const _checkMessageToxicityCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'checkMessageToxicity');
  } catch {
    return null;
  }
})();

export const _recordLikeCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'recordLike');
  } catch {
    return null;
  }
})();

export const _recordSafetyEventCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'recordSafetyEvent');
  } catch {
    return null;
  }
})();

export const _generateChatSuggestionsCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'generateChatSuggestions');
  } catch {
    return null;
  }
})();

export const _generateModerationEvidenceCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'generateModerationEvidence');
  } catch {
    return null;
  }
})();

export const _sendModerationNoticeCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'sendModerationNotice');
  } catch {
    return null;
  }
})();

