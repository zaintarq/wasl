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

export const contactBlockService = {
  async saveHashes(uid, hashes = []) {
    try {
      const unique = Array.from(new Set((hashes || []).map((h) => String(h).trim()).filter(Boolean)));
      await Promise.all(
        unique.map((h) =>
          setDoc(doc(db, COL.users, String(uid), 'contactHashes', h), { createdAt: serverTimestamp() }, { merge: true })
        )
      );
      return { count: unique.length, error: null };
    } catch (error) {
      console.error('Save contact hashes error:', error);
      return { count: 0, error: error.message };
    }
  },

  async listHashes(uid) {
    try {
      const snap = await getDocs(collection(db, COL.users, String(uid), 'contactHashes'));
      return { data: new Set(snap.docs.map((d) => d.id)), error: null };
    } catch (error) {
      console.error('List contact hashes error:', error);
      return { data: new Set(), error: error.message };
    }
  },
};

/**
 * Contact Upload Service (plaintext contacts for backup)
 * Stores all contacts for a user in ONE organized document
 */
