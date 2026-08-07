import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Heart, MessageCircle } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { RetroCard } from '../RetroCard.native';
import { RetroBadge } from '../RetroBadge.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText, useLiveTypography } from '../live/LiveTypography.native';

export function ChatLobbyHero() {
  const { fontFamily, ready } = useLiveTypography();

  return (
    <LiveContentWidth style={styles.marginBottom}>
      <View style={styles.row}>
        <View style={styles.accentRail} />
        <RetroCard variant="panel" style={styles.cardGrow}>
          <RetroBadge
            text="Match · Message · Connect"
            color={tokens.colors.accentDim}
            textStyle={[
              { color: tokens.colors.accent },
              ready && fontFamily ? { fontFamily } : null,
            ]}
          />

          <LiveText style={styles.wordmark}>Chats</LiveText>

          <LiveText style={styles.headline}>Stay in touch</LiveText>
          <LiveText style={styles.sub}>
            Your mutual connections live here. Text, voice notes, translations, and AI openers when you need a hand.
          </LiveText>

          <View style={styles.tilesArea}>
            <View style={[styles.tile, styles.tileLeft, styles.tileRose]}>
              <Heart size={26} color={tokens.colors.accent} strokeWidth={1.8} />
              <LiveText style={styles.tileLabel}>Match</LiveText>
              <LiveText style={styles.tileHint}>Mutual like</LiveText>
            </View>

            <View style={styles.tileBridge}>
              <View style={styles.bridgeCircle}>
                <MessageCircle size={16} color={tokens.colors.blue} strokeWidth={2.5} />
              </View>
            </View>

            <View style={[styles.tile, styles.tileRight, styles.tileSky]}>
              <MessageCircle size={26} color={tokens.colors.blue} strokeWidth={1.8} />
              <LiveText style={styles.tileLabel}>Chat</LiveText>
              <LiveText style={styles.tileHint}>Real time</LiveText>
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
    backgroundColor: tokens.colors.accent,
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
  tileRose: {
    backgroundColor: tokens.colors.filterBgRose,
    borderColor: tokens.colors.filterBorderRose,
    transform: [{ rotate: '-2deg' }],
  },
  tileSky: {
    backgroundColor: tokens.colors.filterBgSky,
    borderColor: tokens.colors.filterBorderSky,
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
