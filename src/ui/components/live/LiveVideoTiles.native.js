import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Video } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { LiveContentWidth } from './LiveContentWidth.native';
import { LiveText } from './LiveTypography.native';

export function LiveVideoTiles({ partnerConnected }) {
  return (
    <LiveContentWidth style={styles.pad}>
      <View style={styles.row}>
        <View style={[styles.tile, styles.sky]}>
          <Video size={28} color={tokens.colors.blue} strokeWidth={1.8} />
          <LiveText style={styles.tileTitle}>You</LiveText>
          <LiveText style={styles.tileHint}>Preview</LiveText>
        </View>
        <View style={[styles.tile, styles.violet]}>
          <LiveText style={styles.q}>?</LiveText>
          <LiveText style={styles.tileTitle}>Stranger</LiveText>
          <LiveText style={styles.tileHint}>{partnerConnected ? 'Connected' : 'Waiting…'}</LiveText>
        </View>
      </View>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  pad: { paddingTop: tokens.spacing.md },
  row: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    minHeight: 132,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sky: {
    backgroundColor: tokens.colors.filterBgSky,
    borderColor: tokens.colors.filterBorderSky,
  },
  violet: {
    backgroundColor: tokens.colors.filterBgViolet,
    borderColor: tokens.colors.filterBorderViolet,
  },
  q: { fontSize: 32, color: tokens.colors.textMuted, marginBottom: 4 },
  tileTitle: { ...tokens.typography.titleSmall, color: tokens.colors.text, marginTop: 6 },
  tileHint: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 4 },
});
