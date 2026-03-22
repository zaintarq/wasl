import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';

const COL = {
  userActivity: 'userActivity',
  activityFlags: 'activityFlags',
};

/**
 * Activity Tracking Service
 * Tracks all user interactions for hyper activity detection
 */
export const activityService = {
  /**
   * Track a user action
   * @param {string} userId - User ID
   * @param {string} actionType - Type of action (e.g., 'swipe_left', 'swipe_right', 'message_sent', 'button_press')
   * @param {object} actionData - Additional data about the action
   * @param {string} ipAddress - User's IP address
   * @param {string} screenName - Current screen name
   * @param {string} sessionId - Session ID for grouping activities
   */
  async trackActivity(userId, actionType, actionData = {}, ipAddress = null, screenName = null, sessionId = null) {
    try {
      const activityRef = await addDoc(collection(db, COL.userActivity), {
        userId: String(userId),
        actionType: String(actionType),
        actionData: typeof actionData === 'object' ? actionData : {},
        ipAddress: ipAddress ? String(ipAddress) : null,
        screenName: screenName ? String(screenName) : null,
        sessionId: sessionId ? String(sessionId) : null,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      // Check for hyper activity after tracking
      this.detectHyperActivity(userId).catch((err) => {
        console.warn('[ActivityService] Hyper activity detection error:', err);
      });

      return { id: activityRef.id, error: null };
    } catch (error) {
      console.error('[ActivityService] Track activity error:', error);
      return { id: null, error: error.message };
    }
  },

  /**
   * Get recent activities for a user
   * @param {string} userId - User ID
   * @param {number} limitCount - Number of activities to retrieve
   * @param {number} timeRangeMs - Time range in milliseconds (e.g., 60000 for last minute)
   */
  async getRecentActivities(userId, limitCount = 100, timeRangeMs = null) {
    try {
      let qRef = query(
        collection(db, COL.userActivity),
        where('userId', '==', String(userId)),
        orderBy('timestamp', 'desc')
      );

      if (timeRangeMs) {
        const cutoffTime = Date.now() - timeRangeMs;
        // Note: Firestore doesn't support timestamp comparison directly in queries
        // We'll filter client-side after fetching
      }

      if (limitCount) {
        qRef = query(qRef, limit(limitCount * 2)); // Get more to account for time filtering
      }

      const snap = await getDocs(qRef);
      let activities = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        timestamp: d.data().timestamp?.toMillis?.() || d.data().timestamp?.seconds * 1000 || Date.now(),
      }));

      // Filter by time range if specified
      if (timeRangeMs) {
        const cutoffTime = Date.now() - timeRangeMs;
        activities = activities.filter((a) => a.timestamp >= cutoffTime);
      }

      // Limit after filtering
      if (limitCount) {
        activities = activities.slice(0, limitCount);
      }

      return { data: activities, error: null };
    } catch (error) {
      console.error('[ActivityService] Get recent activities error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Detect hyper activity patterns
   * @param {string} userId - User ID
   */
  async detectHyperActivity(userId) {
    try {
      // Get activities from last minute
      const { data: recentActivities } = await this.getRecentActivities(userId, 200, 60000);

      if (recentActivities.length === 0) {
        return { detected: false, flags: [] };
      }

      const now = Date.now();
      const last10Seconds = recentActivities.filter((a) => now - a.timestamp < 10000);
      const lastMinute = recentActivities;

      const flags = [];

      // Time-based: 20+ actions in 10 seconds
      if (last10Seconds.length >= 20) {
        flags.push({
          type: 'time_based',
          severity: 'high',
          count: last10Seconds.length,
          timeWindow: '10_seconds',
        });
      }

      // Frequency-based: 100+ actions in 1 minute
      if (lastMinute.length >= 100) {
        flags.push({
          type: 'frequency_based',
          severity: 'high',
          count: lastMinute.length,
          timeWindow: '1_minute',
        });
      }

      // Pattern-based: Same action repeated 50+ times
      const actionCounts = {};
      lastMinute.forEach((a) => {
        const action = a.actionType || 'unknown';
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      });

      for (const [action, count] of Object.entries(actionCounts)) {
        if (count >= 50) {
          flags.push({
            type: 'pattern_based',
            severity: 'medium',
            action,
            count,
            timeWindow: '1_minute',
          });
        }
      }

      // If flags detected, create activity flag document
      if (flags.length > 0) {
        const flagRef = await addDoc(collection(db, COL.activityFlags), {
          userId: String(userId),
          flags: flags,
          severity: flags.some((f) => f.severity === 'high') ? 'high' : 'medium',
          detectedAt: serverTimestamp(),
          activityCount: lastMinute.length,
          status: 'open',
        });

        return { detected: true, flags, flagId: flagRef.id };
      }

      return { detected: false, flags: [] };
    } catch (error) {
      console.error('[ActivityService] Detect hyper activity error:', error);
      return { detected: false, flags: [], error: error.message };
    }
  },

  /**
   * Get activity statistics for a user
   * @param {string} userId - User ID
   * @param {object} timeRange - Time range object with start and end
   */
  async getActivityStats(userId, timeRange = null) {
    try {
      let activities;
      if (timeRange) {
        const { data } = await this.getRecentActivities(userId, 1000);
        const start = timeRange.start?.getTime?.() || timeRange.start;
        const end = timeRange.end?.getTime?.() || timeRange.end;
        activities = data.filter((a) => a.timestamp >= start && a.timestamp <= end);
      } else {
        const { data } = await this.getRecentActivities(userId, 1000);
        activities = data;
      }

      // Calculate stats
      const actionCounts = {};
      const screenCounts = {};
      let totalActions = activities.length;

      activities.forEach((a) => {
        const action = a.actionType || 'unknown';
        actionCounts[action] = (actionCounts[action] || 0) + 1;

        const screen = a.screenName || 'unknown';
        screenCounts[screen] = (screenCounts[screen] || 0) + 1;
      });

      return {
        totalActions,
        actionCounts,
        screenCounts,
        timeRange: timeRange || 'all',
        error: null,
      };
    } catch (error) {
      console.error('[ActivityService] Get activity stats error:', error);
      return { totalActions: 0, actionCounts: {}, screenCounts: {}, error: error.message };
    }
  },

  /**
   * Flag a user for review
   * @param {string} userId - User ID
   * @param {string} reason - Reason for flagging
   * @param {string} severity - Severity level ('low', 'medium', 'high')
   */
  async flagUser(userId, reason, severity = 'medium') {
    try {
      const flagRef = await addDoc(collection(db, COL.activityFlags), {
        userId: String(userId),
        reason: String(reason),
        severity: String(severity),
        flaggedAt: serverTimestamp(),
        status: 'open',
        flags: [{ type: 'manual', reason, severity }],
      });

      return { flagId: flagRef.id, error: null };
    } catch (error) {
      console.error('[ActivityService] Flag user error:', error);
      return { flagId: null, error: error.message };
    }
  },

  /**
   * Get all activity flags (for admin)
   * @param {object} filters - Filter options
   */
  async getActivityFlags(filters = {}) {
    try {
      let qRef = query(collection(db, COL.activityFlags), orderBy('detectedAt', 'desc'));

      if (filters.status) {
        qRef = query(qRef, where('status', '==', String(filters.status)));
      }

      if (filters.severity) {
        qRef = query(qRef, where('severity', '==', String(filters.severity)));
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit));
      }

      const snap = await getDocs(qRef);
      let flags = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        detectedAt: d.data().detectedAt?.toMillis?.() || d.data().detectedAt?.seconds * 1000 || Date.now(),
      }));

      // Client-side filtering for userId if needed (to avoid composite index)
      if (filters.userId) {
        flags = flags.filter((f) => f.userId === String(filters.userId));
      }

      return { data: flags, error: null };
    } catch (error) {
      console.error('[ActivityService] Get activity flags error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Resolve an activity flag
   * @param {string} flagId - Flag ID
   * @param {string} actionTaken - Action taken
   */
  async resolveFlag(flagId, actionTaken = 'reviewed') {
    try {
      await updateDoc(doc(db, COL.activityFlags, String(flagId)), {
        status: 'resolved',
        actionTaken: String(actionTaken),
        resolvedAt: serverTimestamp(),
      });

      return { error: null };
    } catch (error) {
      console.error('[ActivityService] Resolve flag error:', error);
      return { error: error.message };
    }
  },
};
