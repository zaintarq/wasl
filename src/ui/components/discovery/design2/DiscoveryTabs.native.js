import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { tokens } from '../../../tokens';
import { HuzzPressable } from '../../HuzzPressable.native';

const SPRING = tokens.motion.spring.jelly;

const TABS = [
  { key: 'forYou', label: 'For You' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'popular', label: 'Popular' },
  { key: 'new', label: 'New' },
];

function moveIndicator(indicatorX, indicatorW, indicatorY, indicatorH, layout) {
  indicatorX.value = withSpring(layout.x, SPRING);
  indicatorW.value = withSpring(layout.width, SPRING);
  indicatorY.value = withSpring(layout.y, SPRING);
  indicatorH.value = withSpring(layout.height, SPRING);
}

export function DiscoveryTabs({ active = 'forYou', onChange }) {
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  const indicatorY = useSharedValue(0);
  const indicatorH = useSharedValue(34);
  const [layouts, setLayouts] = useState({});

  const syncIndicator = useCallback(
    (key, layoutMap) => {
      const layout = layoutMap[key];
      if (layout?.width > 0) {
        moveIndicator(indicatorX, indicatorW, indicatorY, indicatorH, layout);
      }
    },
    [indicatorH, indicatorW, indicatorX, indicatorY]
  );

  useEffect(() => {
    syncIndicator(active, layouts);
  }, [active, layouts, syncIndicator]);

  const onTabLayout = useCallback(
    (key, e) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      setLayouts((prev) => {
        const next = { ...prev, [key]: { x, y, width, height } };
        if (key === active) {
          requestAnimationFrame(() => syncIndicator(active, next));
        }
        return next;
      });
    },
    [active, syncIndicator]
  );

  const handlePress = useCallback(
    (key) => {
      syncIndicator(key, layouts);
      onChange?.(key);
    },
    [layouts, onChange, syncIndicator]
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }, { translateY: indicatorY.value }],
    width: Math.max(indicatorW.value, 0),
    height: Math.max(indicatorH.value, 0),
  }));

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroll}
      >
        <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <HuzzPressable
              key={tab.key}
              onPress={() => handlePress(tab.key)}
              onLayout={(e) => onTabLayout(tab.key, e)}
              haptic="light"
              style={styles.pill}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                {tab.label.toUpperCase()}
              </Text>
            </HuzzPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0 },
  scroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    gap: 8,
    paddingVertical: 4,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.brandPink,
    zIndex: 0,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.full,
    zIndex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  labelActive: { color: '#FFFFFF' },
  labelInactive: { color: tokens.colors.textMutedOnBrand },
});
