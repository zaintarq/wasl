import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Menu, Bell } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { HuzzPressable } from '../../HuzzPressable.native';

const LOGO = require('../../../../../assets/images/wasl-logo-en.png');
const LOGO_ASPECT = 1024 / 847;
const LOGO_HEIGHT = 36;

export function HuzzHeader({ onMenuPress, onBellPress, onLogoPress, fontsLoaded: _fontsLoaded }) {
  return (
    <View style={styles.wrap}>
      <HuzzPressable style={styles.iconHit} onPress={onMenuPress} haptic="light" accessibilityRole="button" accessibilityLabel="Open settings menu">
        <Menu size={22} color={tokens.colors.brandPinkDeep} strokeWidth={2.2} />
      </HuzzPressable>

      <HuzzPressable
        style={styles.logoWrap}
        onPress={onLogoPress}
        haptic="light"
        accessibilityRole="header"
        accessibilityLabel="Wasl logo"
      >
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </HuzzPressable>

      <HuzzPressable style={styles.iconHit} onPress={onBellPress} haptic="light" accessibilityRole="button" accessibilityLabel="Notifications">
        <Bell size={21} color={tokens.colors.brandPinkDeep} strokeWidth={2.2} />
      </HuzzPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    minHeight: 52,
    paddingVertical: 6,
  },
  iconHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    minHeight: 44,
  },
  logo: {
    width: LOGO_HEIGHT * LOGO_ASPECT,
    height: LOGO_HEIGHT,
  },
});
