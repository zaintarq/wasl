const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  // Root .env only (no functions/.env).
}
const { AccessToken } = require('livekit-server-sdk');
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

function getOpenAiApiKey() {
  return String(process.env.OPENAI_API_KEY || '').trim();
}

function getOpenAiModel() {
  return String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
}

function truncateAiText(text, maxLen = 600) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

function buildUserProfileSummary(user) {
  if (!user || typeof user !== 'object') return 'No profile details available.';
  const parts = [
    user.name ? `Name: ${String(user.name).trim()}` : '',
    user.age ? `Age: ${String(user.age).trim()}` : '',
    user.city ? `City: ${String(user.city).trim()}` : '',
    user.country ? `Country: ${String(user.country).trim()}` : '',
    user.bio ? `Bio: ${truncateAiText(user.bio, 220)}` : '',
    user.addMe ? `About: ${truncateAiText(user.addMe, 220)}` : '',
    Array.isArray(user.interests) && user.interests.length
      ? `Interests: ${user.interests.slice(0, 8).map((x) => String(x).trim()).filter(Boolean).join(', ')}`
      : '',
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : 'No profile details available.';
}

function sanitizeSuggestionList(list, maxItems = 3) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const value = String(item || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

async function generateOpenAiSuggestions({systemPrompt, userPrompt}) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
      temperature: 0.85,
      response_format: {type: 'json_object'},
      messages: [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userPrompt},
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorText.slice(0, 280)}`);
  }

  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI returned an empty response.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`OpenAI returned invalid JSON: ${error.message}`);
  }

  const suggestions = sanitizeSuggestionList(parsed?.suggestions, 3);
  if (!suggestions.length) {
    throw new Error('OpenAI did not return any suggestions.');
  }
  return suggestions;
}

// NSFW threshold for profile image moderation (Gen1 storage trigger)
const NSFW_THRESHOLD = 0.6;
const MODERATION_WARNING_TEMPLATES = {
  sexual: {
    subject: 'Warning: inappropriate sexual messages on HUZZ',
    title: 'Inappropriate sexual content',
    body:
      'Our moderation team reviewed recent chat activity and found sexual or explicit language that violates the platform rules.',
  },
  harassment: {
    subject: 'Warning: harassment or abusive language on HUZZ',
    title: 'Harassment / abusive language',
    body:
      'Our moderation team found abusive, hostile, or disrespectful language in your recent chat activity. This is not allowed on HUZZ.',
  },
  spam: {
    subject: 'Warning: repetitive or spam-like messaging on HUZZ',
    title: 'Spam / repetitive messaging',
    body:
      'Our moderation team found repeated opener patterns or spam-like outreach in your recent chats. Repetitive mass messaging is not allowed.',
  },
  scam_risk: {
    subject: 'Warning: scam-risk behavior detected on HUZZ',
    title: 'Scam-risk behavior',
    body:
      'Our moderation team found behavior that appears deceptive, manipulative, or otherwise risky for other users. This is taken seriously.',
  },
  profanity: {
    subject: 'Warning: blocked profanity attempts on HUZZ',
    title: 'Blocked profanity attempts',
    body:
      'Our moderation team reviewed blocked profanity attempts tied to your account. Repeated attempts may lead to stronger action.',
  },
  suspension: {
    subject: 'Account suspension notice from HUZZ',
    title: 'Account suspended',
    body:
      'Your account has been suspended after moderator review of repeated policy violations. The attached evidence file summarizes the reviewed activity.',
  },
  device_ban: {
    subject: 'Device restriction notice from HUZZ',
    title: 'Device restricted',
    body:
      'A device-level restriction has been applied after moderator review of repeated or severe policy violations. The attached evidence file summarizes the reviewed activity.',
  },
};

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row?.[header])).join(','));
  }
  return lines.join('\n');
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

function getWarningEmailUser() {
  return String(process.env.WARNING_SMTP_USER || '').trim();
}

function getWarningEmailPassword() {
  return String(process.env.WARNING_SMTP_PASSWORD || '').trim();
}

function getWarningTransporter() {
  const user = getWarningEmailUser();
  const pass = getWarningEmailPassword();
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user,
      pass,
    },
  });
}

function getModerationTemplate(key) {
  const normalized = String(key || '').trim().toLowerCase();
  return MODERATION_WARNING_TEMPLATES[normalized] || MODERATION_WARNING_TEMPLATES.harassment;
}

function timestampToIso(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return '';
}

async function buildModerationEvidencePayload({targetUid, matchId = '', reportId = ''}) {
  const userSnap = await db.collection(COL.users).doc(String(targetUid)).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};

  const [reportsSnap, vulgarSnap, profileSnap] = await Promise.all([
    db.collection('reports').where('targetUserId', '==', String(targetUid)).get(),
    db.collection('vulgarAttempts').where('userId', '==', String(targetUid)).get(),
    db.collection('userSafetyProfiles').doc(String(targetUid)).get(),
  ]);

  const reports = reportsSnap.docs.map((docSnap) => ({id: docSnap.id, ...docSnap.data()}));
  const vulgarAttempts = vulgarSnap.docs.map((docSnap) => ({id: docSnap.id, ...docSnap.data()}));
  const safetyProfile = profileSnap.exists ? profileSnap.data() || {} : {};
  const participantCache = {};

  const getParticipantsByMatchId = async (targetMatchId) => {
    const key = String(targetMatchId || '').trim();
    if (!key) return {};
    if (participantCache[key]) return participantCache[key];

    const matchSnap = await db.collection('matches').doc(key).get();
    const matchData = matchSnap.exists ? matchSnap.data() || {} : {};
    const participantIds = Array.isArray(matchData?.uids) ? matchData.uids.map(String) : [];
    const participantSnaps = await Promise.all(
      participantIds.map(async (uid) => {
        const snap = await db.collection(COL.users).doc(uid).get();
        return [uid, snap.exists ? snap.data() || {} : {}];
      })
    );
    participantCache[key] = Object.fromEntries(participantSnaps);
    return participantCache[key];
  };

  const enrichedReports = await Promise.all(
    reports.map(async (report) => {
      if (report?.targetType !== 'message' || !report?.matchId || !report?.targetId) {
        return report;
      }

      try {
        const [messageSnap, participantsById] = await Promise.all([
          db.collection('matches').doc(String(report.matchId)).collection('messages').doc(String(report.targetId)).get(),
          getParticipantsByMatchId(report.matchId),
        ]);

        const message = messageSnap.exists ? messageSnap.data() || {} : {};
        const senderUid = String(report.senderUid || message.fromUid || '');
        const recipientUid = String(
          report.recipientUid ||
            Object.keys(participantsById).find((uid) => uid && uid !== senderUid) ||
            ''
        );

        return {
          ...report,
          senderUid: senderUid || null,
          recipientUid: recipientUid || null,
          messageSentAt:
            report.messageSentAt ||
            timestampToIso(message.createdAt) ||
            '',
          senderName: senderUid ? String(participantsById[senderUid]?.name || '') : '',
          recipientName: recipientUid ? String(participantsById[recipientUid]?.name || '') : '',
        };
      } catch {
        return report;
      }
    })
  );

  let exchangeRows = [];
  let matchSummary = null;
  if (matchId) {
    const [matchSnap, messagesSnap] = await Promise.all([
      db.collection('matches').doc(String(matchId)).get(),
      db.collection('matches').doc(String(matchId)).collection('messages').orderBy('createdAt', 'asc').get(),
    ]);
    const matchData = matchSnap.exists ? matchSnap.data() || {} : {};
    const participantIds = Array.isArray(matchData?.uids) ? matchData.uids.map(String) : [];
    const participantSnaps = await Promise.all(
      participantIds.map(async (uid) => {
        const snap = await db.collection(COL.users).doc(uid).get();
        return [uid, snap.exists ? snap.data() || {} : {}];
      })
    );
    const participantsById = Object.fromEntries(participantSnaps);
    matchSummary = {
      id: String(matchId),
      participants: participantIds.map((uid) => ({
        uid,
        name: String(participantsById[uid]?.name || 'Unknown user'),
      })),
    };
    exchangeRows = messagesSnap.docs.map((docSnap) => {
      const message = docSnap.data() || {};
      const senderUid = String(message.fromUid || '');
      const recipientUid = participantIds.find((uid) => uid !== senderUid) || '';
      return {
        rowType: 'message_exchange',
        matchId: String(matchId),
        messageId: docSnap.id,
        senderUid,
        senderName: String(participantsById[senderUid]?.name || 'Unknown user'),
        recipientUid,
        recipientName: String(participantsById[recipientUid]?.name || ''),
        messageType: String(message.type || 'text'),
        text: truncateAiText(message.text || (message.type === 'voice' ? '[Voice note]' : ''), 1200),
        moderationFlagged: message?.moderation?.flagged === true ? 'yes' : 'no',
        moderationCategories: Array.isArray(message?.moderation?.categories) ? message.moderation.categories.join('|') : '',
        sentAt: timestampToIso(message.createdAt),
      };
    });
  }

  const rows = [
    {
      rowType: 'summary',
      targetUid: String(targetUid),
      targetName: String(userData?.name || ''),
      targetEmail: String(userData?.email || ''),
      reportCount: reports.length,
      vulgarAttemptCount: vulgarAttempts.length,
      riskLevel: String(safetyProfile?.riskLevel || ''),
      currentReasons: Array.isArray(safetyProfile?.currentReasons) ? safetyProfile.currentReasons.join(' | ') : '',
      generatedAt: new Date().toISOString(),
    },
    ...enrichedReports.map((report) => ({
      rowType: 'report',
      targetUid: String(targetUid),
      reportId: report.id,
      reporterUid: String(report.reporterUid || ''),
      senderUid: String(report.senderUid || ''),
      senderName: String(report.senderName || ''),
      recipientUid: String(report.recipientUid || ''),
      recipientName: String(report.recipientName || ''),
      reason: String(report.reason || ''),
      categories: Array.isArray(report.categories) ? report.categories.join('|') : '',
      autoFlagged: report.autoFlagged ? 'yes' : 'no',
      status: String(report.status || ''),
      details: truncateAiText(report.details || '', 1200),
      matchId: String(report.matchId || ''),
      messageId: String(report.targetType === 'message' ? report.targetId || '' : ''),
      messageSentAt: String(report.messageSentAt || ''),
      createdAt: timestampToIso(report.createdAt),
    })),
    ...vulgarAttempts.map((attempt) => ({
      rowType: 'vulgar_attempt',
      targetUid: String(targetUid),
      attemptId: attempt.id,
      status: String(attempt.status || ''),
      originalMessage: truncateAiText(attempt.originalMessage || '', 1200),
      matchId: String(attempt.matchId || ''),
      createdAt: timestampToIso(attempt.createdAt),
    })),
    ...exchangeRows,
  ];

  if (reportId) {
    rows.unshift({
      rowType: 'selected_report',
      targetUid: String(targetUid),
      reportId: String(reportId),
      generatedAt: new Date().toISOString(),
    });
  }

  return {
    target: {
      uid: String(targetUid),
      name: String(userData?.name || 'User'),
      email: String(userData?.email || ''),
    },
    safetyProfile: {
      riskLevel: String(safetyProfile?.riskLevel || ''),
      currentReasons: Array.isArray(safetyProfile?.currentReasons) ? safetyProfile.currentReasons : [],
      recommendedAction: String(safetyProfile?.recommendedAction || ''),
    },
    matchSummary,
    rows,
    csvContent: rowsToCsv(rows),
  };
}

async function writeModerationAuditLog(adminUid, action, targetUserId, details = {}) {
  await db.collection('auditLogs').add({
    adminId: String(adminUid),
    action: String(action),
    targetUserId: targetUserId ? String(targetUserId) : null,
    details,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

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

/** Mint LiveKit JWT — only participants in an active liveRandomSessions doc may join. */
function getLiveKitServerConfig() {
  const url = String(process.env.LIVEKIT_URL || process.env.EXPO_PUBLIC_LIVEKIT_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  return { url, apiKey, apiSecret };
}

exports.getLiveKitToken = functions
  .runWith({ secrets: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] })
  .region('us-central1')
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const sessionId = typeof data?.sessionId === 'string' ? data.sessionId.trim() : '';
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId.');
  }
  const uid = context.auth.uid;
  const { url, apiKey, apiSecret } = getLiveKitServerConfig();
  if (!url || !apiKey || !apiSecret) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'LiveKit is not configured. Set LIVEKIT_URL (or EXPO_PUBLIC_LIVEKIT_URL), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.'
    );
  }

  const snap = await db.collection('liveRandomSessions').doc(sessionId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Session not found.');
  }
  const d = snap.data() || {};
  const uids = Array.isArray(d.uids) ? d.uids.map(String) : [];
  if (!uids.includes(uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Not part of this Live session.');
  }
  if (d.status !== 'active') {
    throw new functions.https.HttpsError('failed-precondition', 'Session is not active.');
  }

  const roomName = `lr_${sessionId}`;
  const at = new AccessToken(apiKey, apiSecret, {
    identity: uid,
    ttl: 15 * 60,
    name: uid,
  });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });
  const token = await at.toJwt();
  return { token, url, roomName };
});

exports.checkUsernameAvailable = functions.region('us-central1').https.onCall(async (data) => {
  const username = String(data?.username || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { available: false, reason: 'invalid' };
  }
  const snap = await db.collection('usernames').doc(username).get();
  return { available: !snap.exists };
});

exports.getClubLiveKitToken = functions
  .runWith({ secrets: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] })
  .region('us-central1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const clubId = typeof data?.clubId === 'string' ? data.clubId.trim() : '';
    if (!clubId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing clubId.');
    }
    const uid = context.auth.uid;
    const { url, apiKey, apiSecret } = getLiveKitServerConfig();
    if (!url || !apiKey || !apiSecret) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'LiveKit is not configured.'
      );
    }

    const memberSnap = await db.collection('clubs').doc(clubId).collection('members').doc(uid).get();
    if (!memberSnap.exists) {
      throw new functions.https.HttpsError('permission-denied', 'Not a member of this club.');
    }
    const member = memberSnap.data() || {};
    const clubSnap = await db.collection('clubs').doc(clubId).get();
    if (!clubSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Club not found.');
    }
    const club = clubSnap.data() || {};
    const role = String(member.role || 'member');
    const micMode = String(club.micMode || 'request');

    let canPublish = false;
    if (role === 'owner' || role === 'admin') {
      canPublish = true;
    } else if (micMode === 'open') {
      canPublish = true;
    } else if (micMode === 'request' && member.canSpeak === true) {
      canPublish = true;
    } else if (micMode === 'admin_only') {
      canPublish = false;
    }

    const roomName = `club_${clubId}`;
    const at = new AccessToken(apiKey, apiSecret, {
      identity: uid,
      ttl: 60 * 60,
      name: uid,
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe: true,
    });
    const token = await at.toJwt();
    return { token, url, roomName, canPublish };
  });

exports.generateChatSuggestions = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }

  const matchId = typeof data?.matchId === 'string' ? data.matchId.trim() : '';
  const mode = typeof data?.mode === 'string' ? data.mode.trim().toLowerCase() : 'reply_suggestions';
  const draft = typeof data?.draft === 'string' ? data.draft.trim() : '';
  const uid = context.auth.uid;

  if (!matchId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing matchId.');
  }
  if (!['icebreakers', 'reply_suggestions'].includes(mode)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid suggestion mode.');
  }

  try {
    const matchSnap = await db.collection('matches').doc(matchId).get();
    if (!matchSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Match not found.');
    }

    const matchData = matchSnap.data() || {};
    const uids = Array.isArray(matchData.uids) ? matchData.uids.map(String) : [];
    if (!uids.includes(uid)) {
      throw new functions.https.HttpsError('permission-denied', 'Not allowed to access this match.');
    }

    const otherUid = uids.find((id) => id !== uid) || '';
    const [meSnap, otherSnap, messagesSnap] = await Promise.all([
      db.collection(COL.users).doc(uid).get(),
      otherUid ? db.collection(COL.users).doc(otherUid).get() : null,
      db.collection('matches')
        .doc(matchId)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(8)
        .get(),
    ]);

    const me = meSnap.exists ? meSnap.data() || {} : {};
    const otherUser = otherSnap && otherSnap.exists ? otherSnap.data() || {} : {};
    const recentMessages = messagesSnap.docs
      .map((docSnap) => docSnap.data() || {})
      .reverse()
      .map((message) => {
        const speaker = String(message.fromUid || '') === uid ? 'Me' : (otherUser?.name || 'Them');
        const text = message.type === 'voice'
          ? '[Voice note]'
          : truncateAiText(String(message.text || '').trim(), 180);
        return `${speaker}: ${text}`;
      })
      .filter(Boolean)
      .join('\n');

    const systemPrompt = [
      'You write short, respectful social-chat suggestions for a connection-focused app.',
      'Never generate sexual, manipulative, deceptive, or coercive language.',
      'Keep suggestions warm, natural, and concise.',
      'Return strict JSON in the form {"suggestions":["...", "...", "..."]}.',
    ].join(' ');

    const userPrompt = mode === 'icebreakers'
      ? [
          'Generate 3 conversation starters for the current user.',
          'Each suggestion must be under 120 characters.',
          'They should feel personal to the other profile and easy to send as a first message.',
          `My profile:\n${buildUserProfileSummary(me)}`,
          `Their profile:\n${buildUserProfileSummary(otherUser)}`,
          recentMessages ? `Recent chat context:\n${recentMessages}` : 'No prior messages yet.',
        ].join('\n\n')
      : [
          'Generate 3 reply suggestions for the current user.',
          'Each suggestion must be under 140 characters and should sound like a direct reply they can send now.',
          draft ? `Current draft:\n${truncateAiText(draft, 220)}` : 'Current draft: (empty)',
          `My profile:\n${buildUserProfileSummary(me)}`,
          `Their profile:\n${buildUserProfileSummary(otherUser)}`,
          recentMessages ? `Recent chat context:\n${recentMessages}` : 'No recent messages available.',
        ].join('\n\n');

    const suggestions = await generateOpenAiSuggestions({systemPrompt, userPrompt});
    return {suggestions, mode};
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    console.error('[generateChatSuggestions]', error);
    throw new functions.https.HttpsError(
      error.message === 'Missing OPENAI_API_KEY.' ? 'failed-precondition' : 'internal',
      error && error.message ? error.message : 'Failed to generate chat suggestions.'
    );
  }
});

exports.generateModerationEvidence = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const targetUid = typeof data?.targetUid === 'string' ? data.targetUid.trim() : '';
  const matchId = typeof data?.matchId === 'string' ? data.matchId.trim() : '';
  const reportId = typeof data?.reportId === 'string' ? data.reportId.trim() : '';
  if (!targetUid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing target user.');
  }

  try {
    const evidence = await buildModerationEvidencePayload({targetUid, matchId, reportId});
    const filename = `moderation_evidence_${targetUid}_${Date.now()}.csv`;
    await writeModerationAuditLog(context.auth.uid, 'generate_moderation_evidence', targetUid, {
      matchId: matchId || null,
      reportId: reportId || null,
      filename,
    });
    return {
      filename,
      csvContent: evidence.csvContent,
      target: evidence.target,
      safetyProfile: evidence.safetyProfile,
      rowCount: evidence.rows.length,
      matchSummary: evidence.matchSummary,
    };
  } catch (error) {
    console.error('[generateModerationEvidence]', error);
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to generate moderation evidence.');
  }
});

exports.sendModerationNotice = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required.');
  }

  const targetUid = typeof data?.targetUid === 'string' ? data.targetUid.trim() : '';
  const matchId = typeof data?.matchId === 'string' ? data.matchId.trim() : '';
  const reportId = typeof data?.reportId === 'string' ? data.reportId.trim() : '';
  const templateKey = typeof data?.templateKey === 'string' ? data.templateKey.trim().toLowerCase() : 'harassment';
  const customMessage = typeof data?.customMessage === 'string' ? data.customMessage.trim() : '';
  const actionType = typeof data?.actionType === 'string' ? data.actionType.trim().toLowerCase() : 'warning';
  const referenceNotes = typeof data?.referenceNotes === 'string' ? data.referenceNotes.trim() : '';
  const includeEvidence = data?.includeEvidence !== false;

  if (!targetUid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing target user.');
  }
  if (!['warning', 'suspension', 'device_ban'].includes(actionType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid moderation action.');
  }

  const transporter = getWarningTransporter();
  if (!transporter) {
    throw new functions.https.HttpsError('failed-precondition', 'Missing warning email SMTP configuration.');
  }

  try {
    const evidence = await buildModerationEvidencePayload({targetUid, matchId, reportId});
    if (!evidence.target.email) {
      throw new Error('Target user has no email address on file.');
    }

    const template = getModerationTemplate(
      actionType === 'warning' ? templateKey : actionType === 'suspension' ? 'suspension' : 'device_ban'
    );
    const filename = `moderation_notice_${targetUid}_${Date.now()}.csv`;
    const reasonsLine = evidence.safetyProfile.currentReasons?.length
      ? evidence.safetyProfile.currentReasons.join('; ')
      : 'Moderator-reviewed policy violations';
    const references = [
      reportId ? `Report reference: ${reportId}` : '',
      matchId ? `Match reference: ${matchId}` : '',
      referenceNotes ? `Moderator references: ${referenceNotes}` : '',
    ].filter(Boolean);

    const html = `
      <div style="margin:0;padding:24px;background:#fff8fb;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #eadcf3;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
          <div style="padding:28px 28px 20px;background:linear-gradient(135deg,#fff4f7 0%,#eff6ff 50%,#f0fdf4 100%);border-bottom:1px solid #eadcf3;">
            <div style="text-align:center;">
              <div style="font-size:42px;line-height:1;font-weight:800;font-style:italic;color:#1c1917;letter-spacing:0.5px;">Huzz</div>
              <div style="width:96px;height:4px;border-radius:999px;margin:8px auto 0;background:linear-gradient(90deg,#1d4ed8,#2563eb,#3b82f6);"></div>
              <div style="margin-top:16px;display:inline-block;padding:7px 12px;border-radius:999px;background:#fff;border:1px solid #f1d1dc;color:#e11d48;font-size:11px;font-weight:800;letter-spacing:1px;">MODERATION NOTICE</div>
              <h2 style="margin:18px 0 0;font-size:28px;line-height:1.2;color:#111827;">${template.title}</h2>
            </div>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 14px;font-size:15px;">Hello ${evidence.target.name || 'there'},</p>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7;">${template.body}</p>
            <div style="margin:18px 0;padding:16px 18px;border-radius:18px;background:#f8fafc;border:1px solid #dbeafe;">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.8px;color:#2563eb;margin-bottom:8px;">WHY YOU ARE RECEIVING THIS</div>
              <div style="font-size:14px;line-height:1.7;color:#111827;">${reasonsLine}</div>
            </div>
            ${customMessage ? `
              <div style="margin:18px 0;padding:16px 18px;border-radius:18px;background:#fff7ed;border:1px solid #fde68a;">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.8px;color:#d97706;margin-bottom:8px;">MODERATOR MESSAGE</div>
                <div style="font-size:14px;line-height:1.7;color:#111827;">${customMessage}</div>
              </div>
            ` : ''}
            ${references.length ? `
              <div style="margin:18px 0;padding:16px 18px;border-radius:18px;background:#faf5ff;border:1px solid #e9d5ff;">
                <div style="font-size:12px;font-weight:800;letter-spacing:0.8px;color:#7c3aed;margin-bottom:8px;">REFERENCES</div>
                <div style="font-size:14px;line-height:1.7;color:#111827;">${references.join('<br>')}</div>
              </div>
            ` : ''}
            ${includeEvidence ? `
              <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#374151;">
                A CSV evidence file is attached for transparency and record-keeping.
              </p>
            ` : ''}
            <p style="margin:18px 0 0;font-size:14px;line-height:1.7;color:#374151;">
              If you believe this was sent in error, reply to this email and include the references above.
            </p>
          </div>
          <div style="padding:18px 28px;background:#fff7f9;border-top:1px solid #f1dbe6;text-align:center;font-size:12px;color:#6b7280;">
            HUZZ Moderation Team
          </div>
        </div>
      </div>
    `;
    const text = [
      template.title,
      '',
      `Hello ${evidence.target.name || 'there'},`,
      '',
      template.body,
      '',
      `Why you are receiving this: ${reasonsLine}`,
      customMessage ? `Moderator note: ${customMessage}` : '',
      references.length ? `References:\n${references.join('\n')}` : '',
      includeEvidence ? 'An evidence CSV is attached for transparency and record-keeping.' : '',
      'If you believe this was sent in error, reply to this email and include the references above.',
      '',
      'HUZZ Moderation Team',
    ].filter(Boolean).join('\n');

    await transporter.sendMail({
      from: `HUZZ Warnings <${getWarningEmailUser()}>`,
      to: evidence.target.email,
      subject: template.subject,
      text,
      html,
      attachments: includeEvidence ? [
        {
          filename,
          content: evidence.csvContent,
          contentType: 'text/csv',
        },
      ] : [],
    });

    const userRef = db.collection(COL.users).doc(String(targetUid));
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    if (actionType === 'suspension') {
      await userRef.set(
        {
          isDisabled: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
    }

    if (actionType === 'device_ban') {
      const deviceHash = String(userData?.deviceHash || '').trim();
      if (!deviceHash) {
        throw new Error('User has no device hash recorded.');
      }
      await db.collection('bannedDevices').doc(deviceHash).set(
        {
          deviceHash,
          bannedByUid: String(context.auth.uid),
          reason: `moderation_notice:${templateKey || actionType}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );
    }

    await writeModerationAuditLog(context.auth.uid, `send_${actionType}_notice`, targetUid, {
      templateKey,
      matchId: matchId || null,
      reportId: reportId || null,
      referenceNotes: referenceNotes || null,
      emailedTo: evidence.target.email,
      filename,
      includeEvidence,
    });

    return {
      ok: true,
      emailedTo: evidence.target.email,
      filename,
      actionType,
    };
  } catch (error) {
    console.error('[sendModerationNotice]', error);
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to send moderation notice.');
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
  const usernameRaw = typeof data?.username === 'string' ? data.username.trim() : '';

  if (!sessionId || sessionId.length < 64) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid session.');
  }
  if (!name || name.length < 1) {
    throw new functions.https.HttpsError('invalid-argument', 'Please enter your name.');
  }
  const username = String(usernameRaw || '').trim().toLowerCase().replace(/^@+/, '');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Username must be 3–20 characters: letters, numbers, underscore only.'
    );
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

  const usernameRef = db.collection('usernames').doc(username);
  const existingUsername = await usernameRef.get();
  if (existingUsername.exists) {
    await admin.auth().deleteUser(uid);
    throw new functions.https.HttpsError('already-exists', 'That username is taken. Try another.');
  }

  await db.runTransaction(async (tx) => {
    tx.set(usernameRef, { uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.set(db.collection(COL.users).doc(uid), {
      id: uid,
      email,
      name,
      username,
      age: null,
      bio: '',
      images: [],
      interests: [],
      location: '',
      country: '',
      countryOfResidence: '',
      matchCountry: '',
      emailVerified: false,
      profileComplete: false,
      approvalStatus: 'approved',
      isDisabled: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
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

const ANDROID_PACKAGE = 'com.huzz.app';
const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

async function sendExpoPushBatch(messages = []) {
  if (!Array.isArray(messages) || !messages.length) return { ok: true, sent: 0 };
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo push failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return { ok: true, sent: messages.length };
}

exports.broadcastAppUpdate = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only.');
  }

  const title = String(data?.title || 'Update Huzz').trim() || 'Update Huzz';
  const body = String(
    data?.body || 'A new version is available. Update from the Play Store to keep using Huzz.'
  ).trim();
  const minVersion = String(data?.minVersion || '').trim();
  const playStoreUrl = String(data?.playStoreUrl || PLAY_STORE_WEB_URL).trim() || PLAY_STORE_WEB_URL;
  const alertId = `alert_${Date.now()}`;

  await db.collection('appAlerts').doc('current').set({
    active: true,
    alertId,
    title,
    body,
    minVersion: minVersion || null,
    forceUpdate: true,
    playStoreUrl,
    androidPackage: ANDROID_PACKAGE,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdByUid: context.auth.uid,
    pushSentCount: 0,
  });

  const usersSnap = await db.collection('users').get();
  const tokens = [];
  usersSnap.forEach((userDoc) => {
    const token = String(userDoc.data()?.expoPushToken || '').trim();
    if (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) {
      tokens.push(token);
    }
  });

  let pushSent = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const messages = chunk.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      priority: 'high',
      data: {
        type: 'app_update',
        alertId,
        playStoreUrl,
      },
    }));
    await sendExpoPushBatch(messages);
    pushSent += chunk.length;
  }

  await db.collection('appAlerts').doc('current').update({ pushSentCount: pushSent });

  return {
    alertId,
    pushSent,
    totalUsers: usersSnap.size,
    tokensFound: tokens.length,
  };
});

exports.clearAppUpdateAlert = functions.region('us-central1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isAdminCaller(context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admin only.');
  }

  await db.collection('appAlerts').doc('current').set(
    {
      active: false,
      clearedAt: admin.firestore.FieldValue.serverTimestamp(),
      clearedByUid: context.auth.uid,
    },
    { merge: true }
  );

  return { cleared: true };
});
