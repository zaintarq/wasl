import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { app, auth, db } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

const MEHRAM_COL = 'mehramAccess';
const MEHRAM_SESSION_KEY = '@huzz/mehram_session_v1';

function fn(name) {
  const functions = getFunctions(app, 'us-central1');
  return httpsCallable(functions, name);
}

export const mehramService = {
  isMehramUid(uid) {
    return String(uid || '').startsWith('mehram_');
  },

  async persistSession(session) {
    if (!session?.accessId) return;
    await AsyncStorage.setItem(MEHRAM_SESSION_KEY, JSON.stringify(session));
  },

  async loadSession() {
    try {
      const raw = await AsyncStorage.getItem(MEHRAM_SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async clearSession() {
    await AsyncStorage.removeItem(MEHRAM_SESSION_KEY);
  },

  /** Open invite link in app — exchanges token and signs in as Mehram supervisor. */
  async signInFromInvite(token) {
    try {
      const { data, error } = await this.exchangeToken(token);
      if (error || !data?.customToken) {
        return { data: null, error: error || 'Invalid invitation link.' };
      }
      await signInWithCustomToken(auth, data.customToken);
      const session = {
        accessId: data.accessId,
        matchId: data.matchId,
        permission: data.permission === 'reply' ? 'reply' : 'view',
        girlUserId: data.girlUserId,
        guyUserId: data.guyUserId,
        girlDisplayName: data.girlDisplayName || 'Her',
        guyDisplayName: data.guyDisplayName || 'User',
        expiresAt: data.expiresAt || null,
      };
      await this.persistSession(session);
      return { data: session, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async signOutMehram() {
    try {
      await this.leaveSession().catch(() => {});
    } catch {
      /* ignore */
    }
    await this.clearSession();
    await signOut(auth);
  },

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
      await fn('mehramSendMessage')({ text: trimmed });
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
