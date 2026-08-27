import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../tokens';

function formatLastSeen(value) {
  if (!value) return null;
  try {
    const ms =
      typeof value?.toMillis === 'function'
        ? value.toMillis()
        : typeof value?.seconds === 'number'
          ? value.seconds * 1000
          : typeof value === 'number'
            ? value
            : Date.parse(value);
    if (!ms || Number.isNaN(ms)) return null;
    const diff = Date.now() - ms;
    if (diff < 45 * 1000) return 'just now';
    if (diff < 60 * 1000) return 'less than a minute ago';
    if (diff < 60 * 60 * 1000) {
      const m = Math.max(1, Math.floor(diff / 60000));
      return `${m} min ago`;
    }
    if (diff < 24 * 60 * 60 * 1000) {
      const h = Math.max(1, Math.floor(diff / 3600000));
      return `${h}h ago`;
    }
    return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return null;
  }
}

export function MehramBanner({ mehram, isGirl, otherName }) {
  if (!mehram?.active) return null;

  const girlName = mehram.girlDisplayName || 'Her';
  const canReply = mehram.permission === 'reply';
  const lastSeen = formatLastSeen(mehram.lastAccessedAt);

  let body;
  if (isGirl) {
    body = canReply
      ? 'Your Mehram can view and participate in this conversation.'
      : 'Your Mehram can view this conversation.';
  } else {
    body = canReply
      ? `${girlName}'s Mehram can view and participate in this conversation.`
      : `${girlName}'s Mehram can view this conversation.`;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>🛡️ Mehram supervision is active</Text>
      <Text style={styles.body}>{body}</Text>
      {mehram.sessionActive ? (
        <Text style={styles.live}>● Mehram is viewing now</Text>
      ) : lastSeen && isGirl ? (
        <Text style={styles.lastSeen}>Mehram last seen {lastSeen}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(29, 161, 242, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29, 161, 242, 0.28)',
  },
  title: {
    ...tokens.typography.label,
    color: tokens.colors.text,
    fontWeight: '700',
    marginBottom: 4,
  },
  body: {
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    lineHeight: 18,
  },
  live: {
    marginTop: 6,
    ...tokens.typography.caption,
    color: tokens.colors.accent,
    fontWeight: '600',
  },
  lastSeen: {
    marginTop: 6,
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    fontWeight: '600',
  },
});
