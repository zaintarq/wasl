import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

const LOGO_MASCOT = require('../../../assets/images/app-logo.png');
const LOGO_ANGRY = require('../../../assets/images/stop-touching.png');
const ANGRY_DISPLAY_MS = 1000;
const EMERGE_FROM_SCALE = 0.34;

/**
 * Banana mascot with the same tap animation as the welcome screen (emerge + angry art).
 */
export function WelcomeMascotBlock({ maxWidth = 300, compact = false }) {
  const [mascotAngry, setMascotAngry] = useState(false);
  const mascotScale = useRef(new Animated.Value(1)).current;
  const mascotRotate = useRef(new Animated.Value(0)).current;
  const angryResetRef = useRef(null);

  const clearAngryTimer = useCallback(() => {
    if (angryResetRef.current) {
      clearTimeout(angryResetRef.current);
      angryResetRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAngryTimer(), [clearAngryTimer]);

  const handleMascotPress = useCallback(() => {
    clearAngryTimer();
    mascotScale.stopAnimation();
    mascotRotate.stopAnimation();

    mascotScale.setValue(EMERGE_FROM_SCALE);
    mascotRotate.setValue(0);
    setMascotAngry(true);

    Animated.sequence([
      Animated.spring(mascotScale, {
        toValue: 1.06,
        friction: 8,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(mascotScale, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(mascotRotate, {
            toValue: 1,
            duration: 85,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(mascotRotate, {
            toValue: 0,
            duration: 95,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();

    angryResetRef.current = setTimeout(() => {
      mascotScale.stopAnimation();
      Animated.timing(mascotScale, {
        toValue: EMERGE_FROM_SCALE,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setMascotAngry(false);
        mascotRotate.setValue(0);
        mascotScale.setValue(EMERGE_FROM_SCALE);
        Animated.timing(mascotScale, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
      angryResetRef.current = null;
    }, ANGRY_DISPLAY_MS);
  }, [clearAngryTimer, mascotRotate, mascotScale]);

  const rotateInterpolate = mascotRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-5deg'],
  });

  return (
    <HuzzPressable
      onPress={handleMascotPress}
      haptic="light"
      accessibilityRole="imagebutton"
      accessibilityLabel="Huzz banana mascot"
      accessibilityHint="Tap to see a reaction"
      style={[styles.pressable, compact && styles.pressableCompact]}
    >
      <Animated.View
        style={[
          compact ? styles.iconContainerCompact : styles.iconContainer,
          !compact && { maxWidth },
          compact && { width: maxWidth, height: maxWidth },
          {
            transform: [{ scale: mascotScale }, { rotate: rotateInterpolate }],
          },
        ]}
      >
        <Image
          source={mascotAngry ? LOGO_ANGRY : LOGO_MASCOT}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  pressableCompact: {
    alignSelf: 'center',
    width: undefined,
    marginBottom: 0,
  },
  iconContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerCompact: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});
