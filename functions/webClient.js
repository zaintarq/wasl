/**
 * Web app feed callables — Admin SDK reads so GitHub Pages client avoids rule/query mismatches.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

function stripUser(id, raw) {
  const d = raw || {};
  const photos = Array.isArray(d.photos) ? d.photos.slice(0, 8) : [];
  return {
    id: String(id),
    name: String(d.name || ''),
    age: d.age ?? null,
    gender: String(d.gender || ''),
    bio: String(d.bio || ''),
    city: String(d.city || d.location?.city || ''),
    religion: String(d.religion || ''),
    genderPreferences: Array.isArray(d.genderPreferences) ? d.genderPreferences : [],
    photos,
    isDisabled: d.isDisabled === true,
  };
}

async function assertSignedIn(context) {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = context.auth.uid;
  const snap = await db.collection('users').doc(uid).get();
  if (snap.exists && snap.data()?.isDisabled === true) {
    throw new functions.https.HttpsError('permission-denied', 'Account disabled.');
  }
  return uid;
}

exports.webDiscoverFeed = functions.region('us-central1').https.onCall(async (_data, context) => {
  const uid = await assertSignedIn(context);
  const meSnap = await db.collection('users').doc(uid).get();

  const [usersSnap, sentSnap, blocksSnap] = await Promise.all([
    db.collection('users').orderBy('createdAt', 'desc').limit(80).get(),
    db.collection('users').doc(uid).collection('likesSent').get(),
    db.collection('users').doc(uid).collection('blocks').get(),
  ]);

  return {
    me: meSnap.exists ? stripUser(uid, meSnap.data()) : null,
    users: usersSnap.docs.map((doc) => stripUser(doc.id, doc.data())).filter((u) => !u.isDisabled),
    swipedIds: sentSnap.docs.map((d) => d.id),
    blockedIds: blocksSnap.docs.map((d) => d.id),
  };
});

exports.webListMatches = functions.region('us-central1').https.onCall(async (_data, context) => {
  const uid = await assertSignedIn(context);
  const snap = await db.collection('matches').where('uids', 'array-contains', uid).get();
  const matches = snap.docs
    .map((d) => {
      const m = d.data() || {};
      return {
        id: d.id,
        uids: Array.isArray(m.uids) ? m.uids : [],
        status: String(m.status || 'active'),
        lastMessageText: String(m.lastMessageText || ''),
        lastMessageAt: m.lastMessageAt?.toMillis?.() || m.createdAt?.toMillis?.() || 0,
        createdAt: m.createdAt?.toMillis?.() || 0,
      };
    })
    .filter((m) => m.status === 'active' || !m.status)
    .sort((a, b) => (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt));

  const otherUids = [...new Set(matches.map((m) => m.uids.find((u) => u !== uid)).filter(Boolean))];
  const users = {};
  await Promise.all(
    otherUids.map(async (otherUid) => {
      const u = await db.collection('users').doc(otherUid).get();
      if (u.exists) users[otherUid] = stripUser(otherUid, u.data());
    })
  );

  return { matches, users };
});

exports.webListClubs = functions.region('us-central1').https.onCall(async (_data, context) => {
  const uid = await assertSignedIn(context);
  const [pubSnap, memSnap] = await Promise.all([
    db.collection('clubs').where('isPublic', '==', true).orderBy('createdAt', 'desc').limit(30).get(),
    db.collection('users').doc(uid).collection('clubMemberships').get(),
  ]);

  return {
    clubs: pubSnap.docs.map((d) => {
      const c = d.data() || {};
      return {
        id: d.id,
        name: String(c.name || 'Club'),
        description: String(c.description || ''),
        memberCount: Number(c.memberCount || 0),
        isPublic: c.isPublic !== false,
      };
    }),
    joinedIds: memSnap.docs.map((d) => d.id),
  };
});

exports.webLiveState = functions.region('us-central1').https.onCall(async (_data, context) => {
  const uid = await assertSignedIn(context);
  const snap = await db
    .collection('liveRandomSessions')
    .where('uids', 'array-contains', uid)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snap.empty) return { session: null };

  const doc = snap.docs[0];
  const data = doc.data() || {};
  const partnerUid = (data.uids || []).find((u) => u !== uid) || '';
  let partnerName = 'Someone';
  if (partnerUid) {
    const p = await db.collection('users').doc(partnerUid).get();
    if (p.exists) partnerName = String(p.data()?.name || 'Someone');
  }

  return {
    session: {
      id: doc.id,
      partnerUid,
      partnerName,
    },
  };
});
