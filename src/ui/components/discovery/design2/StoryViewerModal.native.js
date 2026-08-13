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
import { X } from 'lucide-react-native';
import { tokens } from '../../../tokens';
import { PhotoProgressBars } from './PhotoProgressBars.native';
import { HuzzPressable } from '../../HuzzPressable.native';

export function StoryViewerModal({
  visible,
  stories = [],
  userName = 'User',
  initialIndex = 0,
  onClose,
  onFinished,
}) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const list = Array.isArray(stories) ? stories.filter((s) => s?.mediaUrl) : [];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1)));
  }, [visible, initialIndex, list.length]);

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

  const active = list[index];
  const imgH = Math.max(240, winH - insets.top - insets.bottom - 72);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.topBar}>
          <PhotoProgressBars total={list.length} activeIndex={index} />
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
});
