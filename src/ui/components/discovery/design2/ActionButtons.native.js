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
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation}deg` }, { scale: scale.value }],
  }));

  const runBounce = useCallback(() => {
    scale.value = withSequence(
      withSpring(0.92, SPRING_SNAP),
      withSpring(1.05, SPRING),
      withSpring(1, SPRING)
    );
  }, [scale]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.92, SPRING_SNAP);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    if (!bounceOnSuccess) {
      scale.value = withSpring(1, SPRING);
    }
  }, [bounceOnSuccess, scale]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    onPress?.();
    if (bounceOnSuccess) {
      runBounce();
    } else {
      scale.value = withSpring(1, SPRING);
    }
  }, [bounceOnSuccess, disabled, onPress, runBounce, scale]);

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
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
      <TileButton
        size={46}
        rotation={-6}
        variant="solid"
        icon={RotateCcw}
        iconSize={19}
        onPress={onRewind}
        disabled={rewindDisabled}
        accessibilityLabel="Rewind last swipe"
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
      />

      <TileButton
        size={46}
        rotation={-2}
        variant="outline"
        icon={MessageCircle}
        iconSize={19}
        onPress={onMessage}
        accessibilityLabel="Send direct message"
        outerStyle={msgBtnStyle}
      />

      <TileButton
        size={46}
        rotation={6}
        variant="outline"
        icon={Zap}
        iconSize={19}
        onPress={onBoost}
        accessibilityLabel="Boost"
      />
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
