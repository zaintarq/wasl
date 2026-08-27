import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, db } from '../firebase';
import { COL } from './constants';

function callable(name) {
  try {
    const functions = getFunctions(app, 'us-central1');
    return httpsCallable(functions, name);
  } catch {
    return null;
  }
}

const _submitDeletionRequest = callable('submitDeletionRequest');
const _processDeletionRequest = callable('processDeletionRequest');
const _sendDeletionNoticeEmail = callable('sendDeletionNoticeEmail');
const _reportCrash = callable('reportCrash');
const _getDeletionWipePreview = callable('getDeletionWipePreview');
const _exportUserDataPacket = callable('exportUserDataPacket');
const _selfWipeAccount = callable('selfWipeAccount');
const _sendReportOutcomeEmail = callable('sendReportOutcomeEmail');
const _createCrashTrackerIssue = callable('createCrashTrackerIssue');

export const privacyAdminService = {
  async submitDeletionRequest({ type = 'account', details = '' } = {}) {
    if (!_submitDeletionRequest) return { error: 'Deletion request unavailable.' };
    try {
      const res = await _submitDeletionRequest({ type, details });
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to submit deletion request.' };
    }
  },

  async listDeletionRequests({ limitCount = 80 } = {}) {
    try {
      const qRef = query(
        collection(db, COL.deletionRequests),
        orderBy('createdAt', 'desc'),
        limit(limitCount || 80)
      );
      const snap = await getDocs(qRef);
      const data = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          ...x,
          createdAt: x.createdAt?.toMillis?.() ?? x.createdAt?.seconds * 1000 ?? null,
          processedAt: x.processedAt?.toMillis?.() ?? x.processedAt?.seconds * 1000 ?? null,
          ackEmailAt: x.ackEmailAt?.toMillis?.() ?? x.ackEmailAt?.seconds * 1000 ?? null,
        };
      });
      return { data, error: null };
    } catch (error) {
      console.error('[privacyAdminService] listDeletionRequests', error);
      return { data: [], error: error.message };
    }
  },

  async getDeletionWipePreview({ requestId = '', type = 'account' } = {}) {
    if (!_getDeletionWipePreview) return { error: 'Wipe preview unavailable.' };
    try {
      const res = await _getDeletionWipePreview({ requestId, type });
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to load wipe preview.' };
    }
  },

  async processDeletionRequest({ requestId, customMessage = '', sendEmail = true } = {}) {
    if (!_processDeletionRequest) return { error: 'Process deletion unavailable.' };
    try {
      const res = await _processDeletionRequest({ requestId, customMessage, sendEmail });
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to process deletion.' };
    }
  },

  async sendDeletionNoticeEmail({ to, subject, body, requestId = '' } = {}) {
    if (!_sendDeletionNoticeEmail) return { error: 'Email send unavailable.' };
    try {
      const res = await _sendDeletionNoticeEmail({ to, subject, body, requestId });
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to send email.' };
    }
  },

  async exportUserDataPacket({ uid = '' } = {}) {
    if (!_exportUserDataPacket) return { error: 'Data export unavailable.' };
    try {
      const payload = {};
      if (uid) payload.uid = uid;
      const res = await _exportUserDataPacket(payload);
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to export user data.' };
    }
  },

  async listCrashGroups({ limitCount = 80 } = {}) {
    try {
      const qRef = query(
        collection(db, COL.crashGroups),
        orderBy('lastSeenAt', 'desc'),
        limit(limitCount || 80)
      );
      const snap = await getDocs(qRef);
      const data = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          ...x,
          firstSeenAt: x.firstSeenAt?.toMillis?.() ?? x.firstSeenAt?.seconds * 1000 ?? null,
          lastSeenAt: x.lastSeenAt?.toMillis?.() ?? x.lastSeenAt?.seconds * 1000 ?? null,
        };
      });
      return { data, error: null };
    } catch (error) {
      console.error('[privacyAdminService] listCrashGroups', error);
      return { data: [], error: error.message };
    }
  },

  async listCrashLogs({ limitCount = 100 } = {}) {
    try {
      const qRef = query(
        collection(db, COL.crashLogs),
        orderBy('createdAt', 'desc'),
        limit(limitCount || 100)
      );
      const snap = await getDocs(qRef);
      const data = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          ...x,
          createdAt: x.createdAt?.toMillis?.() ?? x.createdAt?.seconds * 1000 ?? null,
        };
      });
      return { data, error: null };
    } catch (error) {
      console.error('[privacyAdminService] listCrashLogs', error);
      return { data: [], error: error.message };
    }
  },

  async reportCrash(payload = {}) {
    if (!_reportCrash) return { error: 'Crash reporting unavailable.' };
    try {
      const res = await _reportCrash(payload);
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to report crash.' };
    }
  },

  async selfWipeAccount({ confirm = 'DELETE' } = {}) {
    if (!_selfWipeAccount) return { error: 'Account deletion unavailable.' };
    try {
      const res = await _selfWipeAccount({ confirm });
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to delete account.' };
    }
  },

  async sendReportOutcomeEmail({ reportId, message, subject = '' } = {}) {
    if (!_sendReportOutcomeEmail) return { error: 'Outcome email unavailable.' };
    try {
      const res = await _sendReportOutcomeEmail({ reportId, message, subject });
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to email reporter.' };
    }
  },

  async createCrashTrackerIssue({ fingerprint = '', groupId = '', title = '', body = '' } = {}) {
    if (!_createCrashTrackerIssue) return { error: 'Tracker issue unavailable.' };
    try {
      const res = await _createCrashTrackerIssue({ fingerprint, groupId, title, body });
      return { data: res?.data || null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || 'Failed to create tracker issue.' };
    }
  },

  async listMyDeletionRequests({ limitCount = 20 } = {}) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return { data: [], error: 'Not signed in.' };
      const qRef = query(
        collection(db, COL.deletionRequests),
        where('uid', '==', String(uid)),
        orderBy('createdAt', 'desc'),
        limit(limitCount || 20)
      );
      const snap = await getDocs(qRef);
      const data = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          ...x,
          createdAt: x.createdAt?.toMillis?.() ?? x.createdAt?.seconds * 1000 ?? null,
          processedAt: x.processedAt?.toMillis?.() ?? x.processedAt?.seconds * 1000 ?? null,
        };
      });
      return { data, error: null };
    } catch (error) {
      console.error('[privacyAdminService] listMyDeletionRequests', error);
      return { data: [], error: error.message };
    }
  },
};
