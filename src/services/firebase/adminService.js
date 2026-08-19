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
import { checkUserRoleFromAdminCollection } from './roles';

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
