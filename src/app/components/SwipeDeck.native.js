import React, { useMemo, useCallback, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  useDerivedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { tokens } from '../../ui/tokens';

const { width: SCREEN_W } = Dimensions.get('window');
const SPRING = tokens.motion.spring.jelly;
const SPRING_SNAP = tokens.motion.spring.snappy;

export const SwipeDeck = forwardRef(function SwipeDeck(
  {
    data,
    index,
    renderCard,
    onSwipe,
    onBlocked,
    disabled,
    canSwipe = true,
    style,
    gestureX,
    gestureY,
    motion = 'card',
  },
  ref
) {
  const top = data?.[index] || null;
  const next = data?.[index + 1] || null;

  const internalX = useSharedValue(0);
  const internalY = useSharedValue(0);
  const translateX = gestureX || internalX;
  const translateY = gestureY || internalY;
  const hasSwiped = useSharedValue(false);

  const safeOnSwipe = useCallback(
    (direction, userOrId) => {
      try {
        if (onSwipe && userOrId != null && userOrId !== '') {
          onSwipe(direction, userOrId);
        }
      } catch (error) {
        console.error('[SwipeDeck] Error in onSwipe:', error);
      }
    },
    [onSwipe]
  );

  const notifyBlocked = useCallback(() => {
    onBlocked?.();
  }, [onBlocked]);

  const threshold = useMemo(() => Math.max(84, SCREEN_W * 0.22), []);
  const thresholdY = useMemo(() => 110, []);

  const reset = useCallback(() => {
    'worklet';
    translateX.value = withSpring(0, SPRING);
    translateY.value = withSpring(0, SPRING);
    hasSwiped.value = false;
  }, [hasSwiped, translateX, translateY]);

  const commitSwipe = useCallback(
    (swipeDir, notifyDir, userId) => {
      'worklet';
      const toX = swipeDir === 'right' ? SCREEN_W * 1.35 : -SCREEN_W * 1.35;
      translateX.value = withSpring(
        toX,
        { ...SPRING, velocity: swipeDir === 'right' ? 900 : -900 },
        (finished) => {
          'worklet';
          if (!finished) return;
          translateX.value = 0;
          translateY.value = 0;
          hasSwiped.value = false;
          if (userId) {
            runOnJS(safeOnSwipe)(notifyDir, userId);
          }
        }
      );
      translateY.value = withSpring(motion === 'slide' ? 0 : translateY.value + 8, SPRING_SNAP);
    },
    [hasSwiped, motion, safeOnSwipe, translateX, translateY]
  );

  const trySwipe = useCallback(
    (notifyDir, swipeDir = notifyDir) => {
      'worklet';
      if (hasSwiped.value || !top) return;
      if (!canSwipe) {
        reset();
        runOnJS(notifyBlocked)();
        return;
      }
      hasSwiped.value = true;
      const userId = top?.id ?? top?.uid ?? '';
      commitSwipe(swipeDir === 'right' ? 'right' : 'left', notifyDir, userId);
    },
    [canSwipe, commitSwipe, hasSwiped, notifyBlocked, reset, top]
  );

  useImperativeHandle(
    ref,
    () => ({
      swipeLeft: () => runOnUI(trySwipe)('left', 'left'),
      swipeRight: () => runOnUI(trySwipe)('right', 'right'),
    }),
    [trySwipe]
  );

  const activeOffsetX = useMemo(() => [-24, 24], []);
  const failOffsetY = useMemo(() => [-18, 18], []);

  const pan = useMemo(() => {
    return Gesture.Pan()
      .enabled(!disabled && !!top)
      .activeOffsetX(activeOffsetX)
      .failOffsetY(failOffsetY)
      .onUpdate((e) => {
        translateX.value = e.translationX;
        translateY.value = e.translationY;
      })
      .onEnd((e) => {
        const vx = e.velocityX;
        const vy = e.velocityY;
        const shouldRight = translateX.value > threshold || vx > 900;
        const shouldLeft = translateX.value < -threshold || vx < -900;
        const verticalDominates =
          Math.abs(translateY.value) > Math.abs(translateX.value) * 1.25;
        const shouldUp = verticalDominates && (translateY.value < -thresholdY || vy < -900);
        const shouldDown = verticalDominates && (translateY.value > thresholdY || vy > 900);

        if (shouldRight) {
          trySwipe('right', 'right');
          return;
        }
        if (shouldLeft) {
          trySwipe('left', 'left');
          return;
        }
        if (shouldUp) {
          if (hasSwiped.value || !top) return;
          if (!canSwipe) {
            reset();
            runOnJS(notifyBlocked)();
            return;
          }
          hasSwiped.value = true;
          reset();
          runOnJS(safeOnSwipe)('up', top?.id ?? top?.uid ?? '');
          return;
        }
        if (shouldDown) {
          trySwipe('down', 'left');
          return;
        }
        reset();
      });
  }, [
    activeOffsetX,
    canSwipe,
    commitSwipe,
    disabled,
    failOffsetY,
    hasSwiped,
    notifyBlocked,
    reset,
    safeOnSwipe,
    threshold,
    thresholdY,
    top,
    translateX,
    translateY,
    trySwipe,
  ]);

  const likeOpacity = useDerivedValue(() => {
    if (translateX.value > threshold * 0.65) return 1;
    return interpolate(translateX.value, [0, threshold], [0, 1], Extrapolation.CLAMP);
  });

  const nopeOpacity = useDerivedValue(() => {
    return interpolate(translateX.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP);
  });

  const cardStyle = useAnimatedStyle(() => {
    if (motion === 'slide') {
      return {
        transform: [{ translateX: translateX.value }],
      };
    }
    const rot = interpolate(translateX.value, [-SCREEN_W, 0, SCREEN_W], [-12, 0, 12], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rot}deg` },
      ],
    };
  });

  const likeStyle = useAnimatedStyle(() => ({
    opacity: likeOpacity.value,
    transform: [{ rotate: '-8deg' }, { scale: interpolate(likeOpacity.value, [0, 1], [0.92, 1], Extrapolation.CLAMP) }],
  }));

  const nopeStyle = useAnimatedStyle(() => ({
    opacity: nopeOpacity.value,
    transform: [{ rotate: '8deg' }, { scale: interpolate(nopeOpacity.value, [0, 1], [0.92, 1], Extrapolation.CLAMP) }],
  }));

  const nextStyle = useAnimatedStyle(() => {
    const drag = Math.abs(translateX.value);
    const s = interpolate(drag, [0, threshold], [0.94, 1], Extrapolation.CLAMP);
    const ty = interpolate(drag, [0, threshold], [14, 0], Extrapolation.CLAMP);
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
        <Animated.View style={[styles.cardShell, cardStyle]}>
          <Animated.View pointerEvents="none" style={[styles.overlay, styles.like, likeStyle]}>
            <Text style={styles.overlayText}>CONNECT</Text>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.overlay, styles.nope, nopeStyle]}>
            <Text style={styles.overlayText}>NEXT</Text>
          </Animated.View>
          {renderCard(top, { isTop: true, panGesture: pan })}
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  deck: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
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
    backgroundColor: tokens.colors.filterBgEmerald,
    borderColor: tokens.colors.filterBorderEmerald,
  },
  nope: {
    right: 18,
    backgroundColor: tokens.colors.bgSecondary,
    borderColor: tokens.colors.borderDark,
  },
  overlayText: {
    fontWeight: '900',
    letterSpacing: 1,
    color: tokens.colors.borderDark,
  },
});
