import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Platform,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import { authService, userService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { detectCountryCity } from '../../services/locationService.native.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { ArrowLeft } from 'lucide-react-native';
import { tokens, brandShellGradient, brandUnderlineGradient } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { WelcomeMascotBlock } from './WelcomeMascotBlock.native';
import { COUNTRIES } from '../../utils/countries';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { RetroInput } from '../../ui/components/RetroInput.native';
import { LinearGradient } from 'expo-linear-gradient';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';

const WRONG_PASSWORD_IMG = require('../../../assets/images/wrong-password.png');
/** Same stop-touching art as Home header press (transparent BG — not .bak) */
const STOP_TOUCHING_WRONGPW_IMG = require('../../../assets/images/stop-touching.png');

const WELCOME_BG = brandShellGradient;
const WELCOME_BG_LOCATIONS = [0, 1];
const WELCOME_BG_FALLBACK = tokens.colors.bg;
const BRAND_UNDERLINE = brandUnderlineGradient;

function getAuthProgress(isLogin, authSubStep, forgotPasswordActive) {
  if (forgotPasswordActive) {
    if (authSubStep === 'email') return 0.33;
    if (authSubStep === 'otp') return 0.66;
    return 1;
  }
  if (isLogin) {
    return authSubStep === 'email' ? 0.5 : 1;
  }
  const map = { email: 0.2, otp: 0.4, password: 0.6, name: 0.8, username: 1 };
  return map[authSubStep] || 0.2;
}

/** Step 2 only — auth (email / OTP / password). Match prefs → Settings. */

export function OnboardingFlow({ onNavigate, mode = 'signup', initialStep: initialStepProp }) {
  const [fontsLoaded] = useFonts({ KaushanScript_400Regular });
  const [step, setStep] = useState(2); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameHint, setUsernameHint] = useState('');
  const [countryOfResidence, setCountryOfResidence] = useState('');
  const [city, setCity] = useState('');
  const [isLogin, setIsLogin] = useState(false);
  /** Step 2 substeps: email → otp (signup only) → password */
  const [authSubStep, setAuthSubStep] = useState('email');
  const [signupSessionId, setSignupSessionId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  /** Forgot password (login): email → OTP → new password */
  const [forgotPasswordActive, setForgotPasswordActive] = useState(false);
  const [resetSessionId, setResetSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const mountedRef = useRef(true);
  const authInFlightRef = useRef(false);
  /** Same pattern as Home: two opacity values + parallel timing (readable crossfade) */
  const wrongPasswordShake = useRef(new Animated.Value(0)).current;
  const wrongPwOpacityWrong = useRef(new Animated.Value(1)).current;
  const wrongPwOpacityStop = useRef(new Animated.Value(0)).current;
  const wrongPwAutoReturnTimerRef = useRef(null);
  /** Full-screen wrong-password art (login only) */
  const [showWrongPasswordScreen, setShowWrongPasswordScreen] = useState(false);
  /** Mirrors Home `headerLogoVariant`: wrong → stop-touching (same 220ms + shake + auto-return) */
  const [wrongPwLogoVariant, setWrongPwLogoVariant] = useState('wrong'); // 'wrong' | 'stopTouching'

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset wrong-password hero only when this screen is shown (deps: show flag only — avoids fighting tap)
  useEffect(() => {
    if (!showWrongPasswordScreen) return;
    if (wrongPwAutoReturnTimerRef.current) {
      clearTimeout(wrongPwAutoReturnTimerRef.current);
      wrongPwAutoReturnTimerRef.current = null;
    }
    setWrongPwLogoVariant('wrong');
    wrongPwOpacityWrong.setValue(1);
    wrongPwOpacityStop.setValue(0);
    wrongPasswordShake.setValue(0);
  }, [showWrongPasswordScreen]);

  // Crossfade wrong ↔ stop-touching (HomeScreen header uses identical timing)
  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(wrongPwOpacityWrong, {
        toValue: wrongPwLogoVariant === 'wrong' ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(wrongPwOpacityStop, {
        toValue: wrongPwLogoVariant === 'stopTouching' ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [wrongPwLogoVariant, wrongPwOpacityWrong, wrongPwOpacityStop]);

  // Shake only the stop-touching layer (Home: 200ms delay + sequence)
  useEffect(() => {
    if (wrongPwLogoVariant !== 'stopTouching') {
      wrongPasswordShake.setValue(0);
      return;
    }
    const id = setTimeout(() => {
      wrongPasswordShake.setValue(0);
      Animated.sequence([
        Animated.timing(wrongPasswordShake, { toValue: 9, duration: 42, useNativeDriver: true }),
        Animated.timing(wrongPasswordShake, { toValue: -9, duration: 42, useNativeDriver: true }),
        Animated.timing(wrongPasswordShake, { toValue: 7, duration: 38, useNativeDriver: true }),
        Animated.timing(wrongPasswordShake, { toValue: -7, duration: 38, useNativeDriver: true }),
        Animated.timing(wrongPasswordShake, { toValue: 4, duration: 34, useNativeDriver: true }),
        Animated.timing(wrongPasswordShake, { toValue: -4, duration: 34, useNativeDriver: true }),
        Animated.timing(wrongPasswordShake, { toValue: 0, duration: 36, useNativeDriver: true }),
      ]).start();
    }, 200);
    return () => clearTimeout(id);
  }, [wrongPwLogoVariant, wrongPasswordShake]);

  const onWrongPasswordArtPress = useCallback(() => {
    if (wrongPwLogoVariant === 'stopTouching') {
      if (wrongPwAutoReturnTimerRef.current) {
        clearTimeout(wrongPwAutoReturnTimerRef.current);
        wrongPwAutoReturnTimerRef.current = null;
      }
      setWrongPwLogoVariant('wrong');
      return;
    }
    if (wrongPwAutoReturnTimerRef.current) {
      clearTimeout(wrongPwAutoReturnTimerRef.current);
      wrongPwAutoReturnTimerRef.current = null;
    }
    setWrongPwLogoVariant('stopTouching');
    // Same beat as Home after refresh: ~550ms pause then back to default (total ~1.1s from tap)
    wrongPwAutoReturnTimerRef.current = setTimeout(() => {
      setWrongPwLogoVariant('wrong');
      wrongPwAutoReturnTimerRef.current = null;
    }, 1100);
  }, [wrongPwLogoVariant]);

  // Welcome / navigation: mode only (auth step)
  useEffect(() => {
    setIsLogin(mode === 'login');
    setLoading(false);
    authInFlightRef.current = false;
    setStep(2);
    setEmail('');
    setPassword('');
    setName('');
    setShowPassword(false);
    setAuthSubStep('email');
    setSignupSessionId('');
    setOtpCode('');
    setForgotPasswordActive(false);
    setResetSessionId('');
    setShowWrongPasswordScreen(false);
  }, [mode, initialStepProp]);

  const withTimeout = async (promise, ms = 20000) => {
    let t;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          t = setTimeout(() => reject(new Error('Request timed out. Please try again.')), ms);
        }),
      ]);
    } finally {
      if (t) clearTimeout(t);
    }
  };

  const isTimeoutError = (err) => {
    const msg = String(err?.message || '');
    return msg.toLowerCase().includes('timed out');
  };

  const filteredCountries = useMemo(() => {
    const q = String(countrySearch || '').trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.toLowerCase().includes(q));
  }, [countrySearch]);

  const syncLocationAfterAuth = async () => {
    try {
      const u = authService.getCurrentUser();
      if (!u?.uid) {
        console.log('[OnboardingFlow] No user logged in, skipping location sync');
        return;
      }
      
      console.log('[OnboardingFlow] Requesting location permission and detecting location...');
      const res = await detectCountryCity({ requestPermission: true });
      console.log('[OnboardingFlow] Location detection result:', res);
      
      if (res.permission === 'granted') {
        // Persist best-effort (does not touch matchCountry).
        const updateResult = await userService.updateMyLocation(u.uid, {
          country: res.country,
          city: res.city,
          locationPermission: res.permission,
        });
        if (updateResult.error) {
          // Don't show alert for permission errors - user might not be fully authenticated yet
          if (!updateResult.error.includes('permission') && !updateResult.error.includes('not authenticated')) {
            console.error('[OnboardingFlow] Location update error:', updateResult.error);
          }
        } else {
          console.log('[OnboardingFlow] ✅ Location saved:', { country: res.country, city: res.city });
        }
        if (res.country) setCountryOfResidence(res.country);
        if (res.city) setCity(res.city);
      } else {
        const updateResult = await userService.updateMyLocation(u.uid, { locationPermission: res.permission });
        if (updateResult.error && !updateResult.error.includes('permission') && !updateResult.error.includes('not authenticated')) {
          console.error('[OnboardingFlow] Location permission update error:', updateResult.error);
        }
      }
    } catch (err) {
      console.error('[OnboardingFlow] Location sync error:', err);
      Alert.alert('Location Error', `Failed to detect location: ${err.message || err}`);
    }
  };

  const handleAuth = async (authType) => {
    if (authType === 'email') {
      setStep(2);
      setIsLogin(false);
    }
  };

  const emailLooksValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

  const handleAuthEmailContinue = async () => {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!emailLooksValid(normalizedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (forgotPasswordActive) {
      if (authInFlightRef.current) return;
      authInFlightRef.current = true;
      setLoading(true);
      try {
        const { error, usedEmailLinkFallback } = await authService.sendPasswordResetEmailOtp(normalizedEmail);
        if (error) {
          Alert.alert('Could not send reset', error);
        } else if (usedEmailLinkFallback) {
          Alert.alert(
            'Check your email',
            'We sent a password reset link. Open it in your browser to set a new password, then come back and log in.'
          );
          setForgotPasswordActive(false);
          setAuthSubStep('password');
        } else {
          setOtpCode('');
          setAuthSubStep('otp');
        }
      } finally {
        authInFlightRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
      return;
    }

    if (isLogin) {
      setAuthSubStep('password');
      return;
    }
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setLoading(true);
    try {
      const { error } = await authService.sendSignupEmailOtp(normalizedEmail);
      if (error) {
        Alert.alert('Could not send code', error);
      } else {
        setOtpCode('');
        setAuthSubStep('otp');
      }
    } finally {
      authInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleAuthOtpVerify = async () => {
    const code = String(otpCode || '').trim();
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Error', 'Enter the 6-digit code from your email');
      return;
    }
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setLoading(true);
    try {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (forgotPasswordActive) {
        const { sessionId, error } = await authService.verifyPasswordResetEmailOtp(normalizedEmail, code);
        if (error) {
          Alert.alert('Verification failed', error);
        } else {
          setResetSessionId(sessionId);
          setPassword('');
          setAuthSubStep('password');
        }
      } else {
        const { sessionId, error } = await authService.verifySignupEmailOtp(normalizedEmail, code);
        if (error) {
          Alert.alert('Verification failed', error);
        } else {
          setSignupSessionId(sessionId);
          setAuthSubStep('password');
        }
      }
    } finally {
      authInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!emailLooksValid(normalizedEmail)) {
      Alert.alert('Error', 'Invalid email');
      return;
    }
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setLoading(true);
    try {
      if (forgotPasswordActive) {
        const { error, usedEmailLinkFallback } = await authService.sendPasswordResetEmailOtp(normalizedEmail);
        if (error) Alert.alert('Could not resend', error);
        else if (usedEmailLinkFallback) {
          Alert.alert('Sent', 'Check your email for the reset link.');
        } else {
          Alert.alert('Sent', 'If an account exists, check your inbox for a new code.');
        }
      } else {
        const { error } = await authService.sendSignupEmailOtp(normalizedEmail);
        if (error) Alert.alert('Could not resend', error);
        else Alert.alert('Sent', 'Check your inbox for a new code.');
      }
    } finally {
      authInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const routeAfterEmailAuthSuccess = async () => {
    syncLocationAfterAuth();

    const user = authService.getCurrentUser();
    if (!user?.uid) return;

    const roleCheck = await checkUserRoleFromAdminCollection(user.uid);
    if (roleCheck.isAdmin) {
      onNavigate('admin');
      return;
    }
    if (roleCheck.isStaff) {
      onNavigate('staff');
      return;
    }

    await authService.refreshCurrentUser();
    onNavigate('home');
  };

  const performEmailLogin = async (normalizedEmail) => {
    const { error, errorCode } = await withTimeout(authService.signIn(normalizedEmail, password), 30000);
    if (error) {
      const code = String(errorCode || '');
      const isWrongPw = code === 'auth/wrong-password' || code === 'auth/invalid-credential';
      if (isWrongPw) {
        setShowWrongPasswordScreen(true);
        return;
      }
      Alert.alert('Login Failed', error);
      return;
    }
    await routeAfterEmailAuthSuccess();
  };

  const leaveWrongPasswordScreen = () => {
    if (wrongPwAutoReturnTimerRef.current) {
      clearTimeout(wrongPwAutoReturnTimerRef.current);
      wrongPwAutoReturnTimerRef.current = null;
    }
    setWrongPwLogoVariant('wrong');
    wrongPwOpacityWrong.setValue(1);
    wrongPwOpacityStop.setValue(0);
    setShowWrongPasswordScreen(false);
    setPassword('');
    setAuthSubStep('email');
  };

  const handleFinalizePasswordReset = async () => {
    if (!password || password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (!resetSessionId) {
      Alert.alert('Session expired', 'Go back and verify the code again.');
      return;
    }
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setLoading(true);
    try {
      const { error } = await authService.finalizePasswordResetWithSession(resetSessionId, password);
      if (error) {
        Alert.alert('Could not reset password', error);
        return;
      }
      setForgotPasswordActive(false);
      setResetSessionId('');
      setPassword('');
      await routeAfterEmailAuthSuccess();
    } catch (error) {
      console.warn('Password reset error:', error?.message || error);
      Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
    } finally {
      authInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  /** Login: password step submits. Sign up: password step → name step. */
  const handleAuthPasswordSubmit = async () => {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!emailLooksValid(normalizedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    if (isLogin) {
      if (authInFlightRef.current) return;
      authInFlightRef.current = true;
      setLoading(true);
      try {
        await performEmailLogin(normalizedEmail);
      } catch (error) {
        console.warn('Login error:', error?.message || error);
        Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
      } finally {
        authInFlightRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
      return;
    }

    // Sign up: go to name screen (same card layout, separate step)
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    setAuthSubStep('name');
  };

  /** Sign up: name step → username step. */
  const handleSignupNameSubmit = async () => {
    if (!String(name || '').trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    setAuthSubStep('username');
  };

  /** Sign up: username step → create account. */
  const handleSignupUsernameSubmit = async () => {
    const uname = String(username || '').trim();
    if (!uname) {
      Alert.alert('Error', 'Please pick a username');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) {
      Alert.alert('Error', 'Username must be 3–20 characters: letters, numbers, underscore only.');
      return;
    }
    if (!signupSessionId) {
      Alert.alert('Session expired', 'Go back and verify your email again.');
      return;
    }
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setLoading(true);
    try {
      const avail = await authService.checkUsernameAvailable(uname);
      if (avail.error) {
        Alert.alert('Could not check username', avail.error);
        return;
      }
      if (!avail.available) {
        Alert.alert('Username taken', 'Try a different username.');
        return;
      }
      const { error, verificationEmailSent } = await authService.finalizeSignupWithSession(
        signupSessionId,
        password,
        name.trim(),
        uname
      );
      if (error) {
        Alert.alert('Sign Up Failed', error);
        return;
      }
      syncLocationAfterAuth();
      Alert.alert(
        'Success',
        verificationEmailSent
          ? 'Account created! Check your email to verify, then start browsing.'
          : 'Account created! You can start browsing.'
      );
      await routeAfterEmailAuthSuccess();
    } catch (error) {
      console.warn('Signup finalize error:', error?.message || error);
      if (isTimeoutError(error)) {
        const maybeUser = authService.getCurrentUser();
        if (maybeUser) {
          Alert.alert('Success', 'Account created!');
          await routeAfterEmailAuthSuccess();
          return;
        }
      }
      Alert.alert('Error', error.message || 'Something went wrong. Please try again.');
    } finally {
      authInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleAuthPrimaryAction = () => {
    if (authSubStep === 'password' && forgotPasswordActive) {
      return handleFinalizePasswordReset();
    }
    if (authSubStep === 'email') return handleAuthEmailContinue();
    if (authSubStep === 'otp') return handleAuthOtpVerify();
    if (authSubStep === 'name') return handleSignupNameSubmit();
    if (authSubStep === 'username') return handleSignupUsernameSubmit();
    return handleAuthPasswordSubmit();
  };

  const kFont = fontsLoaded ? { fontFamily: 'KaushanScript_400Regular' } : { fontWeight: '700' };
  const sansFont = { fontWeight: '600' };
  const authProgress = getAuthProgress(isLogin, authSubStep, forgotPasswordActive);

  return (
    <View style={{ flex: 1, backgroundColor: WELCOME_BG_FALLBACK }}>
      <LinearGradient colors={WELCOME_BG} locations={WELCOME_BG_LOCATIONS} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={[styles.container, styles.containerOnGradient]} edges={['top', 'bottom']}>
        {step === 2 && !showWrongPasswordScreen ? (
          <View
            style={styles.progressBarContainer}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(authProgress * 100) }}
          >
            <View style={[styles.progressBar, { width: `${authProgress * 100}%` }]} />
          </View>
        ) : null}
        <HuzzKeyboardAwareScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, styles.scrollContentStep2]}
        >
          {/* Step 2: matches Welcome — mascot, Huzz, light blue, Kaushan, back */}
          {step === 2 && (
            showWrongPasswordScreen ? (
              <View style={styles.step2Outer}>
                <View style={styles.step2Header}>
                  <HuzzPressable
                    onPress={leaveWrongPasswordScreen}
                    style={styles.step2BackHit}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel="Back to login"
                  >
                    <ArrowLeft size={26} color={tokens.colors.text} strokeWidth={2.25} />
                  </HuzzPressable>
                </View>

                {/* Single hero — same stack as Home header: parallel opacity + shake on stop layer only */}
                <View style={styles.wrongPasswordImageFloat}>
                  <HuzzPressable
                    onPress={onWrongPasswordArtPress}
                    haptic="light"
                    accessibilityRole="button"
                    accessibilityLabel={
                      wrongPwLogoVariant === 'wrong'
                        ? 'Wrong password mascot — tap for stop touching art'
                        : 'Stop touching art — tap to go back early'
                    }
                    style={styles.wrongPasswordImageShadowWrap}
                  >
                    {/* Home pattern: opacity on Animated.View (not Animated.Image) — avoids blank second layer on some RN/Android builds */}
                    <View style={styles.wrongPasswordImageStack} collapsable={false}>
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.wrongPasswordImageLayer, styles.wrongPasswordImageLayerZ0, { opacity: wrongPwOpacityWrong }]}
                      >
                        <Image
                          source={WRONG_PASSWORD_IMG}
                          style={styles.wrongPasswordImageFill}
                          resizeMode="contain"
                          accessibilityIgnoresInvertColors
                        />
                      </Animated.View>
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          styles.wrongPasswordImageLayer,
                          styles.wrongPasswordImageLayerZ1,
                          {
                            opacity: wrongPwOpacityStop,
                            transform: [{ translateX: wrongPasswordShake }],
                          },
                        ]}
                      >
                        <Image
                          source={STOP_TOUCHING_WRONGPW_IMG}
                          style={styles.wrongPasswordImageFill}
                          resizeMode="contain"
                          accessibilityIgnoresInvertColors
                        />
                      </Animated.View>
                    </View>
                  </HuzzPressable>
                </View>

                <Text style={[styles.step2ScreenTitle, kFont, { fontSize: 28, marginBottom: 6 }]}>
                  Wrong password
                </Text>
                <Text style={[styles.step2ScreenSub, sansFont, { fontSize: 17 }]}>
                  That didn’t match — try again from the login screen.
                </Text>

                <View style={styles.step2ButtonList}>
                  <RetroButton
                    variant="primary"
                    title="Back to login"
                    onPress={leaveWrongPasswordScreen}
                    style={[styles.step2BtnShape, styles.step2PrimaryShadow]}
                    textStyle={[styles.step2BtnLabel, sansFont, { fontSize: 19 }]}
                  />
                </View>
              </View>
            ) : (
            <View style={styles.step2Outer}>
              <View style={styles.step2Header}>
                <HuzzPressable
                  onPress={() => {
                    if (forgotPasswordActive) {
                      if (authSubStep === 'email') {
                        setForgotPasswordActive(false);
                        setAuthSubStep('password');
                        setOtpCode('');
                        return;
                      }
                      if (authSubStep === 'otp') {
                        setAuthSubStep('email');
                        setOtpCode('');
                        return;
                      }
                      if (authSubStep === 'password') {
                        setAuthSubStep('otp');
                        setPassword('');
                        return;
                      }
                    }
                    if (authSubStep === 'username') {
                      setAuthSubStep('name');
                      return;
                    }
                    if (authSubStep === 'name') {
                      setAuthSubStep('password');
                      return;
                    }
                    if (authSubStep === 'otp') {
                      setAuthSubStep('email');
                      setOtpCode('');
                      return;
                    }
                    if (authSubStep === 'password') {
                      if (isLogin) {
                        setAuthSubStep('email');
                        setPassword('');
                      } else {
                        setAuthSubStep('otp');
                        setPassword('');
                        setSignupSessionId('');
                      }
                      return;
                    }
                    onNavigate('welcome');
                  }}
                  style={styles.step2BackHit}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={
                    authSubStep === 'email' ? 'Back to welcome' : 'Back'
                  }
                >
                  <ArrowLeft size={26} color={tokens.colors.text} strokeWidth={2.25} />
                </HuzzPressable>
              </View>

              <WelcomeMascotBlock maxWidth={220} />

              <Text style={[styles.step2ScreenTitle, kFont, { fontSize: 28, marginBottom: 6 }]}>
                {forgotPasswordActive && authSubStep === 'email' && 'Reset password'}
                {forgotPasswordActive && authSubStep === 'otp' && 'Check your email'}
                {forgotPasswordActive && authSubStep === 'password' && 'New password'}
                {!forgotPasswordActive && authSubStep === 'email' && (isLogin ? 'Login' : 'Sign Up')}
                {!forgotPasswordActive && authSubStep === 'otp' && 'Check your email'}
                {!forgotPasswordActive && authSubStep === 'password' && (isLogin ? 'Welcome back' : 'Almost there')}
                {authSubStep === 'name' && 'What’s your name?'}
                {authSubStep === 'username' && 'Pick a username'}
              </Text>
              <Text style={[styles.step2ScreenSub, sansFont, { fontSize: 17 }]}>
                {forgotPasswordActive && authSubStep === 'email' &&
                  'Enter the email for your account — we’ll send a code if it exists'}
                {forgotPasswordActive && authSubStep === 'otp' &&
                  `Code sent to ${String(email || '').trim() || 'your email'}`}
                {forgotPasswordActive &&
                  authSubStep === 'password' &&
                  'Choose a new password (at least 6 characters)'}
                {!forgotPasswordActive && authSubStep === 'email' &&
                  (isLogin
                    ? 'Enter your email to continue'
                    : 'We’ll send a code to verify it’s you')}
                {!forgotPasswordActive && authSubStep === 'otp' &&
                  `Code sent to ${String(email || '').trim() || 'your email'}`}
                {!forgotPasswordActive &&
                  authSubStep === 'password' &&
                  (isLogin ? 'Enter your password' : 'Create a secure password for your account')}
                {authSubStep === 'name' && 'This is how you’ll appear on Huzz'}
                {authSubStep === 'username' && 'Unique handle for clubs and adding friends — letters, numbers, underscore'}
              </Text>

              <View style={styles.step2Card}>
                <View style={styles.form}>
                  {authSubStep === 'email' && (
                    <>
                      <Text style={[styles.step2Label, sansFont, { fontSize: 16 }]}>Email</Text>
                      <RetroInput
                        placeholder="your@email.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                        style={styles.step2Input}
                      />
                    </>
                  )}

                  {authSubStep === 'otp' && (!isLogin || forgotPasswordActive) && (
                    <>
                      <Text style={[styles.step2Label, sansFont, { fontSize: 16 }]}>6-digit code</Text>
                      <RetroInput
                        placeholder="000000"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={otpCode}
                        onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, ''))}
                        style={[styles.step2Input, styles.step2OtpInput]}
                      />
                      <TouchableOpacity onPress={handleResendOtp} disabled={loading} style={styles.step2ResendWrap}>
                        <Text style={[styles.step2ResendText, sansFont]}>Resend code</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {authSubStep === 'password' && (
                    <>
                      <Text style={[styles.step2Label, sansFont, { fontSize: 16 }]}>
                        {forgotPasswordActive ? 'New password' : 'Password'}
                      </Text>
                      <View style={styles.step2PasswordRow}>
                        <RetroInput
                          placeholder={forgotPasswordActive ? 'New password' : 'Password'}
                          secureTextEntry={!showPassword}
                          value={password}
                          onChangeText={setPassword}
                          style={[styles.step2Input, styles.step2PasswordInput]}
                        />
                        <TouchableOpacity
                          style={styles.step2EyeBtn}
                          onPress={() => setShowPassword(!showPassword)}
                          accessibilityRole="button"
                          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        >
                          <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
                        </TouchableOpacity>
                      </View>
                      {isLogin && !forgotPasswordActive && (
                        <TouchableOpacity
                          onPress={() => {
                            setForgotPasswordActive(true);
                            setAuthSubStep('email');
                            setOtpCode('');
                            setSignupSessionId('');
                            setResetSessionId('');
                          }}
                          style={styles.step2ForgotWrap}
                          accessibilityRole="button"
                          accessibilityLabel="Forgot password"
                        >
                          <Text style={[styles.step2ForgotText, sansFont]}>Forgot password?</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {authSubStep === 'name' && !isLogin && (
                    <>
                      <Text style={[styles.step2Label, sansFont, { fontSize: 16 }]}>Name</Text>
                      <RetroInput
                        placeholder="Enter your name"
                        value={name}
                        onChangeText={setName}
                        style={styles.step2Input}
                        autoCapitalize="words"
                      />
                    </>
                  )}

                  {authSubStep === 'username' && !isLogin && (
                    <>
                      <Text style={[styles.step2Label, sansFont, { fontSize: 16 }]}>Username</Text>
                      <RetroInput
                        placeholder="e.g. zain_huzz"
                        value={username}
                        onChangeText={(t) => {
                          setUsername(t.replace(/\s/g, ''));
                          setUsernameHint('');
                        }}
                        style={styles.step2Input}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {usernameHint ? (
                        <Text style={[styles.step2Hint, sansFont]}>{usernameHint}</Text>
                      ) : null}
                    </>
                  )}
                </View>
              </View>

              <View style={styles.step2ButtonList}>
                <RetroButton
                  variant="primary"
                  onPress={handleAuthPrimaryAction}
                  disabled={loading}
                  title={
                    loading
                      ? 'Loading...'
                      : authSubStep === 'email'
                        ? 'Continue'
                        : authSubStep === 'otp'
                          ? 'Verify'
                          : authSubStep === 'name'
                            ? 'Continue'
                            : authSubStep === 'username'
                              ? 'Sign Up'
                            : forgotPasswordActive
                              ? 'Update password'
                              : isLogin
                                ? 'Login'
                                : 'Continue'
                  }
                  style={[styles.step2BtnShape, styles.step2PrimaryShadow]}
                  textStyle={[styles.step2BtnLabel, sansFont, { fontSize: 19 }]}
                />
                {authSubStep === 'email' && !forgotPasswordActive && (
                  <RetroButton
                    variant="outline"
                    onPress={() => {
                      setIsLogin(!isLogin);
                      setEmail('');
                      setPassword('');
                      setName('');
                      setUsername('');
                      setOtpCode('');
                      setSignupSessionId('');
                      setAuthSubStep('email');
                    }}
                    title={isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
                    style={[styles.step2BtnShape, styles.step2Outline]}
                    textStyle={[styles.step2BtnLabel, sansFont, { fontSize: 16 }]}
                  />
                )}
              </View>
            </View>
            )
          )}

      </HuzzKeyboardAwareScrollView>

      {/* Country dropdown modal */}
      <Modal visible={countryModalOpen} animationType="slide" transparent onRequestClose={() => setCountryModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select country</Text>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search country..."
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoCapitalize="none"
            />
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
              {filteredCountries.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={styles.modalRow}
                  onPress={() => {
                    setCountryOfResidence(c);
                    setCountryModalOpen(false);
                    setCountrySearch('');
                  }}
                >
                  <Text style={styles.modalRowText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.authButton, { backgroundColor: '#c0c0c0' }]}
              onPress={() => setCountryModalOpen(false)}
            >
              <Text style={styles.authButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Manual location entry removed — location permission is required app-wide */}
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingBottom: 0,
  },
  containerOnGradient: {
    backgroundColor: 'transparent',
  },
  scrollContentStep2: {
    paddingBottom: 32,
  },
  /** Wrong-password art: not inside step2Card — centered, soft shadow “float” */
  wrongPasswordImageFloat: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  wrongPasswordImageShadowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'transparent',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: { elevation: 3 },
    }),
  },
  wrongPasswordImageStack: {
    width: Math.min(Dimensions.get('window').width - 24, 320),
    height: 260,
    alignSelf: 'center',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Both hero layers: identical bounds (matches Home headerLogoImage) */
  wrongPasswordImageLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  wrongPasswordImageLayerZ0: {
    zIndex: 0,
  },
  wrongPasswordImageLayerZ1: {
    zIndex: 1,
  },
  wrongPasswordImageFill: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  step2Outer: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  step2Header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  step2BackHit: {
    padding: 10,
    marginLeft: -6,
  },
  step2BrandBlock: {
    alignItems: 'center',
    marginBottom: 10,
  },
  step2Huzz: {
    fontSize: 44,
    letterSpacing: 0.5,
    color: tokens.colors.textOnBrand,
  },
  step2UnderlineTrack: {
    marginTop: 6,
    width: 100,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    opacity: 0.85,
  },
  step2ScreenTitle: {
    textAlign: 'center',
    color: tokens.colors.textOnBrand,
  },
  step2ScreenSub: {
    textAlign: 'center',
    color: tokens.colors.textMutedOnBrand,
    marginBottom: 18,
  },
  step2OtpInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  step2ResendWrap: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  step2ResendText: {
    fontSize: 16,
    color: tokens.colors.textOnBrand,
    textDecorationLine: 'underline',
  },
  step2ForgotWrap: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 6,
  },
  step2ForgotText: {
    fontSize: 15,
    color: tokens.colors.textOnBrand,
    textDecorationLine: 'underline',
  },
  step2Card: {
    backgroundColor: 'transparent',
    borderRadius: 22,
    padding: 20,
    borderWidth: 0,
  },
  step2Label: {
    marginBottom: 6,
    color: tokens.colors.textOnBrand,
  },
  step2Hint: {
    fontSize: 13,
    color: tokens.colors.textMutedOnBrand,
    marginTop: 6,
    marginBottom: 4,
  },
  step2Input: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    backgroundColor: '#ffffff',
  },
  step2PasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  step2PasswordInput: {
    flex: 1,
  },
  step2EyeBtn: {
    padding: 10,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  step2ButtonList: {
    gap: 14,
    marginTop: 12,
    width: '100%',
  },
  step2BtnShape: {
    alignSelf: 'stretch',
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 26,
    minHeight: 56,
  },
  step2PrimaryShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#BE123C',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  step2Outline: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#1e40af',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  step2BtnLabel: {
    letterSpacing: 0.35,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 999,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  scrollContentOnboard: {
    paddingHorizontal: 4,
    paddingBottom: 28,
  },
  window: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 4,
    borderColor: '#8b4513',
    padding: 24,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    marginHorizontal: 16,
    shadowColor: '#654321',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  stepContainer: {
    gap: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#8b4513',
    marginBottom: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadowColor: '#654321',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#000000',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  buttonList: {
    gap: 12,
  },
  authButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#654321',
    shadowColor: '#654321',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  authButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#654321',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoPlaceholder: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  photoIcon: {
    fontSize: 32,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  selectText: {
    fontSize: 14,
    color: '#000000',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  interestButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.3)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  interestText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    padding: 16,
    paddingBottom: 20,
    backgroundColor: 'transparent',
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownButton: {
    flex: 1,
    justifyContent: 'center',
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  radioOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  radioOptionSelected: {
    backgroundColor: '#BE123C',
    borderColor: '#9F1239',
  },
  radioText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  radioTextSelected: {
    color: '#ffffff',
  },
  islamicNote: {
    backgroundColor: 'rgba(255, 241, 246, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(237, 66, 146, 0.28)',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  islamicNoteTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: tokens.colors.brandPinkDeep,
    marginBottom: 8,
  },
  islamicNoteText: {
    fontSize: 12,
    color: '#000000',
    lineHeight: 18,
    marginBottom: 4,
  },
  preferencesGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  preferenceOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.35)',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  preferenceOptionSelected: {
    backgroundColor: '#BE123C',
    borderColor: '#9F1239',
  },
  preferenceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  preferenceTextSelected: {
    color: '#ffffff',
  },
  hintText: {
    fontSize: 13,
    color: '#DC2626',
    fontStyle: 'italic',
    marginTop: 4,
  },
  smallButton: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#654321',
  },
  smallButtonText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 4,
    borderColor: '#8b4513',
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#8b4513',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalSearch: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#8b4513',
    padding: 12,
    fontSize: 14,
    color: '#000000',
    marginBottom: 12,
  },
  modalRow: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#654321',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  modalRowText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#654321',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingRight: 8,
    gap: 4,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
    paddingRight: 4,
  },
  eyeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#654321',
    backgroundColor: '#fffef0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#654321',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  eyeText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
  },
    windowInner: {
      backgroundColor: '#ffffff',
      borderRadius: 8,
      borderWidth: 3,
      borderColor: '#8b4513',
      padding: 12,
    },
    verifyEmailText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#000000',
    },
  nextButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#654321',
    shadowColor: '#654321',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

