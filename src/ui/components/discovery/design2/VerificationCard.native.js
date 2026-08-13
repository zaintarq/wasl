import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShieldCheck, Shield } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { HuzzPressable } from '../../HuzzPressable.native';
import { RetroButton } from '../../RetroButton.native';
import { welcomeButtonStyles } from '../../../styles/welcomeButtonStyles.native';

/** Compact age verification card for profile bottom sheet. */
export function VerificationCard({ variant = 'unverified', onStartCheck, onLearnMore }) {
  if (variant === 'verified') {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, styles.iconVerified]}>
            <ShieldCheck size={20} color={tokens.colors.brandPink} strokeWidth={2.2} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>Age verified</Text>
            <Text style={styles.body}>
              You&apos;re all set! Enjoy full access to likes, matches, chat, live, and clubs.
            </Text>
            <Text style={styles.fine}>Your verification is private and secure.</Text>
            {onLearnMore ? (
              <HuzzPressable onPress={onLearnMore} haptic="light" style={styles.linkHit}>
                <Text style={styles.link}>Learn more →</Text>
              </HuzzPressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Shield size={20} color={tokens.colors.brandPink} strokeWidth={2.2} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Verify you&apos;re 18+</Text>
          <Text style={styles.body}>
            One quick in-app face scan unlocks likes, matches, chat, live, and clubs. Nothing leaves your device except a signed pass/fail.
          </Text>
        </View>
      </View>
      <RetroButton
        variant="primary"
        title="Start age check"
        onPress={onStartCheck}
        style={[styles.btn, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
        textStyle={welcomeButtonStyles.welcomeBtnLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    ...{
      shadowColor: tokens.colors.brandPinkDeep,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
  },
  row: { flexDirection: 'row', gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tokens.colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconVerified: { backgroundColor: tokens.colors.filterBgRose },
  copy: { flex: 1 },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 4,
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    color: tokens.colors.textSecondary,
  },
  fine: {
    fontSize: 11,
    color: tokens.colors.textMuted,
    marginTop: 6,
    lineHeight: 15,
  },
  linkHit: { marginTop: 8, alignSelf: 'flex-start' },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.colors.brandPink,
  },
  btn: { marginTop: 12, width: '100%' },
});
