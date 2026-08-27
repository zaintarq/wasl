import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Alert, Linking } from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, LogOut, Users, FileMinus } from 'lucide-react-native';

import { authService, checkUserRoleFromAdminCollection } from '../../services/firebaseService';
import { tokens, brandShellGradientSoft } from '../../ui/tokens';
import { shellStyles } from '../../ui/styles/shellStyles.native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { ScreenBackHeader } from '../../ui/components/ScreenBackHeader.native';
import { MatchPreferencesSettings } from './MatchPreferencesSettings.native';

const PRIVACY_URL = 'https://zaintarq.github.io/wasl/privacy.html';
const DELETE_ACCOUNT_URL = 'https://zaintarq.github.io/wasl/delete-account.html';
const DELETE_DATA_URL = 'https://zaintarq.github.io/wasl/delete-account.html#partial';
const SUPPORT_EMAIL = 'zain.tariq@mail.com';

async function openUrl(url) {
  try {
    await Linking.openURL(url);
  } catch (error) {
    Alert.alert('Could not open link', 'Please try again, or email zain.tariq@mail.com.');
  }
}

function requestDataDeletion() {
  const email = authService.getCurrentUser()?.email || '';
  Alert.alert(
    'Request data deletion',
    'You can ask us to delete some or all of your personal data without deleting your whole account. We will email you when it is done.\n\nOpen the request page, or email support from the address on your account.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open request page',
        onPress: () => openUrl(DELETE_DATA_URL),
      },
      {
        text: 'Email support',
        onPress: () =>
          openUrl(
            `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Wasl data deletion request')}&body=${encodeURIComponent(
              `Please delete the following personal data from my Wasl account (keep my account open):\n\nAccount email: ${email}\nWhat to delete: (describe photos, chats, profile fields, etc.)\n`
            )}`
          ),
      },
    ]
  );
}

function requestAccountDeletion() {
  const email = authService.getCurrentUser()?.email || '';
  Alert.alert(
    'Delete your Wasl account',
    'This permanently deletes your account and associated personal data (safety records may be kept for a limited time). You will not be able to sign in again.\n\nContinue to the deletion page for full steps, or email support from your account address.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open deletion page',
        style: 'destructive',
        onPress: () => openUrl(DELETE_ACCOUNT_URL),
      },
      {
        text: 'Email support',
        style: 'destructive',
        onPress: () =>
          openUrl(
            `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Wasl account deletion request')}&body=${encodeURIComponent(
              `Please delete my Wasl account and associated data.\n\nAccount email: ${email}\nUsername: \n`
            )}`
          ),
      },
    ]
  );
}

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
          <ScreenBackHeader title="Settings" onBack={goBack} backLabel="Back" light />
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
              <RetroButton variant="outline" title="Privacy policy" onPress={() => openUrl(PRIVACY_URL)} style={styles.fullBtn} />
            </View>
          </View>

        </>
      )}

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIconWrap, styles.iconWrapRose]}>
            <FileMinus size={20} color={tokens.colors.textOnBrand} strokeWidth={2.2} />
          </View>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>Your data</Text>
            <Text style={styles.sectionHint}>Request deletion of some data, or your whole account</Text>
          </View>
        </View>
        <View style={styles.btnStack}>
          <RetroButton
            variant="outline"
            title="Request data deletion"
            onPress={requestDataDeletion}
            style={styles.fullBtn}
          />
          <RetroButton
            variant="danger"
            title="Delete account"
            onPress={requestAccountDeletion}
            style={styles.fullBtn}
          />
        </View>
        <Text style={styles.dataFootnote}>
          Data deletion keeps your account. Account deletion removes your login and associated personal data.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIconWrap, styles.iconWrapRose]}>
            <LogOut size={20} color={tokens.colors.textOnBrand} strokeWidth={2.2} />
          </View>
          <View style={styles.sectionHeadText}>
            <Text style={styles.sectionTitle}>Session</Text>
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
  dataFootnote: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: tokens.colors.textMutedOnBrand,
  },
});
