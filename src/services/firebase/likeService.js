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

import { matchService } from './matchService';
import { notificationService } from './notificationService';

export const likeService = {
  _likesSentRef(fromUid, toUid) {
    return doc(db, COL.users, String(fromUid), 'likesSent', String(toUid));
  },
  _likesReceivedRef(toUid, fromUid) {
    return doc(db, COL.users, String(toUid), 'likesReceived', String(fromUid));
  },

  async likeUser(fromUid, toUid) {
    try {
      if (!fromUid || !toUid) {
        const error = 'Missing fromUid or toUid';
        if (__DEV__) console.warn(`[LikeService] ${error}`);
        return { matched: false, matchId: null, error };
      }

      const from = String(fromUid);
      const to = String(toUid);

      const callable = _recordLikeCallable;
      if (callable) {
        try {
          const { data } = await callable({ toUid: to, source: 'discovery' });
          const matched = !!(data && data.matched);
          const matchId = data?.matchId || null;
          const matchStatus = data?.status || null;
          if (data?.error) {
            return { matched: false, matchId: null, error: String(data.error) };
          }

          if (matched && matchId) {
            let senderName = 'Someone';
            let receiverName = 'Someone';
            try {
              const senderSnap = await getDoc(doc(db, COL.users, from));
              if (senderSnap.exists()) senderName = String(senderSnap.data()?.name || 'Someone');
            } catch {}
            try {
              const receiverSnap = await getDoc(doc(db, COL.users, to));
              if (receiverSnap.exists()) receiverName = String(receiverSnap.data()?.name || 'Someone');
            } catch {}
            try {
              await notificationService.createNotification(from, {
                type: 'match_mutual',
                fromUid: from,
                matchId,
                title: "It's a match!",
                body: `You and ${receiverName} liked each other. Open Matches to chat.`,
                status: 'unread',
              });
              await notificationService.createNotification(to, {
                type: 'match_mutual',
                fromUid: from,
                matchId,
                title: "It's a match!",
                body: `${senderName} liked you back. Open Matches to chat.`,
                status: 'unread',
              });
            } catch {}
            return { matched: true, matchId, status: matchStatus, error: null };
          }

          try {
            const senderSnap = await getDoc(doc(db, COL.users, from));
            const senderName = senderSnap.exists() ? String(senderSnap.data()?.name || 'Someone') : 'Someone';
            await notificationService.createNotification(to, {
              type: 'like_received',
              fromUid: from,
              matchId: null,
              title: 'New like!',
              body: `${senderName} liked you. Like them back to match and chat.`,
              status: 'unread',
            });
          } catch {}
          return { matched: false, matchId: null, error: null };
        } catch (cfError) {
          if (__DEV__) console.warn('[LikeService] recordLike CF error:', cfError?.message || cfError);
        }
      }

      // Fallback if Cloud Function unavailable (legacy client-side path)
      let likesSentSuccess = false;
      let likesReceivedSuccess = false;

      await Promise.allSettled([
        setDoc(this._likesSentRef(from, to), {
          toUid: to,
          action: 'like',
          createdAt: serverTimestamp(),
        }, { merge: true }).then(() => {
          likesSentSuccess = true;
        }).catch((sentError) => {
          if (__DEV__) console.warn('[LikeService] Like sent write error:', sentError?.message || sentError);
        }),
        setDoc(this._likesReceivedRef(to, from), {
          fromUid: from,
          action: 'like',
          createdAt: serverTimestamp(),
        }, { merge: true }).then(() => {
          likesReceivedSuccess = true;
        }).catch((receivedError) => {
          if (__DEV__) console.warn('[LikeService] Like received write error:', receivedError?.message || receivedError);
        }),
      ]);

      if (!likesSentSuccess && !likesReceivedSuccess) {
        return {
          matched: false,
          matchId: null,
          error: 'Could not save your like. Check your connection and try again.',
        };
      }
      if (!likesSentSuccess || !likesReceivedSuccess) {
        return {
          matched: false,
          matchId: null,
          error: 'Like may not have registered. Please try again.',
        };
      }

      // Get sender + receiver names for notifications
      let senderName = 'Someone';
      let receiverName = 'Someone';
      try {
        const senderSnap = await getDoc(doc(db, COL.users, from));
        if (senderSnap.exists()) {
          senderName = String(senderSnap.data()?.name || 'Someone');
        }
      } catch (nameError) {
        console.warn('[LikeService] Failed to get sender name:', nameError);
      }
      try {
        const receiverSnap = await getDoc(doc(db, COL.users, to));
        if (receiverSnap.exists()) {
          receiverName = String(receiverSnap.data()?.name || 'Someone');
        }
      } catch (nameError) {
        console.warn('[LikeService] Failed to get receiver name:', nameError);
      }

      // Mutual?
      let isMutual = false;
      let matchId = null;
      let matchStatus = null;
      
      try {
        const reciprocal = await getDoc(this._likesReceivedRef(from, to));
        if (reciprocal.exists() && reciprocal.data()?.action === 'like') {
          isMutual = true;

          try {
            const matchResult = await matchService.createActiveMatch(from, to, {
              source: 'mutual_like',
              initiatedBy: from,
            });
            if (matchResult?.error) {
              if (__DEV__) console.warn('[LikeService] Failed to create active match:', matchResult.error);
              return { matched: false, matchId: null, error: matchResult.error };
            }
            matchId = matchResult?.matchId || getMatchId(from, to);
            matchStatus = matchResult?.status || 'active';
            try {
              await notificationService.createNotification(from, {
                type: 'match_mutual',
                fromUid: from,
                matchId,
                title: "It's a match!",
                body: `You and ${receiverName} liked each other. Open Matches to chat.`,
                status: 'unread',
              });
              await notificationService.createNotification(to, {
                type: 'match_mutual',
                fromUid: from,
                matchId,
                title: "It's a match!",
                body: `${senderName} liked you back. Open Matches to chat.`,
                status: 'unread',
              });
            } catch (mutualNotifErr) {
              if (__DEV__) console.warn('[LikeService] Mutual notification (non-critical):', mutualNotifErr);
            }
            return { matched: true, matchId, status: matchStatus, error: null };
          } catch (matchError) {
            if (__DEV__) console.warn('[LikeService] Match creation exception:', matchError);
            return {
              matched: false,
              matchId: null,
              error: matchError?.message || String(matchError),
            };
          }
        }
      } catch (mutualCheckError) {
        if (__DEV__) console.warn('[LikeService] Error checking mutual like:', mutualCheckError);
      }

      if (!isMutual) {
        try {
          await notificationService.createNotification(to, {
            type: 'like_received',
            fromUid: from,
            matchId: null,
            title: 'New like!',
            body: `${senderName} liked you. Like them back to match and chat.`,
            status: 'unread',
          });
        } catch (notifError) {
          if (__DEV__) console.warn('[LikeService] Like notification (non-critical):', notifError);
        }
      }
      return { matched: false, matchId: null, error: null };
    } catch (error) {
      if (__DEV__) {
        console.warn('[LikeService] likeUser error:', error?.message || error);
      }
      
      return { matched: false, matchId: null, error: error?.message || String(error) || 'Unknown error' };
    }
  },

  async passUser(fromUid, toUid) {
    try {
      const from = String(fromUid);
      const to = String(toUid);
      await setDoc(this._likesSentRef(from, to), { toUid: to, action: 'pass', createdAt: serverTimestamp() }, { merge: true });
      return { error: null };
    } catch (error) {
      console.error('Pass user error:', error);
      return { error: error.message };
    }
  },

  async listLikesSent(fromUid) {
    try {
      const from = String(fromUid);
      const snap = await getDocs(collection(db, COL.users, from, 'likesSent'));
      const likes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { data: likes, error: null };
    } catch (error) {
      console.error('List likes sent error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Remove like records between two users so they can see each other again in discovery (e.g. after unmatch).
   */
  async removeLikeBetween(uidA, uidB) {
    try {
      const a = String(uidA || '');
      const b = String(uidB || '');
      if (!a || !b || a === b) return { error: null };
      await Promise.all([
        deleteDoc(this._likesSentRef(a, b)).catch(() => {}),
        deleteDoc(this._likesReceivedRef(b, a)).catch(() => {}),
        deleteDoc(this._likesSentRef(b, a)).catch(() => {}),
        deleteDoc(this._likesReceivedRef(a, b)).catch(() => {}),
      ]);
      return { error: null };
    } catch (error) {
      console.error('removeLikeBetween error:', error);
      return { error: error?.message || String(error) };
    }
  },
};
