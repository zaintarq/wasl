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
      } catch (e) {
        console.error('[checkMessageToxicity] Failed to log vulgar attempt:', e.message);
      }
      return { toxic: true };
    }
    return { toxic: false };
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
