import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Alert } from 'react-native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens } from '../../ui/tokens';
import { appealService } from '../../services/firebaseService';

function formatTs(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

export function AdminAppealsDesk() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [appeals, setAppeals] = useState([]);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await appealService.listAppeals({ limitCount: 80 });
    setAppeals(res.data || []);
    if (res.error) Alert.alert('Appeals', res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = (item, decision) => {
    const label =
      decision === 'approve'
        ? 'Approve & restore access'
        : decision === 'shadowban'
          ? 'Lift disable but shadowban'
          : 'Reject appeal';
    Alert.alert(label, `${item.email || item.uid}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: decision === 'reject' ? 'destructive' : 'default',
        onPress: async () => {
          setBusyId(`${item.id}-${decision}`);
          const res = await appealService.resolveAppeal({
            appealId: item.id,
            decision,
            adminNotes: notes[item.id] || '',
          });
          setBusyId('');
          if (res.error) Alert.alert('Failed', res.error);
          else {
            Alert.alert('Done', `Appeal marked ${decision}.`);
            load();
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.colors.accent} />
      </View>
    );
  }

  const open = appeals.filter((a) => a.status === 'open');
  const closed = appeals.filter((a) => a.status !== 'open');

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Disabled users submit appeals from the restriction screen. Approve restores access; shadowban
        hides them from discovery without a hard disable.
      </Text>
      <RetroButton variant="gray" title="Refresh appeals" onPress={load} style={styles.fullBtn} />

      <Text style={styles.sectionLabel}>Open ({open.length})</Text>
      {!open.length ? <Text style={styles.empty}>No open appeals.</Text> : null}
      {open.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.title}>{item.email || item.uid}</Text>
          <Text style={styles.meta}>
            {item.category || 'disable'} · {formatTs(item.createdAt)}
          </Text>
          <Text style={styles.body}>{item.reason || '(no reason given)'}</Text>
          <Text style={styles.label}>Admin notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            value={notes[item.id] || ''}
            onChangeText={(t) => setNotes((p) => ({ ...p, [item.id]: t }))}
            placeholder="Internal note…"
            placeholderTextColor="rgba(255,255,255,0.4)"
          />
          <View style={styles.btnCol}>
            <RetroButton
              variant="green"
              title={busyId === `${item.id}-approve` ? '…' : 'Approve (restore)'}
              onPress={() => resolve(item, 'approve')}
              disabled={Boolean(busyId)}
              style={styles.fullBtn}
            />
            <RetroButton
              variant="outline"
              title={busyId === `${item.id}-shadowban` ? '…' : 'Shadowban instead'}
              onPress={() => resolve(item, 'shadowban')}
              disabled={Boolean(busyId)}
              style={styles.fullBtn}
            />
            <RetroButton
              variant="danger"
              title={busyId === `${item.id}-reject` ? '…' : 'Reject'}
              onPress={() => resolve(item, 'reject')}
              disabled={Boolean(busyId)}
              style={styles.fullBtn}
            />
          </View>
        </View>
      ))}

      <Text style={styles.sectionLabel}>Closed ({closed.length})</Text>
      {closed.slice(0, 25).map((item) => (
        <View key={item.id} style={[styles.card, styles.cardDone]}>
          <Text style={styles.title}>
            {item.status} · {item.email || item.uid}
          </Text>
          <Text style={styles.meta}>{formatTs(item.resolvedAt || item.createdAt)}</Text>
          {item.adminNotes ? <Text style={styles.body}>{item.adminNotes}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  loading: { paddingVertical: 24, alignItems: 'center' },
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
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  btnCol: { gap: 8, marginTop: 8 },
  fullBtn: { alignSelf: 'stretch' },
});
