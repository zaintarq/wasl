/**
 * Web app feed callables — Admin SDK reads so GitHub Pages client avoids rule/query mismatches.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

function stripUser(id, raw) {
  const d = raw || {};
  const images = Array.isArray(d.images)
    ? d.images.filter((x) => typeof x === 'string' && String(x).trim())
    : [];
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
    images,
    photos,
    photoURL: String(d.photoURL || d.photoUrl || ''),
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

exports.webJoinClub = functions.region('us-central1').https.onCall(async (data, context) => {
  const uid = await assertSignedIn(context);
  const clubId = String(data?.clubId || '').trim();
  if (!clubId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing club.');
  }

  const clubRef = db.collection('clubs').doc(clubId);
  const memberRef = clubRef.collection('members').doc(uid);
  const membershipRef = db.collection('users').doc(uid).collection('clubMemberships').doc(clubId);

  await db.runTransaction(async (tx) => {
    const clubSnap = await tx.get(clubRef);
    if (!clubSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Club not found.');
    }
    const club = clubSnap.data() || {};
    if (club.isPublic === false) {
      const code = String(data?.inviteCode || '').trim().toUpperCase();
      const expected = String(club.inviteCode || '').trim().toUpperCase();
      if (!code || code !== expected) {
        throw new functions.https.HttpsError('permission-denied', 'Invalid invite code for this private club.');
      }
    }

    const memberSnap = await tx.get(memberRef);
    if (memberSnap.exists) return;

    tx.set(memberRef, {
      uid,
      role: 'member',
      canSpeak: club.micMode === 'open',
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(membershipRef, {
      clubId,
      role: 'member',
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(clubRef, {
      memberCount: admin.firestore.FieldValue.increment(1),
    });
  });

  return { joined: true, clubId };
});

exports.webGetClubRoom = functions.region('us-central1').https.onCall(async (data, context) => {
  const uid = await assertSignedIn(context);
  const clubId = String(data?.clubId || '').trim();
  if (!clubId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing club.');
  }

  const clubRef = db.collection('clubs').doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Club not found.');
  }

  const club = clubSnap.data() || {};
  const isPublic = club.isPublic !== false;
  const memberSnap = await clubRef.collection('members').doc(uid).get();
  const isMember = memberSnap.exists;

  if (!isPublic && !isMember) {
    throw new functions.https.HttpsError('permission-denied', 'Not a member of this club.');
  }

  let messages = [];
  if (isMember) {
    const msgSnap = await clubRef.collection('messages').orderBy('createdAt', 'asc').limit(80).get();
    messages = msgSnap.docs.map((d) => {
      const m = d.data() || {};
      return {
        id: d.id,
        fromUid: String(m.fromUid || ''),
        text: String(m.text || ''),
      };
    });
  }

  return {
    club: {
      id: clubId,
      name: String(club.name || 'Club'),
      description: String(club.description || ''),
    },
    isMember,
    messages,
  };
});

exports.webSendClubMessage = functions.region('us-central1').https.onCall(async (data, context) => {
  const uid = await assertSignedIn(context);
  const clubId = String(data?.clubId || '').trim();
  const text = String(data?.text || '').trim().slice(0, 2000);
  if (!clubId || !text) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing club or message.');
  }

  const memberSnap = await db.collection('clubs').doc(clubId).collection('members').doc(uid).get();
  if (!memberSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Join this club first.');
  }

  await db.collection('clubs').doc(clubId).collection('messages').add({
    fromUid: uid,
    text,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

exports.webEnterLivePool = functions.region('us-central1').https.onCall(async (_data, context) => {
  const uid = await assertSignedIn(context);
  const poolRef = db.collection('liveRandomPool').doc('current');
  const sessionRef = db.collection('liveRandomSessions').doc();

  const result = await db.runTransaction(async (tx) => {
    const poolSnap = await tx.get(poolRef);
    const waiting = poolSnap.exists ? String(poolSnap.data()?.waitingUid || '').trim() : '';

    if (waiting && waiting !== uid) {
      tx.set(poolRef, {
        waitingUid: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(sessionRef, {
        uids: [uid, waiting].sort(),
        status: 'active',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { type: 'matched', sessionId: sessionRef.id, partnerUid: waiting };
    }

    tx.set(poolRef, {
      waitingUid: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { type: 'waiting' };
  });

  if (result.type === 'matched') {
    let partnerName = 'Someone';
    const p = await db.collection('users').doc(result.partnerUid).get();
    if (p.exists) partnerName = String(p.data()?.name || 'Someone');
    return { ...result, partnerName };
  }

  return result;
});

exports.webLeaveLivePool = functions.region('us-central1').https.onCall(async (_data, context) => {
  const uid = await assertSignedIn(context);
  const poolRef = db.collection('liveRandomPool').doc('current');

  await db.runTransaction(async (tx) => {
    const poolSnap = await tx.get(poolRef);
    if (!poolSnap.exists) return;
    const waiting = String(poolSnap.data()?.waitingUid || '').trim();
    if (waiting === uid) {
      tx.set(poolRef, {
        waitingUid: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  return { ok: true };
});
