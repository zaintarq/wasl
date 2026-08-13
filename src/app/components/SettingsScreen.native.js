import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Shield, LogOut, Users } from 'lucide-react-native';

import { authService, userService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { tokens, brandShellGradientSoft } from '../../ui/tokens';
import { shellStyles } from '../../ui/styles/shellStyles.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { MatchPreferencesSettings } from './MatchPreferencesSettings.native';

const cardShadow =
  Platform.OS === 'ios'
    ? {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      }
    : { elevation: 3 };

export function SettingsScreen({ onNavigate }) {
  const insets = useSafeAreaInsets();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const uid = authService.getCurrentUser()?.uid;
        if (!uid) {
          if (!cancelled) setLoading(false);
          return;
        }

        const roleCheck = await checkUserRoleFromAdminCollection(uid);
        if (!cancelled) {
          setIsAdmin(roleCheck.isAdmin);
          setIsStaff(roleCheck.isStaff);
          setLoading(false);
        }
      } catch (error) {
        console.error('[SettingsScreen] Load error:', error);
        if (!cancelled) {
          setIsAdmin(false);
          setIsStaff(false);
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const goBack = () => {
    if (isAdmin) onNavigate('admin');
    else if (isStaff) onNavigate('staff');
    else onNavigate('home');
  };

  const shell = (children) => (
    <View style={styles.root}>
      <LinearGradient
        colors={brandShellGradientSoft}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.safe}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={goBack} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.textOnBrand} strokeWidth={2.25} />
            </HuzzPressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>Settings</Text>
            </View>
            <View style={[styles.headerSideBtn, styles.headerRightBtn]} />
          </View>
        </View>
        {children}
      </View>
    </View>
  );

  if (loading) {
    return shell(
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={tokens.colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return shell(
    <HuzzKeyboardAwareScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: tokens.spacing.xl + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      {!isAdmin && !isStaff && (
        <>
          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapSky]}>
                <Users size={20} color={tokens.colors.textOnBrand} strokeWidth={2.2} />
              </View>
              <View style={styles.sectionHeadText}>
                <Text style={styles.sectionTitle}>Discovery preferences</Text>
                <Text style={styles.sectionHint}>Your profile and who you want to connect with</Text>
              </View>
            </View>
            <MatchPreferencesSettings />
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                <Shield size={20} color={tokens.colors.textOnBrand} strokeWidth={2.2} />
              </View>
              <View style={styles.sectionHeadText}>
                <Text style={styles.sectionTitle}>Privacy</Text>
                <Text style={styles.sectionHint}>Optional: hide people you know. Blocked users list.</Text>
              </View>
            </View>
            <View style={styles.btnStack}>
              <RetroButton variant="green" title="Block people (optional)" onPress={() => onNavigate('contacts')} style={styles.fullBtn} />
              <RetroButton variant="gray" title="Blocked users" onPress={() => onNavigate('blockedUsers')} style={styles.fullBtn} />
            </View>
          </View>

        </>
      )}

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIconWrap, styles.iconWrapRose]}>
            <LogOut size={20} color={tokens.colors.textOnBrand} strokeWidth={2.2} />
          </View>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>Account</Text>
            <Text style={styles.sectionHint}>Sign out on this device</Text>
          </View>
        </View>
        <RetroButton
          variant="danger"
          title="Sign out"
          onPress={async () => {
            await authService.signOutUser();
            onNavigate('welcome');
          }}
          style={styles.fullBtn}
        />
      </View>
    </HuzzKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.colors.bg,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    ...shellStyles.header,
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  headerSideBtn: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  headerRightBtn: {
    minWidth: 76,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    letterSpacing: -0.3,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.xl,
    gap: 12,
  },
  loadingText: {
    ...tokens.typography.body,
    color: tokens.colors.textMutedOnBrand,
  },
  card: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    backgroundColor: 'transparent',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapEmerald: { backgroundColor: tokens.colors.shellIconBtn },
  iconWrapSky: { backgroundColor: tokens.colors.shellIconBtn },
  iconWrapRose: { backgroundColor: tokens.colors.shellIconBtn },
  sectionHeadText: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textMutedOnBrand,
    marginTop: 2,
  },
  btnStack: {
    gap: 10,
  },
  fullBtn: {
    alignSelf: 'stretch',
    width: '100%',
  },
});
