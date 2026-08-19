import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Home, MessageCircle, Users, Mic, Video } from 'lucide-react-native';
import { tokens } from '../tokens';
import { useReduceMotion, pickSpring } from '../../utils/reduceMotion.native';
import { TabQuickLinks } from './TabQuickLinks.native';

export const MAIN_BOTTOM_NAV_FALLBACK_H = 66;

const INK = '#2B2420';
const CREAM = '#F7F1E8';
const TILE = 52;
const ACTIVE_ROTATION = -4;
const SPRING = tokens.motion.spring.jelly;
const NAV_HIT_SLOP = { top: 8, bottom: 8, left: 6, right: 6 };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TABS = [
  { key: 'home', label: 'Home', Icon: Home, route: 'home', inactiveRotation: 2 },
  { key: 'chats', label: 'Chats', Icon: MessageCircle, route: 'matches', inactiveRotation: -2 },
  { key: 'social', label: 'Social', Icon: Users, route: 'social', inactiveRotation: 3 },
  { key: 'clubs', label: 'Clubs', Icon: Mic, route: 'clubs', inactiveRotation: -3 },
  { key: 'live', label: 'Live', Icon: Video, route: 'liveRandom', inactiveRotation: 2 },
];

function NavTile({ tab, isActive, onPress, reduceMotion }) {
  const { Icon, label, inactiveRotation } = tab;
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const pressScale = useSharedValue(1);
  const spring = pickSpring(SPRING, reduceMotion);

  useEffect(() => {
    activeProgress.value = withSpring(isActive ? 1 : 0, spring);
  }, [activeProgress, isActive, spring]);

  const tileStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      activeProgress.value,
      [0, 1],
      [inactiveRotation, ACTIVE_ROTATION]
    );

    return {
      opacity: interpolate(activeProgress.value, [0, 1], [0.55, 1]),
      backgroundColor: interpolateColor(activeProgress.value, [0, 1], [CREAM, INK]),
      borderWidth: interpolate(activeProgress.value, [0, 1], [2, 0]),
      borderColor: INK,
      transform: [{ rotate: `${rotation}deg` }, { scale: pressScale.value }],
    };
  });

  const iconInkOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(activeProgress.value, [0, 1], [1, 0]),
  }));

  const iconCreamOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(activeProgress.value, [0, 1], [0, 1]),
  }));

  const fireHaptic = useCallback(async () => {
    try {
      const Haptics = await import('expo-haptics');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // ignore
    }
  }, []);

  const handlePressIn = useCallback(() => {
    pressScale.value = withSpring(0.92, pickSpring(tokens.motion.spring.snappy, reduceMotion));
  }, [pressScale, reduceMotion]);

  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, spring);
  }, [pressScale, spring]);

  const handlePress = useCallback(() => {
    fireHaptic();
    onPress?.();
  }, [fireHaptic, onPress]);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      hitSlop={NAV_HIT_SLOP}
      style={[styles.tile, tileStyle]}
    >
      <View style={styles.iconStack} pointerEvents="none">
        <Animated.View style={[styles.iconLayer, iconInkOpacity]}>
          <Icon size={21} color={INK} strokeWidth={2.2} />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, iconCreamOpacity]}>
          <Icon size={21} color={CREAM} strokeWidth={2.2} />
        </Animated.View>
      </View>
    </AnimatedPressable>
  );
}

export function mainBottomNavClearance(measuredNavH, extraGap = 12) {
  return (measuredNavH || MAIN_BOTTOM_NAV_FALLBACK_H) + extraGap;
}

export function MainBottomNav({
  active = 'home',
  onNavigate,
  onLayout,
  onProfilePress,
  onSettingsPress,
}) {
  const insets = useSafeAreaInsets();
  const floatBottom = Math.max(8, insets.bottom + 6);
  const reduceMotion = useReduceMotion();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { paddingBottom: floatBottom }]}
      onLayout={(e) => onLayout?.(e?.nativeEvent?.layout?.height || 0)}
    >
      <TabQuickLinks onProfilePress={onProfilePress} onSettingsPress={onSettingsPress} />
      <View style={styles.row}>
        {TABS.map((tab) => (
          <NavTile
            key={tab.key}
            tab={tab}
            isActive={active === tab.key}
            onPress={() => onNavigate(tab.route)}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexShrink: 0,
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconStack: {
    width: 21,
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
