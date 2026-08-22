import { db, storage } from './firebase';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function storiesCol() {
  return collection(db, 'stories');
}

function storySeenDoc(viewerUid, authorUid) {
  return doc(db, 'users', String(viewerUid), 'storySeen', String(authorUid));
}

export function toStoryMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

export async function uploadStoryImage(uid, imageUri) {
  try {
    const { normalizeImageUriForUpload } = require('../utils/normalizeImageUri.native');
    const jpegUri = await normalizeImageUriForUpload(imageUri);

    try {
      const { gateImageBeforeUpload } = require('../utils/nsfwImageGate.native');
      const gate = await gateImageBeforeUpload(jpegUri);
      if (gate.blocked) {
        return { url: null, error: gate.message || 'This photo is not allowed.' };
      }
    } catch {
      // Scanner unavailable — server moderation still applies.
    }

    const response = await fetch(jpegUri);
    const blob = await response.blob();
    const path = `stories/${uid}/${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(storageRef);
    return { url, error: null };
  } catch (error) {
    return { url: null, error: error?.message || String(error) };
  }
}

export async function createStory(uid, imageUri) {
  try {
    const userId = String(uid || '').trim();
    if (!userId) return { error: 'Not signed in.' };

    const { url, error: uploadError } = await uploadStoryImage(userId, imageUri);
    if (uploadError || !url) return { error: uploadError || 'Upload failed.' };

    const expiresAt = Timestamp.fromMillis(Date.now() + STORY_TTL_MS);
    const storyRef = await addDoc(storiesCol(), {
      userId,
      mediaUrl: url,
      mediaType: 'image',
      createdAt: serverTimestamp(),
      expiresAt,
    });

    return { id: storyRef.id, error: null };
  } catch (error) {
    return { id: null, error: error?.message || String(error) };
  }
}

export async function deleteStory(storyId, uid) {
  try {
    const snap = await getDoc(doc(db, 'stories', String(storyId)));
    if (!snap.exists()) return { error: null };
    if (String(snap.data()?.userId) !== String(uid)) return { error: 'Not allowed.' };
    await deleteDoc(doc(db, 'stories', String(storyId)));
    return { error: null };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

export function listenActiveStories(callback) {
  const qRef = query(storiesCol(), where('expiresAt', '>', Timestamp.now()));
  return onSnapshot(
    qRef,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback({ data: list, error: null });
    },
    (error) => callback({ data: [], error: error.message })
  );
}

export function listenStorySeen(viewerUid, callback) {
  const uid = String(viewerUid || '').trim();
  if (!uid) {
    callback({ data: {}, error: null });
    return () => {};
  }
  const qRef = collection(db, 'users', uid, 'storySeen');
  return onSnapshot(
    qRef,
    (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data() || {};
      });
      callback({ data: map, error: null });
    },
    (error) => callback({ data: {}, error: error.message })
  );
}

export async function markAuthorStoriesSeen(viewerUid, authorUid, latestStoryId) {
  try {
    await setDoc(
      storySeenDoc(viewerUid, authorUid),
      {
        latestStoryId: String(latestStoryId),
        seenAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { error: null };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

function storyViewsCol(storyId) {
  return collection(db, 'stories', String(storyId), 'views');
}

/** Record that the signed-in user viewed a story (for author insights). */
export async function recordStoryView(storyId, viewerUid, viewerName = 'User') {
  try {
    const sid = String(storyId || '').trim();
    const vid = String(viewerUid || '').trim();
    if (!sid || !vid) return { error: 'Missing ids.' };
    await setDoc(
      doc(db, 'stories', sid, 'views', vid),
      {
        viewerUid: vid,
        viewerName: String(viewerName || 'User').trim().slice(0, 80),
        viewedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { error: null };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

/** Live list of viewers for one story (author only per rules). */
export function listenStoryViewers(storyId, callback) {
  const sid = String(storyId || '').trim();
  if (!sid) {
    callback({ data: [], error: null });
    return () => {};
  }
  const qRef = storyViewsCol(sid);
  return onSnapshot(
    qRef,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => toStoryMillis(b.viewedAt) - toStoryMillis(a.viewedAt));
      callback({ data: list, error: null });
    },
    (error) => callback({ data: [], error: error.message })
  );
}

/** Human-readable age + time-left for story header UI. */
export function formatStoryTiming(story, nowMs = Date.now()) {
  const created = toStoryMillis(story?.createdAt);
  const expires = toStoryMillis(story?.expiresAt) || created + STORY_TTL_MS;
  if (!created) {
    return { ageLabel: 'Just posted', leftLabel: '24h left', expired: false };
  }

  const ageMs = Math.max(0, nowMs - created);
  const leftMs = Math.max(0, expires - nowMs);
  const expired = leftMs <= 0;

  const fmt = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h <= 0 && m <= 0) return 'Just now';
    if (h <= 0) return `${m}m`;
    if (m <= 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const ageLabel =
    ageMs < 60000 ? 'Just posted' : `${fmt(ageMs)} ago`;
  const leftLabel = expired ? 'Expired' : `${fmt(leftMs)} left`;

  return { ageLabel, leftLabel, expired, leftMs, ageMs };
}

/**
 * Group raw story docs by author, sorted oldest→newest per author.
 */
export function groupStoriesByUser(stories) {
  const map = new Map();
  for (const story of stories || []) {
    const userId = String(story?.userId || '');
    if (!userId) continue;
    if (!map.has(userId)) map.set(userId, []);
    map.get(userId).push(story);
  }

  return Array.from(map.entries()).map(([userId, items]) => {
    const sorted = items.sort((a, b) => toStoryMillis(a.createdAt) - toStoryMillis(b.createdAt));
    const latest = sorted[sorted.length - 1];
    return {
      userId,
      stories: sorted,
      latestStoryId: latest?.id || null,
      previewUrl: latest?.mediaUrl || '',
    };
  });
}

export function buildStoryRowItems({ storyGroups, usersById, viewerUid, seenMap, me }) {
  const myUid = String(viewerUid || '');
  const items = (storyGroups || [])
    .filter((g) => g.userId !== myUid)
    .map((group) => {
      const user = usersById[group.userId] || {};
      const name = user?.name || user?.displayName || 'User';
      const avatar = Array.isArray(user?.images) ? user.images[0] : user?.photoURL || '';
      const seenRecord = seenMap?.[group.userId];
      const hasUnseen =
        !seenRecord?.latestStoryId || String(seenRecord.latestStoryId) !== String(group.latestStoryId);

      return {
        id: group.userId,
        userId: group.userId,
        name,
        uri: avatar || group.previewUrl || '',
        initial: String(name).charAt(0).toUpperCase(),
        hasUnseen,
        stories: group.stories,
        latestStoryId: group.latestStoryId,
      };
    });

  items.sort((a, b) => {
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const myGroups = (storyGroups || []).filter((g) => g.userId === myUid);
  const myLatest = myGroups[0]?.latestStoryId || null;

  return {
    items,
    myActiveStoryCount: myGroups[0]?.stories?.length || 0,
    myLatestStoryId: myLatest,
    myPreviewUrl: myGroups[0]?.previewUrl || '',
  };
}
