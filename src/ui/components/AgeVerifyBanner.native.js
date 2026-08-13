import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { LiveContentWidth } from './live/LiveContentWidth.native';
import { LiveRetroButton } from './live/LiveTypography.native';
import { welcomeButtonStyles } from '../styles/welcomeButtonStyles.native';
import { shellStyles } from '../styles/shellStyles.native';
import { tokens } from '../tokens';

export function AgeVerifyBanner({ onVerify }) {
  return (
    <LiveContentWidth style={styles.wrap}>
      <View style={shellStyles.noteRow}>
        <View style={styles.iconWrap}>
          <ShieldCheck size={22} color={tokens.colors.textOnBrand} strokeWidth={2} />
        </View>
        <View style={styles.copy}>
          <Text style={shellStyles.noteTitle}>Verify you&apos;re 18+</Text>
          <Text style={shellStyles.noteBody}>
            One quick in-app face scan unlocks likes, matches, chat, live, and clubs. Nothing leaves your device except a signed pass/fail.
          </Text>
        </View>
      </View>
      <LiveRetroButton
        variant="primary"
        onPress={onVerify}
        style={[
          styles.btn,
          welcomeButtonStyles.welcomeBtnShape,
          welcomeButtonStyles.welcomeBtnPrimaryShadow,
        ]}
        textStyle={welcomeButtonStyles.welcomeBtnLabel}
      >
        Start age check
      </LiveRetroButton>
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: tokens.spacing.md, gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.shellIconBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  btn: { width: '100%' },
});
