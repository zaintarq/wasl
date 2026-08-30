/**
 * Atomic like + mutual-match creation (fixes simultaneous swipe race).
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { notifyUser } = require('./notifyUser');

const db = admin.firestore();

function getMatchId(uidA, uidB) {
  return [String(uidA), String(uidB)].sort().join('_');
}

async function ensureActiveMatch(from, to, source) {
  const matchId = getMatchId(from, to);
  const matchRef = db.collection('matches').doc(matchId);
  const sorted = [String(from), String(to)].sort();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(matchRef);
    if (snap.exists) {
      const status = String(snap.data()?.status || '');
      if (status !== 'active') {
        tx.update(matchRef, {
          status: 'active',
          uids: sorted,
          approvedBy: String(from),
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return;
    }
    tx.set(matchRef, {
      id: matchId,
      uids: sorted,
      status: 'active',
      requestedBy: String(from),
      requestedTo: sorted.find((u) => u !== String(from)) || String(to),
      approvedBy: String(from),
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageAt: null,
      source: String(source || 'mutual_like'),
    });
  });

  return { matchId, status: 'active' };
}

function isLikeDoc(snap) {
  return snap.exists && String(snap.data()?.action || '') === 'like';
}

exports.recordLike = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }

  const from = String(context.auth.uid);
  const to = String(data?.toUid || '').trim();
  const source = String(data?.source || 'discovery').trim() || 'discovery';

  if (!to || to === from) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target user.');
  }

  let matched = false;
  let matchId = null;
  let matchStatus = null;

  await db.runTransaction(async (tx) => {
    const sentRef = db.collection('users').doc(from).collection('likesSent').doc(to);
    const recvRef = db.collection('users').doc(to).collection('likesReceived').doc(from);
    const reciprocalRecvRef = db.collection('users').doc(from).collection('likesReceived').doc(to);
    const otherSentRef = db.collection('users').doc(to).collection('likesSent').doc(from);

    const [reciprocalRecvSnap, otherSentSnap] = await Promise.all([
      tx.get(reciprocalRecvRef),
      tx.get(otherSentRef),
    ]);

    tx.set(
      sentRef,
      { toUid: to, action: 'like', createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    tx.set(
      recvRef,
      { fromUid: from, action: 'like', createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    matched = isLikeDoc(reciprocalRecvSnap) || isLikeDoc(otherSentSnap);
  });

  if (matched) {
    const match = await ensureActiveMatch(from, to, source);
    matchId = match.matchId;
    matchStatus = match.status;
  } else {
    const repairSnap = await db.collection('users').doc(to).collection('likesSent').doc(from).get();
    if (isLikeDoc(repairSnap)) {
      const match = await ensureActiveMatch(from, to, source);
      matched = true;
      matchId = match.matchId;
      matchStatus = match.status;
    }
  }

  let senderName = 'Someone';
  let receiverName = 'Someone';
  try {
    const [senderSnap, receiverSnap] = await Promise.all([
      db.collection('users').doc(from).get(),
      db.collection('users').doc(to).get(),
    ]);
    if (senderSnap.exists) senderName = String(senderSnap.data()?.name || 'Someone').slice(0, 80);
    if (receiverSnap.exists) receiverName = String(receiverSnap.data()?.name || 'Someone').slice(0, 80);
  } catch (e) {
    console.warn('[recordLike] name lookup failed', e?.message || e);
  }

  try {
    if (matched && matchId) {
      await Promise.all([
        notifyUser(from, {
          fromUid: to,
          type: 'match_mutual',
          title: "It's a match!",
          body: `You and ${receiverName} liked each other. Open Matches to chat.`,
          matchId,
        }),
        notifyUser(to, {
          fromUid: from,
          type: 'match_mutual',
          title: "It's a match!",
          body: `${senderName} liked you back. Open Matches to chat.`,
          matchId,
        }),
      ]);
    } else {
      await notifyUser(to, {
        fromUid: from,
        type: 'like_received',
        title: 'Someone liked you',
        body: `${senderName} liked you — swipe to see`,
        matchId: null,
      });
    }
  } catch (e) {
    console.warn('[recordLike] notification failed', e?.message || e);
  }

  return { matched, matchId, status: matchStatus, error: null };
});
