import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { tokens } from '../tokens';
import { HuzzPressable } from './HuzzPressable.native';

const VARIANTS = {
  primary: {
    bg: tokens.colors.accent,
    text: '#FFFFFF',
  },
  secondary: {
    bg: tokens.colors.surfaceOverlay,
    text: tokens.colors.text,
  },
  green: {
    bg: tokens.colors.green,
    text: '#FFFFFF',
  },
  blue: {
    bg: tokens.colors.blue,
    text: '#FFFFFF',
  },
  gray: {
    bg: tokens.colors.gray,
    text: '#FFFFFF',
  },
  danger: {
    bg: tokens.colors.danger,
    text: '#FFFFFF',
  },
  outline: {
    bg: 'transparent',
    borderWidth: 1.5,
    borderColor: tokens.colors.border,
    text: tokens.colors.text,
  },
};

export function RetroButton({
  title,
  children,
  onPress,
  disabled,
  variant = 'secondary',
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}) {
  const v = useMemo(() => VARIANTS[variant] || VARIANTS.secondary, [variant]);
  const label = accessibilityLabel || (typeof title === 'string' ? title : undefined);

  return (
    <HuzzPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderWidth: v.borderWidth ?? 0,
          borderColor: v.borderColor,
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: v.text }, textStyle]}>{children || title}</Text>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: tokens.radius.md,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    ...tokens.typography.button,
    color: tokens.colors.text,
  },
});
