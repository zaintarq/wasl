import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Heart, MessageCircle } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { RetroBadge } from '../RetroBadge.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText, useLiveTypography } from '../live/LiveTypography.native';

export function ChatLobbyHero() {
  const { fontFamily, ready } = useLiveTypography();

  return (
    <LiveContentWidth style={styles.marginBottom}>
      <RetroBadge
        text="Match · Message · Connect"
        color="rgba(255,255,255,0.18)"
        textStyle={[
          { color: tokens.colors.textOnBrand },
          ready && fontFamily ? { fontFamily } : null,
        ]}
      />

      <LiveText style={shellStyles.heroWordmark}>Chats</LiveText>
      <LiveText style={shellStyles.heroHeadline}>Stay in touch</LiveText>
      <LiveText style={shellStyles.heroSub}>
        Your mutual connections live here. Text, voice notes, translations, and AI openers when you need a hand.
      </LiveText>

      <View style={styles.tilesArea}>
        <View style={[styles.tile, styles.tileLeft]}>
          <Heart size={26} color={tokens.colors.textOnBrand} strokeWidth={1.8} />
          <LiveText style={styles.tileLabel}>Match</LiveText>
          <LiveText style={styles.tileHint}>Mutual like</LiveText>
        </View>

        <View style={styles.tileBridge}>
          <View style={styles.bridgeCircle}>
            <MessageCircle size={16} color={tokens.colors.textOnBrand} strokeWidth={2.5} />
          </View>
        </View>

        <View style={[styles.tile, styles.tileRight]}>
          <MessageCircle size={26} color={tokens.colors.textOnBrand} strokeWidth={1.8} />
          <LiveText style={styles.tileLabel}>Chat</LiveText>
          <LiveText style={styles.tileHint}>Real time</LiveText>
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
