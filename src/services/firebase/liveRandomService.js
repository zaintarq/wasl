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
import { moderateMessageText, isMessageToxicLocal } from '../moderationService';
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

import { messageService } from './messageService';
import { reportService } from './reportService';
import { safetyService } from './safetyService';
import { authService } from './authService';

export const liveRandomService = {
  POOL_DOC_ID: 'current',
  SESSION_MS: 60 * 1000,
  POOL_WAIT_TTL_MS: 2 * 60 * 1000,

  _poolRef() {
    return doc(db, COL.liveRandomPool, this.POOL_DOC_ID);
  },

  _sessionRef(sessionId) {
    return doc(db, COL.liveRandomSessions, String(sessionId));
  },

  _messagesCol(sessionId) {
    return collection(db, COL.liveRandomSessions, String(sessionId), 'messages');
  },

  /**
   * Enter matching pool. Either waits for a partner or matches immediately.
   * @returns {{ state: 'waiting', error?: string } | { state: 'matched', sessionId: string, partnerUid: string, error?: null }}
   */
  async enterPool(uid) {
    const me = String(uid || '').trim();
    if (!me) return { state: 'waiting', error: 'Not signed in.' };
    try {
      const sessionRef = doc(collection(db, COL.liveRandomSessions));
      const sessionId = sessionRef.id;
      const poolRef = this._poolRef();
      const result = await runTransaction(db, async (tx) => {
        const poolSnap = await tx.get(poolRef);
        const poolData = poolSnap.exists() ? poolSnap.data() || {} : {};
        let w = String(poolData.waitingUid || '').trim();
        const updatedAt = poolData.updatedAt?.toMillis?.() || 0;
        if (w && updatedAt && Date.now() - updatedAt > this.POOL_WAIT_TTL_MS) {
          w = '';
        }
        if (w && w !== me) {
          tx.set(poolRef, { waitingUid: null, updatedAt: serverTimestamp() }, { merge: true });
          tx.set(sessionRef, {
            uids: [me, w].sort(),
            status: 'active',
            startedAt: serverTimestamp(),
            endedBy: null,
            endedReason: null,
          });
          return { type: 'matched', partnerUid: w, sessionId };
        }
        tx.set(poolRef, { waitingUid: me, updatedAt: serverTimestamp() }, { merge: true });
        return { type: 'waiting' };
      });
      if (result.type === 'matched') {
        return { state: 'matched', sessionId: result.sessionId, partnerUid: result.partnerUid, error: null };
      }
      return { state: 'waiting', error: null };
    } catch (e) {
      return { state: 'waiting', error: e?.message || String(e) };
    }
  },

  async leavePool(uid) {
    const me = String(uid || '').trim();
    if (!me) return { error: 'Not signed in.' };
    try {
      await runTransaction(db, async (tx) => {
        const poolRef = this._poolRef();
        const poolSnap = await tx.get(poolRef);
        if (!poolSnap.exists()) return;
        const w = String(poolSnap.data()?.waitingUid || '').trim();
        if (w === me) {
          tx.set(poolRef, { waitingUid: null, updatedAt: serverTimestamp() }, { merge: true });
        }
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  listenActiveSessionForUser(uid, callback) {
    const me = String(uid || '').trim();
    if (!me) return () => {};
    const q = query(
      collection(db, COL.liveRandomSessions),
      where('uids', 'array-contains', me),
      where('status', '==', 'active'),
      limit(1)
    );
    return onSnapshot(
      q,
      (snap) => {
        const doc0 = snap.docs[0];
        callback({
          data: doc0 ? { id: doc0.id, ...doc0.data() } : null,
          error: null,
        });
      },
      (error) => callback({ data: null, error: error.message })
    );
  },

  async getSessionById(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return { data: null, error: 'Missing id.' };
    try {
      const snap = await getDoc(this._sessionRef(sid));
      return { data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async endSession(sessionId, uid, reason) {
    const sid = String(sessionId || '').trim();
    const me = String(uid || '').trim();
    const r = String(reason || 'leave');
    if (!sid || !me) return { error: 'Missing.' };
    try {
      await updateDoc(this._sessionRef(sid), {
        status: 'ended',
        endedAt: serverTimestamp(),
        endedBy: me,
        endedReason: r,
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  listenMessages(sessionId, callback) {
    const sid = String(sessionId || '').trim();
    if (!sid) return () => {};
    const q = query(this._messagesCol(sid), orderBy('createdAt', 'asc'), limit(80));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: rows, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  /** Pre-send profanity block — same cloud function as match/club chat. */
  async checkMessageToxicity(_sessionId, text) {
    return messageService.checkMessageToxicity(null, text, {});
  },

  async sendMessage(sessionId, fromUid, text) {
    const sid = String(sessionId || '').trim();
    const me = String(fromUid || '').trim();
    const t = String(text || '').trim();
    if (!sid || !me || !t) return { error: 'Message empty.' };
    if (t.length > 2000) return { error: 'Message too long.' };

    const mod = moderateMessageText(t);
    try {
      const msgRef = await addDoc(this._messagesCol(sid), {
        fromUid: me,
        text: t.slice(0, 2000),
        sessionId: sid,
        createdAt: serverTimestamp(),
        moderation: mod.flagged
          ? {
              flagged: true,
              categories: Array.isArray(mod.categories) ? mod.categories.map(String) : [],
              matchedTerms: Array.isArray(mod.matchedTerms) ? mod.matchedTerms.map(String) : [],
              score: Number(mod.score || 0),
            }
          : { flagged: false },
      });

      if (mod.flagged) {
        try {
          await reportService.createReport({
            reporterUid: me,
            targetType: 'message',
            targetId: String(msgRef.id),
            targetUserId: me,
            reason: mod.categories?.[0] || 'inappropriate',
            categories: mod.categories,
            details: `live:${sid} ${t}`,
            autoFlagged: true,
            matchedTerms: mod.matchedTerms,
            score: mod.score,
          });
        } catch {}

        try {
          await safetyService.recordEvent({
            source: 'keyword_scan',
            targetUid: me,
            categories: Array.isArray(mod.categories) ? mod.categories.map(String) : [],
            matchedTerms: Array.isArray(mod.matchedTerms) ? mod.matchedTerms.map(String) : [],
            score: Number(mod.score || 0),
            details: t,
            severity: Number(mod.score || 0) >= 3 ? 'high' : 'medium',
          });
        } catch {}
      }

      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  /** Server-minted JWT for LiveKit (requires deployed `getLiveKitToken` + secrets). */
  async fetchLiveKitToken(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return { token: null, url: null, roomName: null, error: 'Missing session.' };
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'getLiveKitToken');
      const result = await fn({ sessionId: sid });
      const d = result.data || {};
      return {
        token: d.token || null,
        url: d.url || null,
        roomName: d.roomName || null,
        error: null,
      };
    } catch (e) {
      return {
        token: null,
        url: null,
        roomName: null,
        error: authService._callableErrorMessage(e),
      };
    }
  },
};

/**
 * Blocking
 */
