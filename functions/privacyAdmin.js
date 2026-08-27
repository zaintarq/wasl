/**
 * Admin privacy tools: deletion requests, account wipe, confirmation email (OTP SMTP), crash logs.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const db = () => admin.firestore();

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

  return { requestId: ref.id, alreadyOpen: false };
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

  const ref = await db().collection('crashLogs').add({
    uid: context.auth?.uid ? String(context.auth.uid) : null,
    message,
    stack,
    name,
    isFatal,
    platform,
    appVersion,
    osVersion,
    deviceHash: deviceHash || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { id: ref.id };
});
