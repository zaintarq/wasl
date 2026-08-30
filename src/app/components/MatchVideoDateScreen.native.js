import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { videoDateService, VIDEO_DATE_SESSION_MS } from '../../services/firebase/videoDateService';
import { LiveVideoTiles } from '../../ui/components/live/LiveVideoTiles.native';
import { LiveText, LiveRetroButton } from '../../ui/components/live/LiveTypography.native';
import { ScreenBackHeader } from '../../ui/components/ScreenBackHeader.native';
import { tokens } from '../../ui/tokens';

function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MatchVideoDateScreen({ onNavigate, matchId, sessionId, mehramMode = false }) {
  const navigation = useNavigation();
  const [endsAtMs, setEndsAtMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(VIDEO_DATE_SESSION_MS);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const end = Date.now() + VIDEO_DATE_SESSION_MS;
    setEndsAtMs(end);
  }, [sessionId]);

  useEffect(() => {
    if (!endsAtMs || ended) return undefined;
    const tick = () => {
      const left = endsAtMs - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        setEnded(true);
        videoDateService.endVideoDate(sessionId).catch(() => {});
        return;
      }
      setRemainingMs(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAtMs, ended, sessionId]);

  const fetchToken = useCallback(
    (sid) => videoDateService.fetchLiveKitToken(sid),
    []
  );

  const handleLeave = useCallback(async () => {
    if (!mehramMode) {
      await videoDateService.endVideoDate(sessionId);
      onNavigate('chat', { matchId });
      return;
    }
    navigation.goBack();
  }, [sessionId, matchId, onNavigate, mehramMode, navigation]);

  const timerLabel = useMemo(() => formatRemaining(remainingMs), [remainingMs]);

  if (!sessionId) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenBackHeader title="Video date" onBack={() => onNavigate('matches')} />
        <LiveText style={styles.error}>No video session.</LiveText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenBackHeader
        title={mehramMode ? 'Video supervision' : 'Video date'}
        onBack={() => {
          Alert.alert(
            mehramMode ? 'Leave supervision?' : 'Leave video date?',
            mehramMode
              ? 'You can rejoin while the call is still active.'
              : 'You can rejoin while the 15-minute window is open.',
            [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: handleLeave },
            ]
          );
        }}
      />
      <View style={styles.body}>
        {mehramMode ? (
          <View style={styles.mehramNote}>
            <LiveText style={styles.mehramNoteText}>
              Chaperone mode — you can see and hear the call. Your mic and camera stay off.
            </LiveText>
          </View>
        ) : null}
        <View style={styles.timerPill}>
          <LiveText style={styles.timerText}>{ended ? 'Time is up' : `${timerLabel} left`}</LiveText>
          <LiveText style={styles.timerSub}>
            {mehramMode ? 'Supervising a respectful video date' : 'Respectful, scheduled 15-minute call'}
          </LiveText>
        </View>

        {!ended ? (
          <LiveVideoTiles
            sessionId={sessionId}
            partnerConnected
            onSkip={handleLeave}
            onLeave={handleLeave}
            fetchToken={fetchToken}
          />
        ) : (
          <View style={styles.endedBox}>
            <LiveText style={styles.endedTitle}>Video date ended</LiveText>
            <LiveText style={styles.endedBody}>Thanks for keeping it respectful. Continue in chat anytime.</LiveText>
            <LiveRetroButton variant="primary" onPress={() => onNavigate('chat', { matchId })}>
              Back to chat
            </LiveRetroButton>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.background },
  body: { flex: 1, padding: 16 },
  timerPill: {
    alignSelf: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  timerText: { ...tokens.typography.label, color: tokens.colors.text, textAlign: 'center' },
  timerSub: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 2, textAlign: 'center' },
  mehramNote: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.25)',
  },
  mehramNoteText: { ...tokens.typography.caption, color: tokens.colors.text, textAlign: 'center' },
  endedBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  endedTitle: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  endedBody: { ...tokens.typography.bodySmall, color: tokens.colors.textSecondary, textAlign: 'center' },
  error: { padding: 24, color: tokens.colors.danger },
});
