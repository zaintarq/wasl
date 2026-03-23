import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Dimensions, Animated as RNAnimated } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { authService, blockService, contactBlockService, likeService, userService, matchService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../ui/tokens';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { Routes } from '../navigation/routes';
import { loadLocalFilters } from '../../utils/localFilterStorage';
import { SwipeDeck } from './SwipeDeck.native';
import { FadeInImage } from '../../ui/components/FadeInImage.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Settings, SlidersHorizontal, UserRound } from 'lucide-react-native';

// Suppress Reanimated strict mode warning
if (__DEV__) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const message = args[0]?.toString() || '';
    if (message.includes('Reanimated') && message.includes('Reading from `value`')) {
      return; // Suppress this warning
    }
    originalWarn(...args);
  };
}
import * as Haptics from 'expo-haptics';

const { height: SCREEN_H } = Dimensions.get('window');
const CARD_MAX_W = 440;
const HEADER_FALLBACK_H = 74; // header + border/shadow
const BOTTOM_NAV_FALLBACK_H = 112; // nav buttons + padding

export function HomeScreen({ onNavigate }) {
  const navigation = useNavigation();
  // UI testing mode: show mock cards even if Firebase/Firestore is offline.
  // Flip to false when you're ready to test real matchmaking.
  const USE_MOCK_DATA = false;

  const insets = useSafeAreaInsets();
  const bottomNavPad = Math.max(10, insets.bottom);
  const [headerH, setHeaderH] = useState(0);
  const [bottomNavH, setBottomNavH] = useState(0);

  // Max-tall card: fill as much as possible between header and pinned bottom nav.
  const cardHeight = useMemo(() => {
    const header = headerH || HEADER_FALLBACK_H;
    const nav = bottomNavH || (BOTTOM_NAV_FALLBACK_H + bottomNavPad);
    const avail = SCREEN_H - insets.top - header - nav - 6; // tiny gutter
    return Math.round(Math.min(860, Math.max(560, avail)));
  }, [bottomNavH, bottomNavPad, headerH, insets.top]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [matchCountry, setMatchCountry] = useState('');
  const [matchIntent, setMatchIntent] = useState('');
  const [todayStatus, setTodayStatus] = useState('');
  const [wingmanCode, setWingmanCode] = useState('');
  const [wingmanRoom, setWingmanRoom] = useState(null);
  
  // Pending match requests (real-time)
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingRequestUsers, setPendingRequestUsers] = useState({}); // Map of userId -> user profile

  // Hot Seat (same-device, take turns swiping)
  const [hotSeatEnabled, setHotSeatEnabled] = useState(false);
  const [hotSeatP1, setHotSeatP1] = useState('You');
  const [hotSeatP2, setHotSeatP2] = useState('Friend');
  const [hotSeatTurn, setHotSeatTurn] = useState(0); // 0 or 1
  const [handoffOpen, setHandoffOpen] = useState(false);

  // Tonight Mode: "Free tonight" + same city, active until 2am
  const [tonightMode, setTonightMode] = useState(false);

  // Shared gesture values so the action buttons can animate live while dragging.
  const gestureX = useSharedValue(0);
  const gestureY = useSharedValue(0);
  
  // Cute in-app alerts (matching LIKE/NOPE design)
  const [cuteAlert, setCuteAlert] = useState(null); // { type: 'success'|'error'|'match'|'info', message: string, subMessage?: string }
  const cuteAlertAnim = React.useRef(new RNAnimated.Value(0)).current;
  
  const showCuteAlert = (type, message, subMessage = null) => {
    setCuteAlert({ type, message, subMessage });
    RNAnimated.sequence([
      RNAnimated.timing(cuteAlertAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      RNAnimated.delay(type === 'match' ? 2500 : 1800),
      RNAnimated.timing(cuteAlertAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCuteAlert(null);
      cuteAlertAnim.setValue(0);
    });
  };

  // Swipe feedback badge (same look as card corner LIKE/NOPE) – brief, non‑persistent
  const [swipeToast, setSwipeToast] = useState(null); // 'like' | 'nope' | null
  const swipeToastAnim = React.useRef(new RNAnimated.Value(0)).current;
  const showSwipeToast = (type) => {
    setSwipeToast(type);
    swipeToastAnim.setValue(0);
    RNAnimated.sequence([
      RNAnimated.timing(swipeToastAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      RNAnimated.delay(1000),
      RNAnimated.timing(swipeToastAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSwipeToast(null);
      swipeToastAnim.setValue(0);
    });
  };

  // Success message popup (legacy - now using cuteAlert)
  const [showSuccess, setShowSuccess] = useState(false);
  const successAnim = React.useRef(new RNAnimated.Value(0)).current;

  // Combine pending requests with regular candidates, showing pending requests first
  const allCandidates = useMemo(() => {
    const pending = pendingRequests.map(req => {
      const requesterUid = String(req.requestedBy || '');
      const user = pendingRequestUsers[requesterUid];
      if (!user) return null;
      return {
        ...user,
        _isPendingRequest: true,
        _matchId: req.id,
        _requestId: req.id,
      };
    }).filter(Boolean);
    
    // Regular candidates (exclude users who have pending requests)
    const pendingUids = new Set(pendingRequests.map(req => String(req.requestedBy || '')));
    const regular = candidates.filter(c => !pendingUids.has(String(c.id || '')));
    
    return [...pending, ...regular];
  }, [pendingRequests, pendingRequestUsers, candidates]);

  // Defensive check for currentUser - validate array bounds
  const currentUser = useMemo(() => {
    if (!Array.isArray(allCandidates) || allCandidates.length === 0) {
      console.warn('[HomeScreen] allCandidates is empty or not an array:', {
        isArray: Array.isArray(allCandidates),
        length: allCandidates?.length || 0,
        currentIndex
      });
      return null;
    }
    if (currentIndex < 0 || currentIndex >= allCandidates.length) {
      console.warn('[HomeScreen] currentIndex out of bounds:', {
        currentIndex,
        arrayLength: allCandidates.length
      });
      return null;
    }
    return allCandidates[currentIndex] || null;
  }, [allCandidates, currentIndex]);

  const myCountry = useMemo(() => {
    return String(me?.country || me?.countryOfResidence || '').trim();
  }, [me]);

  const myCity = useMemo(() => {
    const c = String(me?.city || '').trim();
    if (c) return c;
    const loc = String(me?.location || '').trim();
    if (!loc) return '';
    // "City, Country"
    return String(loc.split(',')[0] || '').trim();
  }, [me]);

  const isTonightWindow = useMemo(() => {
    const d = new Date();
    const h = d.getHours();
    // Active 21:00 -> 02:00 (wrap)
    return h >= 21 || h < 2;
  }, []);

  // Auto-disable Tonight Mode after 2am.
  useEffect(() => {
    if (!tonightMode) return;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(2, 0, 0, 0);
    if (now.getHours() >= 2) {
      setTonightMode(false);
      return;
    }
    const ms = cutoff.getTime() - now.getTime();
    const t = setTimeout(() => setTonightMode(false), Math.max(500, ms));
    return () => clearTimeout(t);
  }, [tonightMode]);

  const isStatusActive = (u) => {
    const status = String(u?.todayStatus || '').trim();
    if (!status) return false;
    const exp = u?.todayStatusExpiresAt;
    let ms = null;
    if (typeof exp === 'number') ms = exp;
    else if (exp?.toMillis) ms = exp.toMillis();
    else if (exp instanceof Date) ms = exp.getTime();
    if (!ms) return true; // no expiry stored => treat as active
    return Date.now() < ms;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        if (USE_MOCK_DATA) {
          if (!cancelled) {
            setMe({
              country: 'United States',
              countryOfResidence: 'United States',
              matchCountry: 'United States',
              todayStatus: '',
              todayStatusExpiresAt: null,
            });
            // Mock data removed - using real profiles only
            setCandidates([]);
            setCurrentIndex(0);
            setMatchCountry('United States');
            setMatchIntent('');
            setTodayStatus('');
          }
          return;
        }

        const authUser = authService.getCurrentUser();
        if (!authUser) {
          onNavigate('onboarding', { mode: 'login' });
          return;
        }

        // Check role from admin collection FIRST
        const roleCheck = await checkUserRoleFromAdminCollection(authUser.uid);
        if (roleCheck.isAdmin) {
          console.log('[HomeScreen] Admin detected, redirecting to admin screen');
          if (!cancelled) onNavigate('admin');
          return;
        } else if (roleCheck.isStaff) {
          console.log('[HomeScreen] Staff detected, redirecting to staff screen');
          if (!cancelled) onNavigate('staff');
          return;
        }
        
        const meSnap = await userService.getUserById(authUser.uid);
        const meProfile = meSnap?.data || null;
        
        // Check if wali (still in users collection)
        const waliRole = String(meProfile?.role || '').toLowerCase().trim();
        if (waliRole === 'wali') {
          console.log('[HomeScreen] Wali detected, redirecting to wali screen');
          if (!cancelled) onNavigate('wali');
          return;
        }
        
        if (!cancelled) setMe(meProfile);
        // Don't auto-set matchCountry from profile - keep it global by default
        // Users can manually set country filter in the filters menu if they want
        // if (!cancelled && !matchCountry) {
        //   setMatchCountry(String(meProfile?.matchCountry || meProfile?.country || meProfile?.countryOfResidence || '').trim());
        // }
        if (!cancelled && !matchIntent) {
          setMatchIntent(String(meProfile?.matchIntent || '').trim());
        }
        if (!cancelled && !todayStatus) {
          const s = String(meProfile?.todayStatus || '').trim();
          const active = s && isStatusActive(meProfile);
          setTodayStatus(active ? s : '');
          // If expired, clear in DB best-effort
          if (s && !active) {
            userService.updateUser(authUser.uid, { todayStatus: '', todayStatusExpiresAt: null }).catch(() => {});
          }
        }

        const { data: blockedSet } = await blockService.listBlockedUids(authUser.uid);
        const { data: contactHashes } = await contactBlockService.listHashes(authUser.uid);
        
        // Get users we've already swiped on (likes or passes) - don't show them again (use doc id as fallback)
        const { data: likesSent } = await likeService.listLikesSent(authUser.uid);
        const alreadySwipedUids = new Set(
          (likesSent || []).map((like) => String(like?.toUid || like?.id || '')).filter(Boolean)
        );
        // Also exclude everyone we're already matched with (pending or active) so they don't appear in the deck
        const { data: myMatches } = await matchService.listMyMatches(authUser.uid);
        (myMatches || []).forEach((m) => {
          const uids = m?.uids || [];
          const other = uids.find((u) => String(u) !== String(authUser.uid));
          if (other) alreadySwipedUids.add(String(other));
          if (!other && (m?.requestedBy || m?.requestedTo)) {
            const req = String(m.requestedBy || '') === String(authUser.uid) ? m.requestedTo : m.requestedBy;
            if (req) alreadySwipedUids.add(String(req));
          }
        });
        console.log(`[HomeScreen] Excluding ${alreadySwipedUids.size} users (swiped + matched) - will filter them out`);
        
        const { data: allUsers } = await userService.getUsers({ limit: 80 });

        // Debug: Count users by gender (excluding admins)
        const allUserIds = (allUsers || []).map(u => String(u?.id || u?.uid || '')).filter(Boolean);
        const adminChecks = await Promise.all(
          allUserIds.map(uid => checkUserRoleFromAdminCollection(uid))
        );
        const adminUids = new Set(
          allUserIds.filter((uid, idx) => adminChecks[idx]?.isAdmin || adminChecks[idx]?.isStaff)
        );
        
        const regularUsers = (allUsers || []).filter(u => {
          const uid = String(u?.id || u?.uid || '');
          return !adminUids.has(uid);
        });
        
        const boysCount = regularUsers.filter(u => {
          const gender = String(u?.gender || '').trim().toLowerCase();
          return gender === 'male';
        }).length;
        
        const girlsCount = regularUsers.filter(u => {
          const gender = String(u?.gender || '').trim().toLowerCase();
          return gender === 'female';
        }).length;
        
        const otherCount = regularUsers.filter(u => {
          const gender = String(u?.gender || '').trim().toLowerCase();
          return gender && gender !== 'male' && gender !== 'female';
        }).length;
        
        const noGenderCount = regularUsers.filter(u => {
          const gender = String(u?.gender || '').trim().toLowerCase();
          return !gender;
        }).length;
        
        console.log('[HomeScreen] 📊 User Statistics (excluding admins/staff):');
        console.log(`   Total users in DB: ${regularUsers.length}`);
        console.log(`   👨 Boys: ${boysCount}`);
        console.log(`   👩 Girls: ${girlsCount}`);
        console.log(`   🏳️ Other: ${otherCount}`);
        console.log(`   ❓ No gender: ${noGenderCount}`);
        console.log(`   🚫 Admins/Staff excluded: ${adminUids.size}`);

        // Only filter by country if user explicitly set it in filters (matchCountry), not from profile
        // This allows users to see people from all countries by default
        const targetCountry = String(matchCountry || '').trim(); // Only use explicit filter, not profile country
        const targetIntent = String(matchIntent || meProfile?.matchIntent || '').trim();
        const targetStatus = String(todayStatus || (isStatusActive(meProfile) ? meProfile?.todayStatus : '') || '').trim();
        const targetCity = String(
          tonightMode ? (myCity || '') : ''
        ).trim();

        // Get current user's gender and preferences for filtering
        const myGender = String(meProfile?.gender || '').trim().toLowerCase();
        const myReligion = String(meProfile?.religion || '').trim();
        const myPreferences = Array.isArray(meProfile?.genderPreferences) ? meProfile.genderPreferences : [];
        // Check if Muslim (handle both 'Muslim' and 'Islam' for compatibility)
        const isMuslim = myReligion === 'Muslim' || myReligion === 'Islam';
        
        const filtered = (allUsers || []).filter((u) => {
          const uid = String(u?.id || u?.uid || '');
          if (!uid) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: No UID`);
            return false;
          }
          if (uid === authUser.uid) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: Self`);
            return false;
          }
          if (u?.isDisabled) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: Disabled`);
            return false;
          }
          if (blockedSet?.has?.(uid)) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: Blocked`);
            return false;
          }
          if (contactHashes?.has?.(String(u?.emailHash || ''))) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: In contacts (email)`);
            return false;
          }
          if (contactHashes?.has?.(String(u?.phoneHash || ''))) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: In contacts (phone)`);
            return false;
          }
          
          // Don't show users we've already swiped on (like or pass)
          if (alreadySwipedUids.has(uid)) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: Already swiped on`);
            return false;
          }
          
          // Filter by gender preferences
          const candidateGender = String(u?.gender || '').trim().toLowerCase();
          if (!candidateGender) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: No gender`);
            return false; // Skip users without gender
          }
          
          // Get candidate's preferences for bidirectional matching
          const candidatePreferences = Array.isArray(u?.genderPreferences) ? u.genderPreferences : [];
          const candidateReligion = String(u?.religion || '').trim();
          const candidateIsMuslim = candidateReligion === 'Muslim' || candidateReligion === 'Islam';
          
          if (isMuslim) {
            // Muslims: only opposite gender (bidirectional check)
            console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): I am Muslim ${myGender}, checking opposite gender...`);
            
            // 1. Check if current user wants to see candidate's gender
            if (myGender === 'male' && candidateGender !== 'female') {
              console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ❌ I'm male Muslim, they're not female`);
              return false;
            }
            if (myGender === 'female' && candidateGender !== 'male') {
              console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ❌ I'm female Muslim, they're not male`);
              return false;
            }
            
            console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ✅ Opposite gender check passed! Now checking if they want to see me...`);
            console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): Candidate is ${candidateIsMuslim ? 'Muslim' : 'Non-Muslim'}, prefs: [${candidatePreferences.join(', ')}]`);
            
            // 2. Check if candidate wants to see current user's gender
            // For Muslim candidates, check their preferences if set, otherwise assume opposite gender
            if (candidateIsMuslim) {
              // Muslim candidate: if preferences are set, check them; otherwise assume opposite gender
              if (candidatePreferences.length > 0) {
                const candidateWantsBoys = candidatePreferences.includes('boys');
                const candidateWantsGirls = candidatePreferences.includes('girls');
                const iAmMale = myGender === 'male';
                const iAmFemale = myGender === 'female';
                
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Muslim): Candidate wants boys: ${candidateWantsBoys}, wants girls: ${candidateWantsGirls}, I am: ${myGender} (male: ${iAmMale}, female: ${iAmFemale})`);
                
                // Candidate must want to see my gender
                const candidateWantsMe = (candidateWantsBoys && iAmMale) || (candidateWantsGirls && iAmFemale);
                if (!candidateWantsMe) {
                  console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Muslim): ❌ Candidate doesn't want to see me`);
                  return false;
                }
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Muslim): ✅ Candidate wants to see me!`);
              } else {
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Muslim): ✅ No preferences set, assuming opposite gender (passes)`);
              }
              // If no preferences set, assume opposite gender (passes the check)
            } else {
              // Non-Muslim candidate: check their preferences
              if (candidatePreferences.length > 0) {
                const candidateWantsBoys = candidatePreferences.includes('boys');
                const candidateWantsGirls = candidatePreferences.includes('girls');
                const iAmMale = myGender === 'male';
                const iAmFemale = myGender === 'female';
                
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Non-Muslim): Candidate wants boys: ${candidateWantsBoys}, wants girls: ${candidateWantsGirls}, I am: ${myGender} (male: ${iAmMale}, female: ${iAmFemale})`);
                
                // Candidate must want to see my gender
                const candidateWantsMe = (candidateWantsBoys && iAmMale) || (candidateWantsGirls && iAmFemale);
                if (!candidateWantsMe) {
                  console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Non-Muslim): ❌ Candidate doesn't want to see me`);
                  return false;
                }
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Non-Muslim): ✅ Candidate wants to see me!`);
              } else {
                // Non-Muslim candidate with no preferences: assume opposite gender (allow through)
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}, Non-Muslim): ✅ No preferences, allowing through (opposite gender assumption)`);
              }
            }
            // If user is "other", show all genders
          } else {
            // Non-Muslims: use their selected preferences (bidirectional check)
            // Preferences are stored as ['boys'] or ['girls'] or ['boys', 'girls']
            // Gender is stored as 'Male', 'Female', or 'Other' (capitalized)
            if (myPreferences.length > 0) {
              // Map preferences to gender values
              const wantsBoys = myPreferences.includes('boys');
              const wantsGirls = myPreferences.includes('girls');
              const candidateIsMale = candidateGender === 'male';
              const candidateIsFemale = candidateGender === 'female';
              
              // Check if current user wants to see candidate
              console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): Checking if I want to see them. My prefs: [${myPreferences.join(', ')}], wantsBoys: ${wantsBoys}, wantsGirls: ${wantsGirls}, candidateIsMale: ${candidateIsMale}, candidateIsFemale: ${candidateIsFemale}`);
              
              if (!((wantsBoys && candidateIsMale) || (wantsGirls && candidateIsFemale))) {
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ❌ I don't want to see this gender`);
                return false;
              }
              
              console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ✅ I want to see them! Now checking if they want to see me...`);
              console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): Candidate preferences: [${candidatePreferences.join(', ')}] (length: ${candidatePreferences.length})`);
              
              // Check if candidate wants to see current user (if candidate has preferences)
              if (candidatePreferences.length > 0) {
                const candidateWantsBoys = candidatePreferences.includes('boys');
                const candidateWantsGirls = candidatePreferences.includes('girls');
                const iAmMale = myGender === 'male';
                const iAmFemale = myGender === 'female';
                
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): Candidate wants boys: ${candidateWantsBoys}, wants girls: ${candidateWantsGirls}, I am: ${myGender} (male: ${iAmMale}, female: ${iAmFemale})`);
                
                // Candidate must want to see my gender
                const candidateWantsMe = (candidateWantsBoys && iAmMale) || (candidateWantsGirls && iAmFemale);
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): Candidate wants me? ${candidateWantsMe} (${candidateWantsBoys && iAmMale ? 'wantsBoys && iAmMale' : ''} ${candidateWantsGirls && iAmFemale ? 'wantsGirls && iAmFemale' : ''})`);
                
                if (!candidateWantsMe) {
                  console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ❌ Candidate doesn't want to see me`);
                  return false;
                }
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ✅ Candidate wants to see me!`);
              } else {
                // Candidate has no preferences - allow through (they'll see opposite gender by default)
                console.log(`[Filter] ${u?.name || 'Unknown'} (${candidateGender}): ✅ No preferences set, allowing through (bidirectional check)`);
              }
            } else {
              // Fallback: if no preferences set, show opposite gender
              if (myGender === 'male' && candidateGender !== 'female') return false;
              if (myGender === 'female' && candidateGender !== 'male') return false;
            }
          }
          
          const candidateCountry = String(u?.country || u?.countryOfResidence || '').trim();
          // Only filter by country if BOTH user and candidate have countries set, and they explicitly don't match
          // This allows users without countries to see everyone, and prevents over-filtering
          if (targetCountry && candidateCountry && candidateCountry !== targetCountry) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: Country mismatch (target: ${targetCountry}, candidate: ${candidateCountry})`);
            return false;
          }
          // If targetCountry is set but candidate has no country, allow through (they might be new)
          // If candidateCountry is set but targetCountry is empty, allow through (user hasn't set preference)
          const candidateIntent = String(u?.categoryIntent || '').trim();
          if (targetIntent && candidateIntent !== targetIntent) {
            console.log(`[Filter] ${u?.name || 'Unknown'}: Intent mismatch (target: ${targetIntent}, candidate: ${candidateIntent})`);
            return false;
          }
          if (targetStatus) {
            const cs = String(u?.todayStatus || '').trim();
            if (!cs) {
              console.log(`[Filter] ${u?.name || 'Unknown'}: No status (target: ${targetStatus})`);
              return false;
            }
            if (!isStatusActive(u)) {
              console.log(`[Filter] ${u?.name || 'Unknown'}: Status expired (${cs})`);
              return false;
            }
            if (cs !== targetStatus) {
              console.log(`[Filter] ${u?.name || 'Unknown'}: Status mismatch (target: ${targetStatus}, candidate: ${cs})`);
              return false;
            }
          }
          if (targetCity) {
            const ccity = String(u?.city || '').trim() || String(String(u?.location || '').split(',')[0] || '').trim();
            if (!ccity) {
              console.log(`[Filter] ${u?.name || 'Unknown'}: No city (target: ${targetCity})`);
              return false;
            }
            if (ccity.toLowerCase() !== targetCity.toLowerCase()) {
              console.log(`[Filter] ${u?.name || 'Unknown'}: City mismatch (target: ${targetCity}, candidate: ${ccity})`);
              return false;
            }
          }
          console.log(`[Filter] ✅ ${u?.name || 'Unknown'} (${candidateGender}): PASSED ALL FILTERS`);
          return true;
        });

        // Debug: Count filtered candidates by gender
        const filteredBoys = filtered.filter(u => {
          const gender = String(u?.gender || '').trim().toLowerCase();
          return gender === 'male';
        }).length;
        
        const filteredGirls = filtered.filter(u => {
          const gender = String(u?.gender || '').trim().toLowerCase();
          return gender === 'female';
        }).length;
        
        const filteredOther = filtered.filter(u => {
          const gender = String(u?.gender || '').trim().toLowerCase();
          return gender && gender !== 'male' && gender !== 'female';
        }).length;
        
        console.log('[HomeScreen] ✅ After filtering (matching preferences):');
        console.log(`   Total candidates: ${filtered.length}`);
        console.log(`   👨 Boys: ${filteredBoys}`);
        console.log(`   👩 Girls: ${filteredGirls}`);
        console.log(`   🏳️ Other: ${filteredOther}`);
        console.log(`   Current user: ${myGender} (${isMuslim ? 'Muslim' : 'Non-Muslim'})`);
        console.log(`   Preferences: ${myPreferences.length > 0 ? myPreferences.join(', ') : 'none (opposite gender)'}`);

        if (!cancelled) {
          setCandidates(filtered);
          setCurrentIndex(0);
        }
      } catch (e) {
        console.error('Discovery load error:', e);
        if (!cancelled) {
          setCandidates([]);
          setCurrentIndex(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [onNavigate, matchCountry, matchIntent, todayStatus, tonightMode, myCity]);

  // Real-time listener for pending match requests
  useEffect(() => {
    const authUser = authService.getCurrentUser();
    if (!authUser?.uid) return;

    console.log('[HomeScreen] Setting up real-time listener for pending match requests...');
    const unsubscribe = matchService.listenPendingMatchRequests(authUser.uid, ({ data, error }) => {
      if (error) {
        console.error('[HomeScreen] Pending requests listener error:', error);
        return;
      }
      console.log('[HomeScreen] Pending match requests updated:', data.length);
      setPendingRequests(data || []);

      // Load user profiles for pending requests
      if (data && data.length > 0) {
        const loadUsers = async () => {
          const userMap = {};
          for (const request of data) {
            const requesterUid = String(request.requestedBy || '');
            if (requesterUid && !userMap[requesterUid]) {
              try {
                const res = await userService.getUserById(requesterUid);
                if (res?.data) {
                  userMap[requesterUid] = res.data;
                }
              } catch (e) {
                console.warn('[HomeScreen] Failed to load user for request:', requesterUid);
              }
            }
          }
          setPendingRequestUsers(userMap);
        };
        loadUsers();
      } else {
        setPendingRequestUsers({});
      }
    });

    return () => {
      console.log('[HomeScreen] Cleaning up pending requests listener');
      unsubscribe();
    };
  }, []);

  // Wingman room listener (optional)
  useEffect(() => {
    if (!wingmanCode) return;
    const { wingmanService } = require('../../services/firebaseService');
    const unsub = wingmanService.listenRoom(wingmanCode, ({ data }) => setWingmanRoom(data || null));
    return () => unsub && unsub();
  }, [wingmanCode]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const run = async () => {
        if (USE_MOCK_DATA) return;
        const authUser = authService.getCurrentUser();
        if (!authUser) return;
        try {
          const meSnap = await userService.getUserById(authUser.uid);
          const meProfile = meSnap?.data || null;
          if (cancelled || !meProfile) return;
          setMatchCountry(String(meProfile?.matchCountry || '').trim());
          setMatchIntent(String(meProfile?.matchIntent || '').trim());
          const s = String(meProfile?.todayStatus || '').trim();
          const active = s && isStatusActive(meProfile);
          setTodayStatus(active ? s : '');
          setMe((prev) => ({ ...(prev || {}), ...meProfile }));
        } catch (e) {
          console.warn('[HomeScreen] focus refresh:', e?.message || e);
        }
        try {
          const local = await loadLocalFilters();
          if (cancelled || !local) return;
          if (typeof local.hotSeatEnabled === 'boolean') setHotSeatEnabled(local.hotSeatEnabled);
          if (local.hotSeatP1) setHotSeatP1(local.hotSeatP1);
          if (local.hotSeatP2) setHotSeatP2(local.hotSeatP2);
          if (local.hotSeatTurn != null) setHotSeatTurn(local.hotSeatTurn);
          if (typeof local.tonightMode === 'boolean') setTonightMode(local.tonightMode);
        } catch (e) {
          console.warn('[HomeScreen] load local filters:', e?.message || e);
        }
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const openFilters = () => {
    navigation.navigate(Routes.Filters, {
      initial: {
        matchCountry,
        matchIntent,
        todayStatus,
        hotSeatEnabled,
        hotSeatP1,
        hotSeatP2,
        hotSeatTurn,
        tonightMode,
      },
    });
  };

  const handleSwipe = async (direction, userOrId) => {
    // Resolve target: from gesture we get userId (string); from button we get currentUser (object).
    const target = typeof userOrId === 'string'
      ? (userOrId ? (allCandidates.find((c) => String(c?.id ?? c?.uid) === userOrId) ?? null) : null)
      : (userOrId || null);

    // Simple logging
    try {
      console.log(`[Swipe] Direction: ${direction}, User: ${target?.id ?? target?.uid ?? 'null'}`);
    } catch (e) {
      // Ignore logging errors
    }

    // CRITICAL: Wrap everything in a safety net - this function MUST NEVER crash
    // Use setTimeout to ensure state updates happen even if there's an error
    const safeAdvanceCard = () => {
      try {
        setTimeout(() => {
          try {
            setCurrentIndex((prev) => {
              try {
                const next = prev < allCandidates.length - 1 ? prev + 1 : 0;
                return next;
              } catch (e) {
                console.error('[Swipe] Error in setCurrentIndex callback:', e);
                return prev; // Return previous value if update fails
              }
            });
          } catch (e) {
            console.error('[Swipe] Error in safeAdvanceCard:', e);
          }
        }, 0);
      } catch (e) {
        console.error('[Swipe] Error scheduling card advance:', e);
      }
    };

    // Immediate logging before any operations
    try {
      console.log('[Swipe] ========== SWIPE START ==========');
      console.log('[Swipe] Direction:', direction);
      console.log('[Swipe] Timestamp:', new Date().toISOString());
    } catch (logError) {
      // Even logging can fail, continue anyway
    }
    
    // Wrap entire function in try-catch for comprehensive error handling
    try {
      console.log('[Swipe] Target (resolved from userOrId):', {
        hasTarget: !!target,
        targetId: target?.id ?? target?.uid ?? 'none',
        targetName: target?.name ?? 'none'
      });
      console.log('[Swipe] Current state:', {
        currentIndex,
        allCandidatesLength: allCandidates?.length ?? 0
      });

      const authUser = authService.getCurrentUser();
      if (!authUser) {
        console.warn('[Swipe] No authenticated user, redirecting to login');
        onNavigate('onboarding', { mode: 'login' });
        return;
      }
      console.log('[Swipe] Authenticated user:', authUser.uid);

      if (!loading) {
        const imgs = Array.isArray(me?.images) ? me.images : [];
        const validProfileImages = imgs.filter(
          (img) => img && typeof img === 'string' && img.trim().length > 0
        );
        if (validProfileImages.length === 0) {
          Alert.alert(
            'Add photos',
            'Upload at least one photo in your profile to start swiping.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Go to profile', onPress: () => onNavigate('myProfile') },
            ]
          );
          return;
        }
      }

      if (!target) {
        console.error('[Swipe] ❌ No target user available:', {
          currentIndex,
          allCandidatesLength: allCandidates?.length ?? 0
        });
        // Still advance to next card even if no target
        try {
          setCurrentIndex((prev) => (prev < allCandidates.length - 1 ? prev + 1 : 0));
        } catch (e) {
          console.error('[Swipe] Failed to advance index:', e);
        }
        return;
      }

      console.log('[Swipe] Target validated:', {
        targetId: target?.id || 'none',
        targetName: target?.name || 'none',
        hasId: !!target?.id,
        hasName: !!target?.name
      });

      const targetId = target?.id ?? target?.uid;
      if (!targetId) {
        console.error('[Swipe] ❌ Target has no id/uid:', target);
        throw new Error('Target user has no id property');
      }

      console.log('[Swipe] Checking for pending match request...');
      const pendingRequest = pendingRequests.find(req => String(req.requestedBy) === String(targetId));
      
      if (pendingRequest) {
        console.log('[Swipe] Pending match request found:', {
          requestId: pendingRequest.id,
          requestedBy: pendingRequest.requestedBy
        });
        // This is a pending match request - handle approve/reject
        try {
          if (direction === 'right' || direction === 'up') {
            console.log('[Swipe] Approving pending match request...');
            // Approve the match
            const { error } = await matchService.approveMatch(pendingRequest.id, authUser.uid);
            if (error) {
              console.error('[Swipe] Failed to approve match:', error);
              try {
                showCuteAlert('error', 'OOPS!', 'Failed to approve match');
              } catch (alertError) {
                console.error('[Swipe] Alert error:', alertError);
              }
            } else {
              console.log('[Swipe] ✅ Match approved successfully');
              try {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (hapticError) {
                console.warn('[Swipe] Haptic error:', hapticError);
              }
              try {
                showCuteAlert('match', "IT'S A MATCH!", 'You can now chat');
              } catch (alertError) {
                console.error('[Swipe] Alert error:', alertError);
              }
              // Remove from pending requests
              setPendingRequests(prev => prev.filter(req => req.id !== pendingRequest.id));
            }
          } else {
            console.log('[Swipe] Rejecting pending match request...');
            // Reject the match (swipe left)
            const { error } = await matchService.rejectMatch(pendingRequest.id, authUser.uid);
            if (error) {
              console.error('[Swipe] Failed to reject match:', error);
              try {
                showCuteAlert('error', 'OOPS!', 'Failed to reject match');
              } catch (alertError) {
                console.error('[Swipe] Alert error:', alertError);
              }
            } else {
              console.log('[Swipe] ✅ Match rejected successfully');
              // Remove from pending requests
              setPendingRequests(prev => prev.filter(req => req.id !== pendingRequest.id));
            }
          }
        } catch (e) {
          console.error('[Swipe] Match request action exception:', {
            error: e?.message || String(e),
            stack: e?.stack,
            direction,
            requestId: pendingRequest?.id
          });
        }
        // Always advance to next card after handling pending request
        try {
          setCurrentIndex((prev) => (prev < allCandidates.length - 1 ? prev + 1 : 0));
        } catch (e) {
          console.error('[Swipe] Failed to advance index after pending request:', e);
        }
        console.log('[Swipe] ========== SWIPE END (pending request) ==========');
        return; // Don't proceed with normal swipe logic
      }

      // Normal swipe logic for regular candidates
      console.log('[Swipe] Processing normal swipe (not pending request)');
      
      try {
        console.log(`[Swipe] Triggering haptics for direction: ${direction}`);
        if (direction === 'up') {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else if (direction === 'right') {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        console.log('[Swipe] ✅ Haptics completed');
      } catch (hapticError) {
        console.warn('[Swipe] Haptic error (non-critical):', {
          error: hapticError?.message || String(hapticError),
          direction
        });
        // Continue even if haptics fail
      }
      
      if (direction === 'right' || direction === 'up') {
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('🔄 SWIPE RIGHT DETECTED');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`📤 From User ID: ${authUser.uid}`);
        console.log(`📥 To User ID: ${targetId || 'UNKNOWN'}`);
        console.log(`👤 Target Name: ${target?.name || 'Unknown'}`);
        console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
        console.log('───────────────────────────────────────────────────────────');
        
        if (!targetId) {
          console.error('❌ ERROR: Target has no ID - cannot save swipe');
          safeAdvanceCard();
          return;
        }
        
        // Brief badge-style feedback (same look as card corner LIKE)
        try {
          showSwipeToast('like');
          console.log('✅ Swipe toast shown');
        } catch (animError) {
          console.warn('⚠️ Error showing swipe toast:', animError);
        }
        
        // CRITICAL: Fire-and-forget the like operation - don't wait for it
        // This ensures the UI never blocks and the app never crashes
        Promise.resolve().then(async () => {
          try {
            console.log('📝 Starting Firestore save operation...');
            console.log(`   Collection: users/${authUser.uid}/likesSent/${targetId}`);
            console.log(`   Collection: users/${targetId}/likesReceived/${authUser.uid}`);
            
            // Validate likeService exists
            if (!likeService || typeof likeService.likeUser !== 'function') {
              console.error('❌ ERROR: likeService.likeUser is not available');
              return;
            }
            
            console.log('💾 Calling likeUser service...');
            // Call likeUser in background - don't await, don't block
            const likeResult = await likeService.likeUser(authUser.uid, targetId).catch((e) => {
              console.error('❌ ERROR in likeUser service:', {
                error: e?.message || String(e),
                code: e?.code,
                stack: e?.stack
              });
              return { matched: false, matchId: null, error: e?.message || String(e) };
            });
            
            console.log('───────────────────────────────────────────────────────────');
            console.log('📊 Like Operation Result:');
            console.log(`   ✅ Matched: ${likeResult?.matched || false}`);
            console.log(`   🆔 Match ID: ${likeResult?.matchId || 'null'}`);
            console.log(`   📋 Status: ${likeResult?.status || 'null'}`);
            console.log(`   ❌ Error: ${likeResult?.error || 'none'}`);
            console.log('───────────────────────────────────────────────────────────');
            
            // Handle match result (if mutual match)
            if (likeResult?.matched && !likeResult?.error) {
              console.log('🎉 MATCH DETECTED! Mutual like!');
              try {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showCuteAlert('match', "IT'S A MATCH!", 'Go to Matches to chat');
                console.log('✅ Match alert shown to user');
              } catch (matchError) {
                console.warn('⚠️ Error showing match alert:', matchError);
              }
            } else if (likeResult?.error) {
              console.error('❌ Like operation had error:', likeResult.error);
            } else {
              console.log('✅ Like saved successfully (not mutual yet)');
            }
            
            console.log('═══════════════════════════════════════════════════════════');
            console.log('✅ SWIPE OPERATION COMPLETE');
            console.log('═══════════════════════════════════════════════════════════\n');
          } catch (backgroundError) {
            // Even background errors should be caught
            console.error('❌❌❌ CRITICAL ERROR in background operation:', {
              error: backgroundError?.message || String(backgroundError),
              stack: backgroundError?.stack
            });
            console.log('═══════════════════════════════════════════════════════════\n');
          }
        }).catch((outerError) => {
          // Catch any errors in the promise chain
          console.error('❌❌❌ CRITICAL ERROR in promise chain:', {
            error: outerError?.message || String(outerError),
            stack: outerError?.stack
          });
          console.log('═══════════════════════════════════════════════════════════\n');
        });
        
        // Card already advanced in finally block, so we're done here
      } else {
        console.log(`[Swipe] Pass action: from=${authUser.uid}, to=${targetId || 'unknown'}`);
        try {
          showSwipeToast('nope');
        } catch (toastErr) {
          console.warn('[Swipe] Swipe toast error:', toastErr);
        }
        if (!targetId) {
          console.error('[Swipe] ❌ Cannot pass: target has no id');
        } else {
          // Fire-and-forget pass operation - don't block
          Promise.resolve().then(async () => {
            try {
              if (likeService && typeof likeService.passUser === 'function') {
                const res = await likeService.passUser(authUser.uid, targetId).catch((e) => {
                  console.error('[Swipe] Background pass error (non-critical):', {
                    error: e?.message || String(e),
                    code: e?.code
                  });
                  return { error: e?.message || String(e) };
                });
                
                if (res?.error) {
                  console.error('[Swipe] Pass error (non-critical):', res.error);
                } else {
                  console.log('[Swipe] ✅ Pass recorded in background');
                }
              }
            } catch (passError) {
              console.error('[Swipe] Background pass exception (non-critical):', {
                error: passError?.message || String(passError)
              });
            }
          }).catch((outerError) => {
            console.error('[Swipe] Outer pass promise error (non-critical):', outerError);
          });
        }
      }
    } catch (e) {
      // This catch should never be reached if all inner catches work, but just in case
      try {
        console.error('[Swipe] ❌❌❌ TOP-LEVEL SWIPE ERROR ❌❌❌');
        console.error('[Swipe] Error type:', typeof e);
        console.error('[Swipe] Error message:', e?.message || String(e));
        console.error('[Swipe] Error stack:', e?.stack);
        console.error('[Swipe] Error name:', e?.name);
        console.error('[Swipe] Error code:', e?.code);
        // Safely access variables that might not be defined
        try {
          console.error('[Swipe] Context:', {
            direction: direction || 'unknown',
            currentIndex: currentIndex || 0,
            allCandidatesLength: allCandidates?.length || 0
          });
        } catch (contextError) {
          // Ignore context logging errors
        }
      } catch (logError) {
        // Even error logging can fail
      }
      
      // Try to show alert (non-critical)
      try {
        showCuteAlert('error', 'OOPS!', 'Swipe failed');
      } catch (alertError) {
        // Ignore alert errors
      }
      
      // Ensure card advances even in this worst-case scenario
      try {
        safeAdvanceCard();
      } catch (advanceError) {
        // Last resort - try direct state update
        try {
          setTimeout(() => {
            try {
              setCurrentIndex((prev) => Math.min(prev + 1, (allCandidates?.length || 1) - 1));
            } catch (finalError) {
              // Give up - at least we tried
            }
          }, 0);
        } catch (finalFinalError) {
          // Completely give up
        }
      }
    } finally {
      // CRITICAL: Always advance to next card, even if everything failed
      // Use setTimeout to ensure this happens even if there's an error
      try {
        console.log('[Swipe] Entering finally block...');
        safeAdvanceCard();
        
        // Hot seat handling (non-critical, wrapped in try-catch)
        if (hotSeatEnabled) {
          try {
            setTimeout(() => {
              try {
                setHotSeatTurn((t) => (t === 0 ? 1 : 0));
                setHandoffOpen(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              } catch (hotSeatError) {
                console.warn('[Swipe] Hot seat error:', hotSeatError);
              }
            }, 0);
          } catch (hotSeatError) {
            console.warn('[Swipe] Hot seat setup error:', hotSeatError);
          }
        }
        console.log('[Swipe] ✅ Finally block completed');
      } catch (finallyError) {
        console.error('[Swipe] ❌ Finally block error:', {
          error: finallyError?.message || String(finallyError),
          stack: finallyError?.stack
        });
        // Last resort: try to advance card one more time
        try {
          safeAdvanceCard();
        } catch (lastResortError) {
          console.error('[Swipe] ❌ Last resort card advance failed:', lastResortError);
        }
      }
      try {
        console.log('[Swipe] ========== SWIPE END ==========');
      } catch (logError) {
        // Even final logging can fail, ignore it
      }
    }
  };

  // Share current card to wingman (owner)
  useEffect(() => {
    try {
      if (!wingmanCode) return;
      const authUser = authService.getCurrentUser();
      if (!authUser?.uid) return;
      const ownerUid = String(wingmanRoom?.ownerUid || '');
      if (ownerUid && ownerUid !== String(authUser.uid)) return;
      const u = currentUser;
      if (!u) return;
      const { wingmanService } = require('../../services/firebaseService');
      wingmanService.updateCurrentCard(wingmanCode, authUser.uid, {
        id: String(u?.id || ''),
        name: String(u?.name || ''),
        age: u?.age || null,
        image: String(u?.images?.[0] || ''),
      });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, wingmanCode]);

  const nopeBtnStyle = useAnimatedStyle(() => {
    const p = interpolate(gestureX.value, [0, -160], [0, 1], Extrapolation.CLAMP);
    const s = interpolate(p, [0, 1], [1, 1.18], Extrapolation.CLAMP);
    return { transform: [{ scale: s }], opacity: interpolate(p, [0, 1], [0.9, 1], Extrapolation.CLAMP) };
  });
  const likeBtnStyle = useAnimatedStyle(() => {
    const p = interpolate(gestureX.value, [0, 160], [0, 1], Extrapolation.CLAMP);
    const s = interpolate(p, [0, 1], [1, 1.18], Extrapolation.CLAMP);
    return { transform: [{ scale: s }], opacity: interpolate(p, [0, 1], [0.9, 1], Extrapolation.CLAMP) };
  });
  const starBtnStyle = useAnimatedStyle(() => {
    const ay = Math.abs(gestureY.value);
    const ax = Math.abs(gestureX.value);
    // Only “light up” when vertical drag dominates.
    const vertical = ax > 0 ? Math.min(1, ay / (ax * 1.15)) : 1;
    const p = interpolate(ay, [0, 160], [0, 1], Extrapolation.CLAMP) * vertical;
    const s = interpolate(p, [0, 1], [1, 1.16], Extrapolation.CLAMP);
    return { transform: [{ scale: s }], opacity: interpolate(p, [0, 1], [0.9, 1], Extrapolation.CLAMP) };
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header} onLayout={(e) => setHeaderH(e?.nativeEvent?.layout?.height || 0)}>
        <HuzzPressable style={styles.headerButton} onPress={() => onNavigate('settings')} haptic="light">
          <Settings size={22} color={tokens.colors.text} strokeWidth={2} />
        </HuzzPressable>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.urduLogo, styles.urduLogoFirst]}>ح</Text>
          <Text style={[styles.urduLogo, styles.urduLogoSecond]}> ز</Text>
        </View>
        <HuzzPressable style={styles.headerButton} onPress={() => onNavigate('myProfile')} haptic="light">
          <UserRound size={22} color={tokens.colors.text} strokeWidth={2} />
        </HuzzPressable>
      </View>

      <View style={styles.container}>
      {/* Swipe Cards */}
      <View style={[styles.cardContainer, { paddingBottom: (bottomNavH || 0) + 10 }]}>
        <HuzzPressable style={styles.filterButton} onPress={openFilters} haptic="light">
          <SlidersHorizontal size={22} color={tokens.colors.accent} strokeWidth={2.2} />
        </HuzzPressable>

        {loading ? (
          <View style={[styles.card, { alignItems: 'center', justifyContent: 'center', minHeight: 400 }]}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 12, fontWeight: 'bold', fontSize: 16 }}>Loading matches...</Text>
          </View>
        ) : !currentUser ? (
          <View style={[styles.card, { alignItems: 'center', justifyContent: 'center', minHeight: 400, padding: 24 }]}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: tokens.colors.textSecondary, marginBottom: 8 }}>
              No profiles found
            </Text>
            <Text style={{ textAlign: 'center', color: tokens.colors.text, fontWeight: '600', marginBottom: 16 }}>
              Try changing your match country using the filter button.
            </Text>
            <RetroButton variant="blue" onPress={openFilters} title="Open Filters" />
          </View>
        ) : (
          <>
            {/* "Looking for" badge (reflects current filters; updates instantly) - only show when there are profiles */}
            {matchIntent ? (
              <View pointerEvents="none" style={styles.lookingForBadge}>
                <Text style={styles.lookingForText}>
                  Looking for: <Text style={styles.lookingForValue}>{matchIntent}</Text>
                </Text>
              </View>
            ) : null}

            {/* Daily status badge (expires daily) */}
            <View pointerEvents="none" style={styles.statusBadge}>
              <Text style={styles.statusText}>
                Status: <Text style={styles.statusValue}>{todayStatus || 'Off'}</Text>
              </Text>
            </View>

            {/* Hot seat turn badge */}
            {hotSeatEnabled ? (
              <View pointerEvents="none" style={styles.hotSeatBadge}>
                <Text style={styles.hotSeatText}>
                  Hot Seat: <Text style={styles.hotSeatValue}>{hotSeatTurn === 0 ? hotSeatP1 : hotSeatP2}</Text>
                </Text>
              </View>
            ) : null}

            <View style={[styles.deckFrame, { height: cardHeight }]}>
              {/* Cute In-App Alert Overlay */}
              {cuteAlert && (
                <RNAnimated.View
                  pointerEvents="none"
                  style={[
                    styles.cuteAlertOverlay,
                    {
                      opacity: cuteAlertAnim,
                      transform: [
                        {
                          scale: cuteAlertAnim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [0.6, 1.05, 1],
                          }),
                        },
                        {
                          rotate: cuteAlertAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [cuteAlert.type === 'success' ? '-8deg' : cuteAlert.type === 'error' ? '8deg' : '0deg', cuteAlert.type === 'success' ? '-8deg' : cuteAlert.type === 'error' ? '8deg' : '0deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.cuteAlertBox,
                      cuteAlert.type === 'success' && styles.cuteAlertSuccess,
                      cuteAlert.type === 'error' && styles.cuteAlertError,
                      cuteAlert.type === 'match' && styles.cuteAlertMatch,
                      cuteAlert.type === 'info' && styles.cuteAlertInfo,
                    ]}
                  >
                    <Text style={styles.cuteAlertText}>{cuteAlert.message}</Text>
                    {cuteAlert.subMessage && (
                      <Text style={styles.cuteAlertSubText}>{cuteAlert.subMessage}</Text>
                    )}
                  </View>
                </RNAnimated.View>
              )}
              {/* Swipe feedback badge – same design as card corner LIKE/NOPE, brief and non‑persistent */}
              {swipeToast && (
                <RNAnimated.View
                  pointerEvents="none"
                  style={[
                    styles.swipeToastOverlay,
                    {
                      opacity: swipeToastAnim,
                      transform: [
                        {
                          scale: swipeToastAnim.interpolate({
                            inputRange: [0, 0.4, 1],
                            outputRange: [0.85, 1.08, 1],
                          }),
                        },
                        {
                          rotate: swipeToastAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [swipeToast === 'like' ? '-6deg' : '6deg', swipeToast === 'like' ? '-6deg' : '6deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.swipeToastBadge,
                      swipeToast === 'like' && styles.swipeToastLike,
                      swipeToast === 'nope' && styles.swipeToastNope,
                    ]}
                  >
                    <Text style={styles.swipeToastText}>
                      {swipeToast === 'like' ? 'LIKED!' : 'NOPE'}
                    </Text>
                  </View>
                </RNAnimated.View>
              )}
              <SwipeDeck
                style={styles.deckFill}
                gestureX={gestureX}
                gestureY={gestureY}
                disabled={hotSeatEnabled && handoffOpen}
                data={allCandidates}
                index={currentIndex}
                onSwipe={handleSwipe}
                renderCard={(u) => (
                  <View style={styles.card}>
                    {/* Image */}
                    <View style={styles.imageContainer}>
                      <FadeInImage
                        source={{ uri: String(u?.images?.[0] || '') }}
                        style={styles.image}
                        resizeMode="cover"
                        contentPosition="top"
                      />

                      {/* Pending match request badge */}
                      {u?._isPendingRequest && (
                        <View style={[styles.candidateStatusPill, { backgroundColor: tokens.colors.accentDim }]}>
                          <Text style={[styles.candidateStatusText, { color: tokens.colors.accent, fontWeight: '600' }]}>
                            ⚡ Match Request
                          </Text>
                        </View>
                      )}

                      {/* Candidate intent pill */}
                      {!!String(u?.categoryIntent || '').trim() && (
                        <View style={styles.candidateIntentPill}>
                          <Text style={styles.candidateIntentText}>{String(u?.categoryIntent || '').trim()}</Text>
                        </View>
                      )}

                      {/* Candidate status ring/pill (only if active) */}
                      {isStatusActive(u) && (
                        <View style={styles.candidateStatusPill}>
                          <Text style={styles.candidateStatusText}>{String(u?.todayStatus || '').trim()}</Text>
                        </View>
                      )}

                      {/* Overlay */}
                      <View style={styles.overlay}>
                        <View style={styles.userInfo}>
                          <View style={styles.nameRow}>
                            <Text style={styles.userName}>{u?.name || 'User'}</Text>
                            {u?.isVerified ? <Text style={styles.verifiedBadge}> ✅</Text> : null}
                            <Text style={styles.userAge}> {u?.age || ''}</Text>
                          </View>
                          <Text style={styles.location}>
                            📍 {u?.location || u?.countryOfResidence || ''} {u?.distance ? `• ${u.distance} km away` : ''}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Bio & Interests */}
                    <ScrollView style={styles.bioContainer} contentContainerStyle={{ paddingBottom: 120 }}>
                      <Text style={styles.bio}>{String(u?.bio || '')}</Text>
                      <View style={styles.interestsContainer}>
                        {(u?.interests || []).slice(0, 4).map((interest, idx) => {
                          const colors = ['#98fb98', '#b0e0e6', '#fffacd', '#f0e68c'];
                          return (
                            <View
                              key={`${interest}-${idx}`}
                              style={[styles.interestTag, { backgroundColor: colors[idx % colors.length] }]}
                            >
                              <Text style={styles.interestTagText}>{interest}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                )}
              />

              {/* Floating Action Buttons (float bar near bottom edge, not covering content) */}
              <View pointerEvents="box-none" style={styles.actionsOverlay}>
                <View style={styles.actionContainer}>
                <Animated.View style={nopeBtnStyle}>
                  <HuzzPressable
                    style={[styles.actionButton, styles.rejectButton]}
                    onPress={() => handleSwipe('left', currentUser)}
                    haptic="light"
                    disabled={hotSeatEnabled && handoffOpen}
                  >
                    <Text style={styles.actionIcon}>✕</Text>
                  </HuzzPressable>
                </Animated.View>

                <Animated.View style={starBtnStyle}>
                  <HuzzPressable
                    style={[styles.actionButton, styles.superLikeButton]}
                    onPress={() => handleSwipe('up', currentUser)}
                    haptic="light"
                    disabled={hotSeatEnabled && handoffOpen}
                  >
                    <Text style={styles.superLikeIcon}>⭐</Text>
                  </HuzzPressable>
                </Animated.View>

                <Animated.View style={likeBtnStyle}>
                  <HuzzPressable
                    style={[styles.actionButton, styles.likeButton]}
                    onPress={() => handleSwipe('right', currentUser)}
                    haptic="medium"
                    disabled={hotSeatEnabled && handoffOpen}
                  >
                    <Text style={styles.likeIcon}>❤️</Text>
                  </HuzzPressable>
                </Animated.View>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Hot seat handoff overlay */}
      {hotSeatEnabled && handoffOpen ? (
        <View style={styles.handoffOverlay}>
          <View style={styles.handoffCard}>
            <Text style={styles.handoffTitle}>PASS THE PHONE</Text>
            <Text style={styles.handoffSub}>Next turn:</Text>
            <Text style={styles.handoffName}>{hotSeatTurn === 0 ? hotSeatP1 : hotSeatP2}</Text>
            <HuzzPressable
              style={[styles.btnWide, { backgroundColor: tokens.colors.success }]}
              onPress={() => setHandoffOpen(false)}
              haptic="medium"
            >
              <Text style={styles.btnWideText}>Ready</Text>
            </HuzzPressable>
          </View>
        </View>
      ) : null}

      {/* Bottom Navigation */}
      <View
        style={[styles.bottomNav, { paddingBottom: bottomNavPad }]}
        onLayout={(e) => setBottomNavH(e?.nativeEvent?.layout?.height || 0)}
      >
        <HuzzPressable
          style={[styles.navButton, { backgroundColor: '#90ee90', borderColor: '#228b22' }]}
          onPress={() => onNavigate('home')}
          haptic="light"
        >
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={styles.navLabel}>Home</Text>
        </HuzzPressable>
        <HuzzPressable
          style={[styles.navButton, { backgroundColor: '#87ceeb', borderColor: '#4682b4' }]}
          onPress={() => onNavigate('matches')}
          haptic="light"
        >
          <Text style={styles.navIcon}>💬</Text>
          <Text style={styles.navLabel}>Matches</Text>
        </HuzzPressable>
        <HuzzPressable
          style={[styles.navButton, { backgroundColor: '#ff6b9d', borderColor: '#8b4513' }]}
          onPress={() => onNavigate('myProfile')}
          haptic="light"
        >
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>Profile</Text>
        </HuzzPressable>
      </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  container: {
    flex: 1,
    // Match retro background so any remaining spacing doesn't look like a “gap”.
    backgroundColor: tokens.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    minHeight: 56,
    zIndex: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  headerTitleContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  urduLogo: {
    fontSize: 36,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  urduLogoFirst: {
    color: '#2563EB',
  },
  urduLogoSecond: {
    color: '#EAB308',
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 18,
  },
  deckFrame: {
    width: '100%',
    maxWidth: CARD_MAX_W,
    position: 'relative',
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  deckFill: {
    width: '100%',
    height: '100%',
  },
  filterButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 44,
    height: 44,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookingForBadge: {
    position: 'absolute',
    top: 18,
    left: 16,
    zIndex: 10,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderRadius: tokens.radius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  lookingForText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  lookingForValue: {
    color: tokens.colors.accent,
  },
  statusBadge: {
    position: 'absolute',
    top: 62,
    left: 16,
    zIndex: 10,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderRadius: tokens.radius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  statusValue: {
    color: tokens.colors.blue,
  },
  hotSeatBadge: {
    position: 'absolute',
    top: 106,
    left: 16,
    zIndex: 10,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderRadius: tokens.radius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hotSeatText: { fontSize: 12, fontWeight: '600', color: tokens.colors.textSecondary },
  hotSeatValue: { color: tokens.colors.accent },
  candidateIntentPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: tokens.radius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  candidateIntentText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  candidateStatusPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: tokens.radius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  candidateStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: tokens.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
    alignSelf: 'center',
  },
  imageContainer: {
    // Slightly shorter image area so we get more room in the lower part
    // of the card for the floating action buttons.
    height: '74%',
    position: 'relative',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    minHeight: 74,
  },
  userInfo: {
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    lineHeight: 28,
  },
  userAge: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  verifiedBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6EE7B7',
  },
  location: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 16,
  },
  bioContainer: {
    height: '26%',
    backgroundColor: tokens.colors.surfaceElevated,
    padding: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  bio: {
    fontSize: 13,
    color: tokens.colors.text,
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 18,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  interestTagText: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textSecondary,
  },
  actionsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Dock to the card bottom edge (slight overlap outside).
    bottom: -16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  rejectButton: {
    backgroundColor: tokens.colors.danger,
  },
  superLikeButton: {
    backgroundColor: tokens.colors.blue,
    width: 52,
    height: 52,
  },
  likeButton: {
    backgroundColor: tokens.colors.success,
  },
  actionIcon: {
    fontSize: 26,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  superLikeIcon: {
    fontSize: 22,
  },
  likeIcon: {
    fontSize: 26,
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    elevation: 8,
  },
  navButton: {
    flex: 1,
    maxWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 6,
    borderRadius: tokens.radius.md,
    gap: 6,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  navIcon: {
    fontSize: 26,
  },
  navLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  authButton: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#654321',
    backgroundColor: '#c0c0c0',
    shadowColor: '#654321',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  authButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  handoffOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 999,
  },
  handoffCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  handoffTitle: { fontSize: 18, fontWeight: '700', color: tokens.colors.text },
  handoffSub: { fontSize: 12, fontWeight: '600', color: tokens.colors.textSecondary },
  handoffName: { fontSize: 24, fontWeight: '700', color: tokens.colors.accent },
  btnWide: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.success,
  },
  btnWideText: { textAlign: 'center', fontWeight: '600', color: tokens.colors.text },
  successPopup: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -60,
    marginTop: -20,
    backgroundColor: tokens.colors.success,
    borderRadius: tokens.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    zIndex: 1000,
    elevation: 10,
  },
  successText: {
    ...tokens.typography.button,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
  },
  modalBtnText: {
    ...tokens.typography.label,
    color: tokens.colors.text,
  },
  cuteAlertOverlay: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  cuteAlertBox: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    borderWidth: 0,
  },
  cuteAlertSuccess: {
    backgroundColor: tokens.colors.success,
  },
  cuteAlertError: {
    backgroundColor: tokens.colors.danger,
  },
  cuteAlertMatch: {
    backgroundColor: tokens.colors.accent,
    paddingVertical: 18,
    paddingHorizontal: 28,
  },
  cuteAlertInfo: {
    backgroundColor: tokens.colors.blue,
  },
  cuteAlertText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  cuteAlertSubText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 4,
  },
  // Swipe toast
  swipeToastOverlay: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  swipeToastBadge: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: tokens.radius.md,
  },
  swipeToastLike: {
    backgroundColor: tokens.colors.success,
  },
  swipeToastNope: {
    backgroundColor: tokens.colors.danger,
  },
  swipeToastText: {
    fontWeight: '600',
    color: '#FFFFFF',
    fontSize: 15,
  },
});
 