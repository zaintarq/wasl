import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useDerivedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '../../ui/tokens';

const { width: SCREEN_W } = Dimensions.get('window');

export function SwipeDeck({
  data,
  index,
  renderCard,
  onSwipe,
  disabled,
  style,
  gestureX,
  gestureY,
}) {
  const top = data?.[index] || null;
  const next = data?.[index + 1] || null;

  const internalX = useSharedValue(0);
  const internalY = useSharedValue(0);
  const translateX = gestureX || internalX;
  const translateY = gestureY || internalY;
  const hasSwiped = useSharedValue(false);
  const [showLiked, setShowLiked] = useState(false);

  // Safe wrapper: pass only direction + userId (string) from worklet to avoid runOnJS object crash.
  // HomeScreen resolves the full user from allCandidates when it receives a string id.
  const safeOnSwipe = useCallback((direction, userOrId) => {
    try {
      if (onSwipe && (userOrId != null && userOrId !== '')) {
        onSwipe(direction, userOrId);
      }
    } catch (error) {
      console.error('[SwipeDeck] Error in onSwipe:', error);
    }
  }, [onSwipe]);

  const threshold = useMemo(() => Math.max(90, SCREEN_W * 0.25), []);
  const thresholdY = useMemo(() => 110, []);

  const reset = () => {
    'worklet';
    translateX.value = withSpring(0, { damping: 20, stiffness: 260, mass: 0.7 });
    translateY.value = withSpring(0, { damping: 20, stiffness: 260, mass: 0.7 });
  };

  const flyOut = (dir) => {
    'worklet';
    const toX = dir === 'right' ? SCREEN_W * 1.4 : -SCREEN_W * 1.4;
    translateX.value = withTiming(toX, { duration: 170 }, (finished) => {
      'worklet';
      if (finished) {
        translateX.value = 0;
        translateY.value = 0;
        hasSwiped.value = false;
      }
    });
    translateY.value = withTiming(translateY.value + 10, { duration: 170 });
  };

  // Prefer horizontal intent to avoid fighting with inner vertical scroll.
  const activeOffsetX = useMemo(() => [-14, 14], []);
  const activeOffsetY = useMemo(() => [-16, 16], []);

  const pan = useMemo(() => {
    return Gesture.Pan()
      .enabled(!disabled && !!top)
      .minDistance(2)
      .activeOffsetX(activeOffsetX)
      .activeOffsetY(activeOffsetY)
      .onUpdate((e) => {
        translateX.value = e.translationX;
        translateY.value = e.translationY;
      })
      .onEnd((e) => {
        const vx = e.velocityX;
        const vy = e.velocityY;
        const shouldRight = translateX.value > threshold || vx > 850;
        const shouldLeft = translateX.value < -threshold || vx < -850;
        const verticalDominates = Math.abs(translateY.value) > Math.abs(translateX.value) * 1.15;
        const shouldUp = verticalDominates && (translateY.value < -thresholdY || vy < -950);
        const shouldDown = verticalDominates && (translateY.value > thresholdY || vy > 950);

        if (shouldRight) {
          if (hasSwiped.value) return;
          hasSwiped.value = true;
          runOnJS(setShowLiked)(true);
          flyOut('right');
          if (onSwipe && top) {
            runOnJS(safeOnSwipe)('right', top?.id ?? top?.uid ?? '');
          }
          return;
        }
        if (shouldLeft) {
          if (hasSwiped.value) return;
          hasSwiped.value = true;
          flyOut('left');
          if (onSwipe && top) {
            runOnJS(safeOnSwipe)('left', top?.id ?? top?.uid ?? '');
          }
          return;
        }
        if (shouldUp) {
          if (hasSwiped.value) return;
          hasSwiped.value = true;
          flyOut('right');
          if (onSwipe && top) {
            runOnJS(safeOnSwipe)('up', top?.id ?? top?.uid ?? '');
          }
          return;
        }
        if (shouldDown) {
          if (hasSwiped.value) return;
          hasSwiped.value = true;
          flyOut('left');
          if (onSwipe && top) {
            runOnJS(safeOnSwipe)('down', top?.id ?? top?.uid ?? '');
          }
          return;
        }
        reset();
      });
  }, [
    activeOffsetX,
    activeOffsetY,
    disabled,
    safeOnSwipe,
    reset,
    threshold,
    thresholdY,
    top,
    onSwipe,
    translateX,
    translateY,
    hasSwiped,
  ]);

  const likeOpacity = useDerivedValue(() => {
    // Show full opacity when swiped right or when dragging past threshold
    if (translateX.value > threshold * 0.7) return 1;
    return interpolate(translateX.value, [0, threshold], [0, 1], Extrapolation.CLAMP);
  });
  
  const showLikedText = useDerivedValue(() => {
    return translateX.value > threshold * 0.7;
  });
  const nopeOpacity = useDerivedValue(() => {
    return interpolate(translateX.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP);
  });

  const cardStyle = useAnimatedStyle(() => {
    const rot = interpolate(translateX.value, [-SCREEN_W, 0, SCREEN_W], [-12, 0, 12], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rot}deg` },
      ],
    };
  });

  const likeStyle = useAnimatedStyle(() => {
    return { opacity: likeOpacity.value, transform: [{ rotate: '-8deg' }] };
  });

  const nopeStyle = useAnimatedStyle(() => {
    return { opacity: nopeOpacity.value, transform: [{ rotate: '8deg' }] };
  });

  const nextStyle = useAnimatedStyle(() => {
    const s = interpolate(Math.abs(translateX.value), [0, threshold], [0.96, 1], Extrapolation.CLAMP);
    const ty = interpolate(Math.abs(translateX.value), [0, threshold], [10, 0], Extrapolation.CLAMP);
    return { transform: [{ scale: s }, { translateY: ty }] };
  });

  return (
    <View style={[styles.deck, style]}>
      {next ? (
        <Animated.View style={[styles.cardShell, nextStyle]}>
          {renderCard(next, { isTop: false })}
        </Animated.View>
      ) : null}

      {top ? (
        <GestureDetector gesture={pan}>
          <Animated.View 
            style={[styles.cardShell, cardStyle]}
            onLayout={() => {
              // Reset liked state when new card appears
              if (showLiked) setShowLiked(false);
            }}
          >
            {/* Overlays */}
            <Animated.View pointerEvents="none" style={[styles.overlay, styles.like, likeStyle]}>
              <Text style={styles.overlayText}>{showLiked ? 'LIKED' : 'LIKE'}</Text>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.overlay, styles.nope, nopeStyle]}>
              <Text style={styles.overlayText}>NOPE</Text>
            </Animated.View>
            {renderCard(top, { isTop: true })}
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardShell: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 18,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 3,
    borderColor: tokens.colors.borderDark,
    borderRadius: 10,
    zIndex: 10,
  },
  like: {
    left: 18,
    backgroundColor: tokens.colors.green,
  },
  nope: {
    right: 18,
    backgroundColor: tokens.colors.pink,
  },
  overlayText: {
    fontWeight: '900',
    letterSpacing: 1,
    color: tokens.colors.borderDark,
  },
});




