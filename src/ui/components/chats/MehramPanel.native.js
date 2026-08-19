import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { HuzzPressable } from '../HuzzPressable.native';
import { tokens } from '../../tokens';
import { mehramService } from '../../../services/mehramService';

const STEPS = {
  intro: 'intro',
  permission: 'permission',
  link: 'link',
  manage: 'manage',
};

export function MehramPanel({
  visible,
  onClose,
  matchId,
  mehram,
  myProfile,
  canAddMehram,
  chatDurationHint,
}) {
  const [step, setStep] = useState(STEPS.intro);
  const [permission, setPermission] = useState('view');
  const [inviteUrl, setInviteUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [busy, setBusy] = useState(false);

  const isActive = !!mehram?.active;

  useEffect(() => {
    if (!visible) return;
    if (isActive) {
      setStep(STEPS.manage);
      setPermission(mehram.permission === 'reply' ? 'reply' : 'view');
    } else {
      setStep(STEPS.intro);
      setPermission('view');
      setInviteUrl('');
      setExpiresAt(null);
    }
  }, [visible, isActive, mehram?.permission]);

  const permissionLabel = useMemo(
    () => (permission === 'reply' ? 'Supervision + Reply' : 'Supervision only'),
    [permission]
  );

  const handleCreateInvite = useCallback(async () => {
    if (!matchId) return;
    setBusy(true);
    const { data, error } = await mehramService.createInvite(matchId, permission);
    setBusy(false);
    if (error) {
      Alert.alert('Could not create link', error);
      return;
    }
    setInviteUrl(data?.inviteUrl || '');
    setExpiresAt(data?.expiresAt || null);
    setStep(STEPS.link);
  }, [matchId, permission]);

  const handleRegenerate = useCallback(async () => {
    if (!matchId) return;
    setBusy(true);
    const { data, error } = await mehramService.regenerateInvite(matchId);
    setBusy(false);
    if (error) {
      Alert.alert('Could not regenerate link', error);
      return;
    }
    setInviteUrl(data?.inviteUrl || '');
    setExpiresAt(data?.expiresAt || null);
    setStep(STEPS.link);
  }, [matchId]);

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    Alert.alert('Copied', 'Mehram link copied to clipboard.');
  }, [inviteUrl]);

  const handleShare = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: `You're invited to supervise my Huzz conversation.\n\nInstall or open the Huzz app, then tap this link:\n\n${inviteUrl}`,
      });
    } catch {
      /* ignore */
    }
  }, [inviteUrl]);

  const handleChangePermission = useCallback(async () => {
    if (!matchId) return;
    const next = permission === 'reply' ? 'view' : 'reply';
    setBusy(true);
    const { error } = await mehramService.updatePermission(matchId, next);
    setBusy(false);
    if (error) {
      Alert.alert('Could not update', error);
      return;
    }
    setPermission(next);
    Alert.alert('Updated', next === 'reply' ? 'Mehram can now reply.' : 'Mehram can view only.');
  }, [matchId, permission]);

  const handleRevoke = useCallback(() => {
    Alert.alert('Revoke Mehram access?', 'They will immediately lose access to this conversation.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const { error } = await mehramService.revokeAccess(matchId);
          setBusy(false);
          if (error) {
            Alert.alert('Could not revoke', error);
            return;
          }
          onClose?.();
        },
      },
    ]);
  }, [matchId, onClose]);

  const renderIntro = () => (
    <View style={styles.section}>
      <Text style={styles.heroEmoji}>🛡️</Text>
      <Text style={styles.title}>Add a Mehram</Text>
      <Text style={styles.subtitle}>
        Keep someone you trust in the conversation when you want them to be.
      </Text>
      {!canAddMehram ? (
        <Text style={styles.hint}>{chatDurationHint}</Text>
      ) : null}
      <HuzzPressable
        style={[styles.primaryBtn, !canAddMehram && styles.btnDisabled]}
        disabled={!canAddMehram}
        onPress={() => setStep(STEPS.permission)}
        haptic="light"
      >
        <Text style={styles.primaryBtnText}>Add Mehram</Text>
      </HuzzPressable>
    </View>
  );

  const renderPermission = () => (
    <View style={styles.section}>
      <Text style={styles.title}>How involved should they be?</Text>
      <HuzzPressable
        style={[styles.option, permission === 'view' && styles.optionActive]}
        onPress={() => setPermission('view')}
        haptic="light"
      >
        <Text style={styles.optionTitle}>👁 Supervision only</Text>
        <Text style={styles.optionBody}>
          They can view the conversation and use safety controls. They cannot send messages.
        </Text>
      </HuzzPressable>
      <HuzzPressable
        style={[styles.option, permission === 'reply' && styles.optionActive]}
        onPress={() => setPermission('reply')}
        haptic="light"
      >
        <Text style={styles.optionTitle}>💬 Supervision + Reply</Text>
        <Text style={styles.optionBody}>
          They can view and send messages, clearly labelled as your Mehram.
        </Text>
      </HuzzPressable>
      <HuzzPressable style={styles.primaryBtn} onPress={handleCreateInvite} disabled={busy} haptic="light">
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Generate Mehram Link</Text>
        )}
      </HuzzPressable>
    </View>
  );

  const renderLink = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Your Mehram link is ready</Text>
      <Text style={styles.subtitle}>Send this private link to the person you trust.</Text>
      <View style={styles.linkBox}>
        <Text style={styles.linkText} selectable>
          {inviteUrl}
        </Text>
      </View>
      {expiresAt ? (
        <Text style={styles.hint}>Access expires: {mehramService.formatExpiresAt(expiresAt)}</Text>
      ) : null}
      <HuzzPressable style={styles.primaryBtn} onPress={handleCopy} haptic="light">
        <Text style={styles.primaryBtnText}>Copy Link</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.secondaryBtn} onPress={handleShare} haptic="light">
        <Text style={styles.secondaryBtnText}>Share Link</Text>
      </HuzzPressable>
    </View>
  );

  const renderManage = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Mehram Supervision</Text>
      <View style={styles.statusRow}>
        <Text style={styles.statusDot}>●</Text>
        <Text style={styles.statusText}>Active</Text>
      </View>
      <Text style={styles.subtitle}>Your Mehram currently has access to this conversation.</Text>
      <View style={styles.metaBox}>
        <Text style={styles.metaLabel}>Permission</Text>
        <Text style={styles.metaValue}>{permissionLabel}</Text>
      </View>
      {mehram?.sessionActive ? (
        <Text style={styles.live}>Mehram is viewing now</Text>
      ) : null}
      <HuzzPressable style={styles.secondaryBtn} onPress={handleChangePermission} disabled={busy} haptic="light">
        <Text style={styles.secondaryBtnText}>
          {permission === 'reply' ? 'Switch to supervision only' : 'Allow Mehram to reply'}
        </Text>
      </HuzzPressable>
      <HuzzPressable style={styles.secondaryBtn} onPress={handleRegenerate} disabled={busy} haptic="light">
        <Text style={styles.secondaryBtnText}>Share link again</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.dangerBtn} onPress={handleRevoke} disabled={busy} haptic="light">
        <Text style={styles.dangerBtnText}>Revoke access</Text>
      </HuzzPressable>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <HuzzPressable onPress={onClose} haptic="light">
            <Text style={styles.close}>Close</Text>
          </HuzzPressable>
        </View>
        {step === STEPS.intro && renderIntro()}
        {step === STEPS.permission && renderPermission()}
        {step === STEPS.link && renderLink()}
        {step === STEPS.manage && renderManage()}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: tokens.colors.bg,
    flexGrow: 1,
  },
  header: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  close: {
    ...tokens.typography.label,
    color: tokens.colors.blue,
    fontWeight: '600',
  },
  section: {
    gap: 14,
  },
  heroEmoji: {
    fontSize: 40,
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: tokens.colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...tokens.typography.body,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  hint: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
  option: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  optionActive: {
    borderColor: tokens.colors.blue,
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
  },
  optionTitle: {
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: 6,
  },
  optionBody: {
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: tokens.colors.blue,
    borderRadius: 999,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    borderRadius: 999,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: tokens.colors.border,
  },
  secondaryBtnText: {
    color: tokens.colors.text,
    fontWeight: '600',
  },
  dangerBtn: {
    borderRadius: 999,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dangerBtnText: {
    color: tokens.colors.danger,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  linkBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.colors.bgSecondary,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  linkText: {
    ...tokens.typography.caption,
    color: tokens.colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusDot: {
    color: tokens.colors.green,
    fontSize: 14,
  },
  statusText: {
    fontWeight: '700',
    color: tokens.colors.green,
  },
  metaBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.colors.bgSecondary,
  },
  metaLabel: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
  },
  metaValue: {
    fontWeight: '700',
    color: tokens.colors.text,
    marginTop: 4,
  },
  live: {
    textAlign: 'center',
    color: tokens.colors.accent,
    fontWeight: '600',
  },
});
