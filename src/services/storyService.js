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
import { verifyUploadedImage } from './imageModerationService';
import { matchService, messageService } from './firebase/index';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const STORY_VIDEO_MAX_MS = 30 * 1000;
export const STORY_REACTION_EMOJIS = ['❤️', '😂', '🔥', '👍', '😮', '🙏'];

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

    const response = await fetch(jpegUri);
    const blob = await response.blob();
    const path = `stories/${uid}/${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });

    const moderation = await verifyUploadedImage(path);
    if (!moderation.allowed) {
      return { url: null, path, error: moderation.message || 'This photo is not allowed.' };
    }

    const url = await getDownloadURL(storageRef);
    return { url, path, error: null };
  } catch (error) {
    return { url: null, error: error?.message || String(error) };
  }
}

export async function uploadStoryVideo(uid, videoUri, durationMs = 0) {
  try {
    const response = await fetch(videoUri);
    const blob = await response.blob();
    const path = `stories/${uid}/${Date.now()}.mp4`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'video/mp4' });
    const url = await getDownloadURL(storageRef);
    return { url, path, durationMs, error: null };
  } catch (error) {
    return { url: null, durationMs: 0, error: error?.message || String(error) };
  }
}

function normalizeStoryMediaInput(mediaInput) {
  if (typeof mediaInput === 'string') {
    return { uri: mediaInput, mediaType: 'image' };
  }
  return {
    uri: String(mediaInput?.uri || ''),
    mediaType: mediaInput?.mediaType === 'video' ? 'video' : 'image',
    durationMs: Number(mediaInput?.durationMs || 0),
  };
}

export async function createStory(uid, mediaInput) {
  try {
    const userId = String(uid || '').trim();
    if (!userId) return { error: 'Not signed in.' };

    const media = normalizeStoryMediaInput(mediaInput);
    if (!media.uri) return { error: 'Missing media.' };

    let mediaUrl = null;
    let durationMs = null;

    if (media.mediaType === 'video') {
      if (media.durationMs > STORY_VIDEO_MAX_MS + 500) {
        return { error: 'Videos must be 30 seconds or less.' };
      }
      const { url, durationMs: uploadedDuration, error: uploadError } = await uploadStoryVideo(
        userId,
        media.uri,
        media.durationMs
      );
      if (uploadError || !url) {
        return { error: uploadError || 'Video upload failed.' };
      }
      mediaUrl = url;
      durationMs = uploadedDuration || media.durationMs || STORY_VIDEO_MAX_MS;
    } else {
      const { url, error: uploadError } = await uploadStoryImage(userId, media.uri);
      if (uploadError || !url) {
        return { error: uploadError || 'Upload failed.' };
      }
      mediaUrl = url;
    }

    const expiresAt = Timestamp.fromMillis(Date.now() + STORY_TTL_MS);
    const payload = {
      userId,
      mediaUrl,
      mediaType: media.mediaType,
      createdAt: serverTimestamp(),
      expiresAt,
    };
    if (media.mediaType === 'video' && durationMs) {
      payload.durationMs = durationMs;
    }

    const storyRef = await addDoc(storiesCol(), payload);
    return { id: storyRef.id, error: null };
  } catch (error) {
    return { id: null, error: error?.message || String(error) };
  }
}

/** Reply to a story — opens or reuses a DM thread with story context attached. */
export async function sendStoryReply({
  fromUid,
  toUid,
  storyId,
  storyMediaUrl,
  storyMediaType = 'image',
  authorName = 'User',
  text,
}) {
  try {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { matchId: null, error: 'Message is empty.' };

    const from = String(fromUid || '').trim();
    const to = String(toUid || '').trim();
    if (!from || !to) return { matchId: null, error: 'Missing user.' };

    const { matchId, error: matchErr } = await matchService.startDirectMessage(from, to);
    if (matchErr || !matchId) {
      return { matchId: null, error: matchErr || 'Could not start chat.' };
    }

    const { error: msgErr } = await messageService.sendMessage(matchId, from, trimmed, {
      replyTo: {
        kind: 'story',
        storyId: String(storyId || ''),
        mediaUrl: String(storyMediaUrl || ''),
        mediaType: storyMediaType === 'video' ? 'video' : 'image',
        authorUid: to,
        authorName: String(authorName || 'User').slice(0, 80),
      },
    });

    if (msgErr) return { matchId, error: msgErr };
    return { matchId, error: null };
  } catch (error) {
    return { matchId: null, error: error?.message || String(error) };
  }
}

function storyReactionsCol(storyId) {
  return collection(db, 'stories', String(storyId), 'reactions');
}

/** Quick emoji reaction on a story (one per viewer; overwrites previous). */
export async function setStoryReaction(storyId, viewerUid, viewerName, emoji) {
  try {
    const sid = String(storyId || '').trim();
    const vid = String(viewerUid || '').trim();
    const e = String(emoji || '').trim();
    if (!sid || !vid || !e) return { error: 'Missing reaction.' };
    if (!STORY_REACTION_EMOJIS.includes(e)) return { error: 'Invalid emoji.' };

    await setDoc(
      doc(db, 'stories', sid, 'reactions', vid),
      {
        viewerUid: vid,
        viewerName: String(viewerName || 'User').trim().slice(0, 80),
        emoji: e,
        reactedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { error: null };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

/** Live reactions on a story (author insights). */
export function listenStoryReactions(storyId, callback) {
  const sid = String(storyId || '').trim();
  if (!sid) {
    callback({ data: [], error: null });
    return () => {};
  }
  return onSnapshot(
    storyReactionsCol(sid),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback({ data: list, error: null });
    },
    (error) => callback({ data: [], error: error.message })
  );
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

  const ageLabel = ageMs < 60000 ? 'Just posted' : `${fmt(ageMs)} ago`;
  const leftLabel = expired ? 'Expired' : `${fmt(leftMs)} left`;

  return { ageLabel, leftLabel, expired, leftMs, ageMs };
}

function normalizeHiddenFrom(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return { uid: entry, label: entry };
      return {
        uid: String(entry?.uid || ''),
        label: String(entry?.label || entry?.name || entry?.uid || ''),
      };
    })
    .filter((e) => e.uid);
}

function viewerIsHiddenFromAuthor(viewerUid, authorUser) {
  const hidden = normalizeHiddenFrom(authorUser?.storyHiddenFrom);
  return hidden.some((e) => String(e.uid) === String(viewerUid));
}

/** Live story privacy (hide list) for the signed-in author. */
export function listenStoryPrivacy(ownerUid, callback) {
  const uid = String(ownerUid || '').trim();
  if (!uid) {
    callback({ data: { hiddenFrom: [] }, error: null });
    return () => {};
  }
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      callback({
        data: { hiddenFrom: normalizeHiddenFrom(data.storyHiddenFrom) },
        error: null,
      });
    },
    (error) => callback({ data: { hiddenFrom: [] }, error: error.message })
  );
}

export async function addStoryHiddenFrom(ownerUid, targetUid, label = '') {
  try {
    const owner = String(ownerUid || '').trim();
    const target = String(targetUid || '').trim();
    if (!owner || !target) return { error: 'Missing user.' };
    if (owner === target) return { error: 'Cannot hide from yourself.' };

    const snap = await getDoc(doc(db, 'users', owner));
    const current = normalizeHiddenFrom(snap.exists() ? snap.data()?.storyHiddenFrom : []);
    if (current.some((e) => e.uid === target)) return { error: null };

    await setDoc(
      doc(db, 'users', owner),
      {
        storyHiddenFrom: [...current, { uid: target, label: String(label || target).slice(0, 40) }],
      },
      { merge: true }
    );
    return { error: null };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

export async function removeStoryHiddenFrom(ownerUid, targetUid) {
  try {
    const owner = String(ownerUid || '').trim();
    const target = String(targetUid || '').trim();
    if (!owner || !target) return { error: 'Missing user.' };

    const snap = await getDoc(doc(db, 'users', owner));
    const current = normalizeHiddenFrom(snap.exists() ? snap.data()?.storyHiddenFrom : []);
    const next = current.filter((e) => String(e.uid) !== target);

    await setDoc(doc(db, 'users', owner), { storyHiddenFrom: next }, { merge: true });
    return { error: null };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}

export async function deleteAllMyStories(uid, stories = []) {
  try {
    const owner = String(uid || '').trim();
    if (!owner) return { error: 'Not signed in.' };
    for (const story of stories || []) {
      if (!story?.id) continue;
      const { error } = await deleteStory(story.id, owner);
      if (error) return { error };
    }
    return { error: null };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
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
    .filter((g) => {
      if (g.userId === myUid) return false;
      const author = usersById[g.userId] || {};
      return !viewerIsHiddenFromAuthor(myUid, author);
    })
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
  const myLatestStory = myGroups[0]?.stories?.[myGroups[0]?.stories?.length - 1];
  const myStoryPreview =
    myLatestStory?.mediaType === 'video' ? '' : myGroups[0]?.previewUrl || '';

  return {
    items,
    myActiveStoryCount: myGroups[0]?.stories?.length || 0,
    myLatestStoryId: myLatest,
    myPreviewUrl: myStoryPreview || (Array.isArray(me?.images) ? me.images[0] : me?.photoURL || ''),
  };
}
