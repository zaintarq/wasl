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

import { normalizeImageUriForUpload } from '../../utils/normalizeImageUri.native';
import { verifyUploadedImage } from '../imageModerationService';

export const storageService = {
  // Upload image — Vision Safe Search runs before the URL is returned.
  async uploadImage(userId, imageUri) {
    try {
      const jpegUri = await normalizeImageUriForUpload(imageUri);

      const response = await fetch(jpegUri);
      const blob = await response.blob();
      const contentType = 'image/jpeg';
      
      const filename = `images/${userId}/${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      
      await uploadBytes(storageRef, blob, {
        contentType: contentType,
      });

      const moderation = await verifyUploadedImage(filename);
      if (!moderation.allowed) {
        return { url: null, error: moderation.message || 'This photo is not allowed.' };
      }
      
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, error: null };
    } catch (error) {
      console.error('Upload image error:', error);
      return { url: null, error: error.message };
    }
  },

  // Upload voice note (m4a)
  async uploadVoiceNote(userId, audioUri) {
    try {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const filename = `voice/${userId}/${Date.now()}.m4a`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob, { contentType: 'audio/m4a' });
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, error: null };
    } catch (error) {
      console.error('Upload voice note error:', error);
      return { url: null, error: error.message };
    }
  },

  /**
   * Profile “about me” voice clip (recorded or picked). Same Storage path as chat voice; max ~2MB via rules.
   * Content type must match audio/* (m4a, mpeg, mp3, etc.).
   */
  async uploadProfileAboutVoice(userId, audioUri) {
    try {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      const raw = String(audioUri || '').split('?')[0];
      const ext = (raw.split('.').pop() || 'm4a').toLowerCase().replace(/[^a-z0-9]/g, '') || 'm4a';
      const mime =
        ext === 'mp3' || ext === 'mpeg'
          ? 'audio/mpeg'
          : ext === 'wav'
            ? 'audio/wav'
            : ext === 'caf'
              ? 'audio/x-caf'
              : 'audio/mp4';
      const filename = `voice/${userId}/about_${Date.now()}.${ext}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob, { contentType: mime });
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, error: null };
    } catch (error) {
      console.error('Upload profile about voice error:', error);
      return { url: null, error: error.message };
    }
  },

  async uploadVerificationMedia(uid, uri, { kind = 'file', ext = '' } = {}) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const safeExt = String(ext || '').replace(/[^a-z0-9]/gi, '') || 'bin';
      const filename = `verify/${uid}/${Date.now()}_${kind}.${safeExt}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return { url: downloadURL, path: filename, error: null };
    } catch (error) {
      console.error('Upload verification media error:', error);
      return { url: null, path: null, error: error.message };
    }
  },
};

/**
 * Verification (photo + video) workflow
 */
