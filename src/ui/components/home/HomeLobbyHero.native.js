import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Heart, X, Sparkles } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { RetroBadge } from '../RetroBadge.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText, useLiveTypography } from '../live/LiveTypography.native';

/**
 * Discovery lobby — only when Home has zero profiles (filters too narrow, new area, etc.).
 */
export function HomeLobbyHero() {
  const { fontFamily, ready } = useLiveTypography();

  return (
    <LiveContentWidth style={styles.marginBottom}>
      <RetroBadge
        text="Discover · Swipe · Connect"
        color="rgba(255,255,255,0.18)"
        textStyle={[
          { color: tokens.colors.textOnBrand },
          ready && fontFamily ? { fontFamily } : null,
        ]}
      />

      <LiveText style={shellStyles.heroWordmark}>Discover</LiveText>
      <LiveText style={shellStyles.heroHeadline}>Find your person</LiveText>
      <LiveText style={shellStyles.heroSub}>
        Browse profiles near you. Swipe to connect, message when it feels right, and tune who you see with filters.
      </LiveText>

      <View style={styles.tilesArea}>
        <View style={[styles.tile, styles.tileLeft]}>
          <Heart size={26} color={tokens.colors.textOnBrand} strokeWidth={1.8} />
          <LiveText style={styles.tileLabel}>Like</LiveText>
          <LiveText style={styles.tileHint}>Connect</LiveText>
        </View>

        <View style={styles.tileBridge}>
          <View style={styles.bridgeCircle}>
            <X size={16} color={tokens.colors.textOnBrand} strokeWidth={2.5} />
          </View>
        </View>

        <View style={[styles.tile, styles.tileRight]}>
          <Sparkles size={26} color={tokens.colors.textOnBrand} strokeWidth={1.8} />
          <LiveText style={styles.tileLabel}>Match</LiveText>
          <LiveText style={styles.tileHint}>Mutual vibe</LiveText>
        </View>
      </View>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  marginBottom: { marginBottom: tokens.spacing.lg },
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
    borderColor: tokens.colors.shellTileBorder,
    backgroundColor: tokens.colors.shellTile,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 112,
    justifyContent: 'center',
  },
  tileLeft: { marginRight: 4, transform: [{ rotate: '-2deg' }] },
  tileRight: { marginLeft: 4, transform: [{ rotate: '2deg' }] },
  tileBridge: { width: 36, alignItems: 'center', justifyContent: 'center' },
  bridgeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.shellIconBtn,
    borderWidth: 1,
    borderColor: tokens.colors.shellTileBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...tokens.typography.label, color: tokens.colors.textOnBrand, marginTop: 8 },
  tileHint: { ...tokens.typography.caption, color: tokens.colors.textMutedOnBrand, marginTop: 2 },
});
