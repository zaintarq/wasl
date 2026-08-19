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

export const contactUploadService = {
  async getContactsForUser(uid) {
    try {
      if (!uid) return { data: null, error: 'Missing user id.' };
      const snap = await getDoc(doc(db, 'contact-upload', String(uid)));
      return { data: snap.exists() ? { id: snap.id, ...snap.data() } : null, error: null };
    } catch (error) {
      return { data: null, error: error?.message || String(error) };
    }
  },

  async uploadContacts(uid, contacts = []) {
    try {
      if (!uid) {
        return { count: 0, error: 'Missing user id.' };
      }
      const list = Array.isArray(contacts) ? contacts : [];

      const timestamp = serverTimestamp();
      
      // Get user's name from their profile
      let userName = '';
      try {
        const userRes = await userService.getUserById(uid);
        userName = userRes?.data?.name || '';
      } catch {
        // Ignore, use empty string
      }
      
      // Import sha256 for hashing
      const { sha256 } = await import('../utils/hash');
      
      // Format all contacts - HASH emails and phone numbers for privacy
      const formattedContacts = list.length
        ? await Promise.all(list.map(async (contact) => {
        // Hash all emails
        const hashedEmails = [];
        if (Array.isArray(contact.emails)) {
          for (const e of contact.emails) {
            if (e?.email) {
              const email = String(e.email).trim().toLowerCase();
              if (email) {
                const emailHash = await sha256(email);
                hashedEmails.push({
                  emailHash: emailHash,
                  label: e.label || '',
                  isPrimary: e.isPrimary || false,
                });
              }
            }
          }
        }
        
        // Hash all phone numbers
        const hashedPhones = [];
        if (Array.isArray(contact.phoneNumbers)) {
          for (const p of contact.phoneNumbers) {
            if (p?.number) {
              // Normalize phone number (remove non-digits except +)
              const normalized = String(p.number).replace(/[^\d+]/g, '');
              if (normalized) {
                const phoneHash = await sha256(normalized);
                hashedPhones.push({
                  phoneHash: phoneHash,
                  label: p.label || '',
                  isPrimary: p.isPrimary || false,
                });
              }
            }
          }
        }
        
        return {
          name: String(contact.name || '').trim(),
          firstName: String(contact.firstName || '').trim(),
          lastName: String(contact.lastName || '').trim(),
          middleName: String(contact.middleName || '').trim(),
          emails: Array.isArray(contact.emails)
            ? contact.emails.map((e) => ({
                email: String(e?.email || '').trim(),
                label: String(e?.label || '').trim(),
                isPrimary: !!e?.isPrimary,
              }))
            : [],
          phoneNumbers: Array.isArray(contact.phoneNumbers)
            ? contact.phoneNumbers.map((p) => ({
                number: String(p?.number || '').trim(),
                label: String(p?.label || '').trim(),
                isPrimary: !!p?.isPrimary,
              }))
            : [],
          emailHashes: hashedEmails,
          phoneHashes: hashedPhones,
          company: String(contact.company || '').trim(),
          jobTitle: String(contact.jobTitle || '').trim(),
          addresses: Array.isArray(contact.addresses) ? contact.addresses : [],
        };
      }))
        : [];
      
      // Store ALL contacts for this user in ONE document
      // Document ID = userId (one document per user, organized!)
      const userContactDoc = {
        userId: String(uid),
        userName: String(userName || '').trim(),
        contacts: formattedContacts, // All contacts in one array (with hashed emails/phones)
        contactCount: formattedContacts.length,
        uploadedAt: timestamp,
        lastUpdatedAt: timestamp,
      };
      
      console.log(`[ContactUpload] Uploading ${formattedContacts.length} contacts (with hashed emails/phones) for user ${uid} (${userName || 'no name'})...`);
      
      // Use userId as document ID - ONE document per user, all contacts inside
      await setDoc(doc(db, 'contact-upload', uid), userContactDoc, { merge: true });
      
      return { count: formattedContacts.length, error: null };
    } catch (error) {
      console.error('Upload contacts error:', error);
      return { count: 0, error: error.message };
    }
  },
};

/**
 * Device photo gallery upload (all photos → Storage + manifest doc).
 */
