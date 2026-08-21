import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

const LOGO_EN = require('../../../assets/images/wasl-logo-en.png');
const LOGO_AR = require('../../../assets/images/wasl-logo-ar.png');
const EN_ASPECT = 712 / 939;
const ALT_MS = 1500;
const EMERGE = 0.42;

export function WelcomeMascotBlock({ maxWidth = 300, compact = false }) {
  const enOpacity = useRef(new Animated.Value(1)).current;
  const enScale = useRef(new Animated.Value(1)).current;
  const arOpacity = useRef(new Animated.Value(0)).current;
  const arScale = useRef(new Animated.Value(EMERGE)).current;
  const arSlide = useRef(new Animated.Value(48)).current;
  const [revealing, setRevealing] = useState(false);
  const resetRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (resetRef.current) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const reset = useCallback(() => {
    Animated.parallel([
      Animated.timing(arOpacity, { toValue: 0, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enOpacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enScale, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arScale, { toValue: EMERGE, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arSlide, { toValue: 48, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setRevealing(false);
    });
  }, [arOpacity, arScale, arSlide, enOpacity, enScale]);

  const handlePress = useCallback(() => {
    if (revealing) return;
    clearTimer();
    setRevealing(true);
    enOpacity.setValue(1);
    enScale.setValue(1);
    arOpacity.setValue(0);
    arScale.setValue(EMERGE);
    arSlide.setValue(48);

    Animated.parallel([
      Animated.timing(enOpacity, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enScale, { toValue: 0.82, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arOpacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(arScale, { toValue: 1, friction: 6, tension: 160, useNativeDriver: true }),
      Animated.timing(arSlide, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    resetRef.current = setTimeout(reset, ALT_MS);
  }, [arOpacity, arScale, arSlide, clearTimer, enOpacity, enScale, reset, revealing]);

  return (
    <HuzzPressable
      onPress={handlePress}
      haptic="light"
      accessibilityRole="imagebutton"
      accessibilityLabel="Wasl logo"
      accessibilityHint="Tap to reveal the Arabic Wasl logo"
      style={[styles.wrap, compact && styles.wrapCompact]}
    >
      <View
        style={[
          styles.box,
          !compact && { maxWidth },
          compact && { width: maxWidth },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.layer, { opacity: enOpacity, transform: [{ scale: enScale }], zIndex: 1 }]}
        >
          <Image source={LOGO_EN} style={styles.img} resizeMode="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.layer,
            styles.layerAr,
            { opacity: arOpacity, transform: [{ scale: arScale }, { translateX: arSlide }], zIndex: 2 },
          ]}
        >
          <Image source={LOGO_AR} style={styles.img} resizeMode="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
      </View>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%', alignItems: 'center', marginBottom: 8 },
  wrapCompact: { alignSelf: 'center', width: undefined, marginBottom: 0 },
  box: {
    width: '100%',
    aspectRatio: 1 / EN_ASPECT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  layerAr: { zIndex: 2 },
  img: { width: '100%', height: '100%' },
});
