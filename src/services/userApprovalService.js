import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { sendExpoPushAsync } from './pushService.native';

const COL = {
  users: 'users',
  userApprovals: 'userApprovals',
};

/**
 * User Approval Service
 * Handles user registration approval workflow
 */
export const userApprovalService = {
  /**
   * Request more information from a user
   * @param {string} userId - User ID
   * @param {array} requestedFields - Fields requested (e.g., ['photos', 'bio', 'age'])
   * @param {string} message - Custom message for user
   */
  async requestMoreInfo(userId, requestedFields = [], message = '') {
    try {
      // Update user approval status
      await updateDoc(doc(db, COL.users, String(userId)), {
        approvalStatus: 'needsInfo',
        requestedFields: Array.isArray(requestedFields) ? requestedFields : [],
        approvalUpdatedAt: serverTimestamp(),
      });

      // Create approval request record
      const approvalRef = doc(db, COL.userApprovals, `${userId}_${Date.now()}`);
      await setDoc(approvalRef, {
        userId: String(userId),
        action: 'requestMoreInfo',
        requestedFields: Array.isArray(requestedFields) ? requestedFields : [],
        message: String(message),
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Send in-app notification (directly, avoiding circular dependency)
      try {
        const notificationRef = await addDoc(
          collection(db, COL.users, String(userId), 'notifications'),
          {
            toUid: String(userId),
            type: 'approval_request',
            title: 'Profile Information Requested',
            body: message || 'Please update your profile with additional information.',
            status: 'unread',
            createdAt: serverTimestamp(),
          }
        );
        // Send push notification
        try {
          const userDoc = await getDoc(doc(db, COL.users, String(userId)));
          const token = userDoc.exists() ? String(userDoc.data()?.expoPushToken || '') : '';
          if (token) {
            await sendExpoPushAsync({
              to: token,
              title: 'Profile Information Requested',
              body: message || 'Please update your profile with additional information.',
              data: { type: 'approval_request', notificationId: notificationRef.id },
              sound: 'default',
            });
          }
        } catch (pushError) {
          // Ignore push errors
        }
      } catch (notifError) {
        // Ignore notification errors - not critical
        console.warn('[UserApproval] Notification error:', notifError);
      }

      // Send email notification (if email service is available)
      try {
        const userDoc = await getDoc(doc(db, COL.users, String(userId)));
        const userEmail = userDoc.data()?.email;
        if (userEmail) {
          // Email will be sent via Cloud Function or email service
          // For now, we'll just log it
          console.log('[UserApproval] Email notification should be sent to:', userEmail);
        }
      } catch (emailError) {
        console.warn('[UserApproval] Email notification error:', emailError);
      }

      return { approvalId: approvalRef.id, error: null };
    } catch (error) {
      console.error('[UserApproval] Request more info error:', error);
      return { approvalId: null, error: error.message };
    }
  },

  /**
   * Approve a user
   * @param {string} userId - User ID
   */
  async approveUser(userId) {
    try {
      // Update user approval status
      await updateDoc(doc(db, COL.users, String(userId)), {
        approvalStatus: 'approved',
        approvalUpdatedAt: serverTimestamp(),
      });

      // Create approval record
      const approvalRef = doc(db, COL.userApprovals, `${userId}_${Date.now()}`);
      await setDoc(approvalRef, {
        userId: String(userId),
        action: 'approve',
        status: 'approved',
        createdAt: serverTimestamp(),
      });

      // Send notification (directly, avoiding circular dependency)
      try {
        const notificationRef = await addDoc(
          collection(db, COL.users, String(userId), 'notifications'),
          {
            toUid: String(userId),
            type: 'approval_approved',
            title: 'Profile Approved',
            body: 'Your profile has been approved!',
            status: 'unread',
            createdAt: serverTimestamp(),
          }
        );
        // Send push notification
        try {
          const userDoc = await getDoc(doc(db, COL.users, String(userId)));
          const token = userDoc.exists() ? String(userDoc.data()?.expoPushToken || '') : '';
          if (token) {
            await sendExpoPushAsync({
              to: token,
              title: 'Profile Approved',
              body: 'Your profile has been approved!',
              data: { type: 'approval_approved', notificationId: notificationRef.id },
              sound: 'default',
            });
          }
        } catch (pushError) {
          // Ignore push errors
        }
      } catch (notifError) {
        // Ignore notification errors - not critical
        console.warn('[UserApproval] Notification error:', notifError);
      }

      return { approvalId: approvalRef.id, error: null };
    } catch (error) {
      console.error('[UserApproval] Approve user error:', error);
      return { approvalId: null, error: error.message };
    }
  },

  /**
   * Reject a user and request changes
   * @param {string} userId - User ID
   * @param {string} reason - Reason for rejection
   */
  async rejectUser(userId, reason = '') {
    try {
      // Update user approval status
      await updateDoc(doc(db, COL.users, String(userId)), {
        approvalStatus: 'rejected',
        rejectionReason: String(reason),
        approvalUpdatedAt: serverTimestamp(),
      });

      // Create approval record
      const approvalRef = doc(db, COL.userApprovals, `${userId}_${Date.now()}`);
      await setDoc(approvalRef, {
        userId: String(userId),
        action: 'reject',
        reason: String(reason),
        status: 'rejected',
        createdAt: serverTimestamp(),
      });

      // Send notification (directly, avoiding circular dependency)
      try {
        const notificationRef = await addDoc(
          collection(db, COL.users, String(userId), 'notifications'),
          {
            toUid: String(userId),
            type: 'approval_rejected',
            title: 'Profile Update Required',
            body: reason || 'Please update your profile and resubmit for approval.',
            status: 'unread',
            createdAt: serverTimestamp(),
          }
        );
        // Send push notification
        try {
          const userDoc = await getDoc(doc(db, COL.users, String(userId)));
          const token = userDoc.exists() ? String(userDoc.data()?.expoPushToken || '') : '';
          if (token) {
            await sendExpoPushAsync({
              to: token,
              title: 'Profile Update Required',
              body: reason || 'Please update your profile and resubmit for approval.',
              data: { type: 'approval_rejected', notificationId: notificationRef.id },
              sound: 'default',
            });
          }
        } catch (pushError) {
          // Ignore push errors
        }
      } catch (notifError) {
        // Ignore notification errors - not critical
        console.warn('[UserApproval] Notification error:', notifError);
      }

      // Send email notification
      try {
        const userDoc = await getDoc(doc(db, COL.users, String(userId)));
        const userEmail = userDoc.data()?.email;
        if (userEmail) {
          console.log('[UserApproval] Email notification should be sent to:', userEmail);
        }
      } catch (emailError) {
        console.warn('[UserApproval] Email notification error:', emailError);
      }

      return { approvalId: approvalRef.id, error: null };
    } catch (error) {
      console.error('[UserApproval] Reject user error:', error);
      return { approvalId: null, error: error.message };
    }
  },

  /**
   * Get users needing approval
   * @param {object} filters - Filter options
   */
  async getPendingUsers(filters = {}) {
    try {
      let qRef = query(collection(db, COL.users), orderBy('createdAt', 'desc'));

      if (filters.approvalStatus) {
        qRef = query(qRef, where('approvalStatus', '==', String(filters.approvalStatus)));
      } else {
        // Default: get users with needsInfo or rejected status
        // Note: Firestore doesn't support OR queries easily, so we'll filter client-side
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit * 2)); // Get more for client-side filtering
      }

      const snap = await getDocs(qRef);
      let users = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt?.seconds * 1000 || Date.now(),
      }));

      // Client-side filtering for approval status
      if (!filters.approvalStatus) {
        users = users.filter(
          (u) =>
            u.approvalStatus === 'needsInfo' ||
            u.approvalStatus === 'rejected' ||
            u.approvalStatus === 'pending' ||
            !u.approvalStatus // New users without approval status
        );
      }

      // Limit after filtering
      if (filters.limit) {
        users = users.slice(0, filters.limit);
      }

      return { data: users, error: null };
    } catch (error) {
      console.error('[UserApproval] Get pending users error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Get all users (for admin approval panel)
   * @param {object} filters - Filter options
   */
  async getAllUsers(filters = {}) {
    try {
      let qRef = query(collection(db, COL.users), orderBy('createdAt', 'desc'));

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit));
      }

      const snap = await getDocs(qRef);
      let users = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt?.seconds * 1000 || Date.now(),
      }));

      // Client-side filtering
      if (filters.approvalStatus) {
        users = users.filter((u) => u.approvalStatus === filters.approvalStatus);
      }

      if (filters.search) {
        const searchLower = String(filters.search).toLowerCase();
        users = users.filter(
          (u) =>
            u.name?.toLowerCase().includes(searchLower) ||
            u.email?.toLowerCase().includes(searchLower) ||
            u.id?.toLowerCase().includes(searchLower)
        );
      }

      return { data: users, error: null };
    } catch (error) {
      console.error('[UserApproval] Get all users error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Get approval history for a user
   * @param {string} userId - User ID
   */
  async getApprovalHistory(userId) {
    try {
      const qRef = query(
        collection(db, COL.userApprovals),
        where('userId', '==', String(userId)),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const snap = await getDocs(qRef);
      const history = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt?.seconds * 1000 || Date.now(),
      }));

      return { data: history, error: null };
    } catch (error) {
      console.error('[UserApproval] Get approval history error:', error);
      return { data: [], error: error.message };
    }
  },
};
