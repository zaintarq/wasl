const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
const PRESENCE_COOLDOWN_MS = 30 * 60 * 1000;

async function sendExpoPush(toUid, { title, body, data = {}, channelId = 'default' }) {
  try {
    const snap = await db.collection('users').doc(String(toUid)).get();
    const token = String(snap.data()?.expoPushToken || '').trim();
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      return { sent: false, reason: 'no_token' };
    }
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          to: token,
          sound: 'default',
          title: String(title || 'Wasl'),
          body: String(body || ''),
          data,
          priority: 'high',
          channelId,
          badge: 1,
        },
      ]),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('[pushNotifications] expo HTTP', res.status, text);
      return { sent: false, reason: 'http_error' };
    }
    const json = await res.json();
    const status = json?.data?.[0]?.status || json?.data?.status;
    if (status === 'error') {
      console.warn('[pushNotifications] expo API', json?.data?.[0]?.message || json?.data?.message);
      return { sent: false, reason: 'expo_error' };
    }
    return { sent: true };
  } catch (e) {
    console.warn('[pushNotifications] expo push failed', e?.message || e);
    return { sent: false, reason: 'exception' };
  }
}

async function createInAppNotification(toUid, payload) {
  await db.collection('users').doc(String(toUid)).collection('notifications').add({
    toUid: String(toUid),
    fromUid: payload.fromUid ? String(payload.fromUid) : null,
    type: String(payload.type || ''),
    title: String(payload.title || ''),
    body: String(payload.body || ''),
    matchId: payload.matchId ? String(payload.matchId) : null,
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

exports.onStoryViewCreated = functions
  .region('us-central1')
  .firestore.document('stories/{storyId}/views/{viewerUid}')
  .onCreate(async (snap, context) => {
    const { storyId, viewerUid } = context.params;
    const view = snap.data() || {};

    const storySnap = await db.collection('stories').doc(String(storyId)).get();
    if (!storySnap.exists) return null;

    const authorUid = String(storySnap.data()?.userId || '');
    if (!authorUid || authorUid === String(viewerUid)) return null;

    const viewerName = String(view?.viewerName || 'Someone').trim().slice(0, 80);
    const payload = {
      type: 'story_viewed',
      fromUid: String(viewerUid),
      title: 'Story view',
      body: `${viewerName} viewed your story`,
      matchId: null,
    };

    await createInAppNotification(authorUid, payload);
    await sendExpoPush(authorUid, {
      title: payload.title,
      body: payload.body,
      data: payload,
    });
    return null;
  });

exports.onStoryReactionWritten = functions
  .region('us-central1')
  .firestore.document('stories/{storyId}/reactions/{viewerUid}')
  .onWrite(async (change, context) => {
    if (!change.after.exists) return null;

    const { storyId, viewerUid } = context.params;
    const reaction = change.after.data() || {};
    const emoji = String(reaction.emoji || '').trim();
    if (!emoji) return null;

    const beforeEmoji = change.before.exists ? String(change.before.data()?.emoji || '').trim() : '';
    if (beforeEmoji === emoji) return null;

    const storySnap = await db.collection('stories').doc(String(storyId)).get();
    if (!storySnap.exists) return null;

    const authorUid = String(storySnap.data()?.userId || '');
    if (!authorUid || authorUid === String(viewerUid)) return null;

    const viewerName = String(reaction.viewerName || 'Someone').trim().slice(0, 80);
    const payload = {
      type: 'story_reaction',
      fromUid: String(viewerUid),
      title: 'Story reaction',
      body: `${viewerName} reacted ${emoji} to your story`,
      matchId: null,
      storyId: String(storyId),
    };

    await createInAppNotification(authorUid, payload);
    await sendExpoPush(authorUid, {
      title: payload.title,
      body: payload.body,
      data: payload,
    });
    return null;
  });

/**
 * Chat message push — runs on Firestore write so delivery works when sender closes the app.
 */
exports.onChatMessageCreated = functions
  .region('us-central1')
  .firestore.document('matches/{matchId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const { matchId } = context.params;
    const msg = snap.data() || {};
    const fromUid = String(msg.fromUid || '').trim();
    if (!fromUid) return null;

    const matchSnap = await db.collection('matches').doc(String(matchId)).get();
    if (!matchSnap.exists) return null;

    const match = matchSnap.data() || {};
    const uids = Array.isArray(match.uids) ? match.uids.map(String) : [];
    const recipientUid = uids.find((u) => u && u !== fromUid);
    if (!recipientUid) return null;

    const recipientSnap = await db.collection('users').doc(recipientUid).get();
    const recipient = recipientSnap.data() || {};
    const activeMatch = String(recipient.activeChatMatchId || '');
    const activeAtRaw = recipient.activeChatAt;
    const activeAt =
      typeof activeAtRaw?.toMillis === 'function'
        ? activeAtRaw.toMillis()
        : typeof activeAtRaw === 'number'
          ? activeAtRaw
          : 0;
    if (activeMatch === String(matchId) && Date.now() - activeAt < 60 * 1000) {
      return null;
    }

    const senderSnap = await db.collection('users').doc(fromUid).get();
    const sender = senderSnap.exists ? senderSnap.data() || {} : {};
    const senderName = String(sender.name || sender.displayName || 'Someone').trim().slice(0, 40);

    let body = '';
    if (msg.deletedAt) return null;
    if (String(msg.type || 'text') === 'voice') {
      body = '🎙️ Voice note';
    } else {
      const text = String(msg.text || '').trim();
      if (!text) return null;
      body = text.length > 120 ? `${text.slice(0, 117)}...` : text;
    }

    const payload = {
      type: 'message_new',
      fromUid,
      matchId: String(matchId),
      messageId: String(context.params.messageId),
    };

    await sendExpoPush(recipientUid, {
      title: senderName,
      body,
      data: payload,
      channelId: 'messages',
    });

    return null;
  });

exports.onUserPresenceUpdate = functions
  .region('us-central1')
  .firestore.document('users/{uid}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeMs = before.lastSeen?.toMillis?.() || 0;
    const afterMs = after.lastSeen?.toMillis?.() || 0;
    if (!afterMs || afterMs <= beforeMs) return null;

    const now = Date.now();
    const wasOffline = !beforeMs || now - beforeMs > ONLINE_THRESHOLD_MS;
    const isOnline = now - afterMs < ONLINE_THRESHOLD_MS;
    if (!wasOffline || !isOnline) return null;

    const lastBroadcast = after.lastOnlineBroadcastAt?.toMillis?.() || 0;
    if (now - lastBroadcast < 2 * 60 * 1000) return null;

    const uid = String(context.params.uid);
    const displayName = String(after.name || after.displayName || 'Your match').slice(0, 80);

    const matchesSnap = await db
      .collection('matches')
      .where('uids', 'array-contains', uid)
      .where('status', '==', 'active')
      .limit(40)
      .get();

    for (const matchDoc of matchesSnap.docs) {
      const m = matchDoc.data() || {};
      const uids = Array.isArray(m.uids) ? m.uids.map(String) : [];
      const otherUid = uids.find((u) => u && u !== uid);
      if (!otherUid || otherUid === uid) continue;

      const recipientSnap = await db.collection('users').doc(otherUid).get();
      const recipient = recipientSnap.data() || {};
      const recipientLastSeen = recipient.lastSeen?.toMillis?.() || 0;
      if (recipientLastSeen && now - recipientLastSeen < ONLINE_THRESHOLD_MS) {
        continue;
      }
      const activeAtRaw = recipient.activeChatAt;
      const activeAt =
        typeof activeAtRaw?.toMillis === 'function'
          ? activeAtRaw.toMillis()
          : typeof activeAtRaw === 'number'
            ? activeAtRaw
            : 0;
      if (activeAt && now - activeAt < 2 * 60 * 1000) {
        continue;
      }

      const cooldownRef = db
        .collection('users')
        .doc(otherUid)
        .collection('presenceNotifCooldown')
        .doc(uid);
      const cooldownSnap = await cooldownRef.get();
      const lastSent = cooldownSnap.data()?.sentAt?.toMillis?.() || 0;
      if (now - lastSent < PRESENCE_COOLDOWN_MS) continue;

      const payload = {
        type: 'match_online',
        fromUid: uid,
        title: 'Match online',
        body: `${displayName} is online now`,
        matchId: matchDoc.id,
      };

      await createInAppNotification(otherUid, payload);
      await sendExpoPush(otherUid, {
        title: payload.title,
        body: payload.body,
        data: payload,
      });
      await cooldownRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    await change.after.ref.set(
      { lastOnlineBroadcastAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return null;
  });
