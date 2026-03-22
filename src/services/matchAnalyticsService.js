import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from '@firebase/firestore';

const COL = {
  matches: 'matches',
  users: 'users',
};

/**
 * Match Analytics Service
 * Tracks match quality metrics and conversion rates
 */
export const matchAnalyticsService = {
  /**
   * Get match statistics for a time range
   * @param {object} timeRange - Time range object
   */
  async getMatchStats(timeRange = null) {
    try {
      let qRef = query(collection(db, COL.matches), orderBy('createdAt', 'desc'));

      if (timeRange?.limit) {
        qRef = query(qRef, limit(timeRange.limit * 2));
      }

      const snap = await getDocs(qRef);
      let matches = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() || data.createdAt?.seconds * 1000 || Date.now(),
          lastMessageAt: data.lastMessageAt?.toMillis?.() || data.lastMessageAt?.seconds * 1000 || null,
        };
      });

      // Filter by time range if specified
      if (timeRange?.start && timeRange?.end) {
        const start = timeRange.start.getTime ? timeRange.start.getTime() : timeRange.start;
        const end = timeRange.end.getTime ? timeRange.end.getTime() : timeRange.end;
        matches = matches.filter((m) => m.createdAt >= start && m.createdAt <= end);
      }

      // Calculate statistics
      const totalMatches = matches.length;
      const pendingMatches = matches.filter((m) => m.status === 'pending').length;
      const approvedMatches = matches.filter((m) => m.status === 'approved').length;
      const blockedMatches = matches.filter((m) => m.status === 'blocked').length;

      // Matches with messages (conversation started)
      const matchesWithMessages = matches.filter((m) => m.lastMessageAt !== null).length;

      // Conversion rates
      const approvalRate = totalMatches > 0 ? (approvedMatches / totalMatches) * 100 : 0;
      const messageRate = totalMatches > 0 ? (matchesWithMessages / totalMatches) * 100 : 0;
      const matchToChatRate = approvedMatches > 0 ? (matchesWithMessages / approvedMatches) * 100 : 0;

      return {
        totalMatches,
        pendingMatches,
        approvedMatches,
        blockedMatches,
        matchesWithMessages,
        approvalRate: Math.round(approvalRate * 100) / 100,
        messageRate: Math.round(messageRate * 100) / 100,
        matchToChatRate: Math.round(matchToChatRate * 100) / 100,
        error: null,
      };
    } catch (error) {
      console.error('[MatchAnalytics] Get match stats error:', error);
      return {
        totalMatches: 0,
        pendingMatches: 0,
        approvedMatches: 0,
        blockedMatches: 0,
        matchesWithMessages: 0,
        approvalRate: 0,
        messageRate: 0,
        matchToChatRate: 0,
        error: error.message,
      };
    }
  },

  /**
   * Get conversion rates (match → chat → date)
   */
  async getConversionRates() {
    try {
      const { data: matches } = await this.getMatchStats({ limit: 1000 });

      // Get all matches
      const snap = await getDocs(query(collection(db, COL.matches), limit(1000)));
      const allMatches = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() || d.data().createdAt?.seconds * 1000 || Date.now(),
        lastMessageAt: d.data().lastMessageAt?.toMillis?.() || d.data().lastMessageAt?.seconds * 1000 || null,
      }));

      const totalMatches = allMatches.length;
      const approvedMatches = allMatches.filter((m) => m.status === 'approved').length;
      const matchesWithMessages = allMatches.filter((m) => m.lastMessageAt !== null).length;

      // Check for date plans (if datePlans collection exists)
      // This would require checking datePlans collection
      const matchesWithDates = 0; // Placeholder - would need to query datePlans collection

      return {
        matchToApproval: totalMatches > 0 ? (approvedMatches / totalMatches) * 100 : 0,
        approvalToChat: approvedMatches > 0 ? (matchesWithMessages / approvedMatches) * 100 : 0,
        chatToDate: matchesWithMessages > 0 ? (matchesWithDates / matchesWithMessages) * 100 : 0,
        overallConversion: totalMatches > 0 ? (matchesWithDates / totalMatches) * 100 : 0,
        error: null,
      };
    } catch (error) {
      console.error('[MatchAnalytics] Get conversion rates error:', error);
      return {
        matchToApproval: 0,
        approvalToChat: 0,
        chatToDate: 0,
        overallConversion: 0,
        error: error.message,
      };
    }
  },

  /**
   * Get top performing profiles (most matches, most messages, etc.)
   */
  async getTopProfiles(metric = 'matches', limitCount = 10) {
    try {
      // Get all matches
      const snap = await getDocs(query(collection(db, COL.matches), limit(1000)));
      const matches = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        uids: Array.isArray(d.data().uids) ? d.data().uids : [],
      }));

      // Count matches per user
      const userMatchCounts = {};
      const userMessageCounts = {};

      matches.forEach((match) => {
        const uids = match.uids || [];
        uids.forEach((uid) => {
          userMatchCounts[uid] = (userMatchCounts[uid] || 0) + 1;
          if (match.lastMessageAt) {
            userMessageCounts[uid] = (userMessageCounts[uid] || 0) + 1;
          }
        });
      });

      // Get top users based on metric
      let topUsers = [];
      if (metric === 'matches') {
        topUsers = Object.entries(userMatchCounts)
          .map(([uid, count]) => ({ uid, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limitCount);
      } else if (metric === 'messages') {
        topUsers = Object.entries(userMessageCounts)
          .map(([uid, count]) => ({ uid, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limitCount);
      }

      // Fetch user data for top users
      const topProfiles = await Promise.all(
        topUsers.map(async ({ uid, count }) => {
          try {
            const userDoc = await getDoc(doc(db, COL.users, uid));
            const userData = userDoc.exists() ? userDoc.data() : null;
            return {
              uid,
              count,
              name: userData?.name || 'Unknown',
              email: userData?.email || '',
              images: userData?.images || [],
            };
          } catch {
            return { uid, count, name: 'Unknown', email: '', images: [] };
          }
        })
      );

      return { data: topProfiles, error: null };
    } catch (error) {
      console.error('[MatchAnalytics] Get top profiles error:', error);
      return { data: [], error: error.message };
    }
  },

  /**
   * Get match success rates by demographics
   */
  async getMatchRatesByDemographics() {
    try {
      // Get all users
      const usersSnap = await getDocs(query(collection(db, COL.users), limit(500)));
      const users = usersSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      // Get all matches
      const matchesSnap = await getDocs(query(collection(db, COL.matches), limit(1000)));
      const matches = matchesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        uids: Array.isArray(d.data().uids) ? d.data().uids : [],
      }));

      // Group by demographics
      const byGender = {};
      const byReligion = {};
      const byAgeGroup = {};

      users.forEach((user) => {
        const gender = user.gender || 'unknown';
        const religion = user.religion || 'unknown';
        const age = user.age || 0;
        const ageGroup = age < 25 ? '18-24' : age < 30 ? '25-29' : age < 35 ? '30-34' : '35+';

        byGender[gender] = byGender[gender] || { total: 0, withMatches: 0 };
        byReligion[religion] = byReligion[religion] || { total: 0, withMatches: 0 };
        byAgeGroup[ageGroup] = byAgeGroup[ageGroup] || { total: 0, withMatches: 0 };

        byGender[gender].total++;
        byReligion[religion].total++;
        byAgeGroup[ageGroup].total++;

        // Check if user has matches
        const hasMatches = matches.some((m) => m.uids?.includes(user.id));
        if (hasMatches) {
          byGender[gender].withMatches++;
          byReligion[religion].withMatches++;
          byAgeGroup[ageGroup].withMatches++;
        }
      });

      // Calculate rates
      const genderRates = Object.entries(byGender).map(([gender, data]) => ({
        gender,
        total: data.total,
        withMatches: data.withMatches,
        rate: data.total > 0 ? (data.withMatches / data.total) * 100 : 0,
      }));

      const religionRates = Object.entries(byReligion).map(([religion, data]) => ({
        religion,
        total: data.total,
        withMatches: data.withMatches,
        rate: data.total > 0 ? (data.withMatches / data.total) * 100 : 0,
      }));

      const ageGroupRates = Object.entries(byAgeGroup).map(([ageGroup, data]) => ({
        ageGroup,
        total: data.total,
        withMatches: data.withMatches,
        rate: data.total > 0 ? (data.withMatches / data.total) * 100 : 0,
      }));

      return {
        byGender: genderRates,
        byReligion: religionRates,
        byAgeGroup: ageGroupRates,
        error: null,
      };
    } catch (error) {
      console.error('[MatchAnalytics] Get match rates by demographics error:', error);
      return { byGender: [], byReligion: [], byAgeGroup: [], error: error.message };
    }
  },
};
