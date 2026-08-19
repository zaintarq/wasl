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

import { userService } from './userService';

export const blockService = {
  _blockRef(uid, blockedUid) {
    return doc(db, COL.users, String(uid), 'blocks', String(blockedUid));
  },

  async blockUser(uid, blockedUid) {
    try {
      await setDoc(this._blockRef(uid, blockedUid), { blockedUid: String(blockedUid), createdAt: serverTimestamp() }, { merge: true });

      // Also block the match thread (if it exists) so messaging stops immediately.
      try {
        const matchId = getMatchId(uid, blockedUid);
        await setDoc(
          doc(db, COL.matches, matchId),
          { isBlocked: true, blockedBy: String(uid), blockedAt: serverTimestamp(), status: 'blocked' },
          { merge: true }
        );
      } catch {}

      return { error: null };
    } catch (error) {
      console.error('Block user error:', error);
      return { error: error.message };
    }
  },

  async unblockUser(uid, blockedUid) {
    try {
      await deleteDoc(this._blockRef(uid, blockedUid));
      // Restore match thread so chat can work again (blockUser had set status: blocked).
      try {
        const matchId = getMatchId(uid, blockedUid);
        const ref = doc(db, COL.matches, matchId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const m = snap.data() || {};
          if (m.status === 'blocked' || m.isBlocked === true) {
            await updateDoc(ref, {
              status: 'active',
              isBlocked: deleteField(),
              blockedBy: deleteField(),
              blockedAt: deleteField(),
            });
          }
        }
      } catch (e) {
        console.warn('[blockService] unblock match restore:', e?.message || e);
      }
      return { error: null };
    } catch (error) {
      console.error('Unblock user error:', error);
      return { error: error.message };
    }
  },

  /** Profiles for Settings → Blocked users (names + optional photo URL). */
  async listBlockedUsers(uid) {
    try {
      const snap = await getDocs(collection(db, COL.users, String(uid), 'blocks'));
      const ids = snap.docs.map((d) => d.id);
      const rows = await Promise.all(
        ids.map(async (blockedUid) => {
          const ures = await userService.getUserById(blockedUid);
          const u = ures?.data || {};
          const images = Array.isArray(u.images) ? u.images : [];
          const firstImg = images.find((x) => typeof x === 'string' && x.length > 0) || u.photoURL || null;
          return {
            id: blockedUid,
            name: String(u.name || 'User'),
            photoUrl: firstImg ? String(firstImg) : null,
          };
        })
      );
      return { data: rows, error: null };
    } catch (error) {
      console.error('List blocked users error:', error);
      return { data: [], error: error.message };
    }
  },

  async listBlockedUids(uid) {
    try {
      const snap = await getDocs(collection(db, COL.users, String(uid), 'blocks'));
      return { data: new Set(snap.docs.map((d) => d.id)), error: null };
    } catch (error) {
      console.error('List blocked error:', error);
      return { data: new Set(), error: error.message };
    }
  },
};

/**
 * Reporting (user/message)
 */
