import { app, db } from '../firebase';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { COL } from './constants';
import { authService } from './authService';

function fn(name) {
  try {
    return httpsCallable(getFunctions(app, 'us-central1'), name);
  } catch {
    return null;
  }
}

export const successStoryService = {
  listenPublishedStories(callback, { limitCount = 40 } = {}) {
    const qRef = query(
      collection(db, COL.successStories),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
      limit(limitCount)
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

  listenAdminStories(callback) {
    const qRef = query(collection(db, COL.successStories), orderBy('createdAt', 'desc'), limit(80));
    return onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: list, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  async submitStory({ body, city = '', metVia = 'match' }) {
    try {
      const callable = fn('submitSuccessStory');
      if (!callable) return { error: 'Submissions unavailable.' };
      const { data } = await callable({
        body: String(body || '').trim(),
        city: String(city || '').trim().slice(0, 80),
        metVia: ['match', 'club', 'live', 'other'].includes(metVia) ? metVia : 'match',
      });
      return { error: data?.error || null };
    } catch (e) {
      return { error: authService._callableErrorMessage(e) };
    }
  },

  async publishStory(storyId) {
    try {
      const callable = fn('publishSuccessStory');
      if (!callable) return { error: 'Unavailable.' };
      const { data } = await callable({ storyId: String(storyId) });
      return { error: data?.error || null };
    } catch (e) {
      return { error: authService._callableErrorMessage(e) };
    }
  },

  async rejectStory(storyId, reason = '') {
    try {
      const callable = fn('rejectSuccessStory');
      if (!callable) return { error: 'Unavailable.' };
      const { data } = await callable({ storyId: String(storyId), reason: String(reason || '') });
      return { error: data?.error || null };
    } catch (e) {
      return { error: authService._callableErrorMessage(e) };
    }
  },

  async unpublishStory(storyId) {
    try {
      const callable = fn('unpublishSuccessStory');
      if (!callable) return { error: 'Unavailable.' };
      const { data } = await callable({ storyId: String(storyId) });
      return { error: data?.error || null };
    } catch (e) {
      return { error: authService._callableErrorMessage(e) };
    }
  },
};
