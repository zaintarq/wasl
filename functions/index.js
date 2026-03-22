const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
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

// --- HUZZ branded HTML emails (same vibe as app: sky gradient, Kaushan “Huzz”, blue accents — no image logo) ---

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOtpCodeBlock(code) {
  const c = escapeHtml(code);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#ffffff;border-radius:16px;border:1.5px solid rgba(37,99,235,0.35);box-shadow:0 2px 12px rgba(37,99,235,0.08);">
    <tr>
      <td align="center" style="padding:28px 20px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Your code</p>
        <p style="margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:14px;color:#1d4ed8;line-height:1.2;">${c}</p>
        <p style="margin:14px 0 0;font-size:13px;color:#94a3b8;">Expires in 10 minutes</p>
      </td>
    </tr>
  </table>`;
}

/**
 * @param {{ title: string, preheader?: string, innerHtml: string }} opts
 */
function buildHuzzEmailWrapper(opts) {
  const title = escapeHtml(opts.title);
  const preheader = escapeHtml(opts.preheader || opts.title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Kaushan+Script&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:22px;overflow:hidden;border:1px solid rgba(37,99,235,0.18);box-shadow:0 8px 30px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(180deg,#F8FAFC 0%,#EFF6FF 42%,#DBEAFE 100%);padding:40px 28px 34px;text-align:center;border-bottom:1px solid rgba(37,99,235,0.12);">
              <p style="font-family:'Kaushan Script',Georgia,serif;font-size:48px;line-height:1.05;margin:0 0 12px;color:#1c1917;letter-spacing:0.5px;">Huzz</p>
              <div style="height:3px;width:104px;margin:0 auto;background:linear-gradient(90deg,#1D4ED8,#2563EB,#3B82F6);border-radius:2px;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;font-size:16px;line-height:1.55;">
              ${opts.innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;text-align:center;font-size:12px;line-height:1.55;color:#64748b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
              <strong style="color:#0f172a;">HUZZ</strong> · Dating with intention.<br/>
              If you didn’t request this email, you can ignore it safely.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Configure email transporter using Gmail SMTP (set SMTP_USER / SMTP_PASSWORD in Firebase env)
const getEmailTransporter = () => {
  const SMTP_SERVER = 'smtp.gmail.com';
  const SMTP_PORT = 587;
  let cfg = {};
  try {
    cfg = typeof functions.config === 'function' ? functions.config() : {};
  } catch (e) {
    cfg = {};
  }
  const SMTP_USER = process.env.SMTP_USER || (cfg.smtp && cfg.smtp.user) || 'noreplyonlystream@gmail.com';
  const SMTP_PASSWORD = process.env.SMTP_PASSWORD || (cfg.smtp && cfg.smtp.password) || '';

  if (!SMTP_PASSWORD) {
    console.error('[email] SMTP_PASSWORD missing: set env or firebase functions:config:set smtp.password');
    return null;
  }

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

    // Email content — branded like the app (sky gradient + banana / Huzz header)
    const emailSubject = `${userName} wants to add you as a Wali (Guardian)`;
    const emailHtml = buildHuzzEmailWrapper({
      title: 'Wali invitation — Huzz',
      preheader: `${finalSenderName} invited you to be their Wali on Huzz.`,
      innerHtml: `
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Wali invitation</p>
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.02em;">Hello, ${escapeHtml(waliName)}</h2>
        <p style="margin:0 0 8px;color:#475569;font-size:16px;"><strong style="color:#0f172a;">${escapeHtml(finalSenderName)}</strong>${finalSenderEmail ? ` <span style="color:#64748b;">(${escapeHtml(finalSenderEmail)})</span>` : ''} wants to add you as their <strong>Wali (Guardian)</strong> on <strong style="color:#0f172a;">Huzz</strong>.</p>
        ${finalSenderEmail ? `<p style="margin:0 0 16px;font-size:13px;color:#94a3b8;">Invitation sent from: ${escapeHtml(finalSenderEmail)}</p>` : '<p style="margin:0 0 16px;"></p>'}
        <p style="margin:0 0 20px;color:#475569;font-size:16px;">As a Wali, you can help oversee their matches and conversations with their consent.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td align="center">
              <a href="${escapeHtml(appDownloadLink)}" style="display:inline-block;padding:16px 36px;background:linear-gradient(180deg,#2563EB,#1d4ed8);color:#ffffff !important;font-weight:700;font-size:17px;text-decoration:none;border-radius:22px;border:2px solid rgba(37,99,235,0.45);box-shadow:0 6px 20px rgba(37,99,235,0.25);">Download Huzz</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0f172a;">Your login hash</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#ffffff;border-radius:14px;border:1.5px solid rgba(37,99,235,0.35);">
          <tr>
            <td align="center" style="padding:28px 20px;">
              <p style="margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:20px;font-weight:700;letter-spacing:4px;color:#1d4ed8;">${escapeHtml(waliHash)}</p>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px;font-size:14px;color:#64748b;"><strong style="color:#0f172a;">How to log in</strong></p>
        <ol style="margin:0 0 20px;padding-left:18px;color:#475569;font-size:15px;line-height:1.6;">
          <li>Open the Huzz app</li>
          <li>Tap <strong>Log In</strong></li>
          <li>Choose <strong>Wali-hash login</strong></li>
          <li>Enter the hash above</li>
        </ol>
        <p style="margin:0;font-size:14px;color:#475569;"><strong style="color:#0f172a;">What is a Wali?</strong><br/>A trusted guardian who can help oversee matches and conversations — with a dedicated Wali dashboard.</p>
      `,
    });

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

// Profile image moderation lives in ../functions-moderation (separate codebase — tfjs/nsfwjs).

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
  const html = buildHuzzEmailWrapper({
    title: 'Your HUZZ verification code',
    preheader: `Your Huzz code is ${code}. Expires in 10 minutes.`,
    innerHtml: `
      <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.02em;">Verify it’s you</h2>
      <p style="margin:0 0 6px;color:#475569;font-size:16px;">You’re signing up for <strong style="color:#0f172a;">Huzz</strong>. Enter this code in the app to continue.</p>
      ${buildOtpCodeBlock(code)}
      <p style="margin:0;font-size:14px;color:#64748b;">Never share this code. Huzz staff will never ask for it.</p>
    `,
  });
  const mailOptions = {
    from: `HUZZ <${smtpSenderEmail}>`,
    to: email,
    subject: 'Your HUZZ verification code',
    text: `Huzz — Your verification code\n\n${code}\n\nEnter this code in the app. It expires in 10 minutes.\n\nIf you didn’t request this, ignore this email.`,
    html,
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
    throw new functions.https.HttpsError('invalid-argument', 'Incorrect code. Try again.');
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
      const safeName = escapeHtml(name);
      const safeLink = escapeHtml(link);
      const verifyHtml = buildHuzzEmailWrapper({
        title: 'Verify your Huzz email',
        preheader: `${name}, confirm your email for Huzz.`,
        innerHtml: `
          <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.02em;">Almost there, ${safeName}!</h2>
          <p style="margin:0 0 8px;color:#475569;font-size:16px;">Tap the button below to confirm your email — we’ll keep your account safe.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0;">
            <tr>
              <td align="center">
                <a href="${safeLink}" style="display:inline-block;padding:16px 40px;background:linear-gradient(180deg,#BE123C,#9f1239);color:#ffffff !important;font-weight:700;font-size:17px;text-decoration:none;border-radius:22px;border:2px solid rgba(190,18,60,0.45);box-shadow:0 6px 20px rgba(190,18,60,0.28);">Verify my email</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">Or paste this link: <a href="${safeLink}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${safeLink}</a></p>
        `,
      });
      await transporter.sendMail({
        from: `HUZZ <${smtpSenderEmail}>`,
        to: email,
        subject: 'Verify your HUZZ email',
        text: `Hi ${name},\n\nVerify your email for Huzz:\n${link}\n\n`,
        html: verifyHtml,
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
  const html = buildHuzzEmailWrapper({
    title: 'Reset your Huzz password',
    preheader: `Your password reset code is ${code}.`,
    innerHtml: `
      <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.02em;">Reset your password</h2>
      <p style="margin:0 0 6px;color:#475569;font-size:16px;">We received a request to reset your <strong style="color:#0f172a;">Huzz</strong> password. Enter this code in the app:</p>
      ${buildOtpCodeBlock(code)}
      <p style="margin:0;font-size:14px;color:#64748b;">If you didn’t ask for this, you can ignore this email — your password won’t change.</p>
    `,
  });
  const mailOptions = {
    from: `HUZZ <${smtpSenderEmail}>`,
    to: email,
    subject: 'Your HUZZ password reset code',
    text: `Huzz — Password reset\n\nYour code: ${code}\n\nIt expires in 10 minutes. If you didn’t request this, ignore this email.`,
    html,
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
    throw new functions.https.HttpsError('invalid-argument', 'Incorrect code. Try again.');
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
