import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { User, Settings } from 'lucide-react-native';
import { tokens } from '../tokens';
import { HuzzPressable } from './HuzzPressable.native';

/** Profile + Settings shortcuts above the bottom nav on main tab screens. */
export function TabQuickLinks({ onProfilePress, onSettingsPress }) {
  if (!onProfilePress && !onSettingsPress) return null;

  return (
    <View style={styles.row}>
      {onProfilePress ? (
        <HuzzPressable
          style={styles.link}
          onPress={onProfilePress}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <User size={16} color={tokens.colors.brandPinkDeep} strokeWidth={2.2} />
          <Text style={styles.linkText}>Profile</Text>
        </HuzzPressable>
      ) : null}
      {onSettingsPress ? (
        <HuzzPressable
          style={styles.link}
          onPress={onSettingsPress}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Settings size={16} color={tokens.colors.brandPinkDeep} strokeWidth={2.2} />
          <Text style={styles.linkText}>Settings</Text>
        </HuzzPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 6,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.colors.brandPinkDeep,
  },
});
