import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { authService, appealService, checkUserRoleFromAdminCollection, userService } from '../../services/firebaseService';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens, brandShellGradientSoft } from '../../ui/tokens';
import { mehramService } from '../../services/mehramService';

/**
 * When an account is hard-disabled, block the main app and let them submit an appeal.
 * Shadowbanned users are NOT shown this — they stay invisible in discovery silently.
 */
export function AccountDisabledAppealGate() {
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const evaluate = useCallback(async () => {
    const user = authService.getCurrentUser();
    if (!user?.uid || mehramService.isMehramUid(user.uid)) {
      setBlocked(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const role = await checkUserRoleFromAdminCollection(user.uid);
      if (role?.isAdmin || role?.isStaff) {
        setBlocked(false);
        return;
      }
      const res = await userService.getUserById(user.uid);
      setBlocked(res?.data?.isDisabled === true);
    } catch {
      setBlocked(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const unsub = authService.onAuthStateChange(() => {
      evaluate();
    });
    evaluate();
    return () => unsub && unsub();
  }, [evaluate]);

  const submit = async () => {
    const text = String(reason || '').trim();
    if (text.length < 8) {
      Alert.alert('Add a reason', 'Please explain why your account should be restored (at least a short sentence).');
      return;
    }
    setSubmitting(true);
    const res = await appealService.submitAppeal({ reason: text, category: 'disable' });
    setSubmitting(false);
    if (res.error) {
      Alert.alert('Could not submit', res.error);
      return;
    }
    setSubmitted(true);
    Alert.alert(
      'Appeal submitted',
      res.data?.alreadyOpen
        ? 'You already have an open appeal. Our team will review it.'
        : 'Thanks. Admins will review your appeal. You can sign out and check back later.'
    );
  };

  const signOut = async () => {
    await authService.signOutUser();
    setBlocked(false);
    setSubmitted(false);
    setReason('');
  };

  if (checking || !blocked) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <LinearGradient colors={brandShellGradientSoft} style={styles.fill}>
        <View style={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.kicker}>Account restricted</Text>
          <Text style={styles.title}>Your Wasl account is disabled</Text>
          <Text style={styles.body}>
            You can submit an appeal for review. Until an admin restores access, most app features stay
            locked.
          </Text>

          {submitted ? (
            <View style={styles.doneBox}>
              <Text style={styles.doneTitle}>Appeal in queue</Text>
              <Text style={styles.body}>We will review it as soon as we can.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Why should we restore your account?</Text>
              <TextInput
                style={styles.input}
                multiline
                value={reason}
                onChangeText={setReason}
                placeholder="Explain what happened…"
                placeholderTextColor="#94a3b8"
              />
              <RetroButton
                variant="primary"
                title={submitting ? 'Submitting…' : 'Submit appeal'}
                onPress={submit}
                disabled={submitting}
                style={styles.btn}
              />
            </>
          )}

          <RetroButton variant="outline" title="Sign out" onPress={signOut} style={styles.btn} />
          {checking ? <ActivityIndicator color={tokens.colors.accent} /> : null}
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 12,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    color: tokens.colors.textMutedOnBrand,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: tokens.colors.textOnBrand,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textMutedOnBrand,
  },
  label: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.textOnBrand,
  },
  input: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    padding: 12,
    color: tokens.colors.textOnBrand,
    backgroundColor: 'rgba(0,0,0,0.18)',
    textAlignVertical: 'top',
    fontSize: 15,
  },
  btn: { alignSelf: 'stretch', marginTop: 4 },
  doneBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    gap: 6,
  },
  doneTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
  },
});
