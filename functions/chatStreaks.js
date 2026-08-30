const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { notifyUser } = require('./notifyUser');

const db = admin.firestore();

function dayKey(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

function yesterdayKey(ms = Date.now()) {
  return dayKey(ms - 24 * 60 * 60 * 1000);
}

exports.onChatMessageCreated = functions
  .region('us-central1')
  .firestore.document('matches/{matchId}/messages/{messageId}')
  .onCreate(async (snap, context) => {
    const msg = snap.data() || {};
    if (String(msg.senderType || '') === 'mehram' || msg.deletedAt) return null;

    const fromUid = String(msg.fromUid || '').trim();
    if (!fromUid) return null;

    const matchId = String(context.params.matchId);
    const matchRef = db.collection('matches').doc(matchId);

    let notifyMilestone = false;
    let streakCount = 0;
    let participantUids = [];

    await db.runTransaction(async (tx) => {
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) return;

      const m = matchSnap.data() || {};
      participantUids = Array.isArray(m.uids) ? m.uids.map(String) : [];
      if (!participantUids.includes(fromUid) || participantUids.length < 2) return;

      const today = dayKey();
      const streak = m.chatStreak && typeof m.chatStreak === 'object' ? m.chatStreak : {};
      let count = Number(streak.count || 0);
      let longest = Number(streak.longest || 0);
      let lastDay = String(streak.lastDay || '');
      let currentDay = String(streak.currentDay || '');
      let contributors = { ...(streak.contributors || {}) };

      if (currentDay !== today) {
        currentDay = today;
        contributors = {};
      }

      contributors[fromUid] = true;
      const bothToday = participantUids.every((u) => contributors[u]);

      if (bothToday && lastDay !== today) {
        const yday = yesterdayKey();
        if (lastDay === yday) {
          count += 1;
        } else {
          count = 1;
        }
        lastDay = today;
        longest = Math.max(longest, count);
        if (count === 7 && !streak.milestone7At) {
          notifyMilestone = true;
        }
      }

      const nextStreak = {
        count,
        longest,
        lastDay,
        currentDay,
        contributors,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (notifyMilestone) {
        nextStreak.milestone7At = admin.firestore.FieldValue.serverTimestamp();
      }

      tx.update(matchRef, { chatStreak: nextStreak });
      streakCount = count;
    });

    if (notifyMilestone && participantUids.length >= 2) {
      const body = `You and your match have chatted ${streakCount} days in a row. MashaAllah — keep it going!`;
      await Promise.all(
        participantUids.map((uid) =>
          notifyUser(uid, {
            fromUid: participantUids.find((u) => u !== uid) || null,
            type: 'chat_streak_7',
            title: '🔥 7-day chat streak!',
            body,
            matchId,
          }).catch(() => {})
        )
      );
    }

    return null;
  });
