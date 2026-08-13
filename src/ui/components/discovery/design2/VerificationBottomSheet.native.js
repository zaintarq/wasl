import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { ShieldCheck, Lock } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { HuzzPressable } from '../../HuzzPressable.native';
import { RetroButton } from '../../RetroButton.native';
import { welcomeButtonStyles } from '../../../styles/welcomeButtonStyles.native';

const STEPS = [
  {
    title: "Verify you're 18+",
    subtitle: "We'll guide you through a quick face scan.",
    cta: 'Continue',
    badges: ['Private', 'Secure', 'Encrypted'],
  },
  {
    title: 'Scanning your face…',
    subtitle: 'Position your face in the frame',
    hint: 'This stays on your device.',
    cta: 'Start scan',
    scanning: true,
  },
  {
    title: "You're verified! ✓",
    subtitle: 'Enjoy full access to Huzz',
    cta: 'Done',
    success: true,
  },
];

export function VerificationBottomSheet({ visible, step = 0, onClose, onContinue, onStartScan, onDone }) {
  const scale = useRef(new Animated.Value(0.96)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    fade.setValue(0);
    scale.setValue(0.96);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [visible, step, fade, scale]);

  const content = STEPS[Math.min(step, STEPS.length - 1)] || STEPS[0];

  const handlePrimary = () => {
    if (step === 0) onContinue?.();
    else if (step === 1) onStartScan?.();
    else onDone?.();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.sheet, { opacity: fade, transform: [{ scale }] }]}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.step}>Step {step + 1} of 3</Text>

            {content.success ? (
              <View style={styles.successIcon}>
                <ShieldCheck size={40} color={tokens.colors.brandPink} strokeWidth={2} />
              </View>
            ) : content.scanning ? (
              <ActivityIndicator size="large" color={tokens.colors.brandPink} style={{ marginVertical: 16 }} />
            ) : (
              <View style={styles.introIcon}>
                <ShieldCheck size={36} color={tokens.colors.brandPink} strokeWidth={2} />
              </View>
            )}

            <Text style={styles.title}>{content.title}</Text>
            <Text style={styles.subtitle}>{content.subtitle}</Text>
            {content.hint ? <Text style={styles.hint}>{content.hint}</Text> : null}

            {content.badges ? (
              <View style={styles.badges}>
                {content.badges.map((b) => (
                  <View key={b} style={styles.badge}>
                    <Lock size={12} color={tokens.colors.brandPinkDeep} strokeWidth={2.2} />
                    <Text style={styles.badgeText}>{b}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <RetroButton
              variant="primary"
              title={content.cta}
              onPress={handlePrimary}
              style={[welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow, { marginTop: 20 }]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            />

            <HuzzPressable onPress={onClose} style={styles.cancelHit}>
              <Text style={styles.cancel}>Not now</Text>
            </HuzzPressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.borderDark,
    marginBottom: 16,
  },
  step: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  introIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: tokens.colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successIcon: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.colors.filterBgRose,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    fontSize: 13,
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
  badges: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colors.surfaceOverlay,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: tokens.colors.brandPinkDeep,
  },
  cancelHit: { marginTop: 14, alignItems: 'center' },
  cancel: { fontSize: 14, fontWeight: '600', color: tokens.colors.textMuted },
});
