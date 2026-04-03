import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { Users } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { LiveContentWidth } from './LiveContentWidth.native';
import { LiveText } from './LiveTypography.native';

/**
 * Searching state: ripple ring + centered icon — readable motion, accent only on ring stroke.
 */
export function LiveMatchPulse() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 0.25, 0] });

  return (
    <LiveContentWidth>
      <View style={styles.wrap}>
        <View style={styles.radar}>
          <Animated.View style={[styles.ring, { opacity, transform: [{ scale }] }]} />
          <View style={styles.core}>
            <Users size={34} color={tokens.colors.accent} strokeWidth={1.8} />
          </View>
        </View>
        <LiveText style={styles.title}>Finding someone for you</LiveText>
        <LiveText style={styles.hint}>Matching with another member who’s online. Usually just a moment.</LiveText>
      </View>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  radar: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: tokens.colors.accent,
  },
  core: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: tokens.shadow.color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
  },
  title: {
    ...tokens.typography.title,
    color: tokens.colors.text,
    marginTop: 8,
    textAlign: 'center',
  },
  hint: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
    maxWidth: 300,
    paddingHorizontal: 8,
  },
});
