import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { tokens } from '../tokens';
import { HuzzPressable } from './HuzzPressable.native';

/**
 * Consistent back affordance: arrow + "Back" label, 44pt touch target.
 */
export function ScreenBackHeader({
  title,
  onBack,
  backLabel = 'Back',
  rightSlot,
  style,
  titleStyle,
  light = false,
}) {
  const ink = light ? tokens.colors.textOnBrand : tokens.colors.text;

  return (
    <View style={[styles.row, style]}>
      <HuzzPressable
        style={styles.sideBtn}
        onPress={onBack}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={backLabel}
      >
        <ArrowLeft size={22} color={ink} strokeWidth={2.25} />
        <Text style={[styles.backLabel, { color: ink }]}>{backLabel}</Text>
      </HuzzPressable>

      {title ? (
        <Text style={[styles.title, { color: ink }, titleStyle]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.titleSpacer} />
      )}

      {rightSlot || <View style={styles.sidePlaceholder} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: tokens.spacing.screenHorizontal,
    gap: 8,
  },
  sideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: 'flex-start',
  },
  backLabel: {
    ...tokens.typography.label,
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    ...tokens.typography.label,
    fontSize: 17,
    fontWeight: '800',
  },
  titleSpacer: { flex: 1 },
  sidePlaceholder: {
    minWidth: 72,
    minHeight: 44,
  },
});
