import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { storageService } from '../../services/firebaseService';
import { tokens } from '../tokens';
import { HuzzPressable } from './HuzzPressable.native';

const MAX_VOICE_MS = 60_000;
const MAX_BIO = 2000;

/**
 * About me, interests, optional “Add me” line, optional voice clip (record or upload).
 */
export function ProfileAboutSection({
  bio,
  onChangeBio,
  interestsText,
  onChangeInterestsText,
  addMe,
  onChangeAddMe,
  aboutVoiceUrl,
  onChangeAboutVoiceUrl,
  aboutVoiceDurationMs,
  onChangeAboutVoiceDurationMs,
  uid,
  /** When false, hide the top “About me” title + intro (parent shows a section header). */
  showHeading = true,
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 300);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const uploadUri = useCallback(
    async (uri, durationMsApprox) => {
      if (!uid || !uri) return;
      setVoiceBusy(true);
      try {
        const { url, error } = await storageService.uploadProfileAboutVoice(uid, uri);
        if (error || !url) {
          Alert.alert('Upload failed', error || 'Could not upload audio.');
          return;
        }
        onChangeAboutVoiceUrl(url);
        onChangeAboutVoiceDurationMs(
          typeof durationMsApprox === 'number' && durationMsApprox > 400
            ? Math.min(durationMsApprox, MAX_VOICE_MS)
            : 0
        );
      } finally {
        setVoiceBusy(false);
      }
    },
    [uid, onChangeAboutVoiceUrl, onChangeAboutVoiceDurationMs]
  );

  const startRecord = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission', 'Microphone access is needed to record.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      Alert.alert('Recording', e?.message || 'Could not start recording.');
    }
  };

  const stopRecord = async () => {
    try {
      setVoiceBusy(true);
      await recorder.stop();
      const uri = recorder.uri;
      let ms = Math.min(recState.durationMillis || 0, MAX_VOICE_MS);
      if (ms < 400) {
        ms = Math.min(Math.round((recorder.currentTime || 0) * 1000), MAX_VOICE_MS);
      }
      if (uri) await uploadUri(uri, ms);
    } catch (e) {
      Alert.alert('Recording', e?.message || 'Could not finish recording.');
    } finally {
      setVoiceBusy(false);
    }
  };

  const pickAudio = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const asset = res.assets[0];
      const size = asset.size || 0;
      if (size > 1.8 * 1024 * 1024) {
        Alert.alert('Too large', 'Pick a file under 2 MB.');
        return;
      }
      await uploadUri(asset.uri, null);
    } catch (e) {
      Alert.alert('Picker', e?.message || 'Could not pick file.');
    }
  };

  const removeVoice = () => {
    onChangeAboutVoiceUrl('');
    onChangeAboutVoiceDurationMs(0);
  };

  return (
    <View style={styles.root}>
      {showHeading ? (
        <>
          <Text style={styles.boxTitle}>About me</Text>
          <Text style={styles.hint}>Optional — share what you’re about. Others can scroll to read it on your card.</Text>
        </>
      ) : null}

      <Text style={styles.label}>Bio</Text>
      <View style={styles.aiTipBox}>
        <Text style={styles.aiTipText}>
          ✨ Stuck? You can use free AI chats — like{' '}
          <Text style={styles.aiTipLink} onPress={() => Linking.openURL('https://gemini.google.com')}>
            Google Gemini
          </Text>
          , ChatGPT, or Copilot — to brainstorm or draft ideas. Edit the text so it sounds like you, then paste it here.
        </Text>
      </View>
      <TextInput
        style={styles.bioInput}
        value={bio}
        onChangeText={(t) => onChangeBio(String(t || '').slice(0, MAX_BIO))}
        placeholder="Hobbies, vibe, what you’re looking for…"
        placeholderTextColor={tokens.colors.textMuted}
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.label}>Interests (optional)</Text>
      <Text style={styles.microHint}>Comma-separated — e.g. hiking, books, cooking</Text>
      <TextInput
        style={styles.input}
        value={interestsText}
        onChangeText={onChangeInterestsText}
        placeholder="hiking, music, coffee…"
        placeholderTextColor={tokens.colors.textMuted}
      />

      <Text style={styles.label}>Add me (optional)</Text>
      <Text style={styles.hint}>Nice to have — Snap, Insta, or other handles so matches can add you.</Text>
      <TextInput
        style={styles.input}
        value={addMe}
        onChangeText={(t) => onChangeAddMe(String(t || '').slice(0, 500))}
        placeholder="@yourhandle or link — totally optional"
        placeholderTextColor={tokens.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Voice clip (optional)</Text>
      <Text style={styles.hint}>
        Record a short intro or upload a favorite clip (max ~1 min). Plays on your card for others.
      </Text>

      {aboutVoiceUrl ? (
        <View style={styles.voiceSaved}>
          <Text style={styles.voiceSavedText}>✓ Voice on profile</Text>
          {aboutVoiceDurationMs ? (
            <Text style={styles.voiceMeta}>~{Math.round(aboutVoiceDurationMs / 1000)}s</Text>
          ) : null}
          <HuzzPressable style={styles.dangerChip} onPress={removeVoice} haptic="light">
            <Text style={styles.dangerChipText}>Remove</Text>
          </HuzzPressable>
        </View>
      ) : null}

      <View style={styles.voiceRow}>
        {!recState.isRecording ? (
          <HuzzPressable style={styles.chip} onPress={startRecord} disabled={voiceBusy} haptic="light">
            <Text style={styles.chipText}>{voiceBusy ? '…' : '🎙 Record'}</Text>
          </HuzzPressable>
        ) : (
          <HuzzPressable style={[styles.chip, styles.chipRed]} onPress={stopRecord} haptic="medium">
            <Text style={styles.chipText}>⏹ Stop & upload</Text>
          </HuzzPressable>
        )}
        <HuzzPressable style={styles.chip} onPress={pickAudio} disabled={voiceBusy} haptic="light">
          <Text style={styles.chipText}>📁 Upload audio</Text>
        </HuzzPressable>
      </View>
      {recState.isRecording ? (
        <Text style={styles.recording}>Recording… {Math.round((recState.durationMillis || 0) / 1000)}s / 60s</Text>
      ) : null}
      {voiceBusy ? <ActivityIndicator style={{ marginTop: 8 }} color={tokens.colors.accent} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  boxTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: tokens.colors.text,
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  microHint: {
    fontSize: 12,
    color: tokens.colors.textMuted,
    marginBottom: 6,
  },
  aiTipBox: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  aiTipText: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
    lineHeight: 17,
  },
  aiTipLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
    textDecorationLine: 'underline',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.colors.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: 12,
    fontSize: 16,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.surfaceElevated,
    marginBottom: 8,
  },
  bioInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: 12,
    fontSize: 16,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.surfaceElevated,
    minHeight: 100,
    marginBottom: 8,
  },
  voiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  chipRed: {
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    borderColor: 'rgba(225, 29, 72, 0.35)',
  },
  chipText: {
    fontWeight: '700',
    fontSize: 14,
    color: tokens.colors.text,
  },
  recording: {
    marginTop: 8,
    fontSize: 13,
    color: tokens.colors.accent,
    fontWeight: '600',
  },
  voiceSaved: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  voiceSavedText: { fontWeight: '700', color: '#047857' },
  voiceMeta: { fontSize: 13, color: tokens.colors.textSecondary },
  dangerChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
  },
  dangerChipText: { fontWeight: '700', color: '#be123c', fontSize: 13 },
});
