import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { HuzzPressable } from './HuzzPressable.native';
import { tokens } from '../tokens';

/**
 * Play / pause a remote voice clip (profile “about me” or similar).
 */
export function ProfileVoicePlayer({ audioUrl, durationMs }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.trim()) {
      try {
        player.replace(audioUrl.trim());
      } catch {
        /* ignore */
      }
    }
  }, [audioUrl, player]);

  if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.trim()) {
    return null;
  }

  const dur =
    typeof durationMs === 'number' && durationMs > 0
      ? Math.round(durationMs / 1000)
      : status?.duration > 0
        ? Math.round(status.duration)
        : null;

  const playing = !!status?.playing;
  const loading = !status?.isLoaded && !!audioUrl;

  return (
    <View style={styles.row}>
      <HuzzPressable
        style={styles.btn}
        onPress={() => {
          if (playing) player.pause();
          else player.play();
        }}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice clip' : 'Play voice clip'}
      >
        {loading ? (
          <ActivityIndicator size="small" color={tokens.colors.accent} />
        ) : (
          <Text style={styles.icon}>{playing ? '⏸' : '▶'}</Text>
        )}
      </HuzzPressable>
      <View style={styles.meta}>
        <Text style={styles.label}>Voice</Text>
        {dur != null ? <Text style={styles.time}>~{dur}s</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderRadius: tokens.radius.md,
    alignSelf: 'flex-start',
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 16, color: tokens.colors.accent },
  meta: { gap: 2 },
  label: { fontSize: 12, fontWeight: '700', color: tokens.colors.textSecondary },
  time: { fontSize: 11, color: tokens.colors.textMuted },
});
