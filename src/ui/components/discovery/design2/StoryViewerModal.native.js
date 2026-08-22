import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Settings2 } from 'lucide-react-native';
import { PhotoProgressBars } from './PhotoProgressBars.native';
import { HuzzPressable } from '../../HuzzPressable.native';
import { StoryManageSheet } from './StoryManageSheet.native';
import {
  formatStoryTiming,
  recordStoryView,
} from '../../../../services/storyService';

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
}) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const list = Array.isArray(stories) ? stories.filter((s) => s?.mediaUrl) : [];
  const [index, setIndex] = useState(0);
  const [timing, setTiming] = useState({ ageLabel: '', leftLabel: '' });
  const [manageOpen, setManageOpen] = useState(false);

  const active = list[index];

  useEffect(() => {
    if (!visible) return;
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1)));
    setManageOpen(false);
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

  if (!visible || list.length === 0) return null;

  const imgH = Math.max(240, winH - insets.top - insets.bottom - (isOwnStory ? 100 : 88));

  return (
    <>
      <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
        <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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

          <View style={[styles.mediaWrap, { height: imgH }]}>
            <Image
              source={{ uri: String(active.mediaUrl) }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={180}
            />
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
        </View>
      </Modal>

      <StoryManageSheet
        visible={manageOpen && isOwnStory}
        onClose={() => setManageOpen(false)}
        authorUid={authorUid}
        activeStoryId={active?.id}
        myStories={list}
        onStoriesChanged={() => {
          onStoriesChanged?.();
        }}
      />
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
});
