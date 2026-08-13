import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Mic, MessageCircle, Lock, Hash } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText } from '../live/LiveTypography.native';

const ITEMS = [
  { key: 'voice', Icon: Mic, title: 'Voice rooms', caption: 'Talk live with mic' },
  { key: 'chat', Icon: MessageCircle, title: 'Text chat', caption: 'Messages in the room' },
  { key: 'private', Icon: Lock, title: 'Private clubs', caption: 'Invite-only access' },
  { key: 'code', Icon: Hash, title: 'Invite codes', caption: 'Share with friends' },
];

export function ClubFeatureGrid() {
  return (
    <LiveContentWidth style={styles.marginBottom}>
      <LiveText style={shellStyles.sectionTitle}>What you get</LiveText>
      <View style={shellStyles.featureGrid}>
        {ITEMS.map(({ key, Icon, title, caption }) => (
          <View key={key} style={shellStyles.featureCell}>
            <View style={styles.iconCircle}>
              <Icon size={22} color={tokens.colors.textOnBrand} strokeWidth={2} />
            </View>
            <LiveText style={shellStyles.featureCellTitle}>{title}</LiveText>
            <LiveText style={shellStyles.featureCellCaption}>{caption}</LiveText>
          </View>
        ))}
      </View>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  marginBottom: { marginBottom: tokens.spacing.lg },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.shellIconBtn,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
});
