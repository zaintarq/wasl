import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Shield, LogOut, Users } from 'lucide-react-native';

import { authService, userService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
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
        colors={['#FFF5F7', '#EFF6FF', '#F0FDFA']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.safe}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <HuzzPressable style={styles.headerSideBtn} onPress={goBack} haptic="light">
              <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.25} />
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
          <View style={[styles.card, styles.sectionSky, cardShadow]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapSky]}>
                <Users size={20} color="#2563EB" strokeWidth={2.2} />
              </View>
              <View style={styles.sectionHeadText}>
                <Text style={styles.sectionTitle}>Discovery preferences</Text>
                <Text style={styles.sectionHint}>Your profile and who you want to connect with</Text>
              </View>
            </View>
            <MatchPreferencesSettings />
          </View>

          <View style={[styles.card, styles.sectionEmerald, cardShadow]}>
            <View style={styles.sectionHead}>
              <View style={[styles.sectionIconWrap, styles.iconWrapEmerald]}>
                <Shield size={20} color="#047857" strokeWidth={2.2} />
              </View>
              <View style={styles.sectionHeadText}>
                <Text style={styles.sectionTitle}>Privacy</Text>
                <Text style={styles.sectionHint}>Contacts, blocked people, and who can reach you</Text>
              </View>
            </View>
            <View style={styles.btnStack}>
              <RetroButton variant="green" title="Block Contacts" onPress={() => onNavigate('contacts')} style={styles.fullBtn} />
              <RetroButton variant="gray" title="Blocked users" onPress={() => onNavigate('blockedUsers')} style={styles.fullBtn} />
            </View>
          </View>

        </>
      )}

      <View style={[styles.card, styles.sectionRose, cardShadow]}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIconWrap, styles.iconWrapRose]}>
            <LogOut size={20} color="#E11D48" strokeWidth={2.2} />
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
    backgroundColor: tokens.colors.filterBgRose,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.border,
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
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
    color: tokens.colors.text,
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
    color: tokens.colors.textSecondary,
  },
  card: {
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
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
  iconWrapEmerald: { backgroundColor: 'rgba(16, 185, 129, 0.22)' },
  iconWrapSky: { backgroundColor: 'rgba(37, 99, 235, 0.18)' },
  iconWrapRose: { backgroundColor: 'rgba(225, 29, 72, 0.18)' },
  sectionHeadText: {
    flex: 1,
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textMuted,
    marginTop: 2,
  },
  sectionEmerald: {
    backgroundColor: tokens.colors.filterBgEmerald,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderEmerald,
  },
  sectionSky: {
    backgroundColor: tokens.colors.filterBgSky,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderSky,
  },
  sectionRose: {
    backgroundColor: tokens.colors.filterBgRose,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
  },
  btnStack: {
    gap: 10,
  },
  fullBtn: {
    alignSelf: 'stretch',
    width: '100%',
  },
});
