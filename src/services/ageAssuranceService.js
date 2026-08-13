import { app } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

function fn(name) {
  const functions = getFunctions(app, 'us-central1');
  return httpsCallable(functions, name);
}

export const ageAssuranceService = {
  async finalize(attestationJwt) {
    try {
      const token = String(attestationJwt || '').trim();
      if (!token) return { data: null, error: 'Missing verification token.' };
      const { data } = await fn('finalizeZoiVeraAgeCheck')({ attestationJwt: token });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: e?.message || String(e) };
    }
  },
};
