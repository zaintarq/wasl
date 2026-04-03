import React from 'react';
import { View, StyleSheet } from 'react-native';
import { tokens } from '../../tokens';

/** Horizontal inset so cards never hug the screen bezel. */
export const LIVE_SCREEN_GUTTER = tokens.spacing.lg;

/**
 * Centers Live screen content on wide phones — matches app max content width + side margins.
 */
export function LiveContentWidth({ children, style }) {
  return <View style={[styles.wrap, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: tokens.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: LIVE_SCREEN_GUTTER,
  },
});
