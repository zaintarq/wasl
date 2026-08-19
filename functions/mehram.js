/**
 * Mehram supervision — secure invite tokens, no Mehram account required.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

const db = admin.firestore();
const MEHRAM_COL = 'mehramAccess';
const MATCHES = 'matches';
const USERS = 'users';
const REPORTS = 'reports';

const MEHRAM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_CHAT_MS = 10 * 60 * 1000;
const MIN_MESSAGES = 2;

function getMehramPepper() {
  return process.env.MEHRAM_TOKEN_PEPPER || 'huzz-mehram-v1-change-in-prod';
}

function hashMehramToken(raw) {
  return crypto.createHash('sha256').update(String(raw) + getMehramPepper()).digest('hex');
}

function getInviteBaseUrl() {
  return String(process.env.MEHRAM_APP_DEEP_LINK_BASE || 'huzz://mehram').replace(/\/$/, '');
}

function buildInviteUrl(rawToken) {
  return `${getInviteBaseUrl()}?t=${encodeURIComponent(rawToken)}`;
}

function parseToken(raw) {
  const s = String(raw || '').trim();
  const dot = s.indexOf('.');
  if (dot <= 0 || dot >= s.length - 1) return null;
  return { accessId: s.slice(0, dot), rawToken: s };
}

async function loadAccessByToken(rawToken) {
  const parsed = parseToken(rawToken);
  if (!parsed) return { error: 'invalid-token', access: null, ref: null };
  const ref = db.collection(MEHRAM_COL).doc(parsed.accessId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'not-found', access: null, ref: null };
  const access = snap.data();
  if (access.tokenHash !== hashMehramToken(parsed.rawToken)) {
    return { error: 'invalid-token', access: null, ref: null };
  }
  if (access.status === 'revoked') return { error: 'revoked', access, ref };
  const expMs = access.expiresAt?.toMillis?.() || 0;
  if (expMs && expMs < Date.now()) {
    await ref.update({
      status: 'expired',
      expiredAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionActive: false,
    });
    return { error: 'expired', access, ref };
  }
  if (access.status !== 'active') return { error: 'inactive', access, ref };
  return { error: null, access, ref, accessId: parsed.accessId };
}

async function assertGirlParticipant(uid, matchId) {
  const matchSnap = await db.collection(MATCHES).doc(String(matchId)).get();
  if (!matchSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Conversation not found.');
  }
  const match = matchSnap.data() || {};
  if (String(match.status || '') !== 'active' || match.isBlocked === true) {
    throw new functions.https.HttpsError('failed-precondition', 'Chat is not active.');
  }
  const uids = Array.isArray(match.uids) ? match.uids.map(String) : [];
  if (!uids.includes(String(uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Not a participant.');
  }
  const userSnap = await db.collection(USERS).doc(String(uid)).get();
  const gender = String(userSnap.data()?.gender || '').toLowerCase();
  if (gender !== 'female') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only the girl in this conversation can manage Mehram access.'
    );
  }
  const guyUid = uids.find((u) => u !== String(uid)) || null;
  return { match, guyUid, girlUser: userSnap.data() || {} };
}

async function assertChatDuration(matchId, match) {
  const created = match.createdAt?.toMillis?.() || 0;
  if (created && Date.now() - created >= MIN_CHAT_MS) return;
  const msgSnap = await db.collection(MATCHES).doc(String(matchId)).collection('messages').limit(MIN_MESSAGES).get();
  if (msgSnap.size >= MIN_MESSAGES) return;
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Keep chatting a little longer before adding a Mehram.'
  );
}

async function syncMatchMehram(matchId, access, accessId) {
  const ref = db.collection(MATCHES).doc(String(matchId));
  if (!access || access.status !== 'active') {
    await ref.set({ mehram: admin.firestore.FieldValue.delete() }, { merge: true });
    return;
  }
  await ref.set(
    {
      mehram: {
        active: true,
        accessId: String(accessId),
        permission: access.permission === 'reply' ? 'reply' : 'view',
        girlUid: String(access.girlUserId),
        girlDisplayName: String(access.girlDisplayName || 'Her'),
        sessionActive: !!access.sessionActive,
        grantedAt: access.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
}

async function revokeActiveForMatch(matchId, exceptId = null) {
  const q = await db.collection(MEHRAM_COL).where('matchId', '==', String(matchId)).where('status', '==', 'active').get();
  const batch = db.batch();
  q.docs.forEach((docSnap) => {
    if (exceptId && docSnap.id === exceptId) return;
    batch.update(docSnap.ref, {
      status: 'revoked',
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionActive: false,
    });
  });
  if (!q.empty) await batch.commit();
}

async function createAccessRecord({ matchId, girlUid, guyUid, girlDisplayName, permission }) {
  await revokeActiveForMatch(matchId);
  const accessId = crypto.randomBytes(15).toString('base64url');
  const secret = crypto.randomBytes(32).toString('base64url');
  const rawToken = `${accessId}.${secret}`;
  const tokenHash = hashMehramToken(rawToken);
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + MEHRAM_TTL_MS);
  const perm = permission === 'reply' ? 'reply' : 'view';

  const payload = {
    matchId: String(matchId),
    girlUserId: String(girlUid),
    guyUserId: String(guyUid),
    tokenHash,
    permission: perm,
    status: 'active',
    createdAt: now,
    expiresAt,
    revokedAt: null,
    lastAccessedAt: null,
    sessionActive: false,
    girlDisplayName: String(girlDisplayName || 'Her'),
  };

  await db.collection(MEHRAM_COL).doc(accessId).set(payload);
  await syncMatchMehram(matchId, payload, accessId);

  return { accessId, rawToken, expiresAt, permission: perm };
}

function assertMehramAuth(context) {
  if (!context.auth?.token?.mehram) {
    throw new functions.https.HttpsError('permission-denied', 'Mehram session required.');
  }
  return {
    accessId: String(context.auth.token.mehramAccessId || ''),
    matchId: String(context.auth.token.matchId || ''),
    girlUserId: String(context.auth.token.girlUserId || ''),
    permission: String(context.auth.token.permission || 'view'),
  };
}

async function blockGuyAsGirl(girlUid, guyUid, matchId) {
  await db.collection(USERS).doc(String(girlUid)).collection('blocks').doc(String(guyUid)).set(
    {
      blockedUid: String(guyUid),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      viaMehram: true,
    },
    { merge: true }
  );
  await db.collection(MATCHES).doc(String(matchId)).set(
    {
      isBlocked: true,
      blockedBy: String(girlUid),
      blockedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'blocked',
    },
    { merge: true }
  );
}

// Cloud Functions exports (re-exported from functions/index.js)
const region = functions.region('us-central1');

exports.createMehramInvite = region.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    const matchId = String(data?.matchId || '').trim();
    const permission = data?.permission === 'reply' ? 'reply' : 'view';
    if (!matchId) throw new functions.https.HttpsError('invalid-argument', 'Missing matchId.');

    const uid = context.auth.uid;
    const { match, guyUid, girlUser } = await assertGirlParticipant(uid, matchId);
    if (!guyUid) throw new functions.https.HttpsError('failed-precondition', 'Invalid conversation.');

    await assertChatDuration(matchId, match);

    const { rawToken, expiresAt, permission: perm } = await createAccessRecord({
      matchId,
      girlUid: uid,
      guyUid,
      girlDisplayName: girlUser.name || girlUser.displayName || 'Her',
      permission,
    });

    return {
      inviteUrl: buildInviteUrl(rawToken),
      permission: perm,
      expiresAt: expiresAt.toMillis(),
    };
  });

  exports.regenerateMehramInvite = region.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    const matchId = String(data?.matchId || '').trim();
    if (!matchId) throw new functions.https.HttpsError('invalid-argument', 'Missing matchId.');

    const uid = context.auth.uid;
    const { match, guyUid, girlUser } = await assertGirlParticipant(uid, matchId);

    const existing = await db
      .collection(MEHRAM_COL)
      .where('matchId', '==', matchId)
      .where('girlUserId', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    const permission =
      existing.docs[0]?.data()?.permission === 'reply' ? 'reply' : data?.permission === 'reply' ? 'reply' : 'view';

    await assertChatDuration(matchId, match);

    const { rawToken, expiresAt, permission: perm } = await createAccessRecord({
      matchId,
      girlUid: uid,
      guyUid,
      girlDisplayName: girlUser.name || girlUser.displayName || 'Her',
      permission,
    });

    return {
      inviteUrl: buildInviteUrl(rawToken),
      permission: perm,
      expiresAt: expiresAt.toMillis(),
    };
  });

  exports.updateMehramPermission = region.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    const matchId = String(data?.matchId || '').trim();
    const permission = data?.permission === 'reply' ? 'reply' : 'view';
    if (!matchId) throw new functions.https.HttpsError('invalid-argument', 'Missing matchId.');

    const uid = context.auth.uid;
    await assertGirlParticipant(uid, matchId);

    const q = await db
      .collection(MEHRAM_COL)
      .where('matchId', '==', matchId)
      .where('girlUserId', '==', uid)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (q.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'No active Mehram access.');
    }

    const docSnap = q.docs[0];
    await docSnap.ref.update({ permission });
    const access = { ...docSnap.data(), permission };
    await syncMatchMehram(matchId, access, docSnap.id);

    return { permission };
  });

  exports.revokeMehramAccess = region.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    const matchId = String(data?.matchId || '').trim();
    if (!matchId) throw new functions.https.HttpsError('invalid-argument', 'Missing matchId.');

    const uid = context.auth.uid;
    await assertGirlParticipant(uid, matchId);

    await revokeActiveForMatch(matchId);
    await syncMatchMehram(matchId, null, null);

    return { revoked: true };
  });

  exports.exchangeMehramToken = region.https.onCall(async (data) => {
    const rawToken = String(data?.token || '').trim();
    if (!rawToken) throw new functions.https.HttpsError('invalid-argument', 'Missing token.');

    const loaded = await loadAccessByToken(rawToken);
    if (loaded.error === 'invalid-token' || loaded.error === 'not-found') {
      throw new functions.https.HttpsError('permission-denied', 'This invitation link is not valid.');
    }
    if (loaded.error === 'revoked' || loaded.error === 'expired' || loaded.error === 'inactive') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Mehram access has ended. The person who invited you has removed your access or the invitation has expired.'
      );
    }

    const { access, ref, accessId } = loaded;
    const matchSnap = await db.collection(MATCHES).doc(String(access.matchId)).get();
    if (!matchSnap.exists || matchSnap.data()?.isBlocked) {
      throw new functions.https.HttpsError('failed-precondition', 'This conversation is no longer available.');
    }

    const [girlSnap, guySnap] = await Promise.all([
      db.collection(USERS).doc(String(access.girlUserId)).get(),
      db.collection(USERS).doc(String(access.guyUserId)).get(),
    ]);

    const mehramUid = `mehram_${accessId}`;
    try {
      await admin.auth().getUser(mehramUid);
    } catch {
      await admin.auth().createUser({ uid: mehramUid, displayName: 'Mehram' });
    }

    const customToken = await admin.auth().createCustomToken(mehramUid, {
      mehram: true,
      mehramAccessId: accessId,
      matchId: String(access.matchId),
      permission: access.permission === 'reply' ? 'reply' : 'view',
      girlUserId: String(access.girlUserId),
    });

    await ref.update({
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionActive: true,
    });

    await syncMatchMehram(access.matchId, { ...access, sessionActive: true }, accessId);

    return {
      customToken,
      accessId,
      matchId: String(access.matchId),
      permission: access.permission === 'reply' ? 'reply' : 'view',
      girlUserId: String(access.girlUserId),
      guyUserId: String(access.guyUserId),
      girlDisplayName: String(access.girlDisplayName || girlSnap.data()?.name || 'Her'),
      guyDisplayName: String(guySnap.data()?.name || 'User'),
      expiresAt: access.expiresAt?.toMillis?.() || null,
    };
  });

  exports.mehramHeartbeat = region.https.onCall(async (_data, context) => {
    const { accessId } = assertMehramAuth(context);
    const ref = db.collection(MEHRAM_COL).doc(accessId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.status !== 'active') {
      throw new functions.https.HttpsError('permission-denied', 'Mehram access has ended.');
    }
    await ref.update({
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionActive: true,
    });
    return { ok: true, permission: snap.data()?.permission === 'reply' ? 'reply' : 'view' };
  });

  exports.mehramLeaveSession = region.https.onCall(async (_data, context) => {
    const { accessId, matchId } = assertMehramAuth(context);
    const ref = db.collection(MEHRAM_COL).doc(accessId);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({ sessionActive: false });
      await syncMatchMehram(matchId, { ...snap.data(), sessionActive: false }, accessId);
    }
    return { left: true };
  });

  exports.mehramSendMessage = region.https.onCall(async (data, context) => {
    const { accessId, matchId, girlUserId } = assertMehramAuth(context);
    const snap = await db.collection(MEHRAM_COL).doc(accessId).get();
    if (!snap.exists || snap.data()?.status !== 'active') {
      throw new functions.https.HttpsError('permission-denied', 'Mehram access has ended.');
    }
    if (snap.data()?.permission !== 'reply') {
      throw new functions.https.HttpsError('permission-denied', 'Replying is disabled for this session.');
    }

    const text = String(data?.text || '').trim();
    if (!text || text.length > 2000) {
      throw new functions.https.HttpsError('invalid-argument', 'Message is empty or too long.');
    }

    await db.collection(MATCHES).doc(String(matchId)).collection('messages').add({
      fromUid: String(girlUserId),
      senderType: 'mehram',
      mehramAccessId: String(accessId),
      type: 'text',
      text,
      replyTo: null,
      reactions: {},
      editedAt: null,
      deletedAt: null,
      readAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      moderation: { flagged: false },
    });

    await db.collection(MATCHES).doc(String(matchId)).set(
      {
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageText: text,
      },
      { merge: true }
    );

    return { sent: true };
  });

  exports.mehramBlockGuy = region.https.onCall(async (data, context) => {
    const { accessId, matchId, girlUserId } = assertMehramAuth(context);
    const snap = await db.collection(MEHRAM_COL).doc(accessId).get();
    if (!snap.exists || snap.data()?.status !== 'active') {
      throw new functions.https.HttpsError('permission-denied', 'Mehram access has ended.');
    }
    const guyUid = String(snap.data()?.guyUserId || '');
    if (!guyUid) throw new functions.https.HttpsError('failed-precondition', 'Invalid session.');

    await blockGuyAsGirl(girlUserId, guyUid, matchId);

    await snap.ref.update({
      sessionActive: false,
      status: 'revoked',
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      revokedReason: 'mehram_block',
    });
    await syncMatchMehram(matchId, null, null);

    return { blocked: true };
  });

  exports.mehramReportGuy = region.https.onCall(async (data, context) => {
    const { accessId, matchId, girlUserId } = assertMehramAuth(context);
    const snap = await db.collection(MEHRAM_COL).doc(accessId).get();
    if (!snap.exists || snap.data()?.status !== 'active') {
      throw new functions.https.HttpsError('permission-denied', 'Mehram access has ended.');
    }
    const guyUid = String(snap.data()?.guyUserId || '');
    const reason = String(data?.reason || 'inappropriate').trim();
    const details = String(data?.details || '').trim();

    await db.collection(REPORTS).add({
      reporterUid: String(girlUserId),
      targetType: 'user',
      targetId: guyUid,
      targetUserId: guyUid,
      matchId: String(matchId),
      reason,
      details: details || 'Reported by Mehram supervisor.',
      categories: [],
      autoFlagged: false,
      status: 'open',
      viaMehram: true,
      mehramAccessId: accessId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { reported: true };
  });
