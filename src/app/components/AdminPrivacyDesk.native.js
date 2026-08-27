import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Alert, Linking } from 'react-native';
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

/** Fallback grouping when crashGroups collection is empty / unindexed. */
function groupCrashLogsClient(logs) {
  const map = new Map();
  for (const log of logs || []) {
    const key =
      log.fingerprint ||
      `${log.name || 'Error'}|${String(log.message || '').slice(0, 120)}|${String(log.stack || '')
        .split('\n')
        .slice(0, 4)
        .join('|')}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        id: key,
        fingerprint: log.fingerprint || key,
        name: log.name,
        message: log.message,
        stack: log.stack,
        isFatal: !!log.isFatal,
        platform: log.platform,
        appVersion: log.appVersion,
        lastUid: log.uid,
        lastDeviceHash: log.deviceHash,
        count: 1,
        lastSeenAt: log.createdAt,
        firstSeenAt: log.createdAt,
        _clientGrouped: true,
      });
    } else {
      prev.count += 1;
      if (log.isFatal) prev.isFatal = true;
      if (log.createdAt && (!prev.lastSeenAt || log.createdAt > prev.lastSeenAt)) {
        prev.lastSeenAt = log.createdAt;
        prev.platform = log.platform || prev.platform;
        prev.appVersion = log.appVersion || prev.appVersion;
        prev.lastUid = log.uid;
        prev.message = log.message || prev.message;
        prev.stack = log.stack || prev.stack;
      }
      if (log.createdAt && (!prev.firstSeenAt || log.createdAt < prev.firstSeenAt)) {
        prev.firstSeenAt = log.createdAt;
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
}

export function AdminPrivacyDesk({ mode = 'deletions' }) {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [crashGroups, setCrashGroups] = useState([]);
  const [crashSource, setCrashSource] = useState('groups');
  const [showResolvedCrashes, setShowResolvedCrashes] = useState(false);
  const [expandedCrashId, setExpandedCrashId] = useState('');
  const [emailDrafts, setEmailDrafts] = useState({});
  const [dsarLogs, setDsarLogs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'crashes') {
        const groupsRes = await privacyAdminService.listCrashGroups({ limitCount: 80 });
        if (!groupsRes.error && (groupsRes.data || []).length) {
          setCrashGroups(groupsRes.data || []);
          setCrashSource('groups');
        } else {
          const logsRes = await privacyAdminService.listCrashLogs({ limitCount: 150 });
          setCrashGroups(groupCrashLogsClient(logsRes.data || []));
          setCrashSource('client');
          if (logsRes.error) Alert.alert('Crash logs', logsRes.error);
        }
      } else {
        const [res, dsarRes] = await Promise.all([
          privacyAdminService.listDeletionRequests({ limitCount: 80 }),
          privacyAdminService.listDsarExportLogs({ limitCount: 40 }),
        ]);
        setDeletionRequests(res.data || []);
        setDsarLogs(dsarRes.data || []);
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

  const runWipe = async (item, customMessage) => {
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
  };

  const processRequest = async (item) => {
    const draft = emailDrafts[item.id] || {};
    const customMessage =
      draft.body ||
      (item.type === 'partial'
        ? 'Hello,\n\nWe have completed your request to delete personal data from your Wasl account while keeping the account open.\n\n— Wasl / HUZZ'
        : 'Hello,\n\nWe have deleted your Wasl (HUZZ) account and associated personal data as requested.\n\n— Wasl / HUZZ');

    setBusyId(`preview-${item.id}`);
    const preview = await privacyAdminService.getDeletionWipePreview({ requestId: item.id });
    setBusyId('');

    const checklist = preview.data?.checklist || [];
    const retained = preview.data?.retainedNote || '';
    const listText = checklist.length
      ? checklist.map((line, i) => `${i + 1}. ${line}`).join('\n')
      : item.type === 'partial'
        ? 'Profile media + storage files (account kept).'
        : 'Auth, profile, related personal data, and storage files.';

    Alert.alert(
      item.type === 'partial' ? 'Wipe preview — data deletion' : 'Wipe preview — account deletion',
      `Target: ${item.email || item.uid}\n\nWill remove:\n${listText}\n\n${retained}\n\nThen email confirmation from noreplyonlystream@gmail.com.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete data + email',
          style: 'destructive',
          onPress: () => runWipe(item, customMessage),
        },
      ]
    );
  };

  const exportDsar = async (item) => {
    const uid = String(item.uid || '').trim();
    if (!uid) {
      Alert.alert('Export', 'This request has no uid.');
      return;
    }
    setBusyId(`dsar-${item.id}`);
    const res = await privacyAdminService.exportUserDataPacket({ uid });
    setBusyId('');
    if (res.error) {
      Alert.alert('Export failed', res.error);
      return;
    }
    const zipUrl = res.data?.zipUrl;
    const jsonUrl = res.data?.jsonUrl;
    Alert.alert(
      'DSAR packet ready',
      `JSON ${Math.round((res.data?.bytes || 0) / 1024)} KB · ZIP ${Math.round((res.data?.zipBytes || 0) / 1024)} KB\nExpires ${res.data?.expiresAt || 'in 7 days'}.`,
      [
        { text: 'OK', style: 'cancel' },
        zipUrl
          ? {
              text: 'Open ZIP',
              onPress: () => Linking.openURL(zipUrl).catch(() => Alert.alert('Open failed', zipUrl)),
            }
          : null,
        jsonUrl
          ? {
              text: 'Open JSON',
              onPress: () => Linking.openURL(jsonUrl).catch(() => Alert.alert('Open failed', jsonUrl)),
            }
          : null,
      ].filter(Boolean)
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
    const visible = crashGroups.filter((g) =>
      showResolvedCrashes ? true : String(g.status || 'open') !== 'resolved'
    );
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          Same stack fingerprint → one card with a count
          {crashSource === 'client' ? ' (grouped on device from recent logs).' : '.'} Mark fixed to hide
          until a new hit reopens it.
        </Text>
        <RetroButton variant="gray" title="Refresh crash groups" onPress={load} style={styles.fullBtn} />
        <RetroButton
          variant="outline"
          title={showResolvedCrashes ? 'Hide resolved' : 'Show resolved'}
          onPress={() => setShowResolvedCrashes((v) => !v)}
          style={styles.fullBtn}
        />
        {!visible.length ? (
          <Text style={styles.empty}>No open crash groups.</Text>
        ) : (
          visible.map((g) => {
            const expanded = expandedCrashId === g.id;
            const resolved = String(g.status || '') === 'resolved';
            return (
              <View key={g.id} style={[styles.card, resolved ? styles.cardDone : null]}>
                <Text style={styles.title}>
                  {resolved ? 'FIXED · ' : ''}
                  {g.isFatal ? 'FATAL · ' : ''}
                  {g.name || 'Error'} · ×{g.count || 1}
                </Text>
                <Text style={styles.meta}>
                  Last {formatTs(g.lastSeenAt)} · First {formatTs(g.firstSeenAt)} ·{' '}
                  {g.platform || '—'} · v{g.appVersion || '?'}
                </Text>
                <Text style={styles.meta}>
                  last uid: {g.lastUid || 'signed-out'} · assigned: {g.assignedTo || '—'}
                </Text>
                <Text style={styles.body} numberOfLines={expanded ? 12 : 3}>
                  {g.message}
                </Text>
                <RetroButton
                  variant="outline"
                  title={expanded ? 'Hide stack' : 'Show stack'}
                  onPress={() => setExpandedCrashId(expanded ? '' : g.id)}
                  style={styles.fullBtn}
                />
                {expanded && g.stack ? (
                  <Text style={styles.stack}>{String(g.stack).slice(0, 1200)}</Text>
                ) : null}
                <View style={styles.btnRow}>
                  <RetroButton
                    variant="gray"
                    title={busyId === `assign-${g.id}` ? '…' : g.assignedTo ? 'Reassign me' : 'Assign me'}
                    onPress={async () => {
                      setBusyId(`assign-${g.id}`);
                      const res = await privacyAdminService.updateCrashGroup({
                        fingerprint: g.fingerprint || g.id,
                        action: 'assign',
                      });
                      setBusyId('');
                      if (res.error) Alert.alert('Assign failed', res.error);
                      else load();
                    }}
                    style={styles.flexBtn}
                    disabled={Boolean(busyId)}
                  />
                  <RetroButton
                    variant={resolved ? 'outline' : 'danger'}
                    title={
                      busyId === `resolve-${g.id}`
                        ? '…'
                        : resolved
                          ? 'Reopen'
                          : 'Mark fixed'
                    }
                    onPress={async () => {
                      setBusyId(`resolve-${g.id}`);
                      const res = await privacyAdminService.updateCrashGroup({
                        fingerprint: g.fingerprint || g.id,
                        action: resolved ? 'reopen' : 'resolve',
                      });
                      setBusyId('');
                      if (res.error) Alert.alert('Update failed', res.error);
                      else load();
                    }}
                    style={styles.flexBtn}
                    disabled={Boolean(busyId)}
                  />
                </View>
                <RetroButton
                  variant="gray"
                  title={
                    busyId === `issue-${g.id}`
                      ? 'Opening…'
                      : g.trackerUrl
                        ? 'Open tracker issue'
                        : 'Create GitHub / Linear issue'
                  }
                  onPress={async () => {
                    if (g.trackerUrl) {
                      Linking.openURL(g.trackerUrl).catch(() => {});
                      return;
                    }
                    setBusyId(`issue-${g.id}`);
                    const res = await privacyAdminService.createCrashTrackerIssue({
                      fingerprint: g.fingerprint || g.id,
                      groupId: g.id,
                    });
                    setBusyId('');
                    if (res.error) {
                      Alert.alert('Tracker', res.error);
                      return;
                    }
                    const url = res.data?.url;
                    Alert.alert(
                      res.data?.provider === 'prefill' ? 'Open GitHub form' : 'Issue ready',
                      res.data?.message ||
                        (res.data?.provider === 'prefill'
                          ? 'No API token set — opening a prefilled GitHub issue page.'
                          : `Created via ${res.data?.provider}.`),
                      [
                        { text: 'OK', style: 'cancel' },
                        url
                          ? { text: 'Open', onPress: () => Linking.openURL(url).catch(() => {}) }
                          : null,
                      ].filter(Boolean)
                    );
                    load();
                  }}
                  style={styles.fullBtn}
                  disabled={Boolean(busyId)}
                />
              </View>
            );
          })
        )}
      </View>
    );
  }

  const open = deletionRequests.filter((r) => r.status === 'open' || r.status === 'processing');
  const done = deletionRequests.filter((r) => r.status === 'done');

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Users submit from Settings (auto-ack email within ~30 days). Process shows a wipe checklist
        first. Export builds a JSON/ZIP DSAR packet.
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
              {item.ackEmailSent ? ' · ack emailed' : ''}
            </Text>
            {item.details ? <Text style={styles.body}>Details: {item.details}</Text> : null}

            <Text style={styles.checklistTitle}>Wipe checklist (preview)</Text>
            {(item.type === 'partial'
              ? [
                  'Profile photos, about-voice, bio',
                  'Storage: images / voice / stories / gallery / verification',
                  'Login kept',
                ]
              : [
                  'Auth login + users profile',
                  'Likes, blocks, notifications, stories, reports',
                  'User chat messages + storage files',
                  'Username reservation',
                ]
            ).map((line) => (
              <Text key={line} style={styles.checklistLine}>
                • {line}
              </Text>
            ))}

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
                variant="gray"
                title={busyId === `dsar-${item.id}` ? 'Exporting…' : 'Export DSAR'}
                onPress={() => exportDsar(item)}
                style={styles.flexBtn}
                disabled={Boolean(busyId)}
              />
            </View>
            <RetroButton
              variant="danger"
              title={
                busyId === item.id || busyId === `preview-${item.id}`
                  ? 'Working…'
                  : 'Delete data + email'
              }
              onPress={() => processRequest(item)}
              style={styles.fullBtn}
              disabled={Boolean(busyId)}
            />
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
            {item.ackEmailSent ? ' · had ack' : ''}
          </Text>
          <RetroButton
            variant="outline"
            title={busyId === `dsar-${item.id}` ? 'Exporting…' : 'Export DSAR packet'}
            onPress={() => exportDsar(item)}
            style={styles.fullBtn}
            disabled={Boolean(busyId) || !item.uid}
          />
        </View>
      ))}

      <Text style={styles.sectionLabel}>DSAR export log ({dsarLogs.length})</Text>
      <Text style={styles.hint}>Who exported whose packet, and when download links expire.</Text>
      {!dsarLogs.length ? <Text style={styles.empty}>No exports logged yet.</Text> : null}
      {dsarLogs.slice(0, 25).map((log) => (
        <View key={log.id} style={styles.card}>
          <Text style={styles.title}>
            {log.asAdmin ? 'Admin export' : 'Self export'} · ~{Math.round((log.bytes || 0) / 1024)} KB
          </Text>
          <Text style={styles.meta}>
            target {log.targetUid} · by {log.exportedBy}
          </Text>
          <Text style={styles.meta}>
            {formatTs(log.createdAt)}
            {log.expiresAt
              ? ` · links ${Date.now() > log.expiresAt ? 'expired' : `until ${formatTs(log.expiresAt)}`}`
              : ''}
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
  checklistTitle: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textOnBrand,
  },
  checklistLine: { fontSize: 12, color: tokens.colors.textMutedOnBrand, lineHeight: 17 },
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
  fullBtn: { alignSelf: 'stretch', marginTop: 6 },
});

function PlatformSelectMono() {
  return undefined;
}
