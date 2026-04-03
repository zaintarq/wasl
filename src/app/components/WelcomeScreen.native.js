import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { tokens } from '../../ui/tokens';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { welcomeButtonStyles } from '../../ui/styles/welcomeButtonStyles.native';
import { WelcomeMascotBlock } from './WelcomeMascotBlock.native';
import { authService, userService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { hasPreferencesComplete, getOnboardingInitialStep } from '../../utils/profilePreferences';

/** Soft light-blue sky — calm, easy on the eyes. */
const WELCOME_BG = ['#F8FAFC', '#EFF6FF', '#DBEAFE'];
const WELCOME_BG_LOCATIONS = [0, 0.45, 1];
const WELCOME_BG_FALLBACK = '#EFF6FF';

export function WelcomeScreen({ onNavigate }) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ KaushanScript_400Regular });

  useEffect(() => {
    let unsub;
    const checkAuth = () => {
      unsub = authService.onAuthStateChange((user) => {
        try {
          if (user?.uid) {
            checkUserRoleFromAdminCollection(user.uid)
              .then((roleCheck) => {
                if (roleCheck.isAdmin) {
                  onNavigate('admin');
                  return;
                }
                if (roleCheck.isStaff) {
                  onNavigate('staff');
                  return;
                }
                userService.getUserById(user.uid)
                  .then((res) => {
                    const profile = res?.data;
                    const waliRole = String(profile?.role || '').toLowerCase().trim();
                    if (waliRole === 'wali') {
                      onNavigate('wali');
                      return;
                    }
                    const prefsOk = profile && hasPreferencesComplete(profile);
                    if (prefsOk) {
                      onNavigate('home');
                    } else {
                      onNavigate('onboarding', {
                        mode: 'signup',
                        initialStep: getOnboardingInitialStep(profile || {}),
                      });
                    }
                  })
                  .catch(() => {
                    onNavigate('home');
                  });
              })
              .catch(() => {
                userService.getUserById(user.uid)
                  .then((res) => {
                    const profile = res?.data;
                    const prefsOk = profile && hasPreferencesComplete(profile);
                    if (prefsOk) onNavigate('home');
                    else
                      onNavigate('onboarding', {
                        mode: 'signup',
                        initialStep: getOnboardingInitialStep(profile || {}),
                      });
                  })
                  .catch(() => {
                    onNavigate('home');
                  });
              });
          }
        } catch (e) {
          // ignore
        }
      });
    };
    checkAuth();
    return () => unsub && unsub();
  }, [onNavigate]);

  const paddingTop = Math.max(insets.top, 20);
  const paddingH = Math.max(tokens.spacing.screenHorizontal, 20);

  return (
    <View style={styles.root}>
      <LinearGradient colors={WELCOME_BG} locations={WELCOME_BG_LOCATIONS} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={[]} />
      <HuzzKeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollInner,
          {
            paddingTop,
            paddingBottom: Math.max(insets.bottom, 28),
            paddingHorizontal: paddingH,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.mascotWrap}>
            <WelcomeMascotBlock maxWidth={300} />
          </View>
          <View style={styles.brandBlock}>
            <Text
              style={[
                styles.brandMark,
                fontsLoaded ? styles.brandMarkFont : styles.brandMarkFallback,
              ]}
              accessibilityRole="header"
            >
              Huzz
            </Text>
            <View style={styles.brandUnderlineTrack}>
              <LinearGradient
                colors={['#1D4ED8', '#2563EB', '#3B82F6']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.brandUnderline}
              />
            </View>
          </View>
          <Text
            style={[
              styles.subtitle,
              fontsLoaded ? styles.btnFontKaushan : styles.heroTaglineSans,
              fontsLoaded ? styles.heroTaglineKaushan : null,
            ]}
          >
            Connect authentically. Date freely.
          </Text>
          <Text
            style={[
              styles.tagline,
              fontsLoaded ? styles.btnFontKaushan : styles.heroSubtagSans,
              fontsLoaded ? styles.heroSubtagKaushan : null,
            ]}
          >
            Open-source & community-driven
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <RetroButton
            variant="primary"
            onPress={() => onNavigate('onboarding', { mode: 'signup' })}
            title="Sign up with email"
            style={[welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
            textStyle={[
              welcomeButtonStyles.welcomeBtnLabel,
              fontsLoaded ? styles.btnFontKaushan : styles.btnFontFallback,
            ]}
          />
          <RetroButton
            variant="outline"
            onPress={() => onNavigate('onboarding', { mode: 'login' })}
            title="Log in"
            style={[welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.outlineOnBlue]}
            textStyle={[
              welcomeButtonStyles.welcomeBtnLabel,
              fontsLoaded ? styles.btnFontKaushan : styles.btnFontFallback,
            ]}
          />
        </View>

        <Text style={styles.footerText}>
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </HuzzKeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: WELCOME_BG_FALLBACK,
  },
  safe: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0 },
  scroll: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
    width: '100%',
    maxWidth: tokens.maxContentWidth,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xl,
  },
  hero: {
    alignItems: 'center',
    width: '100%',
    marginBottom: tokens.spacing.md,
  },
  mascotWrap: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
    marginBottom: tokens.spacing.sm,
  },
  btnFontKaushan: {
    fontFamily: 'KaushanScript_400Regular',
  },
  btnFontFallback: {
    fontWeight: '700',
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  /** Brush calligraphy (Kaushan Script) — matte ink, not metallic. */
  brandMark: {
    fontSize: 64,
    letterSpacing: 0.5,
    color: '#1c1917',
    textAlign: 'center',
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(28, 25, 23, 0.12)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
      android: {},
    }),
  },
  brandMarkFont: {
    fontFamily: 'KaushanScript_400Regular',
  },
  brandMarkFallback: {
    fontWeight: '700',
    fontStyle: 'italic',
  },
  brandUnderlineTrack: {
    marginTop: 6,
    width: 112,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    opacity: 0.85,
  },
  brandUnderline: {
    flex: 1,
    borderRadius: 2,
  },
  subtitle: {
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  /** Kaushan sizes for hero lines — slightly smaller than “Huzz” so long copy stays readable. */
  heroTaglineKaushan: {
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: 0.25,
  },
  heroSubtagKaushan: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  heroTaglineSans: {
    ...tokens.typography.body,
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: 12,
  },
  tagline: {
    color: tokens.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  heroSubtagSans: {
    ...tokens.typography.caption,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  buttonContainer: {
    width: '100%',
    gap: 14,
  },
  footerText: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    marginTop: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
    opacity: 0.95,
  },
});
