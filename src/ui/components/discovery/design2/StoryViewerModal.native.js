import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Settings2, Send } from 'lucide-react-native';
import { PhotoProgressBars } from './PhotoProgressBars.native';
import { HuzzPressable } from '../../HuzzPressable.native';
import { StoryManageSheet } from './StoryManageSheet.native';
import { StoryMediaContent } from './StoryMediaContent.native';
import { formatStoryTiming, recordStoryView, sendStoryReply, setStoryReaction, STORY_REACTION_EMOJIS } from '../../../../services/storyService';
import { tokens } from '../../../tokens';

export function StoryViewerModal({
  visible,
  stories = [],
  userName = 'User',
  initialIndex = 0,
  isOwnStory = false,
  authorUid = null,
  viewerUid = null,
  viewerName = 'User',
  onClose,
  onFinished,
  onStoriesChanged,
  onReplySent,
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const list = Array.isArray(stories) ? stories.filter((s) => s?.mediaUrl) : [];
  const [index, setIndex] = useState(0);
  const [timing, setTiming] = useState({ ageLabel: '', leftLabel: '' });
  const [manageOpen, setManageOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [myReaction, setMyReaction] = useState(null);
  const [reacting, setReacting] = useState(false);

  const active = list[index];
  const storyAuthorUid = authorUid || (isOwnStory ? viewerUid : null);

  useEffect(() => {
    if (!visible) return;
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1)));
    setManageOpen(false);
    setReplyText('');
    setSendingReply(false);
    setMyReaction(null);
    setReacting(false);
  }, [visible, initialIndex, list.length]);

  useEffect(() => {
    if (!visible || !active) return undefined;
    const tick = () => setTiming(formatStoryTiming(active));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [visible, active?.id, active?.createdAt, active?.expiresAt]);

  useEffect(() => {
    if (!visible || !active?.id || !viewerUid || isOwnStory) return undefined;
    recordStoryView(active.id, viewerUid, viewerName).catch(() => {});
    return undefined;
  }, [visible, active?.id, viewerUid, viewerName, isOwnStory]);

  const goNext = useCallback(() => {
    if (index < list.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    onFinished?.(list[list.length - 1]?.id);
    onClose?.();
  }, [index, list, onClose, onFinished]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  const handleSendReply = useCallback(async () => {
    const text = String(replyText || '').trim();
    if (!text || !viewerUid || !storyAuthorUid || isOwnStory || !active?.id) return;

    setSendingReply(true);
    try {
      const { matchId, error } = await sendStoryReply({
        fromUid: viewerUid,
        toUid: storyAuthorUid,
        storyId: active.id,
        storyMediaUrl: active.mediaUrl,
        storyMediaType: active.mediaType,
        authorName: userName,
        text,
      });
      if (error) {
        Alert.alert('Could not send', error);
        return;
      }
      setReplyText('');
      onReplySent?.({ matchId, userId: storyAuthorUid, text });
    } finally {
      setSendingReply(false);
    }
  }, [
    replyText,
    viewerUid,
    storyAuthorUid,
    isOwnStory,
    active,
    userName,
    onReplySent,
  ]);

  const handleStoryReaction = useCallback(
    async (emoji) => {
      if (!viewerUid || !active?.id || isOwnStory || reacting) return;
      setReacting(true);
      try {
        const { error } = await setStoryReaction(active.id, viewerUid, viewerName, emoji);
        if (error) {
          Alert.alert('Could not react', error);
          return;
        }
        setMyReaction(emoji);
      } finally {
        setReacting(false);
      }
    },
    [viewerUid, active?.id, isOwnStory, viewerName, reacting]
  );

  if (!visible || list.length === 0) return null;

  const mediaH = Math.max(240, winH - insets.top - insets.bottom - (isOwnStory ? 100 : 140));
  const showReplyBar = !isOwnStory && !manageOpen;

  return (
    <>
      <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.topBar}>
            <PhotoProgressBars total={list.length} activeIndex={index} />
            <View style={styles.timerPill}>
              <Text style={styles.timerText}>
                {timing.ageLabel} · {timing.leftLabel}
              </Text>
              <Text style={styles.timerSub}>Stories disappear after 24 hours</Text>
            </View>
            <View style={styles.topMeta}>
              <Text style={styles.userName} numberOfLines={1}>
                {userName}
                {String(active?.mediaType || '') === 'video' ? ' · Video' : ''}
              </Text>
              <View style={styles.topActions}>
                {isOwnStory ? (
                  <HuzzPressable
                    onPress={() => setManageOpen(true)}
                    haptic="light"
                    accessibilityLabel="Story settings"
                    style={styles.iconHit}
                  >
                    <Settings2 size={21} color="#FFFFFF" strokeWidth={2.3} />
                  </HuzzPressable>
                ) : null}
                <HuzzPressable onPress={onClose} haptic="light" accessibilityLabel="Close story" style={styles.iconHit}>
                  <X size={22} color="#FFFFFF" strokeWidth={2.4} />
                </HuzzPressable>
              </View>
            </View>
          </View>

          <View style={[styles.mediaWrap, { height: mediaH }]}>
            <StoryMediaContent story={active} active={visible && !manageOpen} />
            <Pressable style={styles.tapLeft} onPress={goPrev} accessibilityLabel="Previous story" />
            <Pressable style={styles.tapRight} onPress={goNext} accessibilityLabel="Next story" />
          </View>

          {isOwnStory ? (
            <HuzzPressable
              style={styles.manageHint}
              onPress={() => setManageOpen(true)}
              haptic="light"
            >
              <Text style={styles.manageHintText}>Viewers · Hide from · Delete — tap ⚙</Text>
            </HuzzPressable>
          ) : null}

          {showReplyBar ? (
            <>
              <View style={styles.reactionRow}>
                {STORY_REACTION_EMOJIS.map((emoji) => (
                  <HuzzPressable
                    key={emoji}
                    style={[styles.reactionBtn, myReaction === emoji && styles.reactionBtnActive]}
                    onPress={() => handleStoryReaction(emoji)}
                    disabled={reacting}
                    haptic="light"
                    accessibilityLabel={`React ${emoji}`}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                  </HuzzPressable>
                ))}
              </View>
            <View style={styles.replyRow}>
              <TextInput
                style={styles.replyInput}
                placeholder={`Reply to ${userName}…`}
                placeholderTextColor="rgba(255,255,255,0.55)"
                value={replyText}
                onChangeText={setReplyText}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={handleSendReply}
                editable={!sendingReply}
              />
              <HuzzPressable
                style={[styles.sendBtn, (!replyText.trim() || sendingReply) && styles.sendBtnDisabled]}
                onPress={handleSendReply}
                haptic="light"
                disabled={!replyText.trim() || sendingReply}
                accessibilityLabel="Send story reply"
              >
                {sendingReply ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Send size={18} color="#FFFFFF" strokeWidth={2.4} />
                )}
              </HuzzPressable>
            </View>
            </>
          ) : null}

          {manageOpen && isOwnStory ? (
            <StoryManageSheet
              visible
              embedded
              onClose={() => setManageOpen(false)}
              authorUid={storyAuthorUid}
              activeStoryId={active?.id}
              myStories={list}
              onStoriesChanged={() => {
                onStoriesChanged?.();
              }}
            />
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  topBar: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  timerPill: {
    marginTop: 6,
    marginHorizontal: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  timerSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: 8,
  },
  userName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginRight: 12,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconHit: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaWrap: {
    flex: 1,
    width: '100%',
    position: 'relative',
    backgroundColor: '#000',
  },
  tapLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '38%',
    zIndex: 2,
  },
  tapRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '62%',
    zIndex: 2,
  },
  manageHint: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  manageHintText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  reactionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    marginHorizontal: 12,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  reactionBtnActive: {
    backgroundColor: 'rgba(219, 39, 119, 0.45)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  reactionEmoji: {
    fontSize: 22,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  replyInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingVertical: 4,
    minHeight: 36,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.brandPink,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
});
