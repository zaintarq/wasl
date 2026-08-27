import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Alert } from 'react-native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens } from '../../ui/tokens';
import { privacyAdminService } from '../../services/firebaseService';

function formatTs(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function AdminPrivacyDesk({ mode = 'deletions' }) {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [crashLogs, setCrashLogs] = useState([]);
  const [emailDrafts, setEmailDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'crashes') {
        const res = await privacyAdminService.listCrashLogs({ limitCount: 100 });
        setCrashLogs(res.data || []);
        if (res.error) Alert.alert('Crash logs', res.error);
      } else {
        const res = await privacyAdminService.listDeletionRequests({ limitCount: 80 });
        setDeletionRequests(res.data || []);
        if (res.error) Alert.alert('Deletion requests', res.error);
      }
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    load();
  }, [load]);

  const setDraft = (id, patch) => {
    setEmailDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const processRequest = (item) => {
    const draft = emailDrafts[item.id] || {};
    const customMessage =
      draft.body ||
      (item.type === 'partial'
        ? 'Hello,\n\nWe have completed your request to delete personal data from your Wasl account while keeping the account open.\n\n— Wasl / HUZZ'
        : 'Hello,\n\nWe have deleted your Wasl (HUZZ) account and associated personal data as requested.\n\n— Wasl / HUZZ');

    Alert.alert(
      item.type === 'partial' ? 'Process data deletion?' : 'Delete all account data?',
      item.type === 'partial'
        ? `Clear profile data for ${item.email || item.uid} and email them from noreplyonlystream@gmail.com.`
        : `This permanently deletes Auth + profile data for ${item.email || item.uid}, then emails confirmation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Process + email',
          style: 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            const res = await privacyAdminService.processDeletionRequest({
              requestId: item.id,
              customMessage,
              sendEmail: true,
            });
            setBusyId('');
            if (res.error) Alert.alert('Failed', res.error);
            else {
              Alert.alert(
                'Done',
                res.data?.emailSent
                  ? `Processed. Confirmation emailed to ${res.data.email || item.email}.`
                  : 'Processed. Email may have failed — check the request card.'
              );
              load();
            }
          },
        },
      ]
    );
  };

  const sendOnlyEmail = async (item) => {
    const draft = emailDrafts[item.id] || {};
    const to = String(draft.to || item.email || '').trim();
    const subject = String(
      draft.subject ||
        (item.type === 'partial'
          ? 'Wasl: your data deletion request is complete'
          : 'Wasl: your account and data have been deleted')
    ).trim();
    const body = String(draft.body || '').trim();
    if (!to || !body) {
      Alert.alert('Email', 'Add a recipient and message body first.');
      return;
    }
    setBusyId(`mail-${item.id}`);
    const res = await privacyAdminService.sendDeletionNoticeEmail({
      to,
      subject,
      body,
      requestId: item.id,
    });
    setBusyId('');
    if (res.error) Alert.alert('Email failed', res.error);
    else Alert.alert('Sent', `Email sent to ${to} via OTP mailer.`);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.colors.accent} />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (mode === 'crashes') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          Crashes reported from devices. Fatal ones appear first in the feed as they arrive.
        </Text>
        <RetroButton variant="gray" title="Refresh crash logs" onPress={load} style={styles.fullBtn} />
        {!crashLogs.length ? (
          <Text style={styles.empty}>No crash logs yet.</Text>
        ) : (
          crashLogs.map((log) => (
            <View key={log.id} style={styles.card}>
              <Text style={styles.title}>
                {log.isFatal ? 'FATAL · ' : ''}
                {log.name || 'Error'}
              </Text>
              <Text style={styles.meta}>
                {formatTs(log.createdAt)} · {log.platform || '—'} · v{log.appVersion || '?'}
              </Text>
              <Text style={styles.meta}>uid: {log.uid || 'signed-out'} · device: {log.deviceHash || '—'}</Text>
              <Text style={styles.body}>{log.message}</Text>
              {log.stack ? <Text style={styles.stack}>{String(log.stack).slice(0, 600)}</Text> : null}
            </View>
          ))
        )}
      </View>
    );
  }

  const open = deletionRequests.filter((r) => r.status === 'open' || r.status === 'processing');
  const done = deletionRequests.filter((r) => r.status === 'done');

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Users submit requests from Settings. Process deletes their data and emails them with the same
        noreply OTP mailbox.
      </Text>
      <RetroButton variant="gray" title="Refresh requests" onPress={load} style={styles.fullBtn} />

      <Text style={styles.sectionLabel}>Open ({open.length})</Text>
      {!open.length ? <Text style={styles.empty}>No open deletion requests.</Text> : null}
      {open.map((item) => {
        const draft = emailDrafts[item.id] || {};
        return (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>
              {item.type === 'partial' ? 'Data deletion' : 'Account deletion'} · {item.status}
            </Text>
            <Text style={styles.meta}>
              {item.name || '—'} · @{item.username || '—'} · {item.email || 'no email'}
            </Text>
            <Text style={styles.meta}>
              uid {item.uid} · {formatTs(item.createdAt)}
            </Text>
            {item.details ? <Text style={styles.body}>Details: {item.details}</Text> : null}

            <Text style={styles.label}>Email to</Text>
            <TextInput
              style={styles.input}
              value={draft.to ?? item.email ?? ''}
              onChangeText={(t) => setDraft(item.id, { to: t })}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="user@email.com"
            />
            <Text style={styles.label}>Subject</Text>
            <TextInput
              style={styles.input}
              value={
                draft.subject ??
                (item.type === 'partial'
                  ? 'Wasl: your data deletion request is complete'
                  : 'Wasl: your account and data have been deleted')
              }
              onChangeText={(t) => setDraft(item.id, { subject: t })}
            />
            <Text style={styles.label}>Letter body</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              multiline
              value={
                draft.body ??
                (item.type === 'partial'
                  ? 'Hello,\n\nWe have completed your request to delete personal data from your Wasl account while keeping the account open.\n\n— Wasl / HUZZ'
                  : 'Hello,\n\nWe have deleted your Wasl (HUZZ) account and associated personal data as requested.\n\n— Wasl / HUZZ')
              }
              onChangeText={(t) => setDraft(item.id, { body: t })}
            />

            <View style={styles.btnRow}>
              <RetroButton
                variant="outline"
                title={busyId === `mail-${item.id}` ? 'Sending…' : 'Send email only'}
                onPress={() => sendOnlyEmail(item)}
                style={styles.flexBtn}
                disabled={Boolean(busyId)}
              />
              <RetroButton
                variant="danger"
                title={busyId === item.id ? 'Processing…' : 'Delete data + email'}
                onPress={() => processRequest(item)}
                style={styles.flexBtn}
                disabled={Boolean(busyId)}
              />
            </View>
          </View>
        );
      })}

      <Text style={styles.sectionLabel}>Completed ({done.length})</Text>
      {done.slice(0, 20).map((item) => (
        <View key={item.id} style={[styles.card, styles.cardDone]}>
          <Text style={styles.title}>
            {item.type === 'partial' ? 'Data deletion' : 'Account deletion'} · done
          </Text>
          <Text style={styles.meta}>
            {item.email || item.uid} · {formatTs(item.processedAt || item.createdAt)}
            {item.confirmationEmailSent ? ' · emailed' : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  loading: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  muted: { color: tokens.colors.textMutedOnBrand, fontSize: 13 },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textMutedOnBrand,
    fontWeight: '500',
  },
  sectionLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
  },
  empty: { fontSize: 13, color: tokens.colors.textMutedOnBrand },
  card: {
    borderRadius: 14,
    padding: 12,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardDone: { opacity: 0.75 },
  title: { fontSize: 15, fontWeight: '700', color: tokens.colors.textOnBrand },
  meta: { fontSize: 12, color: tokens.colors.textMutedOnBrand },
  body: { fontSize: 13, color: tokens.colors.textOnBrand, marginTop: 4 },
  stack: {
    fontSize: 11,
    color: tokens.colors.textMutedOnBrand,
    fontFamily: PlatformSelectMono(),
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textMutedOnBrand,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: tokens.colors.textOnBrand,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  flexBtn: { flex: 1 },
  fullBtn: { alignSelf: 'stretch' },
});

function PlatformSelectMono() {
  return undefined;
}
