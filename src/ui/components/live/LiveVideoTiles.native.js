import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { Video, VideoOff } from 'lucide-react-native';
import { tokens } from '../../tokens';
import { LiveContentWidth } from './LiveContentWidth.native';
import { LiveText } from './LiveTypography.native';
import { HuzzPressable } from '../HuzzPressable.native';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

function ExpoGoVideoFallback({ partnerConnected, onSkip, onLeave }) {
  return (
    <View style={styles.expoWrap}>
      <View style={styles.expoStage}>
        <View style={[styles.expoTile, styles.expoRemote]}>
          <LiveText style={styles.expoQ}>?</LiveText>
          <LiveText style={styles.tileTitle}>Stranger</LiveText>
          <LiveText style={styles.tileHint}>{partnerConnected ? 'Connected' : 'Waiting…'}</LiveText>
        </View>
        <View style={[styles.expoPip, styles.expoYou]}>
          <Video size={22} color={tokens.colors.blue} strokeWidth={1.8} />
          <LiveText style={styles.pipLabel}>You</LiveText>
        </View>
      </View>
      <View style={styles.expoBanner}>
        <VideoOff size={16} color={tokens.colors.textSecondary} strokeWidth={2} />
        <LiveText style={styles.expoBannerText}>
          Video chat needs the installed Huzz app (not Expo Go). Text chat works here.
        </LiveText>
      </View>
      <View style={styles.fallbackActions}>
        <HuzzPressable style={[styles.fallbackBtn, styles.fallbackBtnAccent]} onPress={onSkip} haptic="medium">
          <LiveText style={styles.fallbackBtnText}>Skip</LiveText>
        </HuzzPressable>
        <HuzzPressable style={[styles.fallbackBtn, styles.fallbackBtnDanger]} onPress={onLeave} haptic="medium">
          <LiveText style={[styles.fallbackBtnText, styles.fallbackBtnTextLight]}>Leave</LiveText>
        </HuzzPressable>
      </View>
    </View>
  );
}

function LiveKitLazy({ sessionId, onLiveKitError, onSkip, onLeave }) {
  const [SessionView, setSessionView] = useState(null);
  const [bootErr, setBootErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    try {
      require('../../../polyfills/setupNativeGlobals.native');
      const { registerGlobals } = require('@livekit/react-native');
      registerGlobals();
      const mod = require('./LiveKitVideoSession.native');
      if (!cancelled) setSessionView(() => mod.LiveKitVideoSession);
    } catch (e) {
      if (!cancelled) {
        const msg = e?.message || String(e);
        setBootErr(msg);
        onLiveKitError?.(msg);
      }
    }
    return () => {
      cancelled = true;
    };
    // Boot LiveKit once — do not re-run when parent re-renders (timer ticks every 1s).
  }, []);

  if (bootErr) {
    return (
      <View style={styles.fallbackTile}>
        <LiveText style={styles.fallbackTitle}>Video unavailable</LiveText>
        <LiveText style={styles.fallbackText} numberOfLines={4}>
          {bootErr}
        </LiveText>
        <LiveText style={styles.fallbackHint}>Text chat below still works.</LiveText>
        <View style={styles.fallbackActions}>
          <HuzzPressable style={[styles.fallbackBtn, styles.fallbackBtnAccent]} onPress={onSkip} haptic="medium">
            <LiveText style={styles.fallbackBtnText}>Skip</LiveText>
          </HuzzPressable>
          <HuzzPressable style={[styles.fallbackBtn, styles.fallbackBtnDanger]} onPress={onLeave} haptic="medium">
            <LiveText style={[styles.fallbackBtnText, styles.fallbackBtnTextLight]}>Leave</LiveText>
          </HuzzPressable>
        </View>
      </View>
    );
  }

  if (!SessionView) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={tokens.colors.accent} />
        <LiveText style={styles.loadingHint}>Loading video…</LiveText>
      </View>
    );
  }

  return (
    <SessionView
      sessionId={sessionId}
      onError={onLiveKitError}
      onSkip={onSkip}
      onLeave={onLeave}
    />
  );
}

/**
 * Random Live session video — LiveKit loads lazily; Expo Go gets a text-only fallback.
 */
export function LiveVideoTiles({
  sessionId,
  partnerConnected,
  onLiveKitError,
  onSkip,
  onLeave,
}) {
  if (!sessionId) {
    return (
      <LiveContentWidth style={styles.pad}>
        <View style={styles.row}>
          <View style={[styles.tile, styles.sky]}>
            <Video size={28} color={tokens.colors.blue} strokeWidth={1.8} />
            <LiveText style={styles.tileTitle}>You</LiveText>
            <LiveText style={styles.tileHint}>Preview</LiveText>
          </View>
          <View style={[styles.tile, styles.violet]}>
            <LiveText style={styles.expoQ}>?</LiveText>
            <LiveText style={styles.tileTitle}>Stranger</LiveText>
            <LiveText style={styles.tileHint}>{partnerConnected ? 'Connected' : 'Waiting…'}</LiveText>
          </View>
        </View>
      </LiveContentWidth>
    );
  }

  if (IS_EXPO_GO) {
    return (
      <LiveContentWidth style={styles.pad}>
        <ExpoGoVideoFallback
          partnerConnected={partnerConnected}
          onSkip={onSkip}
          onLeave={onLeave}
        />
      </LiveContentWidth>
    );
  }

  return (
    <LiveContentWidth style={styles.pad}>
      <LiveKitLazy
        sessionId={sessionId}
        onLiveKitError={onLiveKitError}
        onSkip={onSkip}
        onLeave={onLeave}
      />
    </LiveContentWidth>
  );
}

const styles = StyleSheet.create({
  pad: { paddingTop: tokens.spacing.sm },
  row: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    minHeight: 132,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sky: {
    backgroundColor: tokens.colors.filterBgSky,
    borderColor: tokens.colors.filterBorderSky,
  },
  violet: {
    backgroundColor: tokens.colors.filterBgViolet,
    borderColor: tokens.colors.filterBorderViolet,
  },
  expoQ: { fontSize: 32, color: tokens.colors.textMuted, marginBottom: 4 },
  tileTitle: { ...tokens.typography.titleSmall, color: tokens.colors.text, marginTop: 6 },
  tileHint: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 4 },
  expoWrap: { width: '100%' },
  expoStage: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: 340,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  expoTile: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expoRemote: { backgroundColor: '#1e293b' },
  expoPip: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 88,
    height: 112,
    borderRadius: tokens.radius.md,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  expoYou: {
    backgroundColor: tokens.colors.filterBgSky,
  },
  pipLabel: { ...tokens.typography.caption, color: tokens.colors.text, fontWeight: '700' },
  expoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  expoBannerText: {
    flex: 1,
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    lineHeight: 17,
  },
  loadingBox: {
    aspectRatio: 3 / 4,
    maxHeight: 340,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: tokens.colors.surface,
  },
  loadingHint: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 10 },
  fallbackTile: {
    aspectRatio: 3 / 4,
    maxHeight: 300,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
    padding: 14,
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
    marginTop: 8,
    marginBottom: 12,
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
