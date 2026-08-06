import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Track } from 'livekit-client';
import { useLocalParticipant } from '@livekit/react-native';
import { Mic, MicOff, Video, VideoOff, SwitchCamera, Shuffle, PhoneOff } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { HuzzPressable } from '../HuzzPressable.native';
import { LiveText } from './LiveTypography.native';

function ControlButton({ label, active, danger, onPress, disabled, children }) {
  return (
    <HuzzPressable
      style={[
        styles.btn,
        active ? styles.btnActive : null,
        danger ? styles.btnDanger : null,
        disabled ? styles.btnDisabled : null,
      ]}
      onPress={onPress}
      haptic="light"
      disabled={disabled}
    >
      {children}
      <LiveText style={[styles.btnLabel, danger ? styles.btnLabelDanger : null]} numberOfLines={1}>
        {label}
      </LiveText>
    </HuzzPressable>
  );
}

/**
 * In-call controls — must render inside LiveKitRoom.
 */
export function LiveSessionControls({ onSkip, onLeave, disabled }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);

  const toggleMic = useCallback(async () => {
    if (!localParticipant || busy) return;
    setBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [localParticipant, isMicrophoneEnabled, busy]);

  const toggleCamera = useCallback(async () => {
    if (!localParticipant || busy) return;
    setBusy(true);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [localParticipant, isCameraEnabled, busy]);

  const flipCamera = useCallback(async () => {
    if (!localParticipant || busy || !isCameraEnabled) return;
    setBusy(true);
    try {
      const pub = localParticipant.getTrackPublication(Track.Source.Camera);
      const videoTrack = pub?.videoTrack;
      if (videoTrack?.restartTrack) {
        const settings = videoTrack.mediaStreamTrack?.getSettings?.() || {};
        const current = settings.facingMode || 'user';
        const next = current === 'environment' ? 'user' : 'environment';
        await videoTrack.restartTrack({ facingMode: next });
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [localParticipant, isCameraEnabled, busy]);

  const iconColor = tokens.colors.text;
  const offColor = tokens.colors.danger;

  return (
    <View style={styles.bar}>
      {busy ? (
        <ActivityIndicator color={tokens.colors.accent} style={styles.busy} />
      ) : null}
      <View style={styles.row}>
        <ControlButton
          label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          active={!isMicrophoneEnabled}
          onPress={toggleMic}
          disabled={disabled || !localParticipant}
        >
          {isMicrophoneEnabled ? (
            <Mic size={22} color={iconColor} strokeWidth={2} />
          ) : (
            <MicOff size={22} color={offColor} strokeWidth={2} />
          )}
        </ControlButton>

        <ControlButton
          label={isCameraEnabled ? 'Cam off' : 'Cam on'}
          active={!isCameraEnabled}
          onPress={toggleCamera}
          disabled={disabled || !localParticipant}
        >
          {isCameraEnabled ? (
            <Video size={22} color={iconColor} strokeWidth={2} />
          ) : (
            <VideoOff size={22} color={offColor} strokeWidth={2} />
          )}
        </ControlButton>

        <ControlButton
          label="Flip"
          onPress={flipCamera}
          disabled={disabled || !localParticipant || !isCameraEnabled}
        >
          <SwitchCamera size={22} color={iconColor} strokeWidth={2} />
        </ControlButton>

        <ControlButton label="Skip" onPress={onSkip} disabled={disabled}>
          <Shuffle size={22} color={tokens.colors.accent} strokeWidth={2} />
        </ControlButton>

        <ControlButton label="Leave" danger onPress={onLeave} disabled={disabled}>
          <PhoneOff size={22} color="#fff" strokeWidth={2} />
        </ControlButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  busy: { marginBottom: 6 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  btn: {
    flex: 1,
    maxWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    minHeight: 68,
  },
  btnActive: {
    backgroundColor: tokens.colors.filterBgRose,
    borderColor: tokens.colors.filterBorderRose,
  },
  btnDanger: {
    backgroundColor: tokens.colors.danger,
    borderColor: tokens.colors.danger,
  },
  btnDisabled: { opacity: 0.45 },
  btnLabel: {
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  btnLabelDanger: { color: '#fff' },
});
