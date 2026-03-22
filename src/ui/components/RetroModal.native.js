import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, StyleSheet, Pressable, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '../tokens';
import { RetroCard } from './RetroCard.native';

export function RetroModal({ visible, onClose, children, cardStyle, animationType = 'slide' }) {
  const [mounted, setMounted] = useState(!!visible);

  const sheetH = useSharedValue(640);
  const translateY = useSharedValue(sheetH.value);
  const openProgress = useSharedValue(0); // 0 closed, 1 open

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, { damping: 20, stiffness: 220, mass: 0.85 });
      openProgress.value = withTiming(1, { duration: 220 });
    } else if (mounted) {
      openProgress.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(sheetH.value, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => {
    const o = interpolate(openProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: o };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const scale = interpolate(openProgress.value, [0, 1], [0.94, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: translateY.value }, { scale }],
    };
  });

  const pan = useMemo(() => {
    return Gesture.Pan()
      .onUpdate((e) => {
        const next = Math.max(0, translateY.value + e.changeY);
        translateY.value = Math.min(next, sheetH.value);
      })
      .onEnd((e) => {
        const shouldClose = translateY.value > sheetH.value * 0.35 || e.velocityY > 900;
        if (shouldClose) {
          openProgress.value = withTiming(0, { duration: 140 });
          translateY.value = withTiming(sheetH.value, { duration: 160 }, (finished) => {
            if (finished) runOnJS(setMounted)(false);
          });
          if (onClose) runOnJS(onClose)();
        } else {
          translateY.value = withSpring(0, { damping: 20, stiffness: 220, mass: 0.85 });
          openProgress.value = withTiming(1, { duration: 140 });
        }
      });
  }, [onClose, openProgress, sheetH, translateY]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[styles.sheetWrap, sheetStyle]}
            onLayout={(e) => {
              const h = e?.nativeEvent?.layout?.height || 0;
              if (h > 0) sheetH.value = h;
            }}
          >
            <View style={styles.sheetSurface}>
              <View style={styles.grabberRow}>
                <View style={styles.grabber} />
              </View>
              <RetroCard style={[styles.card, cardStyle]} variant="panel">
                {children}
              </RetroCard>
            </View>
          </Animated.View>
        </GestureDetector>
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
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheetWrap: {
    paddingHorizontal: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  sheetSurface: {
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    overflow: 'hidden',
    backgroundColor: tokens.colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  card: {
    borderRadius: 0,
    borderWidth: 0,
    maxHeight: '88%',
    shadowOpacity: 0,
    elevation: 0,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: tokens.colors.surface,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
});




