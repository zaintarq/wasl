import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Menu, Bell } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens, brandUnderlineGradient } from '../../../tokens';
import { HuzzPressable } from '../../HuzzPressable.native';

export function HuzzHeader({ onMenuPress, onBellPress, onLogoPress, fontsLoaded }) {
  return (
    <View style={styles.wrap}>
      <HuzzPressable style={styles.iconHit} onPress={onMenuPress} haptic="light" accessibilityRole="button" accessibilityLabel="Open settings menu">
        <Menu size={22} color={tokens.colors.brandPinkDeep} strokeWidth={2.2} />
      </HuzzPressable>

      <HuzzPressable style={styles.logoWrap} onPress={onLogoPress} haptic="light" accessibilityRole="header">
        <Text style={[styles.logo, fontsLoaded && styles.logoFont]}>Huzz</Text>
        <View style={styles.underlineTrack}>
          <LinearGradient colors={brandUnderlineGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </View>
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
    paddingHorizontal: 8,
  },
  logo: {
    fontSize: 34,
    color: tokens.colors.brandPinkDeep,
    fontWeight: '700',
    fontStyle: 'italic',
    ...Platform.select({
      ios: { textShadowColor: 'rgba(131, 24, 67, 0.08)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
      android: {},
    }),
  },
  logoFont: {
    fontFamily: 'KaushanScript_400Regular',
    fontWeight: '400',
    fontStyle: 'normal',
  },
  underlineTrack: {
    marginTop: 2,
    width: 72,
    height: 2.5,
    borderRadius: 2,
    overflow: 'hidden',
  },
});
