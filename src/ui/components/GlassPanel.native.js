import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { tokens } from '../tokens';

/**
 * Frosted dark panel — readable on photos and on the pink shell.
 * iOS: native blur. Android: translucent fallback (blur is inconsistent on some devices).
 */
export function GlassPanel({ children, style, contentStyle, intensity = 42 }) {
  const radius = tokens.radius.lg;

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.wrap, { borderRadius: radius }, style]}>
        <BlurView
          intensity={intensity}
          tint="dark"
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
        <View style={[styles.tint, { borderRadius: radius }]} pointerEvents="none" />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles.androidFallback, { borderRadius: radius }, style]}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.glassBorder,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.colors.glassTint,
  },
  androidFallback: {
    backgroundColor: tokens.colors.glassFallback,
    borderColor: tokens.colors.glassBorder,
  },
  content: {
    padding: tokens.spacing.md,
  },
});
