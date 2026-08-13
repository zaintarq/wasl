import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { tokens } from '../../../tokens';

export function InterestChip({ label }) {
  if (!label) return null;
  return <Text style={styles.chip}>{label}</Text>;
}

const styles = StyleSheet.create({
  chip: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.brandPinkDeep,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
});
