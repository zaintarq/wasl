import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserRound, SlidersHorizontal, Settings, X } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { HuzzPressable } from '../HuzzPressable.native';

const ITEMS = [
  {
    key: 'profile',
    label: 'Profile',
    hint: 'Your photos and bio',
    Icon: UserRound,
  },
  {
    key: 'filters',
    label: 'Filters',
    hint: 'Who shows up in discovery',
    Icon: SlidersHorizontal,
  },
  {
    key: 'settings',
    label: 'Settings',
    hint: 'Privacy, data, and account',
    Icon: Settings,
  },
];

/**
 * Home header overflow menu — Wasl-styled sheet (not system Alert pills).
 */
export function HomeHeaderMenu({ visible, onClose, onProfile, onFilters, onSettings }) {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    if (!visible) return undefined;
    fade.setValue(0);
    slide.setValue(28);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(slide, { toValue: 0, friction: 9, tension: 120, useNativeDriver: true }),
    ]).start();
    return undefined;
  }, [visible, fade, slide]);

  const run = (fn) => {
    onClose?.();
    // Let the modal dismiss before navigating.
    setTimeout(() => fn?.(), 40);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss menu" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              opacity: fade,
              transform: [{ translateY: slide }],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Quick links</Text>
              <Text style={styles.subtitle}>Jump to your account tools</Text>
            </View>
            <HuzzPressable
              style={styles.closeBtn}
              onPress={onClose}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={tokens.colors.brandPinkDeep} strokeWidth={2.4} />
            </HuzzPressable>
          </View>

          <View style={styles.list}>
            {ITEMS.map((item, index) => {
              const { Icon } = item;
              const onPress =
                item.key === 'profile'
                  ? () => run(onProfile)
                  : item.key === 'filters'
                    ? () => run(onFilters)
                    : () => run(onSettings);
              return (
                <HuzzPressable
                  key={item.key}
                  style={[styles.row, index === ITEMS.length - 1 ? styles.rowLast : null]}
                  onPress={onPress}
                  haptic="light"
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View style={styles.iconWrap}>
                    <Icon size={20} color={tokens.colors.brandPink} strokeWidth={2.2} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Text style={styles.rowHint}>{item.hint}</Text>
                  </View>
                </HuzzPressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: tokens.colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#831843',
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -4 },
      },
      android: { elevation: 12 },
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(219, 39, 119, 0.25)',
    marginBottom: 12,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: tokens.colors.textOnBrand,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.textMutedOnBrand,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.shellIconBtn,
    borderWidth: 1,
    borderColor: tokens.colors.shellRowBorder,
  },
  list: {
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.shellRowBorder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.shellRowBorder,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.accentDim,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  rowHint: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.textSecondary,
  },
});
