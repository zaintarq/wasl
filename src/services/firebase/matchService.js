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

import { notificationService } from './notificationService';
import { authService } from './authService';
import { likeService } from './likeService';

export const matchService = {
  async getMatchById(matchId) {
    try {
      const snap = await getDoc(doc(db, COL.matches, String(matchId)));
      if (snap.exists()) return { data: snap.data(), error: null };
      return { data: null, error: 'Match not found' };
    } catch (error) {
      return { data: null, error: error.message };
    }
  },

  listenMatch(matchId, callback) {
    const ref = doc(db, COL.matches, String(matchId));
    return onSnapshot(
      ref,
      (snap) => callback({ data: snap.exists() ? snap.data() : null, error: null }),
      (error) => callback({ data: null, error: error.message })
    );
  },

  // Create a pending match request where only requestedTo must approve.
  // requestedBy: user who liked first, requestedTo: user who was liked first (receiver).
  async createPendingMatch(requestedByUid, requestedToUid) {
    try {
      const matchId = getMatchId(requestedByUid, requestedToUid);
      const ref = doc(db, COL.matches, matchId);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const data = existing.data() || {};
        return { matchId, status: data.status || 'active', error: null };
      }

      await setDoc(ref, {
        id: matchId,
        uids: [String(requestedByUid), String(requestedToUid)].sort(),
        status: 'pending', // pending -> active when requestedTo approves
        requestedBy: String(requestedByUid),
        requestedTo: String(requestedToUid),
        approvedBy: null,
        approvedAt: null,
        createdAt: serverTimestamp(),
        lastMessageAt: null,
      });

      // Notifications are sent from likeUser / approveMatch so we never duplicate
      // or miss a push when match creation fails or doc already existed.

      return { matchId, status: 'pending', error: null };
    } catch (error) {
      console.error('Create pending match error:', error);
      return { matchId: null, status: null, error: error.message };
    }
  },

  // Immediate chat thread — no approval step (Msg button, mutual like, legacy pending upgrade).
  async createActiveMatch(uidA, uidB, { source = 'discovery', initiatedBy = null } = {}) {
    try {
      const a = String(uidA || '').trim();
      const b = String(uidB || '').trim();
      if (!a || !b) return { matchId: null, status: null, error: 'Missing uids.' };
      const matchId = getMatchId(a, b);
      const ref = doc(db, COL.matches, matchId);
      const snap = await getDoc(ref);
      const sorted = [a, b].sort();
      const initiator = String(initiatedBy || a);

      if (snap.exists()) {
        const data = snap.data() || {};
        if (String(data.status || '') === 'active') {
          return { matchId, status: 'active', error: null };
        }
        await updateDoc(ref, {
          status: 'active',
          uids: sorted,
          approvedBy: initiator,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return { matchId, status: 'active', error: null };
      }

      await setDoc(ref, {
        id: matchId,
        uids: sorted,
        status: 'active',
        requestedBy: initiator,
        requestedTo: sorted.find((u) => u !== initiator) || b,
        approvedBy: initiator,
        approvedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        lastMessageAt: null,
        source: String(source || 'discovery'),
      });
      return { matchId, status: 'active', error: null };
    } catch (error) {
      console.error('Create active match error:', error);
      return { matchId: null, status: null, error: error.message };
    }
  },

  async startDirectMessage(fromUid, toUid) {
    try {
      const from = String(fromUid || '').trim();
      const to = String(toUid || '').trim();
      if (!from || !to) return { matchId: null, error: 'Missing user.' };

      let senderName = 'Someone';
      try {
        const senderSnap = await getDoc(doc(db, COL.users, from));
        if (senderSnap.exists()) {
          senderName = String(senderSnap.data()?.name || 'Someone');
        }
      } catch {}

      const { matchId, error } = await this.createActiveMatch(from, to, {
        source: 'direct_message',
        initiatedBy: from,
      });
      if (error || !matchId) return { matchId: null, error: error || 'Could not start chat.' };

      try {
        await notificationService.createNotification(to, {
          type: 'message_new',
          fromUid: from,
          matchId: String(matchId),
          title: 'New message',
          body: `${senderName} wants to chat. Open Matches to reply.`,
          status: 'unread',
        });
      } catch {}

      return { matchId, error: null };
    } catch (error) {
      return { matchId: null, error: error?.message || String(error) };
    }
  },

  async approveMatch(matchId, approverUid) {
    try {
      const ref = doc(db, COL.matches, String(matchId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: 'Match not found.' };
      const m = snap.data() || {};
      if (m.status === 'active') return { error: null };
      if (String(m.requestedTo || '') !== String(approverUid || '')) {
        return { error: 'Not allowed.' };
      }
      const uids = (Array.isArray(m.uids) && m.uids.length === 2)
        ? m.uids.map(String)
        : [String(m.requestedBy), String(m.requestedTo)].sort();
      await updateDoc(ref, {
        status: 'active',
        uids,
        approvedBy: String(approverUid),
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Notify requester that match is approved.
      const requestedBy = String(m.requestedBy || '');
      if (requestedBy) {
        try {
          await notificationService.createNotification(requestedBy, {
            type: 'match_approved',
            fromUid: String(approverUid),
            matchId: String(matchId),
            title: 'Match approved',
            body: 'Your match was approved. You can now chat.',
            status: 'unread',
          });
        } catch {}
      }
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },

  async listMyMatches(uid) {
    try {
      await authService.ensureAuthReady();
      try {
        const functions = getFunctions(app, 'us-central1');
        const { data } = await httpsCallable(functions, 'webListMatches')({});
        const matches = (data?.matches || []).map((m) => ({
          id: m.id,
          uids: m.uids,
          status: m.status,
          requestedBy: m.requestedBy,
          requestedTo: m.requestedTo,
          lastMessageText: m.lastMessageText,
          lastMessageAt: m.lastMessageAt,
          createdAt: m.createdAt,
        }));
        return { data: matches, error: null };
      } catch (callableErr) {
        console.warn('[matchService] webListMatches fallback:', callableErr?.message || callableErr);
      }
      const qRef = query(collection(db, COL.matches), where('uids', 'array-contains', String(uid)));
      const snap = await getDocs(qRef);
      const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      matches.sort((a, b) => {
        const at = a?.lastMessageAt?.toMillis?.() || a?.createdAt?.toMillis?.() || 0;
        const bt = b?.lastMessageAt?.toMillis?.() || b?.createdAt?.toMillis?.() || 0;
        return bt - at;
      });
      return { data: matches, error: null };
    } catch (error) {
      console.error('List matches error:', error);
      return { data: [], error: error.message };
    }
  },

  _sortMatchesByRecent(matches) {
    const toMs = (v) => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      if (typeof v?.toMillis === 'function') return v.toMillis();
      return 0;
    };
    return [...(matches || [])].sort(
      (a, b) =>
        toMs(b?.lastMessageAt || b?.createdAt) - toMs(a?.lastMessageAt || a?.createdAt)
    );
  },

  _mergeMatchLists(...lists) {
    const byId = new Map();
    lists.flat().forEach((m) => {
      if (!m?.id) return;
      byId.set(String(m.id), { ...(byId.get(String(m.id)) || {}), ...m, id: String(m.id) });
    });
    return this._sortMatchesByRecent([...byId.values()]);
  },

  /** Real-time listener for match list — bootstraps via server callable if client query is empty. */
  listenMyMatches(uid, callback) {
    let unsub = () => {};
    let cancelled = false;
    let lastMatches = [];

    const emit = (matches, error = null) => {
      lastMatches = matches;
      callback({ data: matches, error });
    };

    const bootstrapFromServer = async () => {
      try {
        const { data, error } = await this.listMyMatches(uid);
        if (cancelled || error) return;
        const serverMatches = Array.isArray(data) ? data : [];
        if (serverMatches.length === 0) return;
        emit(this._mergeMatchLists(lastMatches, serverMatches));
      } catch {
        /* non-fatal */
      }
    };

    authService
      .ensureAuthReady()
      .then(() => {
        if (cancelled) return;
        void bootstrapFromServer();
        const qRef = query(collection(db, COL.matches), where('uids', 'array-contains', String(uid)));
        unsub = onSnapshot(
          qRef,
          (snap) => {
            const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            emit(this._sortMatchesByRecent(matches));
            if (matches.length === 0) void bootstrapFromServer();
          },
          (error) => {
            console.warn('[matchService] listenMyMatches error:', error?.message || error);
            void bootstrapFromServer().finally(() => {
              if (!cancelled && lastMatches.length === 0) {
                callback({ data: [], error: error?.message || String(error) });
              }
            });
          }
        );
      })
      .catch((error) => callback({ data: [], error: error?.message || String(error) }));
    return () => {
      cancelled = true;
      unsub();
    };
  },

  // Pending match requests for the signed-in user (receiver). Uses server callable — avoids Firestore list rule issues.
  listenPendingMatchRequests(uid, callback) {
    let stopped = false;
    let timer = null;

    const poll = async () => {
      if (stopped) return;
      try {
        await authService.ensureAuthReady();
        const functions = getFunctions(app, 'us-central1');
        const { data } = await httpsCallable(functions, 'nativeListPendingMatchRequests')({});
        if (!stopped) callback({ data: data?.requests || [], error: null });
      } catch (error) {
        if (!stopped) callback({ data: [], error: error?.message || String(error) });
      }
    };

    poll();
    timer = setInterval(poll, 12000);

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  },

  // Reject a pending match request
  async rejectMatch(matchId, rejectorUid) {
    try {
      const ref = doc(db, COL.matches, String(matchId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: 'Match not found.' };
      const m = snap.data() || {};
      if (String(m.requestedTo || '') !== String(rejectorUid || '')) {
        return { error: 'Not allowed.' };
      }
      // Delete the match document
      await deleteDoc(ref);
      
      // Notify the requester that their match was rejected
      const requestedBy = String(m.requestedBy || '');
      if (requestedBy) {
        try {
          await notificationService.createNotification(requestedBy, {
            type: 'match_rejected',
            fromUid: String(rejectorUid),
            matchId: null,
            title: 'Match declined',
            body: 'Your match request was declined.',
            status: 'unread',
          });
        } catch {}
      }
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },

  // Unmatch: either participant can end an approved (active) match.
  // Also clears like records so both users can see each other again on the cards.
  async unmatch(matchId, uid) {
    try {
      const ref = doc(db, COL.matches, String(matchId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: 'Match not found.' };
      const m = snap.data() || {};
      const uids = Array.isArray(m.uids) ? m.uids.map(String) : [];
      if (!uids.includes(String(uid))) return { error: 'Not allowed.' };
      const otherUid = uids.find((u) => String(u) !== String(uid)) || null;
      await deleteDoc(ref);
      if (otherUid) {
        await likeService.removeLikeBetween(uid, otherUid);
      }
      return { error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },
};

