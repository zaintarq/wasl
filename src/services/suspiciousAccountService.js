import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';

const COL = {
  users: 'users',
  suspiciousAccounts: 'suspiciousAccounts',
  userActivity: 'userActivity',
};

/**
 * Suspicious Account Detection Service
 * Detects fake profiles, bots, and spam patterns
 */
export const suspiciousAccountService = {
  /**
   * Detect suspicious account patterns
   * @param {string} userId - User ID
   */
  async detectSuspiciousAccount(userId) {
    try {
      const userDoc = await getDoc(doc(db, COL.users, String(userId)));
      if (!userDoc.exists()) {
        return { suspicious: false, reasons: [], score: 0 };
      }

      const userData = userDoc.data();
      const reasons = [];
      let score = 0;

      // Check 1: No photos or generic photos
      const images = Array.isArray(userData.images) ? userData.images : [];
      if (images.length === 0) {
        reasons.push('no_photos');
        score += 30;
      } else if (images.length === 1) {
        reasons.push('single_photo');
        score += 10;
      }

      // Check 2: Generic/empty bio
      const bio = String(userData.bio || '').trim();
      if (!bio || bio.length < 10) {
        reasons.push('empty_bio');
        score += 20;
      } else if (bio.length < 30) {
        reasons.push('short_bio');
        score += 10;
      }

      // Check 3: Generic name
      const name = String(userData.name || '').trim();
      if (!name || name.length < 2) {
        reasons.push('invalid_name');
        score += 15;
      }

      // Check 4: Rapid signup-to-action pattern
      const createdAt = userData.createdAt?.toMillis?.() || userData.createdAt?.seconds * 1000 || Date.now();
      const now = Date.now();
      const accountAge = now - createdAt;
      const accountAgeMinutes = accountAge / (1000 * 60);

      // Check if user started swiping/messaging very quickly after signup
      // This would require checking activity, but for now we'll use a simple heuristic
      if (accountAgeMinutes < 5) {
        reasons.push('rapid_signup');
        score += 15;
      }

      // Check 5: Suspicious activity patterns
      // (This would require activity service integration)
      // For now, we'll check basic profile completeness
      const profileComplete = userData.profileComplete || false;
      if (!profileComplete && accountAgeMinutes > 60) {
        reasons.push('incomplete_profile');
        score += 10;
      }

      // Check 6: No interests selected
      const interests = Array.isArray(userData.interests) ? userData.interests : [];
      if (interests.length === 0) {
        reasons.push('no_interests');
        score += 10;
      }

      // Check 7: Suspicious email pattern (optional)
      const email = String(userData.email || '');
      if (email) {
        const suspiciousEmailPatterns = [
          /^test\d+@/i,
          /^user\d+@/i,
          /^fake\d+@/i,
          /@tempmail/i,
          /@10minutemail/i,
        ];
        if (suspiciousEmailPatterns.some((pattern) => pattern.test(email))) {
          reasons.push('suspicious_email');
          score += 20;
        }
      }

      // Determine if suspicious (threshold: 40 points)
      const suspicious = score >= 40;

      if (suspicious) {
        // Create or update suspicious account record
        const suspiciousRef = doc(db, COL.suspiciousAccounts, String(userId));
        const existingDoc = await getDoc(suspiciousRef);

        if (!existingDoc.exists()) {
          await setDoc(suspiciousRef, {
            userId: String(userId),
            reasons: reasons,
            score: score,
            detectedAt: serverTimestamp(),
            status: 'open',
            reviewed: false,
          });
        } else {
          await updateDoc(suspiciousRef, {
            reasons: reasons,
            score: score,
            lastDetectedAt: serverTimestamp(),
          });
        }
      }

      return { suspicious, reasons, score, error: null };
    } catch (error) {
      console.error('[SuspiciousAccount] Detect suspicious account error:', error);
      return { suspicious: false, reasons: [], score: 0, error: error.message };
    }
  },

  /**
   * Get all suspicious accounts
   * @param {object} filters - Filter options
   */
  async getSuspiciousAccounts(filters = {}) {
    try {
      let qRef = query(collection(db, COL.suspiciousAccounts), orderBy('detectedAt', 'desc'));

      if (filters.status) {
        qRef = query(qRef, where('status', '==', String(filters.status)));
      }

      if (filters.reviewed !== undefined) {
        qRef = query(qRef, where('reviewed', '==', !!filters.reviewed));
      }

      if (filters.minScore) {
        // Client-side filter for score
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit));
      }

      const snap = await getDocs(qRef);
      let accounts = snap.docs.map((d) => ({
        id: d.id,
        userId: d.id,
        ...d.data(),
        detectedAt: d.data().detectedAt?.toMillis?.() || d.data().detectedAt?.seconds * 1000 || Date.now(),
      }));

      // Client-side filtering for score
      if (filters.minScore) {
        accounts = accounts.filter((a) => (a.score || 0) >= filters.minScore);
      }

      // Fetch user data for each suspicious account (directly, avoiding circular dependency)
      const accountsWithUserData = await Promise.all(
        accounts.map(async (account) => {
          try {
            const userDoc = await getDoc(doc(db, COL.users, String(account.userId)));
            return {
              ...account,
              userData: userDoc.exists() ? userDoc.data() : null,
            };
          } catch {
            return { ...account, userData: null };
          }
        })
      );

      return { data: accountsWithUserData, error: null };
    } catch (error) {
      console.error('[SuspiciousAccount] Get suspicious accounts error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Mark account as reviewed
   * @param {string} userId - User ID
   * @param {string} decision - Decision ('approved', 'banned', 'flagged')
   * @param {string} notes - Admin notes
   */
  async markAsReviewed(userId, decision, notes = '') {
    try {
      const suspiciousRef = doc(db, COL.suspiciousAccounts, String(userId));
      const existingDoc = await getDoc(suspiciousRef);

      if (!existingDoc.exists()) {
        return { error: 'Suspicious account record not found' };
      }

      await updateDoc(suspiciousRef, {
        reviewed: true,
        reviewedAt: serverTimestamp(),
        decision: String(decision),
        notes: String(notes),
        status: decision === 'approved' ? 'resolved' : 'open',
      });

      return { error: null };
    } catch (error) {
      console.error('[SuspiciousAccount] Mark as reviewed error:', error);
      return { error: error.message };
    }
  },

  /**
   * Run detection on all users (batch operation for admin)
   * @param {number} limitCount - Number of users to check
   */
  async detectAllUsers(limitCount = 100) {
    try {
      const usersRef = query(collection(db, COL.users), limit(limitCount));
      const snap = await getDocs(usersRef);

      const results = [];
      for (const userDoc of snap.docs) {
        const userId = userDoc.id;
        const result = await this.detectSuspiciousAccount(userId);
        results.push({ userId, ...result });
      }

      return { results, error: null };
    } catch (error) {
      console.error('[SuspiciousAccount] Detect all users error:', error);
      return { results: [], error: error.message };
    }
  },
};
