const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { AccessToken } = require('livekit-server-sdk');

const db = admin.firestore();

function getLiveKitServerConfig() {
  const url = String(process.env.LIVEKIT_URL || process.env.EXPO_PUBLIC_LIVEKIT_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  return { url, apiKey, apiSecret };
}

async function assertClubAdmin(clubId, uid) {
  const memberSnap = await db.collection('clubs').doc(String(clubId)).collection('members').doc(String(uid)).get();
  if (!memberSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Not a club member.');
  }
  const role = String(memberSnap.data()?.role || '');
  if (!['owner', 'admin'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Club admin required.');
  }
}

async function assertClubMember(clubId, uid) {
  const memberSnap = await db.collection('clubs').doc(String(clubId)).collection('members').doc(String(uid)).get();
  if (!memberSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Not a club member.');
  }
  return memberSnap.data() || {};
}

exports.createClubEvent = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  const uid = context.auth.uid;
  const clubId = String(data?.clubId || '').trim();
  const title = String(data?.title || '').trim().slice(0, 120);
  const description = String(data?.description || '').trim().slice(0, 500);
  const scheduledAtMs = Number(data?.scheduledAtMs || 0);
  const topic = String(data?.topic || 'general').slice(0, 40);
  const type = data?.type === 'video' ? 'video' : 'voice';

  if (!clubId || !title || !scheduledAtMs) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing clubId, title, or time.');
  }
  const minLead = Date.now() + 15 * 60 * 1000;
  if (scheduledAtMs < minLead) {
    throw new functions.https.HttpsError('invalid-argument', 'Schedule at least 15 minutes ahead.');
  }

  await assertClubAdmin(clubId, uid);
  const ref = db.collection('clubs').doc(clubId).collection('events').doc();
  await ref.set({
    clubId,
    title,
    description,
    topic,
    type,
    hostUid: uid,
    scheduledAt: admin.firestore.Timestamp.fromMillis(scheduledAtMs),
    status: 'scheduled',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { eventId: ref.id, error: null };
});

exports.startClubEvent = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  const uid = context.auth.uid;
  const clubId = String(data?.clubId || '').trim();
  const eventId = String(data?.eventId || '').trim();
  if (!clubId || !eventId) throw new functions.https.HttpsError('invalid-argument', 'Missing ids.');

  await assertClubAdmin(clubId, uid);
  const ref = db.collection('clubs').doc(clubId).collection('events').doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Event not found.');

  const scheduledMs = snap.data()?.scheduledAt?.toMillis?.() || 0;
  const windowStart = scheduledMs - 15 * 60 * 1000;
  if (Date.now() < windowStart) {
    throw new functions.https.HttpsError('failed-precondition', 'Too early to start this event.');
  }

  await ref.update({
    status: 'live',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { error: null };
});

exports.endClubEvent = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  const uid = context.auth.uid;
  const clubId = String(data?.clubId || '').trim();
  const eventId = String(data?.eventId || '').trim();
  if (!clubId || !eventId) throw new functions.https.HttpsError('invalid-argument', 'Missing ids.');

  await assertClubAdmin(clubId, uid);
  await db.collection('clubs').doc(clubId).collection('events').doc(eventId).update({
    status: 'ended',
    endedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { error: null };
});

exports.getClubEventLiveKitToken = functions
  .runWith({ secrets: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] })
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    const uid = context.auth.uid;
    const clubId = String(data?.clubId || '').trim();
    const eventId = String(data?.eventId || '').trim();
    if (!clubId || !eventId) throw new functions.https.HttpsError('invalid-argument', 'Missing ids.');

    const member = await assertClubMember(clubId, uid);
    const eventSnap = await db.collection('clubs').doc(clubId).collection('events').doc(eventId).get();
    if (!eventSnap.exists) throw new functions.https.HttpsError('not-found', 'Event not found.');
    const event = eventSnap.data() || {};
    if (event.status !== 'live') {
      throw new functions.https.HttpsError('failed-precondition', 'Event is not live yet.');
    }

    const { url, apiKey, apiSecret } = getLiveKitServerConfig();
    if (!url || !apiKey || !apiSecret) {
      throw new functions.https.HttpsError('failed-precondition', 'LiveKit not configured.');
    }

    const role = String(member.role || 'member');
    const canPublish = role === 'owner' || role === 'admin' || member.canSpeak === true;

    const roomName = `club_${clubId}_evt_${eventId}`;
    const at = new AccessToken(apiKey, apiSecret, { identity: uid, ttl: 2 * 60 * 60, name: uid });
    at.addGrant({ roomJoin: true, room: roomName, canPublish, canSubscribe: true });
    const token = await at.toJwt();
    return { token, url, canPublish, roomName };
  });
