/**
 * ZoiVera age verification — verify attestation JWT and mark user 18+.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { jwtVerify, createRemoteJWKSet } = require('jose');
const fs = require('fs');
const path = require('path');

const db = admin.firestore();
const USERS = 'users';

const JWKS_URL =
  process.env.ZOIVERA_JWKS_URL ||
  'https://wlctyycddctuxhnhtdug.supabase.co/functions/v1/jwks-attestation';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

function getZoiVeraApiKey() {
  try {
    const cfg = functions.config().zoivera;
    if (cfg?.api_key) return String(cfg.api_key).trim();
  } catch {
    /* functions.config unavailable locally */
  }
  const fromEnv = String(process.env.ZOIVERA_API_KEY || process.env.EXPO_PUBLIC_ZOIVERA_API_KEY || '').trim();
  if (fromEnv) return fromEnv;
  // Fallback until Firebase config / secrets are set (rotate key in dashboard later).
  return 'zv_live_fa30721874e3df857d948e2d9a3d580bb94ae7585b2028da4f09662aaa54988a';
}

function getExpectedAudience() {
  return String(process.env.ZOIVERA_AUDIENCE || 'https://zaintarq.github.io').trim();
}

function getExpectedIssuer() {
  return String(process.env.ZOIVERA_ISSUER || 'https://zoivera.zoitra.com').trim();
}

/** HTTPS-hosted scanner page (works in iOS Expo Go WebView — real secure origin). */
exports.ageVerifyPage = functions.region('us-central1').https.onRequest((req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.status(204).send('');
    return;
  }

  const uid = String(req.query.uid || '').trim().slice(0, 128);
  const apiKey = getZoiVeraApiKey();
  const audience = getExpectedAudience();

  if (!apiKey) {
    res.status(503).send('Age verification is not configured on the server.');
    return;
  }

  let html;
  try {
    html = fs.readFileSync(path.join(__dirname, 'age-verify.html'), 'utf8');
  } catch (e) {
    console.error('[ageVerifyPage] missing age-verify.html', e);
    res.status(500).send('Scanner page missing.');
    return;
  }

  const inject = `<script>window.__HUZZ__=${JSON.stringify({ apiKey, uid, audience })};</script>`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.status(200).send(inject + html);
});

exports.finalizeZoiVeraAgeCheck = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }

  const attestationJwt = String(data?.attestationJwt || data?.token || '').trim();
  if (!attestationJwt || attestationJwt.length < 32) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing attestation token.');
  }

  const uid = String(context.auth.uid);
  const audience = getExpectedAudience();
  const issuer = getExpectedIssuer();

  let payload;
  try {
    ({ payload } = await jwtVerify(attestationJwt, JWKS, { issuer, audience }));
  } catch (e) {
    console.warn('[finalizeZoiVeraAgeCheck] jwtVerify failed', e?.message || e);
    throw new functions.https.HttpsError(
      'permission-denied',
      'Age verification could not be confirmed. Please try again.'
    );
  }

  if (String(payload.sub || '') !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Verification does not match your account.');
  }
  if (payload.passed !== true) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Age verification did not pass. You must be 18 or older to use Huzz.'
    );
  }
  const threshold = Number(payload.threshold);
  if (!Number.isFinite(threshold) || threshold < 18) {
    throw new functions.https.HttpsError('failed-precondition', 'Verification threshold too low.');
  }
  if (String(payload.method || '') !== 'facial_age') {
    throw new functions.https.HttpsError('failed-precondition', 'Invalid verification method.');
  }

  const userRef = db.collection(USERS).doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User profile not found.');
  }

  await userRef.set(
    {
      ageChecked18Plus: true,
      ageCheckAt: admin.firestore.FieldValue.serverTimestamp(),
      ageCheckMethod: 'zoivera_facial_age',
      ageCheckProvider: 'zoivera',
      ageCheckJti: payload.jti ? String(payload.jti) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, ageChecked18Plus: true };
});
