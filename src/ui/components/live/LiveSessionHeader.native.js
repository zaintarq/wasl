import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Timer } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { LiveContentWidth } from './LiveContentWidth.native';
import { LiveText } from './LiveTypography.native';

export function LiveSessionHeader({ secondsLeft, totalSeconds = 60 }) {
  const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));

  return (
    <View style={styles.shell}>
      <LiveContentWidth>
        <View style={styles.row}>
          <View style={styles.left}>
            <Timer size={20} color={tokens.colors.accent} strokeWidth={2} />
            <View>
              <LiveText style={styles.label}>Session</LiveText>
              <LiveText style={styles.caption}>Up to {totalSeconds}s</LiveText>
            </View>
          </View>
          <LiveText style={styles.big}>{secondsLeft}</LiveText>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
      </LiveContentWidth>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  caption: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 2 },
  big: {
    fontSize: 40,
    color: tokens.colors.accent,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.surfaceOverlay,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.accent,
  },
});
