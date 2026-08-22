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

export const datePlanService = {
  // Create a date plan
  async createPlan(matchId, planData) {
    try {
      const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const plan = {
        id: planId,
        matchId: String(matchId),
        createdBy: String(planData.createdBy),
        participants: Array.isArray(planData.participants) ? planData.participants : [],
        title: String(planData.title || '').trim(),
        description: String(planData.description || '').trim(),
        suggestedBy: planData.suggestedBy || 'user',
        date: planData.date || null,
        time: String(planData.time || '').trim(),
        location: planData.location || {},
        activityType: String(planData.activityType || '').trim(),
        estimatedCost: Number(planData.estimatedCost || 0),
        weatherCheck: planData.weatherCheck || { checked: false, forecast: '', suitable: false },
        bookings: Array.isArray(planData.bookings) ? planData.bookings : [],
        status: planData.status || 'draft',
        proposedAt: planData.proposedAt || serverTimestamp(),
        acceptedAt: null,
        declinedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'datePlans', planId), plan);

      // Update match to include this plan
      const matchRef = doc(db, COL.matches, String(matchId));
      const matchSnap = await getDoc(matchRef);
      if (matchSnap.exists()) {
        const matchData = matchSnap.data();
        const activePlans = Array.isArray(matchData.activeDatePlans) ? matchData.activeDatePlans : [];
        if (!activePlans.includes(planId)) {
          await updateDoc(matchRef, {
            activeDatePlans: [...activePlans, planId],
          });
        }
      }

      return { planId, error: null };
    } catch (error) {
      console.error('Create date plan error:', error);
      return { planId: null, error: error.message };
    }
  },

  // Get date plans for a match
  async getPlansForMatch(matchId) {
    try {
      const qRef = query(
        collection(db, 'datePlans'),
        where('matchId', '==', String(matchId)),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(qRef);
      return { data: snap.docs.map((d) => d.data()), error: null };
    } catch (error) {
      console.error('Get date plans error:', error);
      return { data: [], error: error.message };
    }
  },

  // Accept a date plan
  async acceptPlan(planId, userId) {
    try {
      const planRef = doc(db, 'datePlans', String(planId));
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) {
        return { error: 'Plan not found' };
      }

      const planData = planSnap.data();
      if (!planData.participants.includes(String(userId))) {
        return { error: 'Not a participant' };
      }

      await updateDoc(planRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { error: null };
    } catch (error) {
      console.error('Accept date plan error:', error);
      return { error: error.message };
    }
  },

  // Decline a date plan
  async declinePlan(planId, userId) {
    try {
      const planRef = doc(db, 'datePlans', String(planId));
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) {
        return { error: 'Plan not found' };
      }

      const planData = planSnap.data();
      if (!planData.participants.includes(String(userId))) {
        return { error: 'Not a participant' };
      }

      await updateDoc(planRef, {
        status: 'declined',
        declinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { error: null };
    } catch (error) {
      console.error('Decline date plan error:', error);
      return { error: error.message };
    }
  },

  // Check weather for a date plan (placeholder - needs API integration)
  async checkWeather(location, date) {
    try {
      // TODO: Integrate with OpenWeatherMap API
      // For now, return mock data
      return {
        checked: true,
        forecast: 'Sunny, 72°F',
        suitable: true,
        error: null,
      };
    } catch (error) {
      console.error('Check weather error:', error);
      return {
        checked: false,
        forecast: '',
        suitable: false,
        error: error.message,
      };
    }
  },

  // Book activity (placeholder - needs API integration)
  async bookActivity(planId, bookingData) {
    try {
      const planRef = doc(db, 'datePlans', String(planId));
      const planSnap = await getDoc(planRef);
      if (!planSnap.exists()) {
        return { error: 'Plan not found' };
      }

      const planData = planSnap.data();
      const bookings = Array.isArray(planData.bookings) ? planData.bookings : [];

      const booking = {
        type: bookingData.type || 'restaurant',
        provider: String(bookingData.provider || '').trim(),
        bookingId: String(bookingData.bookingId || '').trim(),
        confirmationCode: String(bookingData.confirmationCode || '').trim(),
        status: bookingData.status || 'pending',
      };

      await updateDoc(planRef, {
        bookings: [...bookings, booking],
        updatedAt: serverTimestamp(),
      });

      return { bookingId: booking.bookingId, error: null };
    } catch (error) {
      console.error('Book activity error:', error);
      return { bookingId: null, error: error.message };
    }
  },
};

function randomInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i += 1) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/**
 * Clubs — public/private spaces with voice + chat (Ludo Star / Discord style).
 */
