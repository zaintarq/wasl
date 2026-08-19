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

import { userService } from './userService';
import { notificationService } from './notificationService';

export const verificationService = {
  async submit(uid, { language = 'en', selfieUri, videoUri, transcript = '' }) {
    try {
      const u = String(uid || '').trim();
      if (!u) return { id: null, error: 'Missing uid.' };
      if (!selfieUri || !videoUri) return { id: null, error: 'Selfie and video are required.' };
      const lang = String(language || 'en');

      const selfieUp = await storageService.uploadVerificationMedia(u, selfieUri, { kind: 'selfie', ext: 'jpg' });
      if (selfieUp.error) return { id: null, error: selfieUp.error };
      const videoUp = await storageService.uploadVerificationMedia(u, videoUri, { kind: 'video', ext: 'mp4' });
      if (videoUp.error) return { id: null, error: videoUp.error };

      const payload = {
        uid: u,
        status: 'submitted', // submitted|approved|rejected
        language: lang === 'ur' ? 'ur' : 'en',
        transcript: String(transcript || '').slice(0, 400),
        selfieUrl: selfieUp.url,
        videoUrl: videoUp.url,
        createdAt: serverTimestamp(),
        reviewedAt: null,
        reviewedBy: null,
        decisionNote: '',
      };

      const ref = await addDoc(collection(db, COL.verifications), payload);

      // Update user status (best-effort)
      userService.updateUser(u, { verificationStatus: 'submitted', isVerified: false }).catch(() => {});

      // Notify user
      try {
        await notificationService.createNotification(u, {
          type: 'verification_submitted',
          fromUid: u,
          title: 'Verification submitted',
          body: 'Our team will review your verification soon.',
          status: 'unread',
        });
      } catch {}

      return { id: ref.id, error: null };
    } catch (e) {
      return { id: null, error: e?.message || String(e) };
    }
  },

  async getMyLatest(uid) {
    try {
      const u = String(uid || '').trim();
      if (!u) return { data: null, error: 'Missing uid.' };
      const qRef = query(collection(db, COL.verifications), where('uid', '==', u), orderBy('createdAt', 'desc'), limit(1));
      const snap = await getDocs(qRef);
      const doc0 = snap.docs[0];
      return { data: doc0 ? { id: doc0.id, ...doc0.data() } : null, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async list({ status = 'submitted', limitCount = 50 } = {}) {
    try {
      // Query all verifications, order by createdAt, then filter by status client-side
      // This avoids needing a composite index
      let qRef = query(collection(db, COL.verifications), orderBy('createdAt', 'desc'));
      if (limitCount) qRef = query(qRef, limit(limitCount * 2)); // Get more to account for filtering
      const snap = await getDocs(qRef);
      
      // Filter by status client-side
      let verifs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (status) {
        verifs = verifs.filter(v => String(v.status || '').toLowerCase() === String(status).toLowerCase());
      }
      
      // Limit after filtering
      if (limitCount) {
        verifs = verifs.slice(0, limitCount);
      }
      
      return { data: verifs, error: null };
    } catch (e) {
      // If orderBy fails, try without it
      try {
        const qRef = query(collection(db, COL.verifications), limit(limitCount || 50));
        const snap = await getDocs(qRef);
        let verifs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (status) {
          verifs = verifs.filter(v => String(v.status || '').toLowerCase() === String(status).toLowerCase());
        }
        // Sort client-side by createdAt
        verifs.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        return { data: verifs.slice(0, limitCount || 50), error: null };
      } catch (fallbackError) {
        return { data: [], error: fallbackError.message || String(e) };
      }
    }
  },

  async review(verificationId, { status, decisionNote = '' } = {}, adminUid) {
    try {
      const vid = String(verificationId || '').trim();
      if (!vid) return { error: 'Missing verification id.' };
      const st = String(status || '').trim();
      if (!['approved', 'rejected'].includes(st)) return { error: 'Invalid status.' };

      const ref = doc(db, COL.verifications, vid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: 'Not found.' };
      const v = snap.data() || {};
      const uid = String(v.uid || '').trim();

      await updateDoc(ref, {
        status: st,
        decisionNote: String(decisionNote || '').slice(0, 400),
        reviewedAt: serverTimestamp(),
        reviewedBy: adminUid ? String(adminUid) : null,
      });

      // Update user + notify
      if (uid) {
        const isVerified = st === 'approved';
        await userService.updateUser(uid, {
          isVerified,
          verificationStatus: st,
          verificationUpdatedAt: serverTimestamp(),
        });
        await notificationService.createNotification(uid, {
          type: isVerified ? 'verification_approved' : 'verification_rejected',
          fromUid: adminUid ? String(adminUid) : uid,
          title: isVerified ? 'Verified ✅' : 'Verification rejected',
          body: isVerified ? 'You got the verified badge.' : 'Please re-submit with a clearer selfie/video.',
          status: 'unread',
        });
      }

      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },
};

/**
 * Date Plan Service
 */
