import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { authService, clubService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { LIVE_SCREEN_GUTTER, LiveContentWidth } from '../../ui/components/live/LiveContentWidth.native';
import {
  LiveTypographyProvider,
  LiveText,
  LiveTextInput,
  LiveRetroButton,
} from '../../ui/components/live/LiveTypography.native';
import { welcomeButtonStyles } from '../../ui/styles/welcomeButtonStyles.native';

export function CreateClubScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    setSaving(true);
    try {
      const { clubId, error } = await clubService.createClub(meUid, {
        name,
        description,
      });
      if (error) {
        Alert.alert('Could not create club', error);
        return;
      }
      Alert.alert('Club created', 'You can change public/private and voice settings inside the club.');
      onNavigate('clubRoom', { clubId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <LiveTypographyProvider>
        <View style={styles.header}>
          <HuzzPressable onPress={() => onNavigate('clubs')} haptic="light" style={styles.backBtn}>
            <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.2} />
          </HuzzPressable>
          <LiveText style={styles.title}>Create club</LiveText>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <LiveContentWidth>
            <LiveText style={styles.hint}>
              Start with a name and description. Public/private and voice rules can be changed anytime in club settings.
            </LiveText>

            <LiveText style={styles.label}>Club name</LiveText>
            <LiveTextInput
              placeholder="e.g. Late night vibes"
              placeholderTextColor={tokens.colors.textMuted}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />

            <LiveText style={styles.label}>Description</LiveText>
            <LiveTextInput
              placeholder="What's this space for?"
              placeholderTextColor={tokens.colors.textMuted}
              value={description}
              onChangeText={setDescription}
              style={[styles.input, styles.inputMultiline]}
              multiline
            />

            <LiveRetroButton
              variant="blue"
              onPress={create}
              disabled={saving || name.trim().length < 2}
              style={[styles.cta, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
              textStyle={welcomeButtonStyles.welcomeBtnLabel}
            >
              {saving ? 'Creating…' : 'Create club'}
            </LiveRetroButton>
          </LiveContentWidth>
        </ScrollView>
      </LiveTypographyProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerSide: { width: 44 },
  title: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  content: { padding: LIVE_SCREEN_GUTTER, paddingBottom: 32 },
  hint: {
    ...tokens.typography.bodySmall,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    marginBottom: 8,
  },
  label: {
    ...tokens.typography.caption,
    fontWeight: '800',
    color: tokens.colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.bgSecondary,
    marginBottom: 8,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  cta: { width: '100%', marginTop: 24 },
});
