import { app, db } from '../firebase';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { COL } from './constants';
import { authService } from './authService';

export const CLUB_EVENT_TOPICS = [
  { id: 'marriage_prep', label: 'Marriage prep', emoji: '💍' },
  { id: 'city_meetup', label: 'City meetup', emoji: '🏙️' },
  { id: 'faith_circle', label: 'Faith & growth', emoji: '📿' },
  { id: 'general', label: 'Open discussion', emoji: '💬' },
];

function fn(name) {
  try {
    return httpsCallable(getFunctions(app, 'us-central1'), name);
  } catch {
    return null;
  }
}

function eventsCol(clubId) {
  return collection(db, COL.clubs, String(clubId), 'events');
}

export const clubEventService = {
  listenClubEvents(clubId, callback) {
    const cid = String(clubId || '').trim();
    if (!cid) {
      callback({ data: [], error: null });
      return () => {};
    }
    const qRef = query(eventsCol(cid), orderBy('scheduledAt', 'asc'), limit(20));
    return onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: list, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  async createEvent(clubId, { title, description, scheduledAtMs, topic = 'general', type = 'voice' }) {
    try {
      const callable = fn('createClubEvent');
      if (!callable) return { eventId: null, error: 'Events unavailable.' };
      const { data } = await callable({
        clubId: String(clubId),
        title: String(title || '').trim(),
        description: String(description || '').trim(),
        scheduledAtMs: Number(scheduledAtMs),
        topic: String(topic || 'general'),
        type: type === 'video' ? 'video' : 'voice',
      });
      return { eventId: data?.eventId || null, error: data?.error || null };
    } catch (e) {
      return { eventId: null, error: authService._callableErrorMessage(e) };
    }
  },

  async startEvent(clubId, eventId) {
    try {
      const callable = fn('startClubEvent');
      if (!callable) return { error: 'Events unavailable.' };
      const { data } = await callable({ clubId: String(clubId), eventId: String(eventId) });
      return { error: data?.error || null };
    } catch (e) {
      return { error: authService._callableErrorMessage(e) };
    }
  },

  async endEvent(clubId, eventId) {
    try {
      const callable = fn('endClubEvent');
      if (!callable) return { error: 'Events unavailable.' };
      const { data } = await callable({ clubId: String(clubId), eventId: String(eventId) });
      return { error: data?.error || null };
    } catch (e) {
      return { error: authService._callableErrorMessage(e) };
    }
  },

  async fetchEventLiveKitToken(clubId, eventId) {
    try {
      const callable = fn('getClubEventLiveKitToken');
      if (!callable) return { token: null, url: null, canPublish: false, error: 'Voice unavailable.' };
      const { data } = await callable({ clubId: String(clubId), eventId: String(eventId) });
      return {
        token: data?.token || null,
        url: data?.url || null,
        canPublish: data?.canPublish !== false,
        error: data?.error || null,
      };
    } catch (e) {
      return { token: null, url: null, canPublish: false, error: authService._callableErrorMessage(e) };
    }
  },

  buildScheduleOptions() {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    return [
      { label: 'In 1 hour', ms: now + hour },
      { label: 'In 3 hours', ms: now + 3 * hour },
      { label: 'Tomorrow evening', ms: now + 24 * hour + 2 * hour },
      { label: 'This weekend', ms: now + 48 * hour },
    ];
  },

  topicLabel(topicId) {
    return CLUB_EVENT_TOPICS.find((t) => t.id === topicId)?.label || 'Club event';
  },
};
