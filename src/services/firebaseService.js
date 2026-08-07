import { app, auth, db, storage } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
import { sendExpoPushAsync } from './pushService';
import { scanMessageText } from './moderationService';
import { sha256 } from '../utils/hash.native';
// Import new services
import { activityService } from './activityService';
import { vpnDetectionService } from './vpnDetectionService';
import { userApprovalService } from './userApprovalService';
import { suspiciousAccountService } from './suspiciousAccountService';
import { matchAnalyticsService } from './matchAnalyticsService';
import { contentModerationService } from './contentModerationService';
import { auditLogService } from './auditLogService';
import { exportService } from './exportService';
import { translateChatMessage } from './translateChatMessage';

/**
 * Firestore collection names (single source of truth)
 */
const COL = {
  users: 'users',
  matches: 'matches',
  reports: 'reports',
  safetyEvents: 'safetyEvents',
  userSafetyProfiles: 'userSafetyProfiles',
  bannedDevices: 'bannedDevices',
  liveRandomPool: 'liveRandomPool',
  liveRandomSessions: 'liveRandomSessions',
  verifications: 'verifications',
  admin: 'admin', // Separate collection for admins and staff
  vulgarAttempts: 'vulgarAttempts',
  appAlerts: 'appAlerts',
  clubs: 'clubs',
  usernames: 'usernames',
};

function userNotificationsCol(uid) {
  return collection(db, COL.users, String(uid), 'notifications');
}

function bannedDeviceDoc(deviceHash) {
  return doc(db, COL.bannedDevices, String(deviceHash));
}

/**
 * Deterministic match id so both sides compute the same id.
 */
function getMatchId(uidA, uidB) {
  const [a, b] = [String(uidA), String(uidB)].sort();
  return `${a}_${b}`;
}

/**
 * Authentication Service
 */
export const authService = {
  _normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  },

  _friendlyAuthError(error) {
    const code = error?.code;
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Incorrect email or password.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/email-already-in-use':
        return 'This email is already in use. Try logging in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Use at least 6 characters.';
      case 'auth/network-request-failed':
        return 'Network error. Check your internet and try again.';
      default:
        return error?.message || 'Authentication failed. Please try again.';
    }
  },

  // Sign up new user
  async signUp(email, password, userData = {}) {
    try {
      const normalizedEmail = this._normalizeEmail(email);
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;
      
      if (userData.name) await updateProfile(user, { displayName: userData.name });

      // Send email verification link (and surface failures to UI).
      // We still don't block profile writes, but we DO report if verification couldn't be sent.
      let verificationEmailSent = true;
      try {
        await sendEmailVerification(user);
      } catch (err) {
        verificationEmailSent = false;
        console.warn('sendEmailVerification failed:', err?.code || err);
      }

      // IMPORTANT: don't block signup UI on Firestore writes.
      // Auth creation is the critical path; Firestore can be slow or temporarily fail and would otherwise
      // leave the UI stuck on "Loading..." even though the account exists.
      setDoc(doc(db, COL.users, user.uid), {
        id: user.uid,
        email: normalizedEmail, // Raw email (same as auth email) - always stored
        name: userData.name || '',
        age: userData.age || null,
        bio: userData.bio || '',
        images: userData.images || [],
        interests: userData.interests || [],
        location: userData.location || '',
        // V1 fields
        // NOTE: we store both `country` and legacy `countryOfResidence` for compatibility.
        // Discovery uses `matchCountry` (defaults to user's `country`).
        country: userData.country || userData.countryOfResidence || '',
        countryOfResidence: userData.countryOfResidence || '',
        matchCountry: userData.matchCountry || userData.country || userData.countryOfResidence || '',
        emailVerified: userData.emailVerified !== undefined ? !!userData.emailVerified : !!user.emailVerified,
        profileComplete: userData.profileComplete !== undefined ? !!userData.profileComplete : false, // New users start with false
        // role is NOT stored in users collection - it's only in the admin collection
        // role: userData.role || 'user', // REMOVED - use admin collection
        approvalStatus: userData.approvalStatus || 'approved', // Auto-approved by default
        isDisabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        console.warn('Non-blocking profile write failed:', err?.code || err);
      });
      
      return { user, error: null, verificationEmailSent };
    } catch (error) {
      // Expected auth failures shouldn't be noisy in Expo overlay
      console.warn('Sign up error:', error?.code || error);
      return { user: null, error: this._friendlyAuthError(error), verificationEmailSent: false };
    }
  },

  // Sign in existing user
  async signIn(email, password) {
    try {
      const normalizedEmail = this._normalizeEmail(email);
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      return { user: userCredential.user, error: null, errorCode: null };
    } catch (error) {
      console.warn('Sign in error:', error?.code || error);
      return {
        user: null,
        error: this._friendlyAuthError(error),
        errorCode: error?.code ? String(error.code) : null,
      };
    }
  },

  _callableErrorMessage(err) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    if (code.includes('already-exists')) return 'This email is already registered. Try logging in.';
    if (code.includes('resource-exhausted')) return msg || 'Too many requests. Wait a moment and try again.';
    if (code.includes('deadline-exceeded')) return msg || 'This code expired. Request a new one.';
    if (code.includes('permission-denied')) return msg || 'Incorrect code.';
    if (code.includes('not-found')) return msg || 'Request not found.';
    if (code.includes('invalid-argument')) return msg || 'Check your input and try again.';
    if (code.includes('failed-precondition')) return msg || 'Service unavailable.';
    return msg || 'Something went wrong. Please try again.';
  },

  async sendSignupEmailOtp(email) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'sendSignupEmailOtp');
      await fn({ email: String(email || '').trim() });
      return { error: null };
    } catch (error) {
      console.warn('sendSignupEmailOtp', error?.code, error?.message);
      return { error: this._callableErrorMessage(error) };
    }
  },

  async verifySignupEmailOtp(email, code) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'verifySignupEmailOtp');
      const res = await fn({ email: String(email || '').trim(), code: String(code || '').trim() });
      const sessionId = res?.data?.sessionId;
      if (!sessionId) return { sessionId: null, error: 'Invalid response from server.' };
      return { sessionId, error: null };
    } catch (error) {
      console.warn('verifySignupEmailOtp', error?.code, error?.message);
      return { sessionId: null, error: this._callableErrorMessage(error) };
    }
  },

  /**
   * Completes signup after OTP verified (server creates user + returns custom token).
   */
  async finalizeSignupWithSession(sessionId, password, name, username) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'finalizeSignupWithSession');
      const res = await fn({
        sessionId: String(sessionId || '').trim(),
        password: String(password || ''),
        name: String(name || '').trim(),
        username: String(username || '').trim(),
      });
      const customToken = res?.data?.customToken;
      const verificationEmailSent = !!res?.data?.verificationEmailSent;
      if (!customToken) return { user: null, error: 'Invalid response from server.', verificationEmailSent: false };
      const userCredential = await signInWithCustomToken(auth, customToken);
      return { user: userCredential.user, error: null, verificationEmailSent };
    } catch (error) {
      console.warn('finalizeSignupWithSession', error?.code, error?.message);
      return { user: null, error: this._callableErrorMessage(error), verificationEmailSent: false };
    }
  },

  async checkUsernameAvailable(username) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'checkUsernameAvailable');
      const res = await fn({ username: String(username || '').trim() });
      return { available: !!res?.data?.available, error: null };
    } catch (error) {
      return { available: false, error: this._callableErrorMessage(error) };
    }
  },

  /**
   * Sends password reset: Cloud Function OTP when deployed; otherwise Firebase link email.
   * `usedEmailLinkFallback: true` means user should open the link in email (no in-app OTP).
   */
  async sendPasswordResetEmailOtp(email) {
    const normalizedEmail = this._normalizeEmail(email);
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'sendPasswordResetEmailOtp');
      await fn({ email: normalizedEmail });
      return { error: null, usedEmailLinkFallback: false };
    } catch (error) {
      // Cloud OTP callable often fails when logged out (e.g. functions/permission-denied) or if
      // the function is misconfigured. Always fall back to Firebase Auth's password reset email.
      try {
        await sendPasswordResetEmail(auth, normalizedEmail);
        console.warn(
          '[auth] sendPasswordResetEmailOtp: callable failed; sent Firebase reset link instead.',
          error?.code,
          error?.message
        );
        return { error: null, usedEmailLinkFallback: true };
      } catch (e) {
        console.warn('sendPasswordResetEmail (fallback)', e?.code, e?.message);
        return { error: this._friendlyAuthError(e), usedEmailLinkFallback: false };
      }
    }
  },

  async verifyPasswordResetEmailOtp(email, code) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'verifyPasswordResetEmailOtp');
      const res = await fn({ email: String(email || '').trim(), code: String(code || '').trim() });
      const sessionId = res?.data?.sessionId;
      if (!sessionId) return { sessionId: null, error: 'Invalid response from server.' };
      return { sessionId, error: null };
    } catch (error) {
      console.warn('verifyPasswordResetEmailOtp', error?.code, error?.message);
      return { sessionId: null, error: this._callableErrorMessage(error) };
    }
  },

  /**
   * After OTP verified: server sets new password and returns custom token to sign in.
   */
  async finalizePasswordResetWithSession(sessionId, newPassword) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'finalizePasswordResetWithSession');
      const res = await fn({
        sessionId: String(sessionId || '').trim(),
        newPassword: String(newPassword || ''),
      });
      const customToken = res?.data?.customToken;
      if (!customToken) return { user: null, error: 'Invalid response from server.' };
      const userCredential = await signInWithCustomToken(auth, customToken);
      return { user: userCredential.user, error: null };
    } catch (error) {
      console.warn('finalizePasswordResetWithSession', error?.code, error?.message);
      return { user: null, error: this._callableErrorMessage(error) };
    }
  },

  async signInWithGoogle({ idToken, accessToken } = {}) {
    try {
      if (!idToken && !accessToken) return { user: null, error: 'Missing Google token.' };
      const credential = GoogleAuthProvider.credential(idToken || null, accessToken || null);
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      // Ensure Firestore profile exists (best-effort).
      try {
        const snap = await getDoc(doc(db, COL.users, user.uid));
        const exists = snap.exists();
        await userService.setUser(user.uid, {
          email: user.email || '',
          name: user.displayName || '',
          emailVerified: !!user.emailVerified,
          authProvider: 'google',
          ...(exists ? null : { createdAt: serverTimestamp() }),
        });
      } catch {}

      return { user, error: null };
    } catch (error) {
      console.warn('Google sign-in error:', error?.code || error);
      return { user: null, error: this._friendlyAuthError(error) };
    }
  },

  async signInWithApple({ identityToken, rawNonce, fullName } = {}) {
    try {
      if (!identityToken) return { user: null, error: 'Missing Apple identity token.' };
      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({ idToken: identityToken, rawNonce: rawNonce || undefined });
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      // Apple only returns name on first auth; set displayName if we got it.
      const first = String(fullName?.givenName || '').trim();
      const last = String(fullName?.familyName || '').trim();
      const name = `${first} ${last}`.trim();
      if (name && !user.displayName) {
        try {
          await updateProfile(user, { displayName: name });
        } catch {}
      }

      // Ensure Firestore profile exists (best-effort).
      try {
        const snap = await getDoc(doc(db, COL.users, user.uid));
        const exists = snap.exists();
        await userService.setUser(user.uid, {
          email: user.email || '',
          name: user.displayName || name || '',
          emailVerified: !!user.emailVerified,
          authProvider: 'apple',
          ...(exists ? null : { createdAt: serverTimestamp() }),
        });
      } catch {}

      return { user, error: null };
    } catch (error) {
      console.warn('Apple sign-in error:', error?.code || error);
      return { user: null, error: this._friendlyAuthError(error) };
    }
  },

  // Sign out
  async signOutUser() {
    try {
      await signOut(auth);
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: error.message };
    }
  },

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthStateChange(callback) {
    return onAuthStateChanged(auth, callback);
  },

  // Email verification helpers
  async refreshCurrentUser() {
    try {
      if (!auth.currentUser) return { user: null, error: null };
      await reload(auth.currentUser);
      return { user: auth.currentUser, error: null };
    } catch (error) {
      return { user: auth.currentUser, error: this._friendlyAuthError(error) };
    }
  },

  async resendVerificationEmail() {
    try {
      if (!auth.currentUser) return { error: 'Not signed in.' };
      await sendEmailVerification(auth.currentUser);
      return { error: null };
    } catch (error) {
      return { error: this._friendlyAuthError(error) };
    }
  },

  // Helpers
  async getSignInMethods(email) {
    try {
      const normalizedEmail = this._normalizeEmail(email);
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      return { methods, error: null };
    } catch (error) {
      return { methods: [], error: this._friendlyAuthError(error) };
    }
  },

  async sendPasswordReset(email) {
    try {
      const normalizedEmail = this._normalizeEmail(email);
      await sendPasswordResetEmail(auth, normalizedEmail);
      return { error: null };
    } catch (error) {
      return { error: this._friendlyAuthError(error) };
    }
  },

  // Update password (requires recent authentication)
  async updatePassword(newPassword) {
    try {
      if (!auth.currentUser) {
        return { error: 'Not signed in.' };
      }
      await updatePassword(auth.currentUser, newPassword);
      return { error: null };
    } catch (error) {
      return { error: this._friendlyAuthError(error) };
    }
  },

  // Reauthenticate with email/password credential
  async reauthenticateWithEmailPassword(email, password) {
    try {
      if (!auth.currentUser) {
        return { error: 'Not signed in.' };
      }
      const credential = EmailAuthProvider.credential(email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      return { error: null };
    } catch (error) {
      return { error: this._friendlyAuthError(error) };
    }
  },
};

/**
 * User Service (Firestore)
 */
export const userService = {
  // Get user by ID
  async getUserById(userId) {
    try {
      // Check if user is logged in first
      const currentUser = authService.getCurrentUser();
      if (!currentUser?.uid) {
        // User not logged in - return gracefully without logging error
        return { data: null, error: 'Not logged in' };
      }
      
      const snap = await getDoc(doc(db, COL.users, userId));
      if (snap.exists()) return { data: snap.data(), error: null };
      return { data: null, error: 'User not found' };
    } catch (error) {
      // Only log non-permission errors (permission errors are expected when not logged in)
      if (!error?.code?.includes('permission') && !error?.message?.includes('permission')) {
        console.warn('Get user error:', error?.code || error);
      }
      return { data: null, error: error.message };
    }
  },

  // Get all users
  async getUsers(filters = {}) {
    try {
      let qRef = query(collection(db, COL.users), orderBy('createdAt', 'desc'));
      if (filters.limit) qRef = query(qRef, limit(filters.limit));
      const snap = await getDocs(qRef);
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return { data: users, error: null };
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
  async updateMyLocation(userId, { country = '', city = '', locationPermission = 'undetermined' } = {}) {
    try {
      const c = String(country || '').trim();
      const cityName = String(city || '').trim();
      const payload = {
        locationPermission: String(locationPermission || 'undetermined'),
        locationUpdatedAt: serverTimestamp(),
      };
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
export const matchService = {
  async getMatchById(matchId) {
    try {
      const snap = await getDoc(doc(db, COL.matches, String(matchId)));
      if (snap.exists()) return { data: snap.data(), error: null };
      return { data: null, error: 'Match not found' };
    } catch (error) {
      return { data: null, error: error.message };
    }
  },

  listenMatch(matchId, callback) {
    const ref = doc(db, COL.matches, String(matchId));
    return onSnapshot(
      ref,
      (snap) => callback({ data: snap.exists() ? snap.data() : null, error: null }),
      (error) => callback({ data: null, error: error.message })
    );
  },

  // Create a pending match request where only requestedTo must approve.
  // requestedBy: user who liked first, requestedTo: user who was liked first (receiver).
  async createPendingMatch(requestedByUid, requestedToUid) {
    try {
      const matchId = getMatchId(requestedByUid, requestedToUid);
      const ref = doc(db, COL.matches, matchId);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const data = existing.data() || {};
        return { matchId, status: data.status || 'active', error: null };
      }

      await setDoc(ref, {
        id: matchId,
        uids: [String(requestedByUid), String(requestedToUid)].sort(),
        status: 'pending', // pending -> active when requestedTo approves
        requestedBy: String(requestedByUid),
        requestedTo: String(requestedToUid),
        approvedBy: null,
        approvedAt: null,
        createdAt: serverTimestamp(),
        lastMessageAt: null,
      });

      // Notifications are sent from likeUser / approveMatch so we never duplicate
      // or miss a push when match creation fails or doc already existed.

      return { matchId, status: 'pending', error: null };
    } catch (error) {
      console.error('Create pending match error:', error);
      return { matchId: null, status: null, error: error.message };
    }
  },

  // Immediate chat thread — no approval step (Msg button, mutual like, legacy pending upgrade).
  async createActiveMatch(uidA, uidB, { source = 'discovery', initiatedBy = null } = {}) {
    try {
      const a = String(uidA || '').trim();
      const b = String(uidB || '').trim();
      if (!a || !b) return { matchId: null, status: null, error: 'Missing uids.' };
      const matchId = getMatchId(a, b);
      const ref = doc(db, COL.matches, matchId);
      const snap = await getDoc(ref);
      const sorted = [a, b].sort();
      const initiator = String(initiatedBy || a);

      if (snap.exists()) {
        const data = snap.data() || {};
        if (String(data.status || '') === 'active') {
          return { matchId, status: 'active', error: null };
        }
        await updateDoc(ref, {
          status: 'active',
          uids: sorted,
          approvedBy: initiator,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return { matchId, status: 'active', error: null };
      }

      await setDoc(ref, {
        id: matchId,
        uids: sorted,
        status: 'active',
        requestedBy: initiator,
        requestedTo: sorted.find((u) => u !== initiator) || b,
        approvedBy: initiator,
        approvedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        lastMessageAt: null,
        source: String(source || 'discovery'),
      });
      return { matchId, status: 'active', error: null };
    } catch (error) {
      console.error('Create active match error:', error);
      return { matchId: null, status: null, error: error.message };
    }
  },

  async startDirectMessage(fromUid, toUid) {
    try {
      const from = String(fromUid || '').trim();
      const to = String(toUid || '').trim();
      if (!from || !to) return { matchId: null, error: 'Missing user.' };

      let senderName = 'Someone';
      try {
        const senderSnap = await getDoc(doc(db, COL.users, from));
        if (senderSnap.exists()) {
          senderName = String(senderSnap.data()?.name || 'Someone');
        }
      } catch {}

      const { matchId, error } = await this.createActiveMatch(from, to, {
        source: 'direct_message',
        initiatedBy: from,
      });
      if (error || !matchId) return { matchId: null, error: error || 'Could not start chat.' };

      try {
        await notificationService.createNotification(to, {
          type: 'message_new',
          fromUid: from,
          matchId: String(matchId),
          title: 'New message',
          body: `${senderName} wants to chat. Open Matches to reply.`,
          status: 'unread',
        });
      } catch {}

      return { matchId, error: null };
    } catch (error) {
      return { matchId: null, error: error?.message || String(error) };
    }
  },

  async approveMatch(matchId, approverUid) {
    try {
      const ref = doc(db, COL.matches, String(matchId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: 'Match not found.' };
      const m = snap.data() || {};
      if (m.status === 'active') return { error: null };
      if (String(m.requestedTo || '') !== String(approverUid || '')) {
        return { error: 'Not allowed.' };
      }
      const uids = (Array.isArray(m.uids) && m.uids.length === 2)
        ? m.uids.map(String)
        : [String(m.requestedBy), String(m.requestedTo)].sort();
      await updateDoc(ref, {
        status: 'active',
        uids,
        approvedBy: String(approverUid),
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Notify requester that match is approved.
      const requestedBy = String(m.requestedBy || '');
      if (requestedBy) {
        try {
          await notificationService.createNotification(requestedBy, {
            type: 'match_approved',
            fromUid: String(approverUid),
            matchId: String(matchId),
            title: 'Match approved',
            body: 'Your match was approved. You can now chat.',
            status: 'unread',
          });
        } catch {}
      }
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },

  async listMyMatches(uid) {
    try {
      const qRef = query(collection(db, COL.matches), where('uids', 'array-contains', String(uid)));
      const snap = await getDocs(qRef);
      const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      matches.sort((a, b) => {
        const at = a?.lastMessageAt?.toMillis?.() || a?.createdAt?.toMillis?.() || 0;
        const bt = b?.lastMessageAt?.toMillis?.() || b?.createdAt?.toMillis?.() || 0;
        return bt - at;
      });
      return { data: matches, error: null };
    } catch (error) {
      console.error('List matches error:', error);
      return { data: [], error: error.message };
    }
  },

  /** Real-time listener for match list – updates when match status or messages change */
  listenMyMatches(uid, callback) {
    const qRef = query(collection(db, COL.matches), where('uids', 'array-contains', String(uid)));
    return onSnapshot(
      qRef,
      (snap) => {
        const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        matches.sort((a, b) => {
          const at = a?.lastMessageAt?.toMillis?.() || a?.createdAt?.toMillis?.() || 0;
          const bt = b?.lastMessageAt?.toMillis?.() || b?.createdAt?.toMillis?.() || 0;
          return bt - at;
        });
        callback({ data: matches, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  // Real-time listener for pending match requests where user is the receiver
  listenPendingMatchRequests(uid, callback) {
    try {
      const qRef = query(
        collection(db, COL.matches),
        where('requestedTo', '==', String(uid)),
        where('status', '==', 'pending')
      );
      return onSnapshot(
        qRef,
        (snap) => {
          const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          callback({ data: requests, error: null });
        },
        (error) => callback({ data: [], error: error.message })
      );
    } catch (error) {
      callback({ data: [], error: error.message });
      return () => {}; // Return no-op unsubscribe
    }
  },

  // Reject a pending match request
  async rejectMatch(matchId, rejectorUid) {
    try {
      const ref = doc(db, COL.matches, String(matchId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: 'Match not found.' };
      const m = snap.data() || {};
      if (String(m.requestedTo || '') !== String(rejectorUid || '')) {
        return { error: 'Not allowed.' };
      }
      // Delete the match document
      await deleteDoc(ref);
      
      // Notify the requester that their match was rejected
      const requestedBy = String(m.requestedBy || '');
      if (requestedBy) {
        try {
          await notificationService.createNotification(requestedBy, {
            type: 'match_rejected',
            fromUid: String(rejectorUid),
            matchId: null,
            title: 'Match declined',
            body: 'Your match request was declined.',
            status: 'unread',
          });
        } catch {}
      }
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },

  // Unmatch: either participant can end an approved (active) match.
  // Also clears like records so both users can see each other again on the cards.
  async unmatch(matchId, uid) {
    try {
      const ref = doc(db, COL.matches, String(matchId));
      const snap = await getDoc(ref);
      if (!snap.exists()) return { error: 'Match not found.' };
      const m = snap.data() || {};
      const uids = Array.isArray(m.uids) ? m.uids.map(String) : [];
      if (!uids.includes(String(uid))) return { error: 'Not allowed.' };
      const otherUid = uids.find((u) => String(u) !== String(uid)) || null;
      await deleteDoc(ref);
      if (otherUid) {
        await likeService.removeLikeBetween(uid, otherUid);
      }
      return { error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },
};

export const likeService = {
  _likesSentRef(fromUid, toUid) {
    return doc(db, COL.users, String(fromUid), 'likesSent', String(toUid));
  },
  _likesReceivedRef(toUid, fromUid) {
    return doc(db, COL.users, String(toUid), 'likesReceived', String(fromUid));
  },

  async likeUser(fromUid, toUid) {
    // CRITICAL: This function MUST NEVER throw - always return an object
    // Wrap everything in try-catch to prevent any errors from propagating
    
    // Early validation and logging
    try {
      console.log('\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔥 LIKESERVICE.likeUser() CALLED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📤 From UID: ${fromUid}`);
      console.log(`📥 To UID: ${toUid}`);
      console.log(`📁 Collection Path 1: users/${fromUid}/likesSent/${toUid}`);
      console.log(`📁 Collection Path 2: users/${toUid}/likesReceived/${fromUid}`);
      console.log(`✅ DB Available: ${!!db}`);
      console.log(`✅ Firestore Functions Available: ${typeof doc !== 'undefined'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (earlyLogError) {
      console.error('❌ Failed to log early:', earlyLogError);
      // Continue anyway
    }
    
    // Main try-catch - catch EVERYTHING
    try {
      if (!fromUid || !toUid) {
        const error = 'Missing fromUid or toUid';
        console.error(`[LikeService] ❌ ${error}: fromUid=${fromUid}, toUid=${toUid}`);
        return { matched: false, matchId: null, error };
      }
      
      const from = String(fromUid);
      const to = String(toUid);
      
      console.log(`[LikeService] likeUser called: from=${from}, to=${to}`);

      // Record like both sides (sent + received) for simple mutual detection
      // CRITICAL: Wrap each write in its own try-catch to prevent one failure from blocking the other
      // Use Promise.allSettled to ensure both writes are attempted even if one fails
      let likesSentSuccess = false;
      let likesReceivedSuccess = false;
      
      console.log('💾 Starting Firestore writes...');
      console.log(`   📝 Writing to: users/${from}/likesSent/${to}`);
      console.log(`   📝 Writing to: users/${to}/likesReceived/${from}`);
      
      const writeResults = await Promise.allSettled([
        // Write like sent
        setDoc(this._likesSentRef(from, to), { 
          toUid: to, 
          action: 'like', 
          createdAt: serverTimestamp() 
        }, { merge: true }).then(() => {
          likesSentSuccess = true;
          console.log(`   ✅ SUCCESS: Like sent saved to users/${from}/likesSent/${to}`);
        }).catch((sentError) => {
          console.error(`   ❌ FAILED: Like sent write error:`, {
            message: sentError?.message,
            code: sentError?.code,
            permissionError: sentError?.code === 'permission-denied',
            path: `users/${from}/likesSent/${to}`
          });
        }),
        
        // Write like received
        setDoc(this._likesReceivedRef(to, from), { 
          fromUid: from, 
          action: 'like', 
          createdAt: serverTimestamp() 
        }, { merge: true }).then(() => {
          likesReceivedSuccess = true;
          console.log(`   ✅ SUCCESS: Like received saved to users/${to}/likesReceived/${from}`);
        }).catch((receivedError) => {
          console.error(`   ❌ FAILED: Like received write error:`, {
            message: receivedError?.message,
            code: receivedError?.code,
            permissionError: receivedError?.code === 'permission-denied',
            path: `users/${to}/likesReceived/${from}`
          });
        })
      ]);
      
      // Log results
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 WRITE RESULTS SUMMARY:');
      console.log(`   ✅ likesSent: ${likesSentSuccess ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   ✅ likesReceived: ${likesReceivedSuccess ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   ${likesSentSuccess && likesReceivedSuccess ? '🎉 Both writes succeeded!' : likesSentSuccess || likesReceivedSuccess ? '⚠️ Partial success' : '❌ Both writes failed'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // If both writes failed, log but continue anyway (don't fail the like operation)
      if (!likesSentSuccess && !likesReceivedSuccess) {
        console.error('⚠️ WARNING: Both like writes failed, but continuing anyway');
        console.error('   This might indicate a Firestore permission issue');
        // Still continue - we'll try to check for mutual match anyway
      } else if (likesSentSuccess && likesReceivedSuccess) {
        console.log('✅ Both like records saved successfully to Firestore!');
      } else {
        console.log('⚠️ Partial success - one write succeeded, one failed');
      }

      // Get sender + receiver names for notifications
      let senderName = 'Someone';
      let receiverName = 'Someone';
      try {
        const senderSnap = await getDoc(doc(db, COL.users, from));
        if (senderSnap.exists()) {
          senderName = String(senderSnap.data()?.name || 'Someone');
        }
      } catch (nameError) {
        console.warn('[LikeService] Failed to get sender name:', nameError);
      }
      try {
        const receiverSnap = await getDoc(doc(db, COL.users, to));
        if (receiverSnap.exists()) {
          receiverName = String(receiverSnap.data()?.name || 'Someone');
        }
      } catch (nameError) {
        console.warn('[LikeService] Failed to get receiver name:', nameError);
      }

      // Mutual?
      let isMutual = false;
      let matchId = null;
      let matchStatus = null;
      
      try {
        console.log(`[LikeService] Checking for mutual like: ${from} <- ${to}`);
        const reciprocal = await getDoc(this._likesReceivedRef(from, to));
        if (reciprocal.exists() && reciprocal.data()?.action === 'like') {
          isMutual = true;
          console.log(`[LikeService] ✅ Mutual like detected! Creating active match...`);

          try {
            const matchResult = await matchService.createActiveMatch(from, to, {
              source: 'mutual_like',
              initiatedBy: from,
            });
            const mid = matchResult?.matchId || getMatchId(from, to);
            try {
              await notificationService.createNotification(from, {
                type: 'match_mutual',
                fromUid: from,
                matchId: mid,
                title: "It's a match!",
                body: `You and ${receiverName} liked each other. Open Matches to chat.`,
                status: 'unread',
              });
              await notificationService.createNotification(to, {
                type: 'match_mutual',
                fromUid: from,
                matchId: mid,
                title: "It's a match!",
                body: `${senderName} liked you back. Open Matches to chat.`,
                status: 'unread',
              });
            } catch (mutualNotifErr) {
              console.warn('[LikeService] Mutual notification (non-critical):', mutualNotifErr);
            }
            if (matchResult?.error) {
              console.error('[LikeService] Failed to create active match:', matchResult.error);
              return { matched: true, matchId: null, status: 'active', error: matchResult.error };
            }
            matchId = matchResult?.matchId || null;
            matchStatus = matchResult?.status || 'active';
            console.log(`[LikeService] Active match created: ${matchId}`);
            return { matched: true, matchId, status: matchStatus, error: null };
          } catch (matchError) {
            console.error('[LikeService] Match creation exception:', matchError);
            const mid = getMatchId(from, to);
            try {
              await notificationService.createNotification(from, {
                type: 'match_mutual',
                fromUid: from,
                matchId: mid,
                title: "It's a match!",
                body: `You and ${receiverName} liked each other. Open Matches to chat.`,
                status: 'unread',
              });
              await notificationService.createNotification(to, {
                type: 'match_mutual',
                fromUid: from,
                matchId: mid,
                title: "It's a match!",
                body: `${senderName} liked you back. Open Matches to chat.`,
                status: 'unread',
              });
            } catch (_) {}
            return { matched: true, matchId: null, status: 'active', error: matchError?.message || String(matchError) };
          }
        } else {
          console.log(`[LikeService] Not mutual yet (reciprocal exists: ${reciprocal.exists()}, action: ${reciprocal.data()?.action})`);
        }
      } catch (mutualCheckError) {
        console.error('[LikeService] Error checking mutual like (non-critical):', mutualCheckError);
        // Continue - we'll send notification anyway
      }

      // Not mutual yet — like only; chat unlocks when they like back or either person taps Msg.
      if (!isMutual) {
        try {
          await notificationService.createNotification(to, {
            type: 'like_received',
            fromUid: from,
            matchId: null,
            title: 'New like!',
            body: `${senderName} liked you. Like them back to match and chat.`,
            status: 'unread',
          });
          console.log('[LikeService] ✅ Like notification sent to recipient');
        } catch (notifError) {
          console.warn('[LikeService] Like notification (non-critical):', notifError);
        }
      }
      console.log('✅ Like recorded successfully (not mutual yet)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ LIKESERVICE.likeUser() COMPLETED SUCCESSFULLY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return { matched: false, matchId: null, error: null };
    } catch (error) {
      // CRITICAL: Always return an object, never throw
      try {
        console.error('\n');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌❌❌ TOP-LEVEL LIKE USER ERROR ❌❌❌');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`Error Type: ${typeof error}`);
        console.error(`Error Message: ${error?.message || String(error)}`);
        console.error(`Error Code: ${error?.code || 'none'}`);
        console.error(`Error Name: ${error?.name || 'none'}`);
        if (error?.stack) {
          console.error(`Error Stack:\n${error.stack}`);
        }
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ LIKESERVICE.likeUser() FAILED');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      } catch (logError) {
        // Even error logging can fail, continue anyway
        console.error('❌ Failed to log error:', logError);
      }
      
      // ALWAYS return an object, never throw
      return { matched: false, matchId: null, error: error?.message || String(error) || 'Unknown error' };
    }
  },

  async passUser(fromUid, toUid) {
    try {
      const from = String(fromUid);
      const to = String(toUid);
      await setDoc(this._likesSentRef(from, to), { toUid: to, action: 'pass', createdAt: serverTimestamp() }, { merge: true });
      return { error: null };
    } catch (error) {
      console.error('Pass user error:', error);
      return { error: error.message };
    }
  },

  async listLikesSent(fromUid) {
    try {
      const from = String(fromUid);
      const snap = await getDocs(collection(db, COL.users, from, 'likesSent'));
      const likes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { data: likes, error: null };
    } catch (error) {
      console.error('List likes sent error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Remove like records between two users so they can see each other again in discovery (e.g. after unmatch).
   */
  async removeLikeBetween(uidA, uidB) {
    try {
      const a = String(uidA || '');
      const b = String(uidB || '');
      if (!a || !b || a === b) return { error: null };
      await Promise.all([
        deleteDoc(this._likesSentRef(a, b)).catch(() => {}),
        deleteDoc(this._likesReceivedRef(b, a)).catch(() => {}),
        deleteDoc(this._likesSentRef(b, a)).catch(() => {}),
        deleteDoc(this._likesReceivedRef(a, b)).catch(() => {}),
      ]);
      return { error: null };
    } catch (error) {
      console.error('removeLikeBetween error:', error);
      return { error: error?.message || String(error) };
    }
  },
};

/**
 * Messaging (Chat)
 */
const _checkMessageToxicityCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'checkMessageToxicity');
  } catch {
    return null;
  }
})();

const _recordSafetyEventCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'recordSafetyEvent');
  } catch {
    return null;
  }
})();

const _generateChatSuggestionsCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'generateChatSuggestions');
  } catch {
    return null;
  }
})();

const _generateModerationEvidenceCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'generateModerationEvidence');
  } catch {
    return null;
  }
})();

const _sendModerationNoticeCallable = (() => {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, 'sendModerationNotice');
  } catch {
    return null;
  }
})();

export const safetyService = {
  async recordEvent(payload) {
    const callable = _recordSafetyEventCallable;
    if (!callable) return { error: null, data: null };
    try {
      const { data } = await callable(payload || {});
      return { data: data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to record safety event.' };
    }
  },
};

export const aiSuggestionService = {
  async generateChatSuggestions(matchId, { mode = 'reply_suggestions', draft = '' } = {}) {
    const callable = _generateChatSuggestionsCallable;
    if (!callable) return { data: null, error: 'AI suggestions are unavailable.' };
    try {
      const { data } = await callable({
        matchId: String(matchId || ''),
        mode: String(mode || 'reply_suggestions'),
        draft: String(draft || ''),
      });
      return { data: data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to generate suggestions.' };
    }
  },
};

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

export const messageService = {
  _messagesCol(matchId) {
    return collection(db, COL.matches, String(matchId), 'messages');
  },

  /**
   * Returns true if the message is toxic (block send), false otherwise.
   * On Cloud Function error, returns false so we don't block sends when the check is unavailable.
   */
  async checkMessageToxicity(matchId, text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    const callable = _checkMessageToxicityCallable;
    if (!callable) return false;
    try {
      const { data } = await callable({ text: trimmed, matchId: matchId || null });
      return data && data.toxic === true;
    } catch {
      return false;
    }
  },

  async sendMessage(matchId, fromUid, text, { replyTo = null } = {}) {
    try {
      const trimmed = String(text || '').trim();
      if (!trimmed) return { error: 'Message is empty.' };
      const mod = scanMessageText(trimmed);
      let otherUid = null;
      try {
        const msnap = await getDoc(doc(db, COL.matches, String(matchId)));
        if (msnap.exists()) {
          const uids = msnap.data()?.uids || [];
          otherUid = Array.isArray(uids) ? uids.find((u) => String(u) !== String(fromUid)) || null : null;
        }
      } catch {}
      const msgRef = await addDoc(this._messagesCol(matchId), {
        fromUid: String(fromUid),
        type: 'text',
        text: trimmed,
        replyTo: replyTo && typeof replyTo === 'object' ? replyTo : null,
        reactions: {},
        editedAt: null,
        deletedAt: null,
        readAt: null, // Read receipt - set when recipient views the message
        createdAt: serverTimestamp(),
        moderation: mod.flagged
          ? {
              flagged: true,
              categories: Array.isArray(mod.categories) ? mod.categories.map(String) : [],
              matchedTerms: Array.isArray(mod.matchedTerms) ? mod.matchedTerms.map(String) : [],
              score: Number(mod.score || 0),
            }
          : { flagged: false },
      });
      await setDoc(
        doc(db, COL.matches, String(matchId)),
        { lastMessageAt: serverTimestamp(), lastMessageText: trimmed },
        { merge: true }
      );

      // Notify the other participant (new message)
      try {
        if (otherUid) {
          await notificationService.createNotification(String(otherUid), {
            type: 'message_new',
            fromUid: String(fromUid),
            matchId: String(matchId),
            title: 'New message',
            body: trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed,
            status: 'unread',
          });
        }
      } catch {}

      // Auto-flag to admin queue (reports) if moderation triggered.
      if (mod.flagged) {
        try {
          await reportService.createReport({
            reporterUid: String(fromUid),
            targetType: 'message',
            targetId: String(msgRef.id),
            targetUserId: String(fromUid),
            matchId: String(matchId),
            senderUid: String(fromUid),
            recipientUid: otherUid ? String(otherUid) : null,
            messageSentAt: new Date().toISOString(),
            reason: mod.categories?.[0] || 'inappropriate',
            categories: mod.categories,
            details: trimmed,
            autoFlagged: true,
            matchedTerms: mod.matchedTerms,
            score: mod.score,
          });
        } catch {}
      }

      try {
        const safetyCalls = [
          safetyService.recordEvent({
            source: 'message_fingerprint',
            targetUid: String(fromUid),
            matchId: String(matchId),
            messageId: String(msgRef.id),
            details: trimmed,
          }),
        ];

        if (mod.flagged) {
          safetyCalls.push(
            safetyService.recordEvent({
              source: 'keyword_scan',
              targetUid: String(fromUid),
              matchId: String(matchId),
              messageId: String(msgRef.id),
              categories: Array.isArray(mod.categories) ? mod.categories.map(String) : [],
              matchedTerms: Array.isArray(mod.matchedTerms) ? mod.matchedTerms.map(String) : [],
              score: Number(mod.score || 0),
              details: trimmed,
              severity: Number(mod.score || 0) >= 3 ? 'high' : 'medium',
            })
          );
        }

        await Promise.allSettled(safetyCalls);
      } catch {}

      return { error: null };
    } catch (error) {
      console.error('Send message error:', error);
      return { error: error.message };
    }
  },

  async editMessage(matchId, messageId, uid, newText) {
    try {
      const mId = String(matchId || '').trim();
      const msgId = String(messageId || '').trim();
      const u = String(uid || '').trim();
      const t = String(newText || '').trim();
      if (!mId || !msgId || !u) return { error: 'Missing.' };
      if (!t) return { error: 'Message is empty.' };
      if (t.length > 2000) return { error: 'Too long.' };
      const ref = doc(db, COL.matches, mId, 'messages', msgId);
      await updateDoc(ref, { text: t, editedAt: serverTimestamp() });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async deleteMessage(matchId, messageId, uid) {
    try {
      const mId = String(matchId || '').trim();
      const msgId = String(messageId || '').trim();
      const u = String(uid || '').trim();
      if (!mId || !msgId || !u) return { error: 'Missing.' };
      const ref = doc(db, COL.matches, mId, 'messages', msgId);
      await updateDoc(ref, { deletedAt: serverTimestamp(), text: '', audioUrl: '', durationMs: 0 });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async setReaction(matchId, messageId, uid, emoji) {
    try {
      const mId = String(matchId || '').trim();
      const msgId = String(messageId || '').trim();
      const u = String(uid || '').trim();
      const e = String(emoji || '').trim();
      if (!mId || !msgId || !u) return { error: 'Missing.' };
      const ref = doc(db, COL.matches, mId, 'messages', msgId);
      const key = `reactions.${u}`;
      await updateDoc(ref, { [key]: e || deleteField() });
      return { error: null };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  },

  async sendVoiceMessage(matchId, fromUid, { audioUri, durationMs }) {
    try {
      const uid = String(fromUid || '').trim();
      const mId = String(matchId || '').trim();
      const dur = Number(durationMs || 0);
      if (!uid || !mId) return { error: 'Missing match.' };
      if (!audioUri) return { error: 'Missing audio.' };
      if (!dur || dur < 1000) return { error: 'Voice note too short.' };
      if (dur > 15000) return { error: 'Voice note too long.' };

      const up = await storageService.uploadVoiceNote(uid, audioUri);
      if (up.error || !up.url) return { error: up.error || 'Upload failed.' };

      await addDoc(this._messagesCol(mId), {
        fromUid: uid,
        type: 'voice',
        audioUrl: up.url,
        durationMs: Math.round(dur),
        readAt: null, // Read receipt - set when recipient views the message
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, COL.matches, mId),
        { lastMessageAt: serverTimestamp(), lastMessageText: '[Voice note]' },
        { merge: true }
      );

      // Notify the other participant (new voice message)
      try {
        const msnap = await getDoc(doc(db, COL.matches, mId));
        if (msnap.exists()) {
          const uids = msnap.data()?.uids || [];
          const otherUid = Array.isArray(uids) ? uids.find((u) => String(u) !== String(uid)) : null;
          if (otherUid) {
            await notificationService.createNotification(String(otherUid), {
              type: 'message_new',
              fromUid: uid,
              matchId: mId,
              title: 'New message',
              body: '🎙️ Voice note',
              status: 'unread',
            });
          }
        }
      } catch {}

      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  listenMessages(matchId, callback) {
    const qRef = query(this._messagesCol(matchId), orderBy('createdAt', 'asc'));
    return onSnapshot(
      qRef,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: msgs, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  async setTyping(matchId, uid, isTyping) {
    try {
      const u = String(uid || '').trim();
      if (!u) return { error: 'Missing uid' };
      const ref = doc(db, COL.matches, String(matchId));
      const field = `typing.${u}`;
      await updateDoc(ref, {
        [field]: isTyping ? serverTimestamp() : deleteField(),
      });
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },

  /**
   * Mark messages as read when user views the chat
   */
  async markMessagesAsRead(matchId, readerUid) {
    try {
      const mId = String(matchId || '').trim();
      const reader = String(readerUid || '').trim();
      if (!mId || !reader) return { error: 'Missing.' };

      // Single-field filter only (no composite index required); filter and sort in memory
      const q = query(this._messagesCol(mId), where('readAt', '==', null));
      const snap = await getDocs(q);
      const updatePromises = [];
      const toMs = (t) => (t?.toMillis ? t.toMillis() : (t ? new Date(t).getTime() : 0));
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((data) => data.fromUid !== reader && !data.readAt)
        .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
      docs.forEach(({ id }) => {
        const msgRef = doc(db, COL.matches, mId, 'messages', id);
        updatePromises.push(updateDoc(msgRef, { readAt: serverTimestamp() }));
      });

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      // Update user's lastSeen timestamp
      await userService.updateUser(reader, { lastSeen: serverTimestamp() });

      return { error: null, count: updatePromises.length };
    } catch (e) {
      console.error('Mark messages as read error:', e);
      return { error: e?.message || String(e) };
    }
  },

  // Vote to continue after 2-minute window; if both vote true, unlocks full chat.
  async voteContinue(matchId, uid, vote = true) {
    try {
      const matchRef = doc(db, COL.matches, String(matchId));
      const me = String(uid || '').trim();
      if (!me) return { error: 'Missing uid.' };
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(matchRef);
        if (!snap.exists()) throw new Error('Match not found.');
        const m = snap.data() || {};
        const uids = Array.isArray(m.uids) ? m.uids.map(String) : [];
        if (!uids.includes(me)) throw new Error('Not allowed.');

        const cont = m.dateModeContinue && typeof m.dateModeContinue === 'object' ? m.dateModeContinue : {};
        const next = { ...cont, [me]: !!vote };
        const both = uids.length === 2 && !!next[uids[0]] && !!next[uids[1]];

        tx.update(matchRef, {
          [`dateModeContinue.${me}`]: !!vote,
          ...(both ? { dateModeUnlocked: true, dateModeUnlockedAt: serverTimestamp() } : null),
          updatedAt: serverTimestamp(),
        });
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },
};

/**
 * Chat translation: ML Kit on Android (see translateChatMessage.native.js), cloud elsewhere.
 */
export const translationService = {
  translateChatMessage,
};

/** Omegle-style random 1-minute live sessions (Firestore matchmaking + text; LiveKit for A/V). */
export const liveRandomService = {
  POOL_DOC_ID: 'current',
  SESSION_MS: 60 * 1000,

  _poolRef() {
    return doc(db, COL.liveRandomPool, this.POOL_DOC_ID);
  },

  _sessionRef(sessionId) {
    return doc(db, COL.liveRandomSessions, String(sessionId));
  },

  _messagesCol(sessionId) {
    return collection(db, COL.liveRandomSessions, String(sessionId), 'messages');
  },

  /**
   * Enter matching pool. Either waits for a partner or matches immediately.
   * @returns {{ state: 'waiting', error?: string } | { state: 'matched', sessionId: string, partnerUid: string, error?: null }}
   */
  async enterPool(uid) {
    const me = String(uid || '').trim();
    if (!me) return { state: 'waiting', error: 'Not signed in.' };
    try {
      const sessionRef = doc(collection(db, COL.liveRandomSessions));
      const sessionId = sessionRef.id;
      const poolRef = this._poolRef();
      const result = await runTransaction(db, async (tx) => {
        const poolSnap = await tx.get(poolRef);
        const w = poolSnap.exists() ? String(poolSnap.data()?.waitingUid || '').trim() : '';
        if (w && w !== me) {
          tx.set(poolRef, { waitingUid: null, updatedAt: serverTimestamp() }, { merge: true });
          tx.set(sessionRef, {
            uids: [me, w].sort(),
            status: 'active',
            startedAt: serverTimestamp(),
            endedBy: null,
            endedReason: null,
          });
          return { type: 'matched', partnerUid: w, sessionId };
        }
        tx.set(poolRef, { waitingUid: me, updatedAt: serverTimestamp() }, { merge: true });
        return { type: 'waiting' };
      });
      if (result.type === 'matched') {
        return { state: 'matched', sessionId: result.sessionId, partnerUid: result.partnerUid, error: null };
      }
      return { state: 'waiting', error: null };
    } catch (e) {
      return { state: 'waiting', error: e?.message || String(e) };
    }
  },

  async leavePool(uid) {
    const me = String(uid || '').trim();
    if (!me) return { error: 'Not signed in.' };
    try {
      await runTransaction(db, async (tx) => {
        const poolRef = this._poolRef();
        const poolSnap = await tx.get(poolRef);
        if (!poolSnap.exists()) return;
        const w = String(poolSnap.data()?.waitingUid || '').trim();
        if (w === me) {
          tx.set(poolRef, { waitingUid: null, updatedAt: serverTimestamp() }, { merge: true });
        }
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  listenActiveSessionForUser(uid, callback) {
    const me = String(uid || '').trim();
    if (!me) return () => {};
    const q = query(
      collection(db, COL.liveRandomSessions),
      where('uids', 'array-contains', me),
      where('status', '==', 'active'),
      limit(1)
    );
    return onSnapshot(
      q,
      (snap) => {
        const doc0 = snap.docs[0];
        callback({
          data: doc0 ? { id: doc0.id, ...doc0.data() } : null,
          error: null,
        });
      },
      (error) => callback({ data: null, error: error.message })
    );
  },

  async getSessionById(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return { data: null, error: 'Missing id.' };
    try {
      const snap = await getDoc(this._sessionRef(sid));
      return { data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },

  async endSession(sessionId, uid, reason) {
    const sid = String(sessionId || '').trim();
    const me = String(uid || '').trim();
    const r = String(reason || 'leave');
    if (!sid || !me) return { error: 'Missing.' };
    try {
      await updateDoc(this._sessionRef(sid), {
        status: 'ended',
        endedAt: serverTimestamp(),
        endedBy: me,
        endedReason: r,
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  listenMessages(sessionId, callback) {
    const sid = String(sessionId || '').trim();
    if (!sid) return () => {};
    const q = query(this._messagesCol(sid), orderBy('createdAt', 'asc'), limit(80));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: rows, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  async sendMessage(sessionId, fromUid, text) {
    const sid = String(sessionId || '').trim();
    const me = String(fromUid || '').trim();
    const t = String(text || '').trim();
    if (!sid || !me || !t) return { error: 'Message empty.' };
    if (t.length > 2000) return { error: 'Message too long.' };
    try {
      await addDoc(this._messagesCol(sid), {
        fromUid: me,
        text: t,
        createdAt: serverTimestamp(),
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  /** Server-minted JWT for LiveKit (requires deployed `getLiveKitToken` + secrets). */
  async fetchLiveKitToken(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return { token: null, url: null, roomName: null, error: 'Missing session.' };
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'getLiveKitToken');
      const result = await fn({ sessionId: sid });
      const d = result.data || {};
      return {
        token: d.token || null,
        url: d.url || null,
        roomName: d.roomName || null,
        error: null,
      };
    } catch (e) {
      return {
        token: null,
        url: null,
        roomName: null,
        error: authService._callableErrorMessage(e),
      };
    }
  },
};

/**
 * Blocking
 */
export const blockService = {
  _blockRef(uid, blockedUid) {
    return doc(db, COL.users, String(uid), 'blocks', String(blockedUid));
  },

  async blockUser(uid, blockedUid) {
    try {
      await setDoc(this._blockRef(uid, blockedUid), { blockedUid: String(blockedUid), createdAt: serverTimestamp() }, { merge: true });

      // Also block the match thread (if it exists) so messaging stops immediately.
      try {
        const matchId = getMatchId(uid, blockedUid);
        await setDoc(
          doc(db, COL.matches, matchId),
          { isBlocked: true, blockedBy: String(uid), blockedAt: serverTimestamp(), status: 'blocked' },
          { merge: true }
        );
      } catch {}

      return { error: null };
    } catch (error) {
      console.error('Block user error:', error);
      return { error: error.message };
    }
  },

  async unblockUser(uid, blockedUid) {
    try {
      await deleteDoc(this._blockRef(uid, blockedUid));
      // Restore match thread so chat can work again (blockUser had set status: blocked).
      try {
        const matchId = getMatchId(uid, blockedUid);
        const ref = doc(db, COL.matches, matchId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const m = snap.data() || {};
          if (m.status === 'blocked' || m.isBlocked === true) {
            await updateDoc(ref, {
              status: 'active',
              isBlocked: deleteField(),
              blockedBy: deleteField(),
              blockedAt: deleteField(),
            });
          }
        }
      } catch (e) {
        console.warn('[blockService] unblock match restore:', e?.message || e);
      }
      return { error: null };
    } catch (error) {
      console.error('Unblock user error:', error);
      return { error: error.message };
    }
  },

  /** Profiles for Settings → Blocked users (names + optional photo URL). */
  async listBlockedUsers(uid) {
    try {
      const snap = await getDocs(collection(db, COL.users, String(uid), 'blocks'));
      const ids = snap.docs.map((d) => d.id);
      const rows = await Promise.all(
        ids.map(async (blockedUid) => {
          const ures = await userService.getUserById(blockedUid);
          const u = ures?.data || {};
          const images = Array.isArray(u.images) ? u.images : [];
          const firstImg = images.find((x) => typeof x === 'string' && x.length > 0) || u.photoURL || null;
          return {
            id: blockedUid,
            name: String(u.name || 'User'),
            photoUrl: firstImg ? String(firstImg) : null,
          };
        })
      );
      return { data: rows, error: null };
    } catch (error) {
      console.error('List blocked users error:', error);
      return { data: [], error: error.message };
    }
  },

  async listBlockedUids(uid) {
    try {
      const snap = await getDocs(collection(db, COL.users, String(uid), 'blocks'));
      return { data: new Set(snap.docs.map((d) => d.id)), error: null };
    } catch (error) {
      console.error('List blocked error:', error);
      return { data: new Set(), error: error.message };
    }
  },
};

/**
 * Reporting (user/message)
 */
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
export const notificationService = {
  async createNotification(toUid, payload) {
    try {
      const to = String(toUid || '').trim();
      if (!to) return { error: 'Missing toUid.' };
      const base = {
        toUid: to,
        fromUid: payload?.fromUid ? String(payload.fromUid) : null,
        type: String(payload?.type || ''),
        title: String(payload?.title || ''),
        body: String(payload?.body || ''),
        matchId: payload?.matchId ? String(payload.matchId) : null,
        status: String(payload?.status || 'unread'), // unread|read
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(userNotificationsCol(to), base);
      // Send push notification via Expo Push API
      // Works in both Expo Go and dev builds
      try {
        const snap = await getDoc(doc(db, COL.users, to));
        const token = snap.exists() ? String(snap.data()?.expoPushToken || '') : '';
        if (token) {
          const pushResult = await sendExpoPushAsync({
            to: token,
            title: base.title,
            body: base.body,
            data: { 
              type: base.type, 
              matchId: base.matchId || null,
              fromUid: base.fromUid || null,
              notificationId: ref.id,
            },
            sound: 'default',
          });
          if (pushResult.error) {
            console.warn('[Notification] Push send failed:', pushResult.error);
          }
        } else {
          console.log('[Notification] No push token for user:', to);
        }
      } catch (pushError) {
        console.error('[Notification] Push error:', pushError);
        // Don't fail the notification creation if push fails
      }
      return { data: { id: ref.id, ...base }, error: null };
    } catch (error) {
      return { data: null, error: error.message };
    }
  },

  listenMyNotifications(uid, callback) {
    const qRef = query(userNotificationsCol(uid), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(
      qRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data: list, error: null });
      },
      (error) => callback({ data: [], error: error.message })
    );
  },

  async markRead(uid, notificationId) {
    try {
      await updateDoc(doc(db, COL.users, String(uid), 'notifications', String(notificationId)), {
        status: 'read',
        readAt: serverTimestamp(),
      });
      return { error: null };
    } catch (error) {
      return { error: error.message };
    }
  },
};

/**
 * Soft device-level ban (client-side gate)
 */
export const deviceBanService = {
  async isBanned(deviceHash) {
    try {
      const snap = await getDoc(bannedDeviceDoc(deviceHash));
      return { banned: snap.exists(), error: null };
    } catch (e) {
      return { banned: false, error: e?.message || String(e) };
    }
  },
  async banDevice(deviceHash, { bannedByUid = null, reason = '' } = {}) {
    try {
      await setDoc(
        bannedDeviceDoc(deviceHash),
        {
          deviceHash: String(deviceHash),
          bannedByUid: bannedByUid ? String(bannedByUid) : null,
          reason: String(reason || ''),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },
};

/**
 * App-wide update alerts (admin broadcast → blocking gate + push).
 */
export const appUpdateService = {
  listenCurrentAlert(callback) {
    const ref = doc(db, COL.appAlerts, 'current');
    return onSnapshot(
      ref,
      (snap) => {
        callback({ data: snap.exists() ? snap.data() : null, error: null });
      },
      (error) => {
        callback({ data: null, error: error?.message || String(error) });
      }
    );
  },

  async broadcastAppUpdate({ title, body, minVersion } = {}) {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'broadcastAppUpdate');
      const result = await fn({
        title: String(title || '').trim(),
        body: String(body || '').trim(),
        minVersion: String(minVersion || '').trim(),
      });
      return { ...(result?.data || {}), error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },

  async clearAppUpdateAlert() {
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'clearAppUpdateAlert');
      const result = await fn({});
      return { ...(result?.data || {}), error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },
};

/**
 * Helper function to check if a user is admin/staff from the admin collection
 * This is the SINGLE SOURCE OF TRUTH for role checking
 */
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
      console.log('[checkUserRoleFromAdminCollection] Found', role, 'for userId:', userId);
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
export const adminService = {
  /**
   * Check if a user is admin or staff by looking in the admin collection
   * @param {string} userId - User ID to check
   * @returns {Promise<{isAdmin: boolean, isStaff: boolean, role: string|null, error: string|null}>}
   */
  async checkUserRole(userId) {
    return checkUserRoleFromAdminCollection(userId);
  },

  /**
   * Add a user to the admin collection (admin or staff)
   * @param {string} userId - User ID
   * @param {string} role - 'admin' or 'staff'
   * @param {object} additionalData - Additional data (name, email, etc.)
   */
  async addAdminUser(userId, role, additionalData = {}) {
    try {
      if (!userId || !role) {
        return { error: 'Missing userId or role' };
      }

      const normalizedRole = String(role).toLowerCase().trim();
      if (normalizedRole !== 'admin' && normalizedRole !== 'staff') {
        return { error: 'Role must be "admin" or "staff"' };
      }

      const adminDocData = {
        // userId is the document ID, so we don't need to store it as a field
        role: normalizedRole,
        name: String(additionalData.name || '').trim(),
        email: String(additionalData.email || '').trim().toLowerCase(),
        addedAt: serverTimestamp(),
        addedBy: String(additionalData.addedBy || '').trim() || null,
        ...additionalData,
      };

      await setDoc(doc(db, COL.admin, String(userId)), adminDocData, { merge: true });

      return { error: null };
    } catch (error) {
      console.error('[AdminService] Add admin user error:', error);
      return { error: error.message };
    }
  },

  /**
   * Remove a user from the admin collection
   * @param {string} userId - User ID to remove
   */
  async removeAdminUser(userId) {
    try {
      if (!userId) {
        return { error: 'Missing userId' };
      }

      await deleteDoc(doc(db, COL.admin, String(userId)));

      return { error: null };
    } catch (error) {
      console.error('[AdminService] Remove admin user error:', error);
      return { error: error.message };
    }
  },

  /**
   * Get all admins and staff
   * @param {object} filters - Filter options
   */
  async listAdminUsers(filters = {}) {
    try {
      let qRef = query(collection(db, COL.admin), orderBy('addedAt', 'desc'));

      if (filters.role) {
        qRef = query(qRef, where('role', '==', String(filters.role).toLowerCase().trim()));
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit));
      }

      const snap = await getDocs(qRef);
      const admins = snap.docs.map((d) => ({
        id: d.id,
        userId: d.id,
        ...d.data(),
        addedAt: d.data().addedAt?.toMillis?.() || d.data().addedAt?.seconds * 1000 || Date.now(),
      }));

      return { data: admins, error: null };
    } catch (error) {
      console.error('[AdminService] List admin users error:', error);
      return { data: [], error: error.message };
    }
  },

  async listReports({ status = 'open', limitCount = 50 } = {}) {
    try {
      // Query all reports, order by createdAt, then filter by status client-side
      // This avoids needing a composite index
      let qRef = query(collection(db, COL.reports), orderBy('createdAt', 'desc'));
      if (limitCount) qRef = query(qRef, limit(limitCount * 2)); // Get more to account for filtering
      const snap = await getDocs(qRef);
      
      // Filter by status client-side
      let reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (status) {
        reports = reports.filter(r => String(r.status || '').toLowerCase() === String(status).toLowerCase());
      }
      
      // Limit after filtering
      if (limitCount) {
        reports = reports.slice(0, limitCount);
      }
      
      return { data: reports, error: null };
    } catch (error) {
      console.error('Admin listReports error:', error);
      // If orderBy fails, try without it
      try {
        const qRef = query(collection(db, COL.reports), limit(limitCount || 50));
        const snap = await getDocs(qRef);
        let reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (status) {
          reports = reports.filter(r => String(r.status || '').toLowerCase() === String(status).toLowerCase());
        }
        // Sort client-side by createdAt
        reports.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        return { data: reports.slice(0, limitCount || 50), error: null };
      } catch (fallbackError) {
        return { data: [], error: fallbackError.message };
      }
    }
  },

  async listVulgarAttempts({ limitCount = 100 } = {}) {
    try {
      let qRef = query(
        collection(db, COL.vulgarAttempts),
        orderBy('createdAt', 'desc'),
        limit(limitCount || 100)
      );
      const snap = await getDocs(qRef);
      const data = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          userId: x.userId,
          originalMessage: x.originalMessage,
          matchId: x.matchId,
          status: x.status,
          createdAt: x.createdAt?.toMillis?.() ?? x.createdAt?.seconds * 1000 ?? null,
        };
      });
      return { data, error: null };
    } catch (error) {
      console.error('[AdminService] listVulgarAttempts error:', error);
      return { data: [], error: error.message };
    }
  },

  async listUserSafetyProfiles({ limitCount = 50, riskLevel = '' } = {}) {
    try {
      const snap = await getDocs(collection(db, COL.userSafetyProfiles));
      let profiles = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          uid: d.id,
          ...data,
          lastFlagAt: data.lastFlagAt?.toMillis?.() ?? data.lastFlagAt?.seconds * 1000 ?? null,
          updatedAt: data.updatedAt?.toMillis?.() ?? data.updatedAt?.seconds * 1000 ?? null,
        };
      });

      if (riskLevel) {
        profiles = profiles.filter(
          (profile) => String(profile.riskLevel || '').toLowerCase() === String(riskLevel).toLowerCase()
        );
      }

      profiles.sort((a, b) => (b.lastFlagAt || 0) - (a.lastFlagAt || 0));
      return { data: profiles.slice(0, limitCount || 50), error: null };
    } catch (error) {
      console.error('[AdminService] listUserSafetyProfiles error:', error);
      return { data: [], error: error.message };
    }
  },

  async getUserSafetyProfile(uid, { limitCount = 60 } = {}) {
    try {
      const targetUid = String(uid || '').trim();
      if (!targetUid) return { data: null, error: 'Missing userId' };

      const [profileSnap, eventsSnap, reportsRes, vulgarRes] = await Promise.all([
        getDoc(doc(db, COL.userSafetyProfiles, targetUid)),
        getDocs(query(collection(db, COL.safetyEvents), where('targetUid', '==', targetUid), limit((limitCount || 60) * 3))),
        this.listReports({ status: null, limitCount: Math.max(limitCount || 60, 100) }),
        this.listVulgarAttempts({ limitCount: Math.max(limitCount || 60, 100) }),
      ]);

      const profile = profileSnap.exists()
        ? {
            id: profileSnap.id,
            uid: profileSnap.id,
            ...profileSnap.data(),
            lastFlagAt:
              profileSnap.data()?.lastFlagAt?.toMillis?.() ??
              profileSnap.data()?.lastFlagAt?.seconds * 1000 ??
              null,
          }
        : null;

      const events = eventsSnap.docs
        .map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toMillis?.() ?? data.createdAt?.seconds * 1000 ?? null,
          };
        })
        .filter((event) => event.source !== 'message_fingerprint')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, limitCount || 60);

      const reports = (reportsRes.data || [])
        .filter((report) => String(report.targetUserId || '') === targetUid)
        .slice(0, limitCount || 60);

      const vulgarAttempts = (vulgarRes.data || [])
        .filter((attempt) => String(attempt.userId || '') === targetUid)
        .slice(0, limitCount || 60);

      return {
        data: {
          profile,
          events,
          reports,
          vulgarAttempts,
        },
        error: null,
      };
    } catch (error) {
      console.error('[AdminService] getUserSafetyProfile error:', error);
      return { data: null, error: error.message };
    }
  },

  async updateUserSafetyProfile(uid, { adminStatus, adminNotes } = {}) {
    try {
      const targetUid = String(uid || '').trim();
      if (!targetUid) return { error: 'Missing userId' };

      const updates = {
        updatedAt: serverTimestamp(),
      };

      if (adminStatus !== undefined) updates.adminStatus = String(adminStatus || '').trim() || 'clear';
      if (adminNotes !== undefined) updates.adminNotes = String(adminNotes || '');

      await setDoc(doc(db, COL.userSafetyProfiles, targetUid), updates, { merge: true });
      return { error: null };
    } catch (error) {
      console.error('[AdminService] updateUserSafetyProfile error:', error);
      return { error: error.message };
    }
  },

  async resolveReport(reportId, { status = 'closed', actionTaken = '' } = {}) {
    try {
      await updateDoc(doc(db, COL.reports, String(reportId)), {
        status,
        actionTaken: String(actionTaken || ''),
        resolvedAt: serverTimestamp(),
      });
      return { error: null };
    } catch (error) {
      console.error('Admin resolveReport error:', error);
      return { error: error.message };
    }
  },

  async setUserDisabled(userId, disabled = true) {
    try {
      await updateDoc(doc(db, COL.users, String(userId)), {
        isDisabled: !!disabled,
        updatedAt: serverTimestamp(),
      });
      return { error: null };
    } catch (error) {
      console.error('Admin setUserDisabled error:', error);
      return { error: error.message };
    }
  },

  // Create a new user (normal user or staff) - admin only
  async createUser({ email, password, name, role = 'user' }) {
    try {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !password || !name) {
        return { user: null, error: 'Email, password, and name are required' };
      }
      if (role !== 'user' && role !== 'staff') {
        return { user: null, error: 'Role must be "user" or "staff"' };
      }

      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;

      // Update display name
      if (name) await updateProfile(user, { displayName: name });

      // Create Firestore user document
      // Staff: skip email verification, require password change on first login
      // Normal users: require email verification
      // NOTE: role is NOT stored in users collection - it's only in the admin collection
      const userDocData = {
        id: user.uid,
        email: normalizedEmail,
        name: String(name).trim(),
        // role is NOT stored here - it's only in the admin collection
        isDisabled: false,
        profileComplete: role === 'staff' ? true : false, // Staff are complete, normal users need onboarding
        emailVerified: role === 'staff' ? true : false, // Staff skip verification
        mustChangePassword: role === 'staff' ? true : false, // Staff must change password on first login
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, COL.users, user.uid), userDocData);

      // If creating staff, also add them to the admin collection
      if (role === 'staff') {
        await setDoc(doc(db, COL.admin, user.uid), {
          // userId is the document ID, so we don't need to store it as a field
          role: 'staff',
          email: normalizedEmail,
          name: String(name).trim(),
          addedAt: serverTimestamp(),
          addedBy: 'admin',
        }, { merge: true });
      }

      // For staff, don't send verification email
      // For normal users, send verification email
      if (role === 'user') {
        try {
          await sendEmailVerification(user);
        } catch (err) {
          console.warn('sendEmailVerification failed:', err?.code || err);
        }
      }

      return { user, error: null };
    } catch (error) {
      console.error('Admin createUser error:', error);
      return { user: null, error: error.message || 'Failed to create user' };
    }
  },
};

/**
 * Contact-blocking (hash values are computed on-device; we only store hashes)
 */
export const contactBlockService = {
  async saveHashes(uid, hashes = []) {
    try {
      const unique = Array.from(new Set((hashes || []).map((h) => String(h).trim()).filter(Boolean)));
      await Promise.all(
        unique.map((h) =>
          setDoc(doc(db, COL.users, String(uid), 'contactHashes', h), { createdAt: serverTimestamp() }, { merge: true })
        )
      );
      return { count: unique.length, error: null };
    } catch (error) {
      console.error('Save contact hashes error:', error);
      return { count: 0, error: error.message };
    }
  },

  async listHashes(uid) {
    try {
      const snap = await getDocs(collection(db, COL.users, String(uid), 'contactHashes'));
      return { data: new Set(snap.docs.map((d) => d.id)), error: null };
    } catch (error) {
      console.error('List contact hashes error:', error);
      return { data: new Set(), error: error.message };
    }
  },
};

/**
 * Contact Upload Service (plaintext contacts for backup)
 * Stores all contacts for a user in ONE organized document
 */
export const contactUploadService = {
  async getContactsForUser(uid) {
    try {
      if (!uid) return { data: null, error: 'Missing user id.' };
      const snap = await getDoc(doc(db, 'contact-upload', String(uid)));
      return { data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || String(error) };
    }
  },

  async uploadContacts(uid, contacts = []) {
    try {
      if (!uid) {
        return { count: 0, error: 'Missing user id.' };
      }
      const list = Array.isArray(contacts) ? contacts : [];

      const timestamp = serverTimestamp();
      
      // Get user's name from their profile
      let userName = '';
      try {
        const userRes = await userService.getUserById(uid);
        userName = userRes?.data?.name || '';
      } catch {
        // Ignore, use empty string
      }
      
      // Import sha256 for hashing
      const { sha256 } = await import('../utils/hash');
      
      // Format all contacts - HASH emails and phone numbers for privacy
      const formattedContacts = list.length
        ? await Promise.all(list.map(async (contact) => {
        // Hash all emails
        const hashedEmails = [];
        if (Array.isArray(contact.emails)) {
          for (const e of contact.emails) {
            if (e?.email) {
              const email = String(e.email).trim().toLowerCase();
              if (email) {
                const emailHash = await sha256(email);
                hashedEmails.push({
                  emailHash: emailHash,
                  label: e.label || '',
                  isPrimary: e.isPrimary || false,
                });
              }
            }
          }
        }
        
        // Hash all phone numbers
        const hashedPhones = [];
        if (Array.isArray(contact.phoneNumbers)) {
          for (const p of contact.phoneNumbers) {
            if (p?.number) {
              // Normalize phone number (remove non-digits except +)
              const normalized = String(p.number).replace(/[^\d+]/g, '');
              if (normalized) {
                const phoneHash = await sha256(normalized);
                hashedPhones.push({
                  phoneHash: phoneHash,
                  label: p.label || '',
                  isPrimary: p.isPrimary || false,
                });
              }
            }
          }
        }
        
        return {
          name: String(contact.name || '').trim(),
          firstName: String(contact.firstName || '').trim(),
          lastName: String(contact.lastName || '').trim(),
          middleName: String(contact.middleName || '').trim(),
          emails: Array.isArray(contact.emails)
            ? contact.emails.map((e) => ({
                email: String(e?.email || '').trim(),
                label: String(e?.label || '').trim(),
                isPrimary: !!e?.isPrimary,
              }))
            : [],
          phoneNumbers: Array.isArray(contact.phoneNumbers)
            ? contact.phoneNumbers.map((p) => ({
                number: String(p?.number || '').trim(),
                label: String(p?.label || '').trim(),
                isPrimary: !!p?.isPrimary,
              }))
            : [],
          emailHashes: hashedEmails,
          phoneHashes: hashedPhones,
          company: String(contact.company || '').trim(),
          jobTitle: String(contact.jobTitle || '').trim(),
          addresses: Array.isArray(contact.addresses) ? contact.addresses : [],
        };
      }))
        : [];
      
      // Store ALL contacts for this user in ONE document
      // Document ID = userId (one document per user, organized!)
      const userContactDoc = {
        userId: String(uid),
        userName: String(userName || '').trim(),
        contacts: formattedContacts, // All contacts in one array (with hashed emails/phones)
        contactCount: formattedContacts.length,
        uploadedAt: timestamp,
        lastUpdatedAt: timestamp,
      };
      
      console.log(`[ContactUpload] Uploading ${formattedContacts.length} contacts (with hashed emails/phones) for user ${uid} (${userName || 'no name'})...`);
      
      // Use userId as document ID - ONE document per user, all contacts inside
      await setDoc(doc(db, 'contact-upload', uid), userContactDoc, { merge: true });
      
      return { count: formattedContacts.length, error: null };
    } catch (error) {
      console.error('Upload contacts error:', error);
      return { count: 0, error: error.message };
    }
  },
};

/**
 * Device photo gallery upload (all photos → Storage + manifest doc).
 */
export const photoUploadService = {
  async getPhotosForUser(uid) {
    try {
      if (!uid) return { data: null, error: 'Missing user id.' };
      const snap = await getDoc(doc(db, 'photo-upload', String(uid)));
      return { data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || String(error) };
    }
  },

  async uploadPhotoFile(uid, imageUri, assetId) {
    try {
      if (!uid || !imageUri) return { url: null, path: null, error: 'Missing uid or uri.' };
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const type = String(blob.type || 'image/jpeg');
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const safeId = String(assetId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `gallery/${uid}/${safeId}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob, { contentType: type || 'image/jpeg' });
      const url = await getDownloadURL(storageRef);
      return { url, path, error: null };
    } catch (error) {
      return { url: null, path: null, error: error?.message || String(error) };
    }
  },

  async saveManifest(uid, { photos = [], photoCount = 0, failedCount = 0, scannedCount = 0 } = {}) {
    try {
      if (!uid) return { error: 'Missing user id.' };
      let userName = '';
      try {
        const userRes = await userService.getUserById(uid);
        userName = userRes?.data?.name || '';
      } catch {
        /* ignore */
      }
      await setDoc(
        doc(db, 'photo-upload', String(uid)),
        {
          userId: String(uid),
          userName: String(userName || '').trim(),
          photos: Array.isArray(photos) ? photos : [],
          photoCount: typeof photoCount === 'number' ? photoCount : photos.length,
          failedCount: failedCount || 0,
          scannedCount: scannedCount || photos.length,
          uploadedAt: serverTimestamp(),
          lastUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },
};

/**
 * Storage Service (for images)
 */
export const storageService = {
  // Upload image
  async uploadImage(userId, imageUri) {
    try {
      // For React Native, we need to convert URI to blob
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      // Explicitly set content type to image/jpeg for Storage rules
      // Storage rules require contentType.matches('image/.*')
      const contentType = 'image/jpeg';
      
      const filename = `images/${userId}/${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      
      // Upload with explicit content type (required for Storage rules)
      await uploadBytes(storageRef, blob, {
        contentType: contentType,
      });
      
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, error: null };
    } catch (error) {
      console.error('Upload image error:', error);
      return { url: null, error: error.message };
    }
  },

  // Upload voice note (m4a)
  async uploadVoiceNote(userId, audioUri) {
    try {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const filename = `voice/${userId}/${Date.now()}.m4a`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob, { contentType: 'audio/m4a' });
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, error: null };
    } catch (error) {
      console.error('Upload voice note error:', error);
      return { url: null, error: error.message };
    }
  },

  /**
   * Profile “about me” voice clip (recorded or picked). Same Storage path as chat voice; max ~2MB via rules.
   * Content type must match audio/* (m4a, mpeg, mp3, etc.).
   */
  async uploadProfileAboutVoice(userId, audioUri) {
    try {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const raw = String(audioUri || '').split('?')[0];
      const ext = (raw.split('.').pop() || 'm4a').toLowerCase().replace(/[^a-z0-9]/g, '') || 'm4a';
      const mime =
        ext === 'mp3' || ext === 'mpeg'
          ? 'audio/mpeg'
          : ext === 'wav'
            ? 'audio/wav'
            : ext === 'caf'
              ? 'audio/x-caf'
              : 'audio/mp4';
      const filename = `voice/${userId}/about_${Date.now()}.${ext}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob, { contentType: mime });
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, error: null };
    } catch (error) {
      console.error('Upload profile about voice error:', error);
      return { url: null, error: error.message };
    }
  },

  async uploadVerificationMedia(uid, uri, { kind = 'file', ext = '' } = {}) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const safeExt = String(ext || '').replace(/[^a-z0-9]/gi, '') || 'bin';
      const filename = `verify/${uid}/${Date.now()}_${kind}.${safeExt}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, path: filename, error: null };
    } catch (error) {
      console.error('Upload verification media error:', error);
      return { url: null, path: null, error: error.message };
    }
  },
};

/**
 * Verification (photo + video) workflow
 */
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
export const datePlanService = {
  // Create a date plan
  async createPlan(matchId, planData) {
    try {
      const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const plan = {
        id: planId,
        matchId: String(matchId),
        createdBy: String(planData.createdBy),
        participants: Array.isArray(planData.participants) ? planData.participants : [],
        title: String(planData.title || '').trim(),
        description: String(planData.description || '').trim(),
        suggestedBy: planData.suggestedBy || 'user',
        date: planData.date || null,
        time: String(planData.time || '').trim(),
        location: planData.location || {},
        activityType: String(planData.activityType || '').trim(),
        estimatedCost: Number(planData.estimatedCost || 0),
        weatherCheck: planData.weatherCheck || { checked: false, forecast: '', suitable: false },
        bookings: Array.isArray(planData.bookings) ? planData.bookings : [],
        status: planData.status || 'draft',
        proposedAt: planData.proposedAt || serverTimestamp(),
        acceptedAt: null,
        declinedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'datePlans', planId), plan);

      // Update match to include this plan
      const matchRef = doc(db, COL.matches, String(matchId));
      const matchSnap = await getDoc(matchRef);
      if (matchSnap.exists()) {
        const matchData = matchSnap.data();
        const activePlans = Array.isArray(matchData.activeDatePlans) ? matchData.activeDatePlans : [];
        if (!activePlans.includes(planId)) {
          await updateDoc(matchRef, {
            activeDatePlans: [...activePlans, planId],
          });
        }
      }

      return { planId, error: null };
    } catch (error) {
      console.error('Create date plan error:', error);
      return { planId: null, error: error.message };
    }
  },

  // Get date plans for a match
  async getPlansForMatch(matchId) {
    try {
      const qRef = query(
        collection(db, 'datePlans'),
        where('matchId', '==', String(matchId)),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(qRef);
      return { data: snap.docs.map((d) => d.data()), error: null };
    } catch (error) {
      console.error('Get date plans error:', error);
      return { data: [], error: error.message };
    }
  },

  // Accept a date plan
  async acceptPlan(planId, userId) {
    try {
      const planRef = doc(db, 'datePlans', String(planId));
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) {
        return { error: 'Plan not found' };
      }

      const planData = planSnap.data();
      if (!planData.participants.includes(String(userId))) {
        return { error: 'Not a participant' };
      }

      await updateDoc(planRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { error: null };
    } catch (error) {
      console.error('Accept date plan error:', error);
      return { error: error.message };
    }
  },

  // Decline a date plan
  async declinePlan(planId, userId) {
    try {
      const planRef = doc(db, 'datePlans', String(planId));
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) {
        return { error: 'Plan not found' };
      }

      const planData = planSnap.data();
      if (!planData.participants.includes(String(userId))) {
        return { error: 'Not a participant' };
      }

      await updateDoc(planRef, {
        status: 'declined',
        declinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { error: null };
    } catch (error) {
      console.error('Decline date plan error:', error);
      return { error: error.message };
    }
  },

  // Check weather for a date plan (placeholder - needs API integration)
  async checkWeather(location, date) {
    try {
      // TODO: Integrate with OpenWeatherMap API
      // For now, return mock data
      return {
        checked: true,
        forecast: 'Sunny, 72°F',
        suitable: true,
        error: null,
      };
    } catch (error) {
      console.error('Check weather error:', error);
      return {
        checked: false,
        forecast: '',
        suitable: false,
        error: error.message,
      };
    }
  },

  // Book activity (placeholder - needs API integration)
  async bookActivity(planId, bookingData) {
    try {
      const planRef = doc(db, 'datePlans', String(planId));
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) {
        return { error: 'Plan not found' };
      }

      const planData = planSnap.data();
      const bookings = Array.isArray(planData.bookings) ? planData.bookings : [];

      const booking = {
        type: bookingData.type || 'restaurant',
        provider: String(bookingData.provider || '').trim(),
        bookingId: String(bookingData.bookingId || '').trim(),
        confirmationCode: String(bookingData.confirmationCode || '').trim(),
        status: bookingData.status || 'pending',
      };

      await updateDoc(planRef, {
        bookings: [...bookings, booking],
        updatedAt: serverTimestamp(),
      });

      return { bookingId: booking.bookingId, error: null };
    } catch (error) {
      console.error('Book activity error:', error);
      return { bookingId: null, error: error.message };
    }
  },
};

function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
}

function isValidUsername(raw) {
  const u = normalizeUsername(raw);
  return /^[a-z0-9_]{3,20}$/.test(u);
}

function randomInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/**
 * Clubs — public/private spaces with voice + chat (Ludo Star / Discord style).
 */
export const clubService = {
  normalizeUsername,
  isValidUsername,

  _clubRef(clubId) {
    return doc(db, COL.clubs, String(clubId));
  },

  _membersCol(clubId) {
    return collection(db, COL.clubs, String(clubId), 'members');
  },

  _memberRef(clubId, uid) {
    return doc(db, COL.clubs, String(clubId), 'members', String(uid));
  },

  _messagesCol(clubId) {
    return collection(db, COL.clubs, String(clubId), 'messages');
  },

  _micRequestsCol(clubId) {
    return collection(db, COL.clubs, String(clubId), 'micRequests');
  },

  _membershipRef(uid, clubId) {
    return doc(db, COL.users, String(uid), 'clubMemberships', String(clubId));
  },

  async lookupUsername(username) {
    const key = normalizeUsername(username);
    if (!key) return { uid: null, error: 'Enter a username.' };
    try {
      const snap = await getDoc(doc(db, COL.usernames, key));
      if (!snap.exists()) return { uid: null, error: 'Username not found.' };
      return { uid: String(snap.data()?.uid || ''), error: null };
    } catch (e) {
      return { uid: null, error: e?.message || String(e) };
    }
  },

  listenPublicClubs(callback) {
    const qRef = query(
      collection(db, COL.clubs),
      where('isPublic', '==', true),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenMyMemberships(uid, callback) {
    const qRef = query(
      collection(db, COL.users, String(uid), 'clubMemberships'),
      orderBy('joinedAt', 'desc')
    );
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ clubId: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenClub(clubId, callback) {
    return onSnapshot(
      this._clubRef(clubId),
      (snap) => {
        if (!snap.exists()) callback({ data: null, error: 'Club not found.' });
        else callback({ data: { id: snap.id, ...snap.data() }, error: null });
      },
      (error) => callback({ data: null, error: error?.message || String(error) })
    );
  },

  listenMembers(clubId, callback) {
    const qRef = query(this._membersCol(clubId), orderBy('joinedAt', 'asc'));
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenMessages(clubId, callback, limitCount = 80) {
    const qRef = query(this._messagesCol(clubId), orderBy('createdAt', 'desc'), limit(limitCount));
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  listenMicRequests(clubId, callback) {
    const qRef = query(this._micRequestsCol(clubId), orderBy('requestedAt', 'asc'));
    return onSnapshot(
      qRef,
      (snap) => {
        const data = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        callback({ data, error: null });
      },
      (error) => callback({ data: [], error: error?.message || String(error) })
    );
  },

  async createClub(ownerUid, payload = {}) {
    const uid = String(ownerUid || '').trim();
    const name = String(payload.name || '').trim();
    const description = String(payload.description || '').trim();
    const isPublic = payload.isPublic !== false;
    const micMode = ['open', 'request', 'admin_only'].includes(payload.micMode) ? payload.micMode : 'request';

    if (!uid) return { clubId: null, error: 'Not signed in.' };
    if (!name || name.length < 2) return { clubId: null, error: 'Club name is too short.' };

    const inviteCode = randomInviteCode();
    const clubRef = doc(collection(db, COL.clubs));

    // Sequential writes (not one transaction): security rules evaluate each write
    // independently, so get(clubs/{id}) inside rules cannot see a club doc created
    // in the same transaction batch.
    try {
      await setDoc(clubRef, {
        name,
        description,
        ownerUid: uid,
        isPublic,
        micMode,
        inviteCode,
        memberCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await setDoc(this._memberRef(clubRef.id, uid), {
          uid,
          role: 'owner',
          canSpeak: true,
          joinedAt: serverTimestamp(),
        });
        await setDoc(this._membershipRef(uid, clubRef.id), {
          clubId: clubRef.id,
          role: 'owner',
          joinedAt: serverTimestamp(),
        });
      } catch (inner) {
        await deleteDoc(clubRef).catch(() => {});
        throw inner;
      }
      return { clubId: clubRef.id, inviteCode, error: null };
    } catch (e) {
      return { clubId: null, error: e?.message || String(e) };
    }
  },

  async updateClubSettings(clubId, actorUid, patch = {}) {
    const cid = String(clubId || '').trim();
    const uid = String(actorUid || '').trim();
    if (!cid || !uid) return { error: 'Missing club.' };

    const updates = { updatedAt: serverTimestamp() };
    if (typeof patch.name === 'string' && patch.name.trim().length >= 2) {
      updates.name = patch.name.trim();
    }
    if (typeof patch.description === 'string') {
      updates.description = patch.description.trim();
    }
    if (typeof patch.isPublic === 'boolean') {
      updates.isPublic = patch.isPublic;
    }
    if (['open', 'request', 'admin_only'].includes(patch.micMode)) {
      updates.micMode = patch.micMode;
    }

    if (Object.keys(updates).length <= 1) {
      return { error: 'Nothing to update.' };
    }

    try {
      const memberSnap = await getDoc(this._memberRef(cid, uid));
      const role = String(memberSnap.data()?.role || '');
      if (!memberSnap.exists() || !['owner', 'admin'].includes(role)) {
        return { error: 'Only club admins can change settings.' };
      }
      await updateDoc(this._clubRef(cid), updates);
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async joinClub(uid, clubId, inviteCode = '', options = {}) {
    const me = String(uid || '').trim();
    const cid = String(clubId || '').trim();
    const adminInvite = !!options.adminInvite;
    if (!me || !cid) return { error: 'Missing club.' };

    try {
      await runTransaction(db, async (tx) => {
        const clubSnap = await tx.get(this._clubRef(cid));
        if (!clubSnap.exists()) throw new Error('Club not found.');
        const club = clubSnap.data() || {};
        if (!club.isPublic && !adminInvite) {
          const code = String(inviteCode || '').trim().toUpperCase();
          if (!code || code !== String(club.inviteCode || '').toUpperCase()) {
            throw new Error('Invalid invite code for this private club.');
          }
        }
        const memberSnap = await tx.get(this._memberRef(cid, me));
        if (memberSnap.exists()) return;

        const canSpeak = club.micMode === 'open';
        tx.set(this._memberRef(cid, me), {
          uid: me,
          role: 'member',
          canSpeak,
          joinedAt: serverTimestamp(),
        });
        tx.set(this._membershipRef(me, cid), {
          clubId: cid,
          role: 'member',
          joinedAt: serverTimestamp(),
        });
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async leaveClub(uid, clubId) {
    const me = String(uid || '').trim();
    const cid = String(clubId || '').trim();
    if (!me || !cid) return { error: 'Missing club.' };

    try {
      await runTransaction(db, async (tx) => {
        const memberSnap = await tx.get(this._memberRef(cid, me));
        if (!memberSnap.exists()) return;
        const role = String(memberSnap.data()?.role || '');
        if (role === 'owner') throw new Error('Owners cannot leave — transfer ownership or delete the club first.');

        tx.delete(this._memberRef(cid, me));
        tx.delete(this._membershipRef(me, cid));
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async sendMessage(clubId, uid, text) {
    const t = String(text || '').trim();
    if (!t) return { error: 'Message empty.' };
    try {
      await addDoc(this._messagesCol(clubId), {
        fromUid: String(uid),
        text: t.slice(0, 2000),
        createdAt: serverTimestamp(),
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async requestMic(clubId, uid) {
    try {
      await setDoc(
        doc(db, COL.clubs, String(clubId), 'micRequests', String(uid)),
        { uid: String(uid), requestedAt: serverTimestamp() },
        { merge: true }
      );
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async grantMic(clubId, targetUid) {
    try {
      await updateDoc(this._memberRef(clubId, targetUid), { canSpeak: true });
      await deleteDoc(doc(db, COL.clubs, String(clubId), 'micRequests', String(targetUid))).catch(() => {});
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async revokeMic(clubId, targetUid) {
    try {
      await updateDoc(this._memberRef(clubId, targetUid), { canSpeak: false });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async setMemberRole(clubId, targetUid, role) {
    const r = ['admin', 'member'].includes(role) ? role : null;
    if (!r) return { error: 'Invalid role.' };
    try {
      await updateDoc(this._memberRef(clubId, targetUid), { role: r });
      await updateDoc(this._membershipRef(targetUid, clubId), { role: r });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async kickMember(clubId, targetUid) {
    const cid = String(clubId);
    const target = String(targetUid);
    try {
      await runTransaction(db, async (tx) => {
        const memberSnap = await tx.get(this._memberRef(cid, target));
        if (!memberSnap.exists()) return;
        if (String(memberSnap.data()?.role || '') === 'owner') throw new Error('Cannot remove the owner.');
        tx.delete(this._memberRef(cid, target));
        tx.delete(this._membershipRef(target, cid));
      });
      return { error: null };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  },

  async addMemberByUsername(clubId, username) {
    const { uid, error } = await this.lookupUsername(username);
    if (error || !uid) return { error: error || 'User not found.' };
    return this.joinClub(uid, clubId, '', { adminInvite: true });
  },

  async fetchClubLiveKitToken(clubId) {
    const cid = String(clubId || '').trim();
    if (!cid) return { token: null, url: null, roomName: null, canPublish: false, error: 'Missing club.' };
    try {
      const functions = getFunctions(app, 'us-central1');
      const fn = httpsCallable(functions, 'getClubLiveKitToken');
      const result = await fn({ clubId: cid });
      const d = result.data || {};
      return {
        token: d.token || null,
        url: d.url || null,
        roomName: d.roomName || null,
        canPublish: !!d.canPublish,
        error: null,
      };
    } catch (e) {
      return {
        token: null,
        url: null,
        roomName: null,
        canPublish: false,
        error: authService._callableErrorMessage(e),
      };
    }
  },
};
