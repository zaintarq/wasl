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

import { reportService } from './reportService';
import { safetyService } from './safetyService';
import { messageService } from './messageService';
import { authService } from './authService';

export const clubService = {
  normalizeUsername,
  isValidUsername,

  _clubRef(clubId) {
    return doc(db, COL.clubs, String(clubId));
  },

  _membersCol(clubId) {
    return collection(db, COL.clubs, String(clubId), 'members');
  },

  _memberRef(clubId, uid) {
    return doc(db, COL.clubs, String(clubId), 'members', String(uid));
  },

  _messagesCol(clubId) {
    return collection(db, COL.clubs, String(clubId), 'messages');
  },

  _micRequestsCol(clubId) {
    return collection(db, COL.clubs, String(clubId), 'micRequests');
  },

  _membershipRef(uid, clubId) {
    return doc(db, COL.users, String(uid), 'clubMemberships', String(clubId));
  },

  async lookupUsername(username) {
    const key = normalizeUsername(username);
    if (!key) return { uid: null, error: 'Enter a username.' };
    try {
      const snap = await getDoc(doc(db, COL.usernames, key));
      if (!snap.exists()) return { uid: null, error: 'Username not found.' };
      return { uid: String(snap.data()?.uid || ''), error: null };
    } catch (e) {
      return { uid: null, error: e?.message || String(e) };
    }
  },

  listenPublicClubs(callback) {
    const qRef = query(
      collection(db, COL.clubs),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenMyMemberships(uid, callback) {
    const qRef = query(
      collection(db, COL.users, String(uid), 'clubMemberships'),
      orderBy('joinedAt', 'desc')
    );
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ clubId: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenClub(clubId, callback) {
    return onSnapshot(
      this._clubRef(clubId),
      (snap) => {
        if (!snap.exists()) callback({ data: null, error: 'Club not found.' });
        else callback({ data: { id: snap.id, ...snap.data() }, error: null });
      },
      (error) => callback({ data: null, error: error?.message || String(error) })
    );
  },

  listenMembers(clubId, callback) {
    const qRef = query(this._membersCol(clubId), orderBy('joinedAt', 'asc'));
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenMessages(clubId, callback, limitCount = 80) {
    const qRef = query(this._messagesCol(clubId), orderBy('createdAt', 'desc'), limit(limitCount));
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenMicRequests(clubId, callback) {
    const qRef = query(this._micRequestsCol(clubId), orderBy('requestedAt', 'asc'));
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  async createClub(ownerUid, payload = {}) {
    const uid = String(ownerUid || '').trim();
    const name = String(payload.name || '').trim();
    const description = String(payload.description || '').trim();
    const isPublic = payload.isPublic !== false;
    const micMode = ['open', 'request', 'admin_only'].includes(payload.micMode) ? payload.micMode : 'request';

    if (!uid) return { clubId: null, error: 'Not signed in.' };
    if (!name || name.length < 2) return { clubId: null, error: 'Club name is too short.' };

    const inviteCode = randomInviteCode();
    const clubRef = doc(collection(db, COL.clubs));

    // Sequential writes (not one transaction): security rules evaluate each write
    // independently, so get(clubs/{id}) inside rules cannot see a club doc created
    // in the same transaction batch.
    try {
      await setDoc(clubRef, {
        name,
        description,
        ownerUid: uid,
        isPublic,
        micMode,
        inviteCode,
        memberCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await setDoc(this._memberRef(clubRef.id, uid), {
          uid,
          role: 'owner',
          canSpeak: true,
          joinedAt: serverTimestamp(),
        });
        await setDoc(this._membershipRef(uid, clubRef.id), {
          clubId: clubRef.id,
          role: 'owner',
          joinedAt: serverTimestamp(),
        });
      } catch (inner) {
        await deleteDoc(clubRef).catch(() => {});
        throw inner;
      }
      return { clubId: clubRef.id, inviteCode, error: null };
    } catch (e) {
      return { clubId: null, error: e?.message || String(e) };
    }
  },

  async updateClubSettings(clubId, actorUid, patch = {}) {
    const cid = String(clubId || '').trim();
    const uid = String(actorUid || '').trim();
    if (!cid || !uid) return { error: 'Missing club.' };

    const updates = { updatedAt: serverTimestamp() };
    if (typeof patch.name === 'string' && patch.name.trim().length >= 2) {
      updates.name = patch.name.trim();
    }
    if (typeof patch.description === 'string') {
      updates.description = patch.description.trim();
    }
    if (typeof patch.isPublic === 'boolean') {
      updates.isPublic = patch.isPublic;
    }
    if (['open', 'request', 'admin_only'].includes(patch.micMode)) {
      updates.micMode = patch.micMode;
    }

    if (Object.keys(updates).length <= 1) {
      return { error: 'Nothing to update.' };
    }

    try {
      const memberSnap = await getDoc(this._memberRef(cid, uid));
      const role = String(memberSnap.data()?.role || '');
      if (!memberSnap.exists() || !['owner', 'admin'].includes(role)) {
        return { error: 'Only club admins can change settings.' };
      }
      await updateDoc(this._clubRef(cid), updates);
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async joinClub(uid, clubId, inviteCode = '', options = {}) {
    const me = String(uid || '').trim();
    const cid = String(clubId || '').trim();
    const adminInvite = !!options.adminInvite;
    if (!me || !cid) return { error: 'Missing club.' };

    try {
      await runTransaction(db, async (tx) => {
        const clubSnap = await tx.get(this._clubRef(cid));
        if (!clubSnap.exists()) throw new Error('Club not found.');
        const club = clubSnap.data() || {};
        if (!club.isPublic && !adminInvite) {
          const code = String(inviteCode || '').trim().toUpperCase();
          if (!code || code !== String(club.inviteCode || '').toUpperCase()) {
            throw new Error('Invalid invite code for this private club.');
          }
        }
        const memberSnap = await tx.get(this._memberRef(cid, me));
        if (memberSnap.exists()) return;

        const canSpeak = club.micMode === 'open';
        tx.set(this._memberRef(cid, me), {
          uid: me,
          role: 'member',
          canSpeak,
          joinedAt: serverTimestamp(),
        });
        tx.set(this._membershipRef(me, cid), {
          clubId: cid,
          role: 'member',
          joinedAt: serverTimestamp(),
        });
        const currentCount = Number(club.memberCount || 0);
        tx.update(this._clubRef(cid), {
          memberCount: Math.max(1, currentCount + 1),
          updatedAt: serverTimestamp(),
        });
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async leaveClub(uid, clubId) {
    const me = String(uid || '').trim();
    const cid = String(clubId || '').trim();
    if (!me || !cid) return { error: 'Missing club.' };

    try {
      await runTransaction(db, async (tx) => {
        const memberSnap = await tx.get(this._memberRef(cid, me));
        if (!memberSnap.exists()) return;
        const role = String(memberSnap.data()?.role || '');
        if (role === 'owner') throw new Error('Owners cannot leave — transfer ownership or delete the club first.');

        tx.delete(this._memberRef(cid, me));
        tx.delete(this._membershipRef(me, cid));
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async sendMessage(clubId, uid, text) {
    const cid = String(clubId || '').trim();
    const me = String(uid || '').trim();
    const t = String(text || '').trim();
    if (!cid || !me || !t) return { error: 'Message empty.' };
    if (t.length > 2000) return { error: 'Message too long.' };

    const mod = moderateMessageText(t);
    try {
      const msgRef = await addDoc(this._messagesCol(cid), {
        fromUid: me,
        text: t.slice(0, 2000),
        clubId: cid,
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
            details: `club:${cid} ${t}`,
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

  /** Pre-send profanity block — same cloud function as match chat. */
  async checkMessageToxicity(clubId, text) {
    return messageService.checkMessageToxicity(null, text, { clubId: String(clubId || '') || null });
  },

  async requestMic(clubId, uid) {
    try {
      await setDoc(
        doc(db, COL.clubs, String(clubId), 'micRequests', String(uid)),
        { uid: String(uid), requestedAt: serverTimestamp() },
        { merge: true }
      );
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async grantMic(clubId, targetUid) {
    try {
      await updateDoc(this._memberRef(clubId, targetUid), { canSpeak: true });
      await deleteDoc(doc(db, COL.clubs, String(clubId), 'micRequests', String(targetUid))).catch(() => {});
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async revokeMic(clubId, targetUid) {
    try {
      await updateDoc(this._memberRef(clubId, targetUid), { canSpeak: false });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async setMemberRole(clubId, targetUid, role) {
    const r = ['admin', 'member'].includes(role) ? role : null;
    if (!r) return { error: 'Invalid role.' };
    try {
      await updateDoc(this._memberRef(clubId, targetUid), { role: r });
      await updateDoc(this._membershipRef(targetUid, clubId), { role: r });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async kickMember(clubId, targetUid) {
    const cid = String(clubId);
    const target = String(targetUid);
    try {
      await runTransaction(db, async (tx) => {
        const memberSnap = await tx.get(this._memberRef(cid, target));
        if (!memberSnap.exists()) return;
        if (String(memberSnap.data()?.role || '') === 'owner') throw new Error('Cannot remove the owner.');
        tx.delete(this._memberRef(cid, target));
        tx.delete(this._membershipRef(target, cid));
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async addMemberByUsername(clubId, username) {
    const { uid, error } = await this.lookupUsername(username);
    if (error || !uid) return { error: error || 'User not found.' };
    return this.joinClub(uid, clubId, '', { adminInvite: true });
  },

  async fetchClubLiveKitToken(clubId) {
    const cid = String(clubId || '').trim();
    if (!cid) return { token: null, url: null, roomName: null, canPublish: false, error: 'Missing club.' };
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'getClubLiveKitToken');
      const result = await fn({ clubId: cid });
      const d = result.data || {};
      return {
        token: d.token || null,
        url: d.url || null,
        roomName: d.roomName || null,
        canPublish: !!d.canPublish,
        error: null,
      };
    } catch (e) {
      return {
        token: null,
        url: null,
        roomName: null,
        canPublish: false,
        error: authService._callableErrorMessage(e),
      };
    }
  },
};

