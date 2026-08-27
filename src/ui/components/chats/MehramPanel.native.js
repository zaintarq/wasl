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

function formatVisit(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function formatCountdown(expiresAtMs) {
  if (!expiresAtMs) return null;
  const left = expiresAtMs - Date.now();
  if (left <= 0) return 'Expired';
  const days = Math.floor(left / (24 * 60 * 60 * 1000));
  const hours = Math.floor((left % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((left % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${Math.max(1, mins)}m left`;
}

function buildMehramShareMessage(inviteUrl) {
  return (
    `You're invited to supervise my Wasl conversation as my Mehram.\n\n` +
    `Checklist:\n` +
    `• Install or open the Wasl / Huzz app\n` +
    `• Tap this private link (app only — not a browser):\n${inviteUrl}\n` +
    `• Keep the link private — do not forward it\n`
  );
}

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
  const [history, setHistory] = useState([]);
  const [countdown, setCountdown] = useState('');

  const isActive = !!mehram?.active;

  const expiresAtMs = useMemo(() => {
    if (expiresAt) return Number(expiresAt);
    const raw = mehram?.expiresAt;
    if (!raw) return null;
    if (typeof raw?.toMillis === 'function') return raw.toMillis();
    if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
    if (typeof raw === 'number') return raw;
    return null;
  }, [expiresAt, mehram?.expiresAt]);

  useEffect(() => {
    if (!visible || !isActive || !expiresAtMs) {
      setCountdown('');
      return undefined;
    }
    const tick = () => setCountdown(formatCountdown(expiresAtMs) || '');
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [visible, isActive, expiresAtMs]);

  const loadHistory = useCallback(async () => {
    if (!matchId) return;
    const { data } = await mehramService.listSessionHistory({ matchId, limit: 12 });
    setHistory(Array.isArray(data) ? data : []);
    if (!inviteUrl || !expiresAt) {
      const rem = await mehramService.getInviteReminder(matchId);
      if (rem.data?.inviteUrl) setInviteUrl(rem.data.inviteUrl);
      if (rem.data?.expiresAt) setExpiresAt(rem.data.expiresAt);
    }
  }, [matchId, inviteUrl, expiresAt]);

  useEffect(() => {
    if (!visible) return;
    if (isActive) {
      setStep(STEPS.manage);
      setPermission(mehram.permission === 'reply' ? 'reply' : 'view');
      loadHistory();
    } else {
      setStep(STEPS.intro);
      setPermission('view');
      setInviteUrl('');
      setExpiresAt(null);
      setHistory([]);
    }
  }, [visible, isActive, mehram?.permission, loadHistory]);

  const permissionLabel = useMemo(
    () => (permission === 'reply' ? 'Supervision + Reply' : 'Supervision only'),
    [permission]
  );

  const statusLine = useMemo(() => {
    if (!isActive) return null;
    if (mehram?.sessionActive) return { label: 'Mehram is viewing now', tone: 'live' };
    return { label: 'Invite active — waiting for Mehram to open the link', tone: 'wait' };
  }, [isActive, mehram?.sessionActive]);

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

  const handleRegenerate = useCallback(() => {
    Alert.alert(
      'Create a new invite link?',
      'The previous link stops working immediately. Only share the new one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New link',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ]
    );
  }, [matchId]);

  const handleCopy = useCallback(async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    Alert.alert('Copied', 'Mehram link copied. Send it privately (WhatsApp, SMS, etc.).');
  }, [inviteUrl]);

  const handleShare = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: buildMehramShareMessage(inviteUrl),
      });
    } catch {
      /* ignore */
    }
  }, [inviteUrl]);

  const handleWhatsApp = useCallback(async () => {
    if (!inviteUrl) return;
    const text = encodeURIComponent(buildMehramShareMessage(inviteUrl));
    const url = `whatsapp://send?text=${text}`;
    try {
      const { Linking } = require('react-native');
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else await Linking.openURL(`https://wa.me/?text=${text}`);
    } catch {
      Alert.alert('WhatsApp', 'Could not open WhatsApp. Use Share or Copy instead.');
    }
  }, [inviteUrl]);

  const handleSms = useCallback(async () => {
    if (!inviteUrl) return;
    const text = encodeURIComponent(buildMehramShareMessage(inviteUrl));
    try {
      const { Linking, Platform } = require('react-native');
      const sep = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(`sms:${sep}body=${text}`);
    } catch {
      Alert.alert('SMS', 'Could not open Messages. Use Share or Copy instead.');
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

  const handleRemind = useCallback(async () => {
    if (!matchId) return;
    setBusy(true);
    let url = inviteUrl;
    let exp = expiresAt;
    if (!url) {
      const { data, error } = await mehramService.getInviteReminder(matchId);
      setBusy(false);
      if (error) {
        Alert.alert('Could not load invite', error);
        return;
      }
      url = data?.inviteUrl || '';
      exp = data?.expiresAt || null;
      setInviteUrl(url);
      if (exp) setExpiresAt(exp);
    } else {
      setBusy(false);
    }
    if (!url) {
      Alert.alert('No link yet', 'Generate or recreate an invite link first.');
      return;
    }
    Alert.alert('Remind Mehram', 'Resend the same invite link (does not create a new one).', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'WhatsApp', onPress: () => {
          const text = encodeURIComponent(buildMehramShareMessage(url));
          const { Linking } = require('react-native');
          Linking.openURL(`whatsapp://send?text=${text}`).catch(() =>
            Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {})
          );
        } },
      { text: 'Share', onPress: () => Share.share({ message: buildMehramShareMessage(url) }).catch(() => {}) },
      {
        text: 'Copy',
        onPress: async () => {
          await Clipboard.setStringAsync(url);
          Alert.alert('Copied', 'Same Mehram link copied.');
        },
      },
    ]);
  }, [matchId, inviteUrl, expiresAt]);

  const renderIntro = () => (
    <View style={styles.section}>
      <Text style={styles.heroEmoji}>🛡️</Text>
      <Text style={styles.title}>Add a Mehram</Text>
      <Text style={styles.subtitle}>
        Invite someone you trust to supervise this chat. They open a private link in the Wasl app —
        no separate dating account.
      </Text>
      <View style={styles.stepsBox}>
        <Text style={styles.stepItem}>1. Choose view-only or reply</Text>
        <Text style={styles.stepItem}>2. Copy or share the private link</Text>
        <Text style={styles.stepItem}>3. They open it in Wasl / Huzz to supervise</Text>
      </View>
      {!canAddMehram ? <Text style={styles.hint}>{chatDurationHint}</Text> : null}
      <HuzzPressable
        style={[styles.primaryBtn, !canAddMehram && styles.btnDisabled]}
        disabled={!canAddMehram}
        onPress={() => setStep(STEPS.permission)}
        haptic="light"
      >
        <Text style={styles.primaryBtnText}>Continue</Text>
      </HuzzPressable>
    </View>
  );

  const renderPermission = () => (
    <View style={styles.section}>
      <Text style={styles.kicker}>Step 1 of 2</Text>
      <Text style={styles.title}>How involved should they be?</Text>
      <HuzzPressable
        style={[styles.option, permission === 'view' && styles.optionActive]}
        onPress={() => setPermission('view')}
        haptic="light"
      >
        <Text style={styles.optionTitle}>👁 Supervision only</Text>
        <Text style={styles.optionBody}>
          They can view the conversation and use Block / Report. They cannot send messages.
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
          <Text style={styles.primaryBtnText}>Generate invite link</Text>
        )}
      </HuzzPressable>
    </View>
  );

  const renderLink = () => (
    <View style={styles.section}>
      <Text style={styles.kicker}>Step 2 of 2</Text>
      <Text style={styles.title}>Share this private link</Text>
      <Text style={styles.subtitle}>
        Send it only to your Mehram. They must open it in the Wasl / Huzz app (not a browser).
      </Text>
      <View style={styles.linkBox}>
        <Text style={styles.linkText} selectable>
          {inviteUrl}
        </Text>
      </View>
      {expiresAt ? (
        <Text style={styles.hint}>Link expires: {mehramService.formatExpiresAt(expiresAt)}</Text>
      ) : null}
      <View style={styles.checklist}>
        <Text style={styles.checkItem}>✓ They have Wasl / Huzz installed (or will install it)</Text>
        <Text style={styles.checkItem}>✓ You trust them with this conversation</Text>
        <Text style={styles.checkItem}>✓ You will not post the link publicly</Text>
      </View>
      <HuzzPressable style={styles.primaryBtn} onPress={handleCopy} haptic="light">
        <Text style={styles.primaryBtnText}>Copy link</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.secondaryBtn} onPress={handleWhatsApp} haptic="light">
        <Text style={styles.secondaryBtnText}>Share on WhatsApp</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.secondaryBtn} onPress={handleSms} haptic="light">
        <Text style={styles.secondaryBtnText}>Share via SMS</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.secondaryBtn} onPress={handleShare} haptic="light">
        <Text style={styles.secondaryBtnText}>Share via apps</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.secondaryBtn} onPress={() => setStep(STEPS.manage)} haptic="light">
        <Text style={styles.secondaryBtnText}>Done — manage access</Text>
      </HuzzPressable>
    </View>
  );

  const renderManage = () => (
    <View style={styles.section}>
      <Text style={styles.title}>Mehram supervision</Text>
      <View style={styles.statusRow}>
        <Text style={[styles.statusDot, statusLine?.tone === 'live' ? styles.dotLive : styles.dotWait]}>
          ●
        </Text>
        <Text style={[styles.statusText, statusLine?.tone === 'live' ? styles.live : null]}>
          {statusLine?.label || 'Active'}
        </Text>
      </View>
      <View style={styles.metaBox}>
        <Text style={styles.metaLabel}>Permission</Text>
        <Text style={styles.metaValue}>{permissionLabel}</Text>
        {countdown ? (
          <>
            <Text style={[styles.metaLabel, { marginTop: 8 }]}>Invite expires</Text>
            <Text style={styles.metaValue}>{countdown}</Text>
          </>
        ) : null}
      </View>
      <HuzzPressable style={styles.secondaryBtn} onPress={handleChangePermission} disabled={busy} haptic="light">
        <Text style={styles.secondaryBtnText}>
          {permission === 'reply' ? 'Switch to supervision only' : 'Allow Mehram to reply'}
        </Text>
      </HuzzPressable>
      <HuzzPressable style={styles.primaryBtn} onPress={handleRemind} disabled={busy} haptic="light">
        <Text style={styles.primaryBtnText}>Remind Mehram (same link)</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.secondaryBtn} onPress={handleRegenerate} disabled={busy} haptic="light">
        <Text style={styles.secondaryBtnText}>Create a new invite link</Text>
      </HuzzPressable>
      <HuzzPressable style={styles.dangerBtn} onPress={handleRevoke} disabled={busy} haptic="light">
        <Text style={styles.dangerBtnText}>Revoke access</Text>
      </HuzzPressable>

      <Text style={styles.historyTitle}>Supervision visits</Text>
      <Text style={styles.hint}>When your Mehram opened or left this chat.</Text>
      {!history.length ? (
        <Text style={styles.hint}>No visits yet — share the link to get started.</Text>
      ) : (
        history.map((row) => (
          <View key={row.id} style={styles.historyRow}>
            <Text style={styles.historyMain}>
              {row.status === 'active' ? 'Viewing now' : row.endReason === 'mehram_block' ? 'Ended (block)' : 'Visit'}
              {' · '}
              {row.permission === 'reply' ? 'reply' : 'view'}
            </Text>
            <Text style={styles.historyMeta}>
              {formatVisit(row.startedAt)}
              {row.endedAt ? ` → ${formatVisit(row.endedAt)}` : ''}
            </Text>
          </View>
        ))
      )}
      <HuzzPressable style={styles.secondaryBtn} onPress={loadHistory} haptic="light">
        <Text style={styles.secondaryBtnText}>Refresh visits</Text>
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
  kicker: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.blue,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
  stepsBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: tokens.colors.bgSecondary,
    gap: 8,
  },
  stepItem: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  checklist: {
    gap: 6,
    paddingHorizontal: 4,
  },
  checkItem: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
    lineHeight: 18,
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
    fontSize: 14,
  },
  dotLive: { color: tokens.colors.green },
  dotWait: { color: '#d97706' },
  statusText: {
    fontWeight: '700',
    color: '#d97706',
    textAlign: 'center',
    flexShrink: 1,
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
    color: tokens.colors.green,
  },
  historyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
    textAlign: 'center',
  },
  historyRow: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  historyMain: {
    fontWeight: '700',
    color: tokens.colors.text,
    fontSize: 13,
  },
  historyMeta: {
    marginTop: 4,
    fontSize: 12,
    color: tokens.colors.textMuted,
  },
});
