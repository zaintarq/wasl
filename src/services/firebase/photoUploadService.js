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

import { userService } from './userService';

export const photoUploadService = {
  async getPhotosForUser(uid) {
    try {
      if (!uid) return { data: null, error: 'Missing user id.' };
      const snap = await getDoc(doc(db, 'photo-upload', String(uid)));
      return { data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || String(error) };
    }
  },

  async uploadPhotoFile(uid, imageUri, assetId) {
    try {
      if (!uid || !imageUri) return { url: null, path: null, error: 'Missing uid or uri.' };
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const type = String(blob.type || 'image/jpeg');
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const safeId = String(assetId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `gallery/${uid}/${safeId}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob, { contentType: type || 'image/jpeg' });
      const url = await getDownloadURL(storageRef);
      return { url, path, error: null };
    } catch (error) {
      return { url: null, path: null, error: error?.message || String(error) };
    }
  },

  async saveManifest(uid, { photos = [], photoCount = 0, failedCount = 0, scannedCount = 0 } = {}) {
    try {
      if (!uid) return { error: 'Missing user id.' };
      let userName = '';
      try {
        const userRes = await userService.getUserById(uid);
        userName = userRes?.data?.name || '';
      } catch {
        /* ignore */
      }
      await setDoc(
        doc(db, 'photo-upload', String(uid)),
        {
          userId: String(uid),
          userName: String(userName || '').trim(),
          photos: Array.isArray(photos) ? photos : [],
          photoCount: typeof photoCount === 'number' ? photoCount : photos.length,
          failedCount: failedCount || 0,
          scannedCount: scannedCount || photos.length,
          uploadedAt: serverTimestamp(),
          lastUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { error: null };
    } catch (error) {
      return { error: error?.message || String(error) };
    }
  },
};

/**
 * Client-side NSFWJS gate before Storage upload (native only).
 */
async function gateStorageImage(imageUri) {
  try {
    const { gateImageBeforeUpload } = require('../utils/nsfwImageGate.native');
    return await gateImageBeforeUpload(imageUri);
  } catch {
    return { allowed: true, blocked: false, message: null };
  }
}

/**
 * Storage Service (for images)
 */
