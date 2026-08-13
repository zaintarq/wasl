import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { tokens } from '../tokens';

export function RetroCard({ children, style, variant = 'window' }) {
  return <View style={[styles.base, styles[variant], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: tokens.shadow.color,
        shadowOffset: tokens.shadow.offsetMd,
        shadowOpacity: tokens.shadow.opacity,
        shadowRadius: tokens.shadow.radius,
      },
      android: { elevation: tokens.shadow.elevation },
    }),
  },
  window: {
    padding: tokens.spacing.lg,
  },
  panel: {
    padding: tokens.spacing.md,
  },
  flat: {
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    padding: 0,
  },
});
