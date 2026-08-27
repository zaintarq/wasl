/**
 * Admin privacy tools: deletion requests, account wipe, confirmation email (OTP SMTP),
 * DSAR export, crash logs / crash grouping.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const zlib = require('zlib');

const db = () => admin.firestore();

/** Checklist shown to admins before wipe (must stay in sync with wipeUserAccount / partial). */
const WIPE_CHECKLIST_ACCOUNT = [
  'Firebase Auth login (account can no longer sign in)',
  'User profile document (users/{uid})',
  'Profile subcollections: likes, blocks, contact hashes, notifications, story seen, club memberships',
  'Stories posted by the user',
  'Verification records',
  'Reports filed by or against the user',
  'Vulgar-message attempts and safety events targeting the user',
  'Safety profile + photo/contact upload markers',
  'Reserved username (usernames/{username})',
  'Chat messages the user sent (match shells kept; user marked deleted)',
  'Cloud Storage: images, voice, stories, gallery, verification files',
];

const WIPE_CHECKLIST_PARTIAL = [
  'Profile photos (images[]) cleared',
  'About-voice URL removed',
  'Bio cleared',
  'Cloud Storage files under images/, voice/, stories/, gallery/, verification/',
  'Account login kept (Auth + users/{uid} remain)',
];

function wipeChecklistForType(type) {
  return String(type || '') === 'partial' ? WIPE_CHECKLIST_PARTIAL : WIPE_CHECKLIST_ACCOUNT;
}

async function isAdminCaller(uid) {
  if (!uid) return false;
  try {
    const snap = await db().collection('admin').doc(String(uid)).get();
    return snap.exists && String(snap.data()?.role || '').toLowerCase().trim() === 'admin';
  } catch {
    return false;
  }
}

function getOtpEmailTransporter() {
  const SMTP_USER = 'noreplyonlystream@gmail.com';
  const SMTP_PASSWORD = 'yvyknzfblnphzhgk';
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

const OTP_FROM = 'Wasl / HUZZ <noreplyonlystream@gmail.com>';

async function writeAudit(adminUid, action, targetUserId, details = {}) {
  await db().collection('auditLogs').add({
    adminId: String(adminUid),
    action: String(action),
    targetUserId: targetUserId ? String(targetUserId) : null,
    details,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteDocsByQuery(queryRef, maxRounds = 40) {
  let deleted = 0;
  for (let i = 0; i < maxRounds; i += 1) {
    const snap = await queryRef.limit(200).get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 200) break;
  }
  return deleted;
}

async function deleteUserSubcollections(uid) {
  const userRef = db().collection('users').doc(String(uid));
  const subs = [
    'likesSent',
    'likesReceived',
    'blocks',
    'contactHashes',
    'notifications',
    'storySeen',
    'clubMemberships',
  ];
  let total = 0;
  for (const sub of subs) {
    total += await deleteDocsByQuery(userRef.collection(sub));
  }
  return total;
}

async function deleteStoragePrefixes(uid) {
  const bucket = admin.storage().bucket();
  const prefixes = [
    `images/${uid}/`,
    `voice/${uid}/`,
    `stories/${uid}/`,
    `gallery/${uid}/`,
    `verifications/${uid}/`,
    `verification/${uid}/`,
  ];
  let removed = 0;
  for (const prefix of prefixes) {
    try {
      const [files] = await bucket.getFiles({ prefix });
      await Promise.all(
        (files || []).map(async (file) => {
          await file.delete().catch(() => {});
          removed += 1;
        })
      );
    } catch (e) {
      console.warn('[privacyAdmin] storage prefix delete failed', prefix, e?.message);
    }
  }
  return removed;
}

async function wipeUserAccount(uid) {
  const targetUid = String(uid || '').trim();
  if (!targetUid) throw new Error('Missing uid');

  const userSnap = await db().collection('users').doc(targetUid).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const email = String(userData.email || '').trim().toLowerCase();
  const username = String(userData.username || '').trim().toLowerCase();

  const summary = {
    subdocs: 0,
    stories: 0,
    matchesTouched: 0,
    storageFiles: 0,
    authDeleted: false,
    mehramRevoked: 0,
  };

  summary.subdocs = await deleteUserSubcollections(targetUid);
  summary.stories = await deleteDocsByQuery(
    db().collection('stories').where('userId', '==', targetUid)
  );
  await deleteDocsByQuery(db().collection('verifications').where('uid', '==', targetUid));
  await deleteDocsByQuery(db().collection('reports').where('reporterUid', '==', targetUid));
  await deleteDocsByQuery(db().collection('reports').where('targetUserId', '==', targetUid));
  await deleteDocsByQuery(db().collection('vulgarAttempts').where('userId', '==', targetUid));
  await deleteDocsByQuery(db().collection('safetyEvents').where('targetUid', '==', targetUid));
  await db().collection('userSafetyProfiles').doc(targetUid).delete().catch(() => {});
  await db().collection('photo-upload').doc(targetUid).delete().catch(() => {});
  await db().collection('contact-upload').doc(targetUid).delete().catch(() => {});

  if (username) {
    await db().collection('usernames').doc(username).delete().catch(() => {});
  }

  // Matches: remove messages authored by user; leave shell or delete if solo leftover
  const matchSnap = await db().collection('matches').where('uids', 'array-contains', targetUid).limit(100).get();
  for (const matchDoc of matchSnap.docs) {
    summary.matchesTouched += 1;
    const messages = matchDoc.ref.collection('messages');
    await deleteDocsByQuery(messages.where('senderId', '==', targetUid));
    await deleteDocsByQuery(messages.where('fromUid', '==', targetUid));
    await matchDoc.ref
      .set(
        {
          deletedUids: admin.firestore.FieldValue.arrayUnion(targetUid),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
  }

  // Mehram invites / Auth supervisors tied to this user
  try {
    const mehramAsGirl = await db().collection('mehramAccess').where('girlUserId', '==', targetUid).limit(50).get();
    const mehramAsGuy = await db().collection('mehramAccess').where('guyUserId', '==', targetUid).limit(50).get();
    const seen = new Set();
    for (const snap of [...mehramAsGirl.docs, ...mehramAsGuy.docs]) {
      if (seen.has(snap.id)) continue;
      seen.add(snap.id);
      await snap.ref
        .set(
          {
            status: 'revoked',
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            sessionActive: false,
            revokedReason: 'account_wipe',
          },
          { merge: true }
        )
        .catch(() => {});
      await admin.auth().deleteUser(`mehram_${snap.id}`).catch(() => {});
      summary.mehramRevoked = (summary.mehramRevoked || 0) + 1;
    }
    summary.subdocs += await deleteDocsByQuery(
      db().collection('users').doc(targetUid).collection('mehramSessionHistory')
    );
  } catch (mehramErr) {
    console.warn('[privacyAdmin] mehram wipe', mehramErr?.message);
  }

  summary.storageFiles = await deleteStoragePrefixes(targetUid);
  await db().collection('users').doc(targetUid).delete().catch(() => {});

  try {
    await admin.auth().deleteUser(targetUid);
    summary.authDeleted = true;
  } catch (e) {
    console.warn('[privacyAdmin] auth deleteUser', e?.message);
  }

  return { email, username, summary };
}

/**
 * Play-friendly self-serve wipe: caller must re-auth recently, then confirm DELETE.
 * Runs the same wipe as admin processDeletionRequest for context.auth.uid.
 */
exports.selfWipeAccount = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = String(context.auth.uid);
    if (uid.startsWith('mehram_')) {
      throw new functions.https.HttpsError('permission-denied', 'Mehram sessions cannot delete dating accounts.');
    }

    const confirm = String(data?.confirm || '').trim().toUpperCase();
    if (confirm !== 'DELETE') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Type DELETE to confirm permanent account deletion.'
      );
    }

    const authTimeSec = Number(context.auth.token?.auth_time || 0);
    const ageSec = Math.floor(Date.now() / 1000) - authTimeSec;
    if (!authTimeSec || ageSec > 10 * 60) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Please confirm your password again, then retry. Recent sign-in is required.'
      );
    }

    let wipeResult;
    try {
      wipeResult = await wipeUserAccount(uid);
    } catch (error) {
      console.error('[selfWipeAccount]', error);
      throw new functions.https.HttpsError('internal', error?.message || 'Failed to delete account.');
    }

    const openSnap = await db().collection('deletionRequests').where('uid', '==', uid).limit(30).get();
    const batch = db().batch();
    openSnap.docs.forEach((d) => {
      if (String(d.data()?.status || '') === 'done') return;
      batch.set(
        d.ref,
        {
          status: 'done',
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: uid,
          selfWiped: true,
          wipeSummary: wipeResult?.summary || null,
        },
        { merge: true }
      );
    });
    if (!openSnap.empty) await batch.commit().catch(() => {});

    const toEmail = String(wipeResult?.email || '').trim().toLowerCase();
    let emailSent = false;
    if (toEmail) {
      try {
        const transporter = getOtpEmailTransporter();
        const bodyText =
          'Hello,\n\nYour Wasl (HUZZ) account and associated personal data have been deleted at your request.\n\nYou will no longer be able to sign in with this account.\n\n— Wasl / HUZZ';
        await transporter.sendMail({
          from: OTP_FROM,
          to: toEmail,
          subject: 'Wasl: your account has been deleted',
          text: bodyText,
          html: `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error('[selfWipeAccount] email', mailErr?.message || mailErr);
      }
    }

    await writeAudit(uid, 'self_wipe_account', uid, {
      emailSent,
      summary: wipeResult?.summary || null,
    });

    return { ok: true, emailSent, email: toEmail || null, summary: wipeResult?.summary || null };
  });


exports.submitDeletionRequest = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = String(context.auth.uid);
  const type = String(data?.type || 'account').trim().toLowerCase() === 'partial' ? 'partial' : 'account';
  const details = String(data?.details || '').trim().slice(0, 2000);
  const userSnap = await db().collection('users').doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const email = String(userData.email || context.auth.token?.email || '').trim().toLowerCase();

  const openSnap = await db().collection('deletionRequests').where('uid', '==', uid).limit(20).get();
  const duplicate = openSnap.docs.find(
    (d) => String(d.data()?.status || '') === 'open' && String(d.data()?.type || '') === type
  );
  if (duplicate) {
    return { requestId: duplicate.id, alreadyOpen: true };
  }

  const ref = await db().collection('deletionRequests').add({
    uid,
    email,
    name: String(userData.name || '').trim(),
    username: String(userData.username || '').trim(),
    type,
    details,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  let ackEmailSent = false;
  if (email) {
    const isPartial = type === 'partial';
    const subject = isPartial
      ? 'Wasl: we received your data deletion request'
      : 'Wasl: we received your account deletion request';
    const bodyText = isPartial
      ? `Hello,\n\nWe got your request to delete personal data from your Wasl account (while keeping the account open).\n\nWe aim to process requests within 30 days. You will get another email when it is complete.\n\nRequest id: ${ref.id}\n\n— Wasl / HUZZ`
      : `Hello,\n\nWe got your request to delete your Wasl (HUZZ) account and associated personal data.\n\nWe aim to process requests within 30 days. You will get another email when it is complete, and you will then no longer be able to sign in.\n\nRequest id: ${ref.id}\n\n— Wasl / HUZZ`;
    try {
      const transporter = getOtpEmailTransporter();
      await transporter.sendMail({
        from: OTP_FROM,
        to: email,
        subject,
        text: bodyText,
        html: `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
      });
      ackEmailSent = true;
      await ref.set(
        {
          ackEmailSent: true,
          ackEmailAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (mailErr) {
      console.error('[submitDeletionRequest] ack email', mailErr?.message || mailErr);
      await ref.set({ ackEmailSent: false, ackEmailError: String(mailErr?.message || mailErr) }, { merge: true });
    }
  }

  return { requestId: ref.id, alreadyOpen: false, ackEmailSent };
});

/** Admin-only: static checklist of what processDeletionRequest will remove. */
exports.getDeletionWipePreview = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const requestId = String(data?.requestId || '').trim();
  let type = String(data?.type || 'account').trim().toLowerCase() === 'partial' ? 'partial' : 'account';
  let email = null;
  let uid = null;
  let name = null;

  if (requestId) {
    const snap = await db().collection('deletionRequests').doc(requestId).get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Deletion request not found.');
    }
    const req = snap.data() || {};
    type = String(req.type || '') === 'partial' ? 'partial' : 'account';
    email = req.email || null;
    uid = req.uid || null;
    name = req.name || null;
  }

  return {
    type,
    email,
    uid,
    name,
    checklist: wipeChecklistForType(type),
    retainedNote:
      type === 'partial'
        ? 'Login and core profile document stay. Safety/legal records may already exist separately.'
        : 'Match shells may remain with the user marked deleted. Some safety/legal records may be retained as described in the privacy policy.',
  };
});

exports.processDeletionRequest = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    if (!(await isAdminCaller(context.auth.uid))) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
    }

    const requestId = String(data?.requestId || '').trim();
    const customMessage = String(data?.customMessage || '').trim().slice(0, 5000);
    const sendEmail = data?.sendEmail !== false;

    if (!requestId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing requestId.');
    }

    const reqRef = db().collection('deletionRequests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Deletion request not found.');
    }
    const req = reqSnap.data() || {};
    if (String(req.status || '') === 'done') {
      return { alreadyDone: true, email: req.email || null };
    }

    await reqRef.set(
      {
        status: 'processing',
        processedBy: context.auth.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const targetUid = String(req.uid || '').trim();
    if (!targetUid) {
      throw new functions.https.HttpsError('failed-precondition', 'Request has no uid.');
    }

    let wipeResult;
    try {
      if (String(req.type || '') === 'partial') {
        // Partial: clear profile media + optional free-text fields; keep account
        const userRef = db().collection('users').doc(targetUid);
        await userRef.set(
          {
            images: [],
            aboutVoiceUrl: admin.firestore.FieldValue.delete(),
            bio: '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            partialDataClearedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        await deleteStoragePrefixes(targetUid);
        wipeResult = { email: req.email, summary: { mode: 'partial' } };
      } else {
        wipeResult = await wipeUserAccount(targetUid);
      }
    } catch (error) {
      await reqRef.set(
        {
          status: 'open',
          lastError: String(error?.message || error),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      console.error('[processDeletionRequest]', error);
      throw new functions.https.HttpsError('internal', error?.message || 'Failed to process deletion.');
    }

    const toEmail = String(wipeResult?.email || req.email || '').trim().toLowerCase();
    let emailSent = false;
    if (sendEmail && toEmail) {
      const isPartial = String(req.type || '') === 'partial';
      const subject = isPartial
        ? 'Wasl: your data deletion request is complete'
        : 'Wasl: your account and data have been deleted';
      const bodyText =
        customMessage ||
        (isPartial
          ? `Hello,\n\nWe have completed your request to delete personal data from your Wasl account while keeping the account open.\n\nIf you need anything else, reply to this email.\n\n— Wasl / HUZZ`
          : `Hello,\n\nWe have deleted your Wasl (HUZZ) account and associated personal data as requested.\n\nSome safety or legal records may be retained for a limited time as described in our privacy policy.\n\nYou will no longer be able to sign in with this account.\n\n— Wasl / HUZZ`);

      try {
        const transporter = getOtpEmailTransporter();
        await transporter.sendMail({
          from: OTP_FROM,
          to: toEmail,
          subject,
          text: bodyText,
          html: `<p>${bodyText.replace(/\n/g, '<br/>')}</p>`,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error('[processDeletionRequest] email', mailErr);
      }
    }

    await reqRef.set(
      {
        status: 'done',
        processedBy: context.auth.uid,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        wipeSummary: wipeResult?.summary || null,
        confirmationEmailSent: emailSent,
        confirmationEmailTo: toEmail || null,
        adminMessage: customMessage || null,
      },
      { merge: true }
    );

    await writeAudit(context.auth.uid, 'process_deletion_request', targetUid, {
      requestId,
      type: req.type,
      emailSent,
      toEmail: toEmail || null,
    });

    return { ok: true, emailSent, email: toEmail || null, summary: wipeResult?.summary || null };
  });

exports.sendDeletionNoticeEmail = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const to = String(data?.to || '').trim().toLowerCase();
  const subject = String(data?.subject || 'Wasl account update').trim().slice(0, 200);
  const body = String(data?.body || '').trim().slice(0, 8000);
  const requestId = String(data?.requestId || '').trim();

  if (!to || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'Email and message body are required.');
  }

  const transporter = getOtpEmailTransporter();
  await transporter.sendMail({
    from: OTP_FROM,
    to,
    subject,
    text: body,
    html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
  });

  if (requestId) {
    await db()
      .collection('deletionRequests')
      .doc(requestId)
      .set(
        {
          lastAdminEmailAt: admin.firestore.FieldValue.serverTimestamp(),
          lastAdminEmailSubject: subject,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  await writeAudit(context.auth.uid, 'send_deletion_notice_email', null, { to, subject, requestId: requestId || null });
  return { ok: true };
});

exports.reportCrash = functions.region('us-central1').https.onCall(async (data, context) => {
  const message = String(data?.message || data?.error || 'Unknown error').slice(0, 2000);
  const stack = String(data?.stack || '').slice(0, 8000);
  const name = String(data?.name || 'Error').slice(0, 200);
  const isFatal = Boolean(data?.isFatal);
  const platform = String(data?.platform || '').slice(0, 40);
  const appVersion = String(data?.appVersion || '').slice(0, 40);
  const osVersion = String(data?.osVersion || '').slice(0, 80);
  const deviceHash = String(data?.deviceHash || '').slice(0, 128);
  const fingerprint = crashFingerprint(name, message, stack);
  const uid = context.auth?.uid ? String(context.auth.uid) : null;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const logRef = await db().collection('crashLogs').add({
    uid,
    message,
    stack,
    name,
    isFatal,
    platform,
    appVersion,
    osVersion,
    deviceHash: deviceHash || null,
    fingerprint,
    createdAt: now,
  });

  const groupRef = db().collection('crashGroups').doc(fingerprint);
  try {
    await db().runTransaction(async (tx) => {
      const gSnap = await tx.get(groupRef);
      if (!gSnap.exists) {
        tx.set(groupRef, {
          fingerprint,
          name,
          message,
          stack: stack.slice(0, 4000),
          count: 1,
          isFatal,
          platform,
          appVersion,
          osVersion,
          lastUid: uid,
          lastDeviceHash: deviceHash || null,
          sampleLogIds: [logRef.id],
          status: 'open',
          assignedTo: null,
          firstSeenAt: now,
          lastSeenAt: now,
          updatedAt: now,
        });
      } else {
        const prev = gSnap.data() || {};
        const samples = Array.isArray(prev.sampleLogIds) ? prev.sampleLogIds.slice(0, 9) : [];
        samples.unshift(logRef.id);
        const wasResolved = String(prev.status || '') === 'resolved';
        tx.set(
          groupRef,
          {
            count: admin.firestore.FieldValue.increment(1),
            isFatal: Boolean(prev.isFatal) || isFatal,
            message,
            stack: stack.slice(0, 4000) || prev.stack || '',
            platform: platform || prev.platform || null,
            appVersion: appVersion || prev.appVersion || null,
            osVersion: osVersion || prev.osVersion || null,
            lastUid: uid,
            lastDeviceHash: deviceHash || null,
            sampleLogIds: samples.slice(0, 10),
            status: 'open',
            ...(wasResolved
              ? {
                  reopenedAt: now,
                  resolvedAt: null,
                  resolvedBy: null,
                }
              : {}),
            lastSeenAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }
    });
  } catch (groupErr) {
    console.warn('[reportCrash] group upsert failed', groupErr?.message || groupErr);
  }

  return { id: logRef.id, fingerprint };
});

function crashFingerprint(name, message, stack) {
  const stackKey = String(stack || '')
    .split('\n')
    .slice(0, 10)
    .map((line) =>
      line
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/:\d+:\d+/g, '')
        .replace(/\b\d+\b/g, '#')
        .trim()
    )
    .filter(Boolean)
    .join('|');
  const msgKey = String(message || '')
    .replace(/\b\d+\b/g, '#')
    .slice(0, 240);
  const raw = `${String(name || 'Error').slice(0, 80)}|${msgKey}|${stackKey || msgKey}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

/** Minimal single-file ZIP (store or deflate) without extra deps. */
function buildSingleFileZip(entryName, contentBuf, useDeflate = true) {
  const nameBuf = Buffer.from(String(entryName), 'utf8');
  const raw = Buffer.isBuffer(contentBuf) ? contentBuf : Buffer.from(contentBuf);
  const data = useDeflate ? zlib.deflateRawSync(raw) : raw;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(raw);
  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  nameBuf.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + data.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, data, central, end]);
}

function scrubUserDoc(data) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  delete out.fcmToken;
  delete out.pushToken;
  delete out.expoPushToken;
  delete out.tokens;
  // Timestamps become ISO in JSON stringify via replacer below
  return out;
}

async function collectQueryDocs(queryRef, mapFn, hardLimit = 500) {
  const snap = await queryRef.limit(hardLimit).get();
  return snap.docs.map((d) => {
    const raw = d.data() || {};
    const mapped = mapFn ? mapFn(raw, d.id) : { id: d.id, ...raw };
    return mapped;
  });
}

function jsonReplacer(_key, value) {
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        return value.toDate().toISOString();
      } catch {
        return null;
      }
    }
    if (value._seconds != null && value._nanoseconds != null) {
      return new Date(value._seconds * 1000).toISOString();
    }
  }
  return value;
}

async function buildUserDataPacket(targetUid) {
  const uid = String(targetUid);
  const userSnap = await db().collection('users').doc(uid).get();
  const userData = userSnap.exists ? scrubUserDoc(userSnap.data() || {}) : null;

  const subNames = [
    'likesSent',
    'likesReceived',
    'blocks',
    'contactHashes',
    'notifications',
    'storySeen',
    'clubMemberships',
  ];
  const subcollections = {};
  for (const sub of subNames) {
    subcollections[sub] = await collectQueryDocs(db().collection('users').doc(uid).collection(sub), null, 300);
  }

  const stories = await collectQueryDocs(
    db().collection('stories').where('userId', '==', uid),
    (raw, id) => ({ id, ...raw }),
    200
  );
  const verifications = await collectQueryDocs(
    db().collection('verifications').where('uid', '==', uid),
    (raw, id) => ({ id, ...raw }),
    50
  );
  const reportsFiled = await collectQueryDocs(
    db().collection('reports').where('reporterUid', '==', uid),
    (raw, id) => ({ id, ...raw }),
    100
  );
  const reportsAgainst = await collectQueryDocs(
    db().collection('reports').where('targetUserId', '==', uid),
    (raw, id) => ({ id, ...raw }),
    100
  );
  const deletionRequests = await collectQueryDocs(
    db().collection('deletionRequests').where('uid', '==', uid),
    (raw, id) => ({ id, ...raw }),
    50
  );
  const appeals = await collectQueryDocs(
    db().collection('appeals').where('uid', '==', uid),
    (raw, id) => ({ id, ...raw }),
    50
  );

  const matchSnap = await db().collection('matches').where('uids', 'array-contains', uid).limit(80).get();
  const matches = [];
  for (const matchDoc of matchSnap.docs) {
    const m = matchDoc.data() || {};
    const sentA = await collectQueryDocs(
      matchDoc.ref.collection('messages').where('senderId', '==', uid),
      (raw, id) => ({ id, ...raw }),
      200
    );
    const sentB = await collectQueryDocs(
      matchDoc.ref.collection('messages').where('fromUid', '==', uid),
      (raw, id) => ({ id, ...raw }),
      200
    );
    const byId = new Map();
    [...sentA, ...sentB].forEach((msg) => byId.set(msg.id, msg));
    matches.push({
      id: matchDoc.id,
      uids: m.uids || [],
      createdAt: m.createdAt || null,
      myMessages: Array.from(byId.values()),
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    uid,
    profile: userData,
    subcollections,
    stories,
    verifications,
    reportsFiled,
    reportsAgainst,
    deletionRequests,
    appeals,
    matches,
    notes: [
      'Packet generated for DSAR / download-my-data.',
      'Push tokens and similar secrets are scrubbed from the profile.',
      'Match shells list messages authored by this user only.',
      'Some operational/safety logs may be omitted or retained separately under legal bases.',
    ],
  };
}

/**
 * DSAR export — signed-in user can export self; admin can export any uid.
 * Uploads JSON + ZIP to Storage and returns signed download URLs (7 days).
 */
exports.exportUserDataPacket = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }

    const callerUid = String(context.auth.uid);
    const requestedUid = String(data?.uid || callerUid).trim();
    const isAdmin = await isAdminCaller(callerUid);
    if (requestedUid !== callerUid && !isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'You can only export your own data.');
    }
    if (!requestedUid) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing uid.');
    }

    const packet = await buildUserDataPacket(requestedUid);
    const jsonStr = JSON.stringify(packet, jsonReplacer, 2);
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `wasl-data-${requestedUid.slice(0, 8)}-${stamp}`;
    const jsonPath = `dsar-exports/${requestedUid}/${baseName}.json`;
    const zipPath = `dsar-exports/${requestedUid}/${baseName}.zip`;
    const zipBuf = buildSingleFileZip(`${baseName}.json`, jsonBuf, true);

    const bucket = admin.storage().bucket();
    const jsonFile = bucket.file(jsonPath);
    const zipFile = bucket.file(zipPath);
    await jsonFile.save(jsonBuf, {
      contentType: 'application/json',
      metadata: { cacheControl: 'private, max-age=0' },
    });
    await zipFile.save(zipBuf, {
      contentType: 'application/zip',
      metadata: { cacheControl: 'private, max-age=0' },
    });

    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const [jsonUrl] = await jsonFile.getSignedUrl({ action: 'read', expires });
    const [zipUrl] = await zipFile.getSignedUrl({ action: 'read', expires });

    await writeAudit(callerUid, 'export_user_data_packet', requestedUid, {
      jsonPath,
      zipPath,
      bytes: jsonBuf.length,
      asAdmin: isAdmin && requestedUid !== callerUid,
    });

    await db()
      .collection('users')
      .doc(requestedUid)
      .set(
        {
          lastDsarExportAt: admin.firestore.FieldValue.serverTimestamp(),
          lastDsarExportExpiresAt: admin.firestore.Timestamp.fromMillis(expires),
          lastDsarExportBytes: jsonBuf.length,
          lastDsarExportBy: callerUid,
        },
        { merge: true }
      )
      .catch(() => {});

    await db()
      .collection('dsarExportLogs')
      .add({
        targetUid: requestedUid,
        exportedBy: callerUid,
        asAdmin: isAdmin && requestedUid !== callerUid,
        bytes: jsonBuf.length,
        zipBytes: zipBuf.length,
        jsonPath,
        zipPath,
        expiresAt: admin.firestore.Timestamp.fromMillis(expires),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch(() => {});

    return {
      ok: true,
      uid: requestedUid,
      jsonUrl,
      zipUrl,
      jsonPath,
      zipPath,
      bytes: jsonBuf.length,
      zipBytes: zipBuf.length,
      expiresAt: new Date(expires).toISOString(),
      summary: {
        hasProfile: Boolean(packet.profile),
        stories: packet.stories.length,
        matches: packet.matches.length,
        reportsFiled: packet.reportsFiled.length,
        deletionRequests: packet.deletionRequests.length,
      },
    };
  });

/** Admin emails the reporter a custom “we reviewed it” note — never includes action on target. */
exports.sendReportOutcomeEmail = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const reportId = String(data?.reportId || '').trim();
  const customMessage = String(data?.message || '').trim().slice(0, 5000);
  if (!reportId || !customMessage) {
    throw new functions.https.HttpsError('invalid-argument', 'reportId and message are required.');
  }

  const reportRef = db().collection('reports').doc(reportId);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Report not found.');
  }
  const report = reportSnap.data() || {};
  const reporterUid = String(report.reporterUid || '').trim();
  if (!reporterUid) {
    throw new functions.https.HttpsError('failed-precondition', 'Report has no reporter.');
  }

  const reporterSnap = await db().collection('users').doc(reporterUid).get();
  const to = String(reporterSnap.data()?.email || report.reporterEmail || '')
    .trim()
    .toLowerCase();
  const pushToken = String(reporterSnap.data()?.expoPushToken || '').trim();

  const subject = String(data?.subject || 'Wasl: update on your report').trim().slice(0, 200);
  const safeBody =
    `${customMessage}\n\n` +
    `— Wasl safety team\n` +
    `(This note does not share what action, if any, was taken with the other person.)`;

  let emailSent = false;
  if (to) {
    try {
      const transporter = getOtpEmailTransporter();
      await transporter.sendMail({
        from: OTP_FROM,
        to,
        subject,
        text: safeBody,
        html: `<p>${safeBody.replace(/\n/g, '<br/>')}</p>`,
      });
      emailSent = true;
    } catch (mailErr) {
      console.error('[sendReportOutcomeEmail] mail', mailErr?.message || mailErr);
    }
  }

  let notificationId = null;
  try {
    const notifRef = await db()
      .collection('users')
      .doc(reporterUid)
      .collection('notifications')
      .add({
        toUid: reporterUid,
        fromUid: String(context.auth.uid),
        type: 'report_outcome',
        title: 'Update on your report',
        body: customMessage.slice(0, 400),
        reportId,
        status: 'unread',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    notificationId = notifRef.id;
  } catch (notifErr) {
    console.warn('[sendReportOutcomeEmail] notification', notifErr?.message || notifErr);
  }

  let pushSent = false;
  if (pushToken.startsWith('ExponentPushToken[') || pushToken.startsWith('ExpoPushToken[')) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            to: pushToken,
            sound: 'default',
            title: 'Update on your report',
            body: customMessage.slice(0, 180),
            data: { type: 'report_outcome', reportId },
          },
        ]),
      });
      pushSent = true;
    } catch (pushErr) {
      console.warn('[sendReportOutcomeEmail] push', pushErr?.message || pushErr);
    }
  }

  if (!emailSent && !notificationId && !pushSent) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Could not reach the reporter by email or in-app notification.'
    );
  }

  await reportRef.set(
    {
      outcomeEmailSent: emailSent,
      outcomeNotificationSent: Boolean(notificationId),
      outcomePushSent: pushSent,
      outcomeEmailAt: admin.firestore.FieldValue.serverTimestamp(),
      outcomeEmailTo: to || null,
      outcomeEmailPreview: customMessage.slice(0, 500),
      outcomeEmailBy: context.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAudit(context.auth.uid, 'send_report_outcome_email', reporterUid, {
    reportId,
    to: to || null,
    emailSent,
    notificationId,
    pushSent,
  });

  return { ok: true, to: to || null, emailSent, notificationId, pushSent };
});

/** Create a GitHub issue (or return a prefilled new-issue URL) from a crash group. */
exports.createCrashTrackerIssue = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const fingerprint = String(data?.fingerprint || data?.groupId || '').trim();
  const titleIn = String(data?.title || '').trim().slice(0, 200);
  const bodyIn = String(data?.body || '').trim().slice(0, 12000);

  let group = null;
  if (fingerprint) {
    const snap = await db().collection('crashGroups').doc(fingerprint).get();
    if (snap.exists) group = { id: snap.id, ...(snap.data() || {}) };
  }

  const title =
    titleIn ||
    `[crash] ${group?.name || 'Error'} ×${group?.count || '?'}`.slice(0, 200);
  const body =
    bodyIn ||
    [
      `Fingerprint: ${fingerprint || group?.id || 'n/a'}`,
      `Count: ${group?.count || '?'}`,
      `Fatal: ${group?.isFatal ? 'yes' : 'no'}`,
      `Platform: ${group?.platform || '—'}`,
      `App: ${group?.appVersion || '—'}`,
      '',
      '### Message',
      group?.message || '—',
      '',
      '### Stack',
      '```',
      String(group?.stack || '').slice(0, 6000) || '—',
      '```',
    ].join('\n');

  const githubToken = String(process.env.GITHUB_TOKEN || '').trim();
  const githubRepo = String(process.env.GITHUB_REPO || 'zaintarq/wasl').trim();
  const linearKey = String(process.env.LINEAR_API_KEY || '').trim();

  if (githubToken && githubRepo.includes('/')) {
    const res = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: ['crash', 'auto'] }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new functions.https.HttpsError(
        'internal',
        json?.message || `GitHub issue failed (${res.status})`
      );
    }
    if (fingerprint) {
      await db()
        .collection('crashGroups')
        .doc(fingerprint)
        .set(
          {
            trackerUrl: json.html_url || null,
            trackerIssueNumber: json.number || null,
            trackerProvider: 'github',
            trackerCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }
    await writeAudit(context.auth.uid, 'create_crash_tracker_issue', null, {
      provider: 'github',
      url: json.html_url || null,
      fingerprint,
    });
    return { ok: true, provider: 'github', url: json.html_url || null, number: json.number || null };
  }

  if (linearKey) {
    const teamId = String(process.env.LINEAR_TEAM_ID || '').trim();
    if (!teamId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'LINEAR_API_KEY is set but LINEAR_TEAM_ID is missing.'
      );
    }
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: linearKey,
      },
      body: JSON.stringify({
        query: `mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier url }
          }
        }`,
        variables: {
          input: { teamId, title, description: body },
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    const issue = json?.data?.issueCreate?.issue;
    if (!json?.data?.issueCreate?.success || !issue?.url) {
      throw new functions.https.HttpsError('internal', 'Linear issue create failed.');
    }
    if (fingerprint) {
      await db()
        .collection('crashGroups')
        .doc(fingerprint)
        .set(
          {
            trackerUrl: issue.url,
            trackerProvider: 'linear',
            trackerCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }
    return { ok: true, provider: 'linear', url: issue.url };
  }

  const prefillUrl = `https://github.com/${githubRepo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return {
    ok: true,
    provider: 'prefill',
    url: prefillUrl,
    message: 'Set GITHUB_TOKEN (+ GITHUB_REPO) or LINEAR_API_KEY (+ LINEAR_TEAM_ID) to create issues automatically.',
  };
});

/** Admin: assign / resolve / reopen a crash group. Resolved groups stay hidden until a new hit reopens them. */
exports.updateCrashGroup = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const fingerprint = String(data?.fingerprint || data?.groupId || '').trim();
  const action = String(data?.action || '').trim().toLowerCase();
  if (!fingerprint) {
    throw new functions.https.HttpsError('invalid-argument', 'fingerprint required.');
  }
  if (!['resolve', 'reopen', 'assign', 'unassign'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'action must be resolve|reopen|assign|unassign.');
  }

  const ref = db().collection('crashGroups').doc(fingerprint);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Crash group not found.');
  }

  const adminUid = String(context.auth.uid);
  const assignTo = String(data?.assignTo || adminUid).trim();
  const note = String(data?.note || '').trim().slice(0, 500);
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (action === 'resolve') {
    await ref.set(
      {
        status: 'resolved',
        resolvedAt: now,
        resolvedBy: adminUid,
        resolveNote: note || null,
        updatedAt: now,
      },
      { merge: true }
    );
  } else if (action === 'reopen') {
    await ref.set(
      {
        status: 'open',
        resolvedAt: null,
        resolvedBy: null,
        reopenedAt: now,
        reopenedBy: adminUid,
        updatedAt: now,
      },
      { merge: true }
    );
  } else if (action === 'assign') {
    await ref.set(
      {
        assignedTo: assignTo,
        assignedAt: now,
        assignedBy: adminUid,
        status: String(snap.data()?.status || 'open') === 'resolved' ? 'open' : snap.data()?.status || 'open',
        updatedAt: now,
      },
      { merge: true }
    );
  } else if (action === 'unassign') {
    await ref.set(
      {
        assignedTo: null,
        assignedAt: null,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await writeAudit(adminUid, 'update_crash_group', null, { fingerprint, action, assignTo: assignTo || null });
  return { ok: true, fingerprint, action };
});
