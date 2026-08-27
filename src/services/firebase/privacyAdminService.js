import { app, db } from '../firebase';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
        };
      });
      return { data, error: null };
    } catch (error) {
      console.error('[privacyAdminService] listDeletionRequests', error);
      return { data: [], error: error.message };
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
};
