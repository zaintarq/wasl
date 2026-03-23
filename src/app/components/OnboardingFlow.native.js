import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert, Modal, Platform, Animated, Dimensions } from 'react-native';
import { authService, userService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { detectCountryCity } from '../../services/locationService.native.js';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { ArrowLeft } from 'lucide-react-native';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { WelcomeMascotBlock } from './WelcomeMascotBlock.native';
import { COUNTRIES } from '../../utils/countries';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { RetroInput } from '../../ui/components/RetroInput.native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { hasPreferencesComplete, getOnboardingInitialStep } from '../../utils/profilePreferences';

WebBrowser.maybeCompleteAuthSession();

const WELCOME_BG = ['#F8FAFC', '#EFF6FF', '#DBEAFE'];
const WELCOME_BG_LOCATIONS = [0, 0.45, 1];
const WELCOME_BG_FALLBACK = '#EFF6FF';

/** Titles match Welcome / step 2 — Kaushan + soft blue card */
const ONBOARDING_STEP_COPY = {
  3: {
    title: 'Set your preferences',
    subtitle: 'Then you can browse profiles — add a photo in Profile to swipe',
  },
};

export function OnboardingFlow({ onNavigate, mode = 'signup', initialStep: initialStepProp }) {
  const [fontsLoaded] = useFonts({ KaushanScript_400Regular });
  const [step, setStep] = useState(2); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [countryOfResidence, setCountryOfResidence] = useState('');
  const [city, setCity] = useState('');
  const [gender, setGender] = useState(''); // 'Male', 'Female', 'Other'
  const [religion, setReligion] = useState(''); // 'Muslim', 'Non-Muslim', or other
  const [genderPreferences, setGenderPreferences] = useState([]); // ['boys'], ['girls'], or ['boys', 'girls']
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
  const [manualLocationOpen, setManualLocationOpen] = useState(false);
  const mountedRef = useRef(true);
  const authInFlightRef = useRef(false);

  const googleAuthCfg = Constants?.expoConfig?.extra?.googleAuth || Constants?.manifest?.extra?.googleAuth || {};
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    expoClientId: googleAuthCfg.expoClientId,
    iosClientId: googleAuthCfg.iosClientId,
    androidClientId: googleAuthCfg.androidClientId,
    webClientId: googleAuthCfg.webClientId,
    scopes: ['profile', 'email'],
    prompt: 'select_account',
  });

  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = Platform.OS === 'ios' ? await AppleAuthentication.isAvailableAsync() : false;
        if (!cancelled) setAppleAvailable(!!ok);
      } catch {
        if (!cancelled) setAppleAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Welcome / navigation: mode + optional initialStep (3–6 = resume after auth, skip login card)
  useEffect(() => {
    setIsLogin(mode === 'login');
    setLoading(false);
    authInFlightRef.current = false;
    const resumeStep =
      typeof initialStepProp === 'number' && initialStepProp === 3 ? 3 : 2;
    setStep(resumeStep);
    if (resumeStep === 2) {
      setEmail('');
      setPassword('');
      setName('');
      setShowPassword(false);
      setAuthSubStep('email');
      setSignupSessionId('');
      setOtpCode('');
      setForgotPasswordActive(false);
      setResetSessionId('');
    }
  }, [mode, initialStepProp]);

  // Prefill profile when opening at step 3 (returning user)
  useEffect(() => {
    if (initialStepProp !== 3) return;
    const uid = authService.getCurrentUser()?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await userService.getUserById(uid);
        const p = res?.data;
        if (!p || cancelled) return;
        if (p.name) setName(String(p.name));
        if (p.gender) setGender(String(p.gender));
        if (p.religion) setReligion(String(p.religion));
        if (Array.isArray(p.genderPreferences)) setGenderPreferences(p.genderPreferences);
        if (p.countryOfResidence) setCountryOfResidence(String(p.countryOfResidence));
        if (p.city) setCity(String(p.city));
      } catch (e) {
        console.warn('[OnboardingFlow] Prefill profile:', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialStepProp]);

  // Auto-redirect admins/staff/wali when on preferences step (after auth)
  useEffect(() => {
    if (step === 3) {
      const checkRoleAndRedirect = async () => {
        try {
          const user = authService.getCurrentUser();
          if (user?.uid) {
            // Check role from admin collection FIRST
            const roleCheck = await checkUserRoleFromAdminCollection(user.uid);
            if (roleCheck.isAdmin) {
              onNavigate('admin');
              return;
            } else if (roleCheck.isStaff) {
              onNavigate('staff');
              return;
            }
            
            // Check if wali (still in users collection)
            const profileRes = await userService.getUserById(user.uid);
            const profile = profileRes?.data || {};
            const waliRole = String(profile?.role || '').toLowerCase().trim();
            if (waliRole === 'wali') {
              onNavigate('wali');
              return;
            }
          }
        } catch (e) {
          console.warn('[OnboardingFlow] Role check error:', e);
        }
      };
      checkRoleAndRedirect();
    }
  }, [step]);

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
        // Don't log permission denied - it's expected if user hasn't granted permission
        const updateResult = await userService.updateMyLocation(u.uid, { locationPermission: res.permission });
        if (updateResult.error && !updateResult.error.includes('permission') && !updateResult.error.includes('not authenticated')) {
          console.error('[OnboardingFlow] Location permission update error:', updateResult.error);
        }
        // Manual fallback UI if denied.
        setManualLocationOpen(true);
      }
    } catch (err) {
      console.error('[OnboardingFlow] Location sync error:', err);
      Alert.alert('Location Error', `Failed to detect location: ${err.message || err}`);
    }
  };

  const handleAuth = async (authType) => {
    if (authType === 'email') {
      setStep(2); // Go to email login/signup
      setIsLogin(false);
    } else {
      // Other auth methods (Google, Apple, Phone) - implement later
      Alert.alert('Coming Soon', 'This authentication method will be available soon!');
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

    const profileRes = await userService.getUserById(user.uid);
    const profile = profileRes?.data || {};
    const waliRole = String(profile?.role || '').toLowerCase().trim();
    if (waliRole === 'wali') {
      onNavigate('wali');
      return;
    }

    await authService.refreshCurrentUser();
    const profileRes2 = await userService.getUserById(user.uid);
    const p2 = profileRes2?.data || {};
    if (!hasPreferencesComplete(p2)) {
      const initialStep = getOnboardingInitialStep(p2);
      onNavigate('onboarding', { mode: 'login', initialStep });
      return;
    }
    onNavigate('home');
  };

  const performEmailLogin = async (normalizedEmail) => {
    const { error } = await withTimeout(authService.signIn(normalizedEmail, password), 30000);
    if (error) {
      Alert.alert('Login Failed', error);
      return;
    }
    await routeAfterEmailAuthSuccess();
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

  /** Sign up: name step → create account (after OTP + password). */
  const handleSignupNameSubmit = async () => {
    if (!String(name || '').trim()) {
      Alert.alert('Error', 'Please enter your name');
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
      const { error, verificationEmailSent } = await authService.finalizeSignupWithSession(
        signupSessionId,
        password,
        name.trim()
      );
      if (error) {
        Alert.alert('Sign Up Failed', error);
        return;
      }
      syncLocationAfterAuth();
      Alert.alert(
        'Success',
        verificationEmailSent
          ? 'Account created! Next, set your preferences.'
          : 'Account created! Next, set your preferences.'
      );
      setStep(3);
    } catch (error) {
      console.warn('Signup finalize error:', error?.message || error);
      if (isTimeoutError(error)) {
        const maybeUser = authService.getCurrentUser();
        if (maybeUser) {
          Alert.alert('Success', 'Account created! Now add your photos.');
          setStep(3);
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
    return handleAuthPasswordSubmit();
  };

  const finishSocialAuth = async (user) => {
    try {
      if (!user?.uid) return;
      syncLocationAfterAuth();
      const res = await userService.getUserById(user.uid);
      const p = res?.data || null;
      if (hasPreferencesComplete(p || {})) {
        onNavigate('home');
        return;
      }
      setStep(getOnboardingInitialStep(p || {}));
    } catch {
      onNavigate('home');
    }
  };

  useEffect(() => {
    (async () => {
      if (googleResponse?.type !== 'success') return;
      if (authInFlightRef.current) return;
      authInFlightRef.current = true;
      setLoading(true);
      try {
        const idToken = googleResponse?.authentication?.idToken || googleResponse?.params?.id_token;
        const accessToken = googleResponse?.authentication?.accessToken || googleResponse?.params?.access_token;
        const { user, error } = await authService.signInWithGoogle({ idToken, accessToken });
        if (error) Alert.alert('Google sign-in failed', error);
        else await finishSocialAuth(user);
      } finally {
        authInFlightRef.current = false;
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  const handleAppleSignIn = async () => {
    if (!appleAvailable) return;
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setLoading(true);
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const res = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      const { user, error } = await authService.signInWithApple({
        identityToken: res.identityToken,
        rawNonce,
        fullName: res.fullName,
      });
      if (error) Alert.alert('Apple sign-in failed', error);
      else await finishSocialAuth(user);
    } catch (e) {
      Alert.alert('Apple sign-in failed', e?.message || 'Failed to sign in with Apple.');
    } finally {
      authInFlightRef.current = false;
      setLoading(false);
    }
  };

  const nextStep = async () => {
    if (step !== 3) return;

    if (!religion) {
      Alert.alert('Required', 'Please select your religion.');
      return;
    }
    if (!gender) {
      Alert.alert('Required', 'Please select your gender.');
      return;
    }
    if (religion !== 'Muslim' && genderPreferences.length === 0) {
      Alert.alert('Required', 'Please select at least one preference.');
      return;
    }
    const user = authService.getCurrentUser();
    if (!user?.uid) {
      Alert.alert('Required', 'Sign in first to save your preferences.');
      return;
    }
    setLoading(true);
    try {
      const { error: saveErr } = await userService.updateUser(user.uid, {
        gender: String(gender || '').trim(),
        religion: String(religion || '').trim(),
        genderPreferences: Array.isArray(genderPreferences) ? genderPreferences : [],
        genderPreferencesSet: true,
      });
      if (saveErr) {
        Alert.alert('Could not save', saveErr);
        return;
      }
      await authService.refreshCurrentUser();
      onNavigate('home');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // Steps: 2 = auth, 3 = preferences → home (photos & rest of profile from Profile tab)
  const FLOW_LAST_STEP = 3;
  const progress = ((Math.min(step, FLOW_LAST_STEP) - 2) / (FLOW_LAST_STEP - 2)) * 100;

  const kFont = fontsLoaded ? { fontFamily: 'KaushanScript_400Regular' } : { fontWeight: '700' };

  return (
    <View style={{ flex: 1, backgroundColor: WELCOME_BG_FALLBACK }}>
      <LinearGradient colors={WELCOME_BG} locations={WELCOME_BG_LOCATIONS} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={[styles.container, styles.containerOnGradient]} edges={['top', 'bottom']}>
        {step !== 2 && (
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
          </View>
        )}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            step === 2 && styles.scrollContentStep2,
            step !== 2 && styles.scrollContentOnboard,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 2: matches Welcome — mascot, Huzz, light blue, Kaushan, back */}
          {step === 2 && (
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

              <View style={styles.step2BrandBlock}>
                <Text style={[styles.step2Huzz, fontsLoaded && { fontFamily: 'KaushanScript_400Regular' }]}>
                  Huzz
                </Text>
                <View style={styles.step2UnderlineTrack}>
                  <LinearGradient
                    colors={['#1D4ED8', '#2563EB', '#3B82F6']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              </View>

              <Text style={[styles.step2ScreenTitle, kFont, { fontSize: 28, marginBottom: 6 }]}>
                {forgotPasswordActive && authSubStep === 'email' && 'Reset password'}
                {forgotPasswordActive && authSubStep === 'otp' && 'Check your email'}
                {forgotPasswordActive && authSubStep === 'password' && 'New password'}
                {!forgotPasswordActive && authSubStep === 'email' && (isLogin ? 'Login' : 'Sign Up')}
                {!forgotPasswordActive && authSubStep === 'otp' && 'Check your email'}
                {!forgotPasswordActive && authSubStep === 'password' && (isLogin ? 'Welcome back' : 'Almost there')}
                {authSubStep === 'name' && 'What’s your name?'}
              </Text>
              <Text style={[styles.step2ScreenSub, kFont, { fontSize: 17 }]}>
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
              </Text>

              <View style={styles.step2Card}>
                <View style={styles.form}>
                  {authSubStep === 'email' && (
                    <>
                      <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>Email</Text>
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
                      <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>6-digit code</Text>
                      <RetroInput
                        placeholder="000000"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={otpCode}
                        onChangeText={(t) => setOtpCode(t.replace(/[^0-9]/g, ''))}
                        style={[styles.step2Input, styles.step2OtpInput]}
                      />
                      <TouchableOpacity onPress={handleResendOtp} disabled={loading} style={styles.step2ResendWrap}>
                        <Text style={[styles.step2ResendText, kFont]}>Resend code</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {authSubStep === 'password' && (
                    <>
                      <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>
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
                        >
                          <Text style={styles.eyeText}>{showPassword ? '●' : '○'}</Text>
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
                          <Text style={[styles.step2ForgotText, kFont]}>Forgot password?</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {authSubStep === 'name' && !isLogin && (
                    <>
                      <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>Name</Text>
                      <RetroInput
                        placeholder="Enter your name"
                        value={name}
                        onChangeText={setName}
                        style={styles.step2Input}
                        autoCapitalize="words"
                      />
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
                            ? 'Sign Up'
                            : forgotPasswordActive
                              ? 'Update password'
                              : isLogin
                                ? 'Login'
                                : 'Continue'
                  }
                  style={[styles.step2BtnShape, styles.step2PrimaryShadow]}
                  textStyle={[styles.step2BtnLabel, kFont, { fontSize: 19 }]}
                />
                {authSubStep === 'email' && !forgotPasswordActive && (
                  <RetroButton
                    variant="outline"
                    onPress={() => {
                      setIsLogin(!isLogin);
                      setEmail('');
                      setPassword('');
                      setName('');
                      setOtpCode('');
                      setSignupSessionId('');
                      setAuthSubStep('email');
                    }}
                    title={isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'}
                    style={[styles.step2BtnShape, styles.step2Outline]}
                    textStyle={[styles.step2BtnLabel, kFont, { fontSize: 16 }]}
                  />
                )}
              </View>
            </View>
          )}

          {step !== 2 && (
        <View style={styles.step2Outer}>
          <View style={styles.step2Header}>
            <HuzzPressable
              onPress={() => {
                if (step === 3) setStep(2);
              }}
              style={styles.step2BackHit}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ArrowLeft size={26} color={tokens.colors.text} strokeWidth={2.25} />
            </HuzzPressable>
          </View>

          <WelcomeMascotBlock maxWidth={200} />

          <View style={styles.step2BrandBlock}>
            <Text style={[styles.step2Huzz, fontsLoaded && { fontFamily: 'KaushanScript_400Regular' }]}>Huzz</Text>
            <View style={styles.step2UnderlineTrack}>
              <LinearGradient
                colors={['#1D4ED8', '#2563EB', '#3B82F6']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>

          {step === 3 && (
            <>
              <Text style={[styles.step2ScreenTitle, kFont, { fontSize: 28, marginBottom: 6 }]}>
                {ONBOARDING_STEP_COPY[3].title}
              </Text>
              <Text style={[styles.step2ScreenSub, kFont, { fontSize: 17 }]}>
                {ONBOARDING_STEP_COPY[3].subtitle}
              </Text>
            </>
          )}

          <View style={styles.step2Card}>
          {/* Step 3: Gender/Religion/Sexuality Preferences */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <View style={styles.form}>
                {/* Religion Selection */}
                <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>Religion *</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={[styles.radioOption, religion === 'Muslim' && styles.radioOptionSelected]}
                    onPress={() => {
                      setReligion('Muslim');
                      // Auto-set gender preferences to opposite sex only for Muslims
                      if (gender === 'Male') {
                        setGenderPreferences(['girls']);
                      } else if (gender === 'Female') {
                        setGenderPreferences(['boys']);
                      }
                    }}
                  >
                    <Text style={[styles.radioText, religion === 'Muslim' && styles.radioTextSelected]}>Muslim</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioOption, religion === 'Non-Muslim' && styles.radioOptionSelected]}
                    onPress={() => setReligion('Non-Muslim')}
                  >
                    <Text style={[styles.radioText, religion === 'Non-Muslim' && styles.radioTextSelected]}>Non-Muslim</Text>
                  </TouchableOpacity>
                </View>

                {/* Gender Selection */}
                <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>Gender *</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={[styles.radioOption, gender === 'Male' && styles.radioOptionSelected]}
                    onPress={() => {
                      setGender('Male');
                      // Auto-update preferences for Muslims
                      if (religion === 'Muslim') {
                        setGenderPreferences(['girls']);
                      }
                    }}
                  >
                    <Text style={[styles.radioText, gender === 'Male' && styles.radioTextSelected]}>Male</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioOption, gender === 'Female' && styles.radioOptionSelected]}
                    onPress={() => {
                      setGender('Female');
                      // Auto-update preferences for Muslims
                      if (religion === 'Muslim') {
                        setGenderPreferences(['boys']);
                      }
                    }}
                  >
                    <Text style={[styles.radioText, gender === 'Female' && styles.radioTextSelected]}>Female</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioOption, gender === 'Other' && styles.radioOptionSelected]}
                    onPress={() => setGender('Other')}
                  >
                    <Text style={[styles.radioText, gender === 'Other' && styles.radioTextSelected]}>Other</Text>
                  </TouchableOpacity>
                </View>

                {/* Gender Preferences */}
                {religion === 'Muslim' ? (
                  <View>
                    <View style={styles.islamicNote}>
                      <Text style={styles.islamicNoteTitle}>Islamic Guidance</Text>
                      <Text style={styles.islamicNoteText}>
                        "And of His signs is that He created for you from yourselves mates that you may find tranquility in them; and He placed between you affection and mercy." (Quran 30:21)
                      </Text>
                      <Text style={styles.islamicNoteText}>
                        In accordance with Islamic teachings, Muslims are matched with the opposite gender only.
                      </Text>
                    </View>
                    <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>Interested in (auto-set for Muslims)</Text>
                    <View style={styles.preferencesGroup}>
                      <View style={[styles.preferenceOption, styles.preferenceOptionSelected]}>
                        <Text style={styles.preferenceTextSelected}>
                          {gender === 'Male' ? 'Girls' : gender === 'Female' ? 'Boys' : 'Opposite Gender'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={[styles.step2Label, kFont, { fontSize: 16 }]}>Interested in *</Text>
                    <View style={styles.preferencesGroup}>
                      <TouchableOpacity
                        style={[styles.preferenceOption, genderPreferences.includes('boys') && styles.preferenceOptionSelected]}
                        onPress={() => {
                          if (genderPreferences.includes('boys')) {
                            setGenderPreferences(genderPreferences.filter(p => p !== 'boys'));
                          } else {
                            setGenderPreferences([...genderPreferences, 'boys']);
                          }
                        }}
                      >
                        <Text style={[styles.preferenceText, genderPreferences.includes('boys') && styles.preferenceTextSelected]}>Boys</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.preferenceOption, genderPreferences.includes('girls') && styles.preferenceOptionSelected]}
                        onPress={() => {
                          if (genderPreferences.includes('girls')) {
                            setGenderPreferences(genderPreferences.filter(p => p !== 'girls'));
                          } else {
                            setGenderPreferences([...genderPreferences, 'girls']);
                          }
                        }}
                      >
                        <Text style={[styles.preferenceText, genderPreferences.includes('girls') && styles.preferenceTextSelected]}>Girls</Text>
                      </TouchableOpacity>
                    </View>
                    {genderPreferences.length === 0 && (
                      <Text style={[styles.hintText, kFont]}>Please select at least one preference</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          )}
          </View>
        </View>
          )}
      </ScrollView>

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

      {/* Manual location fallback modal (only if permission denied) */}
      <Modal visible={manualLocationOpen} animationType="slide" transparent onRequestClose={() => setManualLocationOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set your location</Text>
            <Text style={{ fontWeight: 'bold', color: '#000000', marginBottom: 10 }}>
              Enable location for nearby matches. If you can’t, enter your city + country.
            </Text>

            <Text style={styles.label}>City</Text>
            <RetroInput placeholder="City" value={city} onChangeText={setCity} />

            <Text style={styles.label}>Country</Text>
            <TouchableOpacity style={[styles.input, styles.dropdownButton]} onPress={() => setCountryModalOpen(true)}>
              <Text style={styles.dropdownText}>{countryOfResidence ? countryOfResidence : 'Select country'}</Text>
            </TouchableOpacity>

            <View style={styles.buttonList}>
              <RetroButton
                variant="blue"
                title="Save"
                onPress={async () => {
                  try {
                    const u = authService.getCurrentUser();
                    if (!u?.uid) return;
                    await userService.updateMyLocation(u.uid, {
                      country: countryOfResidence,
                      city,
                      locationPermission: 'denied',
                    });
                    setManualLocationOpen(false);
                  } catch (e) {
                    Alert.alert('Error', e?.message || 'Failed to save.');
                  }
                }}
              />
              <RetroButton variant="gray" title="Not now" onPress={() => setManualLocationOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Next — same Retro primary as sign-up step */}
      {step !== 2 && (
        <View style={styles.footer}>
          <RetroButton
            variant="primary"
            onPress={nextStep}
            disabled={loading}
            title={
              loading ? 'Saving...' : 'Discover people'
            }
            style={[styles.step2BtnShape, styles.step2PrimaryShadow]}
            textStyle={[styles.step2BtnLabel, kFont, { fontSize: 19 }]}
          />
        </View>
      )}
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
    color: '#1c1917',
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
    color: '#111827',
  },
  step2ScreenSub: {
    textAlign: 'center',
    color: '#475569',
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
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  step2ForgotWrap: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 6,
  },
  step2ForgotText: {
    fontSize: 15,
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  step2Card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  step2Label: {
    marginBottom: 6,
    color: '#0f172a',
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
    borderColor: 'rgba(37, 99, 235, 0.28)',
    borderRadius: 999,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2563EB',
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
    backgroundColor: 'rgba(239, 246, 255, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.22)',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  islamicNoteTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1D4ED8',
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

