import { db, auth } from '../firebase';
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where,
} from 'firebase/firestore';
import { COL } from './constants';
import { adminService } from './adminService';

export const appealService = {
  async submitAppeal({ reason = '', category = 'disable' } = {}) {
    try {
      const user = auth.currentUser;
      if (!user?.uid) return { error: 'Not signed in.' };

      const existing = await getDocs(
        query(collection(db, COL.appeals), where('uid', '==', user.uid), limit(20))
      );
      const open = existing.docs.find((d) => String(d.data()?.status || '') === 'open');
      if (open) {
        return { data: { id: open.id, alreadyOpen: true }, error: null };
      }

      const ref = await addDoc(collection(db, COL.appeals), {
        uid: user.uid,
        email: String(user.email || '').trim().toLowerCase(),
        category: String(category || 'disable').trim().toLowerCase(),
        reason: String(reason || '').trim().slice(0, 2000),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { data: { id: ref.id, alreadyOpen: false }, error: null };
    } catch (error) {
      console.error('[appealService] submitAppeal', error);
      return { error: error?.message || 'Failed to submit appeal.' };
    }
  },

  async listAppeals({ limitCount = 80 } = {}) {
    try {
      const qRef = query(
        collection(db, COL.appeals),
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
          resolvedAt: x.resolvedAt?.toMillis?.() ?? x.resolvedAt?.seconds * 1000 ?? null,
        };
      });
      return { data, error: null };
    } catch (error) {
      console.error('[appealService] listAppeals', error);
      return { data: [], error: error.message };
    }
  },

  async resolveAppeal({
    appealId,
    decision = 'approve',
    adminNotes = '',
    clearShadowBan = true,
  } = {}) {
    try {
      const id = String(appealId || '').trim();
      if (!id) return { error: 'Missing appeal id.' };

      const appealRef = doc(db, COL.appeals, id);
      const appealSnap = await getDoc(appealRef);
      if (!appealSnap.exists()) return { error: 'Appeal not found.' };
      const appeal = appealSnap.data() || {};
      const uid = String(appeal.uid || '').trim();
      if (!uid) return { error: 'Appeal has no user id.' };

      const decisionNorm = String(decision || '').toLowerCase();
      const notes = String(adminNotes || '').trim().slice(0, 2000);
      const resolvedBy = auth.currentUser?.uid || null;

      if (decisionNorm === 'approve') {
        const dis = await adminService.setUserDisabled(uid, false);
        if (dis.error) return { error: dis.error };
        if (clearShadowBan) {
          const sh = await adminService.setUserShadowBanned(uid, false);
          if (sh.error) return { error: sh.error };
        }
        await updateDoc(appealRef, {
          status: 'approved',
          adminNotes: notes,
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          resolvedBy,
        });
        return { error: null };
      }

      if (decisionNorm === 'reject') {
        await updateDoc(appealRef, {
          status: 'rejected',
          adminNotes: notes,
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          resolvedBy,
        });
        return { error: null };
      }

      if (decisionNorm === 'shadowban') {
        const dis = await adminService.setUserDisabled(uid, false);
        if (dis.error) return { error: dis.error };
        const sh = await adminService.setUserShadowBanned(uid, true);
        if (sh.error) return { error: sh.error };
        await updateDoc(appealRef, {
          status: 'shadowbanned',
          adminNotes: notes,
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          resolvedBy,
        });
        return { error: null };
      }

      return { error: 'Unknown decision.' };
    } catch (error) {
      console.error('[appealService] resolveAppeal', error);
      return { error: error?.message || 'Failed to resolve appeal.' };
    }
  },
};
