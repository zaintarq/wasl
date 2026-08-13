import { app, auth, db } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

const MEHRAM_COL = 'mehramAccess';

function fn(name) {
  const functions = getFunctions(app, 'us-central1');
  return httpsCallable(functions, name);
}

export const mehramService = {
  async createInvite(matchId, permission = 'view') {
    try {
      const { data } = await fn('createMehramInvite')({
        matchId: String(matchId),
        permission: permission === 'reply' ? 'reply' : 'view',
      });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async regenerateInvite(matchId) {
    try {
      const { data } = await fn('regenerateMehramInvite')({ matchId: String(matchId) });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async updatePermission(matchId, permission) {
    try {
      const { data } = await fn('updateMehramPermission')({
        matchId: String(matchId),
        permission: permission === 'reply' ? 'reply' : 'view',
      });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async revokeAccess(matchId) {
    try {
      const { data } = await fn('revokeMehramAccess')({ matchId: String(matchId) });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async exchangeToken(token) {
    try {
      const { data } = await fn('exchangeMehramToken')({ token: String(token) });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  listenMehramAccess(accessId, callback) {
    if (!accessId) return () => {};
    const ref = doc(db, MEHRAM_COL, String(accessId));
    return onSnapshot(
      ref,
      (snap) => callback({ data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null }),
      (err) => callback({ data: null, error: err?.message || String(err) })
    );
  },

  listenMessages(matchId, callback) {
    const qRef = query(
      collection(db, 'matches', String(matchId), 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(
      qRef,
      (snap) => callback({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), error: null }),
      (err) => callback({ data: [], error: err?.message || String(err) })
    );
  },

  async sendMehramMessage(matchId, accessId, girlUserId, text) {
    try {
      const trimmed = String(text || '').trim();
      if (!trimmed) return { error: 'Message is empty.' };
      await addDoc(collection(db, 'matches', String(matchId), 'messages'), {
        fromUid: String(girlUserId),
        senderType: 'mehram',
        mehramAccessId: String(accessId),
        type: 'text',
        text: trimmed,
        replyTo: null,
        reactions: {},
        editedAt: null,
        deletedAt: null,
        readAt: null,
        createdAt: serverTimestamp(),
        moderation: { flagged: false },
      });
      await updateDoc(doc(db, 'matches', String(matchId)), {
        lastMessageAt: serverTimestamp(),
        lastMessageText: trimmed,
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async heartbeat() {
    try {
      const { data } = await fn('mehramHeartbeat')({});
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async leaveSession() {
    try {
      const { data } = await fn('mehramLeaveSession')({});
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async blockGuy() {
    try {
      const { data } = await fn('mehramBlockGuy')({});
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async reportGuy({ reason = 'inappropriate', details = '' } = {}) {
    try {
      const { data } = await fn('mehramReportGuy')({ reason, details });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  /** Girl eligible if profile gender is female */
  isGirlUser(user) {
    return String(user?.gender || '').toLowerCase() === 'female';
  },

  mehramLabel(mehramMeta, message) {
    if (String(message?.senderType || '') !== 'mehram') return null;
    const name = mehramMeta?.girlDisplayName || 'Her';
    return `👤 ${name}'s Mehram`;
  },

  formatExpiresAt(ms) {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  },
};

export { auth };
