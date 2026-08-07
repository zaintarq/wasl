import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LiveKitRoom, useLocalParticipant, useParticipants } from '@livekit/react-native';
import { Mic, MicOff } from 'lucide-react-native';
import { clubService } from '../../../services/firebaseService';
import { tokens } from '../../tokens';
import { RetroButton } from '../RetroButton.native';
import { HuzzPressable } from '../HuzzPressable.native';

function ClubVoiceStage({ canPublish }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const remoteCount = participants.filter((p) => !p.isLocal).length;

  const toggleMic = useCallback(async () => {
    if (!canPublish) return;
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }, [canPublish, isMicrophoneEnabled, localParticipant]);

  return (
    <View style={styles.stage}>
      <Text style={styles.stageTitle}>Voice space</Text>
      <Text style={styles.stageMeta}>
        {remoteCount ? `${remoteCount} other${remoteCount === 1 ? '' : 's'} in voice` : 'You’re the first in voice'}
      </Text>
      <HuzzPressable
        style={[styles.micBtn, !canPublish && styles.micBtnDisabled, isMicrophoneEnabled && styles.micBtnOn]}
        onPress={toggleMic}
        disabled={!canPublish}
        haptic="medium"
      >
        {isMicrophoneEnabled ? (
          <Mic size={28} color="#fff" strokeWidth={2.2} />
        ) : (
          <MicOff size={28} color={canPublish ? '#fff' : tokens.colors.textMuted} strokeWidth={2.2} />
        )}
      </HuzzPressable>
      <Text style={styles.micHint}>
        {canPublish ? (isMicrophoneEnabled ? 'Mic on' : 'Tap to unmute') : 'Mic locked — ask an admin'}
      </Text>
    </View>
  );
}

/** Loaded lazily from ClubAudioRoom.native.js — do not import from app entry. */
export function ClubAudioRoomInner({ clubId, canPublishHint, onLeave, onError }) {
  const [token, setToken] = useState(undefined);
  const [url, setUrl] = useState(undefined);
  const [canPublish, setCanPublish] = useState(!!canPublishHint);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await clubService.fetchClubLiveKitToken(clubId);
      if (cancelled) return;
      if (res.error) {
        setLoadErr(res.error);
        onError?.(res.error);
        return;
      }
      setToken(res.token);
      setUrl(res.url);
      setCanPublish(!!res.canPublish);
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, onError]);

  if (loadErr) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errText}>{loadErr}</Text>
        <RetroButton variant="outline" title="Leave voice" onPress={onLeave} />
      </View>
    );
  }

  if (!token || !url) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.colors.accent} />
        <Text style={styles.loadingText}>Connecting voice…</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom token={token} serverUrl={url} connect audio video={false} onDisconnected={onLeave}>
      <ClubVoiceStage canPublish={canPublish} />
      <RetroButton variant="outline" title="Leave voice" onPress={onLeave} style={{ marginTop: 8 }} />
    </LiveKitRoom>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 16, alignItems: 'center', gap: 8 },
  loadingText: { color: tokens.colors.textSecondary },
  errText: { color: tokens.colors.danger, textAlign: 'center', marginBottom: 8 },
  stage: {
    padding: 16,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.filterBgViolet,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderViolet,
    alignItems: 'center',
  },
  stageTitle: { fontSize: 16, fontWeight: '800', color: tokens.colors.text },
  stageMeta: { fontSize: 13, color: tokens.colors.textSecondary, marginTop: 4, marginBottom: 12 },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: tokens.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnOn: { backgroundColor: tokens.colors.success },
  micBtnDisabled: { backgroundColor: tokens.colors.border },
  micHint: { marginTop: 10, fontSize: 13, color: tokens.colors.textMuted },
});
