import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

/** English Wasl — default. Arabic وصل — tap reveal only. */
const LOGO_EN = require('../../../assets/images/wasl-logo-en.png');
const LOGO_AR = require('../../../assets/images/wasl-logo-ar.png');
const EN_ASPECT = 1024 / 847;
const AR_ASPECT = 1024 / 871;
const ALT_DISPLAY_MS = 1400;
const EMERGE_FROM_SCALE = 0.34;

export function WelcomeMascotBlock({ maxWidth = 300, compact = false }) {
  const [showArabic, setShowArabic] = useState(false);
  const enOpacity = useRef(new Animated.Value(1)).current;
  const arOpacity = useRef(new Animated.Value(0)).current;
  const arScale = useRef(new Animated.Value(EMERGE_FROM_SCALE)).current;
  const arSlide = useRef(new Animated.Value(28)).current;
  const resetRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (resetRef.current) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const returnToEnglish = useCallback(() => {
    Animated.parallel([
      Animated.timing(arOpacity, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arScale, { toValue: EMERGE_FROM_SCALE, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arSlide, { toValue: 28, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setShowArabic(false);
    });
  }, [arOpacity, arScale, arSlide, enOpacity]);

  const handlePress = useCallback(() => {
    if (showArabic) return;
    clearTimer();
    setShowArabic(true);
    arScale.setValue(EMERGE_FROM_SCALE);
    arSlide.setValue(28);
    enOpacity.setValue(1);
    arOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(enOpacity, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(arOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(arScale, { toValue: 1.04, friction: 7, tension: 180, useNativeDriver: true }),
      Animated.timing(arSlide, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(arScale, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });

    resetRef.current = setTimeout(returnToEnglish, ALT_DISPLAY_MS);
  }, [arOpacity, arScale, arSlide, clearTimer, enOpacity, returnToEnglish, showArabic]);

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
          compact ? styles.boxCompact : styles.box,
          !compact && { maxWidth },
          compact && { width: maxWidth },
          { aspectRatio: showArabic ? AR_ASPECT : EN_ASPECT },
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.layer, { opacity: enOpacity }]}>
          <Image source={LOGO_EN} style={styles.img} resizeMode="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
        {showArabic ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.layer, { opacity: arOpacity, transform: [{ scale: arScale }, { translateX: arSlide }] }]}
          >
            <Image source={LOGO_AR} style={styles.img} resizeMode="contain" accessibilityIgnoresInvertColors />
          </Animated.View>
        ) : null}
      </View>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%', alignItems: 'center', marginBottom: 8 },
  wrapCompact: { alignSelf: 'center', width: undefined, marginBottom: 0 },
  box: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  boxCompact: { alignItems: 'center', justifyContent: 'center' },
  layer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: '100%' },
});
