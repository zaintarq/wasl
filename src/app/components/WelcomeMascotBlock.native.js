import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';

const LOGO_DEFAULT = require('../../../assets/images/app-logo.png');
const LOGO_ARABIC = require('../../../assets/images/wasl-arabic-logo.png');
const LOGO_ASPECT = 1024 / 847;
const ARABIC_ASPECT = 1024 / 769;
const ALT_DISPLAY_MS = 1400;
const EMERGE_FROM_SCALE = 0.34;

/**
 * Tap default Wasl wordmark → animated Arabic وصل reveal, then auto-return.
 */
export function WelcomeMascotBlock({ maxWidth = 300, compact = false }) {
  const [showArabic, setShowArabic] = useState(false);
  const defaultOpacity = useRef(new Animated.Value(1)).current;
  const arabicOpacity = useRef(new Animated.Value(0)).current;
  const arabicScale = useRef(new Animated.Value(EMERGE_FROM_SCALE)).current;
  const arabicSlide = useRef(new Animated.Value(28)).current;
  const resetRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (resetRef.current) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const returnToDefault = useCallback(() => {
    Animated.parallel([
      Animated.timing(arabicOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(defaultOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(arabicScale, {
        toValue: EMERGE_FROM_SCALE,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(arabicSlide, {
        toValue: 28,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setShowArabic(false);
    });
  }, [arabicOpacity, arabicScale, arabicSlide, defaultOpacity]);

  const handlePress = useCallback(() => {
    if (showArabic) return;
    clearTimer();
    defaultOpacity.stopAnimation();
    arabicOpacity.stopAnimation();
    arabicScale.stopAnimation();
    arabicSlide.stopAnimation();

    setShowArabic(true);
    arabicScale.setValue(EMERGE_FROM_SCALE);
    arabicSlide.setValue(28);
    defaultOpacity.setValue(1);
    arabicOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(defaultOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(arabicOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(arabicScale, {
        toValue: 1.04,
        friction: 7,
        tension: 180,
        useNativeDriver: true,
      }),
      Animated.timing(arabicSlide, {
        toValue: 0,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(arabicScale, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    resetRef.current = setTimeout(returnToDefault, ALT_DISPLAY_MS);
  }, [
    arabicOpacity,
    arabicScale,
    arabicSlide,
    clearTimer,
    defaultOpacity,
    returnToDefault,
    showArabic,
  ]);

  const boxAspect = showArabic ? ARABIC_ASPECT : LOGO_ASPECT;

  return (
    <HuzzPressable
      onPress={handlePress}
      haptic="light"
      accessibilityRole="imagebutton"
      accessibilityLabel="Wasl logo"
      accessibilityHint="Tap to see the Arabic Wasl animation"
      style={[styles.wrap, compact && styles.wrapCompact]}
    >
      <View
        style={[
          compact ? styles.iconContainerCompact : styles.iconContainer,
          !compact && { maxWidth },
          compact && { width: maxWidth },
          { aspectRatio: boxAspect },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.layer, { opacity: defaultOpacity }]}
        >
          <Image source={LOGO_DEFAULT} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        {showArabic ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.layer,
              {
                opacity: arabicOpacity,
                transform: [{ scale: arabicScale }, { translateX: arabicSlide }],
              },
            ]}
          >
            <Image source={LOGO_ARABIC} style={styles.logo} resizeMode="contain" />
          </Animated.View>
        ) : null}
      </View>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  wrapCompact: {
    alignSelf: 'center',
    width: undefined,
    marginBottom: 0,
  },
  iconContainer: {
    width: '100%',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerCompact: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
});
