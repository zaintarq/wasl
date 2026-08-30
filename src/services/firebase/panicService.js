import { app } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { authService } from './authService';

export const panicService = {
  async triggerSOS(matchId) {
    try {
      const callable = httpsCallable(getFunctions(app, 'us-central1'), 'triggerPanicSOS');
      const { data } = await callable({ matchId: String(matchId) });
      return { ok: !!data?.ok, reportId: data?.reportId || null, error: null };
    } catch (e) {
      return { ok: false, reportId: null, error: authService._callableErrorMessage(e) };
    }
  },
};
