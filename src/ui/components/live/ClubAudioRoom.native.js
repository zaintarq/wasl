import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { MicOff } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { RetroButton } from '../RetroButton.native';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

function ExpoGoVoiceFallback({ onLeave }) {
  return (
    <View style={styles.fallback}>
      <MicOff size={32} color={tokens.colors.textMuted} strokeWidth={2} />
      <Text style={styles.fallbackTitle}>Voice needs the installed app</Text>
      <Text style={styles.fallbackText}>
        Club voice chat uses native audio and does not run in Expo Go. Text chat in the club still works here.
      </Text>
      <RetroButton variant="outline" title="Leave voice" onPress={onLeave} style={{ marginTop: 8 }} />
    </View>
  );
}

function ClubAudioRoomLazy(props) {
  const [Inner, setInner] = useState(null);
  const [bootErr, setBootErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    try {
      require('../../../polyfills/setupNativeGlobals.native');
      const { registerGlobals } = require('@livekit/react-native');
      registerGlobals();
      const mod = require('./ClubAudioRoomInner.native');
      if (!cancelled) setInner(() => mod.ClubAudioRoomInner);
    } catch (e) {
      if (!cancelled) setBootErr(e?.message || String(e));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  if (bootErr) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Voice unavailable</Text>
        <Text style={styles.fallbackText}>{bootErr}</Text>
        <RetroButton variant="outline" title="Leave voice" onPress={props.onLeave} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (!Inner) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.colors.accent} />
        <Text style={styles.loadingText}>Connecting voice…</Text>
      </View>
    );
  }

  return <Inner {...props} />;
}

/** Audio-only LiveKit room for a club — lazy-loaded; safe in Expo Go (text-only fallback). */
export function ClubAudioRoom(props) {
  if (IS_EXPO_GO) {
    return <ExpoGoVoiceFallback onLeave={props.onLeave} />;
  }
  return <ClubAudioRoomLazy {...props} />;
}

const styles = StyleSheet.create({
  loading: { padding: 16, alignItems: 'center', gap: 8 },
  loadingText: { color: tokens.colors.textSecondary },
  fallback: {
    padding: 16,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.filterBgAmber,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderAmber,
    alignItems: 'center',
    gap: 8,
  },
  fallbackTitle: { fontSize: 16, fontWeight: '800', color: tokens.colors.text, textAlign: 'center' },
  fallbackText: { fontSize: 14, color: tokens.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
