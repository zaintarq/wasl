import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Heart, SlidersHorizontal, LayoutGrid, MapPin } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { LiveContentWidth } from '../live/LiveContentWidth.native';
import { LiveText } from '../live/LiveTypography.native';

const ITEMS = [
  {
    key: 'swipe',
    Icon: Heart,
    title: 'Swipe deck',
    caption: 'Like or skip profiles',
    circleBg: tokens.colors.filterBgRose,
    iconColor: tokens.colors.accent,
  },
  {
    key: 'filters',
    Icon: SlidersHorizontal,
    title: 'Filters',
    caption: 'Country & preferences',
    circleBg: tokens.colors.filterBgSky,
    iconColor: tokens.colors.blue,
  },
  {
    key: 'grid',
    Icon: LayoutGrid,
    title: 'Grid view',
    caption: 'Browse at a glance',
    circleBg: tokens.colors.filterBgViolet,
    iconColor: '#7c3aed',
  },
  {
    key: 'nearby',
    Icon: MapPin,
    title: 'Nearby',
    caption: 'People in your area',
    circleBg: tokens.colors.filterBgEmerald,
    iconColor: tokens.colors.green,
  },
];

export function HomeFeatureGrid() {
  return (
    <LiveContentWidth style={styles.marginBottom}>
      <LiveText style={styles.sectionTitle}>What you get</LiveText>
      <View style={styles.grid}>
        {ITEMS.map(({ key, Icon, title, caption, circleBg, iconColor }) => (
          <View key={key} style={styles.cell}>
            <View style={[styles.iconCircle, { backgroundColor: circleBg }]}>
              <Icon size={22} color={iconColor} strokeWidth={2} />
            </View>
            <LiveText style={styles.cellTitle}>{title}</LiveText>
            <LiveText style={styles.cellCaption}>{caption}</LiveText>
          </View>
        ))}
      </View>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  marginBottom: { marginBottom: tokens.spacing.lg },
  sectionTitle: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cell: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    minWidth: 0,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cellTitle: {
    ...tokens.typography.label,
    fontSize: 13,
    color: tokens.colors.text,
    textAlign: 'center',
  },
  cellCaption: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
});
