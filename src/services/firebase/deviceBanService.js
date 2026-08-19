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

export const deviceBanService = {
  async isBanned(deviceHash) {
    try {
      const snap = await getDoc(bannedDeviceDoc(deviceHash));
      return { banned: snap.exists(), error: null };
    } catch (e) {
      return { banned: false, error: e?.message || String(e) };
    }
  },
  async banDevice(deviceHash, { bannedByUid = null, reason = '' } = {}) {
    try {
      await setDoc(
        bannedDeviceDoc(deviceHash),
        {
          deviceHash: String(deviceHash),
          bannedByUid: bannedByUid ? String(bannedByUid) : null,
          reason: String(reason || ''),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },
};

/**
 * App-wide update alerts (admin broadcast → blocking gate + push).
 */
