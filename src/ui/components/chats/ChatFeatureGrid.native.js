import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MessageCircle, Languages, Sparkles, Mic } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText } from '../live/LiveTypography.native';

const ITEMS = [
  { key: 'text', Icon: MessageCircle, title: 'Text chat', caption: 'Instant messages' },
  { key: 'voice', Icon: Mic, title: 'Voice notes', caption: 'Send audio clips' },
  { key: 'translate', Icon: Languages, title: 'Translate', caption: 'Chat in any language' },
  { key: 'ai', Icon: Sparkles, title: 'AI openers', caption: 'Break the ice' },
];

export function ChatFeatureGrid() {
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
