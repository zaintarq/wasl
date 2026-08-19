import { app, auth, db, storage } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  deleteField,
  query,
  orderBy,
  where,
  onSnapshot,
  limit,
  addDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { sendExpoPushAsync } from '../pushService';
import { scanMessageText, isMessageToxicLocal } from '../moderationService';
import { sha256 } from '../../utils/hash.native';
import { translateChatMessage } from '../translateChatMessage';
import { COL, getMatchId, userNotificationsCol, bannedDeviceDoc } from './constants';
import {
  _checkMessageToxicityCallable,
  _recordLikeCallable,
  _recordSafetyEventCallable,
  _generateChatSuggestionsCallable,
  _generateModerationEvidenceCallable,
  _sendModerationNoticeCallable,
} from './callables';

import { safetyService } from './safetyService';

export const reportService = {
  async createReport({
    reporterUid,
    targetType,
    targetId,
    targetUserId = null,
    matchId = null,
    senderUid = null,
    recipientUid = null,
    messageSentAt = null,
    reason,
    categories = [],
    details = '',
    autoFlagged = false,
    matchedTerms = [],
    score = 0,
  }) {
    try {
      const resolvedTargetUserId = targetUserId
        ? String(targetUserId)
        : targetType === 'user'
          ? String(targetId)
          : null;
      const payload = {
        reporterUid: String(reporterUid),
        targetType,
        targetId: String(targetId),
        targetUserId: resolvedTargetUserId,
        matchId: matchId ? String(matchId) : null,
        senderUid: senderUid ? String(senderUid) : null,
        recipientUid: recipientUid ? String(recipientUid) : null,
        messageSentAt:
          typeof messageSentAt === 'string'
            ? String(messageSentAt)
            : messageSentAt?.toDate
              ? messageSentAt.toDate().toISOString()
              : messageSentAt instanceof Date
                ? messageSentAt.toISOString()
                : null,
        reason: String(reason || ''),
        categories: Array.isArray(categories) ? categories.map(String) : [],
        details: String(details || ''),
        autoFlagged: !!autoFlagged,
        matchedTerms: Array.isArray(matchedTerms) ? matchedTerms.map(String) : [],
        score: Number(score || 0),
        status: 'open',
        createdAt: serverTimestamp(),
        actionTaken: null,
      };
      const docRef = await addDoc(collection(db, COL.reports), payload);
      if (!autoFlagged && resolvedTargetUserId) {
        const safetyCategories = Array.isArray(payload.categories) && payload.categories.length
          ? payload.categories
          : payload.reason
            ? [payload.reason]
            : [];
        await safetyService.recordEvent({
          source: 'manual_report',
          targetUid: resolvedTargetUserId,
          reportId: docRef.id,
          matchId: payload.matchId,
          messageId: payload.targetType === 'message' ? payload.targetId : null,
          categories: safetyCategories,
          details: payload.details,
          severity: 'medium',
          score: payload.score,
        });
      }
      return { data: { id: docRef.id, ...payload }, error: null };
    } catch (error) {
      console.error('Create report error:', error);
      return { data: null, error: error.message };
    }
  },
};

/**
 * Notifications bucket (per-user subcollection)
 */
