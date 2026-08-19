import React, { useCallback, useEffect, useRef } from 'react';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppState, Linking, View, ActivityIndicator, Alert } from 'react-native';

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
import { LiveRandomScreen } from '../components/LiveRandomScreen.native.js';
import { ClubsScreen } from '../components/ClubsScreen.native.js';
import { CreateClubScreen } from '../components/CreateClubScreen.native.js';
import { ClubRoomScreen } from '../components/ClubRoomScreen.native.js';
import { VerificationScreen } from '../components/VerificationScreen.native.js';
import { AgeCheckScreen } from '../components/AgeCheckScreen.native.js';
import { DatePlanningScreen } from '../components/DatePlanningScreen.native.js';
import { StaffScreen } from '../components/StaffScreen.native.js';
import { NotificationsScreen } from '../components/NotificationsScreen.native.js';
import { SocialScreen } from '../components/SocialScreen.native.js';
import { GamePlayScreen } from '../components/GamePlayScreen.native.js';
import { MehramAccessScreen } from '../components/MehramAccessScreen.native.js';
import { HomeStackNavigator } from './HomeStackNavigator.native.js';
import { authService, userService, notificationService, deviceBanService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { hasPassedAgeCheck, shouldSkipAgeCheck } from '../../utils/ageCheck.native';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs, doc, onSnapshot, getDoc } from 'firebase/firestore';
import { detectCountryCity } from '../../services/locationService.native.js';
import { registerForPushNotificationsAsync, getNotificationListeners, setBadgeCountAsync } from '../../services/pushService.native';
import { getDeviceHash, collectDeviceSnapshot } from '../../services/deviceService';
import { PresenceHeartbeat } from '../components/PresenceHeartbeat.native';
import {
  syncScreenCaptureToNavigationState,
  releaseScreenCaptureNavigation,
} from '../../services/screenCaptureSensitive';
import { LocationRequiredGate } from '../components/LocationRequiredGate.native';
import { AppUpdateAlertGate } from '../components/AppUpdateAlertGate.native';
import { PLAY_STORE_WEB_URL } from '../../config/appStore';
import { parseMehramTokenFromUrl } from '../../services/mehramLinking';
import { mehramService } from '../../services/mehramService';

const RootStack = createNativeStackNavigator();

function LocationSyncGate() {
  const lastRunRef = useRef(0);
  const runningRef = useRef(false);

  const runOnce = async () => {
    // Only run if user is logged in
    const user = authService.getCurrentUser();
    if (!user?.uid || mehramService.isMehramUid(user.uid)) {
      return;
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
      await userService.updateMyLocation(user.uid, {
        country,
        city,
        locationPermission: permission,
      });

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
    if (!user?.uid || mehramService.isMehramUid(user.uid)) {
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

function MehramLinkHandler({ isReady }) {
  const handlingRef = useRef(false);

  const openMehramLink = useCallback(async (url) => {
    const token = parseMehramTokenFromUrl(url);
    if (!token) return false;
    if (handlingRef.current) return true;
    handlingRef.current = true;
    try {
      const { data, error } = await mehramService.signInFromInvite(token);
      if (error) {
        Alert.alert('Mehram invitation', error);
        return true;
      }
      const go = () => {
        if (!navigationRef?.isReady?.()) {
          setTimeout(go, 200);
          return;
        }
        navigationRef.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: Routes.MehramAccess, params: { session: data } }],
          })
        );
      };
      go();
      return true;
    } finally {
      handlingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isReady) return undefined;
    let mounted = true;
    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        if (mounted && initial) {
          const user = authService.getCurrentUser();
          if (!user?.uid || !mehramService.isMehramUid(user.uid)) {
            await openMehramLink(initial);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    const sub = Linking.addEventListener('url', ({ url }) => {
      openMehramLink(url);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [isReady, openMehramLink]);

  return null;
}

// Navigation ref for notification handling
let navigationRef = null;

function resetToRoute(routeName, params) {
  if (!navigationRef?.isReady?.()) return;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: params ? [{ name: routeName, params }] : [{ name: routeName }],
    })
  );
}

/**
 * Notification Listener - handles in-app notifications and navigation
 */
function NotificationListener() {
  useEffect(() => {
    let detach = () => {};

    const attachForUser = (uid) => {
      detach();
      if (!uid) return;

      if (typeof getNotificationListeners !== 'function') {
        console.warn('[Push] getNotificationListeners not available in Expo Go');
        return;
      }

      const listeners = getNotificationListeners();

      const receivedSubscription = listeners.addNotificationReceivedListener(() => {
        updateBadgeCount(uid);
      });

      const responseSubscription = listeners.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data || {};
        handleNotificationTap(data);
      });

      updateBadgeCount(uid);
      const unsub = notificationService.listenMyNotifications(uid, () => {
        updateBadgeCount(uid);
      });

      detach = () => {
        receivedSubscription.remove();
        responseSubscription.remove();
        if (unsub) unsub();
      };
    };

    const unsubAuth = authService.onAuthStateChange((user) => {
      attachForUser(user?.uid || null);
    });

    attachForUser(authService.getCurrentUser()?.uid || null);

    return () => {
      unsubAuth && unsubAuth();
      detach();
    };
  }, []);

  return null;
}

/**
 * Handle notification tap - navigate to relevant screen
 */
async function handleNotificationTap(data) {
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
      type === 'match_mutual' ||
      type === 'like_received'
    ) {
      navigationRef.navigate(Routes.TabMatches);
    } else if ((type === 'message' || type === 'message_new') && matchId) {
      const user = authService.getCurrentUser();
      if (user?.uid) {
        try {
          const [profileRes, roleCheck] = await Promise.all([
            userService.getUserById(user.uid),
            checkUserRoleFromAdminCollection(user.uid),
          ]);
          const profile = profileRes?.data || null;
          if (!shouldSkipAgeCheck(profile, roleCheck) && !hasPassedAgeCheck(profile)) {
            navigationRef.navigate(Routes.AgeCheck);
            return;
          }
        } catch {
          /* proceed if profile check fails */
        }
      }
      navigationRef.navigate(Routes.ChatThread, { matchId });
    } else if (type === 'verification') {
      navigationRef.navigate(Routes.Verification);
    } else if (type === 'app_update') {
      const url = String(data?.playStoreUrl || '').trim() || PLAY_STORE_WEB_URL;
      Linking.openURL(url).catch(() => {});
    } else {
      navigationRef.navigate(Routes.Notifications);
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

function DeviceBanGate() {
  const runningRef = useRef(false);

  const run = async () => {
    const user = authService.getCurrentUser();
    if (!user?.uid || mehramService.isMehramUid(user.uid)) return;
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const snapshot = await collectDeviceSnapshot();
      const deviceHash = snapshot?.deviceHash || (await getDeviceHash());
      if (deviceHash) {
        userService
          .updateUser(user.uid, {
            deviceHash,
            deviceSnapshot: snapshot,
            lastDeviceSyncAt: new Date().toISOString(),
          })
          .catch(() => {});
        const { banned } = await deviceBanService.isBanned(deviceHash);
        if (banned) {
          await authService.signOutUser();
          Alert.alert(
            'Device restricted',
            'This device has been banned from Huzz for violating our policies.',
            [{ text: 'OK', onPress: () => resetToRoute(Routes.Welcome) }]
          );
          resetToRoute(Routes.Welcome);
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
          navigation.navigate(Routes.TabHome);
          return;
        case 'matches':
          navigation.navigate(Routes.TabMatches);
          return;
        case 'matchFeed':
          navigation.navigate(Routes.TabSocial);
          return;
        case 'social':
          navigation.navigate(Routes.TabSocial);
          return;
        case 'gamePlay': {
          const params =
            arg && typeof arg === 'object'
              ? {
                  gameId: arg.gameId || 'ludo',
                  opponentUid: arg.opponentUid || null,
                  opponentName: arg.opponentName || null,
                  roomId: arg.roomId || null,
                }
              : { gameId: 'ludo' };
          navigation.navigate(Routes.GamePlay, params);
          return;
        }
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
        case 'verification':
          navigation.navigate(Routes.Verification);
          return;
        case 'ageCheck':
          navigation.navigate(Routes.AgeCheck);
          return;
        case 'myProfile':
          navigation.navigate(Routes.TabProfile);
          return;
        case 'liveRandom':
          navigation.navigate(Routes.TabLive);
          return;
        case 'clubs':
          navigation.navigate(Routes.TabClubs);
          return;
        case 'createClub':
          navigation.navigate(Routes.CreateClub);
          return;
        case 'clubRoom':
          if (arg && typeof arg === 'object' && arg.clubId) {
            navigation.navigate(Routes.ClubRoom, { clubId: arg.clubId });
          } else {
            navigation.navigate(Routes.TabClubs);
          }
          return;
        case 'staff':
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.Staff }],
            })
          );
          return;
        case 'mehramAccess':
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: Routes.MehramAccess }],
            })
          );
          return;
        case 'filters':
          navigation.navigate(Routes.TabHome, {
            screen: Routes.Filters,
            params: typeof arg === 'object' && arg ? arg : undefined,
          });
          return;
        case 'notifications':
          navigation.navigate(Routes.Notifications);
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
    gestureEnabled: true,
    animation: 'slide_from_right',
  };
}

function mainTabScreenOptions() {
  return {
    headerShown: false,
    gestureEnabled: true,
    animation: 'fade',
    animationDuration: 220,
  };
}

export function RootNavigator() {
  const navRef = React.useRef(null);
  const isReadyRef = React.useRef(false);
  const [initialRoute, setInitialRoute] = React.useState(Routes.Welcome);
  const [onboardingParams, setOnboardingParams] = React.useState({});
  const [isReady, setIsReady] = React.useState(false);

  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

  // Check auth state on mount for persistent login
  // Use onAuthStateChanged to wait for auth to restore from AsyncStorage
  useEffect(() => {
    let unsub;
    let cancelled = false;

    const finishAuthRouting = (user) => {
      if (cancelled) return;
      try {
        if (user?.uid && mehramService.isMehramUid(user.uid)) {
          setInitialRoute(Routes.MehramAccess);
          setIsReady(true);
          if (isReadyRef.current) {
            resetToRoute(Routes.MehramAccess);
          }
          return;
        }
        if (user?.uid) {
          checkUserRoleFromAdminCollection(user.uid)
            .then((roleCheck) => {
              if (cancelled) return;
              if (roleCheck.isAdmin) {
                setInitialRoute(Routes.Admin);
                setIsReady(true);
                return;
              }
              if (roleCheck.isStaff) {
                setInitialRoute(Routes.Staff);
                setIsReady(true);
                return;
              }
              userService
                .getUserById(user.uid)
                .then(() => {
                  if (!cancelled) {
                    setInitialRoute(Routes.TabHome);
                    setIsReady(true);
                  }
                })
                .catch(() => {
                  if (!cancelled) {
                    setInitialRoute(Routes.TabHome);
                    setIsReady(true);
                  }
                });
            })
            .catch(() => {
              if (!cancelled) {
                setInitialRoute(Routes.TabHome);
                setIsReady(true);
              }
            });
          return;
        }

        setOnboardingParams({});
        setInitialRoute(Routes.Welcome);
        setIsReady(true);
      } catch (e) {
        console.warn('[RootNavigator] Auth check error:', e);
        setOnboardingParams({});
        setInitialRoute(Routes.Welcome);
        setIsReady(true);
      }
    };

    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        const token = parseMehramTokenFromUrl(initial);
        if (token && !authService.getCurrentUser()?.uid) {
          const { error } = await mehramService.signInFromInvite(token);
          if (error) {
            Alert.alert('Mehram invitation', error);
          }
        }
      } catch {
        /* ignore cold-start link errors */
      }

      unsub = authService.onAuthStateChange((user) => finishAuthRouting(user));
      finishAuthRouting(authService.getCurrentUser());
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    navigationRef = navRef.current;
  }, []);

  useEffect(() => {
    return () => releaseScreenCaptureNavigation();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBCFE8' }}>
        <ActivityIndicator size="large" color="#DB2777" />
      </View>
    );
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
    <NavigationContainer
      ref={navRef}
      initialState={rootInitialState}
      onReady={() => {
        navigationRef = navRef.current;
        try {
          const s = navRef.current?.getRootState?.();
          if (s) syncScreenCaptureToNavigationState(s);
        } catch {
          /* ignore */
        }
      }}
      onStateChange={(state) => syncScreenCaptureToNavigationState(state)}
    >
      <PresenceHeartbeat />
      <LocationRequiredGate />
      <AppUpdateAlertGate />
      <LocationSyncGate />
      <PushTokenGate />
      <DeviceBanGate />
      <NotificationListener />
      <MehramLinkHandler isReady={isReady} />
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
            />
          )}
        </RootStack.Screen>

        {/* Main app screens (no bottom tabs — retro UI controls navigation) */}
        <RootStack.Screen name={Routes.TabHome} options={mainTabScreenOptions()}>
          {({ navigation }) => (
            <HomeStackNavigator onNavigateRoot={useLegacyOnNavigate(navigation)} />
          )}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.TabMatches} options={mainTabScreenOptions()}>
          {({ navigation }) => <MatchListScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.TabSocial} options={mainTabScreenOptions()}>
          {({ navigation }) => <SocialScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.GamePlay} options={{ animation: 'slide_from_bottom' }}>
          {({ navigation, route }) => (
            <GamePlayScreen
              onNavigate={useLegacyOnNavigate(navigation)}
              gameId={route?.params?.gameId || 'ludo'}
              opponentUid={route?.params?.opponentUid || null}
              opponentName={route?.params?.opponentName || null}
              roomId={route?.params?.roomId || null}
            />
          )}
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
        <RootStack.Screen name={Routes.TabLive} options={mainTabScreenOptions()}>
          {({ navigation }) => <LiveRandomScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.TabClubs} options={mainTabScreenOptions()}>
          {({ navigation }) => <ClubsScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.CreateClub}>
          {({ navigation }) => <CreateClubScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.ClubRoom}>
          {({ navigation, route }) => (
            <ClubRoomScreen
              onNavigate={useLegacyOnNavigate(navigation)}
              clubId={route?.params?.clubId || null}
            />
          )}
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
        <RootStack.Screen name={Routes.Verification}>
          {({ navigation }) => <VerificationScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.AgeCheck}>
          {({ navigation }) => <AgeCheckScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Staff}>
          {({ navigation }) => <StaffScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.Notifications} options={{ animation: 'slide_from_right' }}>
          {({ navigation }) => <NotificationsScreen onNavigate={useLegacyOnNavigate(navigation)} />}
        </RootStack.Screen>
        <RootStack.Screen name={Routes.MehramAccess} options={{ animation: 'fade', gestureEnabled: false }}>
          {({ navigation, route }) => (
            <MehramAccessScreen
              session={route?.params?.session || null}
              onExit={() => {
                navigation.dispatch(
                  CommonActions.reset({
                    index: 0,
                    routes: [{ name: Routes.Welcome }],
                  })
                );
              }}
            />
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}


