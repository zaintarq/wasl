import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../tokens';

export function MehramBanner({ mehram, isGirl, otherName }) {
  if (!mehram?.active) return null;

  const girlName = mehram.girlDisplayName || 'Her';
  const canReply = mehram.permission === 'reply';

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
});
