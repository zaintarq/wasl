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

export const moderationNoticeService = {
  async generateEvidence(targetUid, { matchId = '', reportId = '' } = {}) {
    const callable = _generateModerationEvidenceCallable;
    if (!callable) return { data: null, error: 'Moderation evidence is unavailable.' };
    try {
      const { data } = await callable({
        targetUid: String(targetUid || ''),
        matchId: String(matchId || ''),
        reportId: String(reportId || ''),
      });
      return { data: data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to generate moderation evidence.' };
    }
  },

  async sendNotice(payload) {
    const callable = _sendModerationNoticeCallable;
    if (!callable) return { data: null, error: 'Moderation email is unavailable.' };
    try {
      const { data } = await callable(payload || {});
      return { data: data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to send moderation notice.' };
    }
  },
};

