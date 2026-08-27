import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Track } from 'livekit-client';
import { LiveKitRoom, VideoTrack, useTracks } from '@livekit/react-native';
import { UserRound } from 'lucide-react-native';
import { liveRandomService } from '../../../services/firebaseService';
import { tokens } from '../../tokens';
import { LiveText } from './LiveTypography.native';
import { LiveSessionControls } from './LiveSessionControls.native';
import { LiveFrameModerator } from './LiveFrameModerator.native';

function RemoteVideoTile({ trackRef }) {
  return (
    <View style={styles.remoteVideo}>
      {trackRef ? (
        <VideoTrack
          trackRef={trackRef}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <UserRound size={48} color={tokens.colors.textMuted} strokeWidth={1.5} />
          <LiveText style={styles.placeholderText}>Waiting for stranger…</LiveText>
        </View>
      )}
    </View>
  );
}

function LocalPip({ trackRef, cameraOff, pipRef }) {
  if (!trackRef || cameraOff) {
    return (
      <View style={[styles.pip, styles.pipOff]}>
        <VideoOffIcon />
        <LiveText style={styles.pipOffText}>Camera off</LiveText>
      </View>
    );
  }
  return (
    <View ref={pipRef} style={styles.pip} collapsable={false}>
      <VideoTrack
        trackRef={trackRef}
        style={StyleSheet.absoluteFill}
        objectFit="cover"
        mirror
        zOrder={2}
      />
    </View>
  );
}

function VideoOffIcon() {
  const { VideoOff } = require('lucide-react-native');
  return <VideoOff size={20} color={tokens.colors.textMuted} strokeWidth={2} />;
}

function OmegleStage({ sessionId, onSkip, onLeave, onModerationBlock }) {
  const trackRefs = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });
  const pipRef = useRef(null);

  const localRef = useMemo(
    () => trackRefs.find((t) => t.participant?.isLocal) || null,
    [trackRefs]
  );
  const remoteRef = useMemo(
    () => trackRefs.find((t) => !t.participant?.isLocal) || null,
    [trackRefs]
  );

  const localPub = localRef?.publication;
  const cameraOff = localPub?.isMuted || !localPub?.track;

  const handleViolation = useCallback(
    (result) => {
      Alert.alert(
        'Live ended',
        result?.message ||
          'This Live session was ended because the camera feed looked inappropriate.',
        [{ text: 'OK' }]
      );
      onModerationBlock?.(result);
    },
    [onModerationBlock]
  );

  return (
    <View style={styles.stageWrap}>
      <View style={styles.stage}>
        <RemoteVideoTile trackRef={remoteRef} />
        <LocalPip trackRef={localRef} cameraOff={cameraOff} pipRef={pipRef} />
      </View>
      <LiveFrameModerator
        sessionId={sessionId}
        cameraOff={cameraOff}
        captureTargetRef={pipRef}
        onViolation={handleViolation}
      />
      <LiveSessionControls onSkip={onSkip} onLeave={onLeave} />
    </View>
  );
}

/** Loaded only after polyfill + registerGlobals; do not import from app entry. */
export function LiveKitVideoSession({ sessionId, onError, onSkip, onLeave, onModerationBlock }) {
  const [token, setToken] = useState(undefined);
  const [url, setUrl] = useState(undefined);
  const [loadErr, setLoadErr] = useState(null);

  const report = useCallback(
    (msg) => {
      if (msg) onError?.(String(msg));
    },
    [onError]
  );

  useEffect(() => {
    let cancelled = false;
    setToken(undefined);
    setUrl(undefined);
    setLoadErr(null);
    (async () => {
      const res = await liveRandomService.fetchLiveKitToken(sessionId);
      if (cancelled) return;
      if (res.error) {
        setLoadErr(res.error);
        report(res.error);
        return;
      }
      if (!res.token || !res.url) {
        const m = 'LiveKit token unavailable. Deploy getLiveKitToken and set LIVEKIT secrets.';
        setLoadErr(m);
        report(m);
        return;
      }
      setToken(res.token);
      setUrl(res.url);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, report]);

  if (loadErr) {
    return (
      <View style={styles.fallbackWrap}>
        <View style={styles.fallbackTile}>
          <LiveText style={styles.fallbackTitle}>Video unavailable</LiveText>
          <LiveText style={styles.fallbackText} numberOfLines={5}>
            {loadErr}
          </LiveText>
          <LiveText style={styles.fallbackHint}>Text chat below still works.</LiveText>
        </View>
        <FallbackControls onSkip={onSkip} onLeave={onLeave} />
      </View>
    );
  }

  if (token === undefined || url === undefined) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={tokens.colors.accent} />
        <LiveText style={styles.loadingHint}>Connecting video…</LiveText>
      </View>
    );
  }

  return (
    <LiveKitRoom
      key={sessionId}
      serverUrl={url}
      token={token}
      connect
      audio
      video
      options={{
        adaptiveStream: true,
        dynacast: true,
      }}
      onError={(e) => report(e?.message || e)}
      onDisconnected={() => {}}
    >
      <OmegleStage
        sessionId={sessionId}
        onSkip={onSkip}
        onLeave={onLeave}
        onModerationBlock={onModerationBlock}
      />
    </LiveKitRoom>
  );
}

function FallbackControls({ onSkip, onLeave }) {
  return (
    <View style={styles.fallbackActions}>
      <HuzzFallbackBtn label="Skip" onPress={onSkip} accent />
      <HuzzFallbackBtn label="Leave" onPress={onLeave} danger />
    </View>
  );
}

function HuzzFallbackBtn({ label, onPress, accent, danger }) {
  const { HuzzPressable } = require('../HuzzPressable.native');
  return (
    <HuzzPressable
      style={[
        styles.fallbackBtn,
        accent ? styles.fallbackBtnAccent : null,
        danger ? styles.fallbackBtnDanger : null,
      ]}
      onPress={onPress}
      haptic="medium"
    >
      <LiveText
        style={[
          styles.fallbackBtnText,
          danger ? styles.fallbackBtnTextLight : null,
        ]}
      >
        {label}
      </LiveText>
    </HuzzPressable>
  );
}

const styles = StyleSheet.create({
  stageWrap: { width: '100%' },
  stage: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: 380,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1e293b',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.textMuted,
  },
  pip: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 96,
    height: 128,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#334155',
  },
  pipOff: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pipOffText: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    fontSize: 10,
  },
  loadingBox: {
    aspectRatio: 3 / 4,
    maxHeight: 380,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: tokens.colors.surface,
  },
  loadingHint: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 10 },
  fallbackWrap: { width: '100%' },
  fallbackTile: {
    aspectRatio: 3 / 4,
    maxHeight: 320,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
    padding: 16,
    justifyContent: 'center',
    backgroundColor: tokens.colors.filterBgRose,
  },
  fallbackTitle: {
    ...tokens.typography.titleSmall,
    color: tokens.colors.danger,
    marginBottom: 8,
    textAlign: 'center',
  },
  fallbackText: { ...tokens.typography.bodySmall, color: tokens.colors.danger, textAlign: 'center' },
  fallbackHint: {
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  fallbackActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  fallbackBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  fallbackBtnAccent: {
    backgroundColor: tokens.colors.filterBgAmber,
    borderColor: tokens.colors.filterBorderAmber,
  },
  fallbackBtnDanger: {
    backgroundColor: tokens.colors.danger,
    borderColor: tokens.colors.danger,
  },
  fallbackBtnText: { ...tokens.typography.label, color: tokens.colors.text },
  fallbackBtnTextLight: { color: '#fff' },
});
