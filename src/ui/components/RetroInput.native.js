import React from 'react';
import { StyleSheet, TextInput, Platform } from 'react-native';
import { tokens } from '../tokens';

export function RetroInput({ style, accessibilityLabel, label, ...props }) {
  const a11yLabel = accessibilityLabel || label || props.placeholder;
  return (
    <TextInput
      {...props}
      accessibilityLabel={a11yLabel}
      style={[styles.input, style]}
      placeholderTextColor={tokens.colors.textMuted}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: '100%',
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: tokens.colors.text,
    ...tokens.typography.body,
    ...Platform.select({
      android: { paddingVertical: 12 },
    }),
  },
});
