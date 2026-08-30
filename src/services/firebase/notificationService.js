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

export const notificationService = {
  async createNotification(toUid, payload) {
    try {
      const to = String(toUid || '').trim();
      if (!to) return { error: 'Missing toUid.' };
      const base = {
        toUid: to,
        fromUid: payload?.fromUid ? String(payload.fromUid) : null,
        type: String(payload?.type || ''),
        title: String(payload?.title || ''),
        body: String(payload?.body || ''),
        matchId: payload?.matchId ? String(payload.matchId) : null,
        status: String(payload?.status || 'unread'), // unread|read
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(userNotificationsCol(to), base);
      return { data: { id: ref.id, ...base }, error: null };
    } catch (error) {
      return { data: null, error: error.message };
    }
  },

  listenMyNotifications(uid, callback) {
    const qRef = query(userNotificationsCol(uid), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: list, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  async markRead(uid, notificationId) {
    try {
      await updateDoc(doc(db, COL.users, String(uid), 'notifications', String(notificationId)), {
        status: 'read',
        readAt: serverTimestamp(),
      });
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },
};

/**
 * Soft device-level ban (client-side gate)
 */
