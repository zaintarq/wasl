import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Eye } from 'lucide-react-native';
import { PhotoProgressBars } from './PhotoProgressBars.native';
import { HuzzPressable } from '../../HuzzPressable.native';
import {
  formatStoryTiming,
  listenStoryViewers,
  recordStoryView,
} from '../../../../services/storyService';

export function StoryViewerModal({
  visible,
  stories = [],
  userName = 'User',
  initialIndex = 0,
  isOwnStory = false,
  viewerUid = null,
  viewerName = 'User',
  onClose,
  onFinished,
}) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const list = Array.isArray(stories) ? stories.filter((s) => s?.mediaUrl) : [];
  const [index, setIndex] = useState(0);
  const [timing, setTiming] = useState({ ageLabel: '', leftLabel: '' });
  const [viewers, setViewers] = useState([]);
  const [showViewers, setShowViewers] = useState(false);

  const active = list[index];

  useEffect(() => {
    if (!visible) return;
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1)));
    setShowViewers(false);
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

  useEffect(() => {
    if (!visible || !isOwnStory || !active?.id) {
      setViewers([]);
      return undefined;
    }
    const unsub = listenStoryViewers(active.id, ({ data }) => {
      setViewers(Array.isArray(data) ? data : []);
    });
    return () => unsub && unsub();
  }, [visible, isOwnStory, active?.id]);

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

  const imgH = Math.max(240, winH - insets.top - insets.bottom - (isOwnStory ? 120 : 88));

  return (
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
            <HuzzPressable onPress={onClose} haptic="light" accessibilityLabel="Close story">
              <X size={22} color="#FFFFFF" strokeWidth={2.4} />
            </HuzzPressable>
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
          <View style={styles.viewersDock}>
            <HuzzPressable
              style={styles.viewersToggle}
              onPress={() => setShowViewers((v) => !v)}
              haptic="light"
              accessibilityLabel="Toggle story viewers"
            >
              <Eye size={18} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.viewersToggleText}>
                {viewers.length} viewer{viewers.length === 1 ? '' : 's'}
              </Text>
            </HuzzPressable>
            {showViewers ? (
              <ScrollView style={styles.viewersList} nestedScrollEnabled>
                {viewers.length === 0 ? (
                  <Text style={styles.viewersEmpty}>No views yet</Text>
                ) : (
                  viewers.map((v) => (
                    <Text key={v.id || v.viewerUid} style={styles.viewerRow}>
                      {v.viewerName || 'User'}
                    </Text>
                  ))
                )}
              </ScrollView>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
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
  viewersDock: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  viewersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  viewersToggleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  viewersList: {
    maxHeight: 120,
    marginTop: 8,
  },
  viewersEmpty: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    paddingVertical: 4,
  },
  viewerRow: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
});
