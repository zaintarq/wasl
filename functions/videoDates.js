const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { AccessToken } = require('livekit-server-sdk');

const db = admin.firestore();
const SESSION_MS = 15 * 60 * 1000;

function getLiveKitServerConfig() {
  const url = String(process.env.LIVEKIT_URL || process.env.EXPO_PUBLIC_LIVEKIT_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  return { url, apiKey, apiSecret };
}

async function sendExpoPush(toUid, { title, body, data = {} }) {
  try {
    const snap = await db.collection('users').doc(String(toUid)).get();
    const token = String(snap.data()?.expoPushToken || '').trim();
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      return;
    }
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify([{ to: token, sound: 'default', title, body, data }]),
    });
  } catch (e) {
    console.warn('[videoDates] push failed', e?.message || e);
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

async function assertMatchParticipant(matchId, uid) {
  const snap = await db.collection('matches').doc(String(matchId)).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Match not found.');
  }
  const m = snap.data() || {};
  const uids = Array.isArray(m.uids) ? m.uids.map(String) : [];
  if (!uids.includes(String(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Not a match participant.');
  }
  if (m.status !== 'active' || m.isBlocked === true || m.chatFrozen === true) {
    throw new functions.https.HttpsError('failed-precondition', 'Match is not available for video dates.');
  }
  return { snap, uids };
}

exports.proposeMatchVideoDate = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;
  const matchId = String(data?.matchId || '').trim();
  const scheduledAtMs = Number(data?.scheduledAtMs || 0);
  const mehramInvited = data?.mehramInvited === true;
  if (!matchId || !scheduledAtMs) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing matchId or scheduledAtMs.');
  }
  const minLead = Date.now() + 5 * 60 * 1000;
  const maxLead = Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (scheduledAtMs < minLead || scheduledAtMs > maxLead) {
    throw new functions.https.HttpsError('invalid-argument', 'Pick a time at least 5 minutes from now.');
  }

  const { uids } = await assertMatchParticipant(matchId, uid);
  const otherUid = uids.find((u) => u !== uid);

  let mehramAccessId = null;
  if (mehramInvited) {
    const matchSnap = await db.collection('matches').doc(matchId).get();
    const mehram = matchSnap.data()?.mehram;
    if (mehram?.active && mehram?.accessId) {
      mehramAccessId = String(mehram.accessId);
    }
  }

  const sessionRef = db.collection('matchVideoSessions').doc();
  await sessionRef.set({
    matchId,
    uids,
    proposedBy: uid,
    scheduledAt: admin.firestore.Timestamp.fromMillis(scheduledAtMs),
    acceptedUids: [uid],
    status: 'pending',
    mehramInvited: !!mehramAccessId,
    mehramAccessId: mehramAccessId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const proposerSnap = await db.collection('users').doc(uid).get();
  const proposerName = String(proposerSnap.data()?.name || 'Your match');
  const when = new Date(scheduledAtMs).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  if (otherUid) {
    const payload = {
      type: 'video_date_proposed',
      fromUid: uid,
      title: 'Video date invite',
      body: `${proposerName} invited you to a 15-min video call (${when}). Tap to respond.`,
      matchId,
    };
    await createInAppNotification(otherUid, payload);
    await sendExpoPush(otherUid, { title: payload.title, body: payload.body, data: { ...payload, sessionId: sessionRef.id } });
  }

  return { sessionId: sessionRef.id, error: null };
});

exports.respondMatchVideoDate = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;
  const sessionId = String(data?.sessionId || '').trim();
  const accept = data?.accept !== false;
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId.');
  }

  const ref = db.collection('matchVideoSessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Video date not found.');
  }
  const s = snap.data() || {};
  const uids = Array.isArray(s.uids) ? s.uids.map(String) : [];
  if (!uids.includes(uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Not a participant.');
  }
  if (s.status !== 'pending') {
    return { status: s.status, error: null };
  }

  if (!accept) {
    await ref.update({
      status: 'declined',
      declinedBy: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { status: 'declined', error: null };
  }

  const accepted = Array.isArray(s.acceptedUids) ? s.acceptedUids.map(String) : [];
  if (!accepted.includes(uid)) accepted.push(uid);
  const allAccepted = uids.every((u) => accepted.includes(u));
  await ref.update({
    acceptedUids: accepted,
    status: allAccepted ? 'accepted' : 'pending',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (allAccepted) {
    const otherUid = uids.find((u) => u !== uid);
    const responderSnap = await db.collection('users').doc(uid).get();
    const name = String(responderSnap.data()?.name || 'Your match');
    for (const target of uids) {
      const payload = {
        type: 'video_date_accepted',
        fromUid: uid,
        title: 'Video date confirmed',
        body: `${name} accepted — your 15-min video call is booked.`,
        matchId: s.matchId,
      };
      await createInAppNotification(target, payload);
      await sendExpoPush(target, { title: payload.title, body: payload.body, data: { ...payload, sessionId } });
    }
    if (otherUid) {
      /* noop — both notified above */
    }
  }

  return { status: allAccepted ? 'accepted' : 'pending', error: null };
});

exports.activateMatchVideoDate = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;
  const sessionId = String(data?.sessionId || '').trim();
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId.');
  }

  const ref = db.collection('matchVideoSessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Video date not found.');
  }
  const s = snap.data() || {};
  const uids = Array.isArray(s.uids) ? s.uids.map(String) : [];
  if (!uids.includes(uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Not a participant.');
  }

  if (s.status === 'active') {
    return { status: 'active', sessionId, error: null };
  }
  if (s.status !== 'accepted') {
    throw new functions.https.HttpsError('failed-precondition', 'Both people must accept first.');
  }

  const scheduledMs = s.scheduledAt?.toMillis?.() || 0;
  const now = Date.now();
  const windowStart = scheduledMs - 5 * 60 * 1000;
  const windowEnd = scheduledMs + 30 * 60 * 1000;
  if (now < windowStart) {
    throw new functions.https.HttpsError('failed-precondition', 'It is not time for your video date yet.');
  }
  if (now > windowEnd) {
    await ref.update({ status: 'expired', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    throw new functions.https.HttpsError('failed-precondition', 'This video date window has passed.');
  }

  const endsAt = admin.firestore.Timestamp.fromMillis(now + SESSION_MS);
  await ref.update({
    status: 'active',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    endsAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (s.mehramInvited && s.mehramAccessId) {
    const accessId = String(s.mehramAccessId);
    await db.collection('mehramAccess').doc(accessId).set(
      {
        activeVideoSessionId: sessionId,
        activeVideoMatchId: String(s.matchId || ''),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const target of uids) {
    const payload = {
      type: 'video_date_live',
      fromUid: uid,
      title: 'Video date starting',
      body: 'Your 15-minute video call room is open. Tap to join.',
      matchId: s.matchId,
    };
    await createInAppNotification(target, payload);
    await sendExpoPush(target, { title: payload.title, body: payload.body, data: { ...payload, sessionId } });
  }

  return { status: 'active', sessionId, error: null };
});

exports.endMatchVideoDate = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;
  const sessionId = String(data?.sessionId || '').trim();
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId.');
  }

  const ref = db.collection('matchVideoSessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return { error: null };
  const s = snap.data() || {};
  const uids = Array.isArray(s.uids) ? s.uids.map(String) : [];
  if (!uids.includes(uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Not a participant.');
  }

  await ref.update({
    status: 'ended',
    endedAt: admin.firestore.FieldValue.serverTimestamp(),
    endedBy: uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (s.mehramInvited && s.mehramAccessId) {
    await db
      .collection('mehramAccess')
      .doc(String(s.mehramAccessId))
      .set(
        {
          activeVideoSessionId: admin.firestore.FieldValue.delete(),
          activeVideoMatchId: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
  }
  return { error: null };
});

exports.getMatchVideoLiveKitToken = functions
  .runWith({ secrets: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] })
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const sessionId = String(data?.sessionId || '').trim();
    if (!sessionId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId.');
    }
    const uid = context.auth.uid;
    const { url, apiKey, apiSecret } = getLiveKitServerConfig();
    if (!url || !apiKey || !apiSecret) {
      throw new functions.https.HttpsError('failed-precondition', 'LiveKit is not configured.');
    }

    const snap = await db.collection('matchVideoSessions').doc(sessionId).get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found.');
    }
    const d = snap.data() || {};
    const uids = Array.isArray(d.uids) ? d.uids.map(String) : [];
    const isMehram = context.auth.token?.mehram === true;
    let canPublish = true;

    if (isMehram) {
      const accessId = String(context.auth.token?.mehramAccessId || '');
      if (!d.mehramInvited || String(d.mehramAccessId || '') !== accessId) {
        throw new functions.https.HttpsError('permission-denied', 'Mehram not invited to this video date.');
      }
      canPublish = false;
    } else if (!uids.includes(uid)) {
      throw new functions.https.HttpsError('permission-denied', 'Not part of this video date.');
    }

    if (d.status !== 'active') {
      throw new functions.https.HttpsError('failed-precondition', 'Video date is not active.');
    }

    const endsMs = d.endsAt?.toMillis?.() || 0;
    if (endsMs && Date.now() > endsMs + 60 * 1000) {
      throw new functions.https.HttpsError('failed-precondition', 'Video date has ended.');
    }

    const roomName = `mvd_${sessionId}`;
    const at = new AccessToken(apiKey, apiSecret, { identity: uid, ttl: 15 * 60, name: uid });
    at.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe: true });
    const token = await at.toJwt();
    return { token, url, roomName, mehramMode: isMehram };
  });
