import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, MessageCircle, Mic, Video } from 'lucide-react-native';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

const TABS = [
  { key: 'home', label: 'Home', Icon: Home, route: 'home' },
  { key: 'matches', label: 'Chats', Icon: MessageCircle, route: 'matches' },
  { key: 'clubs', label: 'Clubs', Icon: Mic, route: 'clubs' },
  { key: 'live', label: 'Live', Icon: Video, route: 'liveRandom' },
];

export function MainBottomNav({ active = 'home', onNavigate, onLayout }) {
  const insets = useSafeAreaInsets();
  const floatBottom = Math.max(12, insets.bottom + 10);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { paddingBottom: floatBottom }]}
      onLayout={(e) => onLayout?.(e?.nativeEvent?.layout?.height || 0)}
    >
      <View pointerEvents="box-none" style={styles.row}>
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          const color = isActive ? tokens.colors.blue : tokens.colors.textSecondary;
          const { Icon } = tab;
          return (
            <HuzzPressable
              key={tab.key}
              style={styles.tab}
              onPress={() => onNavigate(tab.route)}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Icon size={24} color={color} strokeWidth={isActive ? 2.5 : 2} />
              <Text style={[styles.label, { color }, isActive && styles.labelActive]}>{tab.label}</Text>
            </HuzzPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 340,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 44,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.15,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  labelActive: {
    fontWeight: '800',
  },
});
