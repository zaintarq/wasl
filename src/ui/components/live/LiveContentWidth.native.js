import React from 'react';
import { View, StyleSheet } from 'react-native';
import { tokens } from '../../tokens';

/** Horizontal padding shared by Live-style screen headers and sections. */
export const LIVE_SCREEN_GUTTER = tokens.spacing.screenHorizontal;

/**
 * Centers Live screen content on wide phones — matches app max content width.
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
