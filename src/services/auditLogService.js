import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';

const COL = {
  auditLogs: 'auditLogs',
};

/**
 * Audit Log Service
 * Tracks all admin/staff actions for accountability
 */
export const auditLogService = {
  /**
   * Log an admin/staff action
   * @param {string} adminId - Admin/Staff user ID
   * @param {string} action - Action type (e.g., 'warn_user', 'ban_user', 'approve_user')
   * @param {string} targetUserId - Target user ID (if applicable)
   * @param {object} details - Additional details about the action
   */
  async logAdminAction(adminId, action, targetUserId = null, details = {}) {
    try {
      const logRef = await addDoc(collection(db, COL.auditLogs), {
        adminId: String(adminId),
        action: String(action),
        targetUserId: targetUserId ? String(targetUserId) : null,
        details: typeof details === 'object' ? details : {},
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      return { logId: logRef.id, error: null };
    } catch (error) {
      console.error('[AuditLog] Log admin action error:', error);
      return { logId: null, error: error.message };
    }
  },

  /**
   * Get audit logs with filters
   * @param {object} filters - Filter options
   */
  async getAuditLogs(filters = {}) {
    try {
      let qRef = query(collection(db, COL.auditLogs), orderBy('timestamp', 'desc'));

      if (filters.adminId) {
        qRef = query(qRef, where('adminId', '==', String(filters.adminId)));
      }

      if (filters.targetUserId) {
        qRef = query(qRef, where('targetUserId', '==', String(filters.targetUserId)));
      }

      if (filters.action) {
        qRef = query(qRef, where('action', '==', String(filters.action)));
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit));
      }

      const snap = await getDocs(qRef);
      let logs = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp?.toMillis?.() || data.timestamp?.seconds * 1000 || Date.now(),
          createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || Date.now(),
        };
      });

      // Client-side filtering for time range
      if (filters.startTime || filters.endTime) {
        const start = filters.startTime?.getTime?.() || filters.startTime || 0;
        const end = filters.endTime?.getTime?.() || filters.endTime || Date.now();
        logs = logs.filter((log) => log.timestamp >= start && log.timestamp <= end);
      }

      return { data: logs, error: null };
    } catch (error) {
      console.error('[AuditLog] Get audit logs error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Export audit logs
   * @param {object} timeRange - Time range for export
   */
  async exportAuditLogs(timeRange = null) {
    try {
      const filters = {};
      if (timeRange) {
        filters.startTime = timeRange.start;
        filters.endTime = timeRange.end;
      }
      filters.limit = 10000; // Large limit for export

      const { data: logs } = await this.getAuditLogs(filters);

      // Format for export
      const exportData = logs.map((log) => ({
        id: log.id,
        adminId: log.adminId,
        action: log.action,
        targetUserId: log.targetUserId,
        details: JSON.stringify(log.details),
        timestamp: new Date(log.timestamp).toISOString(),
      }));

      return { data: exportData, error: null };
    } catch (error) {
      console.error('[AuditLog] Export audit logs error:', error);
      return { data: [], error: error.message };
    }
  },
};
