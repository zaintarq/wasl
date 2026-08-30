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
  _adminListUsersCallable,
} from './callables';
import { checkUserRoleFromAdminCollection } from './roles';

export const userService = {
  // Get user by ID
  async getUserById(userId) {
    try {
      // Check if user is logged in first
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        // User not logged in - return gracefully without logging error
        return { data: null, error: 'Not logged in' };
      }
      
      const snap = await getDoc(doc(db, COL.users, userId));
      if (snap.exists()) return { data: { id: snap.id, uid: snap.id, ...snap.data() }, error: null };
      return { data: null, error: 'User not found' };
    } catch (error) {
      // Only log non-permission errors (permission errors are expected when not logged in)
      if (!error?.code?.includes('permission') && !error?.message?.includes('permission')) {
        console.warn('Get user error:', error?.code || error);
      }
      return { data: null, error: error.message };
    }
  },

  // Get all users (discovery + admin directory)
  async getUsers(filters = {}) {
    try {
      const cap = Math.min(Math.max(Number(filters.limit) || 200, 1), 500);
      const currentUser = auth.currentUser;

      if (currentUser?.uid) {
        const role = await checkUserRoleFromAdminCollection(currentUser.uid);
        if (role.isAdmin && _adminListUsersCallable) {
          try {
            const res = await _adminListUsersCallable({ limit: cap });
            const users = Array.isArray(res?.data?.users) ? res.data.users : [];
            return { data: users, error: null };
          } catch (adminErr) {
            if (__DEV__) {
              console.warn('[getUsers] adminListUsers callable failed, falling back:', adminErr?.message || adminErr);
            }
          }
        }
      }

      const map = new Map();

      const addDocs = (docs) => {
        docs.forEach((d) => {
          if (!map.has(d.id)) map.set(d.id, { id: d.id, uid: d.id, ...d.data() });
        });
      };

      try {
        const ordered = query(collection(db, COL.users), orderBy('createdAt', 'desc'), limit(cap));
        addDocs((await getDocs(ordered)).docs);
      } catch (orderErr) {
        console.warn('[getUsers] createdAt query failed:', orderErr?.message || orderErr);
      }

      if (map.size < cap) {
        const plain = query(collection(db, COL.users), limit(cap));
        addDocs((await getDocs(plain)).docs);
      }

      return { data: Array.from(map.values()), error: null };
    } catch (error) {
      console.error('Get users error:', error);
      return { data: [], error: error.message };
    }
  },

  // Update user profile (creates doc if it doesn't exist)
  async updateUser(userId, updates) {
    try {
      // Don't allow updates if user is not authenticated
      // Check Firebase Auth directly to ensure user is logged in
      if (!auth || !auth.currentUser || !auth.currentUser.uid || auth.currentUser.uid !== userId) {
        // Silently return - don't log errors for unauthenticated users
        return { error: 'User not authenticated' };
      }

      // Double-check: ensure userId is valid and matches authenticated user
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        return { error: 'Invalid user ID' };
      }

      // Use setDoc with merge to create if doesn't exist, update if it does
      await setDoc(doc(db, COL.users, userId), {
        ...updates,
        id: userId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return { error: null };
    } catch (error) {
      // Don't log permission errors for unauthenticated users
      if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
        // Silently return - user might not be authenticated yet
        return { error: 'Permission denied' };
      }
      console.error('Update user error:', error);
      return { error: error.message };
    }
  },

  // Update user location (country/city only; no coordinates).
  async updateMyLocation(userId, { country = '', city = '', locationPermission = 'undetermined', locationSetupComplete } = {}) {
    try {
      const c = String(country || '').trim();
      const cityName = String(city || '').trim();
      const payload = {
        locationPermission: String(locationPermission || 'undetermined'),
        locationUpdatedAt: serverTimestamp(),
      };
      if (locationSetupComplete === true) payload.locationSetupComplete = true;
      if (c) {
        payload.country = c;
        payload.countryOfResidence = c; // legacy compatibility
      }
      if (cityName) payload.city = cityName;
      if (c || cityName) payload.location = cityName ? `${cityName}, ${c || ''}`.trim().replace(/,\s*$/, '') : c;

      // Use updateDoc instead of setDoc to ensure we don't accidentally overwrite critical fields like 'role'
      // First, check if document exists
      const userRef = doc(db, COL.users, userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        // Document exists - use updateDoc to preserve all existing fields
        await updateDoc(userRef, {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Document doesn't exist - use setDoc with merge (shouldn't happen in normal flow)
        await setDoc(userRef, {
          id: userId,
          ...payload,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      return { error: null };
    } catch (error) {
      console.warn('Update location error:', error?.code || error);
      return { error: error.message };
    }
  },

  // Create or update user
  async setUser(userId, userData) {
    try {
      // Ensure role is preserved if it already exists
      // role is NOT stored in users collection - it's only in the admin collection
      // Remove role from userData if it's present (shouldn't be, but just in case)
      const { role, ...userDataWithoutRole } = userData;
      
      const finalData = {
        ...userDataWithoutRole,
        id: userId,
        updatedAt: serverTimestamp(),
      };
      
      await setDoc(doc(db, COL.users, userId), finalData, { merge: true });
      return { error: null };
    } catch (error) {
      console.error('Set user error:', error);
      return { error: error.message };
    }
  },
};

/**
 * Likes & Matching
 */
