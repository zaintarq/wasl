import { app, auth, db, storage } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  deleteField,
  query,
  orderBy,
  where,
  onSnapshot,
  limit,
  addDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { sendExpoPushAsync } from '../pushService';
import { scanMessageText, isMessageToxicLocal } from '../moderationService';
import { sha256 } from '../../utils/hash.native';
import { translateChatMessage } from '../translateChatMessage';
import { COL, getMatchId, userNotificationsCol, bannedDeviceDoc } from './constants';
import {
  _checkMessageToxicityCallable,
  _recordLikeCallable,
  _recordSafetyEventCallable,
  _generateChatSuggestionsCallable,
  _generateModerationEvidenceCallable,
  _sendModerationNoticeCallable,
} from './callables';

export const appUpdateService = {
  listenCurrentAlert(callback) {
    const ref = doc(db, COL.appAlerts, 'current');
    return onSnapshot(
      ref,
      (snap) => {
        callback({ data: snap.exists() ? snap.data() : null, error: null });
      },
      (error) => {
        callback({ data: null, error: error?.message || String(error) });
      }
    );
  },

  async broadcastAppUpdate({ title, body, minVersion } = {}) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'broadcastAppUpdate');
      const result = await fn({
        title: String(title || '').trim(),
        body: String(body || '').trim(),
        minVersion: String(minVersion || '').trim(),
      });
      return { ...(result?.data || {}), error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },

  async clearAppUpdateAlert() {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'clearAppUpdateAlert');
      const result = await fn({});
      return { ...(result?.data || {}), error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },
};

/**
 * Helper function to check if a user is admin/staff from the admin collection
 * This is the SINGLE SOURCE OF TRUTH for role checking
 */
