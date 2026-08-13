import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Mic, MessageCircle, Users } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { RetroBadge } from '../RetroBadge.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText, useLiveTypography } from '../live/LiveTypography.native';

export function ClubLobbyHero() {
  const { fontFamily, ready } = useLiveTypography();

  return (
    <LiveContentWidth style={styles.marginBottom}>
      <RetroBadge
        text="Voice · Chat · Community"
        color="rgba(255,255,255,0.18)"
        textStyle={[
          { color: tokens.colors.textOnBrand },
          ready && fontFamily ? { fontFamily } : null,
        ]}
      />

      <LiveText style={shellStyles.heroWordmark}>Clubs</LiveText>
      <LiveText style={shellStyles.heroHeadline}>Hang out with your people</LiveText>
      <LiveText style={shellStyles.heroSub}>
        Drop into voice rooms, chat in real time, and build your own crew. Create a club or join with an invite code.
      </LiveText>

      <View style={styles.tilesArea}>
        <View style={[styles.tile, styles.tileLeft]}>
          <Mic size={26} color={tokens.colors.textOnBrand} strokeWidth={1.8} />
          <LiveText style={styles.tileLabel}>Voice</LiveText>
          <LiveText style={styles.tileHint}>Open mic</LiveText>
        </View>

        <View style={styles.tileBridge}>
          <View style={styles.bridgeCircle}>
            <MessageCircle size={16} color={tokens.colors.textOnBrand} strokeWidth={2.5} />
          </View>
        </View>

        <View style={[styles.tile, styles.tileRight]}>
          <Users size={26} color={tokens.colors.textOnBrand} strokeWidth={1.8} />
          <LiveText style={styles.tileLabel}>Your crew</LiveText>
          <LiveText style={styles.tileHint}>Public or private</LiveText>
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
