import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Animated as RNAnimated,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { authService, blockService, contactBlockService, likeService, userService, matchService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { isStoreScreenshotModeActive } from '../../services/storeScreenshotMode';
import { SCREENSHOT_DEMO_PROFILES } from '../../services/screenshotDemoProfiles';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../../ui/tokens';
import { welcomeButtonStyles } from '../../ui/styles/welcomeButtonStyles.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { Routes } from '../navigation/routes';
import { getProfileImageUrls, hasAtLeastOneProfilePhoto } from '../../utils/profileImages';
import { getEffectiveGenderPreferences, normalizeProfileGender } from '../../utils/profilePreferences';
import { hasPassedAgeCheck, blockIfAgeNotVerifiedAsync, shouldSkipAgeCheck } from '../../utils/ageCheck.native';
import { sortDiscoveryByTab } from '../../utils/discoverySort';
import { isUserOnline } from '../../utils/presence';
import {
  listenActiveStories,
  listenStorySeen,
  createStory,
  groupStoriesByUser,
  buildStoryRowItems,
  markAuthorStoriesSeen,
} from '../../services/storyService';
import { pickStoryMedia } from '../../utils/storyPostFlow.native';
import { SwipeDeck } from './SwipeDeck.native';
import { HuzzHeader } from '../../ui/components/discovery/design2/HuzzHeader.native';
import { StoriesRow } from '../../ui/components/discovery/design2/StoriesRow.native';
import { StoryViewerModal } from '../../ui/components/discovery/design2/StoryViewerModal.native';
import { DiscoveryProfileCard } from '../../ui/components/discovery/design2/DiscoveryProfileCard.native';
import { ActionButtons } from '../../ui/components/discovery/design2/ActionButtons.native';
import { VerificationBottomSheet } from '../../ui/components/discovery/design2/VerificationBottomSheet.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { ProfilePhotoGalleryModal } from '../../ui/components/ProfilePhotoGalleryModal.native';
import { MainBottomNav, MAIN_BOTTOM_NAV_FALLBACK_H, mainBottomNavClearance } from '../../ui/components/MainBottomNav.native';
import { LiveTypographyProvider, LiveText, LiveRetroButton } from '../../ui/components/live/LiveTypography.native';
import { LiveContentWidth } from '../../ui/components/live/LiveContentWidth.native';
import { HomeLobbyHero } from '../../ui/components/home/HomeLobbyHero.native';
import { HomeSafetyNote } from '../../ui/components/home/HomeSafetyNote.native';
import { HomeHeaderMenu } from '../../ui/components/home/HomeHeaderMenu.native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';

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
const HEADER_FALLBACK_H = 64; // wordmark + underline + padding
/** Breathing room between swipe actions and tab bar. */
const FLOAT_NAV_GAP = 12;

function isStaffOrAdminProfile(u) {
  const role = String(u?.role || '').toLowerCase();
  return role === 'admin' || role === 'staff';
}

function filterDiscoveryCandidates({
  allUsers,
  authUid,
  blockedSet,
  contactHashes,
  alreadySwipedUids,
  matchCountry,
  meProfile,
  skipMutualPreference = false,
  includePreviouslySwiped = false,
  skipGenderFilter = false,
  allowMissingGender = false,
  skipCountryFilter = false,
}) {
  const targetCountry = String(matchCountry || '').trim();
  const myGender = normalizeProfileGender(meProfile?.gender);
  const myReligion = String(meProfile?.religion || '').trim();
  const myPreferences = getEffectiveGenderPreferences(meProfile || {});
  const isMuslim = myReligion === 'Muslim' || myReligion === 'Islam';

  return (allUsers || []).filter((u) => {
    const uid = String(u?.id || u?.uid || '');
    if (!uid || uid === authUid) return false;
    if (u?.isDisabled || u?.isShadowBanned || isStaffOrAdminProfile(u)) return false;
    if (blockedSet?.has?.(uid)) return false;
    if (contactHashes?.has?.(String(u?.emailHash || ''))) return false;
    if (contactHashes?.has?.(String(u?.phoneHash || ''))) return false;
    if (!includePreviouslySwiped && alreadySwipedUids.has(uid)) return false;

    const candidateGender = normalizeProfileGender(u?.gender);
    if (!candidateGender && !allowMissingGender) return false;

    const candidatePreferences = getEffectiveGenderPreferences(u);

    if (!skipGenderFilter && candidateGender) {
      if (isMuslim) {
        if (myGender === 'male' && candidateGender !== 'female') return false;
        if (myGender === 'female' && candidateGender !== 'male') return false;
        if (!skipMutualPreference && candidatePreferences.length > 0) {
          const candidateWantsMe =
            (candidatePreferences.includes('boys') && myGender === 'male')
            || (candidatePreferences.includes('girls') && myGender === 'female');
          if (!candidateWantsMe) return false;
        }
      } else if (myPreferences.length > 0) {
        const wantsBoys = myPreferences.includes('boys');
        const wantsGirls = myPreferences.includes('girls');
        const candidateIsMale = candidateGender === 'male';
        const candidateIsFemale = candidateGender === 'female';
        if (!((wantsBoys && candidateIsMale) || (wantsGirls && candidateIsFemale))) return false;
        if (!skipMutualPreference && candidatePreferences.length > 0) {
          const candidateWantsMe =
            (candidatePreferences.includes('boys') && myGender === 'male')
            || (candidatePreferences.includes('girls') && myGender === 'female');
          if (!candidateWantsMe) return false;
        }
      } else if (myGender) {
        if (myGender === 'male' && candidateGender !== 'female') return false;
        if (myGender === 'female' && candidateGender !== 'male') return false;
      }
    }

    const candidateCountry = String(u?.country || u?.countryOfResidence || '').trim();
    if (!skipCountryFilter && targetCountry && candidateCountry && candidateCountry !== targetCountry) {
      return false;
    }
    return true;
  });
}

function resolveDiscoveryCandidates(args) {
  const strict = filterDiscoveryCandidates(args);
  if (strict.length > 0) return { candidates: strict, mode: 'strict' };

  const relaxedMutual = filterDiscoveryCandidates({ ...args, skipMutualPreference: true });
  if (relaxedMutual.length > 0) return { candidates: relaxedMutual, mode: 'relaxed-mutual' };

  const includeSwiped = filterDiscoveryCandidates({
    ...args,
    skipMutualPreference: true,
    includePreviouslySwiped: true,
  });
  if (includeSwiped.length > 0) return { candidates: includeSwiped, mode: 'include-swiped' };

  const noGender = filterDiscoveryCandidates({
    ...args,
    skipMutualPreference: true,
    includePreviouslySwiped: true,
    allowMissingGender: true,
  });
  if (noGender.length > 0) return { candidates: noGender, mode: 'allow-missing-gender' };

  const anyone = filterDiscoveryCandidates({
    ...args,
    skipMutualPreference: true,
    includePreviouslySwiped: true,
    skipGenderFilter: true,
    allowMissingGender: true,
  });
  if (anyone.length > 0) return { candidates: anyone, mode: 'anyone' };

  const worldwide = filterDiscoveryCandidates({
    ...args,
    skipMutualPreference: true,
    includePreviouslySwiped: true,
    skipGenderFilter: true,
    allowMissingGender: true,
    skipCountryFilter: true,
  });
  if (worldwide.length > 0) return { candidates: worldwide, mode: 'worldwide' };

  return { candidates: [], mode: 'empty' };
}

export function HomeScreen({ onNavigate }) {
  const navigation = useNavigation();
  // UI testing mode: show mock cards even if Firebase/Firestore is offline.
  // Flip to false when you're ready to test real matchmaking.
  const USE_MOCK_DATA = false;

  const insets = useSafeAreaInsets();
  const bottomNavPad = Math.max(10, insets.bottom);
  const [headerH, setHeaderH] = useState(0);
  const [bottomNavH, setBottomNavH] = useState(0);
  /** Increment to re-run discovery load (header “Huzz” tap refresh). */
  const [deckRefreshKey, setDeckRefreshKey] = useState(0);
  const [fontsLoaded] = useFonts({ KaushanScript_400Regular });
  const kaushan = fontsLoaded ? { fontFamily: 'KaushanScript_400Regular' } : undefined;

  const navClearance = mainBottomNavClearance(bottomNavH, 12);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [indexHistory, setIndexHistory] = useState([]);
  const swipeDeckRef = useRef(null);
  const [verifySheetOpen, setVerifySheetOpen] = useState(false);
  const [verifySheetStep, setVerifySheetStep] = useState(0);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [rawStories, setRawStories] = useState([]);
  const [storySeenMap, setStorySeenMap] = useState({});
  const [storyUsersById, setStoryUsersById] = useState({});
  const [postingStory, setPostingStory] = useState(false);
  const [storyViewer, setStoryViewer] = useState({
    open: false,
    userId: null,
    userName: '',
    stories: [],
    startIndex: 0,
  });
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [baseCandidates, setBaseCandidates] = useState([]);
  const candidates = useMemo(() => {
    const sorted = sortDiscoveryByTab(baseCandidates, 'forYou', me);
    if (sorted.length > 0) return sorted;
    if (isStoreScreenshotModeActive()) return SCREENSHOT_DEMO_PROFILES;
    return sorted;
  }, [baseCandidates, me]);
  const [matchCountry, setMatchCountry] = useState('');
  const [discoveryError, setDiscoveryError] = useState('');
  
  // Pending match requests (real-time)
  const [roleCheck, setRoleCheck] = useState(null);

  const ageBlocked = useMemo(() => {
    if (shouldSkipAgeCheck(me, roleCheck)) return false;
    return !hasPassedAgeCheck(me);
  }, [me, roleCheck]);

  const viewerAgeVerified = useMemo(
    () => !ageBlocked && hasPassedAgeCheck(me),
    [ageBlocked, me]
  );

  const deckCanSwipe = useMemo(() => {
    if (ageBlocked) return false;
    if (loading) return true;
    return hasAtLeastOneProfilePhoto(me);
  }, [ageBlocked, loading, me]);

  const openVerificationSheet = useCallback(() => {
    setVerifySheetStep(0);
    setVerifySheetOpen(true);
  }, []);

  const handleRewind = useCallback(() => {
    setIndexHistory((history) => {
      if (!history.length) return history;
      const prev = history[history.length - 1];
      setCurrentIndex(prev);
      return history.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const authUser = authService.getCurrentUser();
    if (!authUser?.uid) return;
    checkUserRoleFromAdminCollection(authUser.uid)
      .then((role) => setRoleCheck(role))
      .catch(() => {});
  }, []);

  // Shared gesture values so the action buttons can animate live while dragging.
  const gestureX = useSharedValue(0);
  const gestureY = useSharedValue(0);
  
  /** Tap card photo → full-screen gallery (swipe between uploads). */
  const [photoGallery, setPhotoGallery] = useState({ open: false, uris: [], start: 0 });
  const openPhotoGallery = useCallback((u, startIndex = 0) => {
    const uris = getProfileImageUrls(u);
    if (!uris.length) return;
    const start = Math.min(Math.max(0, startIndex), uris.length - 1);
    setPhotoGallery({ open: true, uris, start });
  }, []);

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

  const advanceCard = useCallback(() => {
    setCurrentIndex((prev) => {
      setIndexHistory((h) => [...h.slice(-8), prev]);
      const len = candidates.length;
      if (len <= 0) return 0;
      return prev < len - 1 ? prev + 1 : 0;
    });
  }, [candidates.length]);

  const onDeckBlocked = useCallback(() => {
    if (ageBlocked) {
      openVerificationSheet();
      return;
    }
    Alert.alert(
      'Add a photo to your profile',
      'You need at least one photo on your profile to like, message, or pass.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go to profile', onPress: () => onNavigate('myProfile') },
      ]
    );
  }, [ageBlocked, onNavigate, openVerificationSheet]);

  // Defensive check for currentUser - validate array bounds
  const currentUser = useMemo(() => {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    if (currentIndex < 0 || currentIndex >= candidates.length) return null;
    return candidates[currentIndex] || null;
  }, [candidates, currentIndex]);

  useEffect(() => {
    if (__DEV__ && !loading && candidates.length === 0) {
      console.warn('[HomeScreen] No discovery candidates — widen filters or wait for more users.');
    }
  }, [loading, candidates.length]);

  /** Full lobby only when discovery returned nobody — not while swiping or in screenshot demo. */
  const showDiscoveryLobby = !loading && candidates.length === 0 && !isStoreScreenshotModeActive();

  const onHeaderHuzzPress = useCallback(() => {
    setDeckRefreshKey((k) => k + 1);
  }, []);

  const meUid = me?.id || me?.uid || authService.getCurrentUser()?.uid || null;

  useEffect(() => {
    if (!meUid) return undefined;
    const unsubStories = listenActiveStories(({ data }) => {
      setRawStories(Array.isArray(data) ? data : []);
    });
    const unsubSeen = listenStorySeen(meUid, ({ data }) => {
      setStorySeenMap(data || {});
    });
    return () => {
      unsubStories && unsubStories();
      unsubSeen && unsubSeen();
    };
  }, [meUid]);

  const storyGroups = useMemo(() => groupStoriesByUser(rawStories), [rawStories]);

  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set(storyGroups.map((g) => g.userId).filter(Boolean))];
    const missing = ids.filter((id) => String(id) !== String(meUid));
    if (!missing.length) return undefined;

    Promise.all(
      missing.map(async (uid) => {
        const res = await userService.getUserById(uid);
        return [uid, res?.data || null];
      })
    ).then((pairs) => {
      if (cancelled) return;
      setStoryUsersById((prev) => {
        const next = { ...prev };
        pairs.forEach(([uid, user]) => {
          if (user) next[uid] = user;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [storyGroups, meUid]);

  const storyRow = useMemo(() => {
    const usersById = { ...storyUsersById };
    if (me && meUid) usersById[meUid] = me;
    return buildStoryRowItems({
      storyGroups,
      usersById,
      viewerUid: meUid,
      seenMap: storySeenMap,
      me,
    });
  }, [storyGroups, storyUsersById, me, meUid, storySeenMap]);

  const myStoryGroup = useMemo(
    () => storyGroups.find((g) => String(g.userId) === String(meUid)),
    [storyGroups, meUid]
  );

  const handleAddStory = useCallback(async () => {
    const uid = authService.getCurrentUser()?.uid;
    if (!uid) return;

    if (!isUserOnline(me?.lastSeen)) {
      Alert.alert(
        'Go online to post',
        'Stories are for people who are online right now. Open the app and try again in a moment.'
      );
      return;
    }

    const media = await pickStoryMedia();
    if (!media?.uri) return;

    setPostingStory(true);
    try {
      const { error } = await createStory(uid, media);
      if (error) {
        const blocked =
          error.includes('not allowed') ||
          error.includes('inappropriate') ||
          error.includes("couldn't verify");
        Alert.alert(
          blocked ? 'Media not allowed' : 'Story failed',
          error
        );
      }
    } finally {
      setPostingStory(false);
    }
  }, [me?.lastSeen]);

  const openStoryViewer = useCallback((userId, userName, stories, startIndex = 0) => {
    if (!stories?.length) return;
    setStoryViewer({
      open: true,
      userId,
      userName,
      stories,
      startIndex,
    });
  }, []);

  const handleStoryPress = useCallback(
    (story) => {
      openStoryViewer(story.userId, story.name, story.stories, 0);
    },
    [openStoryViewer]
  );

  const handleViewMyStory = useCallback(() => {
    if (!myStoryGroup?.stories?.length) return;
    openStoryViewer(meUid, 'Your story', myStoryGroup.stories, 0);
  }, [meUid, myStoryGroup, openStoryViewer]);

  // Keep own-story viewer in sync when stories are deleted or added.
  useEffect(() => {
    if (!storyViewer.open || !meUid) return;
    if (String(storyViewer.userId) !== String(meUid)) return;
    const liveStories = myStoryGroup?.stories || [];
    if (!liveStories.length) {
      setStoryViewer((s) => (s.open ? { ...s, open: false, stories: [] } : s));
      return;
    }
    setStoryViewer((s) => {
      const prevIds = (s.stories || []).map((x) => x.id).join(',');
      const nextIds = liveStories.map((x) => x.id).join(',');
      if (prevIds === nextIds) return s;
      return { ...s, stories: liveStories };
    });
  }, [storyViewer.open, storyViewer.userId, meUid, myStoryGroup?.stories]);

  const handleStoryFinished = useCallback(
    async (latestStoryId) => {
      const uid = authService.getCurrentUser()?.uid;
      if (!uid || !storyViewer.userId || !latestStoryId) return;
      await markAuthorStoriesSeen(uid, storyViewer.userId, latestStoryId);
    },
    [storyViewer.userId]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setDiscoveryError('');
      try {
        if (USE_MOCK_DATA) {
          if (!cancelled) {
            setMe({
              country: 'United States',
              countryOfResidence: 'United States',
              matchCountry: 'United States',
            });
            // Mock data removed - using real profiles only
            setBaseCandidates([]);
            setCurrentIndex(0);
            setMatchCountry('United States');
          }
          return;
        }

        const authUser = await authService.ensureAuthReady();
        if (!authUser) {
          onNavigate('onboarding', { mode: 'login' });
          return;
        }

        // Check role from admin collection FIRST
        const roleCheck = await checkUserRoleFromAdminCollection(authUser.uid);
        if (!isStoreScreenshotModeActive() && roleCheck.isAdmin) {
          if (__DEV__) console.log('[HomeScreen] Admin detected, redirecting to admin screen');
          if (!cancelled) onNavigate('admin');
          return;
        } else if (!isStoreScreenshotModeActive() && roleCheck.isStaff) {
          if (__DEV__) console.log('[HomeScreen] Staff detected, redirecting to staff screen');
          if (!cancelled) onNavigate('staff');
          return;
        }
        
        const [
          meSnap,
          blockedRes,
          contactRes,
          likesRes,
          matchesRes,
          usersRes,
        ] = await Promise.allSettled([
          userService.getUserById(authUser.uid),
          blockService.listBlockedUids(authUser.uid),
          contactBlockService.listHashes(authUser.uid),
          likeService.listLikesSent(authUser.uid),
          matchService.listMyMatches(authUser.uid),
          userService.getUsers({ limit: 200 }),
        ]);

        const meProfile = meSnap.status === 'fulfilled' ? meSnap.value?.data || null : null;
        const blockedSet = blockedRes.status === 'fulfilled' ? blockedRes.value?.data : new Set();
        const contactHashes = contactRes.status === 'fulfilled' ? contactRes.value?.data : new Set();
        const likesSent = likesRes.status === 'fulfilled' ? likesRes.value?.data : [];
        const myMatches = matchesRes.status === 'fulfilled' ? matchesRes.value?.data : [];
        const allUsers = usersRes.status === 'fulfilled' ? usersRes.value?.data : [];

        if (usersRes.status === 'rejected' || usersRes.value?.error) {
          const msg = usersRes.value?.error || usersRes.reason?.message || 'Could not load profiles.';
          if (!cancelled) setDiscoveryError(msg);
          console.error('[HomeScreen] getUsers failed:', msg);
        }

        if (!cancelled) setMe(meProfile);

        const effectiveMatchCountry = String(matchCountry || meProfile?.matchCountry || '').trim();

        const alreadySwipedUids = new Set(
          (likesSent || []).map((like) => String(like?.toUid || like?.id || '')).filter(Boolean)
        );
        (myMatches || []).forEach((m) => {
          const uids = m?.uids || [];
          const other = uids.find((u) => String(u) !== String(authUser.uid));
          if (other) alreadySwipedUids.add(String(other));
          if (!other && (m?.requestedBy || m?.requestedTo)) {
            const req = String(m.requestedBy || '') === String(authUser.uid) ? m.requestedTo : m.requestedBy;
            if (req) alreadySwipedUids.add(String(req));
          }
        });

        const filterArgs = {
          allUsers,
          authUid: authUser.uid,
          blockedSet,
          contactHashes,
          alreadySwipedUids,
          matchCountry: effectiveMatchCountry,
          meProfile,
        };
        const { candidates: filtered, mode: filterMode } = resolveDiscoveryCandidates(filterArgs);

        if (!cancelled) {
          setBaseCandidates(filtered);
          setCurrentIndex(0);
          if (__DEV__ && filtered.length === 0 && (allUsers || []).length > 0) {
            console.warn(
              `[HomeScreen] ${allUsers.length} users fetched, 0 after filters (country=${effectiveMatchCountry || 'any'}, gender=${meProfile?.gender || '?'}, swiped=${alreadySwipedUids.size})`
            );
          } else if (__DEV__ && filterMode !== 'strict') {
            console.warn(`[HomeScreen] Discovery using relaxed filter mode: ${filterMode}`);
          }
        }
      } catch (e) {
        console.error('Discovery load error:', e);
        if (!cancelled) {
          setBaseCandidates([]);
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
  }, [onNavigate, matchCountry, deckRefreshKey]);

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
          setMe((prev) => ({ ...(prev || {}), ...meProfile }));
        } catch (e) {
          console.warn('[HomeScreen] focus refresh:', e?.message || e);
        }
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const openFilters = useCallback(() => {
    navigation.navigate(Routes.Filters, {
      initial: {
        matchCountry,
      },
    });
  }, [matchCountry, navigation]);

  const openHeaderMenu = useCallback(() => {
    setHeaderMenuOpen(true);
  }, []);

  const handleDirectMessage = async (target) => {
    const authUser = authService.getCurrentUser();
    if (!authUser) {
      onNavigate('onboarding', { mode: 'login' });
      return false;
    }

    if (
      await blockIfAgeNotVerifiedAsync(me, navigation, roleCheck, authUser.uid, (id) =>
        userService.getUserById(id)
      ).then(({ blocked, profile }) => {
        if (profile && profile !== me) setMe((prev) => ({ ...(prev || {}), ...profile }));
        return blocked;
      })
    ) {
      return false;
    }

    if (!loading) {
      let canAct = hasAtLeastOneProfilePhoto(me);
      if (!canAct) {
        try {
          const snap = await userService.getUserById(authUser.uid);
          const fresh = snap?.data || null;
          if (fresh) {
            setMe((prev) => ({ ...(prev || {}), ...fresh }));
            canAct = hasAtLeastOneProfilePhoto(fresh);
          }
        } catch (e) {
          console.warn('[Msg] Profile refresh for photo gate:', e?.message || e);
        }
      }
      if (!canAct) {
        Alert.alert(
          'Add a photo to your profile',
          'You need at least one photo on your profile to message people.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Go to profile', onPress: () => onNavigate('myProfile') },
          ]
        );
        return false;
      }
    }

    const targetId = target?.id ?? target?.uid;
    if (!targetId) {
      Alert.alert('Error', 'Could not open chat for this profile.');
      return false;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    try {
      const { matchId, error } = await matchService.startDirectMessage(authUser.uid, targetId);
      if (error || !matchId) {
        Alert.alert('Error', error || 'Could not start chat.');
        return false;
      }
      onNavigate('chat', { matchId, userId: targetId });
      return true;
    } catch (e) {
      Alert.alert('Error', e?.message || 'Could not start chat.');
      return false;
    }
  };

  const handleSwipe = async (direction, userOrId) => {
    const shouldAdvance = direction === 'left' || direction === 'right' || direction === 'down';

    // Resolve target: from gesture we get userId (string); from button we get currentUser (object).
    const target = typeof userOrId === 'string'
      ? (userOrId ? (candidates.find((c) => String(c?.id ?? c?.uid) === userOrId) ?? null) : null)
      : (userOrId || null);

    if (__DEV__) {
      try {
        console.log(`[Swipe] ${direction}`, target?.id ?? target?.uid ?? 'null');
      } catch {
        /* ignore */
      }
    }

    const authUser = authService.getCurrentUser();
    if (!authUser) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }

    if (
      await blockIfAgeNotVerifiedAsync(me, navigation, roleCheck, authUser.uid, (id) =>
        userService.getUserById(id)
      ).then(({ blocked, profile }) => {
        if (profile && profile !== me) setMe((prev) => ({ ...(prev || {}), ...profile }));
        return blocked;
      })
    ) {
      return;
    }

    if (!loading && !hasAtLeastOneProfilePhoto(me)) {
      onDeckBlocked();
      return;
    }

    if (!target) {
      return;
    }

    const targetId = target?.id ?? target?.uid;
    if (!targetId) {
      return;
    }

    if (String(targetId).startsWith('screenshot-demo-')) {
      if (shouldAdvance) advanceCard();
      return;
    }

    if (shouldAdvance && direction !== 'right') {
      advanceCard();
    }

    try {
      // Normal swipe logic for regular candidates
      void (async () => {
        try {
          if (direction === 'up') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } else if (direction === 'right') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } else {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        } catch {
          /* ignore */
        }
      })();

      if (direction === 'up') {
        await handleDirectMessage(target);
        if (__DEV__) console.log('[Swipe] SWIPE END (direct message)');
        return;
      }
      
      if (direction === 'right') {
        if (!targetId) {
          return;
        }
        
        try {
          showSwipeToast('like');
        } catch {
          /* ignore */
        }
        
        Promise.resolve().then(async () => {
          try {
            if (!likeService || typeof likeService.likeUser !== 'function') {
              if (__DEV__) console.warn('[Swipe] likeService.likeUser is not available');
              return;
            }
            
            const likeResult = await likeService.likeUser(authUser.uid, targetId).catch((e) => {
              if (__DEV__) console.warn('[Swipe] likeUser error:', e?.message || e);
              return { matched: false, matchId: null, error: e?.message || String(e) };
            });
            
            if (likeResult?.matched && likeResult?.matchId && !likeResult?.error) {
              try {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch {}
              const matchName = target?.name || target?.username || 'them';
              Alert.alert(
                "It's a match!",
                `You and ${matchName} liked each other.`,
                [
                  { text: 'Later', style: 'cancel' },
                  {
                    text: 'Say hi',
                    onPress: () =>
                      onNavigate('chat', { matchId: likeResult.matchId, userId: targetId }),
                  },
                  {
                    text: 'All chats',
                    onPress: () => onNavigate('matches'),
                  },
                ]
              );
              if (shouldAdvance) advanceCard();
            } else if (likeResult?.error) {
              try {
                showCuteAlert('error', 'Like failed', likeResult.error);
              } catch {
                Alert.alert('Like failed', likeResult.error);
              }
            } else {
              try {
                showCuteAlert('success', 'LIKE SENT!', 'If they like you back you can chat');
              } catch (_) {}
              if (shouldAdvance) advanceCard();
            }
          } catch (backgroundError) {
            if (__DEV__) console.warn('[Swipe] Background like error:', backgroundError?.message || backgroundError);
          }
        }).catch((outerError) => {
          if (__DEV__) console.warn('[Swipe] Like promise error:', outerError?.message || outerError);
        });
        
        // Card already advanced in finally block, so we're done here
      } else {
        if (__DEV__) console.log(`[Swipe] Pass: from=${authUser.uid}, to=${targetId || 'unknown'}`);
        try {
          showSwipeToast('nope');
        } catch (toastErr) {
          if (__DEV__) console.warn('[Swipe] Swipe toast error:', toastErr);
        }
        if (!targetId) {
          if (__DEV__) console.warn('[Swipe] Cannot pass: target has no id');
        } else {
          Promise.resolve().then(async () => {
            try {
              if (likeService && typeof likeService.passUser === 'function') {
                const res = await likeService.passUser(authUser.uid, targetId).catch((e) => {
                  if (__DEV__) console.warn('[Swipe] Background pass error:', e?.message || e);
                  return { error: e?.message || String(e) };
                });
                
                if (res?.error && __DEV__) {
                  console.warn('[Swipe] Pass error:', res.error);
                }
              }
            } catch (passError) {
              if (__DEV__) console.warn('[Swipe] Background pass exception:', passError?.message || passError);
            }
          }).catch((outerError) => {
            if (__DEV__) console.warn('[Swipe] Outer pass promise error:', outerError?.message || outerError);
          });
        }
      }
    } catch (e) {
      if (__DEV__) {
        console.error('[Swipe] error:', e?.message || e);
      }
      try {
        showCuteAlert('error', 'OOPS!', 'Swipe failed');
      } catch {
        /* ignore */
      }
    }
  };

  const handleLikePress = useCallback(() => {
    if (ageBlocked) {
      openVerificationSheet();
      return;
    }
    swipeDeckRef.current?.swipeRight?.();
  }, [ageBlocked, openVerificationSheet]);

  const handlePassPress = useCallback(() => {
    swipeDeckRef.current?.swipeLeft?.();
  }, []);

  const handleMessagePress = useCallback(async () => {
    if (ageBlocked) {
      openVerificationSheet();
      return;
    }
    if (!currentUser) return;
    await handleDirectMessage(currentUser);
  }, [ageBlocked, currentUser, openVerificationSheet]);

  const renderDiscoveryCard = useCallback(
    (u, meta) => (
      <DiscoveryProfileCard
        user={u}
        isTop={meta?.isTop}
        panGesture={meta?.panGesture}
        onPhotoPress={openPhotoGallery}
      />
    ),
    [openPhotoGallery]
  );

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
  const msgBtnStyle = useAnimatedStyle(() => {
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
      <LiveTypographyProvider>
        <View onLayout={(e) => setHeaderH(e?.nativeEvent?.layout?.height || 0)}>
          <HuzzHeader
            fontsLoaded={fontsLoaded}
            onMenuPress={openHeaderMenu}
            onBellPress={() => onNavigate('notifications')}
            onLogoPress={onHeaderHuzzPress}
          />
          {ageBlocked && !loading ? (
            <HuzzPressable
              onPress={openVerificationSheet}
              haptic="light"
              style={styles.ageBanner}
              accessibilityRole="button"
              accessibilityLabel="Verify you are 18 or older to unlock likes, chat, and live"
            >
              <Text style={styles.ageBannerText}>Verify you&apos;re 18+ to like, chat, and go live</Text>
              <Text style={styles.ageBannerCta}>Verify now →</Text>
            </HuzzPressable>
          ) : null}
          <StoriesRow
            stories={storyRow.items}
            myHasStory={storyRow.myActiveStoryCount > 0}
            myPreviewUrl={storyRow.myPreviewUrl || (Array.isArray(me?.images) ? me.images[0] : '')}
            onAddStory={handleAddStory}
            onViewMyStory={handleViewMyStory}
            onStoryPress={handleStoryPress}
          />
          {postingStory ? (
            <View style={styles.storyUploading}>
              <ActivityIndicator size="small" color={tokens.colors.brandPink} />
              <Text style={styles.storyUploadingText}>Posting story…</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.container}>
          <View style={[styles.cardContainer, { paddingBottom: FLOAT_NAV_GAP }]}>
            {showDiscoveryLobby ? (
              <ScrollView
                style={styles.lobbyScroll}
                contentContainerStyle={[styles.lobbyScrollContent, { paddingBottom: navClearance }]}
                showsVerticalScrollIndicator={false}
              >
                <HomeLobbyHero />
                {discoveryError ? (
                  <LiveText style={[styles.stateText, { textAlign: 'center', marginBottom: 8 }]}>
                    {discoveryError}
                  </LiveText>
                ) : null}
                <HomeSafetyNote />
                <LiveContentWidth style={styles.lobbyCta}>
                  <LiveRetroButton
                    variant="primary"
                    onPress={openFilters}
                    style={[styles.lobbyCtaBtn, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
                    textStyle={welcomeButtonStyles.welcomeBtnLabel}
                  >
                    Open filters
                  </LiveRetroButton>
                </LiveContentWidth>
              </ScrollView>
            ) : loading ? (
              <View style={[styles.stateCard, { flex: 1 }]}>
                <ActivityIndicator size="large" color={tokens.colors.accent} />
                <LiveText style={[styles.stateText, { marginTop: 12 }]}>Loading people…</LiveText>
              </View>
            ) : !currentUser ? (
              <View style={[styles.stateCard, { flex: 1 }]}>
                <LiveText style={styles.stateTitle}>You&apos;re all caught up</LiveText>
                <LiveText style={styles.stateText}>
                  No more profiles in this batch. Tap Huzz above to refresh, or widen your filters.
                  {discoveryError ? `\n\n${discoveryError}` : ''}
                </LiveText>
                <LiveRetroButton variant="outline" onPress={openFilters} style={welcomeButtonStyles.welcomeBtnShape}>
                  Open filters
                </LiveRetroButton>
              </View>
            ) : (
              <View style={styles.discoveryStage}>
                <View style={styles.deckFrame}>
                  {cuteAlert && (
                    <RNAnimated.View pointerEvents="none" style={[styles.cuteAlertOverlay, { opacity: cuteAlertAnim }]}>
                      <View style={[styles.cuteAlertBox, styles.cuteAlertInfo]}>
                        <Text style={styles.cuteAlertText}>{cuteAlert.message}</Text>
                      </View>
                    </RNAnimated.View>
                  )}
                  {swipeToast && (
                    <RNAnimated.View pointerEvents="none" style={[styles.swipeToastOverlay, { opacity: swipeToastAnim }]}>
                      <View style={[styles.swipeToastBadge, swipeToast === 'like' ? styles.swipeToastLike : styles.swipeToastNope]}>
                        <Text style={styles.swipeToastText}>{swipeToast === 'like' ? 'CONNECT!' : 'NEXT'}</Text>
                      </View>
                    </RNAnimated.View>
                  )}
                  <SwipeDeck
                    ref={swipeDeckRef}
                    style={styles.deckFill}
                    motion="slide"
                    gestureX={gestureX}
                    gestureY={gestureY}
                    data={candidates}
                    index={currentIndex}
                    canSwipe={deckCanSwipe}
                    onBlocked={onDeckBlocked}
                    onSwipe={handleSwipe}
                    renderCard={renderDiscoveryCard}
                  />
                </View>

                <ActionButtons
                  onRewind={handleRewind}
                  onPass={handlePassPress}
                  onLike={handleLikePress}
                  onMessage={handleMessagePress}
                  rewindDisabled={indexHistory.length === 0}
                  nopeBtnStyle={nopeBtnStyle}
                  likeBtnStyle={likeBtnStyle}
                  msgBtnStyle={msgBtnStyle}
                />
              </View>
            )}
          </View>

          <MainBottomNav
            active="home"
            onNavigate={onNavigate}
            onLayout={setBottomNavH}
          />
        </View>

        <StoryViewerModal
          visible={storyViewer.open}
          stories={storyViewer.stories}
          userName={storyViewer.userName}
          initialIndex={storyViewer.startIndex}
          isOwnStory={!!meUid && String(storyViewer.userId) === String(meUid)}
          authorUid={storyViewer.userId}
          viewerUid={authService.getCurrentUser()?.uid || meUid}
          viewerName={me?.name || authService.getCurrentUser()?.displayName || 'User'}
          onClose={() => setStoryViewer((s) => ({ ...s, open: false }))}
          onFinished={(latestId) => handleStoryFinished(latestId)}
          onStoriesChanged={() => setDeckRefreshKey((k) => k + 1)}
          onReplySent={({ matchId, userId }) => {
            setStoryViewer((s) => ({ ...s, open: false }));
            onNavigate('chat', { matchId, userId });
          }}
        />

        <HomeHeaderMenu
          visible={headerMenuOpen}
          onClose={() => setHeaderMenuOpen(false)}
          onProfile={() => onNavigate('myProfile')}
          onFilters={openFilters}
          onSettings={() => onNavigate('settings')}
        />

        <VerificationBottomSheet
          visible={verifySheetOpen}
          step={verifySheetStep}
          onClose={() => setVerifySheetOpen(false)}
          onContinue={() => setVerifySheetStep(1)}
          onStartScan={() => {
            setVerifySheetOpen(false);
            navigation.navigate(Routes.AgeCheck);
          }}
          onDone={() => setVerifySheetOpen(false)}
        />

        <ProfilePhotoGalleryModal
          visible={photoGallery.open}
          uris={photoGallery.uris}
          initialIndex={photoGallery.start}
          onClose={() => setPhotoGallery((s) => ({ ...s, open: false }))}
        />
      </LiveTypographyProvider>
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
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    minHeight: 60,
    zIndex: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.shellIconBtn,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** Same vibe as Welcome intro: Kaushan “Huzz” + blue gradient underline */
  headerWordmarkWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  headerBrandBlock: {
    alignItems: 'center',
  },
  headerHuzzWord: {
    fontSize: 40,
    letterSpacing: 0.5,
    color: tokens.colors.textOnBrand,
    fontWeight: '700',
    fontStyle: 'italic',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.12)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      android: {},
    }),
  },
  headerHuzzWordFont: {
    fontFamily: 'KaushanScript_400Regular',
    fontWeight: '400',
    fontStyle: 'normal',
  },
  headerUnderlineTrack: {
    marginTop: 4,
    width: 100,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    opacity: 0.85,
  },
  cardContainer: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 4,
    paddingBottom: 0,
  },
  discoveryStage: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    flexDirection: 'column',
  },
  discoveryDock: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingTop: 10,
    paddingBottom: 6,
  },
  lobbyScroll: { flex: 1, width: '100%' },
  storyUploading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 6,
  },
  storyUploadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMutedOnBrand,
  },
  ageBanner: {
    marginHorizontal: tokens.spacing.screenHorizontal,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: tokens.colors.brandPink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  ageBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#831843',
  },
  ageBannerCta: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.colors.blue,
  },
  viewModeRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: tokens.spacing.screenHorizontal,
  },
  viewModeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(131, 24, 67, 0.35)',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  viewModeBtnActive: {
    backgroundColor: tokens.colors.brandPink,
    borderColor: tokens.colors.brandPink,
  },
  viewModeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: tokens.colors.textMutedOnBrand,
  },
  viewModeLabelActive: {
    color: '#FFFFFF',
  },
  lobbyScrollContent: {
    paddingTop: tokens.spacing.sm,
    flexGrow: 1,
  },
  lobbyCta: { marginBottom: tokens.spacing.md },
  lobbyCtaBtn: { width: '100%' },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
  },
  stateTitle: {
    ...tokens.typography.titleSmall,
    color: tokens.colors.textOnBrand,
    marginBottom: 8,
    textAlign: 'center',
  },
  stateText: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.textMutedOnBrand,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  deckFrame: {
    flex: 1,
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  deckFill: {
    width: '100%',
    height: '100%',
  },
  filterButton: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 30,
    width: 44,
    height: 44,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  /** Stacked under top-left so they never sit under the filter button (top-right). */
  candidateTopLeftPills: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 5,
    gap: 8,
    alignItems: 'flex-start',
    maxWidth: '78%',
  },
  candidatePill: {
    backgroundColor: 'rgba(0,0,0,0.68)',
    borderRadius: tokens.radius.full,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  /** Always light-on-dark: pills sit on photos + dark scrim */
  candidatePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  candidatePresenceOnline: {
    color: '#D1FAE5',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  card: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 0,
    flexDirection: 'column',
    backgroundColor: 'transparent',
    borderRadius: 24,
    borderWidth: 0,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  imageContainer: {
    position: 'relative',
    minHeight: 0,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
  },
  /** ~62% of card when about section is visible */
  imageContainerSplit: {
    flex: 62,
  },
  /** Full card height when there’s no about / add me / interests / voice */
  imageContainerFull: {
    flex: 1,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  imagePressable: {
    width: '100%',
    height: '100%',
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
    flex: 38,
    minHeight: 0,
    backgroundColor: 'transparent',
    padding: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  bioScrollContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  bioSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.colors.textMutedOnBrand,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 8,
  },
  bio: {
    fontSize: 13,
    color: tokens.colors.textOnBrand,
    fontWeight: '500',
    marginBottom: 8,
    lineHeight: 18,
  },
  addMeText: {
    fontSize: 13,
    color: tokens.colors.textOnBrand,
    fontWeight: '600',
    marginBottom: 8,
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
    backgroundColor: tokens.colors.shellIconBtn,
  },
  interestTagText: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textOnBrand,
  },
  actionsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Slight overlap on card edge; clearance handled via cardHeight + nav padding.
    bottom: -12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.shellIconBtn,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  skipButton: {
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  messageButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  connectButton: {
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(16, 185, 129, 0.92)',
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
 