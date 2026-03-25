const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const COL = { users: 'users' };
const SIGNUP_OTP_CHALLENGES = 'signup_otp_challenges';
const SIGNUP_SESSIONS = 'signup_sessions';
const PASSWORD_RESET_OTP_CHALLENGES = 'password_reset_otp_challenges';
const PASSWORD_RESET_SESSIONS = 'password_reset_sessions';

/** Pepper for OTP hashing (override with env OTP_PEPPER in production). */
function getOtpPepper() {
  return process.env.OTP_PEPPER || 'huzz-signup-otp-v1-change-in-prod';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashSignupOtp(code) {
  return crypto.createHash('sha256').update(String(code).trim() + getOtpPepper()).digest('hex');
}

function hashPasswordResetOtp(code) {
  return crypto
    .createHash('sha256')
    .update('pwd-reset:' + String(code).trim() + getOtpPepper())
    .digest('hex');
}

function generateSixDigitCode() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, '0');
}

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// NSFW threshold for profile image moderation (Gen1 storage trigger)
const NSFW_THRESHOLD = 0.6;

// Configure email transporter using Gmail SMTP
const getEmailTransporter = () => {
  // Use Gmail SMTP credentials
  const SMTP_SERVER = 'smtp.gmail.com';
  const SMTP_PORT = 587;
  const SMTP_USER = 'noreplyonlystream@gmail.com';
  const SMTP_PASSWORD = 'yvyknzfblnphzhgk';
  
  return nodemailer.createTransport({
    host: SMTP_SERVER,
    port: SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });
};

/**
 * Cloud Function to send wali invitation email
 * 
 * Setup instructions:
 * 1. Install dependencies: cd functions && npm install
 * 2. Deploy: firebase deploy --only functions
 * 
 * Email is configured to use Gmail SMTP (noreplyonlystream@gmail.com)
 */
exports.sendWaliInvitation = functions.region('us-central1').https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method === 'GET') {
    // Helpful message for browser access
    res.status(200).json({ 
      message: 'Wali Invitation Email Service',
      description: 'This endpoint sends wali invitation emails. Use POST method with required fields.',
      requiredFields: ['to', 'waliName', 'userName', 'appDownloadLink', 'waliHash'],
      example: {
        to: 'wali@example.com',
        waliName: 'Guardian Name',
        userName: 'User Name',
        appDownloadLink: 'https://expo.dev/...',
        waliHash: 'ABC123XYZ456'
      }
    });
    return;
  }

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed. Use POST or GET.' });
        return;
      }

      try {
        const { to, waliName, userName, appDownloadLink, waliHash, senderEmail, senderName } = req.body;

        if (!to || !waliName || !userName || !appDownloadLink || !waliHash) {
          res.status(400).json({ error: 'Missing required fields' });
          return;
        }

        // Use provided sender info or fallback to userName
        const finalSenderName = senderName || userName || 'Someone';
        const finalSenderEmail = senderEmail || '';

    const transporter = getEmailTransporter();
    if (!transporter) {
      res.status(500).json({ error: 'Email service not configured' });
      return;
    }

    // Email content
    const emailSubject = `${userName} wants to add you as a Wali (Guardian)`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #800020; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f5f5dc; padding: 30px; border: 3px solid #8b4513; border-top: none; }
          .button { display: inline-block; padding: 14px 28px; background-color: #800020; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px 5px; border: 3px solid #654321; }
          .button-secondary { background-color: #87ceeb; color: #000; border-color: #4682b4; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛡️ Wali Invitation</h1>
          </div>
          <div class="content">
            <p>Hello ${waliName},</p>
            
            <p><strong>${finalSenderName}</strong>${finalSenderEmail ? ` (${finalSenderEmail})` : ''} wants to add you as their Wali (Guardian) on HUZZ.</p>
            
            ${finalSenderEmail ? `<p style="font-size: 12px; color: #666; margin-top: 10px;"><em>This invitation was sent from: ${finalSenderEmail}</em></p>` : ''}
            
            <p>As a Wali, you can help oversee their matches and conversations with their consent.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${appDownloadLink}" class="button">📱 Download HUZZ App</a>
            </div>
            
            <p>After downloading, open the app and use this login hash:</p>
            
            <div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #fff; border: 3px solid #654321; border-radius: 8px;">
              <p style="font-size: 18px; font-weight: bold; color: #800020; margin: 0; letter-spacing: 2px; font-family: monospace;">
                ${waliHash}
              </p>
            </div>
            
            <p style="margin-top: 20px; font-size: 14px;">
              <strong>How to login:</strong><br>
              1. Open the HUZZ app<br>
              2. Click "Log In" button<br>
              3. Scroll down and click "Wali-hash login"<br>
              4. Enter the hash above: <strong>${waliHash}</strong>
            </p>
            
            <p style="margin-top: 20px;">
              <strong>What is a Wali?</strong><br>
              A Wali is a trusted guardian who can help oversee matches and conversations. 
              You'll have access to a special Wali dashboard where you can view your ward's information 
              and help guide them with their consent.
            </p>
          </div>
          <div class="footer">
            <p>This invitation was sent from HUZZ. If you didn't expect this email, you can ignore it.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailText = `
Hello ${waliName},

${finalSenderName}${finalSenderEmail ? ` (${finalSenderEmail})` : ''} wants to add you as their Wali (Guardian) on HUZZ.

${finalSenderEmail ? `This invitation was sent from: ${finalSenderEmail}\n` : ''}

As a Wali, you can help oversee their matches and conversations with their consent.

Download the app: ${appDownloadLink}

LOGIN HASH: ${waliHash}

How to login:
1. Open the HUZZ app
2. Click "Log In" button
3. Scroll down and click "Wali-hash login"
4. Enter the hash: ${waliHash}

What is a Wali?
A Wali is a trusted guardian who can help oversee matches and conversations. 
You'll have access to a special Wali dashboard where you can view your ward's information 
and help guide them with their consent.

This invitation was sent from HUZZ. If you didn't expect this email, you can ignore it.
    `;

    // Use the Gmail account as sender
    const smtpSenderEmail = 'noreplyonlystream@gmail.com';

        const mailOptions = {
          from: `HUZZ <${smtpSenderEmail}>`,
      to: to,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
    };

    await transporter.sendMail(mailOptions);
    
    console.log(`[sendWaliInvitation] Email sent successfully to ${to}`);
    res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('[sendWaliInvitation] Error sending email:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

/**
 * Profile image NSFW moderation (NSFWJS) — Cloud Functions Gen1 storage trigger.
 */
exports.moderateProfileImage = functions
  .region('us-central1')
  .runWith({ memory: '1GB', timeoutSeconds: 60 })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const bucketName = object.bucket;

    if (!filePath || !filePath.startsWith('images/')) {
      return null;
    }

    const pathParts = filePath.split('/');
    if (pathParts.length < 3) {
      return null;
    }

    const userId = pathParts[1];
    const bucket = admin.storage().bucket(bucketName);
    const file = bucket.file(filePath);
    const tempPath = path.join(os.tmpdir(), path.basename(filePath));

    try {
      await file.download({ destination: tempPath });
      const imageBuffer = fs.readFileSync(tempPath);

      const tf = require('@tensorflow/tfjs-node');
      const nsfwjs = require('nsfwjs');

      const model = await nsfwjs.load();
      const decoded = tf.node.decodeImage(imageBuffer);
      const resized = tf.image.resizeBilinear(decoded, [224, 224]);
      decoded.dispose();

      const predictions = await model.classify(resized);
      resized.dispose();

      const scores = {};
      for (const p of predictions) {
        scores[p.className] = p.probability;
      }

      const porn = scores.Porn || 0;
      const hentai = scores.Hentai || 0;
      const sexy = scores.Sexy || 0;
      const isNsfw = porn >= NSFW_THRESHOLD || hentai >= NSFW_THRESHOLD || sexy >= NSFW_THRESHOLD;

      if (isNsfw) {
        console.log(
          `[moderateProfileImage] NSFW detected: path=${filePath} Porn=${porn.toFixed(2)} Hentai=${hentai.toFixed(2)} Sexy=${sexy.toFixed(2)}`
        );
        await file.delete();

        const pathEncoded = filePath.replace(/\//g, '%2F');
        const userRef = db.collection(COL.users).doc(userId);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          const data = userSnap.data();
          const images = Array.isArray(data.images) ? data.images : [];
          const filtered = images.filter((url) => typeof url === 'string' && !url.includes(pathEncoded));
          if (filtered.length !== images.length) {
            await userRef.update({ images: filtered });
            console.log(`[moderateProfileImage] Removed NSFW image from user ${userId} profile.`);
          }
        }
      }
    } catch (err) {
      console.error('[moderateProfileImage] Error:', err.message);
    } finally {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e) {
        // ignore cleanup errors
      }
    }

    return null;
  });

// ---------------------------------------------------------------------------
// Chat safety: toxicity check before send. Blocks vulgar messages and logs
// attempts for admin. Uses bad-words filter; can be replaced with FastText later.
// ---------------------------------------------------------------------------
const VULGAR_COLLECTION = 'vulgarAttempts';
const SAFETY_EVENTS_COLLECTION = 'safetyEvents';
const USER_SAFETY_PROFILES_COLLECTION = 'userSafetyProfiles';

function normalizeSafetyText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function hashSafetyText(text) {
  const normalized = normalizeSafetyText(text);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function deriveRiskSummary(events = []) {
  const now = Date.now();
  const day7 = now - 7 * 24 * 60 * 60 * 1000;
  const day30 = now - 30 * 24 * 60 * 60 * 1000;

  const counts = {
    totalFlags: 0,
    recentFlags7d: 0,
    recentFlags30d: 0,
    sexualFlags30d: 0,
    harassmentFlags30d: 0,
    spamFlags30d: 0,
    scamRiskFlags30d: 0,
    profanityBlocks30d: 0,
    manualReports30d: 0,
    uniqueReporters30d: 0,
    copyPasteSignals30d: 0,
  };

  const recentReasons = [];
  const uniqueReporters = new Set();

  for (const event of events) {
    if (event && event.countTowardRisk === false) continue;
    counts.totalFlags += 1;

    const createdAtMs = toMillis(event?.createdAt);
    const isRecent7d = createdAtMs >= day7;
    const isRecent30d = createdAtMs >= day30;
    const categories = Array.isArray(event?.categories)
      ? event.categories.map(String)
      : event?.category
        ? [String(event.category)]
        : [];

    if (isRecent7d) counts.recentFlags7d += 1;
    if (isRecent30d) {
      counts.recentFlags30d += 1;

      if (categories.includes('sexual')) counts.sexualFlags30d += 1;
      if (categories.includes('harassment')) counts.harassmentFlags30d += 1;
      if (categories.includes('spam')) counts.spamFlags30d += 1;
      if (categories.includes('scam_risk')) counts.scamRiskFlags30d += 1;
      if (event?.source === 'profanity_block') counts.profanityBlocks30d += 1;
      if (event?.source === 'manual_report') {
        counts.manualReports30d += 1;
        if (event?.reporterUid) uniqueReporters.add(String(event.reporterUid));
      }
      if (event?.source === 'copy_paste_signal') counts.copyPasteSignals30d += 1;
    }
  }

  counts.uniqueReporters30d = uniqueReporters.size;

  if (counts.sexualFlags30d >= 3) {
    recentReasons.push(`Repeated sexual language across ${counts.sexualFlags30d} flagged events in 30 days`);
  }
  if (counts.profanityBlocks30d >= 2) {
    recentReasons.push(`${counts.profanityBlocks30d} blocked profanity attempts in 30 days`);
  }
  if (counts.copyPasteSignals30d >= 1) {
    recentReasons.push(`Copy-paste opener pattern detected in ${counts.copyPasteSignals30d} recent signals`);
  }
  if (counts.uniqueReporters30d >= 2) {
    recentReasons.push(`Reported by ${counts.uniqueReporters30d} unique users in 30 days`);
  }
  if (counts.harassmentFlags30d >= 2) {
    recentReasons.push(`Repeated harassment/profanity language across ${counts.harassmentFlags30d} events`);
  }
  if (counts.scamRiskFlags30d >= 1) {
    recentReasons.push(`Scam-risk messaging pattern detected`);
  }
  if (counts.spamFlags30d >= 2) {
    recentReasons.push(`Spam-like message behavior detected across ${counts.spamFlags30d} events`);
  }

  const riskScore =
    counts.sexualFlags30d * 3 +
    counts.harassmentFlags30d * 2 +
    counts.spamFlags30d * 2 +
    counts.scamRiskFlags30d * 4 +
    counts.profanityBlocks30d * 2 +
    counts.manualReports30d * 2 +
    counts.uniqueReporters30d * 3 +
    counts.copyPasteSignals30d * 3 +
    counts.recentFlags7d;

  let riskLevel = 'clear';
  let recommendedAction = 'No action needed';
  let suggestedAdminStatus = 'clear';

  if (
    riskScore >= 12 ||
    counts.sexualFlags30d >= 4 ||
    counts.uniqueReporters30d >= 3 ||
    counts.copyPasteSignals30d >= 2
  ) {
    riskLevel = 'restricted';
    suggestedAdminStatus = 'restricted';
    recommendedAction = 'Immediate moderator review recommended';
  } else if (riskScore >= 7 || counts.sexualFlags30d >= 2 || counts.manualReports30d >= 2) {
    riskLevel = 'review';
    suggestedAdminStatus = 'review';
    recommendedAction = 'Review recent chats and decide on warning or restriction';
  } else if (riskScore >= 3) {
    riskLevel = 'watch';
    suggestedAdminStatus = 'watch';
    recommendedAction = 'Monitor for repeated behavior';
  }

  return {
    ...counts,
    riskScore,
    riskLevel,
    suggestedAdminStatus,
    recommendedAction,
    currentReasons: recentReasons.slice(0, 4),
  };
}

async function listSafetyEventsForUser(targetUid) {
  const snap = await db.collection(SAFETY_EVENTS_COLLECTION).where('targetUid', '==', String(targetUid)).get();
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function refreshUserSafetyProfile(targetUid) {
  const uid = String(targetUid || '').trim();
  if (!uid) return null;

  const [events, userSnap, existingProfileSnap] = await Promise.all([
    listSafetyEventsForUser(uid),
    db.collection(COL.users).doc(uid).get(),
    db.collection(USER_SAFETY_PROFILES_COLLECTION).doc(uid).get(),
  ]);

  const summary = deriveRiskSummary(events);
  const existingProfile = existingProfileSnap.exists ? existingProfileSnap.data() : {};
  const lastFlagAt = events
    .map((event) => toMillis(event?.createdAt))
    .sort((a, b) => b - a)[0] || null;

  const payload = {
    uid,
    userName: userSnap.exists ? String(userSnap.data()?.name || '') : '',
    totalFlags: summary.totalFlags,
    recentFlags7d: summary.recentFlags7d,
    recentFlags30d: summary.recentFlags30d,
    sexualFlags30d: summary.sexualFlags30d,
    harassmentFlags30d: summary.harassmentFlags30d,
    spamFlags30d: summary.spamFlags30d,
    scamRiskFlags30d: summary.scamRiskFlags30d,
    profanityBlocks30d: summary.profanityBlocks30d,
    manualReports30d: summary.manualReports30d,
    uniqueReporters30d: summary.uniqueReporters30d,
    copyPasteSignals30d: summary.copyPasteSignals30d,
    riskScore: summary.riskScore,
    riskLevel: summary.riskLevel,
    recommendedAction: summary.recommendedAction,
    currentReasons: summary.currentReasons,
    lastFlagAt: lastFlagAt ? admin.firestore.Timestamp.fromMillis(lastFlagAt) : null,
    adminStatus: existingProfile?.adminStatus || summary.suggestedAdminStatus,
    adminNotes: existingProfile?.adminNotes || '',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastEvaluatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection(USER_SAFETY_PROFILES_COLLECTION).doc(uid).set(payload, { merge: true });
  return payload;
}

async function writeSafetyEvent(payload) {
  const event = {
    source: String(payload?.source || '').trim(),
    reporterUid: payload?.reporterUid ? String(payload.reporterUid) : null,
    targetUid: String(payload?.targetUid || '').trim(),
    category: payload?.category ? String(payload.category) : '',
    categories: Array.isArray(payload?.categories) ? payload.categories.map(String) : [],
    severity: String(payload?.severity || 'medium'),
    matchId: payload?.matchId ? String(payload.matchId) : null,
    messageId: payload?.messageId ? String(payload.messageId) : null,
    reportId: payload?.reportId ? String(payload.reportId) : null,
    score: Number(payload?.score || 0),
    matchedTerms: Array.isArray(payload?.matchedTerms) ? payload.matchedTerms.map(String) : [],
    details: String(payload?.details || '').slice(0, 280),
    fingerprint: payload?.fingerprint ? String(payload.fingerprint) : '',
    countTowardRisk: payload?.countTowardRisk !== false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection(SAFETY_EVENTS_COLLECTION).add(event);
  return { id: ref.id, ...event };
}

async function maybeCreateCopyPasteSignal(targetUid, fingerprint) {
  const uid = String(targetUid || '').trim();
  const fp = String(fingerprint || '').trim();
  if (!uid || !fp) return false;

  const now = Date.now();
  const day30 = now - 30 * 24 * 60 * 60 * 1000;
  const day7 = now - 7 * 24 * 60 * 60 * 1000;
  const events = await listSafetyEventsForUser(uid);

  const fingerprintEvents = events.filter((event) => {
    const createdAtMs = toMillis(event?.createdAt);
    return (
      event?.source === 'message_fingerprint' &&
      event?.fingerprint === fp &&
      createdAtMs >= day30
    );
  });

  const uniqueMatchCount = new Set(
    fingerprintEvents.map((event) => String(event?.matchId || '')).filter(Boolean)
  ).size;

  const recentSignals = events.filter((event) => {
    const createdAtMs = toMillis(event?.createdAt);
    return (
      event?.source === 'copy_paste_signal' &&
      event?.fingerprint === fp &&
      createdAtMs >= day7
    );
  });

  if (uniqueMatchCount >= 3 && recentSignals.length === 0) {
    await writeSafetyEvent({
      source: 'copy_paste_signal',
      reporterUid: uid,
      targetUid: uid,
      category: 'spam',
      categories: ['spam'],
      severity: uniqueMatchCount >= 5 ? 'high' : 'medium',
      details: `Same message pattern sent across ${uniqueMatchCount} chats`,
      fingerprint: fp,
    });
    return true;
  }

  return false;
}

async function recordSafetyEventAndRefresh(payload) {
  const source = String(payload?.source || '').trim();
  const targetUid = String(payload?.targetUid || '').trim();
  if (!source || !targetUid) {
    throw new Error('Missing source or targetUid');
  }

  const fingerprint = payload?.fingerprint || hashSafetyText(payload?.details || '');
  await writeSafetyEvent({ ...payload, fingerprint });

  if (source === 'message_fingerprint') {
    const createdSignal = await maybeCreateCopyPasteSignal(targetUid, fingerprint);
    if (createdSignal) {
      return refreshUserSafetyProfile(targetUid);
    }
    return null;
  }

  return refreshUserSafetyProfile(targetUid);
}

function isMessageToxic(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  try {
    const Filter = require('bad-words').Filter;
    const filter = new Filter();
    return filter.isProfane(text.trim());
  } catch (e) {
    console.error('[checkMessageToxicity] Filter error:', e.message);
    return false;
  }
}

exports.checkMessageToxicity = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const text = typeof data?.text === 'string' ? data.text : '';
    const matchId = typeof data?.matchId === 'string' ? data.matchId : null;
    const uid = context.auth.uid;

    const toxic = isMessageToxic(text);
    if (toxic) {
      try {
        await db.collection(VULGAR_COLLECTION).add({
          userId: uid,
          originalMessage: text.trim(),
          matchId: matchId || null,
          status: 'blocked',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await recordSafetyEventAndRefresh({
          source: 'profanity_block',
          reporterUid: uid,
          targetUid: uid,
          category: 'harassment',
          categories: ['harassment'],
          severity: 'medium',
          matchId: matchId || null,
          details: text.trim(),
          score: 1,
        });
      } catch (e) {
        console.error('[checkMessageToxicity] Failed to log vulgar attempt:', e.message);
      }
      return { toxic: true };
    }
    return { toxic: false };
  });

exports.recordSafetyEvent = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }

    const source = String(data?.source || '').trim();
    const allowedSources = new Set(['manual_report', 'keyword_scan', 'message_fingerprint']);
    if (!allowedSources.has(source)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid safety event source.');
    }

    const reporterUid = context.auth.uid;
    const targetUid =
      source === 'manual_report'
        ? String(data?.targetUid || '').trim()
        : reporterUid;

    if (!targetUid) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing target user.');
    }

    const categories = Array.isArray(data?.categories) ? data.categories.map(String) : [];
    const payload = {
      source,
      reporterUid,
      targetUid,
      category: categories[0] || String(data?.category || ''),
      categories,
      severity: String(data?.severity || (source === 'message_fingerprint' ? 'low' : 'medium')),
      matchId: data?.matchId ? String(data.matchId) : null,
      messageId: data?.messageId ? String(data.messageId) : null,
      reportId: data?.reportId ? String(data.reportId) : null,
      details: String(data?.details || ''),
      matchedTerms: Array.isArray(data?.matchedTerms) ? data.matchedTerms.map(String) : [],
      score: Number(data?.score || 0),
      countTowardRisk: source !== 'message_fingerprint',
    };

    try {
      const profile = await recordSafetyEventAndRefresh(payload);
      return { ok: true, profile: profile || null };
    } catch (error) {
      console.error('[recordSafetyEvent] Failed:', error.message);
      throw new functions.https.HttpsError('internal', error.message || 'Failed to record safety event.');
    }
  });

// ---------------------------------------------------------------------------
// Chat: on-demand translation via MyMemory (free tier, no paid API).
// https://mymemory.translated.net/doc/spec.php
// Optional: set MYMEMORY_CONTACT_EMAIL in functions config for a higher free daily quota.
// ---------------------------------------------------------------------------
const CHAT_TRANSLATE_LANGS = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'tr', 'ar', 'hi', 'ur', 'bn',
  'ta', 'te', 'id', 'ms', 'th', 'vi', 'zh', 'ja', 'ko', 'fa', 'he', 'el', 'sv', 'cs', 'ro', 'hu', 'sw', 'fil',
]);

/** MyMemory uses slightly different codes for some targets */
const MYMEMORY_TARGET = {
  fil: 'tl',
  zh: 'zh-CN',
};

/** Source side (left of langpair) — MyMemory rejects `auto`; use explicit codes */
const MYMEMORY_SOURCE = {
  zh: 'zh-CN',
  fil: 'tl',
};

function getMyMemoryContactEmail() {
  if (process.env.MYMEMORY_CONTACT_EMAIL) return String(process.env.MYMEMORY_CONTACT_EMAIL).trim();
  try {
    const cfg = functions.config && typeof functions.config === 'function' ? functions.config() : {};
    const e = cfg.mymemory && cfg.mymemory.contact_email;
    return e ? String(e).trim() : '';
  } catch {
    return '';
  }
}

/**
 * Normalize for comparing source vs target (zh-CN vs zh, tl vs fil).
 * @param {string} code
 * @returns {string}
 */
function myMemoryLangBase(code) {
  const s = String(code || '').toLowerCase();
  if (s.startsWith('zh')) return 'zh';
  if (s === 'tl' || s === 'fil') return 'tl';
  return s.split(/[-_]/)[0];
}

/**
 * Detect source language (ISO 639-1) without extra npm deps (avoids ESM/heavy packages on Cloud Functions).
 * MyMemory rejects `auto|target` — we must send an explicit source.
 * Latin script defaults to `en` (cannot distinguish es/fr/de/… without ML).
 * @param {string} raw
 * @returns {string}
 */
function detectSourceIso6391Sync(raw) {
  const t = String(raw || '').trim();
  if (!t) return 'en';

  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(t);
  const hasHebrew = /[\u0590-\u05FF]/.test(t);
  const hasDevanagari = /[\u0900-\u097F]/.test(t);
  const hasBengali = /[\u0980-\u09FF]/.test(t);
  const hasTamil = /[\u0B80-\u0BFF]/.test(t);
  const hasTelugu = /[\u0C00-\u0C7F]/.test(t);
  const hasThai = /[\u0E00-\u0E7F]/.test(t);
  const hasHangul = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(t);
  const hasHiraganaKatakana = /[\u3040-\u30ff\u31f0-\u31ff]/.test(t);
  const hasCJKHan = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(t);
  const hasCyrillic = /[\u0400-\u04FF]/.test(t);
  const hasGreek = /[\u0370-\u03FF]/.test(t);

  if (hasHebrew) return 'he';
  if (hasGreek) return 'el';
  if (hasHangul) return 'ko';
  if (hasHiraganaKatakana) return 'ja';
  if (hasCJKHan && !hasHiraganaKatakana) return 'zh';
  if (hasThai) return 'th';
  if (hasTamil) return 'ta';
  if (hasTelugu) return 'te';
  if (hasBengali) return 'bn';
  if (hasDevanagari) return 'hi';
  if (hasCyrillic) {
    if (/[іїєґІЇЄҐ]/.test(t)) return 'uk';
    return 'ru';
  }
  if (hasArabic) return 'ar';

  // Latin / rest: very short strings default to English (common in chat).
  if (t.length < 24) return 'en';

  return 'en';
}

/**
 * @param {string} text
 * @param {string} targetLang app BCP-47 / ISO code
 * @returns {Promise<string>}
 */
async function translateWithMyMemory(text, targetLang) {
  const targetRaw = MYMEMORY_TARGET[targetLang] || targetLang;
  const q = text.length > 3500 ? `${text.slice(0, 3500)}…` : text;
  const trimmed = q.trim();

  const sourceIso = detectSourceIso6391Sync(trimmed);
  const sourceLeft = MYMEMORY_SOURCE[sourceIso] || sourceIso;
  const target = String(targetRaw).toLowerCase();

  if (myMemoryLangBase(sourceLeft) === myMemoryLangBase(target)) {
    return trimmed;
  }

  const langpair = `${sourceLeft}|${target}`.toLowerCase();
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', q);
  url.searchParams.set('langpair', langpair);
  const contact = getMyMemoryContactEmail();
  if (contact) url.searchParams.set('de', contact);

  const res = await fetch(url.toString(), {
    headers: {'User-Agent': 'HuzzChat/1.0 (Firebase Function)'},
  });
  if (!res.ok) {
    throw new Error(`Translation service HTTP ${res.status}`);
  }
  const j = await res.json();
  const details = String(j.responseDetails || '');
  if (details.includes('MYMEMORY WARNING') && details.includes('FREE TRANSLATION')) {
    throw new Error('Daily free translation limit reached. Try again tomorrow.');
  }
  const status = j.responseStatus;
  if (status !== 200 && status !== '200') {
    throw new Error(details || 'Translation failed');
  }
  const out = j.responseData && j.responseData.translatedText;
  if (typeof out !== 'string' || !out.trim()) {
    throw new Error(details || 'Empty translation');
  }
  return out.trim();
}

exports.translateChatMessage = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const targetLang = typeof data?.targetLang === 'string' ? data.targetLang.trim().toLowerCase() : '';
  if (!text || text.length > 8000) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid text.');
  }
  if (!targetLang || !CHAT_TRANSLATE_LANGS.has(targetLang)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid target language.');
  }
  try {
    const translatedText = await translateWithMyMemory(text, targetLang);
    return {translatedText};
  } catch (e) {
    console.error('[translateChatMessage]', e);
    throw new functions.https.HttpsError(
      'internal',
      e && e.message ? e.message : 'Translation failed. Try again later.'
    );
  }
});

// ---------------------------------------------------------------------------
// Sign up: email OTP → session → finalize (Admin createUser + custom token)
// ---------------------------------------------------------------------------

exports.sendSignupEmailOtp = functions.region('us-central1').https.onCall(async (data) => {
  const emailRaw = data?.email;
  if (!isValidEmailFormat(emailRaw)) {
    throw new functions.https.HttpsError('invalid-argument', 'Please enter a valid email address.');
  }
  const email = normalizeEmail(emailRaw);
  try {
    await admin.auth().getUserByEmail(email);
    throw new functions.https.HttpsError('already-exists', 'This email is already registered. Try logging in.');
  } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    if (e.code !== 'auth/user-not-found') {
      console.error('[sendSignupEmailOtp] getUserByEmail', e);
      throw new functions.https.HttpsError('internal', 'Could not verify email. Try again.');
    }
  }

  const ref = db.collection(SIGNUP_OTP_CHALLENGES).doc(email);
  const snap = await ref.get();
  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000;
  if (snap.exists) {
    const d = snap.data();
    const last = d.lastSentAt && d.lastSentAt.toMillis ? d.lastSentAt.toMillis() : 0;
    if (last && now - last < COOLDOWN_MS) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Please wait a minute before requesting another code.'
      );
    }
  }

  const code = generateSixDigitCode();
  const codeHash = hashSignupOtp(code);
  const expiresAt = admin.firestore.Timestamp.fromMillis(now + 10 * 60 * 1000);

  await ref.set({
    codeHash,
    expiresAt,
    attempts: 0,
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new functions.https.HttpsError('failed-precondition', 'Email service not configured.');
  }

  const smtpSenderEmail = 'noreplyonlystream@gmail.com';
  const mailOptions = {
    from: `HUZZ <${smtpSenderEmail}>`,
    to: email,
    subject: 'Your HUZZ verification code',
    text: `Your verification code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <p style="font-size: 18px;">Your verification code is:</p>
        <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #1d4ed8;">${code}</p>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('[sendSignupEmailOtp] sendMail', err);
    await ref.delete();
    throw new functions.https.HttpsError('internal', 'Could not send email. Try again later.');
  }

  return { ok: true };
});

exports.verifySignupEmailOtp = functions.region('us-central1').https.onCall(async (data) => {
  const emailRaw = data?.email;
  const code = String(data?.code || '').trim();
  if (!isValidEmailFormat(emailRaw)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid email.');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new functions.https.HttpsError('invalid-argument', 'Enter the 6-digit code.');
  }
  const email = normalizeEmail(emailRaw);
  const ref = db.collection(SIGNUP_OTP_CHALLENGES).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'No code request found. Send a new code.');
  }
  const d = snap.data();
  const exp = d.expiresAt && d.expiresAt.toMillis ? d.expiresAt.toMillis() : 0;
  if (Date.now() > exp) {
    await ref.delete();
    throw new functions.https.HttpsError('deadline-exceeded', 'Code expired. Request a new one.');
  }
  const attempts = (d.attempts || 0) + 1;
  if (attempts > 8) {
    await ref.delete();
    throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Request a new code.');
  }
  if (d.codeHash !== hashSignupOtp(code)) {
    await ref.update({ attempts });
    throw new functions.https.HttpsError('permission-denied', 'Incorrect code. Try again.');
  }

  await ref.delete();
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionExpires = admin.firestore.Timestamp.fromMillis(Date.now() + 20 * 60 * 1000);
  await db.collection(SIGNUP_SESSIONS).doc(sessionId).set({
    email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: sessionExpires,
  });

  return { sessionId };
});

exports.finalizeSignupWithSession = functions.region('us-central1').https.onCall(async (data) => {
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  const password = typeof data?.password === 'string' ? data.password : '';
  const name = typeof data?.name === 'string' ? data.name.trim() : '';

  if (!sessionId || sessionId.length < 64) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid session.');
  }
  if (!name || name.length < 1) {
    throw new functions.https.HttpsError('invalid-argument', 'Please enter your name.');
  }
  if (password.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  const sref = db.collection(SIGNUP_SESSIONS).doc(sessionId);
  const ssnap = await sref.get();
  if (!ssnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Session expired. Start sign up again.');
  }
  const sd = ssnap.data();
  const exp = sd.expiresAt && sd.expiresAt.toMillis ? sd.expiresAt.toMillis() : 0;
  if (Date.now() > exp) {
    await sref.delete();
    throw new functions.https.HttpsError('deadline-exceeded', 'Session expired. Start sign up again.');
  }
  const email = normalizeEmail(sd.email);

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'This email is already registered. Try logging in.');
    }
    console.error('[finalizeSignupWithSession] createUser', e);
    throw new functions.https.HttpsError('internal', 'Could not create account. Try again.');
  }

  const uid = userRecord.uid;

  await db.collection(COL.users).doc(uid).set({
    id: uid,
    email,
    name,
    age: null,
    bio: '',
    images: [],
    interests: [],
    location: '',
    country: '',
    countryOfResidence: '',
    matchCountry: '',
    categoryIntent: '',
    emailVerified: false,
    profileComplete: false,
    approvalStatus: 'approved',
    isDisabled: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sref.delete();

  let verificationEmailSent = true;
  try {
    const link = await admin.auth().generateEmailVerificationLink(email);
    const transporter = getEmailTransporter();
    if (transporter) {
      const smtpSenderEmail = 'noreplyonlystream@gmail.com';
      await transporter.sendMail({
        from: `HUZZ <${smtpSenderEmail}>`,
        to: email,
        subject: 'Verify your HUZZ email',
        text: `Hi ${name},\n\nVerify your email: ${link}\n\n`,
        html: `<p>Hi ${name},</p><p><a href="${link}">Verify your email</a></p>`,
      });
    } else {
      verificationEmailSent = false;
    }
  } catch (e) {
    console.warn('[finalizeSignupWithSession] verification email', e);
    verificationEmailSent = false;
  }

  const customToken = await admin.auth().createCustomToken(uid);

  return { customToken, verificationEmailSent };
});

// ---------------------------------------------------------------------------
// Forgot password: email OTP → session → update password + custom token
// ---------------------------------------------------------------------------

exports.sendPasswordResetEmailOtp = functions.region('us-central1').https.onCall(async (data) => {
  const emailRaw = data?.email;
  if (!isValidEmailFormat(emailRaw)) {
    throw new functions.https.HttpsError('invalid-argument', 'Please enter a valid email address.');
  }
  const email = normalizeEmail(emailRaw);

  let userExists = false;
  try {
    await admin.auth().getUserByEmail(email);
    userExists = true;
  } catch (e) {
    if (e.code !== 'auth/user-not-found') {
      console.error('[sendPasswordResetEmailOtp] getUserByEmail', e);
      throw new functions.https.HttpsError('internal', 'Could not verify email. Try again.');
    }
  }

  // Privacy: same response whether or not the account exists; only send email if user exists.
  if (!userExists) {
    return { ok: true };
  }

  const ref = db.collection(PASSWORD_RESET_OTP_CHALLENGES).doc(email);
  const snap = await ref.get();
  const now = Date.now();
  const COOLDOWN_MS = 60 * 1000;
  if (snap.exists) {
    const d = snap.data();
    const last = d.lastSentAt && d.lastSentAt.toMillis ? d.lastSentAt.toMillis() : 0;
    if (last && now - last < COOLDOWN_MS) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Please wait a minute before requesting another code.'
      );
    }
  }

  const code = generateSixDigitCode();
  const codeHash = hashPasswordResetOtp(code);
  const expiresAt = admin.firestore.Timestamp.fromMillis(now + 10 * 60 * 1000);

  await ref.set({
    codeHash,
    expiresAt,
    attempts: 0,
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const transporter = getEmailTransporter();
  if (!transporter) {
    await ref.delete();
    throw new functions.https.HttpsError('failed-precondition', 'Email service not configured.');
  }

  const smtpSenderEmail = 'noreplyonlystream@gmail.com';
  const mailOptions = {
    from: `HUZZ <${smtpSenderEmail}>`,
    to: email,
    subject: 'Your HUZZ password reset code',
    text: `Your password reset code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <p style="font-size: 18px;">Your password reset code is:</p>
        <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #1d4ed8;">${code}</p>
        <p style="color: #64748b; font-size: 14px;">This code expires in 10 minutes. If you didn't request a reset, ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('[sendPasswordResetEmailOtp] sendMail', err);
    await ref.delete();
    throw new functions.https.HttpsError('internal', 'Could not send email. Try again later.');
  }

  return { ok: true };
});

exports.verifyPasswordResetEmailOtp = functions.region('us-central1').https.onCall(async (data) => {
  const emailRaw = data?.email;
  const code = String(data?.code || '').trim();
  if (!isValidEmailFormat(emailRaw)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid email.');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new functions.https.HttpsError('invalid-argument', 'Enter the 6-digit code.');
  }
  const email = normalizeEmail(emailRaw);
  const ref = db.collection(PASSWORD_RESET_OTP_CHALLENGES).doc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'No code request found. Send a new code.');
  }
  const d = snap.data();
  const exp = d.expiresAt && d.expiresAt.toMillis ? d.expiresAt.toMillis() : 0;
  if (Date.now() > exp) {
    await ref.delete();
    throw new functions.https.HttpsError('deadline-exceeded', 'Code expired. Request a new one.');
  }
  const attempts = (d.attempts || 0) + 1;
  if (attempts > 8) {
    await ref.delete();
    throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Request a new code.');
  }
  if (d.codeHash !== hashPasswordResetOtp(code)) {
    await ref.update({ attempts });
    throw new functions.https.HttpsError('permission-denied', 'Incorrect code. Try again.');
  }

  await ref.delete();
  const sessionId = crypto.randomBytes(32).toString('hex');
  const sessionExpires = admin.firestore.Timestamp.fromMillis(Date.now() + 20 * 60 * 1000);
  await db.collection(PASSWORD_RESET_SESSIONS).doc(sessionId).set({
    email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: sessionExpires,
  });

  return { sessionId };
});

exports.finalizePasswordResetWithSession = functions.region('us-central1').https.onCall(async (data) => {
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  const newPassword = typeof data?.newPassword === 'string' ? data.newPassword : '';

  if (!sessionId || sessionId.length < 64) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid session.');
  }
  if (newPassword.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  const sref = db.collection(PASSWORD_RESET_SESSIONS).doc(sessionId);
  const ssnap = await sref.get();
  if (!ssnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Session expired. Start password reset again.');
  }
  const sd = ssnap.data();
  const exp = sd.expiresAt && sd.expiresAt.toMillis ? sd.expiresAt.toMillis() : 0;
  if (Date.now() > exp) {
    await sref.delete();
    throw new functions.https.HttpsError('deadline-exceeded', 'Session expired. Start password reset again.');
  }
  const email = normalizeEmail(sd.email);

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      await sref.delete();
      throw new functions.https.HttpsError('not-found', 'Account not found.');
    }
    console.error('[finalizePasswordResetWithSession] getUserByEmail', e);
    throw new functions.https.HttpsError('internal', 'Could not reset password. Try again.');
  }

  try {
    await admin.auth().updateUser(userRecord.uid, { password: newPassword });
  } catch (e) {
    console.error('[finalizePasswordResetWithSession] updateUser', e);
    throw new functions.https.HttpsError('internal', 'Could not update password. Try again.');
  }

  await sref.delete();

  const customToken = await admin.auth().createCustomToken(userRecord.uid);
  return { customToken };
});
