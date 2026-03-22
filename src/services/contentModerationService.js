import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';

const COL = {
  reports: 'reports',
  matches: 'matches',
};

/**
 * Content Moderation Service
 * Aggregates all flagged messages and photos for moderation
 */
export const contentModerationService = {
  /**
   * Get all flagged messages
   * @param {object} filters - Filter options
   */
  async getFlaggedMessages(filters = {}) {
    try {
      // Get reports with targetType 'message'
      let qRef = query(
        collection(db, COL.reports),
        where('targetType', '==', 'message'),
        orderBy('createdAt', 'desc')
      );

      if (filters.status) {
        qRef = query(qRef, where('status', '==', String(filters.status)));
      }

      if (filters.autoFlagged !== undefined) {
        qRef = query(qRef, where('autoFlagged', '==', !!filters.autoFlagged));
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit));
      }

      const snap = await getDocs(qRef);
      let reports = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt?.seconds * 1000 || Date.now(),
      }));

      // Fetch message content for each report
      const messagesWithContent = await Promise.all(
        reports.map(async (report) => {
          try {
            if (report.matchId && report.targetId) {
              // Get message from match
              const messageRef = doc(
                db,
                COL.matches,
                String(report.matchId),
                'messages',
                String(report.targetId)
              );
              const messageDoc = await getDoc(messageRef);
              const messageData = messageDoc.exists() ? messageDoc.data() : null;

              return {
                ...report,
                messageContent: messageData,
                text: messageData?.text || report.details || '',
              };
            }
            return { ...report, messageContent: null, text: report.details || '' };
          } catch {
            return { ...report, messageContent: null, text: report.details || '' };
          }
        })
      );

      return { data: messagesWithContent, error: null };
    } catch (error) {
      console.error('[ContentModeration] Get flagged messages error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Get all flagged photos
   * @param {object} filters - Filter options
   */
  async getFlaggedPhotos(filters = {}) {
    try {
      // Get reports with targetType 'photo' or 'user' (for profile photos)
      let qRef = query(collection(db, COL.reports), orderBy('createdAt', 'desc'));

      if (filters.status) {
        qRef = query(qRef, where('status', '==', String(filters.status)));
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit * 2));
      }

      const snap = await getDocs(qRef);
      let reports = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt?.seconds * 1000 || Date.now(),
      }));

      // Filter for photo-related reports
      reports = reports.filter(
        (r) =>
          r.targetType === 'photo' ||
          (r.targetType === 'user' && (r.reason?.toLowerCase().includes('photo') || r.categories?.includes('photo')))
      );

      // Limit after filtering
      if (filters.limit) {
        reports = reports.slice(0, filters.limit);
      }

      return { data: reports, error: null };
    } catch (error) {
      console.error('[ContentModeration] Get flagged photos error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Moderate content (approve/reject/warn)
   * @param {string} reportId - Report ID
   * @param {string} action - Action ('approve', 'reject', 'warn')
   * @param {string} notes - Admin notes
   */
  async moderateContent(reportId, action, notes = '') {
    try {
      const reportRef = doc(db, COL.reports, String(reportId));
      const reportDoc = await getDoc(reportRef);

      if (!reportDoc.exists()) {
        return { error: 'Report not found' };
      }

      const updates = {
        status: action === 'approve' ? 'closed' : action === 'reject' ? 'closed' : 'open',
        actionTaken: String(action),
        moderatedAt: serverTimestamp(),
        moderationNotes: String(notes),
      };

      await updateDoc(reportRef, updates);

      // If action is 'warn', send notification to user
      if (action === 'warn' && reportDoc.data().targetUserId) {
        // Notification would be sent here
        console.log('[ContentModeration] Warning should be sent to user:', reportDoc.data().targetUserId);
      }

      return { error: null };
    } catch (error) {
      console.error('[ContentModeration] Moderate content error:', error);
      return { error: error.message };
    }
  },

  /**
   * Get all flagged content (messages + photos) in one list
   * @param {object} filters - Filter options
   */
  async getAllFlaggedContent(filters = {}) {
    try {
      const [messagesRes, photosRes] = await Promise.all([
        this.getFlaggedMessages(filters),
        this.getFlaggedPhotos(filters),
      ]);

      const allContent = [
        ...messagesRes.data.map((m) => ({ ...m, contentType: 'message' })),
        ...photosRes.data.map((p) => ({ ...p, contentType: 'photo' })),
      ].sort((a, b) => b.createdAt - a.createdAt);

      // Limit if specified
      if (filters.limit) {
        return { data: allContent.slice(0, filters.limit), error: null };
      }

      return { data: allContent, error: null };
    } catch (error) {
      console.error('[ContentModeration] Get all flagged content error:', error);
      return { data: [], error: error.message };
    }
  },
};
