import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Heart, SlidersHorizontal, LayoutGrid, MapPin } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { shellStyles } from '../../styles/shellStyles.native';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText } from '../live/LiveTypography.native';
import { HuzzPressable } from '../HuzzPressable.native';

const ITEMS = [
  { key: 'swipe', Icon: Heart, title: 'Swipe deck', caption: 'Like or skip profiles' },
  { key: 'filters', Icon: SlidersHorizontal, title: 'Filters', caption: 'Country & preferences' },
  { key: 'grid', Icon: LayoutGrid, title: 'Grid view', caption: 'Browse at a glance' },
  { key: 'nearby', Icon: MapPin, title: 'Nearby', caption: 'People in your area' },
];

export function HomeFeatureGrid({ onAction }) {
  return (
    <LiveContentWidth style={styles.marginBottom}>
      <LiveText style={shellStyles.sectionTitle}>What you get</LiveText>
      <View style={shellStyles.featureGrid}>
        {ITEMS.map(({ key, Icon, title, caption }) => (
          <HuzzPressable
            key={key}
            onPress={() => onAction?.(key)}
            haptic="light"
            style={shellStyles.featureCell}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${caption}`}
          >
            <View style={styles.iconCircle}>
              <Icon size={22} color={tokens.colors.textOnBrand} strokeWidth={2} />
            </View>
            <LiveText style={shellStyles.featureCellTitle}>{title}</LiveText>
            <LiveText style={shellStyles.featureCellCaption}>{caption}</LiveText>
          </HuzzPressable>
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
