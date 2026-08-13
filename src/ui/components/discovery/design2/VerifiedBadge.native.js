import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { tokens } from '../../../tokens';

export function VerifiedBadge({ size = 18 }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Check size={size * 0.55} color="#FFFFFF" strokeWidth={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: tokens.colors.brandPink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
