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

import { notificationService } from './notificationService';
import { reportService } from './reportService';
import { safetyService } from './safetyService';
import { userService } from './userService';

export const messageService = {
  _messagesCol(matchId) {
    return collection(db, COL.matches, String(matchId), 'messages');
  },

  /**
   * Returns { toxic, strikeCount, message }.
   * Falls back to local keyword scan when Cloud Function is unavailable.
   */
  async checkMessageToxicity(matchId, text, { clubId = null } = {}) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { toxic: false, strikeCount: 0, message: '' };
    const callable = _checkMessageToxicityCallable;
    if (!callable) {
      const toxic = isMessageToxicLocal(trimmed);
      return {
        toxic,
        strikeCount: toxic ? 1 : 0,
        message: toxic ? 'Message blocked. Please rephrase before sending.' : '',
      };
    }
    try {
      const { data } = await callable({
        text: trimmed,
        matchId: matchId || null,
        clubId: clubId || null,
      });
      const toxic = data && data.toxic === true;
      return {
        toxic,
        strikeCount: Number(data?.strikeCount || 0) || (toxic ? 1 : 0),
        message: String(data?.message || '').trim(),
      };
    } catch {
      const toxic = isMessageToxicLocal(trimmed);
      return {
        toxic,
        strikeCount: toxic ? 1 : 0,
        message: toxic ? 'Message blocked. Please rephrase before sending.' : '',
      };
    }
  },

  async sendMessage(matchId, fromUid, text, { replyTo = null } = {}) {
    try {
      const trimmed = String(text || '').trim();
      if (!trimmed) return { error: 'Message is empty.' };
      const mod = moderateMessageText(trimmed);
      let otherUid = null;
      try {
        const msnap = await getDoc(doc(db, COL.matches, String(matchId)));
        if (msnap.exists()) {
          const uids = msnap.data()?.uids || [];
          otherUid = Array.isArray(uids) ? uids.find((u) => String(u) !== String(fromUid)) || null : null;
        }
      } catch {}
      const msgRef = await addDoc(this._messagesCol(matchId), {
        fromUid: String(fromUid),
        type: 'text',
        text: trimmed,
        replyTo: replyTo && typeof replyTo === 'object' ? replyTo : null,
        reactions: {},
        editedAt: null,
        deletedAt: null,
        readAt: null, // Read receipt - set when recipient views the message
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
      await setDoc(
        doc(db, COL.matches, String(matchId)),
        { lastMessageAt: serverTimestamp(), lastMessageText: trimmed },
        { merge: true }
      );

      // Notify the other participant (new message)
      try {
        if (otherUid) {
          await notificationService.createNotification(String(otherUid), {
            type: 'message_new',
            fromUid: String(fromUid),
            matchId: String(matchId),
            title: 'New message',
            body: trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed,
            status: 'unread',
          });
        }
      } catch {}

      // Auto-flag to admin queue (reports) if moderation triggered.
      if (mod.flagged) {
        try {
          await reportService.createReport({
            reporterUid: String(fromUid),
            targetType: 'message',
            targetId: String(msgRef.id),
            targetUserId: String(fromUid),
            matchId: String(matchId),
            senderUid: String(fromUid),
            recipientUid: otherUid ? String(otherUid) : null,
            messageSentAt: new Date().toISOString(),
            reason: mod.categories?.[0] || 'inappropriate',
            categories: mod.categories,
            details: trimmed,
            autoFlagged: true,
            matchedTerms: mod.matchedTerms,
            score: mod.score,
          });
        } catch {}
      }

      try {
        const safetyCalls = [
          safetyService.recordEvent({
            source: 'message_fingerprint',
            targetUid: String(fromUid),
            matchId: String(matchId),
            messageId: String(msgRef.id),
            details: trimmed,
          }),
        ];

        if (mod.flagged) {
          safetyCalls.push(
            safetyService.recordEvent({
              source: 'keyword_scan',
              targetUid: String(fromUid),
              matchId: String(matchId),
              messageId: String(msgRef.id),
              categories: Array.isArray(mod.categories) ? mod.categories.map(String) : [],
              matchedTerms: Array.isArray(mod.matchedTerms) ? mod.matchedTerms.map(String) : [],
              score: Number(mod.score || 0),
              details: trimmed,
              severity: Number(mod.score || 0) >= 3 ? 'high' : 'medium',
            })
          );
        }

        await Promise.allSettled(safetyCalls);
      } catch {}

      return { error: null };
    } catch (error) {
      console.error('Send message error:', error);
      return { error: error.message };
    }
  },

  async editMessage(matchId, messageId, uid, newText) {
    try {
      const mId = String(matchId || '').trim();
      const msgId = String(messageId || '').trim();
      const u = String(uid || '').trim();
      const t = String(newText || '').trim();
      if (!mId || !msgId || !u) return { error: 'Missing.' };
      if (!t) return { error: 'Message is empty.' };
      if (t.length > 2000) return { error: 'Too long.' };
      const ref = doc(db, COL.matches, mId, 'messages', msgId);
      await updateDoc(ref, { text: t, editedAt: serverTimestamp() });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async deleteMessage(matchId, messageId, uid) {
    try {
      const mId = String(matchId || '').trim();
      const msgId = String(messageId || '').trim();
      const u = String(uid || '').trim();
      if (!mId || !msgId || !u) return { error: 'Missing.' };
      const ref = doc(db, COL.matches, mId, 'messages', msgId);
      await updateDoc(ref, { deletedAt: serverTimestamp(), text: '', audioUrl: '', durationMs: 0 });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async setReaction(matchId, messageId, uid, emoji) {
    try {
      const mId = String(matchId || '').trim();
      const msgId = String(messageId || '').trim();
      const u = String(uid || '').trim();
      const e = String(emoji || '').trim();
      if (!mId || !msgId || !u) return { error: 'Missing.' };
      const ref = doc(db, COL.matches, mId, 'messages', msgId);
      const key = `reactions.${u}`;
      await updateDoc(ref, { [key]: e || deleteField() });
      return { error: null };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  },

  async sendVoiceMessage(matchId, fromUid, { audioUri, durationMs }) {
    try {
      const uid = String(fromUid || '').trim();
      const mId = String(matchId || '').trim();
      const dur = Number(durationMs || 0);
      if (!uid || !mId) return { error: 'Missing match.' };
      if (!audioUri) return { error: 'Missing audio.' };
      if (!dur || dur < 1000) return { error: 'Voice note too short.' };
      if (dur > 15000) return { error: 'Voice note too long.' };

      const up = await storageService.uploadVoiceNote(uid, audioUri);
      if (up.error || !up.url) return { error: up.error || 'Upload failed.' };

      await addDoc(this._messagesCol(mId), {
        fromUid: uid,
        type: 'voice',
        audioUrl: up.url,
        durationMs: Math.round(dur),
        readAt: null, // Read receipt - set when recipient views the message
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, COL.matches, mId),
        { lastMessageAt: serverTimestamp(), lastMessageText: '[Voice note]' },
        { merge: true }
      );

      // Notify the other participant (new voice message)
      try {
        const msnap = await getDoc(doc(db, COL.matches, mId));
        if (msnap.exists()) {
          const uids = msnap.data()?.uids || [];
          const otherUid = Array.isArray(uids) ? uids.find((u) => String(u) !== String(uid)) : null;
          if (otherUid) {
            await notificationService.createNotification(String(otherUid), {
              type: 'message_new',
              fromUid: uid,
              matchId: mId,
              title: 'New message',
              body: '🎙️ Voice note',
              status: 'unread',
            });
          }
        }
      } catch {}

      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  listenMessages(matchId, callback) {
    const qRef = query(this._messagesCol(matchId), orderBy('createdAt', 'asc'));
    return onSnapshot(
      qRef,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: msgs, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  async setTyping(matchId, uid, isTyping) {
    try {
      const u = String(uid || '').trim();
      if (!u) return { error: 'Missing uid' };
      const ref = doc(db, COL.matches, String(matchId));
      const field = `typing.${u}`;
      await updateDoc(ref, {
        [field]: isTyping ? serverTimestamp() : deleteField(),
      });
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },

  /**
   * Mark messages as read when user views the chat
   */
  async markMessagesAsRead(matchId, readerUid) {
    try {
      const mId = String(matchId || '').trim();
      const reader = String(readerUid || '').trim();
      if (!mId || !reader) return { error: 'Missing.' };

      // Single-field filter only (no composite index required); filter and sort in memory
      const q = query(this._messagesCol(mId), where('readAt', '==', null));
      const snap = await getDocs(q);
      const updatePromises = [];
      const toMs = (t) => (t?.toMillis ? t.toMillis() : (t ? new Date(t).getTime() : 0));
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((data) => data.fromUid !== reader && !data.readAt)
        .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
      docs.forEach(({ id }) => {
        const msgRef = doc(db, COL.matches, mId, 'messages', id);
        updatePromises.push(updateDoc(msgRef, { readAt: serverTimestamp() }));
      });

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      // Update user's lastSeen timestamp
      await userService.updateUser(reader, { lastSeen: serverTimestamp() });

      return { error: null, count: updatePromises.length };
    } catch (e) {
      console.error('Mark messages as read error:', e);
      return { error: e?.message || String(e) };
    }
  },

  // Vote to continue after 2-minute window; if both vote true, unlocks full chat.
  async voteContinue(matchId, uid, vote = true) {
    try {
      const matchRef = doc(db, COL.matches, String(matchId));
      const me = String(uid || '').trim();
      if (!me) return { error: 'Missing uid.' };
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists()) throw new Error('Match not found.');
        const m = snap.data() || {};
        const uids = Array.isArray(m.uids) ? m.uids.map(String) : [];
        if (!uids.includes(me)) throw new Error('Not allowed.');

        const cont = m.dateModeContinue && typeof m.dateModeContinue === 'object' ? m.dateModeContinue : {};
        const next = { ...cont, [me]: !!vote };
        const both = uids.length === 2 && !!next[uids[0]] && !!next[uids[1]];

        tx.update(matchRef, {
          [`dateModeContinue.${me}`]: !!vote,
          ...(both ? { dateModeUnlocked: true, dateModeUnlockedAt: serverTimestamp() } : null),
          updatedAt: serverTimestamp(),
        });
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },
};

/**
 * Chat translation: ML Kit on Android (see translateChatMessage.native.js), cloud elsewhere.
 */
