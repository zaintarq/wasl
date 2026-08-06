import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { authService, clubService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { RetroInput } from '../../ui/components/RetroInput.native';
import { RetroButton } from '../../ui/components/RetroButton.native';

const MIC_MODES = [
  { key: 'open', label: 'Open mic', hint: 'Everyone in the club can talk.' },
  { key: 'request', label: 'Request mic', hint: 'Members ask admins; admins approve who can speak.' },
  { key: 'admin_only', label: 'Admins only', hint: 'Only owners and admins can use the mic.' },
];

export function CreateClubScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [micMode, setMicMode] = useState('request');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    setSaving(true);
    try {
      const { clubId, inviteCode, error } = await clubService.createClub(meUid, {
        name,
        description,
        isPublic,
        micMode,
      });
      if (error) {
        Alert.alert('Could not create club', error);
        return;
      }
      Alert.alert(
        'Club created',
        isPublic
          ? 'Your club is live on Discover.'
          : `Private club ready. Invite code: ${inviteCode}`
      );
      onNavigate('clubRoom', { clubId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <HuzzPressable onPress={() => onNavigate('clubs')} haptic="light" style={styles.backBtn}>
          <ArrowLeft size={22} color={tokens.colors.text} strokeWidth={2.2} />
        </HuzzPressable>
        <Text style={styles.title}>Create club</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Club name</Text>
        <RetroInput placeholder="e.g. Late night vibes" value={name} onChangeText={setName} style={styles.input} />

        <Text style={styles.label}>About</Text>
        <RetroInput
          placeholder="What’s this space for?"
          value={description}
          onChangeText={setDescription}
          style={[styles.input, { minHeight: 80 }]}
          multiline
        />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Public club</Text>
            <Text style={styles.switchHint}>Anyone can discover and join. Turn off for invite-code only.</Text>
          </View>
          <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: tokens.colors.blue }} />
        </View>

        <Text style={[styles.label, { marginTop: 16 }]}>Voice rules</Text>
        {MIC_MODES.map((m) => (
          <HuzzPressable
            key={m.key}
            style={[styles.modeChip, micMode === m.key && styles.modeChipOn]}
            onPress={() => setMicMode(m.key)}
            haptic="light"
          >
            <Text style={[styles.modeLabel, micMode === m.key && styles.modeLabelOn]}>{m.label}</Text>
            <Text style={styles.modeHint}>{m.hint}</Text>
          </HuzzPressable>
        ))}

        <RetroButton
          variant="blue"
          title={saving ? 'Creating…' : 'Create club'}
          onPress={create}
          disabled={saving}
          style={{ marginTop: 24 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: tokens.colors.text },
  content: { padding: tokens.spacing.screenHorizontal, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '800', color: tokens.colors.text, marginBottom: 8, marginTop: 8 },
  input: { marginBottom: 8 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  switchLabel: { fontWeight: '700', color: tokens.colors.text },
  switchHint: { fontSize: 13, color: tokens.colors.textMuted, marginTop: 4 },
  modeChip: {
    padding: 14,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    marginBottom: 8,
  },
  modeChipOn: {
    borderColor: tokens.colors.blue,
    backgroundColor: tokens.colors.filterBgSky,
  },
  modeLabel: { fontWeight: '700', color: tokens.colors.text },
  modeLabelOn: { color: tokens.colors.blue },
  modeHint: { fontSize: 13, color: tokens.colors.textMuted, marginTop: 4 },
});
