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
        ageChecked18Plus: userData.ageChecked18Plus === true,
        ageCheckMethod: userData.ageCheckMethod || null,
        ageCheckProvider: userData.ageCheckProvider || null,
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

  /** Wait until Firestore auth token is ready (avoids permission-denied race on cold start). */
  async ensureAuthReady() {
    const user = auth.currentUser;
    if (!user) return null;
    await user.getIdToken();
    return user;
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
