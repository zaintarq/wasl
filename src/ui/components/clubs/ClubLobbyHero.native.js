import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Mic, MessageCircle, Users } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { RetroCard } from '../RetroCard.native';
import { RetroBadge } from '../RetroBadge.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText, useLiveTypography } from '../live/LiveTypography.native';

/**
 * Editorial hero for Clubs lobby — mirrors Live lobby layout.
 */
export function ClubLobbyHero() {
  const { fontFamily, ready } = useLiveTypography();

  return (
    <LiveContentWidth style={styles.marginBottom}>
      <View style={styles.row}>
        <View style={styles.accentRail} />
        <RetroCard variant="panel" style={styles.cardGrow}>
          <RetroBadge
            text="Voice · Chat · Community"
            color={tokens.colors.filterBgSky}
            textStyle={[
              { color: tokens.colors.blue },
              ready && fontFamily ? { fontFamily } : null,
            ]}
          />

          <LiveText style={styles.wordmark}>Clubs</LiveText>

          <LiveText style={styles.headline}>Hang out with your people</LiveText>
          <LiveText style={styles.sub}>
            Drop into voice rooms, chat in real time, and build your own crew. Create a club or join with an invite code.
          </LiveText>

          <View style={styles.tilesArea}>
            <View style={[styles.tile, styles.tileLeft, styles.tileEmerald]}>
              <Mic size={26} color={tokens.colors.green} strokeWidth={1.8} />
              <LiveText style={styles.tileLabel}>Voice</LiveText>
              <LiveText style={styles.tileHint}>Open mic</LiveText>
            </View>

            <View style={styles.tileBridge}>
              <View style={styles.bridgeCircle}>
                <MessageCircle size={16} color={tokens.colors.blue} strokeWidth={2.5} />
              </View>
            </View>

            <View style={[styles.tile, styles.tileRight, styles.tileViolet]}>
              <Users size={26} color="#7c3aed" strokeWidth={1.8} />
              <LiveText style={styles.tileLabel}>Your crew</LiveText>
              <LiveText style={styles.tileHint}>Public or private</LiveText>
            </View>
          </View>
        </RetroCard>
      </View>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  marginBottom: { marginBottom: tokens.spacing.lg },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  accentRail: {
    width: 5,
    borderRadius: 3,
    backgroundColor: tokens.colors.blue,
    opacity: 0.9,
  },
  cardGrow: { flex: 1, padding: tokens.spacing.md },
  wordmark: {
    fontSize: 44,
    lineHeight: 52,
    color: tokens.colors.text,
    marginTop: 10,
    marginBottom: 4,
  },
  headline: {
    ...tokens.typography.titleSmall,
    color: tokens.colors.text,
    marginTop: 4,
  },
  sub: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.textSecondary,
    marginTop: 8,
    lineHeight: 21,
  },
  tilesArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: tokens.spacing.lg,
    paddingHorizontal: 2,
  },
  tile: {
    flex: 1,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 112,
    justifyContent: 'center',
  },
  tileEmerald: {
    backgroundColor: tokens.colors.filterBgEmerald,
    borderColor: tokens.colors.filterBorderEmerald,
    transform: [{ rotate: '-2deg' }],
  },
  tileViolet: {
    backgroundColor: tokens.colors.filterBgViolet,
    borderColor: tokens.colors.filterBorderViolet,
    transform: [{ rotate: '2deg' }],
  },
  tileLeft: { marginRight: 4 },
  tileRight: { marginLeft: 4 },
  tileBridge: { width: 36, alignItems: 'center', justifyContent: 'center' },
  bridgeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: tokens.shadow.color,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  tileLabel: { ...tokens.typography.label, color: tokens.colors.text, marginTop: 8 },
  tileHint: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 2 },
});
