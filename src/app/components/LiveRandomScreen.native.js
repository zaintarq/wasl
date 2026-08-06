import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { authService, liveRandomService } from '../../services/firebaseService';
import { tokens } from '../../ui/tokens';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { LiveContentWidth } from '../../ui/components/live/LiveContentWidth.native';
import { LiveLobbyHero } from '../../ui/components/live/LiveLobbyHero.native';
import { LiveFeatureGrid } from '../../ui/components/live/LiveFeatureGrid.native';
import { LiveSafetyNote } from '../../ui/components/live/LiveSafetyNote.native';
import { LiveMatchPulse } from '../../ui/components/live/LiveMatchPulse.native';
import { LiveSessionHeader } from '../../ui/components/live/LiveSessionHeader.native';
import { LiveVideoTiles } from '../../ui/components/live/LiveVideoTiles.native';
import { LIVE_SCREEN_GUTTER } from '../../ui/components/live/LiveContentWidth.native';
import {
  LiveTypographyProvider,
  LiveText,
  LiveTextInput,
  LiveRetroButton,
} from '../../ui/components/live/LiveTypography.native';
import { welcomeButtonStyles } from '../../ui/styles/welcomeButtonStyles.native';
import { MainBottomNav } from '../../ui/components/MainBottomNav.native';
const SESSION_MS = liveRandomService.SESSION_MS;

export function LiveRandomScreen({ onNavigate }) {
  const meUid = authService.getCurrentUser()?.uid || null;
  const insets = useSafeAreaInsets();
  const [bottomNavH, setBottomNavH] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);
  const [chatText, setChatText] = useState('');
  const [messages, setMessages] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const timeoutRef = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;

  const partnerUid = useMemo(() => {
    if (!session?.uids || !meUid) return null;
    const uids = session.uids.map(String);
    return uids.find((u) => u !== meUid) || null;
  }, [session, meUid]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startOrSearch = useCallback(async () => {
    if (!meUid) {
      onNavigate('onboarding', { mode: 'login' });
      return;
    }
    setError(null);

    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      setError('Camera access is required for Live video chat.');
      return;
    }
    const mic = await requestRecordingPermissionsAsync();
    if (!mic.granted) {
      setError('Microphone access is required for Live video chat.');
      return;
    }

    setPhase('searching');
    const res = await liveRandomService.enterPool(meUid);
    if (res.error) {
      setError(res.error);
      setPhase('idle');
      return;
    }
    if (res.state === 'matched' && res.sessionId) {
      const got = await liveRandomService.getSessionById(res.sessionId);
      if (got?.data) {
        setSession(got.data);
        setPhase('session');
      } else {
        setPhase('searching');
      }
      return;
    }
  }, [meUid, onNavigate]);

  useEffect(() => {
    if (!meUid || phase !== 'searching') return undefined;
    const unsub = liveRandomService.listenActiveSessionForUser(meUid, ({ data, error: err }) => {
      if (err) setError(err);
      if (data && data.status === 'active') {
        setSession(data);
        setPhase('session');
        setError(null);
      }
    });
    return () => unsub && unsub();
  }, [meUid, phase]);

  useEffect(() => {
    const sid = session?.id;
    if (!sid || phase !== 'session') {
      setMessages([]);
      return undefined;
    }
    const unsub = liveRandomService.listenMessages(sid, ({ data, error: err }) => {
      if (err) setError(err);
      setMessages(Array.isArray(data) ? data : []);
    });
    return () => unsub && unsub();
  }, [session?.id, phase]);

  useEffect(() => {
    clearTimers();
    if (phase !== 'session' || !session?.startedAt) return undefined;

    const tick = () => {
      const s = sessionRef.current;
      if (!s?.startedAt) return;
      const ms = s.startedAt?.toMillis ? s.startedAt.toMillis() : Date.now();
      const ends = ms + SESSION_MS;
      const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && meUid) {
        liveRandomService.endSession(s.id, meUid, 'timeout').catch(() => {});
      }
    };

    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [phase, session?.id, session?.startedAt, meUid, clearTimers]);

  useEffect(() => {
    if (!meUid || phase !== 'session' || !session?.id) return undefined;
    const unsub = liveRandomService.listenActiveSessionForUser(meUid, ({ data }) => {
      if (!data || data.status !== 'active') {
        setSession(null);
        setPhase('idle');
        setMessages([]);
        clearTimers();
      }
    });
    return () => unsub && unsub();
  }, [meUid, phase, session?.id, clearTimers]);

  const cancelSearch = async () => {
    if (meUid) await liveRandomService.leavePool(meUid);
    setPhase('idle');
    setError(null);
  };

  const skipOrLeave = useCallback(async (reason) => {
    const sid = session?.id;
    clearTimers();
    if (meUid && sid) {
      await liveRandomService.endSession(sid, meUid, reason);
    }
    setSession(null);
    setMessages([]);
    if (reason === 'skip') {
      setPhase('searching');
      try {
        await startOrSearch();
      } catch {
        setPhase('idle');
      }
    } else {
      setPhase('idle');
    }
  }, [session?.id, meUid, clearTimers, startOrSearch]);

  const sendChat = async () => {
    const t = chatText.trim();
    if (!t || !session?.id || !meUid) return;
    setChatText('');
    const { error: err } = await liveRandomService.sendMessage(session.id, meUid, t);
    if (err) setError(err);
  };

  const handleSkip = useCallback(() => {
    skipOrLeave('skip');
  }, [skipOrLeave]);

  const handleLeave = useCallback(() => {
    skipOrLeave('leave');
  }, [skipOrLeave]);

  const listPadBottom = Math.max(8, insets.bottom);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LiveTypographyProvider>
        <View style={styles.header}>
          <View style={{ width: 70 }} />
          <LiveText style={styles.title}>Live</LiveText>
          <View style={{ width: 70 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top + 8}
        >
          {error ? (
            <LiveContentWidth style={styles.bannerWrap}>
              <View style={styles.banner}>
                <LiveText style={styles.bannerText}>{error}</LiveText>
              </View>
            </LiveContentWidth>
          ) : null}

          {phase === 'idle' ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 28 + bottomNavH + insets.bottom }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <LiveLobbyHero />
              <LiveFeatureGrid />
              <LiveSafetyNote />
              <LiveContentWidth>
                <LiveRetroButton
                  variant="primary"
                  onPress={startOrSearch}
                  style={[styles.cta, welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.welcomeBtnPrimaryShadow]}
                  textStyle={welcomeButtonStyles.welcomeBtnLabel}
                >
                  Start Live
                </LiveRetroButton>
              </LiveContentWidth>
            </ScrollView>
          ) : null}

          {phase === 'searching' ? (
            <View style={styles.searchingPage}>
              <LiveMatchPulse />
              <ActivityIndicator color={tokens.colors.accent} style={{ marginTop: 8 }} />
              <LiveContentWidth style={{ marginTop: 20 }}>
                <LiveRetroButton
                  variant="outline"
                  onPress={cancelSearch}
                  style={[welcomeButtonStyles.welcomeBtnShape, welcomeButtonStyles.outlineOnBlue]}
                  textStyle={welcomeButtonStyles.welcomeBtnLabel}
                >
                  Cancel
                </LiveRetroButton>
              </LiveContentWidth>
            </View>
          ) : null}

          {phase === 'session' && session ? (
            <View style={styles.sessionWrap}>
              <LiveSessionHeader secondsLeft={secondsLeft} totalSeconds={60} />
              <LiveVideoTiles
                sessionId={session?.id}
                partnerConnected={!!partnerUid}
                onLiveKitError={(msg) => setError(String(msg || ''))}
                onSkip={handleSkip}
                onLeave={handleLeave}
              />

              <View style={styles.chatSection}>
                <LiveContentWidth style={styles.chatHead}>
                  <View style={styles.chatRow}>
                    <MessageCircle size={18} color={tokens.colors.textMuted} strokeWidth={2} />
                    <LiveText style={styles.chatTitle}>Live chat</LiveText>
                  </View>
                </LiveContentWidth>

                <FlatList
                  style={styles.chatList}
                  data={messages}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const mine = String(item.fromUid) === String(meUid);
                    return (
                      <View style={[styles.bubbleWrap, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                        <LiveText style={styles.bubbleText}>{String(item.text || '')}</LiveText>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <LiveText style={styles.chatEmpty}>Say hi — messages appear here for both of you.</LiveText>
                  }
                  contentContainerStyle={styles.chatListContent}
                />

                <View style={[styles.composer, { paddingBottom: listPadBottom }]}>
                  <LiveTextInput
                    style={styles.input}
                    value={chatText}
                    onChangeText={setChatText}
                    placeholder="Type a message…"
                    placeholderTextColor={tokens.colors.textMuted}
                    maxLength={2000}
                    onSubmitEditing={sendChat}
                  />
                  <LiveRetroButton variant="blue" onPress={sendChat} style={styles.sendCompact}>
                    Send
                  </LiveRetroButton>
                </View>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
        {phase !== 'session' ? (
          <MainBottomNav active="live" onNavigate={onNavigate} onLayout={setBottomNavH} />
        ) : null}
      </LiveTypographyProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  headerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    minWidth: 70,
    alignItems: 'center',
  },
  headerBtnText: { ...tokens.typography.label, color: tokens.colors.text },
  title: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  bannerWrap: { marginTop: 10 },
  banner: {
    backgroundColor: tokens.colors.filterBgRose,
    padding: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.filterBorderRose,
  },
  bannerText: { ...tokens.typography.bodySmall, color: tokens.colors.danger },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: tokens.spacing.md },
  flex: { flex: 1, backgroundColor: tokens.colors.bg },
  cta: { width: '100%' },
  searchingPage: { flex: 1, justifyContent: 'center', paddingVertical: 24 },
  sessionWrap: { flex: 1, backgroundColor: tokens.colors.bg },
  chatSection: {
    flex: 1,
    minHeight: 140,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  chatHead: { paddingTop: 10, paddingBottom: 4 },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatTitle: { ...tokens.typography.label, color: tokens.colors.textMuted },
  chatList: { flex: 1 },
  chatListContent: { paddingHorizontal: LIVE_SCREEN_GUTTER, paddingTop: 6, paddingBottom: 8, flexGrow: 1 },
  chatEmpty: {
    ...tokens.typography.caption,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  bubbleWrap: {
    maxWidth: '88%',
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: tokens.radius.md,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: tokens.colors.accentDim },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  bubbleText: { ...tokens.typography.bodySmall, color: tokens.colors.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: LIVE_SCREEN_GUTTER,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...tokens.typography.bodySmall,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.bgSecondary,
  },
  sendCompact: { paddingVertical: 10, paddingHorizontal: 16, minHeight: 44 },
});
