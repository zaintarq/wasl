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
  const fromEnv = String(process.env.MEHRAM_TOKEN_PEPPER || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return 'huzz-mehram-dev-only-not-for-prod';
  }
  throw new Error('MEHRAM_TOKEN_PEPPER not configured — set in Firebase functions env.');
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
        lastAccessedAt: access.lastAccessedAt || null,
        expiresAt: access.expiresAt || null,
        grantedAt: access.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
}

async function notifyGirlMehramPush(girlUid, { title, body, data = {} } = {}) {
  try {
    const snap = await db.collection(USERS).doc(String(girlUid)).get();
    const token = String(snap.data()?.expoPushToken || '').trim();
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      return { sent: false };
    }
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          to: token,
          sound: 'default',
          title: String(title || 'Mehram'),
          body: String(body || ''),
          data: { type: 'mehram', ...data },
        },
      ]),
    });
    return { sent: true };
  } catch (e) {
    console.warn('[mehram] girl push failed', e?.message || e);
    return { sent: false };
  }
}

async function revokeActiveForMatch(matchId, exceptId = null, reason = 'revoked') {
  const q = await db.collection(MEHRAM_COL).where('matchId', '==', String(matchId)).where('status', '==', 'active').get();
  const batch = db.batch();
  const ended = [];
  q.docs.forEach((docSnap) => {
    if (exceptId && docSnap.id === exceptId) return;
    const data = docSnap.data() || {};
    batch.update(docSnap.ref, {
      status: 'revoked',
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionActive: false,
      revokedReason: reason,
    });
    ended.push({ accessId: docSnap.id, access: data });
  });
  if (!q.empty) await batch.commit();
  for (const item of ended) {
    await endMehramSessionVisit(item.accessId, item.access, reason).catch(() => {});
  }
}

async function startMehramSessionVisit(accessId, access, extras = {}) {
  const girlUid = String(access.girlUserId || '');
  const matchId = String(access.matchId || '');
  const sessRef = db.collection(MEHRAM_COL).doc(String(accessId)).collection('sessions').doc();
  const payload = {
    accessId: String(accessId),
    matchId,
    girlUserId: girlUid,
    guyUserId: String(access.guyUserId || ''),
    girlDisplayName: String(access.girlDisplayName || extras.girlDisplayName || 'Her'),
    guyDisplayName: String(extras.guyDisplayName || 'User'),
    permission: access.permission === 'reply' ? 'reply' : 'view',
    status: 'active',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    endedAt: null,
    endReason: null,
  };
  await sessRef.set(payload);
  await db
    .collection(MEHRAM_COL)
    .doc(String(accessId))
    .set(
      {
        currentSessionId: sessRef.id,
        inviteOpenedAt: admin.firestore.FieldValue.serverTimestamp(),
        inviteStatus: 'viewing',
        lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
        sessionActive: true,
      },
      { merge: true }
    );

  if (girlUid) {
    await db
      .collection(USERS)
      .doc(girlUid)
      .collection('mehramSessionHistory')
      .doc(`${accessId}_${sessRef.id}`)
      .set(
        {
          ...payload,
          sessionDocId: sessRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
  }
  return sessRef.id;
}

async function endMehramSessionVisit(accessId, access, reason = 'left') {
  const currentId = String(access?.currentSessionId || '').trim();
  const girlUid = String(access?.girlUserId || '');
  const endPatch = {
    status: 'ended',
    endedAt: admin.firestore.FieldValue.serverTimestamp(),
    endReason: String(reason || 'left').slice(0, 80),
  };

  if (currentId) {
    await db
      .collection(MEHRAM_COL)
      .doc(String(accessId))
      .collection('sessions')
      .doc(currentId)
      .set(endPatch, { merge: true })
      .catch(() => {});
    if (girlUid) {
      await db
        .collection(USERS)
        .doc(girlUid)
        .collection('mehramSessionHistory')
        .doc(`${accessId}_${currentId}`)
        .set(endPatch, { merge: true })
        .catch(() => {});
    }
  }

  await db
    .collection(MEHRAM_COL)
    .doc(String(accessId))
    .set(
      {
        currentSessionId: null,
        sessionActive: false,
        inviteStatus: reason === 'revoked' || reason === 'account_wipe' ? 'revoked' : 'opened',
      },
      { merge: true }
    )
    .catch(() => {});
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
    inviteStatus: 'waiting',
    createdAt: now,
    expiresAt,
    revokedAt: null,
    lastAccessedAt: null,
    inviteOpenedAt: null,
    sessionActive: false,
    currentSessionId: null,
    girlDisplayName: String(girlDisplayName || 'Her'),
  };

  await db.collection(MEHRAM_COL).doc(accessId).set({
    ...payload,
    inviteUrl: buildInviteUrl(rawToken),
  });
  await syncMatchMehram(matchId, payload, accessId);

  return { accessId, rawToken, expiresAt, permission: perm, inviteUrl: buildInviteUrl(rawToken) };
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

    const created = await createAccessRecord({
      matchId,
      girlUid: uid,
      guyUid,
      girlDisplayName: girlUser.name || girlUser.displayName || 'Her',
      permission,
    });

    return {
      inviteUrl: created.inviteUrl || buildInviteUrl(created.rawToken),
      permission: created.permission,
      expiresAt: created.expiresAt.toMillis(),
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

    const created = await createAccessRecord({
      matchId,
      girlUid: uid,
      guyUid,
      girlDisplayName: girlUser.name || girlUser.displayName || 'Her',
      permission,
    });

    return {
      inviteUrl: created.inviteUrl || buildInviteUrl(created.rawToken),
      permission: created.permission,
      expiresAt: created.expiresAt.toMillis(),
    };
  });

  /** Girl-only: return the current active invite URL without rotating the token. */
  exports.getMehramInviteReminder = region.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    const matchId = String(data?.matchId || '').trim();
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
      throw new functions.https.HttpsError('failed-precondition', 'No active Mehram invite for this chat.');
    }
    const docSnap = q.docs[0];
    const access = docSnap.data() || {};
    const inviteUrl = String(access.inviteUrl || '').trim();
    if (!inviteUrl) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This invite was created before remind-support. Create a new link once, then you can resend it.'
      );
    }
    return {
      inviteUrl,
      accessId: docSnap.id,
      permission: access.permission === 'reply' ? 'reply' : 'view',
      expiresAt: access.expiresAt?.toMillis?.() || null,
      sessionActive: !!access.sessionActive,
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

    let access = loaded.access;
    const { ref, accessId } = loaded;
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

    const girlDisplayName = String(access.girlDisplayName || girlSnap.data()?.name || 'Her');
    const guyDisplayName = String(guySnap.data()?.name || 'User');
    if (access.currentSessionId && access.sessionActive) {
      await endMehramSessionVisit(accessId, access, 'reopened').catch(() => {});
      const refreshed = await ref.get();
      access = { ...(refreshed.data() || access), girlDisplayName, guyDisplayName };
    }
    await startMehramSessionVisit(accessId, access, { girlDisplayName, guyDisplayName });

    const accessForSync = {
      ...access,
      sessionActive: true,
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await syncMatchMehram(access.matchId, accessForSync, accessId);

    await notifyGirlMehramPush(access.girlUserId, {
      title: 'Mehram is viewing',
      body: 'Your Mehram opened this conversation.',
      data: { matchId: String(access.matchId), event: 'opened' },
    });

    return {
      customToken,
      accessId,
      matchId: String(access.matchId),
      permission: access.permission === 'reply' ? 'reply' : 'view',
      girlUserId: String(access.girlUserId),
      guyUserId: String(access.guyUserId),
      girlDisplayName,
      guyDisplayName,
      expiresAt: access.expiresAt?.toMillis?.() || null,
    };
  });

  exports.mehramHeartbeat = region.https.onCall(async (_data, context) => {
    const { accessId, matchId } = assertMehramAuth(context);
    const ref = db.collection(MEHRAM_COL).doc(accessId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.status !== 'active') {
      throw new functions.https.HttpsError('permission-denied', 'Mehram access has ended.');
    }
    const accessData = snap.data() || {};
    await ref.update({
      lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionActive: true,
      inviteStatus: 'viewing',
    });
    await syncMatchMehram(
      accessData.matchId || matchId,
      {
        ...accessData,
        sessionActive: true,
        lastAccessedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      accessId
    );
    return { ok: true, permission: accessData.permission === 'reply' ? 'reply' : 'view' };
  });

  exports.mehramLeaveSession = region.https.onCall(async (_data, context) => {
    const { accessId, matchId } = assertMehramAuth(context);
    const ref = db.collection(MEHRAM_COL).doc(accessId);
    const snap = await ref.get();
    if (snap.exists) {
      const access = snap.data() || {};
      await endMehramSessionVisit(accessId, access, 'left');
      await syncMatchMehram(matchId, { ...access, sessionActive: false, lastAccessedAt: access.lastAccessedAt || null }, accessId);
      await notifyGirlMehramPush(access.girlUserId, {
        title: 'Mehram left',
        body: 'Your Mehram left the conversation.',
        data: { matchId: String(matchId), event: 'left' },
      });
    }
    return { left: true };
  });

  exports.mehramSendMessage = region.https.onCall(async (data, context) => {
    const { isMessageToxicLocal, moderateMessageText } = require('./messageModeration');
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

    if (isMessageToxicLocal(text)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'This message was flagged as inappropriate. Please change it before sending.'
      );
    }

    const mod = moderateMessageText(text);

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
      moderation: mod.flagged
        ? {
            flagged: true,
            categories: mod.categories,
            matchedTerms: mod.matchedTerms,
            score: mod.score,
          }
        : { flagged: false },
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
    const access = snap.data() || {};
    const guyUid = String(access.guyUserId || '');
    if (!guyUid) throw new functions.https.HttpsError('failed-precondition', 'Invalid session.');

    await blockGuyAsGirl(girlUserId, guyUid, matchId);
    await endMehramSessionVisit(accessId, access, 'mehram_block');
    await snap.ref.update({
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

  /** Girl: history for a match. Mehram: visits for their accessId. */
  exports.listMehramSessionHistory = region.https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
    }

    const matchId = String(data?.matchId || '').trim();
    const limitCount = Math.min(40, Math.max(1, Number(data?.limit) || 20));

    if (context.auth.token?.mehram) {
      const accessId = String(context.auth.token.mehramAccessId || '');
      if (!accessId) {
        throw new functions.https.HttpsError('permission-denied', 'Mehram session required.');
      }
      const snap = await db
        .collection(MEHRAM_COL)
        .doc(accessId)
        .collection('sessions')
        .orderBy('startedAt', 'desc')
        .limit(limitCount)
        .get();
      return {
        sessions: snap.docs.map((d) => {
          const x = d.data() || {};
          return {
            id: d.id,
            ...x,
            startedAt: x.startedAt?.toMillis?.() || null,
            endedAt: x.endedAt?.toMillis?.() || null,
          };
        }),
      };
    }

    if (!matchId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing matchId.');
    }
    const uid = String(context.auth.uid);
    await assertGirlParticipant(uid, matchId);

    const snap = await db
      .collection(USERS)
      .doc(uid)
      .collection('mehramSessionHistory')
      .where('matchId', '==', matchId)
      .orderBy('startedAt', 'desc')
      .limit(limitCount)
      .get();

    return {
      sessions: snap.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          ...x,
          startedAt: x.startedAt?.toMillis?.() || null,
          endedAt: x.endedAt?.toMillis?.() || null,
        };
      }),
    };
  });
