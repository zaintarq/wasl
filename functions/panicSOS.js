const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

async function sendExpoPush(toUid, { title, body, data = {} }) {
  try {
    const snap = await db.collection('users').doc(String(toUid)).get();
    const token = String(snap.data()?.expoPushToken || '').trim();
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      return { sent: false };
    }
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify([{ to: token, sound: 'default', title, body, data }]),
    });
    return { sent: true };
  } catch (e) {
    console.warn('[panicSOS] push failed', e?.message || e);
    return { sent: false };
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

function pickGirlUid(uids, profiles) {
  for (const uid of uids) {
    const p = profiles[uid] || {};
    const g = String(p.gender || p.sex || '').toLowerCase();
    if (g === 'female' || g === 'woman' || g === 'girl') return uid;
  }
  return uids[0] || null;
}

exports.triggerPanicSOS = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;
  const matchId = String(data?.matchId || '').trim();
  if (!matchId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing matchId.');
  }

  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Match not found.');
  }
  const match = matchSnap.data() || {};
  const uids = Array.isArray(match.uids) ? match.uids.map(String) : [];
  if (!uids.includes(uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Not a match participant.');
  }
  const otherUid = uids.find((u) => u !== uid) || null;

  const reporterSnap = await db.collection('users').doc(uid).get();
  const reporterName = String(reporterSnap.data()?.name || 'Someone');

  const profiles = {};
  for (const u of uids) {
    const us = await db.collection('users').doc(u).get();
    profiles[u] = us.exists ? us.data() : {};
  }
  const girlUid = pickGirlUid(uids, profiles);

  const reportRef = await db.collection('reports').add({
    reporterUid: uid,
    targetType: 'panic_sos',
    targetId: matchId,
    targetUserId: otherUid,
    matchId,
    reason: 'panic_sos',
    categories: ['safety_panic'],
    details: `Panic/SOS triggered in chat by ${reporterName}`,
    autoFlagged: true,
    viaPanic: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('safetyEvents').add({
    uid,
    otherUid,
    matchId,
    source: 'panic_sos',
    severity: 'high',
    categories: ['safety_panic'],
    reportId: reportRef.id,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await matchRef.set(
    {
      chatFrozen: true,
      frozenAt: admin.firestore.FieldValue.serverTimestamp(),
      frozenBy: uid,
      frozenReason: 'panic',
    },
    { merge: true }
  );

  const mehram = match.mehram && typeof match.mehram === 'object' ? match.mehram : null;
  const notifyGirl = girlUid && girlUid !== uid ? girlUid : null;

  if (notifyGirl) {
    const payload = {
      type: 'panic_sos',
      fromUid: uid,
      title: 'Safety alert',
      body: `${reporterName} triggered SOS in your chat. The conversation is frozen.`,
      matchId,
    };
    await createInAppNotification(notifyGirl, payload);
    await sendExpoPush(notifyGirl, { title: payload.title, body: payload.body, data: payload });
  }

  if (mehram?.active && mehram?.girlUserId) {
    const girlId = String(mehram.girlUserId);
    await sendExpoPush(girlId, {
      title: 'Mehram safety alert',
      body: `SOS triggered in a supervised chat (${reporterName}). Review immediately.`,
      data: { type: 'mehram', event: 'panic', matchId },
    });
    await createInAppNotification(girlId, {
      type: 'mehram',
      fromUid: uid,
      title: 'Mehram safety alert',
      body: `SOS triggered in a supervised chat. Tap to review.`,
      matchId,
    });
  }

  if (otherUid && otherUid !== notifyGirl) {
    const payload = {
      type: 'panic_sos',
      fromUid: uid,
      title: 'Chat paused',
      body: 'This chat was paused for safety review.',
      matchId,
    };
    await createInAppNotification(otherUid, payload);
    await sendExpoPush(otherUid, { title: payload.title, body: payload.body, data: payload });
  }

  return { ok: true, reportId: reportRef.id, chatFrozen: true };
});
