import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { RotateCcw, X, BookHeart, Zap, MessageCircle } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { useReduceMotion, pickSpring } from '../../../../utils/reduceMotion.native';

const INK = '#2B2420';
const CREAM = '#F7F1E8';
const SPRING = tokens.motion.spring.jelly;
const SPRING_SNAP = tokens.motion.spring.snappy;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TileButton({
  size,
  rotation,
  variant,
  icon: Icon,
  iconSize,
  iconStroke = 2.2,
  onPress,
  disabled,
  accessibilityLabel,
  bounceOnSuccess,
  outerStyle,
  reduceMotion,
}) {
  const scale = useSharedValue(1);
  const spring = pickSpring(SPRING, reduceMotion);
  const springSnap = pickSpring(SPRING_SNAP, reduceMotion);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation}deg` }, { scale: scale.value }],
  }));

  const runBounce = useCallback(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSequence(
      withSpring(0.92, springSnap),
      withSpring(1.05, spring),
      withSpring(1, spring)
    );
  }, [reduceMotion, scale, spring, springSnap]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.92, springSnap);
  }, [scale, springSnap]);

  const handlePressOut = useCallback(() => {
    if (!bounceOnSuccess) {
      scale.value = withSpring(1, spring);
    }
  }, [bounceOnSuccess, scale, spring]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    onPress?.();
    if (bounceOnSuccess) {
      runBounce();
    } else {
      scale.value = withSpring(1, spring);
    }
  }, [bounceOnSuccess, disabled, onPress, runBounce, scale, spring]);

  const isSolid = variant === 'solid';
  const iconColor = isSolid ? CREAM : INK;

  const inner = (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.tile,
        { width: size, height: size },
        isSolid ? styles.tileSolid : styles.tileOutline,
        disabled && styles.tileDisabled,
        animatedStyle,
      ]}
    >
      <Icon size={iconSize} color={iconColor} strokeWidth={iconStroke} />
    </AnimatedPressable>
  );

  if (outerStyle) {
    return <Animated.View style={outerStyle}>{inner}</Animated.View>;
  }

  return inner;
}

export function ActionButtons({
  onRewind,
  onPass,
  onLike,
  onMessage,
  onBoost,
  rewindDisabled,
  nopeBtnStyle,
  likeBtnStyle,
  msgBtnStyle,
}) {
  const reduceMotion = useReduceMotion();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
      <TileButton
        size={48}
        rotation={-6}
        variant="solid"
        icon={RotateCcw}
        iconSize={19}
        onPress={onRewind}
        disabled={rewindDisabled}
        accessibilityLabel="Rewind last swipe"
        reduceMotion={reduceMotion}
      />

      <TileButton
        size={64}
        rotation={3}
        variant="outline"
        icon={X}
        iconSize={28}
        iconStroke={2.5}
        onPress={onPass}
        accessibilityLabel="Pass"
        outerStyle={nopeBtnStyle}
        reduceMotion={reduceMotion}
      />

      <TileButton
        size={64}
        rotation={-3}
        variant="solid"
        icon={BookHeart}
        iconSize={28}
        iconStroke={2.2}
        onPress={onLike}
        accessibilityLabel="Like profile"
        bounceOnSuccess
        outerStyle={likeBtnStyle}
        reduceMotion={reduceMotion}
      />

      <TileButton
        size={48}
        rotation={-2}
        variant="outline"
        icon={MessageCircle}
        iconSize={19}
        onPress={onMessage}
        accessibilityLabel="Send direct message"
        outerStyle={msgBtnStyle}
        reduceMotion={reduceMotion}
      />

      {onBoost ? (
      <TileButton
        size={48}
        rotation={6}
        variant="outline"
        icon={Zap}
        iconSize={19}
        onPress={onBoost}
        accessibilityLabel="Boost profile"
        reduceMotion={reduceMotion}
      />
      ) : null}
      </View>
      <Text style={styles.hint}>Swipe up or tap message to DM</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 18,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tileSolid: {
    backgroundColor: INK,
  },
  tileOutline: {
    backgroundColor: CREAM,
    borderWidth: 2,
    borderColor: INK,
  },
  tileDisabled: {
    opacity: 0.45,
  },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#831843',
    opacity: 0.72,
    marginTop: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
});
