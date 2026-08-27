import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { HuzzKeyboardAwareScrollView } from '../../ui/components/HuzzKeyboardAwareScrollView.native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, LogOut, Users, FileMinus } from 'lucide-react-native';

import { authService, checkUserRoleFromAdminCollection, privacyAdminService, userService } from '../../services/firebaseService';
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

async function submitInAppDeletion(type) {
  const label = type === 'partial' ? 'data deletion' : 'account deletion';
  Alert.alert(
    type === 'partial' ? 'Request data deletion' : 'Ask admins to delete account',
    type === 'partial'
      ? 'We will send this request to Wasl admins. You can keep your account. You will get an email when it is done.'
      : 'Prefer instant delete? Use Delete account now (password required). This option queues an admin request instead (processed within 30 days).',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit request',
        style: type === 'partial' ? 'default' : 'destructive',
        onPress: async () => {
          const res = await privacyAdminService.submitDeletionRequest({ type });
          if (res.error) {
            Alert.alert('Request failed', res.error);
            return;
          }
          Alert.alert(
            'Request submitted',
            res.data?.alreadyOpen
              ? `You already have an open ${label} request. Admins will process it.`
              : res.data?.ackEmailSent
                ? `We emailed you a confirmation. We aim to process this within 30 days and will email again when it is done.`
                : `Your ${label} request is in the admin queue. We aim to process it within 30 days.`
          );
        },
      },
      {
        text: 'Open web page',
        onPress: () => openUrl(type === 'partial' ? DELETE_DATA_URL : DELETE_ACCOUNT_URL),
      },
      {
        text: 'Email support',
        onPress: () => {
          const email = authService.getCurrentUser()?.email || '';
          if (type === 'partial') {
            openUrl(
              `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Wasl data deletion request')}&body=${encodeURIComponent(
                `Please delete the following personal data from my Wasl account (keep my account open):\n\nAccount email: ${email}\nWhat to delete: (describe photos, chats, profile fields, etc.)\n`
              )}`
            );
          } else {
            openUrl(
              `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Wasl account deletion request')}&body=${encodeURIComponent(
                `Please delete my Wasl account and associated data.\n\nAccount email: ${email}\nUsername: \n`
              )}`
            );
          }
        },
      },
    ]
  );
}

function requestDataDeletion() {
  submitInAppDeletion('partial');
}

function requestAccountDeletionQueue() {
  submitInAppDeletion('account');
}

async function requestDataExport() {
  Alert.alert(
    'Download my data',
    'We will build a JSON/ZIP packet of your Wasl profile, stories, reports, and messages you sent. Links expire in 7 days.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Build packet',
        onPress: async () => {
          const res = await privacyAdminService.exportUserDataPacket();
          if (res.error) {
            Alert.alert('Export failed', res.error);
            return;
          }
          const zipUrl = res.data?.zipUrl;
          const jsonUrl = res.data?.jsonUrl;
          Alert.alert(
            'Your data is ready',
            `About ${Math.round((res.data?.bytes || 0) / 1024)} KB. Open ZIP or JSON to download.`,
            [
              { text: 'OK', style: 'cancel' },
              zipUrl
                ? { text: 'Open ZIP', onPress: () => openUrl(zipUrl) }
                : null,
              jsonUrl
                ? { text: 'Open JSON', onPress: () => openUrl(jsonUrl) }
                : null,
            ].filter(Boolean)
          );
        },
      },
    ]
  );
}

export function SettingsScreen({ onNavigate }) {
  const insets = useSafeAreaInsets();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState({ requests: [], dsar: null });

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

        const [roleCheck, delRes, userRes] = await Promise.all([
          checkUserRoleFromAdminCollection(uid),
          privacyAdminService.listMyDeletionRequests({ limitCount: 10 }),
          userService.getUserById(uid),
        ]);
        if (!cancelled) {
          setIsAdmin(roleCheck.isAdmin);
          setIsStaff(roleCheck.isStaff);
          const u = userRes?.data || {};
          const expiresMs =
            u.lastDsarExportExpiresAt?.toMillis?.() ??
            u.lastDsarExportExpiresAt?.seconds * 1000 ??
            null;
          const exportAt =
            u.lastDsarExportAt?.toMillis?.() ?? u.lastDsarExportAt?.seconds * 1000 ?? null;
          setPrivacyStatus({
            requests: delRes.data || [],
            dsar: exportAt
              ? {
                  exportedAt: exportAt,
                  expiresAt: expiresMs,
                  bytes: u.lastDsarExportBytes || null,
                  expired: expiresMs ? Date.now() > expiresMs : false,
                }
              : null,
          });
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

  const openSelfDelete = () => {
    Alert.alert(
      'Delete account permanently?',
      'This removes your login and personal data now (after password confirmation). You cannot undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setDeletePassword('');
            setDeleteConfirm('');
            setDeleteOpen(true);
          },
        },
        {
          text: 'Ask admins instead',
          onPress: requestAccountDeletionQueue,
        },
      ]
    );
  };

  const runSelfWipe = async () => {
    const user = authService.getCurrentUser();
    const email = String(user?.email || '').trim();
    if (!email) {
      Alert.alert('Missing email', 'This account has no email/password sign-in. Use “Ask admins instead” or email support.');
      return;
    }
    if (!deletePassword) {
      Alert.alert('Password required', 'Enter your password to confirm it is you.');
      return;
    }
    if (String(deleteConfirm || '').trim().toUpperCase() !== 'DELETE') {
      Alert.alert('Confirm', 'Type DELETE in capitals to confirm.');
      return;
    }

    setDeleting(true);
    try {
      const { error: reauthError } = await authService.reauthenticateWithEmailPassword(email, deletePassword);
      if (reauthError) {
        Alert.alert('Could not verify', reauthError);
        return;
      }
      try {
        await user.getIdToken(true);
      } catch {
        /* continue with existing token */
      }

      const res = await privacyAdminService.selfWipeAccount({ confirm: 'DELETE' });
      if (res.error) {
        Alert.alert('Deletion failed', res.error);
        return;
      }

      setDeleteOpen(false);
      Alert.alert(
        'Account deleted',
        res.data?.emailSent
          ? 'Your account was wiped. We sent a confirmation email.'
          : 'Your account was wiped.'
      );
      try {
        await authService.signOutUser();
      } catch {
        /* auth user may already be gone */
      }
      onNavigate('welcome');
    } finally {
      setDeleting(false);
    }
  };

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
            variant="gray"
            title="Download my data"
            onPress={requestDataExport}
            style={styles.fullBtn}
          />
          <RetroButton
            variant="outline"
            title="Request data deletion"
            onPress={requestDataDeletion}
            style={styles.fullBtn}
          />
          <RetroButton
            variant="danger"
            title="Delete account now"
            onPress={openSelfDelete}
            style={styles.fullBtn}
          />
          <RetroButton
            variant="outline"
            title="Ask admins to delete (queue)"
            onPress={requestAccountDeletionQueue}
            style={styles.fullBtn}
          />
        </View>
        <Text style={styles.dataFootnote}>
          Delete account now re-checks your password and wipes data immediately. The admin queue is a
          backup (ack email, processed within 30 days). Download my data builds a DSAR JSON/ZIP packet.
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Your privacy status</Text>
        {privacyStatus.dsar ? (
          <Text style={styles.statusLine}>
            Last data export:{' '}
            {new Date(privacyStatus.dsar.exportedAt).toLocaleString()}
            {privacyStatus.dsar.expired
              ? ' · links expired'
              : privacyStatus.dsar.expiresAt
                ? ` · links until ${new Date(privacyStatus.dsar.expiresAt).toLocaleString()}`
                : ''}
            {privacyStatus.dsar.bytes
              ? ` · ~${Math.round(privacyStatus.dsar.bytes / 1024)} KB`
              : ''}
          </Text>
        ) : (
          <Text style={styles.statusLine}>No data export yet.</Text>
        )}
        {!privacyStatus.requests?.length ? (
          <Text style={styles.statusLine}>No deletion requests on file.</Text>
        ) : (
          privacyStatus.requests.slice(0, 5).map((req) => (
            <Text key={req.id} style={styles.statusLine}>
              {req.type === 'partial' ? 'Data deletion' : 'Account deletion'}: {String(req.status || 'open')}
              {req.status === 'done' && req.processedAt
                ? ` · completed ${new Date(req.processedAt).toLocaleString()}`
                : req.createdAt
                  ? ` · submitted ${new Date(req.createdAt).toLocaleString()}`
                  : ''}
              {req.selfWiped ? ' · self-wipe' : ''}
            </Text>
          ))
        )}
      </View>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !deleting && setDeleteOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e?.stopPropagation?.()}>
            <Text style={styles.modalTitle}>Confirm account deletion</Text>
            <Text style={styles.modalBody}>
              Enter your password, then type DELETE. This permanently removes your Wasl login and
              personal data.
            </Text>
            <Text style={styles.modalLabel}>Password</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              autoCapitalize="none"
              value={deletePassword}
              onChangeText={setDeletePassword}
              editable={!deleting}
              placeholder="Your password"
              placeholderTextColor={tokens.colors.textMuted}
            />
            <Text style={styles.modalLabel}>Type DELETE</Text>
            <TextInput
              style={styles.modalInput}
              autoCapitalize="characters"
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              editable={!deleting}
              placeholder="DELETE"
              placeholderTextColor={tokens.colors.textMuted}
            />
            <View style={styles.modalActions}>
              <RetroButton
                variant="outline"
                title="Cancel"
                onPress={() => setDeleteOpen(false)}
                style={styles.modalBtn}
                disabled={deleting}
              />
              <RetroButton
                variant="danger"
                title={deleting ? 'Deleting…' : 'Wipe my account'}
                onPress={runSelfWipe}
                style={styles.modalBtn}
                disabled={deleting}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  statusLine: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.colors.textMutedOnBrand,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
    marginBottom: 6,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  modalBtn: { flex: 1 },
});
