const admin = require('firebase-admin');

function getDb() {
  return admin.firestore();
}

async function sendExpoPush(toUid, { title, body, data = {} }) {
  try {
    const snap = await getDb().collection('users').doc(String(toUid)).get();
    const token = String(snap.data()?.expoPushToken || '').trim();
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      return { sent: false };
    }
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          to: token,
          sound: 'default',
          title: String(title || 'Wasl'),
          body: String(body || ''),
          data,
        },
      ]),
    });
    return { sent: true };
  } catch (e) {
    console.warn('[notifyUser] push failed', e?.message || e);
    return { sent: false };
  }
}

async function createInAppNotification(toUid, payload) {
  await getDb().collection('users').doc(String(toUid)).collection('notifications').add({
    toUid: String(toUid),
    fromUid: payload.fromUid ? String(payload.fromUid) : null,
    type: String(payload.type || ''),
    title: String(payload.title || ''),
    body: String(payload.body || ''),
    matchId: payload.matchId ? String(payload.matchId) : null,
    gameId: payload.gameId ? String(payload.gameId) : null,
    roomId: payload.roomId ? String(payload.roomId) : null,
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function notifyUser(toUid, payload) {
  const targetUid = String(toUid || '');
  const fromUid = payload.fromUid ? String(payload.fromUid) : '';
  if (!targetUid || (fromUid && targetUid === fromUid)) {
    return { skipped: true, reason: 'self_or_missing' };
  }

  const body = {
    fromUid: payload.fromUid || null,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    matchId: payload.matchId || null,
    gameId: payload.gameId || null,
    roomId: payload.roomId || null,
  };
  await createInAppNotification(toUid, body);
  await sendExpoPush(toUid, {
    title: body.title,
    body: body.body,
    data: {
      type: body.type,
      fromUid: body.fromUid,
      matchId: body.matchId,
      gameId: body.gameId,
      roomId: body.roomId,
    },
  });
}

module.exports = { notifyUser, createInAppNotification, sendExpoPush };
