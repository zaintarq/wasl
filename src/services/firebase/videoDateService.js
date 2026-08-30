import { app, db } from '../firebase';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { COL } from './constants';
import { authService } from './authService';

export const VIDEO_DATE_SESSION_MS = 15 * 60 * 1000;

function fn(name) {
  try {
    return httpsCallable(getFunctions(app, 'us-central1'), name);
  } catch {
    return null;
  }
}

export const videoDateService = {
  async proposeVideoDate(matchId, scheduledAtMs, { mehramInvited = false } = {}) {
    try {
      const callable = fn('proposeMatchVideoDate');
      if (!callable) return { sessionId: null, error: 'Video dates unavailable.' };
      const { data } = await callable({
        matchId: String(matchId),
        scheduledAtMs: Number(scheduledAtMs),
        mehramInvited: !!mehramInvited,
      });
      return { sessionId: data?.sessionId || null, error: data?.error || null };
    } catch (e) {
      return { sessionId: null, error: authService._callableErrorMessage(e) };
    }
  },

  async respondVideoDate(sessionId, accept = true) {
    try {
      const callable = fn('respondMatchVideoDate');
      if (!callable) return { status: null, error: 'Video dates unavailable.' };
      const { data } = await callable({ sessionId: String(sessionId), accept: !!accept });
      return { status: data?.status || null, error: data?.error || null };
    } catch (e) {
      return { status: null, error: authService._callableErrorMessage(e) };
    }
  },

  async activateVideoDate(sessionId) {
    try {
      const callable = fn('activateMatchVideoDate');
      if (!callable) return { status: null, error: 'Video dates unavailable.' };
      const { data } = await callable({ sessionId: String(sessionId) });
      return { status: data?.status || null, sessionId: data?.sessionId || sessionId, error: data?.error || null };
    } catch (e) {
      return { status: null, error: authService._callableErrorMessage(e) };
    }
  },

  async endVideoDate(sessionId) {
    try {
      const callable = fn('endMatchVideoDate');
      if (!callable) return { error: 'Video dates unavailable.' };
      await callable({ sessionId: String(sessionId) });
      return { error: null };
    } catch (e) {
      return { error: authService._callableErrorMessage(e) };
    }
  },

  async fetchLiveKitToken(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return { token: null, url: null, roomName: null, error: 'Missing session.' };
    try {
      const callable = fn('getMatchVideoLiveKitToken');
      if (!callable) {
        return { token: null, url: null, roomName: null, error: 'Video dates unavailable.' };
      }
      const result = await callable({ sessionId: sid });
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

  listenMatchVideoSessions(matchId, callback) {
    const mid = String(matchId || '').trim();
    if (!mid) {
      callback({ data: [], error: null });
      return () => {};
    }
    const qRef = query(
      collection(db, COL.matchVideoSessions),
      where('matchId', '==', mid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );
    return onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: list, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  /** Preset schedule options from chat UI */
  buildScheduleOptions() {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    return [
      { label: 'In 30 minutes', ms: now + 30 * 60 * 1000 },
      { label: 'In 1 hour', ms: now + hour },
      { label: 'In 3 hours', ms: now + 3 * hour },
      { label: 'Tomorrow evening', ms: now + 24 * hour + 2 * hour },
    ];
  },
};
