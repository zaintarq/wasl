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

export async function checkUserRoleFromAdminCollection(userId) {
  try {
    if (!userId) {
      return { isAdmin: false, isStaff: false, role: null, error: 'No userId provided' };
    }

    // Simple collection check - query admin collection for this userId
    const adminDocRef = doc(db, COL.admin, String(userId));
    const adminSnap = await getDoc(adminDocRef);

    if (!adminSnap.exists()) {
      // Normal user - no admin document found (expected for 99% of users)
      // Don't log this - it's the normal case
      return { isAdmin: false, isStaff: false, role: null, error: null };
    }

    const adminData = adminSnap.data();
    const role = String(adminData?.role || '').toLowerCase().trim();
    const isAdmin = role === 'admin';
    const isStaff = role === 'staff';

    // Only log if user is actually admin/staff (unusual case)
    if (isAdmin || isStaff) {
      if (__DEV__) console.log('[checkUserRoleFromAdminCollection] Found', role, 'for userId:', userId);
    }

    return { isAdmin, isStaff, role, error: null };
  } catch (error) {
    // Only log actual errors (not "not found" cases)
    if (error.code !== 'permission-denied') {
      console.error('[checkUserRoleFromAdminCollection] Error:', error.message);
    }
    return { isAdmin: false, isStaff: false, role: null, error: error.message };
  }
}

/**
 * Admin-only helpers (enforced by Firestore rules)
 */
