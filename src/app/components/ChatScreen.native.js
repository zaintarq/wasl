import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Platform,
  Alert,
  Keyboard,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeInUp,
} from 'react-native-reanimated';
import {
  authService,
  matchService,
  messageService,
  reportService,
  blockService,
  userService,
  waliService,
  translationService,
} from '../../services/firebaseService';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '../../ui/tokens';
import { SkeletonBox } from '../../ui/components/SkeletonBox.native';
import { HuzzPressable } from '../../ui/components/HuzzPressable.native';
import { KeyboardAwareLayout } from './KeyboardAwareLayout.native';
import * as Haptics from 'expo-haptics';
import { useAudioRecorder, useAudioRecorderState, useAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import Svg, { Rect } from 'react-native-svg';
import { getPresenceDisplay } from '../../utils/presence';
import { CHAT_TRANSLATE_LANGUAGES, getChatLanguageLabel } from '../../utils/chatLanguages';

const TYPING_INDICATOR_IMG = require('../../../assets/images/typinggg.png');

// Minimal waveform voice icon — clean sound bars, no emoji
function VoiceIcon({ size = 22, color }) {
  const fill = color ?? tokens.colors.textSecondary;
  const bars = [0.4, 0.7, 1, 0.65, 0.45];
  const barW = 2;
  const gap = 2.4;
  const centerY = 11;
  const maxH = 10;
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      {bars.map((h, i) => (
        <Rect
          key={i}
          x={2 + i * (barW + gap)}
          y={centerY - maxH * h}
          width={barW}
          height={maxH * h}
          rx={1.2}
          fill={fill}
        />
      ))}
    </Svg>
  );
}

// In-memory cache for messages per matchId — instant load when re-opening chat, listener keeps it updated
const messageCache = new Map();

function toDate(maybeTs) {
  try {
    if (!maybeTs) return null;
    if (maybeTs instanceof Date) return maybeTs;
    if (typeof maybeTs?.toDate === 'function') return maybeTs.toDate();
    if (typeof maybeTs?.toMillis === 'function') return new Date(maybeTs.toMillis());
    return null;
  } catch {
    return null;
  }
}

function fmtTime(d) {
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDayLabel(d) {
  if (!d) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday - startThat) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// Swipe right to reply (WhatsApp style) with animated "Reply" strip
const SWIPE_REPLY_THRESHOLD = 56;
const SWIPE_REPLY_MAX = 80;

function MessageBubbleRow({
  item,
  matchId,
  meUid,
  playingId,
  styles: st,
  onOpenActions,
  onSwipeReply,
  onTogglePlay,
  onReport,
  targetLang,
  translateState,
  onPressTranslate,
  onHideTranslation,
}) {
  const translateX = useSharedValue(0);

  const swipeReplyGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([24, 999])
        .failOffsetY([-20, 20])
        .minDistance(6)
        .onUpdate((e) => {
          if (e.translationX > 0) {
            translateX.value = Math.min(e.translationX, SWIPE_REPLY_MAX);
          }
        })
        .onEnd((e) => {
          if (translateX.value >= SWIPE_REPLY_THRESHOLD) {
            runOnJS(onSwipeReply)(item?.id);
          }
          translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        }),
    [item?.id, onSwipeReply]
  );

  const bubbleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const mine = item?.fromUid === meUid;
  const created = toDate(item?.createdAt);
  const readAt = toDate(item?.readAt);
  const isRead = !!readAt;
  const isVoice = String(item?.type || '') === 'voice';
  const deleted = !!item?.deletedAt;
  const reply = item?.replyTo && typeof item.replyTo === 'object' ? item.replyTo : null;
  const reactions = item?.reactions && typeof item.reactions === 'object' ? item.reactions : {};
  const reactionLine = Object.values(reactions).filter(Boolean).join(' ');

  const showTranslate =
    !mine &&
    !isVoice &&
    !deleted &&
    String(item?.text || '').trim().length > 0 &&
    !!targetLang;

  const tr = translateState;
  const trPhase = tr?.phase || 'hidden';

  return (
    <GestureDetector gesture={swipeReplyGesture}>
      <View style={st.bubbleSwipeWrap}>
        <Animated.View style={[st.bubbleAnimatedWrap, mine ? st.bubbleAnimatedWrapMine : null, bubbleAnimatedStyle]}>
          <HuzzPressable
            onPress={() => onOpenActions(item)}
            onLongPress={() => onReport(item)}
            style={[st.bubble, mine ? st.bubbleMine : st.bubbleTheirs]}
          >
            {reply ? (
              <View style={st.replyPreview}>
                <Text style={st.replyPreviewText}>
                  Replying to: {String(reply?.text || '').slice(0, 80)}
                </Text>
              </View>
            ) : null}
            {isVoice ? (
              <View style={st.voiceRow}>
                <HuzzPressable style={st.voicePlay} onPress={() => onTogglePlay(item)} haptic="light">
                  <Text style={st.voicePlayText}>{playingId === item.id ? '⏸' : '▶︎'}</Text>
                </HuzzPressable>
                <View style={st.cassette}>
                  <View style={st.spool} />
                  <View style={st.spool} />
                </View>
                <Text style={st.voiceDur}>{Math.round(Number(item?.durationMs || 0) / 1000)}s</Text>
              </View>
            ) : (
              <Text style={[st.bubbleText, mine ? st.bubbleTextMine : st.bubbleTextTheirs]}>
                {deleted ? 'Message deleted' : String(item?.text || '')}
                <Text style={[st.timeInline, !mine && st.timeInlineTheirs]}>
                  {'  '}{fmtTime(created)}
                  {!deleted && item?.editedAt ? ' · edited' : ''}
                  {mine && !deleted ? (isRead ? '  ✓✓' : '  ✓') : ''}
                </Text>
              </Text>
            )}
            {reactionLine ? <Text style={st.reactions}>{reactionLine}</Text> : null}
            {isVoice ? (
              <View style={st.metaRow}>
                <Text style={[st.timeText, mine && st.timeTextMine]}>{fmtTime(created)}</Text>
                {mine && !deleted ? (
                  <Text style={[st.readReceipt, isRead ? st.readReceiptRead : st.readReceiptDelivered]}>
                    {isRead ? ' ✓✓ Read' : ' ✓ Delivered'}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </HuzzPressable>
        </Animated.View>

        {showTranslate ? (
          <View style={st.translateColumn}>
            {trPhase === 'visible' && tr?.text ? (
              <View style={st.translatedBox}>
                <Text style={st.translatedLabel}>Translation</Text>
                <Text style={st.translatedBody}>{tr.text}</Text>
                <HuzzPressable onPress={() => onHideTranslation?.(item?.id)} haptic="light">
                  <Text style={st.translatedHide}>Hide</Text>
                </HuzzPressable>
              </View>
            ) : null}
            {trPhase === 'loading' ? (
              <View style={st.translateLoadingRow}>
                <ActivityIndicator size="small" color={tokens.colors.accent} />
                <Text style={st.translateLoadingText}>Translating…</Text>
              </View>
            ) : null}
            {trPhase === 'error' ? (
              <HuzzPressable onPress={() => onPressTranslate?.(item)} haptic="light">
                <Text style={st.translateErrorText}>{tr?.error || 'Could not translate'} · Retry</Text>
              </HuzzPressable>
            ) : null}
            {trPhase === 'hidden' ? (
              <HuzzPressable onPress={() => onPressTranslate?.(item)} haptic="light">
                <Text style={st.translateLink}>Translate to {getChatLanguageLabel(targetLang)}</Text>
              </HuzzPressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

export function ChatScreen({ onNavigate, matchId, waliViewMode = false, waliInfo = null }) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState(() => messageCache.get(matchId) || []);
  const [text, setText] = useState('');
  const [otherUser, setOtherUser] = useState(null);
  const [match, setMatch] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [inputH, setInputH] = useState(40);
  const [playingId, setPlayingId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null); // { id, text }
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const listRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  
  // expo-audio hooks — useAudioRecorderState(recorder, 200) for real-time timer
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const player = useAudioPlayer(null);

  const meUid = authService.getCurrentUser()?.uid || null;

  /** BCP-47 code — messages from others translate on demand into this language */
  const [chatTranslateLang, setChatTranslateLang] = useState('en');
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  /** { [messageId]: { phase: 'hidden'|'loading'|'visible'|'error', text?: string, error?: string } } */
  const [translationById, setTranslationById] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (!meUid) return;
    (async () => {
      try {
        const res = await userService.getUserById(meUid);
        const lang = res?.data?.chatTranslateLang;
        if (!cancelled && typeof lang === 'string' && lang.trim()) {
          setChatTranslateLang(lang.trim().toLowerCase());
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meUid]);

  const persistChatLanguage = useCallback(async (code) => {
    const c = String(code || 'en').trim().toLowerCase();
    setChatTranslateLang(c);
    setTranslationById({});
    if (!meUid) return;
    await userService.updateUser(meUid, { chatTranslateLang: c });
  }, [meUid]);

  const requestTranslate = useCallback(
    async (msg) => {
      const id = msg?.id;
      const raw = String(msg?.text || '').trim();
      if (!id || !raw || !chatTranslateLang) return;
      setTranslationById((prev) => ({ ...prev, [id]: { phase: 'loading' } }));
      const { translatedText, error } = await translationService.translateChatMessage(raw, chatTranslateLang);
      if (error || !translatedText) {
        setTranslationById((prev) => ({
          ...prev,
          [id]: { phase: 'error', error: error || 'Translation failed' },
        }));
        return;
      }
      setTranslationById((prev) => ({
        ...prev,
        [id]: { phase: 'visible', text: translatedText },
      }));
    },
    [chatTranslateLang]
  );

  const hideTranslation = useCallback((id) => {
    if (!id) return;
    setTranslationById((prev) => ({ ...prev, [id]: { phase: 'hidden' } }));
  }, []);

  useEffect(() => {
    if (!matchId) return;
    const unsub = matchService.listenMatch(matchId, ({ data }) => {
      setMatch(data || null);
    });
    return () => unsub && unsub();
  }, [matchId]);

  // Restore messages from cache when switching to this chat (instant load)
  useEffect(() => {
    if (!matchId) return;
    const cached = messageCache.get(matchId);
    if (Array.isArray(cached) && cached.length > 0) setMessages(cached);
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    // Gate messages until match is active.
    if (String(match?.status || 'active') !== 'active') {
      setLoading(false);
      setMessages([]);
      return;
    }
    const unsub = messageService.listenMessages(matchId, ({ data, error }) => {
      if (error) console.warn('listenMessages error:', error);
      const list = Array.isArray(data) ? data : [];
      setMessages(list);
      messageCache.set(matchId, list);
      setLoading(false);
      // Mark messages as read when they're loaded (user is viewing chat)
      if (meUid && list.length > 0) {
        messageService.markMessagesAsRead(matchId, meUid).catch(() => {});
      }
    });
    return () => unsub && unsub();
  }, [matchId, match?.status, meUid]);

  // Best-effort: infer other user from matchId ("uid_uid") and load profile for header actions.
  useEffect(() => {
    let cancelled = false;
    const loadOther = async () => {
      try {
        if (!matchId || !meUid) return;
        const parts = String(matchId).split('_');
        const otherUid = parts.find((p) => p && p !== meUid) || null;
        if (!otherUid) return;
        const res = await userService.getUserById(otherUid);
        if (!cancelled) setOtherUser(res?.data || { id: otherUid });
      } catch {}
    };
    loadOther();
    return () => {
      cancelled = true;
    };
  }, [matchId, meUid]);

  // Keep latest messages visible above keyboard: scroll to bottom (offset 0 when inverted) when keyboard shows
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      });
    });
    return () => sub?.remove?.();
  }, []);

  const canSend = useMemo(() => String(text || '').trim().length > 0, [text]);
  const hasActiveRecording = recorderState.isRecording || (recorderState.canRecord && (recorderState.durationMillis ?? 0) > 0);
  const isActive = useMemo(() => String(match?.status || 'active') === 'active', [match?.status]);
  const isReceiver = useMemo(
    () => !!meUid && String(match?.requestedTo || '') === String(meUid),
    [match?.requestedTo, meUid]
  );

  const otherUid = useMemo(() => {
    if (!matchId || !meUid) return null;
    const parts = String(matchId).split('_');
    return parts.find((p) => p && p !== meUid) || null;
  }, [matchId, meUid]);

  const otherIsTyping = useMemo(() => {
    if (!otherUid) return false;
    const t = match?.typing?.[otherUid];
    return !!t;
  }, [match?.typing, otherUid]);

  const fmtSec = (ms) => `${Math.max(0, Math.round(ms / 1000))}s`;

  const startRecording = async () => {
    if (!isActive) return;
    try {
      // Request permissions
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow microphone access.');
        return;
      }

      // Enable recording on iOS (required before record())
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Prepare and start recording
      await recorder.prepareToRecordAsync();
      recorder.record();
      // Optional: auto-stop at 2 min (120s) so file doesn't get huge
      setTimeout(() => {
        if (recorder.isRecording) stopRecording(true);
      }, 120000);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to start recording.');
    }
  };

  const stopRecording = async (auto = false) => {
    try {
      const status = recorder.getStatus?.() || {};
      const isPaused = !status.isRecording && (status.durationMillis ?? 0) > 0;
      if (!recorder.isRecording && !isPaused) return;
      // Capture duration before stop() (native may reset it after stop)
      const duration = status.durationMillis ?? (recorder.currentTime * 1000);
      const dur = Number(duration);
      await recorder.stop();
      const uri = recorder.uri || recorder.getStatus?.()?.url;

      // Allow any length; only warn for very short (< 1s) to avoid accidental sends
      if (dur < 800 && !auto) {
        Alert.alert('Too short', 'Record at least ~1 second or tap Stop when done.');
        return;
      }
      if (!uri) {
        Alert.alert('Error', 'No recording URI available.');
        return;
      }
      const uid = authService.getCurrentUser()?.uid;
      if (!uid || !matchId) return;
      const { error } = await messageService.sendVoiceMessage(matchId, uid, { audioUri: uri, durationMs: dur });
      if (error) Alert.alert('Error', error);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to stop recording.');
    }
  };

  const pauseRecording = () => {
    try {
      if (recorder.isRecording && typeof recorder.pause === 'function') recorder.pause();
    } catch {}
  };

  const resumeRecording = () => {
    try {
      if (typeof recorder.record === 'function') recorder.record();
    } catch {}
  };

  const cancelRecording = async () => {
    try {
      const status = recorder.getStatus?.() || {};
      const isPaused = !status.isRecording && (status.durationMillis ?? 0) > 0;
      if (!recorder.isRecording && !isPaused) return;
      await recorder.stop();
    } catch (e) {
      // ignore
    }
  };

  const togglePlay = async (msg) => {
    try {
      const id = String(msg?.id || '');
      const url = String(msg?.audioUrl || '');
      if (!id || !url) return;
      
      if (playingId === id) {
        // Stop current playback
        player.pause();
        setPlayingId(null);
        return;
      }
      
      // Stop previous and play new
      if (player.playing) {
        player.pause();
      }
      
      setPlayingId(id);
      player.replace(url);
      player.play();
      
      // Listen for playback completion
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        // Check if playback finished
        if (status.isLoaded && status.playbackState === 'finished') {
          setPlayingId(null);
          subscription.remove();
        }
      });
    } catch (e) {
      setPlayingId(null);
      Alert.alert('Error', e?.message || 'Failed to play voice note.');
    }
  };

  // Swipe left on a message to reply (Instagram/WhatsApp style)
  const handleSwipeReply = useCallback((messageId) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.deletedAt) return;
    const isVoice = String(msg?.type || '') === 'voice';
    setReplyTo({
      id: msg.id,
      fromUid: String(msg?.fromUid || ''),
      text: isVoice ? '🎙️ Voice note' : String(msg?.text || '').slice(0, 120),
    });
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, [messages]);

  const openMessageActions = (item) => {
    const mine = item?.fromUid === meUid;
    const isVoice = String(item?.type || '') === 'voice';
    const deleted = !!item?.deletedAt;
    Alert.alert('Message', 'Choose an action', [
      {
        text: 'Reply',
        onPress: () => {
          if (deleted) return;
          setReplyTo({
            id: item.id,
            fromUid: String(item?.fromUid || ''),
            text: isVoice ? '🎙️ Voice note' : String(item?.text || '').slice(0, 120),
          });
        },
      },
      {
        text: 'React 😀',
        onPress: () => {
          if (!matchId || !meUid) return;
          Alert.alert('React', 'Pick one', [
            { text: '❤️', onPress: () => messageService.setReaction(matchId, item.id, meUid, '❤️') },
            { text: '😂', onPress: () => messageService.setReaction(matchId, item.id, meUid, '😂') },
            { text: '🔥', onPress: () => messageService.setReaction(matchId, item.id, meUid, '🔥') },
            { text: '👍', onPress: () => messageService.setReaction(matchId, item.id, meUid, '👍') },
            { text: 'Remove', style: 'destructive', onPress: () => messageService.setReaction(matchId, item.id, meUid, '') },
            { text: 'Cancel', style: 'cancel' },
          ]);
        },
      },
      {
        text: 'Copy',
        onPress: async () => {
          if (isVoice || deleted) return;
          await Clipboard.setStringAsync(String(item?.text || ''));
        },
      },
      mine && !isVoice && !deleted
        ? {
            text: 'Edit',
            onPress: () => {
              setEditing({ id: item.id, text: String(item?.text || '') });
              setText(String(item?.text || ''));
            },
          }
        : null,
      mine && !deleted
        ? {
            text: 'Unsend',
            style: 'destructive',
            onPress: async () => {
              if (!matchId || !meUid) return;
              await messageService.deleteMessage(matchId, item.id, meUid);
            },
          }
        : null,
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          try {
            const reporterUid = authService.getCurrentUser()?.uid;
            if (!reporterUid) return;
            await reportService.createReport({
              reporterUid,
              targetType: 'message',
              targetId: item.id,
              targetUserId: item?.fromUid || null,
              matchId,
              reason: 'inappropriate',
              details: isVoice ? 'Voice note' : String(item?.text || ''),
            });
            Alert.alert('Reported', 'Thanks — we will review it.');
          } catch (e) {
            Alert.alert('Error', e?.message || 'Failed to report.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ].filter(Boolean));
  };

  const chatData = useMemo(() => {
    const base = loading
      ? Array.from({ length: 8 }).map((_, i) => ({ _skeleton: true, id: `sk-${i}` }))
      : messages;
    if (!Array.isArray(base)) return [];
    if (loading) return [...base].reverse();

    // Build date separators (then reverse for inverted list).
    const sorted = [...base].sort((a, b) => {
      const at = toDate(a?.createdAt)?.getTime?.() || 0;
      const bt = toDate(b?.createdAt)?.getTime?.() || 0;
      return at - bt;
    });

    const out = [];
    let lastDay = null;
    for (const m of sorted) {
      const d = toDate(m?.createdAt);
      const dayKey = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'unknown';
      if (dayKey !== lastDay) {
        out.push({ _type: 'day', id: `day-${dayKey}`, day: d });
        lastDay = dayKey;
      }
      out.push({ _type: 'msg', ...m });
    }
    return out.reverse();
  }, [loading, messages]);

  // Typing indicator: debounce and throttle updates.
  useEffect(() => {
    if (!matchId || !meUid) return;
    if (!isActive) return;

    const hasText = String(text || '').length > 0;
    const now = Date.now();

    // Throttle "typing true" to avoid writes on every keystroke.
    if (hasText && now - lastTypingSentRef.current > 1200) {
      lastTypingSentRef.current = now;
      messageService.setTyping(matchId, meUid, true);
    }

    // Debounce turning typing off.
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      messageService.setTyping(matchId, meUid, false);
    }, hasText ? 1800 : 0);

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [text, matchId, meUid, isActive]);

  useEffect(() => {
    // Ensure we clear typing on unmount.
    return () => {
      try {
        if (matchId && meUid) messageService.setTyping(matchId, meUid, false);
      } catch {}
    };
  }, [matchId, meUid]);

  if (!matchId) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>No match selected.</Text>
        <HuzzPressable style={styles.headerBtn} onPress={() => onNavigate('matches')} haptic="light">
          <Text style={styles.headerBtnText}>Back to matches</Text>
        </HuzzPressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAwareLayout>
        <View style={styles.header}>
          <HuzzPressable style={styles.headerBtn} onPress={() => onNavigate('matches')} haptic="light">
            <Text style={styles.headerBtnText}>← Back</Text>
          </HuzzPressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.title}>{otherUser?.name || 'Chat'}</Text>
              {waliViewMode && waliInfo && (
                <View style={styles.waliBadge}>
                  <Text style={styles.waliBadgeText}>👁️ Wali</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.subtitle,
                getPresenceDisplay(otherUser?.lastSeen)?.kind === 'online' ? styles.subtitleOnline : null,
              ]}
            >
              {(() => {
                const p = getPresenceDisplay(otherUser?.lastSeen);
                if (p) return p.label;
                return otherUser?.categoryIntent || '';
              })()}
            </Text>
            {waliViewMode && (
              <Text style={[styles.subtitle, { color: tokens.colors.accent, marginTop: 2 }]}>
                {waliInfo?.name || 'Wali'} is viewing
              </Text>
            )}
            {!waliViewMode ? (
              <HuzzPressable
                style={styles.langChip}
                onPress={() => {
                  setLangSearch('');
                  setLangModalOpen(true);
                }}
                haptic="light"
              >
                <Text style={styles.langChipText}>
                  🌐 Translate to: {getChatLanguageLabel(chatTranslateLang)}
                </Text>
              </HuzzPressable>
            ) : null}
          </View>
          <HuzzPressable
            style={styles.headerBtn}
            onPress={() => {
              Alert.alert('Options', 'What do you want to do?', [
                {
                  text: '📅 Plan Date',
                  onPress: () => {
                    onNavigate('datePlanning', { matchId });
                  },
                },
                {
                  text: 'Report user',
                  onPress: async () => {
                    try {
                      const reporterUid = authService.getCurrentUser()?.uid;
                      if (!reporterUid) return;
                      await reportService.createReport({
                        reporterUid,
                        targetType: 'user',
                        targetId: otherUser?.id || 'unknown',
                        targetUserId: otherUser?.id || null,
                        matchId,
                        reason: 'inappropriate',
                        details: '',
                      });
                      Alert.alert('Reported', 'Thanks — we will review it.');
                    } catch (e) {
                      Alert.alert('Error', e?.message || 'Failed to report.');
                    }
                  },
                },
                {
                  text: 'Block user',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const uid = authService.getCurrentUser()?.uid;
                      if (!uid || !otherUser?.id) return;
                      await blockService.blockUser(uid, otherUser.id);
                      Alert.alert('Blocked', 'This user has been blocked.');
                      onNavigate('matches');
                    } catch (e) {
                      Alert.alert('Error', e?.message || 'Failed to block.');
                    }
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
            haptic="light"
          >
            <Text style={styles.headerBtnText}>⋯</Text>
          </HuzzPressable>
        </View>

        <View style={{ flex: 1, minHeight: 0 }}>
        {!isActive ? (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingTitle}>Match pending</Text>
            <Text style={styles.pendingText}>
              {isReceiver ? 'Approve this match to start chatting.' : 'Waiting for the other person to approve.'}
            </Text>
            {isReceiver ? (
              <HuzzPressable
                style={styles.approveBtn}
                onPress={async () => {
                  const uid = authService.getCurrentUser()?.uid;
                  if (!uid) return;
                  const { error } = await matchService.approveMatch(matchId, uid);
                  if (!error) {
                    const res = await matchService.getMatchById(matchId);
                    setMatch(res?.data || null);
                  }
                }}
                haptic="medium"
              >
                <Text style={styles.approveText}>Approve match</Text>
              </HuzzPressable>
            ) : null}
          </View>
        ) : null}

        <View style={{ flex: 1, minHeight: 0 }}>
        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          data={chatData}
          keyExtractor={(item) => String(item?.id)}
          inverted
          extraData={{ otherIsTyping, translationById, chatTranslateLang }}
          ListHeaderComponent={
            isActive && otherIsTyping ? (
              <View style={styles.typingInline} pointerEvents="none" accessibilityLabel="Typing">
                <Image
                  source={TYPING_INDICATOR_IMG}
                  style={styles.typingIndicatorImage}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>
            ) : undefined
          }
          onScroll={(e) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            setShowScrollToBottom(y > 80);
          }}
          scrollEventThrottle={100}
          initialNumToRender={20}
          windowSize={10}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={16}
          removeClippedSubviews={false}
          // Index 0 = newest row in inverted list. Using 1 skipped the latest bubble and caused
          // the other person's view to clip new messages under the composer / last row.
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 100,
          }}
          renderItem={({ item }) => {
            if (item?._type === 'day') {
              return (
                <View style={styles.dayRow}>
                  <View style={styles.dayPill}>
                    <Text style={styles.dayText}>{fmtDayLabel(item.day)}</Text>
                  </View>
                </View>
              );
            }
            if (item?._skeleton) {
              const mine = item.id.endsWith('0') || item.id.endsWith('2') || item.id.endsWith('4');
              return (
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                  ]}
                >
                  <SkeletonBox style={{ height: 10, width: mine ? 160 : 190 }} />
                </View>
              );
            }
            if (item?._type !== 'msg') return null;

            return (
              <Animated.View entering={FadeInUp.duration(220).springify().damping(14)}>
                <MessageBubbleRow
                  item={item}
                matchId={matchId}
                meUid={meUid}
                playingId={playingId}
                styles={styles}
                onOpenActions={openMessageActions}
                onSwipeReply={handleSwipeReply}
                onTogglePlay={togglePlay}
                onReport={(msg) => {
                  Alert.alert('Report message?', 'If this message is inappropriate, you can report it.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Report',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const reporterUid = authService.getCurrentUser()?.uid;
                          if (!reporterUid) return;
                          await reportService.createReport({
                            reporterUid,
                            targetType: 'message',
                            targetId: msg.id,
                            targetUserId: msg?.fromUid || null,
                            matchId,
                            reason: 'inappropriate',
                            details: String(msg?.text || ''),
                          });
                          Alert.alert('Reported', 'Thanks — we will review it.');
                        } catch (e) {
                          Alert.alert('Error', e?.message || 'Failed to report.');
                        }
                      },
                    },
                  ]);
                }}
                targetLang={chatTranslateLang}
                translateState={translationById[item?.id]}
                onPressTranslate={requestTranslate}
                onHideTranslation={hideTranslation}
                />
              </Animated.View>
            );
          }}
        />
        </View>

        {showEmoji ? (
          <View style={styles.emojiPanel}>
            {['😀', '😂', '😍', '🥹', '😮', '😡', '👍', '🙏', '🔥', '💯', '❤️', '✨'].map((e) => (
              <HuzzPressable
                key={e}
                style={styles.emojiBtn}
                onPress={() => setText((t) => `${t || ''}${e}`)}
                haptic="light"
              >
                <Text style={styles.emoji}>{e}</Text>
              </HuzzPressable>
            ))}
          </View>
        ) : null}

        {replyTo ? (
          <View style={styles.replyBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarTitle}>{editing ? 'Editing' : 'Replying to'}</Text>
              <Text style={styles.replyBarText}>{String(replyTo?.text || '').slice(0, 90)}</Text>
            </View>
            <HuzzPressable
              style={styles.replyClose}
              onPress={() => {
                setReplyTo(null);
                setEditing(null);
              }}
              haptic="light"
            >
              <Text style={styles.replyCloseText}>✕</Text>
            </HuzzPressable>
          </View>
        ) : null}

        <View style={styles.composer}>
          <HuzzPressable
            style={styles.iconBtn}
            onPress={() => setShowEmoji((v) => !v)}
            haptic="light"
          >
            <Text style={styles.iconBtnText}>{showEmoji ? '⌨️' : '😊'}</Text>
          </HuzzPressable>

          {recorderState.isRecording || (recorderState.canRecord && (recorderState.durationMillis ?? 0) > 0) ? (
            <View style={styles.recordingRow}>
              <HuzzPressable style={styles.recordingCancelBtn} onPress={cancelRecording} haptic="light">
                <Text style={styles.recordingCancelText}>✕</Text>
              </HuzzPressable>
              <Text style={styles.recordingTimer}>
                {recorderState.isRecording ? '🔴 ' : '⏸ '}
                {fmtSec(recorderState.durationMillis ?? 0)}
              </Text>
              {typeof recorder.pause === 'function' && recorderState.isRecording ? (
                <HuzzPressable style={styles.recordingControlBtn} onPress={pauseRecording} haptic="light">
                  <Text style={styles.recordingControlText}>Pause</Text>
                </HuzzPressable>
              ) : null}
              {!recorderState.isRecording && (recorderState.durationMillis ?? 0) > 0 && typeof recorder.record === 'function' ? (
                <HuzzPressable style={styles.recordingControlBtn} onPress={resumeRecording} haptic="light">
                  <Text style={styles.recordingControlText}>Resume</Text>
                </HuzzPressable>
              ) : null}
              <HuzzPressable
                style={[styles.recordingControlBtn, styles.recordingStopBtn]}
                onPress={() => stopRecording(false)}
                haptic="medium"
              >
                <Text style={styles.recordingControlText}>Stop & Send</Text>
              </HuzzPressable>
            </View>
          ) : (
            <HuzzPressable style={styles.iconBtn} onPress={startRecording} haptic="light">
              <VoiceIcon size={22} color="#654321" />
            </HuzzPressable>
          )}

          {!hasActiveRecording ? (
            <>
              <TextInput
                style={[styles.input, { height: Math.max(40, Math.min(120, inputH)) }]}
                placeholder="Message..."
                value={text}
                onChangeText={(v) => setText(v)}
                editable={isActive}
                multiline
                onContentSizeChange={(e) => setInputH(e?.nativeEvent?.contentSize?.height || 40)}
              />
              <HuzzPressable
                style={[styles.sendBtn, { opacity: canSend ? 1 : 0.5 }]}
                disabled={!canSend || !isActive}
                onPress={async () => {
                  try {
                    if (!isActive) return;
                    const uid = authService.getCurrentUser()?.uid;
                    if (!uid) return;
                    try {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } catch {}
                    setShowEmoji(false);
                    await messageService.setTyping(matchId, uid, false);
                    if (editing?.id) {
                      const toxicEdit = await messageService.checkMessageToxicity(matchId, text);
                      if (toxicEdit) {
                        Alert.alert(
                          'Message not allowed',
                          'This message was flagged as inappropriate. Please change it before sending. Repeated attempts may be reported to admins.',
                          [{ text: 'OK' }]
                        );
                        return;
                      }
                      const { error } = await messageService.editMessage(matchId, editing.id, uid, text);
                      if (!error) setEditing(null);
                      if (error) Alert.alert('Error', error);
                      else setText('');
                      return;
                    }
                    const toxic = await messageService.checkMessageToxicity(matchId, text);
                    if (toxic) {
                      Alert.alert(
                        'Message not allowed',
                        'This message was flagged as inappropriate. Please change it before sending. Repeated attempts may be reported to admins.',
                        [{ text: 'OK' }]
                      );
                      return;
                    }
                    const { error } = await messageService.sendMessage(matchId, uid, text, { replyTo });
                    if (error) Alert.alert('Error', error);
                    else {
                      setText('');
                      setReplyTo(null);
                      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
                    }
                  } catch (e) {
                    Alert.alert('Error', e?.message || 'Failed to send.');
                  }
                }}
                haptic="light"
              >
                <Text style={styles.sendText}>Send</Text>
              </HuzzPressable>
            </>
          ) : null}
        </View>

        {showScrollToBottom ? (
          <HuzzPressable
            style={styles.scrollToBottomBtn}
            onPress={() => {
              listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
              setShowScrollToBottom(false);
            }}
            haptic="light"
          >
            <Text style={styles.scrollToBottomText}>↓</Text>
          </HuzzPressable>
        ) : null}

        <Modal visible={langModalOpen} animationType="fade" transparent onRequestClose={() => setLangModalOpen(false)}>
          <View style={styles.langModalBackdrop}>
            <View style={styles.langModalCard}>
              <Text style={styles.langModalTitle}>Your translation language</Text>
              <Text style={styles.langModalHint}>
                Original messages stay instant. Tap Translate under a received message — it loads in a few seconds.
              </Text>
              <TextInput
                style={styles.langModalSearch}
                placeholder="Search languages…"
                value={langSearch}
                onChangeText={setLangSearch}
                placeholderTextColor={tokens.colors.textMuted}
              />
              <FlatList
                data={CHAT_TRANSLATE_LANGUAGES.filter((l) =>
                  l.label.toLowerCase().includes(String(langSearch || '').trim().toLowerCase())
                )}
                keyExtractor={(it) => it.code}
                keyboardShouldPersistTaps="handled"
                style={styles.langModalList}
                renderItem={({ item }) => (
                  <HuzzPressable
                    style={[
                      styles.langModalRow,
                      item.code === chatTranslateLang ? styles.langModalRowSelected : null,
                    ]}
                    onPress={() => {
                      persistChatLanguage(item.code);
                      setLangModalOpen(false);
                    }}
                    haptic="light"
                  >
                    <Text style={styles.langModalRowText}>{item.label}</Text>
                    {item.code === chatTranslateLang ? (
                      <Text style={styles.langModalCheck}>✓</Text>
                    ) : null}
                  </HuzzPressable>
                )}
              />
              <HuzzPressable style={styles.langModalDone} onPress={() => setLangModalOpen(false)} haptic="light">
                <Text style={styles.langModalDoneText}>Done</Text>
              </HuzzPressable>
            </View>
          </View>
        </Modal>
        </View>
      </KeyboardAwareLayout>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colors.bg },
  list: { flex: 1, minHeight: 0 },
  listContent: {
    padding: tokens.spacing.screenHorizontal,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    gap: 8,
  },
  headerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    minWidth: 52,
    alignItems: 'center',
  },
  headerBtnText: { ...tokens.typography.label, color: tokens.colors.text },
  title: { ...tokens.typography.titleSmall, color: tokens.colors.text },
  subtitle: { ...tokens.typography.caption, color: tokens.colors.textMuted, marginTop: 2 },
  subtitleOnline: { color: '#22c55e', fontWeight: '700' },
  langChip: {
    marginTop: 6,
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  langChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.colors.accent,
  },
  translateColumn: {
    marginTop: 4,
    maxWidth: '80%',
    alignSelf: 'flex-start',
    gap: 4,
  },
  translatedBox: {
    padding: 8,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  translatedLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: tokens.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  translatedBody: {
    ...tokens.typography.bodySmall,
    color: tokens.colors.text,
    lineHeight: 20,
  },
  translatedHide: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  translateLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  translateLoadingText: {
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  translateErrorText: {
    fontSize: 12,
    color: tokens.colors.danger,
    textDecorationLine: 'underline',
  },
  translateLink: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.colors.accent,
  },
  langModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  langModalCard: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  langModalTitle: {
    ...tokens.typography.titleSmall,
    color: tokens.colors.text,
    marginBottom: 6,
  },
  langModalHint: {
    ...tokens.typography.caption,
    color: tokens.colors.textSecondary,
    marginBottom: 12,
  },
  langModalSearch: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    color: tokens.colors.text,
  },
  langModalList: {
    maxHeight: 380,
  },
  langModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    marginBottom: 8,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  langModalRowSelected: {
    borderColor: tokens.colors.accent,
    backgroundColor: tokens.colors.accentDim,
  },
  langModalRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: tokens.colors.text,
  },
  langModalCheck: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.colors.accent,
  },
  langModalDone: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  langModalDoneText: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.colors.text,
  },
  bubbleSwipeWrap: { marginBottom: 5 },
  bubbleAnimatedWrap: {},
  bubbleAnimatedWrapMine: { alignSelf: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 0,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#8B5CF6' },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: tokens.colors.surfaceOverlay },
  bubbleText: {
    ...tokens.typography.bodySmall,
    lineHeight: 22,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  bubbleTextMine: { color: '#FFFFFF' },
  bubbleTextTheirs: { color: tokens.colors.text },
  timeInline: {
    fontSize: 9,
    lineHeight: 14,
    fontWeight: '400',
    opacity: 0.7,
    letterSpacing: 0.5,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  timeInlineTheirs: {
    color: tokens.colors.textMuted,
    fontSize: 9,
    fontWeight: '400',
  },
  metaRow: { marginTop: 2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 10, fontWeight: '500', color: tokens.colors.textMuted },
  timeTextMine: { color: '#FFFFFF' },
  editedText: { ...tokens.typography.caption, color: tokens.colors.textMuted },
  readReceipt: { fontSize: 10, fontWeight: '500' },
  readReceiptDelivered: { color: 'rgba(255,255,255,0.85)' },
  readReceiptRead: { color: '#FFFFFF' },
  reactions: { marginTop: 2, ...tokens.typography.bodySmall, fontSize: 13 },
  replyPreview: {
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  replyPreviewText: { ...tokens.typography.caption, color: tokens.colors.text },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  replyBarTitle: { ...tokens.typography.caption, color: tokens.colors.textSecondary },
  replyBarText: { ...tokens.typography.bodySmall, color: tokens.colors.text },
  replyClose: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyCloseText: { fontSize: 14, fontWeight: '600', color: tokens.colors.text },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voicePlay: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayText: { fontSize: 18, fontWeight: '600', color: tokens.colors.text },
  cassette: {
    width: 70,
    height: 34,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  spool: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceOverlay,
  },
  voiceDur: { ...tokens.typography.caption, color: tokens.colors.text },
  dayRow: { alignItems: 'center', marginBottom: 10 },
  dayPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  dayText: { ...tokens.typography.caption, color: tokens.colors.textSecondary },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  /** Inverted list: header sits at the visual bottom — sticker stays in scroll flow */
  typingInline: {
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  typingIndicatorImage: {
    width: 168,
    height: 48,
    alignSelf: 'flex-start',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 18, color: tokens.colors.text },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.danger,
    backgroundColor: 'rgba(248,113,113,0.15)',
  },
  recordingCancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingCancelText: { ...tokens.typography.bodySmall, color: tokens.colors.text },
  recordingTimer: { ...tokens.typography.bodySmall, color: tokens.colors.text, minWidth: 48 },
  recordingControlBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
  },
  recordingControlText: { ...tokens.typography.caption, color: tokens.colors.text },
  recordingStopBtn: { backgroundColor: tokens.colors.blue },
  scrollToBottomBtn: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  scrollToBottomText: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  input: {
    flex: 1,
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...tokens.typography.body,
    color: tokens.colors.text,
  },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: tokens.colors.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  emojiBtn: {
    width: 42,
    height: 42,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20, color: tokens.colors.text },
  sendBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    backgroundColor: '#8B5CF6',
  },
  sendText: { ...tokens.typography.button, color: '#FFFFFF' },
  pendingBox: {
    margin: 12,
    padding: 16,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
  },
  pendingTitle: { ...tokens.typography.label, color: tokens.colors.text, marginBottom: 6 },
  pendingText: { ...tokens.typography.bodySmall, color: tokens.colors.textSecondary, marginBottom: 10 },
  approveBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.success,
    alignItems: 'center',
  },
  approveText: { ...tokens.typography.label, color: tokens.colors.text },
  dateModeBar: {
    marginHorizontal: 12,
    marginTop: 10,
    padding: 14,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    gap: 6,
  },
  dateModeTitle: { ...tokens.typography.label, color: tokens.colors.accent },
  dateModeTimer: { ...tokens.typography.bodySmall, color: tokens.colors.text },
  waliBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.xs,
    backgroundColor: tokens.colors.accent,
  },
  waliBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  continueBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.colors.success,
  },
  continueText: { ...tokens.typography.label, color: '#FFFFFF' },
});


