import React, { useCallback, useEffect, useRef } from 'react';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppState } from 'react-native';

import { Routes } from './routes';

import { WelcomeScreen } from '../components/WelcomeScreen.native';
import { OnboardingFlow } from '../components/OnboardingFlow.native';
import { MatchListScreen } from '../components/MatchListScreen.native.js';
import { ChatScreen } from '../components/ChatScreen.native.js';
import { SettingsScreen } from '../components/SettingsScreen.native.js';
import { AdminScreen } from '../components/AdminScreen.native.js';
import { ContactsBlockScreen } from '../components/ContactsBlockScreen.native.js';
import { BlockedUsersScreen } from '../components/BlockedUsersScreen.native.js';
import { MyProfileScreen } from '../components/MyProfileScreen.native.js';
import { WingmanScreen } from '../components/WingmanScreen.native.js';
import { SpinBottleScreen } from '../components/SpinBottleScreen.native.js';
import { VerificationScreen } from '../components/VerificationScreen.native.js';
import { DatePlanningScreen } from '../components/DatePlanningScreen.native.js';
import { WaliScreen } from '../components/WaliScreen.native.js';
import { StaffScreen } from '../components/StaffScreen.native.js';
import { HomeStackNavigator } from './HomeStackNavigator.native.js';
import { authService, userService, contactUploadService, notificationService, deviceBanService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { detectCountryCity } from '../../services/locationService.native.js';
import { registerForPushNotificationsAsync, getNotificationListeners, setBadgeCountAsync } from '../../services/pushService.native';
import { getDeviceHash } from '../../services/deviceService';
import * as Contacts from 'expo-contacts';
import { vpnDetectionService } from '../../services/vpnDetectionService';
import { hasPreferencesComplete, getOnboardingInitialStep } from '../../utils/profilePreferences';
import { PresenceHeartbeat } from '../components/PresenceHeartbeat.native';

const RootStack = createNativeStackNavigator();

function LocationSyncGate() {
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  const runOnce = async () => {
    // Only run if user is logged in
    const user = authService.getCurrentUser();
    if (!user?.uid) {
      return; // User not logged in - skip location sync
    }

    // Skip location sync for admin and staff - only for normal users
    // Check admin collection (not users collection) for role
    try {
      const roleCheck = await checkUserRoleFromAdminCollection(user.uid);
      if (roleCheck.isAdmin || roleCheck.isStaff) {
        // Silently skip - don't log for normal operation
        return;
      }
    } catch (error) {
      // If we can't check role (permission error), skip to avoid errors
      // Don't log - this is expected if user doesn't have permission
      return;
    }

    const now = Date.now();
    // Throttle to avoid excessive prompts/reads while app is active.
    if (now - lastRunRef.current < 5 * 60 * 1000) return;
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const { country, city, permission } = await detectCountryCity({ requestPermission: true });
      const locationResult = await userService.updateMyLocation(user.uid, {
        country,
        city,
        locationPermission: permission,
      });
      
      // Track IP and detect VPN (silently, non-blocking) - only if user is logged in and location was successfully saved
      // Only run VPN detection if location update succeeded (user is authenticated)
      if (user?.uid && country && !locationResult.error) {
        vpnDetectionService.trackIpAndDetectVpn(user.uid, 'location_update').catch((err) => {
          // Silently fail - VPN detection is not critical
          // Don't log permission errors
          if (!err?.message?.includes('permission') && !err?.message?.includes('not authenticated')) {
            console.warn('[LocationSyncGate] VPN detection error:', err?.message || err);
          }
        });
      }
      
      lastRunRef.current = now;
    } catch (error) {
      // Silently ignore location errors - don't spam console
      // Only log if it's not a permission error
      if (!error.message?.includes('permission')) {
        console.warn('[LocationSyncGate] Location update error:', error.message);
      }
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;
    
    // Wait for auth state to be ready before running
    const unsub = authService.onAuthStateChange((u) => {
      if (mounted && u?.uid) {
        // Small delay to ensure auth state is fully restored
        setTimeout(() => {
          if (mounted) runOnce();
        }, 500);
      }
    });
    
    const sub = AppState.addEventListener('change', (state) => {
      if (mounted && state === 'active') {
        // Check auth before running
        const user = authService.getCurrentUser();
        if (user?.uid) {
          runOnce();
        }
      }
    });
    
    // Don't run immediately on mount - wait for auth state change
    // This prevents running before user is authenticated

    return () => {
      mounted = false;
      unsub && unsub();
      sub?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function PushTokenGate() {
  const runningRef = useRef(false);
  const lastTokenRef = useRef(null);

  const run = async () => {
    const user = authService.getCurrentUser();
    if (!user?.uid) {
      // Silently return if no user - don't log errors
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const { token, status } = await registerForPushNotificationsAsync();
      if (token && token !== lastTokenRef.current) {
        lastTokenRef.current = token;
        await userService.updateUser(user.uid, { expoPushToken: token, pushPermission: status });
      } else {
        await userService.updateUser(user.uid, { pushPermission: status });
      }
    } catch (err) {
      // Silently ignore errors - don't spam console
      // Only log if it's not a permission error
      if (!err?.message?.includes('permission') && !err?.message?.includes('not authenticated')) {
        console.warn('[PushTokenGate] Error:', err?.message || err);
      }
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;
    
    // Wait for auth state to be ready before running
    const unsub = authService.onAuthStateChange((u) => {
      if (mounted && u?.uid) {
        // Small delay to ensure auth state is fully restored
        setTimeout(() => {
          if (mounted) run();
        }, 500);
      }
    });
    
    // Don't run immediately on mount - wait for auth state change
    // This prevents running before user is authenticated
    
    return () => {
      mounted = false;
      unsub && unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Navigation ref for notification handling
let navigationRef = null;

/**
 * Notification Listener - handles in-app notifications and navigation
 */
function NotificationListener() {
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (!user?.uid) return;

    // Check if getNotificationListeners is available (may not work in Expo Go)
    if (typeof getNotificationListeners !== 'function') {
      console.warn('[Push] getNotificationListeners not available in Expo Go');
      return;
    }

    const listeners = getNotificationListeners();

    // Listen for notifications received while app is open
    const receivedSubscription = listeners.addNotificationReceivedListener((notification) => {
      console.log('[Push] Notification received:', notification.request.content);
      // Update badge count
      updateBadgeCount(user.uid);
    });

    // Listen for user tapping on a notification
    const responseSubscription = listeners.addNotificationResponseReceivedListener((response) => {
      console.log('[Push] Notification tapped:', response.notification.request.content);
      const data = response.notification.request.content.data || {};
      handleNotificationTap(data);
    });

    // Update badge on mount and when notifications change
    updateBadgeCount(user.uid);
    const unsub = notificationService.listenMyNotifications(user.uid, () => {
      updateBadgeCount(user.uid);
    });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      if (unsub) unsub();
    };
  }, []);

  return null;
}

/**
 * Handle notification tap - navigate to relevant screen
 */
function handleNotificationTap(data) {
  if (!navigationRef || !navigationRef.isReady()) {
    console.warn('[Push] Navigation not ready, retrying...');
    setTimeout(() => handleNotificationTap(data), 500);
    return;
  }

  const { type, matchId } = data || {};

  try {
    if (
      type === 'match_request' ||
      type === 'match_approved' ||
      type === 'match_pending' ||
      type === 'match_mutual'
    ) {
      navigationRef.navigate(Routes.TabMatches);
    } else if (type === 'message' && matchId) {
      navigationRef.navigate(Routes.ChatThread, { matchId });
    } else if (type === 'verification') {
      navigationRef.navigate(Routes.Verification);
    } else {
      navigationRef.navigate(Routes.TabMatches);
    }
  } catch (e) {
    console.error('[Push] Navigation error:', e);
  }
}

/**
 * Update badge count based on unread notifications
 */
async function updateBadgeCount(uid) {
  try {
    // Only update badge if user is logged in
    const user = authService.getCurrentUser();
    if (!user?.uid || user.uid !== uid) {
      return; // User not logged in or UID mismatch
    }
    
    // Get unread count from Firestore
    const q = query(
      collection(db, 'users', String(uid), 'notifications'),
      where('status', '==', 'unread')
    );
    const snap = await getDocs(q);
    const unreadCount = snap.size;
    await setBadgeCountAsync(unreadCount);
  } catch (e) {
    // Silently fail - badge update is not critical
    // Don't log warnings for permission errors
    if (!e.message?.includes('permission')) {
      console.warn('[Push] Failed to update badge:', e);
    }
  }
}

function ContactUploadGate() {
  // REMOVED: Automatic contact upload
  // Contact upload is now OPTIONAL and only happens when user explicitly requests it
  // Users can upload contacts from Settings -> Block Contacts screen
  // This prevents permission errors and respects user privacy
  
  return null; // This gate no longer does anything automatically
}

function DeviceBanGate() {
  const runningRef = useRef(false);

  const run = async () => {
    const user = authService.getCurrentUser();
    if (!user?.uid) return;
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const deviceHash = await getDeviceHash();
      if (deviceHash) {
        // Store on profile (best-effort)
        userService.updateUser(user.uid, { deviceHash }).catch(() => {});
        const { banned } = await deviceBanService.isBanned(deviceHash);
        if (banned) {
          // Soft-gate: sign out immediately.
          await authService.signOutUser();
        }
      }
    } finally {
      runningRef.current = false;
    }
  };

  useEffect(() => {
    const unsub = authService.onAuthStateChange((u) => {
      if (u?.uid) run();
    });
    run();
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function useLegacyOnNavigate(navigation) {
  return useCallback(
    (screen, arg) => {
      const mode = arg && typeof arg === 'object' ? arg.mode : undefined;
      const matchId =
        (arg && typeof arg === 'object' && arg.matchId) || (typeof arg === 'string' ? arg : undefined);

      switch (screen) {
        case 'welcome':
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.Welcome }],
            })
          );
          return;
        case 'onboarding': {
          const isLogin = mode === 'login';
          // Never pass initialStep on Log in — only email/password (step 2). Prefs (step 3) come after name in signup.
          const initialStep =
            !isLogin && arg && typeof arg === 'object' && typeof arg.initialStep === 'number'
              ? arg.initialStep
              : undefined;
          const params = { mode: isLogin ? 'login' : 'signup' };
          if (initialStep != null) params.initialStep = initialStep;
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.Onboarding, params }],
            })
          );
          return;
        }
        case 'home':
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.TabHome }],
            })
          );
          return;
        case 'matches':
          navigation.navigate(Routes.TabMatches);
          return;
        case 'chat':
          if (matchId) navigation.navigate(Routes.ChatThread, { matchId });
          else navigation.navigate(Routes.TabMatches);
          return;
        case 'datePlanning':
          if (matchId) navigation.navigate(Routes.DatePlanning, { matchId });
          else navigation.navigate(Routes.TabMatches);
          return;
        case 'settings':
          navigation.navigate(Routes.TabSettings);
          return;
        case 'admin':
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.Admin }],
            })
          );
          return;
        case 'contacts':
          navigation.navigate(Routes.Contacts);
          return;
        case 'blockedUsers':
          navigation.navigate(Routes.BlockedUsers);
          return;
        case 'wingman':
          navigation.navigate(Routes.Wingman);
          return;
        case 'spinBottle':
          navigation.navigate(Routes.SpinBottle);
          return;
        case 'verification':
          navigation.navigate(Routes.Verification);
          return;
        case 'myProfile':
          navigation.navigate(Routes.TabProfile);
          return;
        case 'wali':
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.Wali }],
            })
          );
          return;
        case 'staff':
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.Staff }],
            })
          );
          return;
        case 'filters':
          navigation.navigate(Routes.TabHome, {
            screen: Routes.Filters,
            params: typeof arg === 'object' && arg ? arg : undefined,
          });
          return;
        default:
          // Unknown legacy route – keep app stable.
          return;
      }
    },
    [navigation]
  );
}

function screenOptionsBase() {
  return {
    headerShown: false,
    // Native-feeling transitions + swipe-back gestures.
    gestureEnabled: true,
    animation: 'slide_from_right',
  };
}

export function RootNavigator() {
  const navRef = React.useRef(null);
  const [initialRoute, setInitialRoute] = React.useState(Routes.Welcome);
  const [onboardingParams, setOnboardingParams] = React.useState({});
  const [isReady, setIsReady] = React.useState(false);

  // Check auth state on mount for persistent login
  // Use onAuthStateChanged to wait for auth to restore from AsyncStorage
  useEffect(() => {
    let unsub;
    const checkAuth = () => {
      // Wait for auth state to restore from persistence
      unsub = authService.onAuthStateChange((user) => {
        try {
          if (user?.uid) {
            // User is logged in, check admin collection FIRST
            checkUserRoleFromAdminCollection(user.uid)
              .then((roleCheck) => {
                // Check admin collection FIRST - only log if admin/staff found
                if (roleCheck.isAdmin) {
                  console.log('[RootNavigator] ✅ Admin detected, routing to Admin screen');
                  setInitialRoute(Routes.Admin);
                  setIsReady(true);
                  return;
                } else if (roleCheck.isStaff) {
                  console.log('[RootNavigator] ✅ Staff detected, routing to Staff screen');
                  setInitialRoute(Routes.Staff);
                  setIsReady(true);
                  return;
                }
                
                // Normal user - continue to check users collection
                
                // Not admin/staff, check users collection for wali or normal user
                userService.getUserById(user.uid)
                  .then((res) => {
                    // Handle permission errors gracefully
                    if (res?.error && (res.error.includes('permission') || res.error === 'Not logged in')) {
                      // Permission denied or not logged in - default to home/onboarding
                      setInitialRoute(Routes.TabHome);
                      setIsReady(true);
                      return;
                    }
                    
                    const profile = res?.data;
                    if (!profile) {
                      setOnboardingParams({ mode: 'signup', initialStep: 3 });
                      setInitialRoute(Routes.Onboarding);
                      setIsReady(true);
                      return;
                    }
                    
                    const waliRole = String(profile?.role || '').toLowerCase().trim();
                    const prefsOk = hasPreferencesComplete(profile);
                    const needsOnboarding = !prefsOk;
                    
                    if (waliRole === 'wali' || needsOnboarding) {
                      console.log('[RootNavigator] User profile:', { uid: user.uid, waliRole, prefsOk });
                    }
                    
                    if (waliRole === 'wali') {
                      setInitialRoute(Routes.Wali);
                    } else if (!needsOnboarding) {
                      setInitialRoute(Routes.TabHome);
                    } else {
                      setOnboardingParams({
                        mode: 'signup',
                        initialStep: getOnboardingInitialStep(profile),
                      });
                      setInitialRoute(Routes.Onboarding);
                    }
                    setIsReady(true);
                  })
                  .catch(() => {
                    // Error getting profile - default to home
                    setInitialRoute(Routes.TabHome);
                    setIsReady(true);
                  });
              })
              .catch(() => {
                userService.getUserById(user.uid)
                  .then((res) => {
                    const profile = res?.data;
                    const prefsOk = profile && hasPreferencesComplete(profile);
                    if (prefsOk) {
                      setInitialRoute(Routes.TabHome);
                    } else {
                      setOnboardingParams({
                        mode: 'signup',
                        initialStep: getOnboardingInitialStep(profile || {}),
                      });
                      setInitialRoute(Routes.Onboarding);
                    }
                    setIsReady(true);
                  })
                  .catch(() => {
                    setInitialRoute(Routes.TabHome);
                    setIsReady(true);
                  });
              });
          } else {
            // No user logged in — clear stale onboarding params so "Log in" is not merged with initialStep: 3
            setOnboardingParams({});
            setInitialRoute(Routes.Welcome);
            setIsReady(true);
          }
        } catch (e) {
          console.warn('[RootNavigator] Auth check error:', e);
          setOnboardingParams({});
          setInitialRoute(Routes.Welcome);
          setIsReady(true);
        }
      });
    };
    checkAuth();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    navigationRef = navRef.current;
  }, []);

  if (!isReady) {
    // Show nothing while checking auth (or show a loading screen)
    return null;
  }

  /** Cold-open straight to preferences — params only from this state, not Screen.initialParams (avoids merge bugs). */
  const rootInitialState =
    initialRoute === Routes.Onboarding
      ? {
          routes: [
            {
              name: Routes.Onboarding,
              params: onboardingParams,
            },
          ],
          index: 0,
        }
      : undefined;

  return (
    <NavigationContainer ref={navRef} initialState={rootInitialState}>
      <PresenceHeartbeat />
      <LocationSyncGate />
      <PushTokenGate />
      <DeviceBanGate />
      <ContactUploadGate />
      <NotificationListener />
      <RootStack.Navigator
        screenOptions={screenOptionsBase()}
        initialRouteName={rootInitialState ? undefined : initialRoute}
      >
        <RootStack.Screen name={Routes.Welcome}>
          {({ navigation }) => <WelcomeScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Onboarding}>
          {({ navigation, route }) => (
            <OnboardingFlow
              key={`onboarding-${route?.params?.mode || 'signup'}-${String(route?.params?.initialStep ?? '')}`}
              onNavigate={useLegacyOnNavigate(navigation)}
              mode={route?.params?.mode === 'login' ? 'login' : 'signup'}
              initialStep={typeof route?.params?.initialStep === 'number' ? route.params.initialStep : undefined}
              waliEmail={route?.params?.email || null}
            />
          )}
        </RootStack.Screen>

        {/* Main app screens (no bottom tabs — retro UI controls navigation) */}
        <RootStack.Screen name={Routes.TabHome}>
          {({ navigation }) => (
            <HomeStackNavigator onNavigateRoot={useLegacyOnNavigate(navigation)} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.TabMatches}>
          {({ navigation }) => <MatchListScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.ChatThread}>
          {({ navigation, route }) => (
            <ChatScreen onNavigate={useLegacyOnNavigate(navigation)} matchId={route?.params?.matchId || null} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.DatePlanning}>
          {({ navigation, route }) => (
            <DatePlanningScreen onNavigate={useLegacyOnNavigate(navigation)} matchId={route?.params?.matchId || null} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.TabProfile}>
          {({ navigation }) => <MyProfileScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.TabSettings}>
          {({ navigation }) => <SettingsScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Admin}>
          {({ navigation }) => <AdminScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Contacts}>
          {({ navigation }) => <ContactsBlockScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.BlockedUsers}>
          {({ navigation }) => <BlockedUsersScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Wingman}>
          {({ navigation }) => <WingmanScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.SpinBottle}>
          {({ navigation }) => <SpinBottleScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Verification}>
          {({ navigation }) => <VerificationScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Wali}>
          {({ navigation }) => <WaliScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Staff}>
          {({ navigation }) => <StaffScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}


