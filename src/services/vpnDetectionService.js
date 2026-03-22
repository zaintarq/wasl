import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { detectCountryCity } from './locationService.native';

const COL = {
  vpnTracking: 'vpnTracking',
  activityFlags: 'activityFlags',
};

// IP Geolocation API - using free tier
const IP_GEOLOCATION_API = 'https://ipapi.co/json/'; // Free tier: 1000 requests/day
// Alternative: 'https://ip-api.com/json/' (Free tier: 45 requests/minute)

/**
 * VPN Detection Service
 * Silently tracks IP addresses and detects VPN usage by comparing IP geolocation with GPS location
 */
export const vpnDetectionService = {
  /**
   * Get current IP address
   * Uses external API to get user's IP
   */
  async getCurrentIpAddress() {
    try {
      const response = await fetch(IP_GEOLOCATION_API);
      const data = await response.json();
      return {
        ipAddress: data.ip || null,
        country: data.country_name || data.country || '',
        city: data.city || '',
        region: data.region || '',
        error: null,
      };
    } catch (error) {
      console.warn('[VpnDetection] Get IP address error:', error);
      return { ipAddress: null, country: '', city: '', region: '', error: error.message };
    }
  },

  /**
   * Get location from IP address
   * @param {string} ipAddress - IP address
   */
  async getLocationFromIp(ipAddress) {
    try {
      if (!ipAddress) {
        const ipData = await this.getCurrentIpAddress();
        return {
          country: ipData.country,
          city: ipData.city,
          region: ipData.region,
          ipAddress: ipData.ipAddress,
          error: null,
        };
      }

      // Use IP geolocation API
      const response = await fetch(`https://ipapi.co/${ipAddress}/json/`);
      const data = await response.json();
      
      return {
        country: data.country_name || data.country || '',
        city: data.city || '',
        region: data.region || '',
        ipAddress: ipAddress,
        error: null,
      };
    } catch (error) {
      console.warn('[VpnDetection] Get location from IP error:', error);
      return { country: '', city: '', region: '', ipAddress: null, error: error.message };
    }
  },

  /**
   * Track IP address and detect VPN (SIMPLIFIED VERSION)
   * - First time: Get GPS location once and save it as baseline
   * - Every check: Only get IP location and compare with saved GPS location
   * @param {string} userId - User ID
   * @param {string} activity - What user was doing (e.g., 'login', 'message_sent', 'location_update')
   */
  async trackIpAndDetectVpn(userId, activity = 'unknown') {
    try {
      // First check if userId is valid (user must be logged in)
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        return { vpnDetected: false, error: null, message: 'Skipped - no user ID' };
      }
      
      // Check if user is authenticated via Firebase Auth
      // Import auth from firebase service
      const { auth } = await import('./firebase');
      if (!auth || !auth.currentUser || auth.currentUser.uid !== userId) {
        return { vpnDetected: false, error: null, message: 'Skipped - user not authenticated' };
      }
      
      // Skip VPN tracking for admin/staff users (graceful check - don't fail if permission denied)
      // Check admin collection (not users collection) for role
      try {
        const { checkUserRoleFromAdminCollection } = await import('./firebaseService');
        const roleCheck = await checkUserRoleFromAdminCollection(userId);
        if (roleCheck.isAdmin || roleCheck.isStaff) {
          return { vpnDetected: false, error: null }; // Skip silently
        }
      } catch (error) {
        // If we can't check role (permission error), skip VPN tracking
        // Don't proceed if we can't verify user role
        return { vpnDetected: false, error: null, message: 'Skipped - cannot verify user role' };
      }

      // Get user's tracking document (graceful - don't fail if permission denied)
      let trackingData = null;
      let savedGpsLocation = null;
      
      try {
        const trackingRef = doc(db, COL.vpnTracking, String(userId));
        const trackingDoc = await getDoc(trackingRef);
        trackingData = trackingDoc.exists() ? trackingDoc.data() : null;
        savedGpsLocation = trackingData?.normalLocation || null;
      } catch (error) {
        // If we can't read tracking document (permission error), skip VPN tracking
        console.log('[VpnDetection] Cannot access tracking document (permission denied), skipping VPN tracking:', error.message);
        return { vpnDetected: false, error: null, message: 'Skipped - permission denied' };
      }

      // STEP 1: If no saved GPS location, get it ONCE and save it
      if (!savedGpsLocation) {
        console.log('[VpnDetection] First time - getting GPS location to save as baseline...');
        
        // Get GPS location (request permission if needed)
        const gpsLocation = await detectCountryCity({ requestPermission: true });
        const gpsLoc = {
          country: gpsLocation.country || '',
          city: gpsLocation.city || '',
        };

        // If we got GPS location, save it as baseline
        if (gpsLoc.country) {
          const baselineData = {
            userId: String(userId),
            normalLocation: {
              country: gpsLoc.country,
              city: gpsLoc.city,
              savedAt: Date.now(),
              savedBy: 'gps',
            },
            lastChecked: serverTimestamp(),
            vpnLocations: [],
            vpnChangeCount: 0,
            flagged: false,
          };

          try {
            const trackingRef = doc(db, COL.vpnTracking, String(userId));
            await setDoc(trackingRef, baselineData, { merge: true });
            console.log('[VpnDetection] ✅ Saved GPS location as baseline:', gpsLoc);
          } catch (error) {
            console.log('[VpnDetection] Could not save baseline (permission denied):', error.message);
            return { vpnDetected: false, error: null, message: 'Skipped - cannot save baseline' };
          }
          
          // Return early - no VPN check needed on first time
          return { vpnDetected: false, error: null, message: 'Baseline location saved' };
        } else {
          // If GPS failed, use IP location as fallback (less accurate but better than nothing)
          console.log('[VpnDetection] GPS failed, using IP location as baseline...');
          const ipData = await this.getCurrentIpAddress();
          if (ipData.ipAddress && ipData.country) {
            const baselineData = {
              userId: String(userId),
              normalLocation: {
                country: ipData.country,
                city: ipData.city || '',
                savedAt: Date.now(),
                savedBy: 'ip_fallback',
              },
              lastChecked: serverTimestamp(),
              lastIpAddress: ipData.ipAddress,
              vpnLocations: [],
              vpnChangeCount: 0,
              flagged: false,
            };

            try {
              const trackingRef = doc(db, COL.vpnTracking, String(userId));
              await setDoc(trackingRef, baselineData, { merge: true });
              console.log('[VpnDetection] ✅ Saved IP location as baseline (GPS unavailable):', ipData.country);
            } catch (error) {
              console.log('[VpnDetection] Could not save baseline (permission denied):', error.message);
              return { vpnDetected: false, error: null, message: 'Skipped - cannot save baseline' };
            }
            return { vpnDetected: false, error: null, message: 'Baseline location saved (IP fallback)' };
          }
        }
      }

      // STEP 2: We have saved GPS location - just check IP and compare
      console.log('[VpnDetection] Checking IP against saved GPS location...');
      
      // Get current IP address and location (lightweight, no GPS)
      const ipData = await this.getCurrentIpAddress();
      if (!ipData.ipAddress || !ipData.country) {
        console.warn('[VpnDetection] Could not get IP address');
        return { vpnDetected: false, error: 'Could not get IP address' };
      }

      const ipLocation = {
        country: ipData.country,
        city: ipData.city || '',
      };

      // Compare IP location with saved GPS location
      const countryMatch = ipLocation.country === savedGpsLocation.country;
      const cityMatch = ipLocation.city && savedGpsLocation.city 
        ? ipLocation.city === savedGpsLocation.city 
        : true; // If city not available, don't fail on city mismatch

      const vpnDetected = !countryMatch; // VPN if countries don't match

      // Update tracking document
      const updateData = {
        userId: String(userId),
        lastChecked: serverTimestamp(),
        lastIpAddress: ipData.ipAddress,
        lastIpLocation: ipLocation,
      };

      // If VPN detected, track it
      if (vpnDetected) {
        const vpnEntry = {
          ipAddress: ipData.ipAddress,
          ipLocation: ipLocation,
          savedGpsLocation: savedGpsLocation,
          timestamp: Date.now(),
          activity: String(activity),
          vpnChangeNumber: (trackingData?.vpnChangeCount || 0) + 1,
          isVpn: true,
        };

        updateData.vpnLocations = arrayUnion(vpnEntry);
        updateData.vpnChangeCount = (trackingData?.vpnChangeCount || 0) + 1;

        console.log('[VpnDetection] ⚠️ VPN detected! IP:', ipLocation.country, 'vs GPS:', savedGpsLocation.country);

        // Auto-flag if multiple VPN changes
        if (updateData.vpnChangeCount >= 3 && !trackingData?.flagged) {
          updateData.flagged = true;
          updateData.flaggedAt = serverTimestamp();
          updateData.flaggedReason = 'multiple_vpn_changes';

          // Create activity flag (non-blocking, don't fail if permission denied)
          this.flagVpnUser(userId, vpnEntry, 'multiple_vpn_changes').catch((err) => {
            console.log('[VpnDetection] Flag user error (non-blocking):', err.message);
          });
        }
      } else {
        console.log('[VpnDetection] ✅ No VPN - IP matches saved GPS location');
      }

      try {
        const trackingRef = doc(db, COL.vpnTracking, String(userId));
        await setDoc(trackingRef, updateData, { merge: true });
      } catch (error) {
        // If we can't write (permission denied), just log and return
        console.log('[VpnDetection] Could not update tracking (permission denied):', error.message);
        return { vpnDetected: false, error: null, message: 'Skipped - permission denied' };
      }

      return {
        vpnDetected,
        ipLocation,
        savedGpsLocation,
        vpnChangeCount: updateData.vpnChangeCount || 0,
        error: null,
      };
    } catch (error) {
      console.error('[VpnDetection] Track IP and detect VPN error:', error);
      return { vpnDetected: false, error: error.message };
    }
  },

  /**
   * Get VPN tracking history for a user
   * @param {string} userId - User ID
   */
  async getVpnHistory(userId) {
    try {
      const trackingRef = doc(db, COL.vpnTracking, String(userId));
      const trackingDoc = await getDoc(trackingRef);

      if (!trackingDoc.exists()) {
        return { data: null, error: null };
      }

      const data = trackingDoc.data();
      return {
        data: {
          ...data,
          vpnLocations: Array.isArray(data.vpnLocations) ? data.vpnLocations : [],
          vpnChangeCount: data.vpnChangeCount || 0,
        },
        error: null,
      };
    } catch (error) {
      console.error('[VpnDetection] Get VPN history error:', error);
      return { data: null, error: error.message };
    }
  },

  /**
   * Get initial/normal location for a user
   * @param {string} userId - User ID
   */
  async getInitialLocation(userId) {
    try {
      const { data } = await this.getVpnHistory(userId);
      return {
        initialLocation: data?.initialLocation || null,
        normalLocation: data?.normalLocation || null,
        error: null,
      };
    } catch (error) {
      return { initialLocation: null, normalLocation: null, error: error.message };
    }
  },

  /**
   * Flag a user for VPN usage
   * @param {string} userId - User ID
   * @param {object} vpnLocation - VPN location entry
   * @param {string} reason - Reason for flagging
   */
  async flagVpnUser(userId, vpnLocation, reason) {
    try {
      const flagRef = doc(db, COL.activityFlags, `vpn_${userId}_${Date.now()}`);
      await setDoc(flagRef, {
        userId: String(userId),
        flagType: 'vpn_usage',
        reason: String(reason),
        vpnLocation: vpnLocation,
        severity: 'medium',
        flaggedAt: serverTimestamp(),
        status: 'open',
      });

      return { flagId: flagRef.id, error: null };
    } catch (error) {
      console.error('[VpnDetection] Flag VPN user error:', error);
      return { flagId: null, error: error.message };
    }
  },

  /**
   * Get all users with VPN usage (for admin)
   * @param {object} filters - Filter options
   */
  async getVpnUsers(filters = {}) {
    try {
      let qRef = query(collection(db, COL.vpnTracking), orderBy('lastChecked', 'desc'));

      if (filters.flagged !== undefined) {
        qRef = query(qRef, where('flagged', '==', !!filters.flagged));
      }

      if (filters.limit) {
        qRef = query(qRef, limit(filters.limit));
      }

      const snap = await getDocs(qRef);
      let users = snap.docs.map((d) => ({
        userId: d.id,
        ...d.data(),
        lastChecked: d.data().lastChecked?.toMillis?.() || d.data().lastChecked?.seconds * 1000 || Date.now(),
      }));

      // Client-side filtering for minimum VPN changes
      if (filters.minVpnChanges) {
        users = users.filter((u) => (u.vpnChangeCount || 0) >= filters.minVpnChanges);
      }

      // Sort by VPN change count if needed
      if (filters.sortBy === 'vpnCount') {
        users.sort((a, b) => (b.vpnChangeCount || 0) - (a.vpnChangeCount || 0));
      }

      return { data: users, error: null };
    } catch (error) {
      console.error('[VpnDetection] Get VPN users error:', error);
      return { data: [], error: error.message };
    }
  },
};
