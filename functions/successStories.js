const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

const MET_VIA_LABELS = {
  match: 'We matched on Wasl',
  club: 'We met in a Wasl club',
  live: 'We connected on Wasl Live',
  other: 'We met on Wasl',
};

function assertAdmin(context) {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
}

async function isAdminCaller(uid) {
  if (!uid) return false;
  try {
    const snap = await db.collection('admin').doc(String(uid)).get();
    return snap.exists && String(snap.data()?.role || '').toLowerCase().trim() === 'admin';
  } catch {
    return false;
  }
}

async function assertAdminCaller(context) {
  assertAdmin(context);
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only.');
  }
}

exports.submitSuccessStory = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const body = String(data?.body || '').trim().slice(0, 1200);
  const city = String(data?.city || '').trim().slice(0, 80);
  const metVia = MET_VIA_LABELS[data?.metVia] ? String(data.metVia) : 'match';

  if (body.length < 40) {
    throw new functions.https.HttpsError('invalid-argument', 'Please write at least a few sentences.');
  }

  const blocked = /\b(@|https?:\/\/|www\.)/i.test(body);
  if (blocked) {
    throw new functions.https.HttpsError('invalid-argument', 'Please avoid links or @handles — keep it anonymous.');
  }

  await db.collection('successStories').add({
    body,
    city: city || null,
    metVia,
    metViaLabel: MET_VIA_LABELS[metVia],
    status: 'pending',
    submittedBy: context.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedAt: null,
    reviewedAt: null,
    reviewedBy: null,
  });

  return { error: null };
});

exports.publishSuccessStory = functions.region('us-central1').https.onCall(async (data, context) => {
  await assertAdminCaller(context);
  const storyId = String(data?.storyId || '').trim();
  if (!storyId) throw new functions.https.HttpsError('invalid-argument', 'Missing storyId.');

  const ref = db.collection('successStories').doc(storyId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Story not found.');

  await ref.update({
    status: 'published',
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedBy: context.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { error: null };
});

exports.rejectSuccessStory = functions.region('us-central1').https.onCall(async (data, context) => {
  await assertAdminCaller(context);
  const storyId = String(data?.storyId || '').trim();
  const reason = String(data?.reason || '').trim().slice(0, 280);
  if (!storyId) throw new functions.https.HttpsError('invalid-argument', 'Missing storyId.');

  const ref = db.collection('successStories').doc(storyId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Story not found.');

  await ref.update({
    status: 'rejected',
    rejectReason: reason || null,
    publishedAt: null,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedBy: context.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { error: null };
});

exports.unpublishSuccessStory = functions.region('us-central1').https.onCall(async (data, context) => {
  await assertAdminCaller(context);
  const storyId = String(data?.storyId || '').trim();
  if (!storyId) throw new functions.https.HttpsError('invalid-argument', 'Missing storyId.');

  await db.collection('successStories').doc(storyId).update({
    status: 'pending',
    publishedAt: null,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedBy: context.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { error: null };
});
