import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Timer, MessageCircle, Shuffle } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { LiveContentWidth } from './LiveContentWidth.native';
import { LiveText } from './LiveTypography.native';

const ITEMS = [
  { key: 't', Icon: Timer, title: '60 seconds', caption: 'Timed session' },
  { key: 'c', Icon: MessageCircle, title: 'Text chat', caption: 'Type in real time' },
  { key: 's', Icon: Shuffle, title: 'Skip', caption: 'Next person' },
];

export function LiveFeatureGrid() {
  return (
    <LiveContentWidth style={styles.marginBottom}>
      <LiveText style={shellStyles.sectionTitle}>What you get</LiveText>
      <View style={styles.grid}>
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
  grid: { flexDirection: 'row', gap: 10 },
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
