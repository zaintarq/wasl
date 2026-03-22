import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../tokens';

export function RetroBadge({ text, children, style, textStyle, color }) {
  const bg = color ?? tokens.colors.surfaceElevated;
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, textStyle]}>{children || text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.full,
    borderWidth: 0,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
    letterSpacing: 0.2,
  },
});




