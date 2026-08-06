import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
} from '@livekit/react-native';
import { Mic, MicOff, Volume2 } from 'lucide-react-native';
import { clubService } from '../../../services/firebaseService';
import { tokens } from '../../tokens';
import { RetroButton } from '../RetroButton.native';
import { HuzzPressable } from '../HuzzPressable.native';

function RemoteSpeakers() {
  const participants = useParticipants();
  const remotes = participants.filter((p) => !p.isLocal);
  const speaking = remotes.filter((p) => p.isMicrophoneEnabled);

  if (!remotes.length) return null;

  return (
    <View style={styles.speakerRow}>
      <Volume2 size={14} color={tokens.colors.textSecondary} strokeWidth={2} />
      <Text style={styles.speakerText}>
        {speaking.length
          ? `${speaking.length} speaking now`
          : `${remotes.length} listening`}
      </Text>
    </View>
  );
}

function ClubVoiceStage({ canPublish }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const remoteCount = participants.filter((p) => !p.isLocal).length;

  const toggleMic = useCallback(async () => {
    if (!canPublish) return;
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (e) {
      console.warn('[ClubVoice] mic toggle', e?.message || e);
    }
  }, [canPublish, isMicrophoneEnabled, localParticipant]);

  return (
    <View style={styles.stage}>
      <Text style={styles.stageTitle}>Voice space</Text>
      <Text style={styles.stageMeta}>
        {remoteCount ? `${remoteCount} other${remoteCount === 1 ? '' : 's'} in voice` : 'You’re the first in voice'}
      </Text>
      <RemoteSpeakers />
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
        {canPublish
          ? isMicrophoneEnabled
            ? 'Mic on'
            : 'Tap to unmute'
          : 'Listen-only — ask an admin for the mic'}
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
  const [connErr, setConnErr] = useState(null);
  const [connectKey, setConnectKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        await AudioSession.startAudioSession();
      } catch (e) {
        console.warn('[ClubVoice] AudioSession start', e?.message || e);
      }
    })();
    return () => {
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, []);

  const fetchToken = useCallback(async () => {
    setLoadErr(null);
    setConnErr(null);
    setToken(undefined);
    setUrl(undefined);
    const res = await clubService.fetchClubLiveKitToken(clubId);
    if (res.error) {
      setLoadErr(res.error);
      onError?.(res.error);
      return;
    }
    if (!res.token || !res.url) {
      const msg = 'LiveKit token unavailable. Deploy getClubLiveKitToken and set LIVEKIT secrets.';
      setLoadErr(msg);
      onError?.(msg);
      return;
    }
    setToken(res.token);
    setUrl(res.url);
    setCanPublish(!!res.canPublish);
    setConnectKey((k) => k + 1);
  }, [clubId, onError]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken, canPublishHint]);

  const reportConnError = useCallback(
    (msg) => {
      const text = String(msg || 'Voice connection error.');
      setConnErr(text);
      onError?.(text);
    },
    [onError]
  );

  if (loadErr) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errText}>{loadErr}</Text>
        <RetroButton variant="blue" title="Retry" onPress={fetchToken} style={{ marginBottom: 8 }} />
        <RetroButton variant="outline" title="Leave voice" onPress={onLeave} />
      </View>
    );
  }

  if (connErr) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errText}>{connErr}</Text>
        <RetroButton
          variant="blue"
          title="Reconnect"
          onPress={() => {
            setConnErr(null);
            fetchToken();
          }}
          style={{ marginBottom: 8 }}
        />
        <RetroButton variant="outline" title="Leave voice" onPress={onLeave} />
      </View>
    );
  }

  if (token === undefined || url === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.colors.accent} />
        <Text style={styles.loadingText}>Connecting voice…</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      key={`club-voice-${connectKey}`}
      token={token}
      serverUrl={url}
      connect
      audio={canPublish}
      video={false}
      options={{
        adaptiveStream: true,
        dynacast: true,
      }}
      onError={(e) => reportConnError(e?.message || e)}
      onDisconnected={() => reportConnError('Voice disconnected.')}
    >
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
  stageMeta: { fontSize: 13, color: tokens.colors.textSecondary, marginTop: 4, marginBottom: 8 },
  speakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  speakerText: { fontSize: 12, color: tokens.colors.textSecondary, fontWeight: '600' },
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
