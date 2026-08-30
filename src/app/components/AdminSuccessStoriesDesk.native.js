import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { RetroButton } from '../../ui/components/RetroButton.native';
import { tokens } from '../../ui/tokens';
import { successStoryService } from '../../services/firebaseService';

function formatTs(value) {
  if (!value) return '—';
  try {
    const ms =
      typeof value?.toMillis === 'function'
        ? value.toMillis()
        : typeof value === 'number'
          ? value
          : Date.parse(String(value));
    if (!ms || Number.isNaN(ms)) return '—';
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function statusStyle(status) {
  const s = String(status || 'pending');
  if (s === 'published') return { bg: tokens.colors.filterBgEmerald, color: tokens.colors.success, label: 'Approved' };
  if (s === 'rejected') return { bg: tokens.colors.filterBgRose, color: tokens.colors.danger, label: 'Not approved' };
  return { bg: tokens.colors.filterBgAmber, color: tokens.colors.warning, label: 'Pending review' };
}

export function AdminSuccessStoriesDesk() {
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState([]);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    const unsub = successStoryService.listenAdminStories(({ data, error }) => {
      setStories(data || []);
      setLoading(false);
      if (error) Alert.alert('Stories', error);
    });
    return () => unsub?.();
  }, []);

  const act = useCallback(async (storyId, action) => {
    setBusyId(`${storyId}-${action}`);
    try {
      let error = null;
      if (action === 'publish') {
        ({ error } = await successStoryService.publishStory(storyId));
      } else if (action === 'reject') {
        ({ error } = await successStoryService.rejectStory(storyId));
      } else if (action === 'unpublish') {
        ({ error } = await successStoryService.unpublishStory(storyId));
      }
      if (error) Alert.alert('Failed', error);
    } finally {
      setBusyId('');
    }
  }, []);

  const confirm = (item, action) => {
    const labels = {
      publish: 'Approve for app & website',
      reject: 'Reject story',
      unpublish: 'Remove from app & website',
    };
    Alert.alert(labels[action], 'This updates what users see in the app and on wasl success stories page.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: action === 'reject' ? 'destructive' : 'default',
        onPress: () => act(item.id, action),
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

  const pending = stories.filter((s) => String(s.status) === 'pending');
  const published = stories.filter((s) => String(s.status) === 'published');
  const rejected = stories.filter((s) => String(s.status) === 'rejected');

  const renderCard = (item) => {
    const st = statusStyle(item.status);
    const busy = busyId.startsWith(`${item.id}-`);
    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
          <Text style={styles.meta}>{formatTs(item.createdAt)}</Text>
        </View>
        <Text style={styles.tag}>{item.metViaLabel || 'Wasl story'}</Text>
        {item.city ? <Text style={styles.city}>{item.city}</Text> : null}
        <Text style={styles.body}>{item.body}</Text>
        <Text style={styles.uid}>submitter: {String(item.submittedBy || '').slice(0, 12)}…</Text>
        <View style={styles.actions}>
          {item.status !== 'published' ? (
            <RetroButton
              variant="green"
              title="Approve"
              onPress={() => confirm(item, 'publish')}
              disabled={busy}
              style={styles.actionBtn}
            />
          ) : (
            <RetroButton
              variant="outline"
              title="Unpublish"
              onPress={() => confirm(item, 'unpublish')}
              disabled={busy}
              style={styles.actionBtn}
            />
          )}
          {item.status !== 'rejected' ? (
            <RetroButton
              variant="danger"
              title="Reject"
              onPress={() => confirm(item, 'reject')}
              disabled={busy}
              style={styles.actionBtn}
            />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Approved stories appear in the app (Chats → Love stories) and on the public website. Pending and
        rejected stories stay hidden from users.
      </Text>
      <Text style={styles.sectionLabel}>Pending ({pending.length})</Text>
      {pending.length ? pending.map(renderCard) : <Text style={styles.empty}>No pending submissions.</Text>}
      <Text style={styles.sectionLabel}>Live — app & web ({published.length})</Text>
      {published.length ? published.map(renderCard) : <Text style={styles.empty}>None published yet.</Text>}
      <Text style={styles.sectionLabel}>Not approved ({rejected.length})</Text>
      {rejected.length ? rejected.map(renderCard) : <Text style={styles.empty}>None.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  loading: { padding: 24, alignItems: 'center' },
  hint: { ...tokens.typography.caption, color: tokens.colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  sectionLabel: { ...tokens.typography.label, color: tokens.colors.text, marginTop: 12, marginBottom: 4 },
  empty: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginBottom: 8 },
  card: {
    padding: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: 10,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  meta: { ...tokens.typography.caption, color: tokens.colors.textMuted },
  tag: { fontSize: 11, fontWeight: '800', color: tokens.colors.brandPink, textTransform: 'uppercase' },
  city: { ...tokens.typography.caption, color: tokens.colors.textMuted },
  body: { fontSize: 14, lineHeight: 21, color: tokens.colors.text },
  uid: { fontSize: 10, color: tokens.colors.textMuted, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionBtn: { flexGrow: 1, minWidth: 120 },
});
